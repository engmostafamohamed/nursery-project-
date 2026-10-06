import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { useAttendanceKpis } from '@/hooks/useAttendanceKpis';
import { cn } from '@/lib/utils';

function Tile({ icon, label, value, tone = 'primary', hint }: { icon: string; label: string; value: string | number; tone?: 'primary' | 'success' | 'warning' | 'error'; hint?: string }) {
  const toneClass = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    error: 'bg-error/10 text-error',
  }[tone];
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
      <div className="flex items-center gap-2">
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', toneClass)}>
          <MaterialSymbol name={icon} size="text-lg" />
        </span>
        <span className="text-xs font-medium text-on-surface-variant">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-on-surface">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-on-surface-variant">{hint}</p> : null}
    </div>
  );
}

/** Today's live attendance and this month's attendance + extra-hours money, from get_attendance_kpis. */
export function AttendanceKpiPanel({ nurseryId }: { nurseryId: string | null | undefined }) {
  const { t, i18n } = useTranslation();
  const { data, isPending } = useAttendanceKpis(nurseryId);

  if (isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((k) => <Skeleton key={k} className="h-24 rounded-xl" />)}
      </div>
    );
  }
  if (!data) return null;
  const { today, month } = data;
  const money = (n: number) => Number(n ?? 0).toFixed(2);

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-on-surface">{t('attendance.kpis.today')}</h2>
        {!today.is_school_day ? (
          <p className="text-xs text-on-surface-variant">{t('attendance.offDayDescription')}</p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tile icon="groups" label={t('attendance.kpis.inNursery')} value={today.in_nursery} hint={t('attendance.kpis.ofActive', { count: today.active_children })} />
          <Tile icon="logout" label={t('attendance.kpis.checkedOut')} value={today.checked_out} tone="success" />
          <Tile icon="event_busy" label={t('attendance.kpis.absent')} value={today.absent} tone={today.absent > 0 ? 'error' : 'success'} />
          <Tile icon="sick" label={t('attendance.kpis.excused')} value={today.excused} tone="warning" />
          <Tile icon="schedule" label={t('attendance.kpis.lateNow')} value={today.late_now} tone={today.late_now > 0 ? 'error' : 'success'} />
          <Tile icon="more_time" label={t('attendance.kpis.extraToday')} value={today.extra_hours_today} hint={money(today.extra_fee_today)} tone="warning" />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-on-surface">
          {t('attendance.kpis.month', {
            month: new Date(`${month.month_start}T12:00:00`).toLocaleDateString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', { month: 'long', year: 'numeric' }),
          })}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tile icon="percent" label={t('attendance.kpis.rate')} value={`${month.attendance_rate}%`} tone={month.attendance_rate >= 80 ? 'success' : 'warning'} hint={t('attendance.kpis.childDays', { present: month.present_child_days, absent: month.absent_child_days })} />
          <Tile icon="schedule" label={t('attendance.kpis.latePickups')} value={month.late_pickups} tone="warning" hint={t('attendance.kpis.hoursHint', { hours: month.extra_hours, covered: month.extra_hours_covered })} />
          <Tile icon="payments" label={t('attendance.kpis.billed')} value={money(month.extra_fee_billed)} hint={t('attendance.kpis.billedHours', { hours: month.extra_hours_billed })} />
          <Tile icon="price_check" label={t('attendance.kpis.collected')} value={money(month.extra_fee_collected)} tone="success" />
          <Tile icon="receipt_long" label={t('attendance.kpis.outstanding')} value={money(month.extra_fee_outstanding)} tone={month.extra_fee_outstanding > 0 ? 'error' : 'success'} />
          <Link to="/admin/attendance/logs" className="block">
            <Tile icon="flag" label={t('attendance.kpis.needsReview')} value={month.needs_review} tone={month.needs_review > 0 ? 'error' : 'success'} hint={t('attendance.kpis.scans', { qr: month.qr_scans, manual: month.manual_entries })} />
          </Link>
        </div>
      </section>

      {data.top_late.length ? (
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
          <h2 className="mb-2 text-sm font-semibold text-on-surface">{t('attendance.kpis.topLate')}</h2>
          <ul className="divide-y divide-outline-variant text-sm">
            {data.top_late.map((row) => (
              <li key={row.child_id} className="flex items-center justify-between gap-2 py-2">
                <Link to={`/admin/attendance/child/${row.child_id}`} className="font-medium text-on-surface hover:text-primary">
                  {i18n.language === 'ar' ? row.full_name_ar || row.full_name_en : row.full_name_en || row.full_name_ar}
                </Link>
                <span className="text-xs text-on-surface-variant">
                  {t('attendance.kpis.topLateRow', { days: row.late_days, hours: row.extra_hours, fee: money(row.extra_fee) })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
