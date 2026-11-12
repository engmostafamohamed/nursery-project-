/* How discounts read on screen: the offer's value, what it applies to, until when, and why a call failed. */
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { dealDiscountLabel } from '@/components/admin/settings/dealLabels';
import { localName } from '@/lib/bilingualName';
import { formatDate, formatDay } from '@/lib/datetime';
import { errorTextKey } from '@/lib/errorCode';

import { PARTNER_ERROR_CODES, type DiscountPartner, type FamilyRef, type PartnerApplies, type PartnerBeneficiary } from './discounts';

/** "15% off" / "EGP 200 off". */
export const partnerValueText = (t: TFunction, partner: Pick<DiscountPartner, 'discountType' | 'discountValue'>) =>
  dealDiscountLabel(t, { discount_type: partner.discountType, discount_value: partner.discountValue });

/** "Tuition and extra hours". */
export function appliesText(t: TFunction, appliesTo: readonly PartnerApplies[]): string {
  const parts = appliesTo.map((scope) => t(`discounts.applies.${scope}`));
  return parts.length > 1 ? t('discounts.applies.both', { first: parts[0], second: parts[1] }) : (parts[0] ?? '—');
}

/** "Until 31 Dec 2026" or "No end date". */
export const validityText = (t: TFunction, endsOn: string | null) =>
  endsOn ? t('discounts.validUntil', { date: formatDay(endsOn) }) : t('discounts.noEndDate');

export const partnerName = (partner: Pick<DiscountPartner, 'nameAr' | 'nameEn'>, isArabic: boolean) =>
  localName(partner.nameAr, partner.nameEn, isArabic) || '—';

export const familyName = (family: Pick<FamilyRef, 'nameAr' | 'nameEn'>, isArabic: boolean) =>
  localName(family.nameAr, family.nameEn, isArabic) || '—';

/** The family's children at the branch, "Salma, Omar". */
export const familyChildren = (family: Pick<FamilyRef, 'children'>, isArabic: boolean) =>
  family.children.map((child) => localName(child.nameAr, child.nameEn, isArabic)).filter(Boolean).join(isArabic ? '، ' : ', ');

/** The partner's offer details or proof note in the reader's language. */
export const localText = (ar: string | null, en: string | null, isArabic: boolean) => localName(ar, en, isArabic) || null;

/** Since when / until when a family's discount runs, as one line. */
export function useBeneficiaryPeriod() {
  const { t } = useTranslation();
  return (b: PartnerBeneficiary) => {
    if (b.state === 'pending') return t('discounts.family.askedOn', { date: formatDate(b.claimedAt) });
    if (b.state === 'rejected') return b.decidedAt ? t('discounts.family.rejectedOn', { date: formatDate(b.decidedAt) }) : '';
    if (b.state === 'ended') return b.endsOn ? t('discounts.family.endedOn', { date: formatDay(b.endsOn) }) : '';
    if (b.state === 'scheduled') return t('discounts.family.startsOn', { date: formatDay(b.validFrom) });
    return b.endsOn
      ? t('discounts.family.activeUntil', { from: formatDay(b.validFrom), to: formatDay(b.endsOn) })
      : t('discounts.family.activeSince', { date: formatDay(b.validFrom) });
  };
}

/** The text key explaining why a discount call failed. */
export const discountErrorKey = (error: unknown) => errorTextKey(error, PARTNER_ERROR_CODES, 'discounts.errors', 'partner_');
