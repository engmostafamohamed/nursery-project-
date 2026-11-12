import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { localText, partnerName, partnerValueText } from '@/features/discounts/discountLook';
import { suggestPartners, type DiscountPartner } from '@/features/discounts/discounts';
import { PartnerOfferCard } from '@/features/discounts/PartnerOfferCard';
import { useMoney } from '@/hooks/useMoney';
import { cn } from '@/lib/utils';

import { FileDropzoneWithPreview } from './FileDropzoneWithPreview';

type Props = {
  offers: DiscountPartner[];
  /** What the parents wrote as their jobs: the partner they point to is suggested first. */
  jobs: (string | null | undefined)[];
  partnerId: string | null;
  onPartnerChange: (partnerId: string | null) => void;
  proof: File | null;
  onProofChange: (file: File | null) => void;
  /** Room left in the sign-up's request for the proof. */
  proofFreeBytes: number;
  /** A partner needing a proof: what its discount would take off once confirmed. */
  expectedAmount: number | null;
  /** The parent tried to go on without the proof the partner needs. */
  showProofError: boolean;
};

/**
 * Sign-up: does a parent work at one of the nursery's partners? The partner their job points to is
 * suggested; choosing one shows its offer, takes the proof it needs, and says when the discount
 * starts (now, or once the nursery checks the proof).
 */
export function SignupPartnerSection({
  offers,
  jobs,
  partnerId,
  onPartnerChange,
  proof,
  onProofChange,
  proofFreeBytes,
  expectedAmount,
  showProofError,
}: Props) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const money = useMoney();
  const suggested = useMemo(() => suggestPartners(jobs, offers), [jobs, offers]);
  const suggestedIds = new Set(suggested.map((offer) => offer.id));
  const ordered = [...suggested, ...offers.filter((offer) => !suggestedIds.has(offer.id))];
  const chosen = offers.find((offer) => offer.id === partnerId) ?? null;
  const hint = !chosen ? suggested[0] : undefined;

  return (
    <div className="space-y-3" data-testid="signup-partners">
      {hint ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <MaterialSymbol name="auto_awesome" className="text-primary" />
          <p className="min-w-0 flex-1 text-sm text-on-surface">
            {t('discounts.signup.suggestion', { partner: partnerName(hint, isArabic), value: partnerValueText(t, hint) })}
          </p>
          <Button type="button" size="sm" onClick={() => onPartnerChange(hint.id)}>
            {t('discounts.signup.useOffer')}
          </Button>
        </div>
      ) : null}

      <div role="radiogroup" aria-label={t('discounts.signup.title')} className="grid gap-2">
        {ordered.map((offer) => (
          <PartnerOfferCard
            key={offer.id}
            partner={offer}
            suggested={suggestedIds.has(offer.id)}
            selected={offer.id === partnerId}
            onSelect={() => onPartnerChange(offer.id === partnerId ? null : offer.id)}
          />
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={partnerId === null}
          onClick={() => onPartnerChange(null)}
          className={cn(
            'flex min-h-16 items-center gap-3 rounded-xl border p-3.5 text-start text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            partnerId === null ? 'border-primary bg-primary/5 font-semibold text-primary ring-1 ring-primary' : 'border-outline-variant text-on-surface hover:border-primary/50',
          )}
        >
          <MaterialSymbol name="do_not_disturb_on" className="shrink-0" />
          {t('discounts.signup.none')}
        </button>
      </div>

      {chosen ? (
        chosen.requiresProof ? (
          <div className="space-y-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
            <p className="flex items-start gap-2 text-sm text-on-surface">
              <MaterialSymbol name="schedule" className="text-warning" />
              <span>
                {expectedAmount && expectedAmount > 0
                  ? t('discounts.signup.afterConfirmWithAmount', { partner: partnerName(chosen, isArabic), amount: money(expectedAmount) })
                  : t('discounts.signup.afterConfirm', { partner: partnerName(chosen, isArabic) })}
              </span>
            </p>
            <FileDropzoneWithPreview
              label={t('discounts.claim.proof')}
              hint={localText(chosen.proofNoteAr, chosen.proofNoteEn, isArabic) ?? t('discounts.claim.proofHint')}
              required
              file={proof}
              onChange={onProofChange}
              freeBytes={proofFreeBytes}
              error={showProofError && !proof ? t('discounts.form.errors.proofRequired') : undefined}
            />
          </div>
        ) : (
          <p className="flex items-start gap-2 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm text-on-surface">
            <MaterialSymbol name="check_circle" className="text-success" />
            {t('discounts.signup.appliedNow', { partner: partnerName(chosen, isArabic) })}
          </p>
        )
      ) : null}
    </div>
  );
}
