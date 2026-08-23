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
import { computeLatePickup } from '@/lib/teacherAttendanceToggle';
import { addCalendarDaysYmd, getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { supabase } from '@/lib/supabase';
import { getUserInitials } from '@/lib/utils';

type ChildRow = {
  id: string;
  avatar_url: string | null;
  full_name_ar: string;
  full_name_en: string;
  class_id?: string | null;
  enrollment_extended_json?: Record<string, unknown> | null;
};

type AttendanceRow = {
  id: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  extra_hours: string | number | null;
  qr_scan_log: Record<string, unknown> | null;
  child_id: string;
};

type AttendanceWithChild = AttendanceRow & { child: ChildRow | null };

function displayChildName(child: ChildRow, languagePref: NurseryLanguagePref): string {
  const ar = typeof child.full_name_ar === 'string' ? child.full_name_ar.trim() : '';
  const en = typeof child.full_name_en === 'string' ? child.full_name_en.trim() : '';
  if (languagePref === 'ar') return ar || en || '';
  if (languagePref === 'en') return en || ar || '';
  if (ar && en) return `${ar} / ${en}`;
  return ar || en || '';
}

function readExtraHours(row: AttendanceRow): number {
  if (row.extra_hours == null) return 0;
  const n = typeof row.extra_hours === 'string' ? Number(row.extra_hours) : row.extra_hours;
  return Number.isFinite(n) ? n : 0;
}

function readScanLogFee(row: AttendanceRow): number {
  const log = row.qr_scan_log;
  if (!log || typeof log !== 'object') return 0;
  const fee = (log as Record<string, unknown>).extra_fee;
  if (typeof fee === 'number' && Number.isFinite(fee)) return fee;
  if (typeof fee === 'string') {
    const n = Number(fee);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
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
    queryFn: async (): Promise<AttendanceWithChild[]> => {
      if (!nurseryId) return [];

      // Children in this nursery (so attendance rows from other nurseries are filtered).
      let childQuery = supabase
        .from('children')
        .select('id, avatar_url, full_name_ar, full_name_en, class_id, enrollment_extended_json')
        .eq('nursery_id', nurseryId)
        .eq('status', 'active');

      if (selectedClassId !== 'all') {
        childQuery = childQuery.eq('class_id', selectedClassId);
      }

      const { data: childRows, error: childErr } = await childQuery;
      if (childErr) throw childErr;
      const children = (childRows ?? []) as ChildRow[];
      if (!children.length) return [];

      const childById = new Map(children.map((c) => [c.id, c]));

      const { data: attRows, error: attErr } = await supabase
        .from('attendance_records')
        .select('id, attendance_date, check_in, check_out, extra_hours, qr_scan_log, child_id')
        .eq('attendance_date', selectedDate)
        .in('child_id', children.map((c) => c.id))
        .not('check_in', 'is', null);
      if (attErr) throw attErr;
      const attendance = (attRows ?? []) as AttendanceRow[];

      return attendance.map((row) => ({ ...row, child: childById.get(row.child_id) ?? null }));
    },
    enabled: Boolean(nurseryId),
  });

  // Active package coverage per child (display-only estimate; the real
  // deduction happens atomically at checkout via the RPC).
  const packageCoverageQuery = useQuery({
    queryKey: ['admin-attendance-package-coverage', nurseryId],
    queryFn: async (): Promise<
      Map<string, { coverage_type: string; included_hours: number | null; hours_used: number }>
    > => {
      const map = new Map<
        string,
        { coverage_type: string; included_hours: number | null; hours_used: number }
      >();
      if (!nurseryId) return map;
      const { data, error } = await supabase
        .from('child_packages')
        .select('child_id, hours_used, packages (coverage_type, included_hours, active)')
        .eq('nursery_id', nurseryId)
        .eq('status', 'active');
      if (error) return map;
      type Row = {
        child_id: string;
        hours_used: number;
        packages:
          | { coverage_type: string; included_hours: number | null; active: boolean }
          | { coverage_type: string; included_hours: number | null; active: boolean }[]
          | null;
      };
      for (const r of (data ?? []) as Row[]) {
        const pkg = Array.isArray(r.packages) ? r.packages[0] : r.packages;
        if (!pkg || !pkg.active) continue;
        map.set(r.child_id, {
          coverage_type: pkg.coverage_type,
          included_hours: pkg.included_hours,
          hours_used: r.hours_used,
        });
      }
      return map;
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

  // Bucket rows into the three groups. For rows that already carry extra_hours
  // (post-checkout), trust the stored value. For rows still checked-in we
  // compute a "current" estimate for live display only.
  const groups = useMemo(() => {
    const onTime: AttendanceWithChild[] = [];
    const late: AttendanceWithChild[] = [];
    const stillIn: AttendanceWithChild[] = [];
    const allRows = listQuery.data ?? [];
    const q = search.trim().toLowerCase();
    const rows = q
      ? allRows.filter((row) =>
          row.child ? displayChildName(row.child, languagePref).toLowerCase().includes(q) : false,
        )
      : allRows;
    for (const row of rows) {
      if (row.check_out) {
        const stored = readExtraHours(row);
        const log = row.qr_scan_log as Record<string, unknown> | null;
        const flagged = log?.late_pickup === true;
        if (stored > 0 || flagged) late.push(row);
        else onTime.push(row);
      } else {
        stillIn.push(row);
      }
    }
    return { onTime, late, stillIn };
  }, [listQuery.data, search, languagePref]);

  const resetKey = `${selectedDate}|${selectedClassId}|${search.trim().toLowerCase()}`;
  const onTimePager = usePagination(groups.onTime, 5, resetKey);
  const latePager = usePagination(groups.late, 5, resetKey);
  const stillInPager = usePagination(groups.stillIn, 5, resetKey);
  const pagerByKey = {
    onTime: onTimePager,
    late: latePager,
    stillIn: stillInPager,
  } as const;

  const lateTotals = useMemo(() => {
    let totalHours = 0;
    let totalFee = 0;
    for (const row of groups.late) {
      totalHours += readExtraHours(row);
      totalFee += readScanLogFee(row);
    }
    return { totalHours, totalFee };
  }, [groups.late]);

  // Live "would be charged" estimate for children still in the nursery — only
  // makes sense for today; for past days, trust the stored values.
  const liveLate = useMemo(() => {
    if (!isToday) return new Map<string, { extraHours: number; extraFee: number }>();
    if (!settings?.standard_end_time) return new Map<string, { extraHours: number; extraFee: number }>();
    const window = {
      endTime: settings.standard_end_time,
      graceMinutes: settings.late_pickup_grace_minutes ?? 0,
      feePerHour:
        typeof settings.late_pickup_fee_per_hour === 'string'
          ? Number(settings.late_pickup_fee_per_hour) || 0
          : settings.late_pickup_fee_per_hour ?? 0,
    };
    const now = new Date();
    const coverageMap = packageCoverageQuery.data;
    const out = new Map<string, { extraHours: number; extraFee: number }>();
    for (const row of groups.stillIn) {
      const billing = computeLatePickup(now, row.attendance_date, window);
      if (billing.latePickup) {
        let covered = 0;
        const cov = coverageMap?.get(row.child_id);
        if (cov) {
          covered =
            cov.coverage_type === 'unlimited'
              ? billing.extraHours
              : Math.min(
                  billing.extraHours,
                  Math.max((cov.included_hours ?? 0) - cov.hours_used, 0),
                );
        }
        // Legacy fallback: pre-package children flagged via enrollment JSON.
        if (covered <= 0) {
          const extendedJson = row.child?.enrollment_extended_json as Record<
            string,
            unknown
          > | null;
          if (extendedJson?.has_prepaid_extra_hours === true) covered = billing.extraHours;
        }
        const chargeableHours = Math.max(0, billing.extraHours - covered);
        billing.extraFee = Number((chargeableHours * window.feePerHour).toFixed(2));
        out.set(row.id, { extraHours: billing.extraHours, extraFee: billing.extraFee });
      }
    }
    return out;
  }, [groups.stillIn, settings, isToday, packageCoverageQuery.data]);

  const showSkeleton = profilePending || listQuery.isPending;

  const renderRow = (row: AttendanceWithChild, opts?: { extraHours?: number; extraFee?: number }) => {
    const child = row.child;
    const name = child ? displayChildName(child, languagePref) : '';
    const initials = getUserInitials(name, null);
    const avatarUrl = child?.avatar_url?.trim() || null;
    const childId = child?.id ?? row.child_id;
    const extraHours = opts?.extraHours ?? readExtraHours(row);
    const extraFee = opts?.extraFee ?? readScanLogFee(row);
    return (
      <Link
        key={row.id}
        to={`/admin/attendance/child/${childId}`}
        className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-sm text-on-surface transition-colors hover:bg-surface-container-low"
      >
        <Avatar className="h-10 w-10 shrink-0">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback className="bg-secondary-fixed text-xs text-primary">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-on-surface">{name || '—'}</p>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            {t('admin.attendance.checkInColumn')}: {formatTime(row.check_in)}
            {' · '}
            {t('admin.attendance.checkOutColumn')}: {formatTime(row.check_out)}
          </p>
        </div>
        {extraHours > 0 ? (
          <div className="text-end text-xs">
            <p className="font-semibold text-error">
              {t('admin.attendance.extraHoursValue', { count: extraHours })}
            </p>
            <p className="text-on-surface-variant">
              {t('admin.attendance.extraFeeValue', { amount: extraFee.toFixed(2) })}
            </p>
          </div>
        ) : null}
      </Link>
    );
  };

  const sections: {
    key: 'onTime' | 'late' | 'stillIn';
    title: string;
    rows: AttendanceWithChild[];
    badge?: string;
    accent?: string;
    footer?: string;
  }[] = [
    {
      key: 'onTime',
      title: t('admin.attendance.sections.onTime'),
      rows: groups.onTime,
      accent: 'text-success',
    },
    {
      key: 'late',
      title: t('admin.attendance.sections.late'),
      rows: groups.late,
      accent: 'text-error',
      footer:
        groups.late.length > 0
          ? t('admin.attendance.sections.lateTotals', {
              hours: lateTotals.totalHours,
              amount: lateTotals.totalFee.toFixed(2),
            })
          : undefined,
    },
    {
      key: 'stillIn',
      title: t(isToday ? 'admin.attendance.sections.stillIn' : 'admin.attendance.sections.noCheckout'),
      rows: groups.stillIn,
      accent: 'text-primary',
    },
  ];

  const totalCount = groups.onTime.length + groups.late.length + groups.stillIn.length;

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
                    : (settings.late_pickup_fee_per_hour ?? 0).toString(),
              })}
            </p>
          ) : null}
        </div>
        <Link
          to="/admin/attendance/dashboard"
          className="inline-flex items-center gap-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-medium text-primary hover:bg-surface-container"
        >
          <span className="material-symbols-outlined text-base" aria-hidden>
            monitoring
          </span>
          {t('admin.attendance.openDashboard')}
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSelectedDate((d) => addCalendarDaysYmd(d, -1))}
          aria-label={t('admin.attendance.previousDay')}
        >
          <span className="material-symbols-outlined text-base" aria-hidden>
            chevron_left
          </span>
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
          <span className="material-symbols-outlined text-base" aria-hidden>
            chevron_right
          </span>
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
      ) : totalCount === 0 && search.trim() ? (
        <EmptyState
          icon="search_off"
          title={t('admin.attendance.noSearchResults')}
          description=""
        />
      ) : totalCount === 0 ? (
        <EmptyState
          icon="how_to_reg"
          title={t('admin.attendance.emptyTitle')}
          description={t('admin.attendance.emptyDescription')}
        />
      ) : (
        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.key} className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className={`text-sm font-semibold ${section.accent ?? ''}`}>{section.title}</h2>
                <Badge className="text-[10px]">{section.rows.length}</Badge>
              </div>
              {section.rows.length === 0 ? (
                <p className="text-xs text-on-surface-variant">
                  {t('admin.attendance.sections.empty')}
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    {pagerByKey[section.key].pageItems.map((row) => {
                      if (section.key === 'stillIn') {
                        const live = liveLate.get(row.id);
                        return renderRow(row, live ? { extraHours: live.extraHours, extraFee: live.extraFee } : undefined);
                      }
                      return renderRow(row);
                    })}
                  </div>
                  <Pagination
                    page={pagerByKey[section.key].page}
                    pageCount={pagerByKey[section.key].pageCount}
                    total={pagerByKey[section.key].total}
                    startIndex={pagerByKey[section.key].startIndex}
                    endIndex={pagerByKey[section.key].endIndex}
                    hasPrev={pagerByKey[section.key].hasPrev}
                    hasNext={pagerByKey[section.key].hasNext}
                    onPrev={pagerByKey[section.key].prev}
                    onNext={pagerByKey[section.key].next}
                  />
                </>
              )}
              {section.footer ? (
                <p className="text-xs font-medium text-error">{section.footer}</p>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
