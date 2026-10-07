import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
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

function displayChildName(child: ChildRow, languagePref: NurseryLanguagePref): string {
  const ar = typeof child.full_name_ar === 'string' ? child.full_name_ar.trim() : '';
  const en = typeof child.full_name_en === 'string' ? child.full_name_en.trim() : '';
  if (languagePref === 'ar') return ar || en || '';
  if (languagePref === 'en') return en || ar || '';
  if (ar && en) return `${ar} / ${en}`;
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
    stillIn: usePagination(groups.stillIn, 5, resetKey),
    late: usePagination(groups.late, 5, resetKey),
    onTime: usePagination(groups.onTime, 5, resetKey),
    absent: usePagination(groups.absent, 5, resetKey),
    excused: usePagination(groups.excused, 5, resetKey),
  } as const;

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
    const initials = getUserInitials(name, null);
    const avatarUrl = row.child.avatar_url?.trim() || null;
    const inBy = staffName(row.checkedInBy, i18n.language);
    const outBy = staffName(row.checkedOutBy, i18n.language);
    return (
      <Link
        key={`${row.childId}-${row.date}`}
        to={`/admin/attendance/child/${row.childId}`}
        className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-sm text-on-surface transition-colors hover:bg-surface-container-low"
      >
        <Avatar className="h-10 w-10 shrink-0">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback className="bg-secondary-fixed text-xs text-primary">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 truncate font-medium text-on-surface">
            {name || '—'}
            {row.needsReview ? <Badge variant="warning" className="text-[10px]">{t('attendance.needsReview')}</Badge> : null}
          </p>
          {row.checkIn ? (
            <p className="mt-0.5 text-xs text-on-surface-variant">
              {t('admin.attendance.checkInColumn')}: {formatTime(row.checkIn)}
              {inBy ? ` (${inBy}${row.checkInMethod ? ` · ${t(`attendance.method.${row.checkInMethod}`)}` : ''})` : ''}
              {' · '}
              {t('admin.attendance.checkOutColumn')}: {formatTime(row.checkOut)}
              {outBy ? ` (${outBy}${row.checkOutMethod ? ` · ${t(`attendance.method.${row.checkOutMethod}`)}` : ''})` : ''}
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
          <div className="text-end text-xs">
            <p className="font-semibold text-error">
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

  const sections: { key: SectionKey; title: string; accent: string; footer?: string }[] = [
    {
      key: 'stillIn',
      title: t(isToday ? 'admin.attendance.sections.stillIn' : 'admin.attendance.sections.noCheckout'),
      accent: 'text-primary',
    },
    {
      key: 'late',
      title: t('admin.attendance.sections.late'),
      accent: 'text-error',
      footer: lateTotals.totalHours > 0
        ? t('admin.attendance.sections.lateTotals', { hours: lateTotals.totalHours, amount: lateTotals.totalFee.toFixed(2) })
        : undefined,
    },
    { key: 'onTime', title: t('admin.attendance.sections.onTime'), accent: 'text-success' },
    { key: 'absent', title: t('attendance.sections.absent'), accent: 'text-error' },
    { key: 'excused', title: t('attendance.sections.excused'), accent: 'text-on-surface-variant' },
  ];

  const totalCount = Object.values(groups).reduce((sum, rows) => sum + rows.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-on-surface">
            {isToday ? t('admin.attendance.title') : t('admin.attendance.titlePast')}
          </h1>
          {selectedClassId !== 'all' && classes && (
            <Badge variant="outline" className="mt-2 mb-2">
              {t('admin.attendance.classCapacity')}: {groups.stillIn.length} / {classes.find(c => c.id === selectedClassId)?.capacity ?? classes.find(c => c.id === selectedClassId)?.child_count ?? '—'}
            </Badge>
          )}
          <p className="mt-1 text-sm text-on-surface-variant">{t('admin.attendance.description')}</p>
          {settings?.standard_end_time ? (
            <p className="mt-1 text-xs text-on-surface-variant">
              {t('admin.attendance.windowSummary', {
                start: settings.standard_start_time ?? '—',
                end: settings.standard_end_time,
                grace: settings.late_pickup_grace_minutes ?? 0,
                fee:
                  typeof settings.late_pickup_fee_per_hour === 'string'
                    ? settings.late_pickup_fee_per_hour
                    : String(settings.late_pickup_fee_per_hour ?? 0),
              })}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin/attendance/logs"
            className="inline-flex items-center gap-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-medium text-primary hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-base" aria-hidden>receipt_long</span>
            {t('attendance.logs.open')}
          </Link>
          <Link
            to="/admin/attendance/dashboard"
            className="inline-flex items-center gap-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-medium text-primary hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-base" aria-hidden>monitoring</span>
            {t('admin.attendance.openDashboard')}
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSelectedDate((d) => addCalendarDaysYmd(d, -1))}
          aria-label={t('admin.attendance.previousDay')}
        >
          <span className="material-symbols-outlined text-base" aria-hidden>chevron_left</span>
        </Button>
        <Input
          type="date"
          value={selectedDate}
          max={today}
          onChange={(e) => setSelectedDate(e.target.value || today)}
          className="max-w-[180px]"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSelectedDate((d) => addCalendarDaysYmd(d, 1))}
          disabled={isToday}
          aria-label={t('admin.attendance.nextDay')}
        >
          <span className="material-symbols-outlined text-base" aria-hidden>chevron_right</span>
        </Button>
        {!isToday ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setSelectedDate(today)}>
            {t('admin.attendance.jumpToday')}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select
          value={selectedClassId}
          onChange={(e) => setSelectedClassId(e.target.value)}
          className="sm:max-w-xs"
        >
          <option value="all">{t('common.allClasses')}</option>
          {classes?.map((c) => (
            <option key={c.id} value={c.id}>
              {languagePref === 'ar'
                ? c.name_ar || c.name_en
                : languagePref === 'en'
                  ? c.name_en || c.name_ar
                  : c.name_en && c.name_ar
                    ? `${c.name_ar} / ${c.name_en}`
                    : c.name_ar || c.name_en}
            </option>
          ))}
        </Select>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('admin.attendance.searchPlaceholder')}
          className="sm:max-w-xs"
        />
      </div>

      {showSkeleton ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((k) => (
            <div
              key={k}
              className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3"
            >
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
        <div className="space-y-6">
          {sections.map((section) => {
            const rows = groups[section.key];
            const pager = pagers[section.key];
            return (
              <section key={section.key} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h2 className={`text-sm font-semibold ${section.accent}`}>{section.title}</h2>
                  <Badge className="text-[10px]">{rows.length}</Badge>
                </div>
                {rows.length === 0 ? (
                  <p className="text-xs text-on-surface-variant">{t('admin.attendance.sections.empty')}</p>
                ) : (
                  <>
                    <div className="space-y-2">{pager.pageItems.map(renderRow)}</div>
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
                  </>
                )}
                {section.footer ? <p className="text-xs font-medium text-error">{section.footer}</p> : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
