import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@/components/ui/PageHeader';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Skeleton } from '@/components/ui/skeleton';
import { FoodAlertList } from '@/features/food-and-beverage/FoodAlertList';
import { weekStartOf } from '@/features/food-and-beverage/menu';
import { MenuFileCard } from '@/features/food-and-beverage/MenuFileCard';
import { MenuWeekView } from '@/features/food-and-beverage/MenuWeekView';
import { useFoodAlerts, useMenuWeek } from '@/features/food-and-beverage/useMenuWeek';
import { WeekSwitcher } from '@/features/food-and-beverage/WeekSwitcher';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { useSettings } from '@/lib/useSettings';

/** The teacher's F&B: who in their classes must not eat today's dishes, then the week's menu. */
export function TeacherMealsPage() {
  const { t } = useTranslation();
  const { nurseryId } = useSettings();
  const today = getNurseryCalendarDateString();
  const thisWeek = weekStartOf(today);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const alerts = useFoodAlerts({ nurseryId, from: today, to: today });
  const menu = useMenuWeek(nurseryId, weekStart);

  return (
    <div className="space-y-5">
      <PageHeader icon="restaurant" eyebrow={t('fnb.eyebrow')} title={t('fnb.teacher.title')} description={t('fnb.teacher.subtitle')} />
      <section>
        <SectionTitle icon="no_food">{t('fnb.teacher.todayAlerts')}</SectionTitle>
        {alerts.isLoading || !nurseryId ? <Skeleton className="h-32 rounded-xl" /> : alerts.data ? <FoodAlertList alerts={alerts.data} /> : null}
      </section>
      <section className="space-y-3">
        <SectionTitle icon="menu_book">{t('fnb.teacher.weekMenu')}</SectionTitle>
        <WeekSwitcher weekStart={weekStart} thisWeek={thisWeek} onChange={setWeekStart} />
        {menu.isLoading || !nurseryId ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : menu.data ? (
          <>
            {menu.data.week?.file ? <MenuFileCard nurseryId={nurseryId} menu={{ ...menu.data, canEdit: false }} /> : null}
            <MenuWeekView menu={menu.data} today={today} audience="staff" />
          </>
        ) : null}
      </section>
    </div>
  );
}
