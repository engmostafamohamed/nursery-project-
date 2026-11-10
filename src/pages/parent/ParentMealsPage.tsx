import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { FamilyMealPlans } from '@/features/food-and-beverage/FamilyMealPlans';
import { periodBounds, requestedMenuDay } from '@/features/food-and-beverage/menuPeriod';
import { MenuFileCard } from '@/features/food-and-beverage/MenuFileCard';
import { MenuView } from '@/features/food-and-beverage/MenuView';
import { PeriodSwitcher } from '@/features/food-and-beverage/PeriodSwitcher';
import { useMenu } from '@/features/food-and-beverage/useMenu';
import { FamilyExtrasPanel } from '@/features/kitchen-sales/FamilyExtrasPanel';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { useSettings } from '@/lib/useSettings';

/**
 * The family's view of the nursery's menu: their children's meal plans and extras (ordering them,
 * answering a teacher who asks), the published menu of the week or month (the current one, or the
 * one a notification links to), its file, and the dishes their child must not eat. ?view=extras
 * opens at the extras.
 */
export function ParentMealsPage() {
  const { t } = useTranslation();
  const { nurseryId } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = getNurseryCalendarDateString();
  const query = useMenu(nurseryId, requestedMenuDay(searchParams) ?? today);
  const menu = query.data;

  const goTo = (day: string) => {
    const current = menu ? periodBounds(today, menu.period).startsOn : null;
    setSearchParams(day === current ? {} : { day }, { replace: true });
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 pb-24">
      <PageHeader icon="restaurant" title={t('meals.parentTitle')} description={t('fnb.parent.subtitle')}>
        {menu ? (
          <PeriodSwitcher period={menu.period} startsOn={menu.startsOn} endsOn={menu.endsOn} today={today} onChange={goTo} />
        ) : (
          <Skeleton className="h-10 w-full rounded-full" />
        )}
      </PageHeader>
      <FamilyMealPlans />
      <FamilyExtrasPanel focus={searchParams.get('view') === 'extras'} />
      {query.isLoading || !nurseryId ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : menu ? (
        <>
          {menu.info?.file ? <MenuFileCard nurseryId={nurseryId} menu={{ ...menu, canEdit: false }} /> : null}
          <MenuView menu={menu} today={today} audience="parent" />
        </>
      ) : (
        <p role="alert" className="rounded-xl border border-error/40 bg-error/5 p-4 text-sm">{t('fnb.errors.failed')}</p>
      )}
    </div>
  );
}
