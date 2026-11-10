import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@/components/ui/PageHeader';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Skeleton } from '@/components/ui/skeleton';
import { FoodAlertList } from '@/features/food-and-beverage/FoodAlertList';
import { MenuFileCard } from '@/features/food-and-beverage/MenuFileCard';
import { MenuView } from '@/features/food-and-beverage/MenuView';
import { PeriodSwitcher } from '@/features/food-and-beverage/PeriodSwitcher';
import { useFoodAlerts, useMenu } from '@/features/food-and-beverage/useMenu';
import { MyFoodAccount } from '@/features/kitchen-sales/MyFoodAccount';
import { TeacherExtrasPanel } from '@/features/kitchen-sales/TeacherExtrasPanel';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { useSettings } from '@/lib/useSettings';

/**
 * The teacher's F&B: who in their classes must not eat today's dishes, today's extras for the
 * children they look after, the menu of the week or month, and their own food and drinks account.
 */
export function TeacherMealsPage() {
  const { t } = useTranslation();
  const { nurseryId } = useSettings();
  const today = getNurseryCalendarDateString();
  const [day, setDay] = useState(today);
  const alerts = useFoodAlerts({ nurseryId, from: today, to: today });
  const menu = useMenu(nurseryId, day);

  return (
    <div className="space-y-5">
      <PageHeader icon="restaurant" eyebrow={t('fnb.eyebrow')} title={t('fnb.teacher.title')} description={t('fnb.teacher.subtitle')} />
      <section>
        <SectionTitle icon="no_food">{t('fnb.teacher.todayAlerts')}</SectionTitle>
        {alerts.isLoading || !nurseryId ? <Skeleton className="h-32 rounded-xl" /> : alerts.data ? <FoodAlertList alerts={alerts.data} /> : null}
      </section>
      <TeacherExtrasPanel />
      <section className="space-y-3">
        <SectionTitle icon="menu_book">{t('fnb.teacher.menu')}</SectionTitle>
        {menu.data ? (
          <PeriodSwitcher period={menu.data.period} startsOn={menu.data.startsOn} endsOn={menu.data.endsOn} today={today} onChange={setDay} />
        ) : null}
        {menu.isLoading || !nurseryId ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : menu.data ? (
          <>
            {menu.data.info?.file ? <MenuFileCard nurseryId={nurseryId} menu={{ ...menu.data, canEdit: false }} /> : null}
            <MenuView menu={menu.data} today={today} audience="staff" />
          </>
        ) : null}
      </section>
      <MyFoodAccount thisMonth={today.slice(0, 7)} />
    </div>
  );
}
