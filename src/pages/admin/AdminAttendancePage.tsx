import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterField } from '@/components/ui/FilterField';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/PageHeader';
import { TablePagination } from '@/components/ui/DataTable';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile, type StatTone } from '@/components/ui/StatTile';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryClasses } from '@/hooks/useClassStaff';
import { usePagination } from '@/hooks/usePagination';
import { useNurseryLanguagePref, type NurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useNurserySettings } from '@/hooks/useNurserySettings';
import { useUserProfile } from '@/hooks/useUserProfile';
import { fetchAttendanceDays, staffName, type AttendanceDay } from '@/lib/attendanceApi';
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
  const { user } = useAuthSession();
  const { data: profile, isPending: profilePending } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id;
  const { data: languagePref = 'both' } = useNurseryLanguagePref(nurseryId);
  const { settings } = useNurserySettings(nurseryId);
  const { data: classes } = useNurseryClasses(nurseryId);
  const today = getNurseryCalendarDateString();
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [search, setSearch] = useState('');
  /** One group picked from the summary tiles, or every group that has children. */
  const [focus, setFocus] = useState<SectionKey | 'all'>('all');
  const isToday = selectedDate === today;

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

  const resetKey = `${selectedDate}|${selectedClassId}|${search.trim().toLowerCase()}`;
  const pagers = {
    stillIn: usePagination(groups.stillIn, PAGE_SIZE, resetKey),
    late: usePagination(groups.late, PAGE_SIZE, resetKey),
    onTime: usePagination(groups.onTime, PAGE_SIZE, resetKey),
    absent: usePagination(groups.absent, PAGE_SIZE, resetKey),
    excused: usePagination(groups.excused, PAGE_SIZE, resetKey),
  } as const;

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

  const renderRow = (row: DayWithChild) => {
    const name = displayChildName(row.child, languagePref);
    // Initials from one name in the reader's language, not the combined "Arabic / English" line.
    const initialsName = i18n.language.startsWith('ar')
      ? row.child.full_name_ar?.trim() || row.child.full_name_en
      : row.child.full_name_en?.trim() || row.child.full_name_ar;
    const initials = getUserInitials(initialsName || name, null);
    const avatarUrl = row.child.avatar_url?.trim() || null;
    const inBy = staffName(row.checkedInBy, i18n.language);
    const outBy = staffName(row.checkedOutBy, i18n.language);
    const className = row.child.class_id ? classNameById.get(row.child.class_id) : undefined;
    return (
      <Link
        key={`${row.childId}-${row.date}`}
        to={`/admin/attendance/child/${row.childId}`}
        className="flex items-center gap-3 px-4 py-3 text-sm text-on-surface outline-none transition-colors hover:bg-surface-container-lowest focus-visible:bg-surface-container-lowest sm:px-5"
      >
        <Avatar className="h-10 w-10 shrink-0">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-on-surface">
            <span className="min-w-0 truncate">{name || '—'}</span>
            {row.needsReview ? <Badge variant="warning" className="text-[10px]">{t('attendance.needsReview')}</Badge> : null}
          </p>
          {className && selectedClassId === 'all' ? (
            <p className="truncate text-xs text-on-surface-variant">{className}</p>
          ) : null}
          {row.checkIn ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant">
              <span className="inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-success" aria-hidden>login</span>
                <span className="font-medium text-on-surface">{formatTime(row.checkIn)}</span>
                {inBy ? `· ${inBy}${row.checkInMethod ? ` · ${t(`attendance.method.${row.checkInMethod}`)}` : ''}` : ''}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-primary" aria-hidden>logout</span>
                <span className="font-medium text-on-surface">{formatTime(row.checkOut)}</span>
                {outBy ? `· ${outBy}${row.checkOutMethod ? ` · ${t(`attendance.method.${row.checkOutMethod}`)}` : ''}` : ''}
              </span>
            </p>
          ) : row.status === 'excused' && row.absenceReason ? (
            <p className="mt-0.5 text-xs text-on-surface-variant">
              {t(`attendance.absence.reasons.${row.absenceReason}`)}{row.absenceNote ? ` · ${row.absenceNote}` : ''}
            </p>
          ) : null}
          {row.pickupPersonName ? (
            <p className="text-xs text-on-surface-variant">
              {t('attendance.pickedUpBy', { name: row.pickupPersonName })}
              {row.pickupRelationship ? ` (${row.pickupRelationship})` : ''}
            </p>
          ) : null}
        </div>
        {row.extraHours > 0 ? (
          <div className="shrink-0 rounded-lg bg-warning/10 px-2.5 py-1.5 text-end text-xs">
            <p className="font-semibold text-warning">
              {t('admin.attendance.extraHoursValue', { count: row.extraHours })}
            </p>
            <p className="text-on-surface-variant">
              {row.lateChargeWaived
                ? t('attendance.waived')
                : t('admin.attendance.extraFeeValue', { amount: row.extraFee.toFixed(2) })}
              {row.lateChargeStatus === 'provisional' ? ` · ${t('attendance.provisional')}` : ''}
            </p>
          </div>
        ) : null}
      </Link>
    );
  };

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
  // A focused group stays visible even when empty; otherwise empty groups are left out.
  const visibleSections = sections.filter((section) => (focus === 'all' ? groups[section.key].length > 0 : section.key === focus));
  const selectedClass = selectedClassId !== 'all' ? classes?.find((c) => c.id === selectedClassId) : undefined;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        icon="how_to_reg"
        title={isToday ? t('admin.attendance.title') : t('admin.attendance.titlePast')}
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
        <div className="space-y-5">
          {visibleSections.map((section) => {
            const rows = groups[section.key];
            const pager = pagers[section.key];
            return (
              <section key={section.key} className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant bg-surface-container-lowest px-4 py-3 sm:px-5">
                  <h2 className="flex items-center gap-2 text-base font-semibold text-on-surface">
                    <span className={`h-2.5 w-2.5 rounded-full ${SECTION_TONE[section.key].dot}`} aria-hidden />
                    {section.title}
                    <span className="rounded-full bg-surface-high px-2 py-0.5 text-xs font-semibold tabular-nums text-on-surface-variant">{rows.length}</span>
                  </h2>
                  {section.footer ? <p className="text-xs font-semibold text-warning">{section.footer}</p> : null}
                </div>
                {rows.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-on-surface-variant sm:px-5">{t('admin.attendance.sections.empty')}</p>
                ) : (
                  <>
                    <div className="divide-y divide-outline-variant">{pager.pageItems.map(renderRow)}</div>
                    <TablePagination pager={pager} />
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
