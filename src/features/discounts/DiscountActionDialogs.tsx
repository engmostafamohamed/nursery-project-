import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ChoiceCards } from '@/components/ui/ChoiceCards';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { invalidFieldClass } from '@/components/ui/FieldError';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { SignedFileLink } from '@/components/ui/SignedFileLink';
import { Textarea } from '@/components/ui/textarea';
import { formatDay } from '@/lib/datetime';
import { cn } from '@/lib/utils';

import { discountErrorKey, familyName, partnerName, partnerValueText } from './discountLook';
import type { DiscountPartner, PartnerBeneficiary } from './discounts';
import { PROOF_BUCKET } from './discountsApi';
import { useDecideClaim, useEndBeneficiary } from './useDiscounts';

type Target = { beneficiary: PartnerBeneficiary; partner: Pick<DiscountPartner, 'nameAr' | 'nameEn' | 'discountType' | 'discountValue'> };

/** Who asked, for which partner, with what proof: the top of both dialogs. */
function ClaimSummary({ beneficiary, partner }: Target) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-sm">
      <p className="font-semibold text-on-surface">{familyName(beneficiary.family, isArabic)}</p>
      <p className="mt-0.5 text-xs text-on-surface-variant">
        {partnerName(partner, isArabic)} · {partnerValueText(t, partner)}
      </p>
      {beneficiary.proofPath ? (
        <SignedFileLink bucket={PROOF_BUCKET} path={beneficiary.proofPath} label={t('discounts.family.viewProof')} className="mt-2" />
      ) : null}
    </div>
  );
}

/**
 * Confirming or rejecting a family's request. A rejection needs its reason (the family reads it);
 * a confirmation may carry a note.
 */
export function DecideClaimDialog({ target, approve, onClose }: { target: Target; approve: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = useDecideClaim();
  const issue = !approve && note.trim().length < 3 ? 'reasonRequired' : note.trim().length > 300 ? 'tooLong' : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (issue || run.isPending) return;
    setProblem(null);
    try {
      await run.mutateAsync({ beneficiaryId: target.beneficiary.id, approve, note });
      toast.success(approve ? t('discounts.decide.approved') : t('discounts.decide.rejected'));
      onClose();
    } catch (error) {
      setProblem(t(discountErrorKey(error)));
    }
  };

  const showIssue = tried && issue ? t(`discounts.form.errors.${issue}`) : null;
  return (
    <Dialog open onOpenChange={(open) => !open && !run.isPending && onClose()}>
      <DialogContent className="max-w-md" data-testid="decide-claim-dialog">
        <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{approve ? t('discounts.decide.approveTitle') : t('discounts.decide.rejectTitle')}</DialogTitle>
            <DialogDescription>{approve ? t('discounts.decide.approveBody') : t('discounts.decide.rejectBody')}</DialogDescription>
          </DialogHeader>
          <ClaimSummary {...target} />
          <FormField
            id="decide-note"
            label={approve ? t('discounts.decide.note') : t('discounts.decide.reason')}
            optional={approve}
            error={showIssue}
          >
            <Textarea
              id="decide-note"
              className={cn('min-h-20 text-sm', showIssue && invalidFieldClass)}
              value={note}
              aria-invalid={Boolean(showIssue)}
              onChange={(e) => setNote(e.target.value)}
              placeholder={approve ? t('discounts.decide.notePlaceholder') : t('discounts.decide.reasonPlaceholder')}
            />
          </FormField>
          <FormProblem message={problem} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={run.isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant={approve ? 'default' : 'destructive'} disabled={run.isPending}>
              <MaterialSymbol name={approve ? 'check' : 'close'} size="text-base" />
              {run.isPending ? t('common.saving') : approve ? t('discounts.decide.approve') : t('discounts.decide.reject')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Ending a family's discount: now (it stops on the next invoice) or after a chosen last day.
 * The family is told once it has ended.
 */
export function EndDiscountDialog({ target, today, onClose }: { target: Target; today: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [lastDay, setLastDay] = useState(today);
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = useEndBeneficiary();
  const issue = when === 'later' && (!lastDay || lastDay < today) ? 'lastDayInvalid' : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (issue || run.isPending) return;
    setProblem(null);
    try {
      await run.mutateAsync({ beneficiaryId: target.beneficiary.id, lastDay: when === 'later' ? lastDay : null });
      toast.success(when === 'now' ? t('discounts.end.endedNow') : t('discounts.end.endsOn', { date: formatDay(lastDay) }));
      onClose();
    } catch (error) {
      setProblem(t(discountErrorKey(error)));
    }
  };

  const showIssue = tried && issue ? t(`discounts.form.errors.${issue}`) : null;
  return (
    <Dialog open onOpenChange={(open) => !open && !run.isPending && onClose()}>
      <DialogContent className="max-w-md" data-testid="end-discount-dialog">
        <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('discounts.end.title')}</DialogTitle>
            <DialogDescription>{t('discounts.end.body')}</DialogDescription>
          </DialogHeader>
          <ClaimSummary {...target} />
          <ChoiceCards
            label={t('discounts.end.when')}
            value={when}
            onChange={setWhen}
            options={(['now', 'later'] as const).map((option) => ({
              value: option,
              label: t(`discounts.end.${option}`),
              hint: t(`discounts.end.${option}Hint`),
              icon: option === 'now' ? 'block' : 'event',
            }))}
          />
          {when === 'later' ? (
            <FormField id="end-last-day" label={t('discounts.end.lastDay')} hint={t('discounts.end.lastDayHint')} error={showIssue}>
              <Input
                id="end-last-day"
                type="date"
                min={today}
                value={lastDay}
                aria-invalid={Boolean(showIssue)}
                className={cn(showIssue && invalidFieldClass)}
                onChange={(e) => setLastDay(e.target.value)}
              />
            </FormField>
          ) : null}
          <FormProblem message={problem} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={run.isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="destructive" disabled={run.isPending}>
              {run.isPending ? t('common.saving') : t('discounts.end.confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
