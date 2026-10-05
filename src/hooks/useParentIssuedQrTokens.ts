import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type IssuedQrPurpose = 'parent' | 'delegate';

/**
 * Surfaces the lifecycle of one QR token to the issuing parent. Derived from
 * the qr_tokens row state so the parent UI doesn't need to redo the math.
 */
export type IssuedQrStatus = 'active' | 'used' | 'expired' | 'revoked';

export type IssuedQrToken = {
  id: string;
  token: string;
  childId: string;
  purpose: IssuedQrPurpose;
  delegateName: string | null;
  pickupPersonFullName: string | null;
  pickupRelationship: string | null;
  pickupIdentityType: string | null;
  pickupIdentityNumber: string | null;
  pickupIdentityImagePath: string | null;
  /** Back of a national ID card; null for passports/other IDs and older QRs. */
  pickupIdentityBackImagePath: string | null;
  pickupNotes: string | null;
  requireIdCapture: boolean;
  singleUse: boolean;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  status: IssuedQrStatus;
};

/**
 * Persistent parent QRs are stored with year-9999 expiry; treat those as
 * "no expiry" in the UI rather than printing "expires in 7973 years".
 */
const FAR_FUTURE_YEAR = 9000;

function isFarFuture(iso: string): boolean {
  return new Date(iso).getUTCFullYear() >= FAR_FUTURE_YEAR;
}

function deriveStatus(row: {
  expiresAt: string;
  consumedAt: string | null;
  singleUse: boolean;
}): IssuedQrStatus {
  if (row.consumedAt) return 'used';
  const exp = new Date(row.expiresAt).getTime();
  if (Number.isFinite(exp) && exp <= Date.now()) {
    // A single-use token that expired without being consumed was either
    // revoked by the parent or genuinely timed out. We can't tell them apart
    // post-hoc; surface "expired" — explicit revoke is a single click anyway.
    return row.singleUse ? 'expired' : 'expired';
  }
  return 'active';
}

