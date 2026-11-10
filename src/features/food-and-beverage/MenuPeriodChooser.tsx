import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { confirm } from '@/components/ui/confirm';
import { FilterChips } from '@/components/ui/FilterChips';

import { MENU_PERIODS, type MenuPeriod } from './menuPeriod';
import { menuErrorKey } from './menuErrors';
import { useMenuPeriodKind } from './useMenu';

/**
 * Whether the nursery writes its menu a week or a month at a time. Switching keeps the other kind's
 * menus (hidden, not checked for allergies) so switching back brings them back; it asks first, and
 * not while the editor has unsaved changes.
 */
export function MenuPeriodChooser({ nurseryId, period, dirty }: { nurseryId: string; period: MenuPeriod; dirty: boolean }) {
  const { t } = useTranslation();
  const change = useMenuPeriodKind(nurseryId);

  const choose = async (next: MenuPeriod) => {
    if (next === period || change.isPending) return;
    if (dirty) {
      toast.error(t('fnb.period.saveFirst'));
      return;
    }
    const ok = await confirm({
      title: t('fnb.period.switchTitle'),
      description: next === 'month' ? t('fnb.period.switchToMonth') : t('fnb.period.switchToWeek'),
      confirmText: t('fnb.period.switch'),
      icon: 'calendar_month',
    });
    if (!ok) return;
    try {
      await change.mutateAsync(next);
      toast.success(next === 'month' ? t('fnb.period.nowMonthly') : t('fnb.period.nowWeekly'));
    } catch (error) {
      toast.error(t(menuErrorKey(error)));
    }
  };

  return (
    <FilterChips
      value={period}
      onChange={(next) => void choose(next)}
      label={t('fnb.period.label')}
      options={MENU_PERIODS.map((value) => ({ value, label: value === 'month' ? t('fnb.period.monthly') : t('fnb.period.weekly') }))}
    />
  );
}
