import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChildSelector, useParentChildren } from '@/components/parent/ChildSelector';
import { EmptyState } from '@/components/ui/EmptyState';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { useAllChildrenAttendanceSummary } from '@/hooks/useAllChildrenAttendanceSummary';
import { useChildAttendanceHistory } from '@/hooks/useChildAttendanceHistory';
import { useAuthSession } from '@/hooks/useAuthSession';
import { averageMinutesToTimeLabel } from '@/lib/attendanceAnalytics';
import { useUserProfile } from '@/hooks/useUserProfile';

export function ParentAttendanceHistoryPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const [childId, setChildId] = useState('');
  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';
  const nurseryId = profile?.nursery_id ?? undefined;

  const childrenQuery = useParentChildren();
  const children = childrenQuery.data ?? [];
  const isMultiChild = children.length > 1;

  useEffect(() => {
    if (children.length === 1 && !childId) {
      setChildId(children[0].id);
    }
  }, [children, childId]);

  const singleReport = useChildAttendanceHistory({
    childId: childId || undefined,
    nurseryId,
  });

  const allChildIds = useMemo(() => children.map((c) => c.id), [children]);
  const allReport = useAllChildrenAttendanceSummary({
    childIds: allChildIds,
    nurseryId,
  });

  const isAllMode = isMultiChild && !childId;
  const report = isAllMode
    ? { rows: allReport.rows, summary: allReport.summary, isPending: allReport.isPending, child: null }
    : { rows: singleReport.rows, summary: singleReport.summary, isPending: singleReport.isPending, child: singleReport.child };

  const childName = useMemo(() => {
    if (isAllMode) return t('parent.childSelector.allChildren');
    const c = children.find((x) => x.id === childId);
    if (!c) return '';
    return i18n.language === 'ar' ? (c.nameAr?.trim() || c.nameEn) : (c.nameEn?.trim() || c.nameAr);
  }, [children, childId, i18n.language, t, isAllMode]);

  const monthLabel = useMemo(
    () => new Date().toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
    [locale],
  );

  const formatTime = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const avgIn = averageMinutesToTimeLabel(report.summary.avgCheckInMinutes, i18n.language);

  const loading = childrenQuery.isPending || report.isPending;

  if (!childrenQuery.isPending && childId && !report.isPending && !report.child && !isAllMode) {
    return (
      <div className="space-y-4 pb-28">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-on-surface">
          <MaterialSymbol name="history" className="text-primary" size="text-2xl" />
          {t('parent.attendanceHistory.title')}
        </h1>
        <EmptyState
          icon="error_outline"
          title={t('parent.attendanceHistory.unavailableTitle')}
          description={t('parent.attendanceHistory.unavailableDescription')}
        />
      </div>
    );
  }

  if (!loading && !children.length) {
    return (
      <div className="space-y-4 pb-28">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-on-surface">
          <MaterialSymbol name="history" className="text-primary" size="text-2xl" />
          {t('parent.attendanceHistory.title')}
        </h1>
        <EmptyState icon="event_busy" title={t('parent.attendanceHistory.emptyTitle')} description={t('parent.attendanceHistory.emptyDescription')} />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28">
      <h1 className="flex items-center gap-2 text-lg font-semibold text-on-surface">
        <MaterialSymbol name="history" className="text-primary" size="text-2xl" />
        {t('parent.attendanceHistory.title')}
      </h1>

      {isMultiChild ? (
        <ChildSelector
          value={childId}
          onChange={setChildId}
          children={children}
          showAllOption={true}
        />
      ) : null}

      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <>
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
            <p className="text-sm font-medium text-on-surface">{childName}</p>
            <p className="mt-3 flex items-center gap-2 text-sm text-on-surface-variant">
              <MaterialSymbol name="calendar_month" size="text-lg" />
              {t('parent.attendanceHistory.monthlySummary', {
                month: monthLabel,
                rate: report.summary.ratePct,
                present: report.summary.presentDays,
                total: report.summary.schoolDaysCount,
              })}
            </p>
            <p className="mt-2 flex items-center gap-2 text-sm text-on-surface-variant">
              <MaterialSymbol name="schedule" size="text-lg" />
              {t('parent.attendanceHistory.avgCheckIn', { time: avgIn })}
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-outline-variant">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="border-b border-outline-variant bg-surface-container-lowest text-start text-xs text-on-surface-variant">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{t('parent.attendanceHistory.colDate')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('parent.attendanceHistory.colCheckIn')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('parent.attendanceHistory.colCheckOut')}</th>
                  {!isAllMode ? (
                    <th className="px-3 py-2 text-start font-medium">
                      {t('parent.attendanceHistory.colPickup')}
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.date} className="border-b border-outline-variant/60">
                    <td className="px-3 py-2 align-top text-on-surface">
                      {new Date(row.date + 'T12:00:00').toLocaleDateString(locale)}
                    </td>
                    <td className="px-3 py-2 align-top">{formatTime(row.checkIn)}</td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-1">
                        <span>{formatTime(row.checkOut)}</span>
                        {row.latePickup ? (
                          <span className="rounded-md border border-error/40 bg-error/10 px-1.5 py-0.5 text-[10px] font-medium text-error">
                            {t('parent.attendanceHistory.lateBadge')}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    {!isAllMode ? (
                      <td className="px-3 py-2 align-top">
                        {row.pickup?.personName || row.pickup?.photoUrl ? (
                          <div className="flex items-center gap-2">
                            {row.pickup.photoUrl ? (
                              <img
                                src={row.pickup.photoUrl}
                                alt=""
                                className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-outline-variant"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <span
                                className="material-symbols-outlined shrink-0 text-base text-on-surface-variant"
                                aria-hidden
                              >
                                person
                              </span>
                            )}
                            <span className="truncate">
                              {row.pickup.personName ?? t('parent.attendanceHistory.unknownPickup')}
                            </span>
                          </div>
                        ) : (
                          <span className="text-on-surface-variant">—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
