import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ActionGate } from '@/components/shared/ActionGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMealPlans } from '@/hooks/useMealPlans';
import { useSettings } from '@/lib/useSettings';

export function AdminMealPlansPage() {
  const { t } = useTranslation();
  const { nurseryId } = useSettings();
  const meals = useMealPlans(nurseryId ?? undefined);
  const [weekStart, setWeekStart] = useState(new Date().toISOString().slice(0, 10));
  const [menu, setMenu] = useState({
    sunday: '', monday: '', tuesday: '', wednesday: '', thursday: '',
  });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-on-surface">{t('meals.adminTitle')}</h1>
      <ActionGate feature="meals" action="create">
        <section className="space-y-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
          {Object.keys(menu).map((day) => (
            <Input key={day} placeholder={t(`meals.days.${day}`)} value={menu[day as keyof typeof menu]} onChange={(e) => setMenu((m) => ({ ...m, [day]: e.target.value }))} />
          ))}
          <Button
            onClick={() => {
              if (!nurseryId) return;
              void meals.savePlan({ nursery_id: nurseryId, week_start_date: weekStart, meals_json: menu }).then(() => toast.success(t('meals.saved')));
            }}
          >
            {t('meals.savePlan')}
          </Button>
        </section>
      </ActionGate>
      <section className="space-y-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        {meals.plans.map((plan) => (
          <article key={String(plan.id)} className="rounded-lg border border-outline-variant bg-surface text-foreground p-2">
            <p className="text-sm font-medium">{t('meals.weekOf')}: {String(plan.week_start_date)}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
