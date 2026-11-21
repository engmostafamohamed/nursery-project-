import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import {
  CorrectAttendanceDialog,
  WaiveChargeDialog,
  type CorrectionTarget,
} from '@/components/admin/attendance/AttendanceActionDialogs';
import { ExcuseAbsenceDialog, type ExcuseTarget } from '@/components/admin/attendance/ExcuseAbsenceDialog';
import { AttendanceDayCharts } from '@/features/attendance-day/AttendanceDayCharts';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterField } from '@/components/ui/FilterField';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionTabs } from '@/components/ui/SectionTabs';
import { DataTable, IconAction, StatusPill, TablePagination, TBody, Td, Th, THead, Tr, type PillTone } from '@/components/ui/DataTable';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile, type StatTone } from '@/components/ui/StatTile';
import { useAdminBasePath } from '@/hooks/useAdminBasePath';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryClasses } from '@/hooks/useClassStaff';
import { usePagination } from '@/hooks/usePagination';
import { useNurseryLanguagePref, type NurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useNurserySettings } from '@/hooks/useNurserySettings';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  attendanceErrorKey,
  fetchAttendanceDays,
  recordCheckIn,
  recordCheckOut,
  resolveAttendanceReview,
  staffName,
  undoCheckIn,
  type AttendanceDay,
} from '@/lib/attendanceApi';
import { attendanceSectionTabs } from '@/lib/attendanceTabs';
import { addCalendarDaysYmd, getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { supabase } from '@/lib/supabase';
import { formatQueryError, getUserInitials } from '@/lib/utils';

type ChildRow = {
  id: string;
  avatar_url: string | null;
  full_name_ar: string;
  full_name_en: string;
  class_id?: string | null;
};

type DayWithChild = AttendanceDay & { child: ChildRow };
type SectionKey = 'stillIn' | 'late' | 'onTime' | 'absent' | 'excused';

const PAGE_SIZE = 10;

/** Dot and tile colour per group. */
const SECTION_TONE: Record<SectionKey, { tone: StatTone; dot: string; icon: string }> = {
  stillIn: { tone: 'primary', dot: 'bg-primary', icon: 'home_work' },
  late: { tone: 'warning', dot: 'bg-warning', icon: 'more_time' },
  onTime: { tone: 'success', dot: 'bg-success', icon: 'task_alt' },
  absent: { tone: 'error', dot: 'bg-error', icon: 'event_busy' },
  excused: { tone: 'neutral', dot: 'bg-outline', icon: 'sick' },
};

const GROUP_PILL: Record<SectionKey, PillTone> = {
  stillIn: 'primary',
  late: 'warning',
  onTime: 'success',
  absent: 'error',
  excused: 'neutral',
};

function displayChildName(child: ChildRow, languagePref: NurseryLanguagePref): string {
  const ar = typeof child.full_name_ar === 'string' ? child.full_name_ar.trim() : '';
  const en = typeof child.full_name_en === 'string' ? child.full_name_en.trim() : '';
  if (languagePref === 'ar') return ar || en || '';
  if (languagePref === 'en') return en || ar || '';
  if (ar && en && ar !== en) return `${ar} / ${en}`;
  return ar || en || '';
}

export function AdminAttendancePage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const { data: profile, isPending: profilePending } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id;
  const { data: languagePref = 'both' } = useNurseryLanguagePref(nurseryId);
  const { settings } = useNurserySettings(nurseryId);
  const { data: classes } = useNurseryClasses(nurseryId);
  const basePath = useAdminBasePath();
  const today = getNurseryCalendarDateString();
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [search, setSearch] = useState('');
  /** One group picked from the summary tiles, or every group that has children. */
  const [focus, setFocus] = useState<SectionKey | 'all'>('all');
  const isToday = selectedDate === today;
  const [busyChildId, setBusyChildId] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<CorrectionTarget | null>(null);
  const [waiving, setWaiving] = useState<{ attendanceId: string; childName: string; date: string; fee: number } | null>(null);
  const [excusing, setExcusing] = useState<ExcuseTarget | null>(null);

  const listQuery = useQuery({
    queryKey: ['admin-attendance-today', nurseryId, selectedDate, selectedClassId],
    queryFn: async (): Promise<DayWithChild[]> => {
      if (!nurseryId) return [];
      let childQuery = supabase
        .from('children')
        .select('id, avatar_url, full_name_ar, full_name_en, class_id')
        .eq('nursery_id', nurseryId)
        .eq('status', 'active');
      if (selectedClassId !== 'all') childQuery = childQuery.eq('class_id', selectedClassId);
      const { data: childRows, error: childErr } = await childQuery;
      if (childErr) throw childErr;
      const children = (childRows ?? []) as ChildRow[];
      if (!children.length) return [];
      const childById = new Map(children.map((c) => [c.id, c]));
      const days = await fetchAttendanceDays(children.map((c) => c.id), selectedDate, selectedDate);
      return days.flatMap((day) => {
        const child = childById.get(day.childId);
        return child ? [{ ...day, child }] : [];
      });
    },
    enabled: Boolean(nurseryId),
  });

  const formatTime = useMemo(() => {
    const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';
    return (iso: string | null): string => {
      if (!iso) return '—';
      return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true });
    };
  }, [i18n.language]);

  const groups = useMemo(() => {
    const out: Record<SectionKey, DayWithChild[]> = { stillIn: [], late: [], onTime: [], absent: [], excused: [] };
    const q = search.trim().toLowerCase();
    for (const row of listQuery.data ?? []) {
      if (q && !displayChildName(row.child, languagePref).toLowerCase().includes(q)) continue;
      if (row.status === 'partial') out.stillIn.push(row);
      else if (row.status === 'present') (row.extraHours > 0 ? out.late : out.onTime).push(row);
      else if (row.status === 'absent') out.absent.push(row);
      else if (row.status === 'excused') out.excused.push(row);
    }
    return out;
  }, [listQuery.data, search, languagePref]);

  const resetKey = `${selectedDate}|${selectedClassId}|${search.trim().toLowerCase()}|${focus}`;
  /** Every child once, grouped order kept: still in, left late, on time, absent, excused. */
  const tableRows = useMemo(() => {
    const order: SectionKey[] = ['stillIn', 'late', 'onTime', 'absent', 'excused'];
    return order
      .filter((key) => focus === 'all' || key === focus)
      .flatMap((key) => groups[key].map((row) => ({ row, group: key })));
  }, [groups, focus]);
  const pager = usePagination(tableRows, PAGE_SIZE, resetKey);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-attendance-today'] });

  /** Runs one child's action, keeps the row's buttons quiet meanwhile, and reloads the day. */
  const act = async (childId: string, work: () => Promise<void>) => {
    setBusyChildId(childId);
    try {
      await work();
      await refresh();
    } catch (error) {
      toast.error(t(attendanceErrorKey(error)));
    } finally {
      setBusyChildId(null);
    }
  };

  const checkInNow = (row: DayWithChild) =>
    act(row.childId, async () => {
      const result = await recordCheckIn({ childId: row.childId, method: 'manual' });
      if (result.status === 'rejected') {
        toast.error(t(attendanceErrorKey(result.reason)));
        return;
      }
      toast.success(t('admin.attendance.actions.checkedIn'));
    });

  const checkOutNow = (row: DayWithChild) =>
    act(row.childId, async () => {
      if (!row.attendanceId) return;
      let result = await recordCheckOut({ attendanceId: row.attendanceId, method: 'manual' });
      if (result.status === 'rejected' && result.reason === 'attendance_too_soon') {
        const goAhead = await confirm({
          description: t('attendance.errors.attendance_too_soon', { minutes: result.min_minutes ?? 5 }),
          confirmText: t('admin.attendance.actions.checkOut'),
        });
        if (!goAhead) return;
        result = await recordCheckOut({ attendanceId: row.attendanceId, method: 'manual', force: true });
      }
      if (result.status === 'rejected') {
        toast.error(t(attendanceErrorKey(result.reason), { minutes: result.min_minutes ?? 5 }));
        return;
      }
      toast.success(
        result.extra_hours > 0
          ? t('admin.attendance.actions.checkedOutLate', { hours: result.extra_hours, fee: result.extra_fee.toFixed(2) })
          : t('admin.attendance.actions.checkedOut'),
      );
    });

  const undoNow = (row: DayWithChild) =>
    act(row.childId, async () => {
      if (!row.attendanceId) return;
      if (!(await confirm({ description: t('admin.attendance.actions.undoConfirm'), variant: 'danger' }))) return;
      await undoCheckIn(row.attendanceId);
      toast.success(t('admin.attendance.actions.undone'));
    });

  const resolveNow = (row: DayWithChild) =>
    act(row.childId, async () => {
      if (!row.attendanceId) return;
      await resolveAttendanceReview(row.attendanceId);
      toast.success(t('admin.attendance.actions.reviewResolved'));
    });

  /** The staff-entered excuse is withdrawn: the day shows as a plain absence again. */
  const removeExcuse = (row: DayWithChild) =>
    act(row.childId, async () => {
      if (!(await confirm({ description: t('admin.attendance.actions.removeExcuseConfirm'), variant: 'danger' }))) return;
      const { error } = await supabase
        .from('attendance_absence_reports')
        .delete()
        .eq('child_id', row.childId)
        .eq('absence_date', row.date);
      if (error) throw error;
      toast.success(t('admin.attendance.actions.excuseRemoved'));
    });

  const classNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of classes ?? []) map.set(c.id, displayChildName({ full_name_ar: c.name_ar, full_name_en: c.name_en } as ChildRow, languagePref));
    return map;
  }, [classes, languagePref]);

  const lateTotals = useMemo(() => {
    const charged = [...groups.late, ...groups.stillIn];
    return {
      totalHours: charged.reduce((sum, row) => sum + row.extraHours, 0),
      totalFee: charged.reduce((sum, row) => sum + row.extraFee, 0),
    };
  }, [groups.late, groups.stillIn]);

  const showSkeleton = profilePending || (Boolean(nurseryId) && listQuery.isPending);
  const isOffDay = !showSkeleton && (listQuery.data ?? []).length > 0
    && (listQuery.data ?? []).every((row) => row.status === 'off' || row.status === 'holiday' || row.status === 'not_enrolled');

  const lateTotalsLabel = lateTotals.totalHours > 0
    ? t('admin.attendance.sections.lateTotals', { hours: lateTotals.totalHours, amount: lateTotals.totalFee.toFixed(2) })
    : undefined;

  const sections: { key: SectionKey; title: string; footer?: string }[] = [
    {
      key: 'stillIn',
      title: isToday ? t('admin.attendance.sections.stillIn') : t('admin.attendance.sections.noCheckout'),
    },
    { key: 'late', title: t('admin.attendance.sections.late'), footer: lateTotalsLabel },
    { key: 'onTime', title: t('admin.attendance.sections.onTime') },
    { key: 'absent', title: t('attendance.sections.absent') },
    { key: 'excused', title: t('attendance.sections.excused') },
  ];

  const totalCount = Object.values(groups).reduce((sum, rows) => sum + rows.length, 0);
  const selectedClass = selectedClassId !== 'all' ? classes?.find((c) => c.id === selectedClassId) : undefined;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        icon="how_to_reg"
        title={t('admin.attendance.title')}
        description={
          <div className="space-y-1.5">
            <p>{t('admin.attendance.description')}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {settings?.standard_end_time ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface px-2.5 py-1">
                  <span className="material-symbols-outlined text-sm text-primary" aria-hidden>schedule</span>
                  {t('admin.attendance.windowSummary', {
                    start: settings.standard_start_time ?? '—',
                    end: settings.standard_end_time,
                    grace: settings.late_pickup_grace_minutes ?? 0,
                    fee:
                      typeof settings.late_pickup_fee_per_hour === 'string'
                        ? settings.late_pickup_fee_per_hour
                        : String(settings.late_pickup_fee_per_hour ?? 0),
                  })}
                </span>
              ) : null}
              {selectedClass ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-semibold text-primary">
                  <span className="material-symbols-outlined text-sm" aria-hidden>groups</span>
                  {t('admin.attendance.classCapacity')}: {groups.stillIn.length} / {selectedClass.capacity ?? selectedClass.child_count ?? '—'}
                </span>
              ) : null}
            </div>
          </div>
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/admin/attendance/logs">
                <span className="material-symbols-outlined me-1 text-base" aria-hidden>receipt_long</span>
                {t('attendance.logs.open')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/attendance/dashboard">
                <span className="material-symbols-outlined me-1 text-base" aria-hidden>monitoring</span>
                {t('admin.attendance.openDashboard')}
              </Link>
            </Button>
          </>
        }
      >
        <SectionTabs tabs={attendanceSectionTabs(basePath, t)} label={t('admin.attendance.title')} className="mb-4" />

        <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
          <FilterField label={t('admin.attendance.dayLabel')}>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-12 w-12 shrink-0"
                onClick={() => setSelectedDate((d) => addCalendarDaysYmd(d, -1))}
                aria-label={t('admin.attendance.previousDay')}
              >
                <span className="material-symbols-outlined text-xl rtl:rotate-180" aria-hidden>chevron_left</span>
              </Button>
              <Input
                type="date"
                value={selectedDate}
                max={today}
                onChange={(e) => setSelectedDate(e.target.value || today)}
                className="w-auto min-w-0 flex-1 sm:w-44 sm:flex-none"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-12 w-12 shrink-0"
                onClick={() => setSelectedDate((d) => addCalendarDaysYmd(d, 1))}
                disabled={isToday}
                aria-label={t('admin.attendance.nextDay')}
              >
                <span className="material-symbols-outlined text-xl rtl:rotate-180" aria-hidden>chevron_right</span>
              </Button>
              <Button type="button" variant="outline" className="h-12 shrink-0" onClick={() => setSelectedDate(today)} disabled={isToday}>
                {t('admin.attendance.jumpToday')}
              </Button>
            </div>
          </FilterField>
          <FilterField label={t('admin.attendance.classLabel')}>
            <Select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
              <option value="all">{t('common.allClasses')}</option>
              {classes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {classNameById.get(c.id) || c.name_en || c.name_ar}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label={t('common.search')}>
            <div className="relative">
              <span className="material-symbols-outlined pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant" aria-hidden>
                search
              </span>
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('admin.attendance.searchPlaceholder')}
                className="ps-10"
              />
            </div>
          </FilterField>
        </div>

        {showSkeleton ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {[1, 2, 3, 4, 5].map((k) => <Skeleton key={k} className="h-20 rounded-xl" />)}
          </div>
        ) : nurseryId && !listQuery.isError && !isOffDay ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {sections.map((section) => (
              <StatTile
                key={section.key}
                icon={SECTION_TONE[section.key].icon}
                label={section.title}
                value={groups[section.key].length}
                tone={groups[section.key].length > 0 ? SECTION_TONE[section.key].tone : 'neutral'}
                helper={section.footer}
                onClick={() => setFocus((current) => (current === section.key ? 'all' : section.key))}
                active={focus === section.key}
              />
            ))}
          </div>
        ) : null}
      </PageHeader>

      {showSkeleton ? (
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
          {[1, 2, 3, 4].map((k) => (
            <div key={k} className="flex items-center gap-3 border-b border-outline-variant px-4 py-3 last:border-b-0">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : !nurseryId ? (
        <p className="text-sm text-on-surface-variant">{t('admin.children.missingNursery')}</p>
      ) : listQuery.isError ? (
        <EmptyState
          icon="error"
          title={t('attendance.loadErrorTitle')}
          description={formatQueryError(listQuery.error)}
          action={
            <Button type="button" variant="outline" onClick={() => void listQuery.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : isOffDay ? (
        <EmptyState icon="weekend" title={t('attendance.offDayTitle')} description={t('attendance.offDayDescription')} />
      ) : totalCount === 0 && search.trim() ? (
        <EmptyState icon="search_off" title={t('admin.attendance.noSearchResults')} description="" />
      ) : totalCount === 0 ? (
        <EmptyState
          icon="how_to_reg"
          title={t('admin.attendance.emptyTitle')}
          description={t('admin.attendance.emptyDescription')}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
          <DataTable minWidth={1020}>
            <THead>
              <Th>{t('admin.attendance.table.child')}</Th>
              <Th>{t('admin.attendance.table.status')}</Th>
              <Th>{t('admin.attendance.table.in')}</Th>
              <Th>{t('admin.attendance.table.out')}</Th>
              <Th align="end">{t('admin.attendance.table.extra')}</Th>
              <Th align="end">{t('admin.attendance.table.actions')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map(({ row, group }) => {
                const name = displayChildName(row.child, languagePref);
                const initialsName = i18n.language.startsWith('ar')
                  ? row.child.full_name_ar?.trim() || row.child.full_name_en
                  : row.child.full_name_en?.trim() || row.child.full_name_ar;
                const avatarUrl = row.child.avatar_url?.trim() || null;
                const inBy = staffName(row.checkedInBy, i18n.language);
                const outBy = staffName(row.checkedOutBy, i18n.language);
                const className = row.child.class_id ? classNameById.get(row.child.class_id) : undefined;
                const busy = busyChildId === row.childId;
                const sectionTitle =
                  group === 'stillIn'
                    ? (isToday ? t('admin.attendance.sections.stillIn') : t('admin.attendance.sections.noCheckout'))
                    : group === 'late'
                      ? t('admin.attendance.sections.late')
                      : group === 'onTime'
                        ? t('admin.attendance.sections.onTime')
                        : group === 'absent'
                          ? t('attendance.sections.absent')
                          : t('attendance.sections.excused');
                return (
                  <Tr key={`${row.childId}-${row.date}`} className={busy ? 'pointer-events-none opacity-50' : undefined} data-testid="attendance-day-row">
                    <Td className="min-w-[13rem]">
                      <Link to={`/admin/attendance/child/${row.childId}`} className="flex min-w-0 items-center gap-3 hover:text-primary">
                        <Avatar className="h-9 w-9 shrink-0">
                          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
                          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{getUserInitials(initialsName || name, null)}</AvatarFallback>
                        </Avatar>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-on-surface">{name || '—'}</span>
                          {className ? <span className="block truncate text-xs text-on-surface-variant">{className}</span> : null}
                        </span>
                      </Link>
                    </Td>
                    <Td>
                      <span className="flex flex-col items-start gap-1">
                        <StatusPill tone={GROUP_PILL[group]}>{sectionTitle}</StatusPill>
                        {row.needsReview ? <Badge variant="warning" className="text-[10px]">{t('attendance.needsReview')}</Badge> : null}
                        {group === 'excused' && row.absenceReason ? (
                          <span className="text-xs text-on-surface-variant">
                            {t(`attendance.absence.reasons.${row.absenceReason}`)}
                            {row.absenceNote ? ` · ${row.absenceNote}` : ''}
                          </span>
                        ) : null}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {row.checkIn ? (
                        <>
                          <span className="block font-medium tabular-nums text-on-surface">{formatTime(row.checkIn)}</span>
                          <span className="block text-xs text-on-surface-variant">
                            {[inBy, row.checkInMethod ? t(`attendance.method.${row.checkInMethod}`) : null].filter(Boolean).join(' · ') || '—'}
                          </span>
                        </>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {row.checkOut ? (
                        <>
                          <span className="block font-medium tabular-nums text-on-surface">{formatTime(row.checkOut)}</span>
                          <span className="block text-xs text-on-surface-variant">
                            {[outBy, row.checkOutMethod ? t(`attendance.method.${row.checkOutMethod}`) : null].filter(Boolean).join(' · ') || '—'}
                          </span>
                          {row.pickupPersonName ? (
                            <span className="block text-xs text-on-surface-variant">
                              {t('attendance.pickedUpBy', { name: row.pickupPersonName })}
                              {row.pickupRelationship ? ` (${row.pickupRelationship})` : ''}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </Td>
                    <Td align="end" className="whitespace-nowrap">
                      {row.extraHours > 0 ? (
                        <>
                          <span className="block font-semibold text-warning">{t('admin.attendance.extraHoursValue', { count: row.extraHours })}</span>
                          <span className="block text-xs text-on-surface-variant">
                            {row.lateChargeWaived
                              ? t('attendance.waived')
                              : t('admin.attendance.extraFeeValue', { amount: row.extraFee.toFixed(2) })}
                            {row.lateChargeStatus === 'provisional' ? ` · ${t('attendance.provisional')}` : ''}
                          </span>
                        </>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </Td>
                    <Td align="end">
                      <span className="flex items-center justify-end gap-0.5">
                        {group === 'absent' && isToday ? (
                          <Button type="button" size="sm" className="h-8" disabled={busy} onClick={() => void checkInNow(row)} data-testid="attendance-check-in">
                            {t('admin.attendance.actions.checkIn')}
                          </Button>
                        ) : null}
                        {group === 'stillIn' && isToday && row.attendanceId ? (
                          <Button type="button" size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => void checkOutNow(row)} data-testid="attendance-check-out">
                            {t('admin.attendance.actions.checkOut')}
                          </Button>
                        ) : null}
                        {group === 'stillIn' && isToday && row.attendanceId ? (
                          <IconAction icon="undo" label={t('admin.attendance.actions.undo')} onClick={() => void undoNow(row)} disabled={busy} />
                        ) : null}
                        {group === 'absent' ? (
                          <IconAction icon="sick" label={t('admin.attendance.actions.excuse')} disabled={busy} onClick={() => setExcusing({ childId: row.childId, childName: name, date: row.date })} />
                        ) : null}
                        {group === 'excused' ? (
                          <IconAction icon="undo" label={t('admin.attendance.actions.removeExcuse')} onClick={() => void removeExcuse(row)} disabled={busy} danger />
                        ) : null}
                        {row.attendanceId && row.checkIn ? (
                          <IconAction
                            icon="edit_calendar"
                            label={t('attendance.correct.action')}
                            disabled={busy}
                            onClick={() => setCorrecting({ attendanceId: row.attendanceId!, date: row.date, childName: name, checkIn: row.checkIn, checkOut: row.checkOut })}
                          />
                        ) : null}
                        {row.attendanceId && row.extraFee > 0 && !row.lateChargeWaived ? (
                          <IconAction
                            icon="money_off"
                            label={t('attendance.waive.action')}
                            disabled={busy}
                            onClick={() => setWaiving({ attendanceId: row.attendanceId!, childName: name, date: row.date, fee: row.extraFee })}
                          />
                        ) : null}
                        {row.needsReview && row.attendanceId ? (
                          <IconAction icon="task_alt" label={t('admin.attendance.actions.resolveReview')} onClick={() => void resolveNow(row)} disabled={busy} />
                        ) : null}
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
          <TablePagination pager={pager} pageSizeOptions={[10, 20, 50]} />
        </div>
      )}

      {!showSkeleton && nurseryId && !listQuery.isError && !isOffDay && totalCount > 0 ? (
        <AttendanceDayCharts
          rows={(listQuery.data ?? []).map((row) => ({ classId: row.child.class_id ?? null, status: row.status, checkIn: row.checkIn }))}
          timezone={typeof settings?.timezone === 'string' ? settings.timezone : 'Africa/Cairo'}
          classNameById={classNameById}
        />
      ) : null}

      <CorrectAttendanceDialog
        key={correcting?.attendanceId ?? 'none'}
        target={correcting}
        onClose={() => setCorrecting(null)}
        onDone={() => {
          setCorrecting(null);
          void refresh();
        }}
      />
      <WaiveChargeDialog
        key={waiving?.attendanceId ?? 'none-waive'}
        target={waiving}
        onClose={() => setWaiving(null)}
        onDone={() => {
          setWaiving(null);
          void refresh();
        }}
      />
      <ExcuseAbsenceDialog
        key={excusing ? `${excusing.childId}-${excusing.date}` : 'none-excuse'}
        target={excusing}
        nurseryId={nurseryId ?? null}
        onClose={() => setExcusing(null)}
        onDone={() => {
          setExcusing(null);
          void refresh();
        }}
      />
    </div>
  );
}
