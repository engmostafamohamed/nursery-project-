import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type NurseryContact = { phone: string | null; email: string | null };

function firstText(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const found = value.find((item): item is string => typeof item === 'string' && item.trim() !== '');
  return found?.trim() ?? null;
}

/** How a parent reaches the nursery (e.g. from a failed payment). Empty when nothing is set. */
export function useNurseryContact(nurseryId: string | null | undefined) {
  return useQuery({
    queryKey: ['nursery-contact', nurseryId],
    enabled: Boolean(nurseryId),
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<NurseryContact> => {
      const { data, error } = await supabase
        .from('nurseries')
        .select('phone, contact_phones, contact_emails')
        .eq('id', nurseryId as string)
        .maybeSingle();
      if (error) throw error;
      const row = (data ?? {}) as { phone?: string | null; contact_phones?: unknown; contact_emails?: unknown };
      return {
        phone: row.phone?.trim() || firstText(row.contact_phones),
        email: firstText(row.contact_emails),
      };
    },
  });
}
