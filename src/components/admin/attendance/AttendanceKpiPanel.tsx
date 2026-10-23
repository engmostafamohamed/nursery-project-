import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { StatusPill, TableCard } from '@/components/ui/DataTable';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { useAttendanceKpis } from '@/hooks/useAttendanceKpis';
import { formatMoneyAmount } from '@/lib/money';

/** Six tiles fit a row from xl up once the icon sits above the text. */
const TILE = 'xl:flex-col xl:items-start xl:gap-2';

/** Today's live attendance and this month's attendance + extra-hours money, from get_attendance_kpis. */
export function AttendanceKpiPanel({ nurseryId }: { nurseryId: string | null | undefined }) {
  const { t, i18n } = useTranslation();
  const { data, isPending } = useAttendanceKpis(nurseryId);
  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';

  if (isPending) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[1, 2, 3, 4, 5, 6].map((k) => <Skeleton key={k} className="h-24 rounded-xl" />)}
      </div>
    );
  }
  if (!data) return null;
  const { today, month } = data;
  const money = (n: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(Number(n ?? 0)) });
  const todayLabel = new Date(`${today.date}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const monthLabel = new Date(`${month.month_start}T12:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-5">
      <TableCard
        title={t('attendance.kpis.today')}
        count={todayLabel}
        description={today.is_school_day ? undefined : t('attendance.offDayDescription')}
        actions={
          today.is_school_day ? (
            <StatusPill tone="success" icon="radio_button_checked">{t('attendance.kpis.live')}</StatusPill>
          ) : (
            <StatusPill tone="neutral" icon="weekend">{t('attendance.offDayTitle')}</StatusPill>
          )
        }
      >
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5 xl:grid-cols-6">
          <StatTile className={TILE} icon="groups" label={t('attendance.kpis.inNursery')} value={today.in_nursery} helper={t('attendance.kpis.ofActive', { count: today.active_children })} />
          <StatTile className={TILE} icon="logout" label={t('attendance.kpis.checkedOut')} value={today.checked_out} tone="success" />
          <StatTile className={TILE} icon="event_busy" label={t('attendance.kpis.absent')} value={today.absent} tone={today.absent > 0 ? 'error' : 'neutral'} />
          <StatTile className={TILE} icon="sick" label={t('attendance.kpis.excused')} value={today.excused} tone={today.excused > 0 ? 'warning' : 'neutral'} />
          <StatTile className={TILE} icon="schedule" label={t('attendance.kpis.lateNow')} value={today.late_now} tone={today.late_now > 0 ? 'error' : 'neutral'} />
          <StatTile className={TILE}
            icon="more_time"
            label={t('attendance.kpis.extraToday')}
            value={today.extra_hours_today}
            helper={money(today.extra_fee_today)}
            tone={today.extra_hours_today > 0 ? 'warning' : 'neutral'}
          />
        </div>
      </TableCard>

      <TableCard title={t('attendance.kpis.month', { month: monthLabel })}>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5 xl:grid-cols-6">
          <StatTile className={TILE}
            icon="percent"
            label={t('attendance.kpis.rate')}
            value={`${month.attendance_rate}%`}
            tone={month.attendance_rate >= 80 ? 'success' : 'warning'}
            helper={t('attendance.kpis.childDays', { present: month.present_child_days, absent: month.absent_child_days })}
          />
          <StatTile className={TILE}
            icon="schedule"
            label={t('attendance.kpis.latePickups')}
            value={month.late_pickups}
            tone={month.late_pickups > 0 ? 'warning' : 'neutral'}
            helper={t('attendance.kpis.hoursHint', { hours: month.extra_hours, covered: month.extra_hours_covered })}
          />
          <StatTile className={TILE} icon="payments" label={t('attendance.kpis.billed')} value={money(month.extra_fee_billed)} helper={t('attendance.kpis.billedHours', { hours: month.extra_hours_billed })} />
          <StatTile className={TILE} icon="price_check" label={t('attendance.kpis.collected')} value={money(month.extra_fee_collected)} tone="success" />
          <StatTile className={TILE}
            icon="receipt_long"
            label={t('attendance.kpis.outstanding')}
            value={money(month.extra_fee_outstanding)}
            tone={month.extra_fee_outstanding > 0 ? 'error' : 'success'}
          />
          <StatTile className={TILE}
            icon="flag"
            label={t('attendance.kpis.needsReview')}
            value={month.needs_review}
            tone={month.needs_review > 0 ? 'error' : 'success'}
            helper={t('attendance.kpis.scans', { qr: month.qr_scans, manual: month.manual_entries })}
            to="/admin/attendance/logs"
          />
        </div>

        {data.top_late.length ? (
          <div className="border-t border-outline-variant px-4 py-4 sm:px-5">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-on-surface">
              <span className="material-symbols-outlined text-base text-warning" aria-hidden>alarm</span>
              {t('attendance.kpis.topLate')}
            </h3>
            <ol className="divide-y divide-outline-variant overflow-hidden rounded-lg border border-outline-variant">
              {data.top_late.map((row, index) => (
                <li key={row.child_id}>
                  <Link
                    to={`/admin/attendance/child/${row.child_id}`}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-surface-container-lowest"
                  >
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
        ) : null}
      </TableCard>
    </div>
  );
}
