import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { FamilyMealPlans } from '@/features/food-and-beverage/FamilyMealPlans';
import { weekStartOf } from '@/features/food-and-beverage/menu';
import { MenuFileCard } from '@/features/food-and-beverage/MenuFileCard';
import { MenuWeekView } from '@/features/food-and-beverage/MenuWeekView';
import { useMenuWeek } from '@/features/food-and-beverage/useMenuWeek';
import { WeekSwitcher } from '@/features/food-and-beverage/WeekSwitcher';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { useSettings } from '@/lib/useSettings';

/**
 * The family's view of the nursery's menu: the published week (this one, or the one a notification
 * links to), its file, and the dishes their child must not eat.
 */
export function ParentMealsPage() {
  const { t } = useTranslation();
  const { nurseryId } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = getNurseryCalendarDateString();
  const thisWeek = weekStartOf(today);
  const requested = searchParams.get('week');
  const weekStart = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? weekStartOf(requested) : thisWeek;
  const query = useMenuWeek(nurseryId, weekStart);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 pb-24">
      <PageHeader icon="restaurant" title={t('meals.parentTitle')} description={t('fnb.parent.subtitle')}>
        <WeekSwitcher weekStart={weekStart} thisWeek={thisWeek} onChange={(next) => setSearchParams(next === thisWeek ? {} : { week: next })} />
      </PageHeader>
      <FamilyMealPlans />
      {query.isLoading || !nurseryId ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : query.data ? (
        <>
          {query.data.week?.file ? <MenuFileCard nurseryId={nurseryId} menu={{ ...query.data, canEdit: false }} /> : null}
          <MenuWeekView menu={query.data} today={today} audience="parent" />
        </>
      ) : (
        <p role="alert" className="rounded-xl border border-error/40 bg-error/5 p-4 text-sm">{t('fnb.errors.failed')}</p>
      )}
    </div>
  );
}
