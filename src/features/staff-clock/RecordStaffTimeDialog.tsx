import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { invalidFieldClass } from '@/components/ui/FieldError';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

import { hhmmIn, NOTE_MAX, recordIssue, type TimeIssue } from './staffClock';
import { staffClockErrorKey, useRecordStaffAttendance } from './staffClockApi';

const FIELD_OF: Record<TimeIssue, 'in' | 'out' | 'note'> = {
  in_required: 'in', in_future: 'in', out_before_in: 'out', out_future: 'out', note_too_long: 'note',
};

/**
 * Recording a member of staff's day by hand (they forgot to clock in or out): the times in the
 * nursery's clock, checked under the fields as they are typed; a recorded day can be cleared.
 */
export function RecordStaffTimeDialog({
  person,
  day,
  isToday,
  timezone,
  current,
  onClose,
}: {
  person: { id: string; name: string };
  day: string;
  isToday: boolean;
  timezone: string;
  current: { checkIn: string | null; checkOut: string | null } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [checkIn, setCheckIn] = useState(() => hhmmIn(current?.checkIn ?? null, timezone));
  const [checkOut, setCheckOut] = useState(() => hhmmIn(current?.checkOut ?? null, timezone));
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const save = useRecordStaffAttendance();

  const issue = recordIssue(checkIn, checkOut, note, isToday ? hhmmIn(new Date(), timezone) : null);
  const shown = issue && (tried || (issue !== 'in_required')) ? issue : null;
  const errorFor = (field: 'in' | 'out' | 'note') => (shown && FIELD_OF[shown] === field ? t(`staffClock.record.issues.${shown}`, { max: NOTE_MAX }) : null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (issue || save.isPending) return;
    setProblem(null);
    try {
      await save.mutateAsync({ userId: person.id, day, checkIn, checkOut: checkOut || null, note });
      toast.success(t('staffClock.record.saved', { name: person.name }));
      onClose();
    } catch (error) {
      setProblem(t(staffClockErrorKey(error)));
    }
  };

  const clear = async () => {
    const ok = await confirm({ title: t('staffClock.record.clearTitle'), description: t('staffClock.record.clearBody', { name: person.name }), confirmText: t('staffClock.record.clear'), variant: 'danger' });
    if (!ok) return;
    setProblem(null);
    try {
      await save.mutateAsync({ userId: person.id, day, checkIn: null, checkOut: null });
      toast.success(t('staffClock.record.cleared'));
      onClose();
    } catch (error) {
      setProblem(t(staffClockErrorKey(error)));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-w-md" data-testid="record-staff-time">
        <form className="space-y-4" onSubmit={(e) => void submit(e)} noValidate>
          <DialogHeader>
            <DialogTitle>{t('staffClock.record.title', { name: person.name })}</DialogTitle>
            <DialogDescription>{t('staffClock.record.description')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="staff-time-in" label={t('staffClock.record.in')} error={errorFor('in')}>
              <Input id="staff-time-in" type="time" dir="ltr" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} aria-invalid={Boolean(errorFor('in'))} className={cn(errorFor('in') && invalidFieldClass)} />
            </FormField>
            <FormField id="staff-time-out" label={t('staffClock.record.out')} optional error={errorFor('out')} hint={errorFor('out') ? undefined : t('staffClock.record.outHint')}>
              <Input id="staff-time-out" type="time" dir="ltr" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} aria-invalid={Boolean(errorFor('out'))} className={cn(errorFor('out') && invalidFieldClass)} />
            </FormField>
          </div>
          <FormField id="staff-time-note" label={t('staffClock.record.note')} optional error={errorFor('note')}>
            <Input id="staff-time-note" value={note} maxLength={NOTE_MAX + 20} placeholder={t('staffClock.record.notePlaceholder')} onChange={(e) => setNote(e.target.value)} aria-invalid={Boolean(errorFor('note'))} className={cn(errorFor('note') && invalidFieldClass)} />
          </FormField>
          <FormProblem message={problem} />
          <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
            {current?.checkIn ? (
              <Button type="button" variant="ghost" className="text-error" disabled={save.isPending} onClick={() => void clear()}>
                <MaterialSymbol name="delete" size="text-base" className="me-1" />
                {t('staffClock.record.clear')}
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={save.isPending} aria-busy={save.isPending}>{save.isPending ? t('common.saving') : t('staffClock.record.save')}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
