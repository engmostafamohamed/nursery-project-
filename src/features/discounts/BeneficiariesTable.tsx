import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { DataTable, StatusPill, TBody, THead, Td, Th, Tr } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { SignedFileLink } from '@/components/ui/SignedFileLink';
import { useMoney } from '@/hooks/useMoney';
import { localName } from '@/lib/bilingualName';

import { familyChildren, familyName, useBeneficiaryPeriod } from './discountLook';
import { beneficiaryStateTone, type PartnerBeneficiary } from './discounts';
import { PROOF_BUCKET } from './discountsApi';

/**
 * A partner's families at this branch: who, where their discount stands, the proof they sent,
 * what it has taken off, and the decision. Waiting requests carry Confirm / Reject; running ones End.
 */
export function BeneficiariesTable({
  rows,
  canManage,
  onDecide,
  onEnd,
}: {
  rows: PartnerBeneficiary[];
  canManage: boolean;
  onDecide: (beneficiary: PartnerBeneficiary, approve: boolean) => void;
  onEnd: (beneficiary: PartnerBeneficiary) => void;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const money = useMoney();
  const period = useBeneficiaryPeriod();

  return (
    <DataTable minWidth={720}>
      <THead>
        <Th>{t('discounts.detail.columns.family')}</Th>
        <Th>{t('discounts.detail.columns.state')}</Th>
        <Th align="end">{t('discounts.detail.columns.given')}</Th>
        {canManage ? <Th align="end">{t('discounts.detail.columns.actions')}</Th> : null}
      </THead>
      <TBody>
        {rows.map((b) => {
          const name = familyName(b.family, isArabic);
          const decidedBy = b.decidedBy ? localName(b.decidedBy.ar, b.decidedBy.en, isArabic) : '';
          return (
            <Tr key={b.id} data-testid={`beneficiary-${b.id}`}>
              <Td className="max-w-[240px]">
                <p className="truncate font-semibold text-on-surface">{name}</p>
                <p className="truncate text-xs text-on-surface-variant">{familyChildren(b.family, isArabic) || '—'}</p>
                {b.family.phone ? (
                  <p className="text-xs text-on-surface-variant" dir="ltr">
                    {b.family.phone}
                  </p>
                ) : null}
              </Td>
              <Td>
                <StatusPill tone={beneficiaryStateTone(b.state)}>{t(`discounts.beneficiaryStates.${b.state}`)}</StatusPill>
                <p className="mt-1 text-xs text-on-surface-variant">{period(b)}</p>
                <p className="text-xs text-on-surface-variant">
                  {b.claimedByFamily ? t('discounts.family.askedByFamily') : t('discounts.family.addedByNursery')}
                  {decidedBy && b.state !== 'pending' ? ` · ${t('discounts.family.decidedBy', { name: decidedBy })}` : ''}
                </p>
                {b.decisionNote ? <p className="mt-1 max-w-xs whitespace-pre-line text-xs italic text-on-surface-variant">“{b.decisionNote}”</p> : null}
                {b.proofPath ? (
                  <SignedFileLink bucket={PROOF_BUCKET} path={b.proofPath} label={t('discounts.family.viewProof')} className="mt-1.5" />
                ) : null}
              </Td>
              <Td align="end" className="tabular-nums text-on-surface">
                {money(b.given)}
              </Td>
              {canManage ? (
                <Td align="end">
                  {b.state === 'pending' ? (
                    <div className="flex justify-end gap-1.5">
                      <Button type="button" size="sm" onClick={() => onDecide(b, true)}>
                        <MaterialSymbol name="check" size="text-base" />
                        {t('discounts.decide.approve')}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => onDecide(b, false)}>
                        {t('discounts.decide.reject')}
                      </Button>
                    </div>
                  ) : b.state === 'active' || b.state === 'scheduled' ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => onEnd(b)}>
                      {t('discounts.end.action')}
                    </Button>
                  ) : null}
                </Td>
              ) : null}
            </Tr>
          );
        })}
      </TBody>
    </DataTable>
  );
}
