import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormProblem } from '@/components/ui/FormField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

import type { Holiday } from './daysOff';
import { addOfficialHolidays, daysOffErrorKey } from './daysOffApi';
import { HolidayDates } from './HolidayDates';
import { egyptOfficialHolidays } from './officialHolidays';
import { refreshDaysOff } from './useDaysOff';

/**
 * Egypt's official holidays of a year, worked out by the system, to add in one click. The coming ones
 * are ticked; those already added show as added; the ones that follow the moon say so (the announced
 * day can differ by one, and any can be moved after).
 */
export function OfficialHolidaysDialog({ nurseryId, year, existing, today, onClose }: {
  nurseryId: string;
  year: number;
  existing: readonly Holiday[];
  today: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const holidays = useMemo(() => egyptOfficialHolidays(year), [year]);
  const added = useMemo(() => new Set(existing.map((h) => h.official_key).filter(Boolean)), [existing]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(holidays.filter((h) => !added.has(h.key) && h.endsOn >= today).map((h) => h.key)));
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggle = (key: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const submit = async () => {
    const tAr = i18n.getFixedT('ar');
    const tEn = i18n.getFixedT('en');
    setSaving(true);
    setProblem(null);
    try {
      const count = await addOfficialHolidays(
        nurseryId,
        holidays
          .filter((h) => picked.has(h.key))
          .map((h) => ({
            key: h.key,
            name_ar: tAr(`daysOff.official.${h.id}`),
            name_en: tEn(`daysOff.official.${h.id}`),
            starts_on: h.startsOn,
            ends_on: h.endsOn,
          })),
      );
      toast.success(t('daysOff.official.added', { count }), { description: t('daysOff.holiday.savedHint') });
      refreshDaysOff(queryClient);
      onClose();
    } catch (error) {
      setProblem(t(daysOffErrorKey(error)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-xl" data-testid="official-dialog">
        <DialogHeader>
          <DialogTitle>{t('daysOff.official.title', { year })}</DialogTitle>
          <DialogDescription>{t('daysOff.official.hint')}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-[55vh] divide-y divide-outline-variant overflow-y-auto rounded-xl border border-outline-variant">
          {holidays.map((h) => {
            const isAdded = added.has(h.key);
            return (
              <li key={h.key}>
                <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-surface-container-low" data-testid="official-holiday">
                  <Checkbox
                    className="mt-1"
                    checked={isAdded || picked.has(h.key)}
                    disabled={isAdded || saving}
                    onCheckedChange={(v) => toggle(h.key, v === true)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-on-surface">{t(`daysOff.official.${h.id}`)}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-on-surface-variant">
                      <HolidayDates startsOn={h.startsOn} endsOn={h.endsOn} />
                      {h.lunar ? (
                        <span className="inline-flex items-center gap-1" title={t('daysOff.official.lunarHint')}>
                          <MaterialSymbol name="dark_mode" size="text-sm" />
                          {t('daysOff.official.lunar')}
                        </span>
                      ) : null}
                      {h.endsOn < today && !isAdded ? <span>{t('daysOff.official.past')}</span> : null}
                    </span>
                  </span>
                  {isAdded ? <span className="text-xs font-medium text-success">{t('daysOff.official.already')}</span> : null}
                </label>
              </li>
            );
          })}
        </ul>
        <FormProblem message={problem} />
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="button" disabled={saving || picked.size === 0} onClick={() => void submit()} data-testid="official-add">
            {t('daysOff.official.add', { count: picked.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
