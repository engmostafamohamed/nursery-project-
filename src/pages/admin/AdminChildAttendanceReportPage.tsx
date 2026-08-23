import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { useChildAttendanceHistory } from '@/hooks/useChildAttendanceHistory';
import { useAuthSession } from '@/hooks/useAuthSession';
import { averageMinutesToTimeLabel } from '@/lib/attendanceAnalytics';
import { useUserProfile } from '@/hooks/useUserProfile';
import { getUserInitials } from '@/lib/utils';

export function AdminChildAttendanceReportPage() {
  const { childId } = useParams();
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';

  const report = useChildAttendanceHistory({
    childId: childId ?? undefined,
    nurseryId: profile?.nursery_id ?? undefined,
  });

  const child = report.child as {
    full_name_ar: string;
    full_name_en: string;
    avatar_url: string | null;
  } | null;

  const displayName = useMemo(() => {
    if (!child) return '';
    if (i18n.language === 'ar') return child.full_name_ar?.trim() || child.full_name_en || '';
    return child.full_name_en?.trim() || child.full_name_ar || '';
  }, [child, i18n.language]);

  const formatTime = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const avgIn = averageMinutesToTimeLabel(report.summary.avgCheckInMinutes, i18n.language);

  if (report.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!childId || !report.child) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-on-surface-variant">{t('admin.childAttendanceReport.notFound')}</p>
        <Button asChild variant="outline">
          <Link to="/admin/children">{t('admin.childAttendanceReport.backChildren')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link to="/admin/attendance/dashboard">
            <MaterialSymbol name="arrow_back" size="text-lg" />
            {t('admin.childAttendanceReport.backDashboard')}
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <Avatar className="h-16 w-16">
          {child?.avatar_url ? <AvatarImage src={child.avatar_url} alt="" /> : null}
          <AvatarFallback className="bg-secondary-fixed text-lg text-primary">{getUserInitials(displayName, null)}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-lg font-semibold text-on-surface">{displayName}</h1>
          <p className="text-sm text-on-surface-variant">{t('admin.childAttendanceReport.subtitle')}</p>
        </div>
        <Button asChild variant="outline" className="ms-auto">
          <Link to={`/admin/children/${childId}`}>{t('admin.childAttendanceReport.openProfile')}</Link>
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-on-surface-variant">
            <MaterialSymbol name="percent" size="text-lg" />
            {t('admin.childAttendanceReport.rate')}
          </p>
          <p className="mt-1 text-2xl font-semibold text-on-surface">{report.summary.ratePct}%</p>
          <p className="text-xs text-on-surface-variant">
            {t('admin.childAttendanceReport.rateHint', {
              present: report.summary.presentDays,
              total: report.summary.schoolDaysCount,
            })}
          </p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-on-surface-variant">
            <MaterialSymbol name="schedule" size="text-lg" />
            {t('admin.childAttendanceReport.avgCheckIn')}
          </p>
          <p className="mt-1 text-2xl font-semibold text-on-surface">{avgIn}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-outline-variant">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="border-b border-outline-variant bg-surface-container-lowest text-start text-xs text-on-surface-variant">
            <tr>
              <th className="px-3 py-2 text-start font-medium">{t('admin.childAttendanceReport.colDate')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('admin.childAttendanceReport.colCheckIn')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('admin.childAttendanceReport.colCheckOut')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('admin.childAttendanceReport.colStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.date} className="border-b border-outline-variant/60">
                <td className="px-3 py-2 text-on-surface">
                  {new Date(row.date + 'T12:00:00').toLocaleDateString(locale)}
                </td>
                <td className="px-3 py-2">{formatTime(row.checkIn)}</td>
                <td className="px-3 py-2">{formatTime(row.checkOut)}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-surface-container px-2 py-0.5 text-xs">
                    {t(`admin.childAttendanceReport.status.${row.status}`)}
                  </span>
                  {row.latePickup ? (
                    <span className="ms-2 text-xs text-on-surface-variant">({t('admin.childAttendanceReport.latePickup')})</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
