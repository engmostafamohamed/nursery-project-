import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DataTable, StatusPill, TableEmpty, TablePagination, TBody, Td, Th, THead, Tr, type PillTone } from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';
import { usePagination } from '@/hooks/usePagination';
import { attendanceErrorKey, undoCheckIn } from '@/lib/attendanceApi';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { supabase } from '@/lib/supabase';
import { teacherAttendanceToggle } from '@/lib/teacherAttendanceToggle';
import { cn, getUserInitials } from '@/lib/utils';

type ChildRow = {
  id: string;
  nursery_id: string;
  full_name_ar: string;
  full_name_en: string;
  class_id: string | null;
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

const STATUS_TONE: Record<AttendanceStatus, PillTone> = {
  checked_in: 'success',
  checked_out: 'neutral',
  not_yet: 'warning',
};

export function TeacherAttendancePage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AttendanceStatus>('all');
  const [confirmCard, setConfirmCard] = useState<{
    childId: string;
    childName: string;
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
        .select('id, nursery_id, full_name_ar, full_name_en, class_id')
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

  const timeFmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    [i18n.language],
  );

  const nameOf = (child: ChildRow) =>
    languagePref === 'ar'
      ? child.full_name_ar
      : languagePref === 'en'
        ? child.full_name_en
        : `${child.full_name_ar} / ${child.full_name_en}`;

  const statusOf = (childId: string): AttendanceStatus => {
    const row = attendanceQuery.data?.[childId];
    if (row?.check_out) return 'checked_out';
    if (row?.check_in) return 'checked_in';
    return 'not_yet';
  };

  const allChildren = useMemo(() => childrenQuery.data ?? [], [childrenQuery.data]);

  const counts = useMemo(() => {
    const out = { checked_in: 0, checked_out: 0, not_yet: 0 };
    for (const child of allChildren) out[statusOf(child.id)] += 1;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allChildren, attendanceQuery.data]);

  const children = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allChildren.filter((child) => {
      if (statusFilter !== 'all' && statusOf(child.id) !== statusFilter) return false;
      return q ? nameOf(child).toLowerCase().includes(q) : true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allChildren, languagePref, search, statusFilter, attendanceQuery.data]);

  const pager = usePagination(children, 10, `${search}|${statusFilter}|${children.length}`);

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

      const checkInTime = timeFmt.format(new Date(result.checkIn));
      const healthAlerts = healthQuery.data?.[child.id] ?? [];
      const childName = nameOf(child);

      const undo = async () => {
        try {
          await undoCheckIn(result.attendanceId);
        } catch (error) {
          toast.error(t(attendanceErrorKey(error)));
        }
        await queryClient.invalidateQueries({ queryKey: ['teacher-attendance-today'] });
        setConfirmCard(null);
      };

      setConfirmCard({ childId: child.id, childName, checkInTime, healthAlerts, undo });
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

  if (childrenQuery.isLoading || attendanceQuery.isLoading || healthQuery.isLoading) {
    return <LoadingSkeleton />;
  }

  const statusLabel = (key: AttendanceStatus) =>
    key === 'checked_in'
      ? t('teacher.attendance.statusCheckedIn')
      : key === 'checked_out'
        ? t('teacher.attendance.statusCheckedOut')
        : t('teacher.attendance.statusNotYet');

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        icon="how_to_reg"
        title={t('teacher.attendance.title')}
        description={t('teacher.attendance.pageHint')}
      >
        <div className="grid grid-cols-3 gap-3">
          {(['checked_in', 'checked_out', 'not_yet'] as const).map((key) => (
            <StatTile
              key={key}
              icon={key === 'checked_in' ? 'home_work' : key === 'checked_out' ? 'logout' : 'schedule'}
              tone={key === 'checked_in' ? 'success' : key === 'not_yet' ? 'warning' : 'neutral'}
              label={statusLabel(key)}
              value={counts[key]}
              onClick={() => setStatusFilter((cur) => (cur === key ? 'all' : key))}
              active={statusFilter === key}
            />
          ))}
        </div>
      </PageHeader>

      {!allChildren.length ? (
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
          <TableEmpty icon="groups" title={t('teacher.attendance.emptyTitle')} description={t('teacher.attendance.emptyDescription')} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
          <div className="border-b border-outline-variant p-4 sm:p-5">
            <FilterBar onClear={() => { setSearch(''); setStatusFilter('all'); }} canClear={Boolean(search) || statusFilter !== 'all'}>
              <FilterField label={t('common.search')} className="sm:flex-[2]">
                <SearchInput value={search} onChange={setSearch} placeholder={t('teacher.attendance.searchPlaceholder')} />
              </FilterField>
              <FilterField label={t('admin.attendance.table.status')}>
                <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | AttendanceStatus)}>
                  <option value="all">{t('common.all')}</option>
                  {(['checked_in', 'checked_out', 'not_yet'] as const).map((key) => (
                    <option key={key} value={key}>{statusLabel(key)}</option>
                  ))}
                </Select>
              </FilterField>
            </FilterBar>
          </div>

          {!children.length ? (
            <TableEmpty icon="search_off" title={t('admin.attendance.noSearchResults')} />
          ) : (
            <>
              <DataTable minWidth={720}>
                <THead>
                  <Th>{t('admin.attendance.table.child')}</Th>
                  <Th>{t('admin.attendance.table.status')}</Th>
                  <Th>{t('admin.attendance.table.in')}</Th>
                  <Th>{t('teacher.attendance.table.alerts')}</Th>
                  <Th align="end">{t('admin.attendance.table.actions')}</Th>
                </THead>
                <TBody>
                  {pager.pageItems.map((child) => {
                    const key = statusOf(child.id);
                    const row = attendanceQuery.data?.[child.id];
                    const healthAlerts = healthQuery.data?.[child.id] ?? [];
                    const childName = nameOf(child);
                    return (
                      <Tr key={child.id} className={cn(checkMutation.isPending && 'opacity-70')} data-testid="teacher-attendance-row">
                        <Td className="min-w-[12rem]">
                          <span className="flex min-w-0 items-center gap-3">
                            <Avatar className="h-9 w-9 shrink-0">
                              <AvatarImage src={undefined} alt="" />
                              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                                {getUserInitials(childName, null)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="min-w-0 truncate font-semibold text-on-surface">{childName}</span>
                          </span>
                        </Td>
                        <Td>
                          <StatusPill tone={STATUS_TONE[key]}>{statusLabel(key)}</StatusPill>
                        </Td>
                        <Td className="whitespace-nowrap tabular-nums text-on-surface-variant">
                          {row?.check_in ? timeFmt.format(new Date(row.check_in)) : '—'}
                          {row?.check_out ? ` → ${timeFmt.format(new Date(row.check_out))}` : ''}
                        </Td>
                        <Td className="min-w-[9rem]">
                          {healthAlerts.length ? (
                            <span className="flex flex-wrap gap-1">
                              {healthAlerts.map((alert) => (
                                <span key={alert} className="rounded-full bg-error/10 px-2 py-0.5 text-xs font-medium text-error">
                                  {alert}
                                </span>
                              ))}
                            </span>
                          ) : (
                            <span className="text-on-surface-variant">—</span>
                          )}
                        </Td>
                        <Td align="end">
                          {key === 'checked_out' ? (
                            <span className="text-xs text-on-surface-variant">{t('teacher.attendance.statusCheckedOut')}</span>
                          ) : (
                            <Button
                              size="sm"
                              className="h-8"
                              variant={key === 'checked_in' ? 'outline' : 'default'}
                              onClick={() => checkMutation.mutate(child)}
                              disabled={checkMutation.isPending}
                              data-testid="teacher-attendance-toggle"
                            >
                              {key === 'checked_in' ? t('teacher.attendance.checkOut') : t('teacher.attendance.checkIn')}
                            </Button>
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </DataTable>
              <TablePagination pager={pager} pageSizeOptions={[10, 20, 50]} />
            </>
          )}
        </div>
      )}

      {confirmCard ? (
        <div className="fixed inset-x-3 bottom-24 z-50 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 shadow-lg">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback>{getUserInitials(confirmCard.childName, null)}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="text-sm font-semibold text-on-surface">{confirmCard.childName}</p>
              <p className="text-xs text-on-surface-variant">
                {t('teacher.attendance.checkInTime', { time: confirmCard.checkInTime })}
              </p>
              {confirmCard.healthAlerts.length ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {confirmCard.healthAlerts.map((alert) => (
                    <span key={alert} className="rounded-full bg-error/10 px-2 py-0.5 text-xs font-medium text-error">
                      {alert}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <Button variant="outline" onClick={() => void confirmCard.undo()}>
              <MaterialSymbol name="undo" size="text-base" className="me-1" />
              {t('teacher.attendance.undo')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
