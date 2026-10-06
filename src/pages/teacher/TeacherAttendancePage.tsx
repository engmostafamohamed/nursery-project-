import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { Pagination } from '@/components/ui/Pagination';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';
import { usePagination } from '@/hooks/usePagination';
import { attendanceErrorKey, undoCheckIn } from '@/lib/attendanceApi';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { supabase } from '@/lib/supabase';
import { teacherAttendanceToggle } from '@/lib/teacherAttendanceToggle';

type ChildRow = {
  id: string;
  nursery_id: string;
  full_name_ar: string;
  full_name_en: string;
};

type AttendanceRow = {
  id: string;
  child_id: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
};

type AttendanceStatus = 'checked_in' | 'checked_out' | 'not_yet';
type HealthRow = { child_id: string; record_type: string; notes: string | null };
export function TeacherAttendancePage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);
  const [search, setSearch] = useState('');
  const [confirmCard, setConfirmCard] = useState<{
    childId: string;
    childName: string;
    childImage: string;
    checkInTime: string;
    healthAlerts: string[];
    undo: () => Promise<void>;
  } | null>(null);

  const today = getNurseryCalendarDateString();

  const childrenQuery = useQuery({
    queryKey: ['teacher-children', profile?.nursery_id],
    queryFn: async (): Promise<ChildRow[]> => {
      if (!profile?.nursery_id) return [];
      const { data, error } = await supabase
        .from('children')
        .select('id, nursery_id, full_name_ar, full_name_en')
        .eq('nursery_id', profile.nursery_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChildRow[];
    },
    enabled: Boolean(profile?.nursery_id),
  });

  const attendanceQuery = useQuery({
    queryKey: ['teacher-attendance-today', profile?.nursery_id, today],
    queryFn: async (): Promise<Record<string, AttendanceRow>> => {
      if (!profile?.nursery_id) return {};
      const { data, error } = await supabase
        .from('attendance_records')
        .select('id, child_id, attendance_date, check_in, check_out')
        .eq('attendance_date', today);
      if (error) throw error;
      const rows = (data ?? []) as AttendanceRow[];
      return rows.reduce<Record<string, AttendanceRow>>((acc, row) => {
        acc[row.child_id] = row;
        return acc;
      }, {});
    },
    enabled: Boolean(profile?.nursery_id),
  });

  const healthQuery = useQuery({
    queryKey: ['teacher-health-alerts', profile?.nursery_id],
    queryFn: async (): Promise<Record<string, string[]>> => {
      const children = childrenQuery.data ?? [];
      if (!children.length) return {};
      const childIds = children.map((c) => c.id);
      const { data, error } = await supabase
        .from('health_records')
        .select('child_id, record_type, notes')
        .in('child_id', childIds)
        .or('record_type.eq.allergy,notes.ilike.%medication%');
      if (error) throw error;
      const rows = (data ?? []) as HealthRow[];
      return rows.reduce<Record<string, string[]>>((acc, row) => {
        const alert = row.record_type === 'allergy' ? t('teacher.attendance.alertAllergy') : t('teacher.attendance.alertMedication');
        const existing = acc[row.child_id] ?? [];
        if (!existing.includes(alert)) existing.push(alert);
        acc[row.child_id] = existing;
        return acc;
      }, {});
    },
    enabled: Boolean(childrenQuery.data?.length),
  });

  const children = useMemo(() => {
    const items = childrenQuery.data ?? [];
    const q = search.trim().toLowerCase();
    return items.filter((child) => {
      const displayName =
        languagePref === 'ar'
          ? child.full_name_ar
          : languagePref === 'en'
            ? child.full_name_en
            : `${child.full_name_ar} / ${child.full_name_en}`;
      return q ? displayName.toLowerCase().includes(q) : true;
    });
  }, [childrenQuery.data, languagePref, search]);

  const pager = usePagination(children, 15);

  const checkMutation = useMutation({
    mutationFn: async (child: ChildRow) => {
      const existing = attendanceQuery.data?.[child.id] ?? null;
      return teacherAttendanceToggle(child, existing, today);
    },
    onSuccess: async (result, child) => {
      await queryClient.invalidateQueries({ queryKey: ['teacher-attendance-today'] });
      if (result.mode === 'rejected') {
        toast.error(t(attendanceErrorKey(result.reason), { minutes: result.minMinutes ?? 5 }));
        return;
      }
      if (result.mode === 'already_checked_in' || result.mode === 'already_checked_out') {
        toast.info(t(result.mode === 'already_checked_in' ? 'attendance.status.inNursery' : 'attendance.status.checkedOut'));
        return;
      }
      if (result.mode === 'checkout') {
        toast.success(t('teacher.attendance.checkedOut'), {
          description: result.extraHours > 0
            ? t('attendance.scanner.extraHoursSummary', {
                hours: result.extraHours,
                covered: result.extraHoursCovered,
                fee: result.extraFee.toFixed(2),
                minutes: result.lateMinutes,
              })
            : undefined,
        });
        return;
      }

      const checkInDate = new Date(result.checkIn);
      const checkInTime = new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit', hour12: true,
      }).format(checkInDate);
      const healthAlerts = healthQuery.data?.[child.id] ?? [];
      const childName =
        languagePref === 'ar'
          ? child.full_name_ar
          : languagePref === 'en'
            ? child.full_name_en
            : `${child.full_name_ar} / ${child.full_name_en}`;
      const childImage = `https://ui-avatars.com/api/?name=${encodeURIComponent(childName)}&background=d4e3ff&color=001c3a`;

      const undo = async () => {
        try {
          await undoCheckIn(result.attendanceId);
        } catch (error) {
          toast.error(t(attendanceErrorKey(error)));
        }
        await queryClient.invalidateQueries({ queryKey: ['teacher-attendance-today'] });
        setConfirmCard(null);
      };

      setConfirmCard({ childId: child.id, childName, childImage, checkInTime, healthAlerts, undo });
      // TODO Phase 2: Replace with settings-based confirmation timeout for attendance UX.
      setTimeout(() => {
        setConfirmCard((current) => (current?.childId === child.id ? null : current));
      }, 3000);
    },
    onError: (error) => {
      const key = attendanceErrorKey(error);
      toast.error(t(key === 'attendance.errors.generic' ? 'onboarding.errors.saveFailed' : key));
    },
  });

  const renderStatus = (childId: string): { key: AttendanceStatus; label: string; className: string; time?: string } => {
    const row = attendanceQuery.data?.[childId];
    if (row?.check_in && !row.check_out) {
      const time = new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit', hour12: true,
      }).format(new Date(row.check_in));
      return {
        key: 'checked_in',
        label: t('teacher.attendance.statusCheckedIn'),
        className: 'bg-success/10 text-success',
        time,
      };
    }
    if (row?.check_out) {
      return {
        key: 'checked_out',
        label: t('teacher.attendance.statusCheckedOut'),
        className: 'bg-surface-low text-foreground-secondary',
      };
    }
    return {
      key: 'not_yet',
      label: t('teacher.attendance.statusNotYet'),
      className: 'bg-surface-container-low text-on-surface-variant',
    };
  };

  if (childrenQuery.isLoading || attendanceQuery.isLoading || healthQuery.isLoading) {
    return <LoadingSkeleton />;
  }

  if (!children.length) {
    return (
      <EmptyState
        icon="groups"
        title={t('teacher.attendance.emptyTitle')}
        description={t('teacher.attendance.emptyDescription')}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-md lg:max-w-none space-y-4">
      <h1 className="font-headline text-lg font-extrabold text-on-surface">
        {t('teacher.attendance.title')}
      </h1>
      <Input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          pager.setPage(1);
        }}
        placeholder={t('teacher.attendance.searchPlaceholder')}
      />

      <div className="space-y-3">
        {pager.pageItems.map((child) => {
          const status = renderStatus(child.id);
          const healthAlerts = healthQuery.data?.[child.id] ?? [];
          const childName =
            languagePref === 'ar'
              ? child.full_name_ar
              : languagePref === 'en'
                ? child.full_name_en
                : `${child.full_name_ar} / ${child.full_name_en}`;
          const childImage = `https://ui-avatars.com/api/?name=${encodeURIComponent(childName)}&background=d4e3ff&color=001c3a`;
          return (
            <div key={child.id} className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
              <div className="flex items-start gap-3">
                <Avatar className="h-11 w-11">
                  <AvatarImage src={childImage} alt={childName} />
                  <AvatarFallback>{childName.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-on-surface">{childName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>
                      {status.label}
                    </span>
                    {status.time ? (
                      <span className="text-xs text-on-surface-variant">
                        {t('teacher.attendance.checkInTime', { time: status.time })}
                      </span>
                    ) : null}
                  </div>
                  {healthAlerts.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {healthAlerts.map((alert) => (
                        <span
                          key={alert}
                          className="rounded-full bg-error/10 px-2 py-0.5 text-xs font-medium text-error"
                        >
                          {alert}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-3">
                <Button
                  className="w-full"
                  variant={status.key === 'checked_in' ? 'secondary' : 'default'}
                  onClick={() => checkMutation.mutate(child)}
                  disabled={checkMutation.isPending}
                >
                  {status.key === 'checked_in'
                    ? t('teacher.attendance.checkOut')
                    : t('teacher.attendance.checkIn')}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Pagination
        page={pager.page}
        pageCount={pager.pageCount}
        total={pager.total}
        startIndex={pager.startIndex}
        endIndex={pager.endIndex}
        hasPrev={pager.hasPrev}
        hasNext={pager.hasNext}
        onPrev={pager.prev}
        onNext={pager.next}
      />

      {confirmCard ? (
        <div className="fixed inset-x-3 bottom-24 z-50 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 shadow-lg">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src={confirmCard.childImage} alt={confirmCard.childName} />
              <AvatarFallback>{confirmCard.childName.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="text-sm font-semibold text-on-surface">{confirmCard.childName}</p>
              <p className="text-xs text-on-surface-variant">
                {t('teacher.attendance.checkInTime', { time: confirmCard.checkInTime })}
              </p>
                    {confirmCard.healthAlerts.length ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {confirmCard.healthAlerts.map((alert) => (
                          <span
                            key={alert}
                            className="rounded-full bg-error/10 px-2 py-0.5 text-xs font-medium text-error"
                          >
                            {alert}
                          </span>
                        ))}
                      </div>
                    ) : null}
            </div>
            <Button variant="outline" onClick={() => void confirmCard.undo()}>
              {t('teacher.attendance.undo')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
