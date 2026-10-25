import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { AttendanceKpiDetails } from '@/components/admin/attendance/AttendanceKpiDetails';
import { PeriodFilter } from '@/components/admin/PeriodFilter';
import { Button } from '@/components/ui/button';
import { StatusPill, TableCard } from '@/components/ui/DataTable';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { useAttendanceKpis, useAttendancePeriodKpis, type Kpis, type PeriodKpis, type TopLateRow } from '@/hooks/useAttendanceKpis';
import { usePeriodState } from '@/hooks/usePeriodState';
import { toLocalDateString } from '@/lib/attendanceAnalytics';
import { childRecordLink, keepTile, PERIOD_TILES, TODAY_TILES, type KpiTile, type PeriodTile, type TodayTile } from '@/lib/attendanceKpiDetails';
import { KPI_PERIODS, rangeLabel } from '@/lib/attendancePeriods';
import { formatMoneyAmount } from '@/lib/money';
import { cn } from '@/lib/utils';

/** Seven tiles fit a row from xl up once the icon sits above the text. */
const TILE = 'xl:flex-col xl:items-start xl:gap-2';
const GRID = 'grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-4 xl:grid-cols-7';

type TileProps = { selected: KpiTile | null; onSelect: (tile: KpiTile) => void };

/**
 * Attendance and extra hours in one card: today's live numbers, or a month, quarter, half year or
 * year (stepping back from the current one), or dates the admin picks. Each number opens the list
 * behind it, for the same days; a child in a list opens their record.
 */
export function AttendanceKpiPanel({ nurseryId, basePath = '/admin' }: { nurseryId: string | null | undefined; basePath?: string }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';
  const [selected, setSelected] = useState<KpiTile | null>(null);

  const live = useAttendanceKpis(nurseryId);
  // The nursery's own today once the server has said it; the device's until then.
  const today = live.data?.today.date ?? toLocalDateString(new Date());
  const period = usePeriodState('today', today);
  const { range } = period;
  const stats = useAttendancePeriodKpis(nurseryId, range);

  const selectTile = (tile: KpiTile) => setSelected((current) => (current === tile ? null : tile));
  // From the days list: who attended on that day.
  const openDay = (day: string) => {
    period.openDay(day);
    setSelected('attended');
  };

  const shownDays = period.shown;
  const isToday = period.choice === 'today';
  const daysValid = shownDays !== null && shownDays.from <= shownDays.to;


  return (
    <TableCard
      title={t('attendance.kpis.title')}
      count={daysValid ? rangeLabel(shownDays, locale) : undefined}
      description={isToday && live.data && !live.data.today.is_school_day ? t('attendance.offDayDescription') : undefined}
      actions={
        isToday && live.data ? (
          live.data.today.is_school_day ? (
            <StatusPill tone="success" icon="radio_button_checked">{t('attendance.kpis.live')}</StatusPill>
          ) : (
            <StatusPill tone="neutral" icon="weekend">{t('attendance.offDayTitle')}</StatusPill>
          )
        ) : null
      }
      filters={
        <PeriodFilter
          state={period}
          choices={KPI_PERIODS}
          onChoose={(next) => setSelected((tile) => keepTile(tile, next === 'today' ? TODAY_TILES : PERIOD_TILES))}
        />
      }
    >
      {isToday ? (
        <TodayTiles live={live} extraChildren={stats.data && !stats.isPlaceholderData ? stats.data.extra_hours_children : null} selected={selected} onSelect={selectTile} />
      ) : !range ? (
        <p className="px-4 py-6 text-sm text-on-surface-variant sm:px-5">{t('periodFilter.chooseDates')}</p>
      ) : (
        <PeriodTiles stats={stats} selected={selected} onSelect={selectTile} />
      )}

      {selected && nurseryId && daysValid ? (
        <AttendanceKpiDetails
          key={`${selected}|${shownDays.from}|${shownDays.to}`}
          nurseryId={nurseryId}
          tile={selected}
          mode={isToday ? 'today' : 'period'}
          range={shownDays}
          basePath={basePath}
          title={tileLabel(t, selected, isToday)}
          onClose={() => setSelected(null)}
          onOpenDay={openDay}
        />
      ) : range ? (
        <>
          <p className="flex items-center gap-1.5 px-4 pb-4 text-xs text-on-surface-variant sm:px-5">
            <span className="material-symbols-outlined text-sm" aria-hidden>touch_app</span>
            {t('attendance.kpis.details.hint')}
          </p>
          {daysValid && stats.data && !stats.isPlaceholderData && stats.data.top_late.length ? (
            <TopLate
              rows={stats.data.top_late}
              title={isToday ? t('attendance.kpis.topLateToday') : t('attendance.kpis.topLatePeriod')}
              linkTo={(childId) => childRecordLink(basePath, childId, shownDays)}
            />
          ) : null}
        </>
      ) : null}
    </TableCard>
  );
}

