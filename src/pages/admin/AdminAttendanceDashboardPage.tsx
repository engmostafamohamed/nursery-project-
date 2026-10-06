import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { AttendanceKpiPanel } from '@/components/admin/attendance/AttendanceKpiPanel';
import { AttendanceClassBars } from '@/components/admin/AttendanceClassBars';
import { AttendanceDailyBars } from '@/components/admin/AttendanceDailyBars';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAdminAttendanceAnalytics,
  type AttendanceDatePreset,
} from '@/hooks/useAdminAttendanceAnalytics';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';

export function AdminAttendanceDashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const [preset, setPreset] = useState<AttendanceDatePreset>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const customReady = preset !== 'custom' || (Boolean(customFrom) && Boolean(customTo));

  const analytics = useAdminAttendanceAnalytics({
    nurseryId: profile?.nursery_id ?? undefined,
    preset,
    customFrom: preset === 'custom' ? customFrom : undefined,
    customTo: preset === 'custom' ? customTo : undefined,
  });

  const { stats, range } = analytics;

  const classRows = useMemo(
    () =>
      [...stats.classStats].sort((a, b) => b.rate - a.rate).map((r) => ({
        ...r,
        name: r.name,
      })),
    [stats.classStats],
  );

  const exportCsv = () => {
    try {
      const header = ['date', 'present_count', 'absent_weekday', 'late_pickups'].join(',');
      const lines = stats.dailyPresent.map((d) => {
        const w = new Date(d.date + 'T12:00:00').getDay();
        const isWd = w !== 0 && w !== 6;
        const absent = isWd && stats.activeCount > 0 ? Math.max(0, stats.activeCount - d.count) : '';
        return [d.date, String(d.count), absent === '' ? '' : String(absent), String(d.late)].join(',');
      });
      const bom = '\uFEFF';
      const blob = new Blob([bom + [header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-${range.from}-${range.to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('admin.attendanceAnalytics.exportDone'));
    } catch {
      toast.error(t('admin.attendanceAnalytics.exportError'));
    }
  };

  const loading = customReady && analytics.isPending;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-on-surface">
          <MaterialSymbol name="monitoring" className="text-primary" size="text-2xl" />
          {t('admin.attendanceAnalytics.title')}
        </h1>
        <Button
          variant="outline"
          className="gap-1"
          type="button"
          onClick={exportCsv}
          disabled={!customReady || loading || !stats.dailyPresent.length}
        >
          <MaterialSymbol name="download" size="text-lg" />
          {t('admin.attendanceAnalytics.exportCsv')}
        </Button>
      </div>

      <AttendanceKpiPanel nurseryId={profile?.nursery_id} />

      <div className="flex flex-wrap gap-2">
        {(['week', 'month', 'custom'] as const).map((p) => (
          <Button key={p} type="button" variant={preset === p ? 'default' : 'outline'} size="sm" onClick={() => setPreset(p)}>
            {t(`admin.attendanceAnalytics.preset.${p}`)}
          </Button>
        ))}
      </div>

      {preset === 'custom' ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-on-surface-variant">{t('admin.attendanceAnalytics.from')}</label>
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-on-surface-variant">{t('admin.attendanceAnalytics.to')}</label>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        </div>
      ) : null}

      {!customReady ? (
        <p className="text-sm text-on-surface-variant">{t('admin.attendanceAnalytics.customHint')}</p>
      ) : (
        <p className="text-sm text-on-surface-variant">
          {t('admin.attendanceAnalytics.rangeLabel', { from: range.from, to: range.to })}
        </p>
      )}

      {customReady && loading ? (
        <div className="grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map((k) => (
            <Skeleton key={k} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : null}
      {customReady && !loading ? (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
            <div className="flex items-center gap-2 text-on-surface-variant">
              <MaterialSymbol name="percent" size="text-xl" />
              <span className="text-xs font-medium uppercase">{t('admin.attendanceAnalytics.avgRate')}</span>
            </div>
            <p className="mt-2 text-2xl font-semibold text-on-surface">{stats.avgRatePct}%</p>
            <p className="mt-1 text-xs text-on-surface-variant">{t('admin.attendanceAnalytics.avgRateHint')}</p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
            <div className="flex items-center gap-2 text-on-surface-variant">
              <MaterialSymbol name="person_off" size="text-xl" />
              <span className="text-xs font-medium uppercase">{t('admin.attendanceAnalytics.totalAbsences')}</span>
            </div>
            <p className="mt-2 text-2xl font-semibold text-on-surface">{stats.totalAbsences}</p>
            <p className="mt-1 text-xs text-on-surface-variant">{t('admin.attendanceAnalytics.absencesHint')}</p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
            <div className="flex items-center gap-2 text-on-surface-variant">
              <MaterialSymbol name="schedule" size="text-xl" />
              <span className="text-xs font-medium uppercase">{t('admin.attendanceAnalytics.latePickups')}</span>
            </div>
            <p className="mt-2 text-2xl font-semibold text-on-surface">{stats.latePickups}</p>
            <p className="mt-1 text-xs text-on-surface-variant">{t('admin.attendanceAnalytics.lateHint')}</p>
          </div>
        </div>
      ) : null}

      {customReady && !loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
            <AttendanceDailyBars days={stats.dailyPresent} maxCount={stats.maxDaily} activeChildren={stats.activeCount} />
          </div>
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
            <AttendanceClassBars rows={classRows} unassignedLabel={t('admin.attendanceAnalytics.unassignedClass')} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