export function useParentIssuedQrTokens(parentId: string | undefined) {
  const qc = useQueryClient();

  const queryKey = ['parent-issued-qr-tokens', parentId] as const;

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<IssuedQrToken[]> => {
      if (!parentId) return [];
      const res = await supabase
        .from('qr_tokens')
        .select('id, token, child_id, purpose, delegate_name, pickup_person_full_name, pickup_relationship, pickup_identity_type, pickup_identity_number, pickup_identity_image_path, pickup_identity_back_image_path, pickup_notes, require_id_capture, single_use, created_at, expires_at, consumed_at')
        .eq('issued_by', parentId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (res.error) throw res.error;
      const rows = (res.data ?? []) as Array<{
        id: string;
        token: string;
        child_id: string;
        purpose: string | null;
        delegate_name: string | null;
        pickup_person_full_name: string | null;
        pickup_relationship: string | null;
        pickup_identity_type: string | null;
        pickup_identity_number: string | null;
        pickup_identity_image_path: string | null;
        pickup_identity_back_image_path: string | null;
        pickup_notes: string | null;
        require_id_capture: boolean | null;
        single_use: boolean | null;
        created_at: string;
        expires_at: string;
        consumed_at: string | null;
      }>;
      return rows.map<IssuedQrToken>((r) => {
        const purpose: IssuedQrPurpose = r.purpose === 'delegate' ? 'delegate' : 'parent';
        const singleUse = Boolean(r.single_use);
        const expiresAt = r.expires_at;
        const consumedAt = r.consumed_at;
        return {
          id: r.id,
          token: r.token,
          childId: r.child_id,
          purpose,
          delegateName: r.delegate_name,
          pickupPersonFullName: r.pickup_person_full_name,
          pickupRelationship: r.pickup_relationship,
          pickupIdentityType: r.pickup_identity_type,
          pickupIdentityNumber: r.pickup_identity_number,
          pickupIdentityImagePath: r.pickup_identity_image_path,
          pickupIdentityBackImagePath: r.pickup_identity_back_image_path,
          pickupNotes: r.pickup_notes,
          requireIdCapture: r.require_id_capture !== false,
          singleUse,
          createdAt: r.created_at,
          expiresAt,
          consumedAt,
          status: deriveStatus({ expiresAt, consumedAt, singleUse }),
        };
      });
    },
    enabled: Boolean(parentId),
  });

  const revoke = useMutation({
    mutationFn: async (args: { tokenId: string; childId: string; nurseryId: string }) => {
      // qr-token Edge Function enforces that only the issuer can revoke.
      const { data, error } = await supabase.functions.invoke('qr-token', {
        body: {
          revoke_token_id: args.tokenId,
          child_id: args.childId,
          nursery_id: args.nurseryId,
        },
      });
      if (error) throw error;
      const payload = data as { error?: string; revoked?: boolean };
      if (payload?.error) throw new Error(payload.error);
      return payload?.revoked === true;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (args: {
      tokenId: string;
      childId: string;
      nurseryId: string;
      status: 'active' | 'inactive';
      ttlSeconds?: number;
    }) => {
      const { data, error } = await supabase.functions.invoke('qr-token', {
        body: {
          status_token_id: args.tokenId,
          status: args.status,
          child_id: args.childId,
          nursery_id: args.nurseryId,
          ...(args.ttlSeconds !== undefined ? { ttl_seconds: args.ttlSeconds } : {}),
        },
      });
      if (error) throw error;
      const payload = data as { error?: string; updated?: boolean; expires_at?: string };
      if (payload?.error) throw new Error(payload.error);
      if (!payload?.updated) throw new Error('Could not update QR status');
      return payload;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey });
    },
  });

  const rotateToken = useMutation({
    mutationFn: async (args: { tokenId: string; childId: string; nurseryId: string }) => {
      const { data, error } = await supabase.functions.invoke('qr-token', {
        body: {
          rotate_token_id: args.tokenId,
          child_id: args.childId,
          nursery_id: args.nurseryId,
        },
      });
      if (error) throw error;
      const payload = data as { error?: string; rotated?: boolean; token?: string; expires_at?: string };
      if (payload?.error) throw new Error(payload.error);
      if (!payload?.rotated || !payload.token) throw new Error('Could not rotate QR');
      return payload;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey });
    },
  });

  const editToken = useMutation({
    mutationFn: async (args: {
      tokenId: string;
      childId: string;
      nurseryId: string;
      pickupPersonFullName: string;
      pickupRelationship: string;
      pickupIdentityType: 'national_id' | 'passport' | 'other';
      pickupIdentityNumber: string;
      pickupIdentityImagePath: string;
      /** Back of the card; required (and only kept) for a national ID. */
      pickupIdentityBackImagePath: string | null;
      pickupNotes: string;
      requireIdCapture: boolean;
      /** New validity for an active QR; omitted keeps the current expiry. */
      ttlSeconds?: number;
    }) => {
      // The token string is kept, so a QR already shared or printed stays valid.
      const { data, error } = await supabase.functions.invoke('qr-token', {
        body: {
          edit_token_id: args.tokenId,
          child_id: args.childId,
          nursery_id: args.nurseryId,
          pickup_person_full_name: args.pickupPersonFullName,
          pickup_relationship: args.pickupRelationship,
          pickup_identity_type: args.pickupIdentityType,
          pickup_identity_number: args.pickupIdentityNumber,
          pickup_identity_image_path: args.pickupIdentityImagePath,
          ...(args.pickupIdentityBackImagePath ? { pickup_identity_back_image_path: args.pickupIdentityBackImagePath } : {}),
          pickup_notes: args.pickupNotes,
          require_id_capture: args.requireIdCapture,
          ...(args.ttlSeconds !== undefined ? { ttl_seconds: args.ttlSeconds } : {}),
        },
      });
      if (error) throw error;
      const payload = data as { error?: string; edited?: boolean; expires_at?: string };
      if (payload?.error) throw new Error(payload.error);
      if (!payload?.edited) throw new Error('Could not edit QR');
      return payload;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey });
    },
  });

  const groupedByStatus = useMemo(() => {
    const groups: Record<IssuedQrStatus, IssuedQrToken[]> = {
      active: [],
      used: [],
      expired: [],
      revoked: [],
    };
    for (const t of query.data ?? []) groups[t.status].push(t);
    return groups;
  }, [query.data]);

  return {
    tokens: query.data ?? [],
    groupedByStatus,
    isLoading: query.isLoading,
    revoke: revoke.mutateAsync,
    isRevoking: revoke.isPending,
    updateStatus: updateStatus.mutateAsync,
    isUpdatingStatus: updateStatus.isPending,
    rotateToken: rotateToken.mutateAsync,
    isRotating: rotateToken.isPending,
    editToken: editToken.mutateAsync,
    isEditing: editToken.isPending,
    isFarFutureExpiry: isFarFuture,
  };
}