type T = ReturnType<typeof useTranslation>['t'];

/** The number's name, which is also the title of its list. */
function tileLabel(t: T, tile: KpiTile, today: boolean): string {
  switch (tile) {
    case 'attended':
      return today ? t('attendance.kpis.attendedToday') : t('attendance.kpis.attendedDays');
    case 'in_nursery':
      return t('attendance.kpis.inNursery');
    case 'picked_up':
      return t('attendance.kpis.checkedOut');
    case 'absent':
      return t('attendance.kpis.absent');
    case 'excused':
      return t('attendance.kpis.excused');
    case 'late_now':
      return t('attendance.kpis.inExtraNow');
    case 'extra_today':
      return t('attendance.kpis.extraToday');
    case 'rate':
      return t('attendance.kpis.rate');
    case 'late':
      return t('attendance.kpis.extraChildren');
    case 'billed':
      return t('attendance.kpis.billed');
    case 'collected':
      return t('attendance.kpis.collected');
    case 'outstanding':
      return t('attendance.kpis.outstanding');
    case 'review':
      return t('attendance.kpis.needsReview');
  }
}

function TileSkeletons() {
  return (
    <div className={GRID}>
      {[1, 2, 3, 4, 5, 6, 7].map((k) => <Skeleton key={k} className="h-24 rounded-xl" />)}
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="m-4 flex flex-wrap items-center gap-3 rounded-xl border border-error/30 bg-error/5 p-3 text-sm text-error sm:m-5" role="alert">
      <span className="material-symbols-outlined text-xl" aria-hidden>error</span>
      <span className="flex-1">{t('attendance.loadErrorTitle')}</span>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  );
}

function useMoney() {
  const { t } = useTranslation();
  return (n: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(Number(n ?? 0)) });
}

/**
 * Who came today, who is here right now, who has gone home, who is missing, who is in extra hours
 * right now, and how many children took extra hours today.
 */
function TodayTiles({
  live,
  extraChildren,
  selected,
  onSelect,
}: TileProps & { live: { data?: Kpis; isPending: boolean; isError: boolean; refetch: () => unknown }; extraChildren: number | null }) {
  const { t } = useTranslation();
  const money = useMoney();
  if (live.isPending) return <TileSkeletons />;
  if (!live.data) return live.isError ? <LoadError onRetry={() => void live.refetch()} /> : null;
  const today = live.data.today;
  const pick = (tile: TodayTile) => ({ className: TILE, onClick: () => onSelect(tile), active: selected === tile });
  return (
    <div className={GRID}>
      <StatTile {...pick('attended')} icon="how_to_reg" label={t('attendance.kpis.attendedToday')} value={today.checked_in_total} tone="primary" helper={t('attendance.kpis.ofActive', { count: today.active_children })} />
      <StatTile {...pick('in_nursery')} icon="groups" label={t('attendance.kpis.inNursery')} value={today.in_nursery} />
      <StatTile {...pick('picked_up')} icon="logout" label={t('attendance.kpis.checkedOut')} value={today.checked_out} tone="success" />
      <StatTile {...pick('absent')} icon="event_busy" label={t('attendance.kpis.absent')} value={today.absent} tone={today.absent > 0 ? 'error' : 'neutral'} />
      <StatTile {...pick('excused')} icon="sick" label={t('attendance.kpis.excused')} value={today.excused} tone={today.excused > 0 ? 'warning' : 'neutral'} />
      <StatTile
        {...pick('late_now')}
        icon="schedule"
        label={t('attendance.kpis.inExtraNow')}
        value={today.late_now}
        helper={t('attendance.kpis.inExtraNowHint')}
        tone={today.late_now > 0 ? 'error' : 'neutral'}
      />
      <StatTile
        {...pick('extra_today')}
        icon="more_time"
        label={t('attendance.kpis.extraToday')}
        value={extraChildren ?? '—'}
        helper={t('attendance.kpis.extraTodayHint', { hours: today.extra_hours_today, fee: money(today.extra_fee_today) })}
        tone={today.extra_hours_today > 0 ? 'warning' : 'neutral'}
      />
    </div>
  );
}

