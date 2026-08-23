import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type TenantExportJob = {
  id: string;
  nursery_id: string;
  requested_by: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired';
  created_at: string;
  completed_at: string | null;
  expires_at: string | null;
  error_message: string | null;
};

type TenantExportListResponse = {
  jobs?: TenantExportJob[];
  error?: string;
};

export function useTenantExports(enabled: boolean) {
  const queryClient = useQueryClient();

  const jobsQuery = useQuery({
    queryKey: ['tenant-export-jobs'],
    enabled,
    queryFn: async (): Promise<TenantExportJob[]> => {
      const { data, error } = await supabase.functions.invoke<TenantExportListResponse>('tenant-export', {
        method: 'GET',
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data?.jobs ?? [];
    },
  });

  const requestExport = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>('tenant-export', {
        method: 'POST',
        body: {},
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-export-jobs'] });
    },
  });

  return {
    jobs: jobsQuery.data ?? [],
    isLoading: jobsQuery.isLoading,
    isRefreshing: jobsQuery.isFetching,
    refetch: jobsQuery.refetch,
    requestExport: requestExport.mutateAsync,
    isRequestingExport: requestExport.isPending,
  };
}
