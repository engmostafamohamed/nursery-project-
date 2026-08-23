import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export interface RecentNursery {
  id: string;
  name_en: string;
  name_ar: string;
  subscription_status: string | null;
  subscription_plan: string | null;
  created_at: string;
}

export interface XoAdminStats {
  totalNurseries: number;
  activeNurseries: number;
  trialNurseries: number;
  totalUsers: number;
  parentCount: number;
  teacherCount: number;
  totalChildren: number;
  activeChildren: number;
  recentNurseries: RecentNursery[];
  pendingInvoices: number;
  overdueInvoices: number;
  totalMedia: number;
  pendingApprovalMedia: number;
  totalEvents: number;
  newInquiries: number;
  pendingApplications: number;
  tierCounts: Record<string, number>;
}

export function useXoAdminStats() {
  return useQuery<XoAdminStats>({
    queryKey: ['xo-admin', 'stats'],
    queryFn: async () => {
      // 1. Nursery counts
      const { count: totalNurseries, error: totalNurseriesError } = await supabase
        .from('nurseries')
        .select('*', { count: 'exact', head: true });
      if (totalNurseriesError) throw totalNurseriesError;

      const { count: activeNurseries, error: activeNurseriesError } = await supabase
        .from('nurseries')
        .select('*', { count: 'exact', head: true })
        .in('subscription_status', ['active', 'trial']);
      if (activeNurseriesError) throw activeNurseriesError;

      const { count: trialNurseries, error: trialNurseriesError } = await supabase
        .from('nurseries')
        .select('*', { count: 'exact', head: true })
        .eq('subscription_status', 'trial');
      if (trialNurseriesError) throw trialNurseriesError;

      // 2. User counts
      const { count: totalUsers, error: totalUsersError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });
      if (totalUsersError) throw totalUsersError;

      const { count: parentCount, error: parentError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'parent');
      if (parentError) throw parentError;

      const { count: teacherCount, error: teacherError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'teacher');
      if (teacherError) throw teacherError;

      // 3. Children enrolled
      const { count: totalChildren, error: totalChildrenError } = await supabase
        .from('children')
        .select('*', { count: 'exact', head: true });
      if (totalChildrenError) throw totalChildrenError;

      const { count: activeChildren, error: activeChildrenError } = await supabase
        .from('children')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');
      if (activeChildrenError) throw activeChildrenError;

      // 4. Recent activity (nurseries)
      const { data: recentNurseriesData, error: recentNurseriesError } = await supabase
        .from('nurseries')
        .select('id, name_en, name_ar, subscription_status, subscription_plan, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
      if (recentNurseriesError) throw recentNurseriesError;

      const recentNurseries = (recentNurseriesData ?? []) as RecentNursery[];

      // 5. Invoicing & Revenue
      const { count: pendingInvoices, error: pendingInvoicesError } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (pendingInvoicesError) throw pendingInvoicesError;

      const { count: overdueInvoices, error: overdueInvoicesError } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'overdue');
      if (overdueInvoicesError) throw overdueInvoicesError;

      // 6. Content metrics
      const { count: totalMedia, error: totalMediaError } = await supabase
        .from('media')
        .select('*', { count: 'exact', head: true });
      if (totalMediaError) throw totalMediaError;

      const { count: pendingApprovalMedia, error: pendingMediaError } = await supabase
        .from('media')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending_approval');
      if (pendingMediaError) throw pendingMediaError;

      const { count: totalEvents, error: totalEventsError } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true });
      if (totalEventsError) throw totalEventsError;

      // 7. Inquiries & Applications
      const { count: newInquiries, error: newInquiriesError } = await supabase
        .from('inquiries')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'new');
      if (newInquiriesError) throw newInquiriesError;

      const { count: pendingApplications, error: pendingApplicationsError } = await supabase
        .from('applications')
        .select('*', { count: 'exact', head: true })
        .in('status', ['submitted', 'under_review', 'documents_pending']);
      if (pendingApplicationsError) throw pendingApplicationsError;

      // 8. Nurseries by subscription tier
      const { data: nurseryTiersData, error: nurseryTiersError } = await supabase
        .from('nurseries')
        .select('subscription_plan');
      if (nurseryTiersError) throw nurseryTiersError;

      const tierCounts = (nurseryTiersData ?? []).reduce<Record<string, number>>((acc, row) => {
        const plan = (row as { subscription_plan: string | null }).subscription_plan ?? 'unknown';
        acc[plan] = (acc[plan] ?? 0) + 1;
        return acc;
      }, {});

      return {
        totalNurseries: totalNurseries ?? 0,
        activeNurseries: activeNurseries ?? 0,
        trialNurseries: trialNurseries ?? 0,
        totalUsers: totalUsers ?? 0,
        parentCount: parentCount ?? 0,
        teacherCount: teacherCount ?? 0,
        totalChildren: totalChildren ?? 0,
        activeChildren: activeChildren ?? 0,
        recentNurseries,
        pendingInvoices: pendingInvoices ?? 0,
        overdueInvoices: overdueInvoices ?? 0,
        totalMedia: totalMedia ?? 0,
        pendingApprovalMedia: pendingApprovalMedia ?? 0,
        totalEvents: totalEvents ?? 0,
        newInquiries: newInquiries ?? 0,
        pendingApplications: pendingApplications ?? 0,
        tierCounts,
      };
    },
    staleTime: 1000 * 60 * 5,
  });
}

