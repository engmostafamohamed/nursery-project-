import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { StatusPill, TableCard } from '@/components/ui/DataTable';
import { LoadError } from '@/components/ui/LoadError';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { SignedFileLink } from '@/components/ui/SignedFileLink';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminLinks } from '@/hooks/useAdminBasePath';
import { useMoney } from '@/hooks/useMoney';
import { localName } from '@/lib/bilingualName';

import { ClaimDiscountDialog } from './ClaimDiscountDialog';
import { DecideClaimDialog, EndDiscountDialog } from './DiscountActionDialogs';
import { appliesText, discountErrorKey, partnerName, partnerValueText, useBeneficiaryPeriod } from './discountLook';
import { beneficiaryStateTone, PARTNER_KIND_ICON, suggestPartners, type DiscountPartner, type FamilyRef, type PartnerBeneficiary } from './discounts';
import { PROOF_BUCKET } from './discountsApi';
import { GrantDiscountDialog } from './GrantDiscountDialog';
import { usePartnersPage, useFamilyDiscounts } from './useDiscounts';

type Dialog =
  | { kind: 'claim' }
  | { kind: 'grant'; partner?: DiscountPartner }
  | { kind: 'decide'; beneficiary: PartnerBeneficiary; approve: boolean }
  | { kind: 'end'; beneficiary: PartnerBeneficiary }
  | null;

/**
 * A family's discounts in one card: its partnerships in every state (with the proof, the decision
 * and what each has taken off), the sibling discount on its children, and the nursery's cap on
 * combined discounts. The family asks for a partner's discount here; the nursery's staff confirm,
 * reject, end or add one. Used on a child's billing, an application's review and the parent's invoices.
 */
