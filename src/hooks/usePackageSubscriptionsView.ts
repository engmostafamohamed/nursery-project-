import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePackageSubscriptions } from '@/hooks/usePackageSubscriptions';
import { usePeriodState } from '@/hooks/usePeriodState';
import { rangeLabel } from '@/lib/attendancePeriods';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { byPackage, type CatalogPackage } from '@/lib/packageSubscriptions';

/**
 * The Packages page's subscriptions, shared by the totals card and the package cards so both count
 * the same period: its subscriptions, each package's numbers, and the package whose list is open.
 */
export function usePackageSubscriptionsView(nurseryId: string | null | undefined, catalog: CatalogPackage[]) {
  const { t, i18n } = useTranslation();
  const [today] = useState(() => getNurseryCalendarDateString());
  const period = usePeriodState('all', today);
  const query = usePackageSubscriptions(nurseryId, period.range, period.valid);
  const [openPackageId, setOpenPackageId] = useState<string | null>(null);
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const summaries = useMemo(() => new Map(byPackage(rows, catalog).map((summary) => [summary.packageId, summary])), [rows, catalog]);
  // "All time", or the days the period covers; nothing while picked dates are not valid.
  const shown = period.shown;
  const periodLabel =
    period.choice === 'all'
      ? t('periodFilter.all')
      : shown && shown.from <= shown.to
        ? rangeLabel(shown, i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB')
        : undefined;

  return {
    period,
    periodLabel,
    query,
    rows,
    summaries,
    openPackageId,
    openPackage: (packageId: string) => setOpenPackageId(packageId),
    closePackage: () => setOpenPackageId(null),
  };
}

export type PackageSubscriptionsView = ReturnType<typeof usePackageSubscriptionsView>;
