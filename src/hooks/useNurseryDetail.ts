import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Nursery } from '@/types/nursery';

type NurserySettings = {
  nursery_id: string;
  [key: string]: unknown;
};

export type NurseryWithSettings = Nursery & {
  nursery_settings: NurserySettings[] | null;
};

export function useNurseryDetail(nurseryId: string) {
  return useQuery<NurseryWithSettings>({
    queryKey: ['nursery', nurseryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nurseries')
        .select(
          `
          *,
          nursery_settings(*)
        `,
        )
        .eq('id', nurseryId)
        .single();

      if (error) throw error;
      return data as NurseryWithSettings;
    },
    enabled: Boolean(nurseryId),
  });
}

export function useUpdateNursery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      const cleanedUpdates = Object.fromEntries(
        Object.entries(updates).map(([key, value]) => [key, value === '' || value === undefined ? null : value]),
      );

      const { data, error } = await supabase
        .from('nurseries')
        .update(cleanedUpdates as never)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new Error(error.message || 'Failed to update nursery');
      }

      return data as { id: string };
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['nursery', data.id] });
      void queryClient.invalidateQueries({ queryKey: ['xo-admin', 'nurseries-analytics'] });
    },
  });
}

export function useUploadNurseryLogo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ nurseryId, file }: { nurseryId: string; file: File }) => {
      const timestamp = Date.now();
      const ext = file.name.split('.').pop() || 'png';
      const filePath = `${nurseryId}/${timestamp}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('nursery-logos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('nursery-logos').getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl;

      const { data, error } = await supabase
        .from('nurseries')
        .update({ logo_url: publicUrl } as never)
        .eq('id', nurseryId)
        .select()
        .single();

      if (error) throw error;
      return data as { id: string; logo_url: string | null };
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['nursery', data.id] });
    },
  });
}