export function FamilyDiscountsCard({
  nurseryId,
  audience,
  family,
  jobs = [],
  className,
}: {
  nurseryId: string;
  audience: 'staff' | 'family';
  /** The family (staff); the signed-in family reads its own without it. */
  family: FamilyRef;
  /** What the parents wrote as their jobs: a partner they point to is suggested. */
  jobs?: (string | null | undefined)[];
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const money = useMoney();
  const links = useAdminLinks();
  const period = useBeneficiaryPeriod();
  const staff = audience === 'staff';
  const discounts = useFamilyDiscounts(nurseryId, staff ? family.parentId : null);
  // Staff see which partner the parents' jobs point to, among the branch's running partners.
  const partners = usePartnersPage(staff && discounts.data?.canManage ? nurseryId : null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const data = discounts.data;
  const canManage = staff && Boolean(data?.canManage);
  const partnerships = data?.partnerships ?? [];
  const openIds = new Set(partnerships.filter((b) => ['pending', 'active', 'scheduled'].includes(b.state)).map((b) => b.partnerId));
  const hint = staff
    ? suggestPartners(jobs, (partners.data?.partners ?? []).filter((p) => (p.state === 'active' || p.state === 'ending_soon') && !openIds.has(p.id)))[0]
    : undefined;
  const sibling = data?.sibling;
  const siblingChildren = sibling?.enabled ? sibling.children : [];

  const action = staff ? (
    canManage ? (
      <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ kind: 'grant' })} data-testid="family-grant-discount">
        <MaterialSymbol name="add" size="text-base" />
        {t('discounts.family.addPartnership')}
      </Button>
    ) : null
  ) : (
    <Button type="button" size="sm" onClick={() => setDialog({ kind: 'claim' })} data-testid="family-claim-discount">
      <MaterialSymbol name="sell" size="text-base" />
      {t('discounts.family.askForDiscount')}
    </Button>
  );

  return (
    <TableCard
      title={staff ? t('discounts.family.staffTitle') : t('discounts.family.title')}
      description={data ? t('discounts.family.capNote', { percent: data.maxTotalPercentage }) : undefined}
      actions={action}
      className={className}
    >
      {discounts.isError ? (
        <LoadError inset message={t(discountErrorKey(discounts.error))} onRetry={() => void discounts.refetch()} />
      ) : !data ? (
        <div className="space-y-2 p-4 sm:p-5">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      ) : (
        <div className="divide-y divide-outline-variant" data-testid="family-discounts">
          {hint ? (
            <div className="flex flex-wrap items-center gap-3 bg-primary/5 px-4 py-3 text-sm sm:px-5">
              <MaterialSymbol name="auto_awesome" className="text-primary" />
              <span className="min-w-0 flex-1 text-on-surface">
                {t('discounts.family.jobHint', { partner: partnerName(hint, isArabic), value: partnerValueText(t, hint) })}
              </span>
              <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ kind: 'grant', partner: hint })}>
                {t('discounts.family.givePartner', { partner: partnerName(hint, isArabic) })}
              </Button>
            </div>
          ) : null}

          {partnerships.length === 0 && siblingChildren.length < 2 ? (
            <div className="flex items-start gap-3 px-4 py-5 sm:px-5">
              <MaterialSymbol name="sell" className="text-on-surface-variant" />
              <div className="text-sm">
                <p className="font-medium text-on-surface">{t('discounts.family.none')}</p>
                <p className="mt-0.5 text-on-surface-variant">{staff ? t('discounts.family.noneStaffHint') : t('discounts.family.noneFamilyHint')}</p>
              </div>
            </div>
          ) : null}

          {partnerships.map((b) => {
            const partner = b.partner;
            if (!partner) return null;
            const name = partnerName(partner, isArabic);
            return (
              <div key={b.id} className="flex flex-wrap items-start gap-3 px-4 py-3.5 sm:px-5" data-testid={`family-discount-${b.id}`}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <MaterialSymbol name={PARTNER_KIND_ICON[partner.kind]} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {staff ? (
                      <Link to={links.partnerPage(partner.id)} className="font-semibold text-on-surface hover:text-primary hover:underline">
                        {name}
                      </Link>
                    ) : (
                      <span className="font-semibold text-on-surface">{name}</span>
                    )}
                    <StatusPill tone={beneficiaryStateTone(b.state)}>{t(`discounts.beneficiaryStates.${b.state}`)}</StatusPill>
                  </div>
                  <p className="mt-0.5 text-xs text-on-surface-variant">
                    {partnerValueText(t, partner)} · {appliesText(t, partner.appliesTo)}
                  </p>
                  <p className="text-xs text-on-surface-variant">{period(b)}</p>
                  {b.state === 'pending' && !staff ? <p className="mt-1 text-xs text-warning">{t('discounts.family.pendingFamilyNote')}</p> : null}
                  {b.decisionNote && (b.state === 'rejected' || staff) ? (
                    <p className={b.state === 'rejected' ? 'mt-1 text-xs text-error' : 'mt-1 text-xs italic text-on-surface-variant'}>
                      {b.state === 'rejected' ? t('discounts.family.rejectedReason', { reason: b.decisionNote }) : `“${b.decisionNote}”`}
                    </p>
                  ) : null}
                  {b.proofPath ? (
                    <SignedFileLink bucket={PROOF_BUCKET} path={b.proofPath} label={t('discounts.family.viewProof')} className="mt-1.5" />
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {b.given > 0 ? (
                    <span className="text-xs text-on-surface-variant">
                      {t('discounts.family.givenSoFar')} <span className="font-semibold tabular-nums text-success">{money(b.given)}</span>
                    </span>
                  ) : null}
                  {canManage && b.state === 'pending' ? (
                    <div className="flex gap-1.5">
                      <Button type="button" size="sm" onClick={() => setDialog({ kind: 'decide', beneficiary: b, approve: true })}>
                        {t('discounts.decide.approve')}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ kind: 'decide', beneficiary: b, approve: false })}>
                        {t('discounts.decide.reject')}
                      </Button>
                    </div>
                  ) : null}
                  {canManage && (b.state === 'active' || b.state === 'scheduled') ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ kind: 'end', beneficiary: b })}>
                      {t('discounts.end.action')}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}

          {sibling?.enabled && siblingChildren.length >= 2 ? (
            <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
                <MaterialSymbol name="diversity_1" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-on-surface">{t('discounts.family.siblingTitle')}</p>
                <ul className="mt-1 space-y-0.5 text-xs text-on-surface-variant">
                  {siblingChildren.map((child) => {
                    const percent = child.rank === 2 ? sibling.secondPercentage : child.rank >= 3 ? sibling.thirdPercentage : 0;
                    return (
                      <li key={child.childId}>
                        {localName(child.nameAr, child.nameEn, isArabic)} ·{' '}
                        {percent > 0 ? t('discounts.family.siblingOff', { percent }) : t('discounts.family.siblingFirst')}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {dialog?.kind === 'claim' ? (
        <ClaimDiscountDialog nurseryId={nurseryId} parentId={family.parentId} jobs={jobs} claimedPartnerIds={openIds} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'grant' && data ? (
        <GrantDiscountDialog nurseryId={nurseryId} today={data.today} family={family} partner={dialog.partner} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'decide' && dialog.beneficiary.partner ? (
        <DecideClaimDialog target={{ beneficiary: { ...dialog.beneficiary, family }, partner: dialog.beneficiary.partner }} approve={dialog.approve} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'end' && dialog.beneficiary.partner && data ? (
        <EndDiscountDialog target={{ beneficiary: { ...dialog.beneficiary, family }, partner: dialog.beneficiary.partner }} today={data.today} onClose={() => setDialog(null)} />
      ) : null}
    </TableCard>
  );
}
