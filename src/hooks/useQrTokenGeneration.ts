import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type QrTokenPurpose = 'parent' | 'delegate';

export type QrTokenPayload = {
  id: string | null;
  token: string;
  expires_at: string;
  expires_in: number;
  purpose: QrTokenPurpose;
  delegate_name: string | null;
  pickup_person_full_name: string | null;
  pickup_relationship: string | null;
  pickup_identity_type: 'national_id' | 'passport' | 'other' | null;
  pickup_identity_number: string | null;
  pickup_identity_image_path: string | null;
  pickup_identity_back_image_path: string | null;
  pickup_notes: string | null;
  require_id_capture: boolean;
  single_use: boolean;
};

type CachedQrRow = {
  child_id: string;
  token: string;
  expires_at: string;
  created_at: string;
};

export function useQrTokenGeneration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      child_id: string;
      nursery_id: string;
      ttl_seconds?: number;
      purpose?: QrTokenPurpose;
      delegate_name?: string;
      pickup_person_full_name?: string;
      pickup_relationship?: string;
      pickup_identity_type?: 'national_id' | 'passport' | 'other';
      pickup_identity_number?: string;
      pickup_identity_image_path?: string;
      pickup_identity_back_image_path?: string;
      pickup_notes?: string;
      require_id_capture?: boolean;
      single_use?: boolean;
      rotate?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke('qr-token', {
        body: {
          child_id: args.child_id,
          nursery_id: args.nursery_id,
          ...(args.ttl_seconds !== undefined ? { ttl_seconds: args.ttl_seconds } : {}),
          ...(args.purpose ? { purpose: args.purpose } : {}),
          ...(args.delegate_name ? { delegate_name: args.delegate_name } : {}),
          ...(args.pickup_person_full_name ? { pickup_person_full_name: args.pickup_person_full_name } : {}),
          ...(args.pickup_relationship ? { pickup_relationship: args.pickup_relationship } : {}),
          ...(args.pickup_identity_type ? { pickup_identity_type: args.pickup_identity_type } : {}),
          ...(args.pickup_identity_number ? { pickup_identity_number: args.pickup_identity_number } : {}),
          ...(args.pickup_identity_image_path ? { pickup_identity_image_path: args.pickup_identity_image_path } : {}),
          ...(args.pickup_identity_back_image_path ? { pickup_identity_back_image_path: args.pickup_identity_back_image_path } : {}),
          ...(args.pickup_notes ? { pickup_notes: args.pickup_notes } : {}),
          ...(args.require_id_capture !== undefined ? { require_id_capture: args.require_id_capture } : {}),
          ...(args.single_use !== undefined ? { single_use: args.single_use } : {}),
          ...(args.rotate ? { rotate: true } : {}),
        },
      });
      if (error) throw error;
      const payload = data as {
        id?: string | null;
        token?: string;
        expires_at?: string;
        expires_in?: number;
        purpose?: QrTokenPurpose;
        delegate_name?: string | null;
        pickup_person_full_name?: string | null;
        pickup_relationship?: string | null;
        pickup_identity_type?: 'national_id' | 'passport' | 'other' | null;
        pickup_identity_number?: string | null;
        pickup_identity_image_path?: string | null;
        pickup_identity_back_image_path?: string | null;
        pickup_notes?: string | null;
        require_id_capture?: boolean | null;
        single_use?: boolean;
        error?: string;
      };
      if (payload && typeof payload.error === 'string' && payload.error.length > 0) {
        throw new Error(payload.error);
      }
      if (!payload?.token || !payload.expires_at) {
        throw new Error('Invalid token response');
      }
      return {
        id: payload.id ?? null,
        token: payload.token,
        expires_at: payload.expires_at,
        expires_in: payload.expires_in ?? 0,
        purpose: (payload.purpose ?? args.purpose ?? 'parent') as QrTokenPurpose,
        delegate_name: payload.delegate_name ?? null,
        pickup_person_full_name: payload.pickup_person_full_name ?? null,
        pickup_relationship: payload.pickup_relationship ?? null,
        pickup_identity_type: payload.pickup_identity_type ?? null,
        pickup_identity_number: payload.pickup_identity_number ?? null,
        pickup_identity_image_path: payload.pickup_identity_image_path ?? null,
        pickup_identity_back_image_path: payload.pickup_identity_back_image_path ?? null,
        pickup_notes: payload.pickup_notes ?? null,
        require_id_capture: payload.require_id_capture ?? args.require_id_capture ?? true,
        single_use: Boolean(payload.single_use ?? args.single_use),
      } satisfies QrTokenPayload;
    },
    onSuccess: (data, vars) => {
      // Keep the parent custom-QR list in sync after a delegate QR is created.
      if (data.purpose === 'delegate') {
        void qc.invalidateQueries({ queryKey: ['parent-issued-qr-tokens'] });
        return;
      }
      // Push the freshly-minted token straight into the admin-qr-tokens cache so
      // the row updates without waiting on a refetch round-trip (which can race
      // with PostgREST visibility right after the function commits).
      const key = ['admin-qr-tokens', vars.nursery_id];
      const newRow: CachedQrRow = {
        child_id: vars.child_id,
        token: data.token,
        expires_at: data.expires_at,
        created_at: new Date().toISOString(),
      };
      qc.setQueryData<CachedQrRow[]>(key, (old) => {
        if (!Array.isArray(old)) return [newRow];
        return [newRow, ...old];
      });
      // Still kick the refetch so any other tokens persisted server-side stay in sync.
      void qc.invalidateQueries({ queryKey: ['admin-qr-tokens', vars.nursery_id] });
    },
  });
}