/** The period's attendance, the children who took extra hours and the money of those hours. */
function PeriodTiles({
  stats,
  selected,
  onSelect,
}: TileProps & { stats: { data?: PeriodKpis; isPending: boolean; isError: boolean; isPlaceholderData: boolean; refetch: () => unknown } }) {
  const { t } = useTranslation();
  const money = useMoney();
  if (stats.isPending) return <TileSkeletons />;
  if (!stats.data) return stats.isError ? <LoadError onRetry={() => void stats.refetch()} /> : null;
  const s = stats.data;
  const pick = (tile: PeriodTile) => ({ className: TILE, onClick: () => onSelect(tile), active: selected === tile });
  return (
    <div className={cn(GRID, 'transition-opacity', stats.isPlaceholderData && 'opacity-60')} aria-busy={stats.isPlaceholderData}>
      <StatTile
        {...pick('attended')}
        icon="how_to_reg"
        label={t('attendance.kpis.attendedDays')}
        value={s.present_child_days}
        helper={t('attendance.kpis.ofExpectedDays', { expected: s.expected_child_days })}
      />
      <StatTile
        {...pick('rate')}
        icon="percent"
        label={t('attendance.kpis.rate')}
        value={`${s.attendance_rate}%`}
        tone={s.attendance_rate >= 80 ? 'success' : 'warning'}
        helper={t('attendance.kpis.childDays', { present: s.present_child_days, absent: s.absent_child_days })}
      />
      <StatTile
        {...pick('late')}
        icon="more_time"
        label={t('attendance.kpis.extraChildren')}
        value={s.extra_hours_children}
        tone={s.extra_hours_children > 0 ? 'warning' : 'neutral'}
        helper={t('attendance.kpis.extraChildrenHint', { hours: s.extra_hours, days: s.extra_hours_days })}
      />
      <StatTile {...pick('billed')} icon="payments" label={t('attendance.kpis.billed')} value={money(s.extra_fee_billed)} helper={t('attendance.kpis.billedHours', { hours: s.extra_hours_billed })} />
      <StatTile {...pick('collected')} icon="price_check" label={t('attendance.kpis.collected')} value={money(s.extra_fee_collected)} tone="success" />
      <StatTile
        {...pick('outstanding')}
        icon="receipt_long"
        label={t('attendance.kpis.outstanding')}
        value={money(s.extra_fee_outstanding)}
        tone={s.extra_fee_outstanding > 0 ? 'error' : 'success'}
      />
      <StatTile
        {...pick('review')}
        icon="flag"
        label={t('attendance.kpis.needsReview')}
        value={s.needs_review}
        tone={s.needs_review > 0 ? 'error' : 'success'}
        helper={t('attendance.kpis.scans', { qr: s.qr_scans, manual: s.manual_entries })}
      />
    </div>
  );
}

function TopLate({ rows, title, linkTo }: { rows: TopLateRow[]; title: string; linkTo: (childId: string) => string }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="border-t border-outline-variant px-4 py-4 sm:px-5">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-on-surface">
        <span className="material-symbols-outlined text-base text-warning" aria-hidden>alarm</span>
        {title}
      </h3>
      <ol className="divide-y divide-outline-variant overflow-hidden rounded-lg border border-outline-variant">
        {rows.map((row, index) => (
          <li key={row.child_id}>
            <Link to={linkTo(row.child_id)} className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-surface-container-lowest">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning/10 text-xs font-bold tabular-nums text-warning">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-on-surface">
                {i18n.language === 'ar' ? row.full_name_ar || row.full_name_en : row.full_name_en || row.full_name_ar}
              </span>
              <span className="shrink-0 text-xs text-on-surface-variant">
                {t('attendance.kpis.topLateRow', { days: row.late_days, hours: row.extra_hours, fee: formatMoneyAmount(row.extra_fee) })}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
