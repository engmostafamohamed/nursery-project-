import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';

import {
  earliestEnd,
  emptyHolidayDraft,
  holidayArgs,
  holidayDraftOf,
  holidayProblems,
  HOLIDAY_NAME_MAX,
  type Holiday,
  type HolidayDraft,
} from './daysOff';
import { daysOffErrorKey, saveHoliday } from './daysOffApi';
import { refreshDaysOff } from './useDaysOff';

/**
 * Adds a day off (one day or a range) or changes one. A running one keeps its first day and can end
 * early; a new one may be in the past, to record a closure that already happened.
 */
export function HolidayDialog({ nurseryId, holiday, today, onClose }: { nurseryId: string; holiday: Holiday | null; today: string; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<HolidayDraft>(() => (holiday ? holidayDraftOf(holiday) : emptyHolidayDraft(today)));
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const running = holiday !== null && holiday.starts_on < today;
  const problems = holidayProblems(draft);
  const shown = tried ? problems : {};
  const set = (patch: Partial<HolidayDraft>) => {
    setProblem(null);
    setDraft((d) => {
      const next = { ...d, ...patch };
      // Moving the first day past the last moves the last with it.
      if (patch.startsOn && next.endsOn < patch.startsOn) next.endsOn = patch.startsOn;
      return next;
    });
  };

  const submit = async () => {
    setTried(true);
    if (Object.keys(problems).length) return;
    setSaving(true);
    try {
      await saveHoliday(holiday?.id ?? null, holidayArgs(draft, nurseryId));
      toast.success(t(holiday ? 'daysOff.holiday.updated' : 'daysOff.holiday.added'), { description: t('daysOff.holiday.savedHint') });
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
      <DialogContent className="max-w-lg" data-testid="holiday-dialog">
        <DialogHeader>
          <DialogTitle>{t(holiday ? 'daysOff.holiday.editTitle' : 'daysOff.holiday.addTitle')}</DialogTitle>
          <DialogDescription>{t(running ? 'daysOff.holiday.runningHint' : 'daysOff.holiday.hint')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="holiday-name-ar" label={t('daysOff.holiday.nameAr')} error={shown.name ? t(`daysOff.problems.${shown.name}`) : null}>
              <Input id="holiday-name-ar" dir="rtl" maxLength={HOLIDAY_NAME_MAX} value={draft.nameAr} onChange={(e) => set({ nameAr: e.target.value })} />
            </FormField>
            <FormField id="holiday-name-en" label={t('daysOff.holiday.nameEn')}>
              <Input id="holiday-name-en" dir="ltr" maxLength={HOLIDAY_NAME_MAX} value={draft.nameEn} onChange={(e) => set({ nameEn: e.target.value })} />
            </FormField>
            <FormField id="holiday-from" label={t('daysOff.holiday.from')} error={shown.dates ? t(`daysOff.problems.${shown.dates}`) : null}>
              <Input id="holiday-from" type="date" disabled={running} min={holiday && !running ? today : undefined} value={draft.startsOn} onChange={(e) => set({ startsOn: e.target.value })} />
            </FormField>
            <FormField id="holiday-to" label={t('daysOff.holiday.to')} hint={t('daysOff.holiday.toHint')}>
              <Input
                id="holiday-to"
                type="date"
                min={holiday ? earliestEnd(holiday, today) : draft.startsOn || undefined}
                value={draft.endsOn}
                onChange={(e) => set({ endsOn: e.target.value })}
              />
            </FormField>
          </div>
          {!holiday && draft.startsOn && draft.startsOn < today ? (
            <p className="rounded-lg bg-surface-container px-3 py-2 text-xs text-on-surface-variant">{t('daysOff.holiday.pastNote')}</p>
          ) : null}
          <FormProblem message={problem} />
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving} data-testid="holiday-save">{t('daysOff.holiday.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
