import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { invalidFieldClass } from '@/components/ui/FieldError';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatDay } from '@/lib/datetime';
import { cn } from '@/lib/utils';

import { REASON_ICON } from './absenceLook';
import { ABSENCE_REASONS, absenceIssues, addDays, daysBetween, NOTE_MAX, overlapsExisting, type Absence, type AbsenceDraft, type AbsenceField, type StaffMember } from './staffAbsence';
import { absenceErrorKey } from './staffAbsenceApi';
import { useAbsenceChanges } from './useStaffAbsence';

/**
 * Reporting an absence: a teacher reports their own; an admin records one for anyone on the staff.
 * The dates, the reason and the note are checked as they are filled in; a day already covered by
 * another absence is refused before sending.
 */
export function AbsenceDialog({
  today,
  existing,
  staff,
  onClose,
}: {
  today: string;
  existing: Absence[];
  /** Given for an admin, who chooses whose absence it is. */
  staff?: StaffMember[];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const asAdmin = Boolean(staff);
  const [draft, setDraft] = useState<AbsenceDraft>({ userId: '', startsOn: today, endsOn: today, reason: '', note: '' });
  const [touched, setTouched] = useState<Partial<Record<AbsenceField, boolean>>>({});
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { report } = useAbsenceChanges();

  const issues = absenceIssues(draft, today, asAdmin);
  if (!issues.endsOn && !issues.startsOn && overlapsExisting(draft, existing)) issues.endsOn = 'overlaps';
  const shows = (field: AbsenceField) => tried || Boolean(touched[field]);
  const err = (field: AbsenceField) => (shows(field) && issues[field] ? t(`staffAbsence.issues.${issues[field]}`, { max: NOTE_MAX }) : null);
  const set = (patch: Partial<AbsenceDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const days = draft.startsOn && draft.endsOn && draft.endsOn >= draft.startsOn ? daysBetween(draft.startsOn, draft.endsOn) : 0;
  const includesToday = days > 0 && draft.startsOn <= today && draft.endsOn >= today;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(issues).length || report.isPending) return;
    setProblem(null);
    try {
      await report.mutateAsync(draft);
      toast.success(t(asAdmin ? 'staffAbsence.recorded' : 'staffAbsence.reported'));
      onClose();
    } catch (error) {
      setProblem(t(absenceErrorKey(error)));
    }
  };

  const quick = (label: string, from: string, to: string) => (
    <button
      type="button"
      onClick={() => set({ startsOn: from, endsOn: to })}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        draft.startsOn === from && draft.endsOn === to ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant hover:border-primary/60',
      )}
    >
      {label}
    </button>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && !report.isPending && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto" data-testid="absence-dialog">
        <form onSubmit={(e) => void submit(e)} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle>{t(asAdmin ? 'staffAbsence.dialog.recordTitle' : 'staffAbsence.dialog.reportTitle')}</DialogTitle>
            <DialogDescription>{t(asAdmin ? 'staffAbsence.dialog.recordHint' : 'staffAbsence.dialog.reportHint')}</DialogDescription>
          </DialogHeader>

          {staff ? (
            <FormField id="absence-person" label={t('staffAbsence.fields.person')} error={err('userId')}>
              <Select
                id="absence-person"
                value={draft.userId}
                onChange={(e) => set({ userId: e.target.value })}
                onBlur={() => setTouched((s) => ({ ...s, userId: true }))}
                className={cn(err('userId') && invalidFieldClass)}
              >
                <option value="">{t('staffAbsence.fields.choosePerson')}</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {(isArabic ? s.nameAr || s.nameEn : s.nameEn || s.nameAr) || '—'} · {t(`staffAbsence.roles.${s.role}`, { defaultValue: s.role })}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-on-surface">{t('staffAbsence.fields.when')}</legend>
            <div className="flex flex-wrap gap-1.5">
              {quick(t('staffAbsence.quick.today'), today, today)}
              {quick(t('staffAbsence.quick.tomorrow'), addDays(today, 1), addDays(today, 1))}
              {quick(t('staffAbsence.quick.threeDays'), today, addDays(today, 2))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="absence-from" label={t('staffAbsence.fields.from')} error={err('startsOn')}>
                <Input
                  id="absence-from"
                  type="date"
                  value={draft.startsOn}
                  min={asAdmin ? addDays(today, -30) : today}
                  onChange={(e) => set({ startsOn: e.target.value, endsOn: draft.endsOn && draft.endsOn < e.target.value ? e.target.value : draft.endsOn })}
                  onBlur={() => setTouched((s) => ({ ...s, startsOn: true }))}
                  className={cn(err('startsOn') && invalidFieldClass)}
                />
              </FormField>
              <FormField id="absence-to" label={t('staffAbsence.fields.to')} error={err('endsOn')}>
                <Input
                  id="absence-to"
                  type="date"
                  value={draft.endsOn}
                  min={draft.startsOn || undefined}
                  onChange={(e) => set({ endsOn: e.target.value })}
                  onBlur={() => setTouched((s) => ({ ...s, endsOn: true }))}
                  className={cn(err('endsOn') && invalidFieldClass)}
                />
              </FormField>
            </div>
            {days > 0 ? (
              <p className="flex items-center gap-1.5 rounded-lg bg-surface-high px-3 py-2 text-sm text-on-surface" aria-live="polite">
                <MaterialSymbol name="date_range" size="text-base" className="text-primary" />
                {t('staffAbsence.summary', {
                  count: days,
                  from: formatDay(draft.startsOn, { weekday: 'short', day: 'numeric', month: 'short' }),
                  to: formatDay(draft.endsOn, { weekday: 'short', day: 'numeric', month: 'short' }),
                })}
              </p>
            ) : null}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-on-surface">{t('staffAbsence.fields.reason')}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t('staffAbsence.fields.reason')}>
              {ABSENCE_REASONS.map((reason) => {
                const selected = draft.reason === reason;
                return (
                  <button
                    key={reason}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => set({ reason })}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-start text-sm font-medium transition-colors',
                      selected ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface hover:border-primary/60',
                    )}
                  >
                    <MaterialSymbol name={REASON_ICON[reason]} size="text-lg" />
                    {t(`staffAbsence.reasons.${reason}`)}
                  </button>
                );
              })}
            </div>
            {err('reason') ? <p id="absence-reason-error" role="alert" className="text-xs text-error">{err('reason')}</p> : null}
          </fieldset>

          <FormField id="absence-note" label={t('staffAbsence.fields.note')} optional error={err('note')} hint={t('staffAbsence.fields.noteHint')}>
            <Textarea
              id="absence-note"
              className={cn('min-h-20 text-sm', err('note') && invalidFieldClass)}
              value={draft.note}
              onChange={(e) => set({ note: e.target.value })}
              onBlur={() => setTouched((s) => ({ ...s, note: true }))}
            />
          </FormField>

          {includesToday ? (
            <p className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-on-surface">
              <MaterialSymbol name="swap_horiz" size="text-lg" className="text-primary" />
              {t('staffAbsence.dialog.coverNote')}
            </p>
          ) : null}

          <FormProblem message={problem} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={report.isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={report.isPending}>
              {report.isPending ? t('common.saving') : t(asAdmin ? 'staffAbsence.dialog.record' : 'staffAbsence.dialog.report')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
