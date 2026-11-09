import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { invalidFieldClass } from '@/components/ui/FieldError';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { NOTE_MAX, SKIP_REASONS, skipIssue, type RoundSlot, type SkipReason } from './medicineRound';
import { recordDose, roundErrorKey } from './medicineRoundApi';
import { useRoundChange } from './useMedicineRound';

const REASON_ICON: Record<SkipReason, string> = { absent: 'person_off', refused: 'do_not_touch', parent_gave: 'family_restroom', not_needed: 'healing', other: 'more_horiz' };

/**
 * Recording one dose: given (with an optional note), or not given with the reason the parents will
 * read. Shows what to give and how before confirming.
 */
export function RecordDoseDialog({ slot, mode, onClose }: { slot: RoundSlot; mode: 'given' | 'skipped'; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const m = slot.medicine;
  const child = (isArabic ? m.nameAr || m.nameEn : m.nameEn || m.nameAr) || '—';
  const [reason, setReason] = useState<SkipReason | ''>('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const issue = mode === 'skipped' ? skipIssue(reason, note) : note.trim().length > NOTE_MAX ? 'note_too_long' : null;
  const run = useRoundChange(() => recordDose({ medicationId: m.medicationId, time: slot.time, status: mode, reason: reason || null, note }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (issue || run.isPending) return;
    setProblem(null);
    try {
      await run.mutateAsync(undefined);
      toast.success(t(mode === 'given' ? 'medicineRound.recordedGiven' : 'medicineRound.recordedSkipped', { medicine: m.medicine, child }));
      onClose();
    } catch (error) {
      setProblem(t(roundErrorKey(error)));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !run.isPending && onClose()}>
      <DialogContent className="max-w-md" data-testid="record-dose-dialog">
        <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t(mode === 'given' ? 'medicineRound.dialog.givenTitle' : 'medicineRound.dialog.skippedTitle', { medicine: m.medicine, child })}</DialogTitle>
            <DialogDescription>{t(mode === 'given' ? 'medicineRound.dialog.givenHint' : 'medicineRound.dialog.skippedHint')}</DialogDescription>
          </DialogHeader>

          <dl className="grid grid-cols-2 gap-2 rounded-xl bg-surface-high p-3 text-sm">
            <div><dt className="text-xs text-on-surface-variant">{t('medicineRound.dose')}</dt><dd className="font-semibold text-on-surface">{m.dosage ?? '—'}</dd></div>
            <div><dt className="text-xs text-on-surface-variant">{t('medicineRound.time')}</dt><dd className="font-semibold text-on-surface" dir="ltr">{slot.time ?? t('medicineRound.whenNeeded')}</dd></div>
            <div><dt className="text-xs text-on-surface-variant">{t('medicineRound.method')}</dt><dd className="text-on-surface">{t(`health.method.${m.method}`, { defaultValue: m.method })}</dd></div>
            {m.instructions ? <div><dt className="text-xs text-on-surface-variant">{t('medicineRound.instructions')}</dt><dd className="text-on-surface">{m.instructions}</dd></div> : null}
          </dl>

          {mode === 'skipped' ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-on-surface">{t('medicineRound.dialog.why')}</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('medicineRound.dialog.why')}>
                {SKIP_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={reason === r}
                    onClick={() => setReason(r)}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2 text-start text-sm font-medium transition-colors',
                      reason === r ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface hover:border-primary/60',
                    )}
                  >
                    <MaterialSymbol name={REASON_ICON[r]} size="text-lg" />
                    {t(`medicineRound.reasons.${r}`)}
                  </button>
                ))}
              </div>
              {tried && issue === 'reason_required' ? <p id="dose-reason-error" role="alert" className="text-xs text-error">{t('medicineRound.issues.reason_required')}</p> : null}
            </fieldset>
          ) : null}

          <FormField
            id="dose-note"
            label={t('medicineRound.dialog.note')}
            optional={!(mode === 'skipped' && reason === 'other')}
            error={tried && (issue === 'note_required' || issue === 'note_too_long') ? t(`medicineRound.issues.${issue}`, { max: NOTE_MAX }) : null}
            hint={t('medicineRound.dialog.noteHint')}
          >
            <Textarea id="dose-note" className={cn('min-h-16 text-sm', tried && (issue === 'note_required' || issue === 'note_too_long') && invalidFieldClass)}
              value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>

          <FormProblem message={problem} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={run.isPending}>{t('common.cancel')}</Button>
            <Button type="submit" variant={mode === 'given' ? 'default' : 'destructive'} disabled={run.isPending}>
              {run.isPending ? t('common.saving') : t(mode === 'given' ? 'medicineRound.dialog.confirmGiven' : 'medicineRound.dialog.confirmSkipped')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
