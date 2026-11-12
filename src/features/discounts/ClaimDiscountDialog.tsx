import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { FileDropzoneWithPreview } from '@/components/signup/FileDropzoneWithPreview';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FieldError } from '@/components/ui/FieldError';
import { FormProblem } from '@/components/ui/FormField';
import { LoadError } from '@/components/ui/LoadError';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

import { discountErrorKey, localText, partnerName } from './discountLook';
import { PROOF_MAX_BYTES, proofFileIssue, suggestPartners, type DiscountPartner } from './discounts';
import { PartnerOfferCard } from './PartnerOfferCard';
import { useClaimPartnerDiscount, usePartnerOffers } from './useDiscounts';

/**
 * A family asks for a partner's discount from its invoices page: it picks where it works (the
 * partner its job points to comes first), attaches the proof the partner needs, and sends. Without a
 * proof needed the discount starts at once; otherwise the nursery checks it first.
 */
export function ClaimDiscountDialog({
  nurseryId,
  parentId,
  jobs = [],
  claimedPartnerIds,
  onClose,
}: {
  nurseryId: string;
  parentId: string;
  /** What the family wrote as its jobs, to suggest the partner. */
  jobs?: (string | null | undefined)[];
  /** Partners the family already has or asked for. */
  claimedPartnerIds: ReadonlySet<string>;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const offers = usePartnerOffers(nurseryId);
  const run = useClaimPartnerDiscount();
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [proof, setProof] = useState<File | null>(null);
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const available = (offers.data ?? []).filter((offer) => !claimedPartnerIds.has(offer.id));
  const suggested = suggestPartners(jobs, available);
  const suggestedIds = new Set(suggested.map((offer) => offer.id));
  const ordered: DiscountPartner[] = [...suggested, ...available.filter((offer) => !suggestedIds.has(offer.id))];
  const partner = ordered.find((offer) => offer.id === partnerId) ?? null;
  const proofIssue = partner?.requiresProof ? (proof ? proofFileIssue(proof) : 'proofRequired') : null;
  const partnerIssue = partner ? null : 'partnerRequired';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (partnerIssue || proofIssue || !partner || run.isPending) return;
    setProblem(null);
    try {
      const result = await run.mutateAsync({ nurseryId, parentId, partnerId: partner.id, proof: partner.requiresProof ? proof : null });
      toast.success(
        result.state === 'pending'
          ? t('discounts.claim.sentForReview', { partner: partnerName(partner, isArabic) })
          : t('discounts.claim.granted', { partner: partnerName(partner, isArabic) }),
      );
      onClose();
    } catch (error) {
      setProblem(t(discountErrorKey(error)));
    }
  };

  const proofNote = partner ? localText(partner.proofNoteAr, partner.proofNoteEn, isArabic) : null;
  return (
    <Dialog open onOpenChange={(open) => !open && !run.isPending && onClose()}>
      <DialogContent className="max-w-xl" data-testid="claim-discount-dialog">
        <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('discounts.claim.title')}</DialogTitle>
            <DialogDescription>{t('discounts.claim.body')}</DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto pe-1">
            {offers.isError ? (
              <LoadError message={t(discountErrorKey(offers.error))} onRetry={() => void offers.refetch()} />
            ) : offers.isLoading ? (
              <p className="text-sm text-on-surface-variant">{t('common.loading')}</p>
            ) : ordered.length === 0 ? (
              <p className="rounded-xl border border-dashed border-outline-variant px-3 py-6 text-center text-sm text-on-surface-variant">
                {t('discounts.claim.noOffers')}
              </p>
            ) : (
              <div role="radiogroup" aria-label={t('discounts.claim.where')} className="space-y-2">
                {ordered.map((offer) => (
                  <PartnerOfferCard
                    key={offer.id}
                    partner={offer}
                    suggested={suggestedIds.has(offer.id)}
                    selected={offer.id === partnerId}
                    onSelect={() => {
                      setPartnerId(offer.id);
                      setProblem(null);
                    }}
                  />
                ))}
              </div>
            )}
            <FieldError message={tried && partnerIssue && ordered.length > 0 ? t(`discounts.form.errors.${partnerIssue}`) : null} />

            {partner?.requiresProof ? (
              <div>
                <FileDropzoneWithPreview
                  label={t('discounts.claim.proof')}
                  hint={proofNote ?? t('discounts.claim.proofHint')}
                  required
                  file={proof}
                  freeBytes={PROOF_MAX_BYTES}
                  onChange={(file) => {
                    setProof(file);
                    setProblem(null);
                  }}
                  error={tried && proofIssue ? t(`discounts.form.errors.${proofIssue}`) : undefined}
                />
              </div>
            ) : null}
          </div>

          <FormProblem message={problem} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={run.isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={run.isPending || ordered.length === 0}>
              <MaterialSymbol name="send" size="text-base" />
              {run.isPending ? t('common.saving') : t('discounts.claim.send')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
