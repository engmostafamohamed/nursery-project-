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
  childId: string;
  purpose: IssuedQrPurpose;
  delegateName: string | null;
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
        .select('id, child_id, purpose, delegate_name, single_use, created_at, expires_at, consumed_at')
        .eq('issued_by', parentId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (res.error) throw res.error;
      const rows = (res.data ?? []) as Array<{
        id: string;
        child_id: string;
        purpose: string | null;
        delegate_name: string | null;
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
          childId: r.child_id,
          purpose,
          delegateName: r.delegate_name,
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
    isFarFutureExpiry: isFarFuture,
  };
}
