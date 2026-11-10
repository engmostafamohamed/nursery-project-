import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { FoodAlertList } from '@/features/food-and-beverage/FoodAlertList';
import { addDays, weekStartOf } from '@/features/food-and-beverage/menuPeriod';
import { useFoodAlerts } from '@/features/food-and-beverage/useMenu';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { cn } from '@/lib/utils';
import { useSettings } from '@/lib/useSettings';
import { useAdminBasePath } from '@/hooks/useAdminBasePath';

type Period = 'today' | 'this_week' | 'next_week';
const PERIODS: Period[] = ['today', 'this_week', 'next_week'];

/** F&B · food allergy alerts: the children who must not eat a dish on the menu, today or by week. */
export function AdminFoodAlertsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const base = useAdminBasePath();
  const { nurseryId } = useSettings();
  const today = getNurseryCalendarDateString();
  const [period, setPeriod] = useState<Period>('today');
  const week = weekStartOf(today);
  const [from, to] = period === 'today' ? [today, today] : period === 'this_week' ? [week, addDays(week, 6)] : [addDays(week, 7), addDays(week, 13)];
  const query = useFoodAlerts({ nurseryId, from, to });

  return (
    <div className="space-y-4">
      <PageHeader
        icon="no_food"
        eyebrow={t('fnb.eyebrow')}
        title={t('fnb.alerts.title')}
        description={t('fnb.alerts.subtitle')}
        actions={
          <Button asChild variant="outline">
            <Link to={`${base}/meals`}>
              <MaterialSymbol name="restaurant" size="text-base" className="me-1" />
              {t('fnb.alerts.menuLink')}
            </Link>
          </Button>
        }
      >
        <div role="tablist" aria-label={t('fnb.alerts.period')} className="flex flex-wrap gap-2">
          {PERIODS.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={period === value}
              onClick={() => setPeriod(value)}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                period === value ? 'border-primary bg-primary text-primary-foreground' : 'border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container-lowest',
              )}
            >
              {t(`fnb.alerts.periods.${value}`)}
            </button>
          ))}
        </div>
      </PageHeader>
      {query.isLoading || !nurseryId ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : query.data ? (
        <FoodAlertList
          alerts={query.data}
          childHref={(childId, allergyName) => `${base}/children/${childId}/health?allergy=${encodeURIComponent(allergyName)}`}
          childLinkState={{ from: location.pathname, fromLabelKey: 'fnb.alerts.title' }}
        />
      ) : (
        <p role="alert" className="rounded-xl border border-error/40 bg-error/5 p-4 text-sm">{t('fnb.errors.failed')}</p>
      )}
    </div>
  );
}
