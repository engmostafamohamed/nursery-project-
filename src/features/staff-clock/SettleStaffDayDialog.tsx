import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { invalidFieldClass } from '@/components/ui/FieldError';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { formatDay } from '@/lib/datetime';
import { cn } from '@/lib/utils';

import { hhmmIn, NOTE_MAX } from './staffClock';
import { staffClockErrorKey } from './staffClockApi';
import { settleIssue, type ReviewDay } from './staffReview';
import { useApproveStaffDay } from './useStaffReview';

/**
 * The manager settles a day that was left waiting: the times as they really were, in the nursery's
 * clock, with a line saying what happened. The times come in as they were recorded, so confirming
 * them unchanged is the common case and takes one press.
 */
export function SettleStaffDayDialog({
  day,
  name,
  timezone,
  onClose,
}: {
  day: ReviewDay;
  name: string;
  timezone: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [checkIn, setCheckIn] = useState(() => hhmmIn(day.checkInAt, timezone));
  const [checkOut, setCheckOut] = useState(() => hhmmIn(day.checkOutAt, timezone));
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const settle = useApproveStaffDay();

  const issue = settleIssue(checkIn, checkOut) ?? (note.trim().length > NOTE_MAX ? 'note_too_long' : null);
  const shown = tried ? issue : issue === 'out_before_in' ? issue : null;
  const errorFor = (field: 'in' | 'out' | 'note') => {
    if (!shown) return null;
    const of = shown === 'in_required' ? 'in' : shown === 'note_too_long' ? 'note' : 'out';
    return of === field ? t(`staffClock.settle.issues.${shown}`, { max: NOTE_MAX }) : null;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (issue || settle.isPending) return;
    setProblem(null);
    try {
      await settle.mutateAsync({ id: day.id, checkIn, checkOut, note });
      toast.success(t('staffClock.settle.saved', { name }));
      onClose();
    } catch (error) {
      setProblem(t(staffClockErrorKey(error)));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !settle.isPending && onClose()}>
      <DialogContent className="max-w-md" data-testid="settle-staff-day">
        <form className="space-y-4" onSubmit={(e) => void submit(e)} noValidate>
          <DialogHeader>
            <DialogTitle>{t('staffClock.settle.title', { name })}</DialogTitle>
            <DialogDescription>
              {t('staffClock.settle.description', { day: formatDay(day.workDate, { weekday: 'long', day: 'numeric', month: 'long' }) })}
              {day.reason ? ` · ${t(`staffClock.review.${day.reason}`)}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="settle-in" label={t('staffClock.record.in')} error={errorFor('in')}>
              <Input id="settle-in" type="time" dir="ltr" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} aria-invalid={Boolean(errorFor('in'))} className={cn(errorFor('in') && invalidFieldClass)} />
            </FormField>
            <FormField id="settle-out" label={t('staffClock.record.out')} error={errorFor('out')}>
              <Input id="settle-out" type="time" dir="ltr" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} aria-invalid={Boolean(errorFor('out'))} className={cn(errorFor('out') && invalidFieldClass)} />
            </FormField>
          </div>
          <FormField id="settle-note" label={t('staffClock.settle.note')} optional error={errorFor('note')} hint={errorFor('note') ? undefined : t('staffClock.settle.noteHint')}>
            <Input id="settle-note" value={note} maxLength={NOTE_MAX + 20} placeholder={t('staffClock.settle.notePlaceholder')} onChange={(e) => setNote(e.target.value)} aria-invalid={Boolean(errorFor('note'))} className={cn(errorFor('note') && invalidFieldClass)} />
          </FormField>
          <FormProblem message={problem} />
          <DialogFooter className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={settle.isPending}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={settle.isPending} aria-busy={settle.isPending}>
              {settle.isPending ? t('common.saving') : t('staffClock.settle.confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
