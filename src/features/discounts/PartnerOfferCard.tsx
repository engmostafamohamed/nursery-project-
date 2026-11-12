import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

import { appliesText, localText, partnerName, partnerValueText, validityText } from './discountLook';
import { PARTNER_KIND_ICON, type DiscountPartner } from './discounts';

/**
 * A partner's offer as a family sees it: who, how much, on what, until when, the details and the
 * proof it needs. A button when `onSelect` is given (choosing a workplace), else a plain card.
 */
export function PartnerOfferCard({
  partner,
  selected = false,
  onSelect,
  suggested = false,
  className,
}: {
  partner: DiscountPartner;
  selected?: boolean;
  onSelect?: () => void;
  /** The family's job points to it. */
  suggested?: boolean;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const details = localText(partner.offerDetailsAr, partner.offerDetailsEn, isArabic);
  const proofNote = localText(partner.proofNoteAr, partner.proofNoteEn, isArabic);
  const disabled = partner.full;

  const body = (
    <>
      <span className="flex w-full items-start gap-3">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            selected ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
          )}
        >
          <MaterialSymbol name={PARTNER_KIND_ICON[partner.kind]} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-on-surface">{partnerName(partner, isArabic)}</span>
            {suggested ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                <MaterialSymbol name="auto_awesome" size="text-xs" />
                {t('discounts.offer.suggested')}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-xs text-on-surface-variant">
            {t(`discounts.kinds.${partner.kind}`)} · {appliesText(t, partner.appliesTo)} · {validityText(t, partner.endsOn)}
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-xs font-bold text-success">
          {partnerValueText(t, partner)}
        </span>
      </span>
      {details ? <span className="mt-2 block whitespace-pre-line text-xs leading-5 text-on-surface-variant">{details}</span> : null}
      <span className="mt-2 flex items-start gap-1.5 text-xs text-on-surface-variant">
        <MaterialSymbol name={partner.requiresProof ? 'badge' : 'bolt'} size="text-sm" className={partner.requiresProof ? 'text-warning' : 'text-success'} />
        <span>
          {partner.requiresProof ? (proofNote ? t('discounts.offer.proofNeededWith', { note: proofNote }) : t('discounts.offer.proofNeeded')) : t('discounts.offer.noProof')}
        </span>
      </span>
      {disabled ? <span className="mt-2 block text-xs font-medium text-error">{t('discounts.offer.full')}</span> : null}
    </>
  );

  const frame = cn(
    'block w-full rounded-xl border p-3.5 text-start transition-colors',
    selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-outline-variant bg-surface',
    className,
  );

  if (!onSelect) return <div className={frame}>{body}</div>;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(frame, 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary enabled:hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60')}
    >
      {body}
    </button>
  );
}
