import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { supabase } from '@/lib/supabase';

export type ParentChildOverview = {
  id: string;
  nurseryId: string;
  nameAr: string;
  nameEn: string;
  avatarUrl: string | null;
  status: string;
  relationship: string;
  dob: string | null;
  enrollmentDate: string | null;
  todayAttendance: 'present' | 'absent' | 'checked_out';
  checkIn: string | null;
  checkOut: string | null;
  applicationId: string | null;
  applicationStatus: string;
  applicationCreatedAt: string | null;
};

type ChildRow = {
  id: string;
  nursery_id: string;
  full_name_ar: string;
  full_name_en: string;
  avatar_url: string | null;
  status: string;
  dob: string | null;
  enrollment_date: string | null;
};

type LinkRow = {
  child_id: string;
  relationship: string | null;
};

type ApplicationRow = {
  id: string;
  child_id: string | null;
  status: string;
  created_at: string | null;
  child_info_json: Record<string, unknown> | null;
};

function readChildInfoName(source: Record<string, unknown> | null | undefined): string {
  const info = source ?? {};
  for (const key of ['full_name_en', 'full_name', 'full_name_ar']) {
    const value = info[key];
    if (typeof value === 'string' && value.trim()) return value.trim().toLowerCase();
  }
  return '';
}

export function useParentChildrenOverview(parentId: string | undefined, nurseryId: string | undefined) {
  const today = useMemo(() => getNurseryCalendarDateString(), []);

  return useQuery({
    queryKey: ['parent-children-overview', parentId, nurseryId, today],
    queryFn: async (): Promise<ParentChildOverview[]> => {
      if (!parentId || !nurseryId) return [];

      const linksRes = await supabase
        .from('parent_children')
        .select('child_id, relationship')
        .eq('parent_id', parentId);
      if (linksRes.error) throw linksRes.error;

      const links = (linksRes.data ?? []) as LinkRow[];

      const applicationsRes = await supabase
        .from('applications')
        .select('id, child_id, status, created_at, child_info_json')
        .eq('parent_id', parentId)
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: false });
      if (applicationsRes.error) throw applicationsRes.error;

      const applicationRows = (applicationsRes.data ?? []) as ApplicationRow[];
      const linkedChildIds = links.map((row) => row.child_id).filter(Boolean);
      const approvedApplicationChildIds = applicationRows
        .filter((row) => row.status === 'approved' && row.child_id)
        .map((row) => row.child_id as string);
      const childIds = [...new Set([...linkedChildIds, ...approvedApplicationChildIds])];
      if (!childIds.length) return [];

      const [childrenRes, attendanceRes] = await Promise.all([
        supabase
          .from('children')
          .select('id, nursery_id, full_name_ar, full_name_en, avatar_url, status, dob, enrollment_date')
          .eq('nursery_id', nurseryId)
          .in('id', childIds),
        supabase
          .from('attendance_records')
          .select('child_id, check_in, check_out')
          .eq('attendance_date', today)
          .in('child_id', childIds),
      ]);

      if (childrenRes.error) throw childrenRes.error;
      if (attendanceRes.error) throw attendanceRes.error;

      const relationshipByChild = new Map(links.map((row) => [row.child_id, row.relationship ?? '']));
      const attendanceByChild = new Map(
        ((attendanceRes.data ?? []) as Array<{ child_id: string; check_in: string | null; check_out: string | null }>).map((row) => [
          row.child_id,
          row,
        ]),
      );
      const applicationByChild = new Map<string, ApplicationRow>();
      for (const application of applicationRows) {
        if (application.child_id && !applicationByChild.has(application.child_id)) {
          applicationByChild.set(application.child_id, application);
        }
      }

      return ((childrenRes.data ?? []) as ChildRow[]).map((child) => {
        const attendance = attendanceByChild.get(child.id);
        let todayAttendance: ParentChildOverview['todayAttendance'] = 'absent';
        if (attendance?.check_in) todayAttendance = attendance.check_out ? 'checked_out' : 'present';

        const childNameKey = (child.full_name_en || child.full_name_ar).trim().toLowerCase();
        const application =
          applicationByChild.get(child.id) ??
          applicationRows.find((row) => readChildInfoName(row.child_info_json) === childNameKey) ??
          null;

        return {
          id: child.id,
          nurseryId: child.nursery_id,
          nameAr: child.full_name_ar,
          nameEn: child.full_name_en,
          avatarUrl: child.avatar_url,
          status: child.status,
          relationship: relationshipByChild.get(child.id) ?? '',
          dob: child.dob,
          enrollmentDate: child.enrollment_date,
          todayAttendance,
          checkIn: attendance?.check_in ?? null,
          checkOut: attendance?.check_out ?? null,
          applicationId: application?.id ?? null,
          applicationStatus: application?.status ?? 'none',
          applicationCreatedAt: application?.created_at ?? null,
        };
      });
    },
    enabled: Boolean(parentId && nurseryId),
    staleTime: 1000 * 60,
  });
}
