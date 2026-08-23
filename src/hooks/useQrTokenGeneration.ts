import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type QrTokenPurpose = 'parent' | 'delegate';

export type QrTokenPayload = {
  token: string;
  expires_at: string;
  expires_in: number;
  purpose: QrTokenPurpose;
  delegate_name: string | null;
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
          ...(args.single_use !== undefined ? { single_use: args.single_use } : {}),
          ...(args.rotate ? { rotate: true } : {}),
        },
      });
      if (error) throw error;
      const payload = data as {
        token?: string;
        expires_at?: string;
        expires_in?: number;
        purpose?: QrTokenPurpose;
        delegate_name?: string | null;
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
        token: payload.token,
        expires_at: payload.expires_at,
        expires_in: payload.expires_in ?? 0,
        purpose: (payload.purpose ?? args.purpose ?? 'parent') as QrTokenPurpose,
        delegate_name: payload.delegate_name ?? null,
        single_use: Boolean(payload.single_use ?? args.single_use),
      } satisfies QrTokenPayload;
    },
    onSuccess: (data, vars) => {
      // One-time delegate QRs aren't part of any list query — skip cache wiring.
      if (data.purpose === 'delegate') return;
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
