import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { StatusPill, TableCard, TableEmpty, TableLoading } from '@/components/ui/DataTable';
import { Fact, FactList } from '@/components/ui/FactList';
import { FilterChips } from '@/components/ui/FilterChips';
import { FormProblem } from '@/components/ui/FormField';
import { LoadError } from '@/components/ui/LoadError';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatTile } from '@/components/ui/StatTile';
import { BeneficiariesTable } from '@/features/discounts/BeneficiariesTable';
import { DecideClaimDialog, EndDiscountDialog } from '@/features/discounts/DiscountActionDialogs';
import { appliesText, discountErrorKey, localText, partnerName, partnerValueText, validityText } from '@/features/discounts/discountLook';
import { PARTNER_KIND_ICON, partnerStateTone, type BeneficiaryState, type PartnerBeneficiary } from '@/features/discounts/discounts';
import { GrantDiscountDialog } from '@/features/discounts/GrantDiscountDialog';
import { PartnerEditorDialog } from '@/features/discounts/PartnerEditorDialog';
import { usePartnerDetail, useSetPartnerActive } from '@/features/discounts/useDiscounts';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useMoney } from '@/hooks/useMoney';
import { formatDay } from '@/lib/datetime';

type StateFilter = 'all' | BeneficiaryState;
type Dialog =
  | { kind: 'edit' }
  | { kind: 'grant' }
  | { kind: 'decide'; beneficiary: PartnerBeneficiary; approve: boolean }
  | { kind: 'end'; beneficiary: PartnerBeneficiary }
  | null;

/**
 * One partner: its offer and agreement, and this branch's families who have its discount or asked
 * for it. Requests are confirmed or rejected (with the reason the family reads) here; the nursery
 * also adds a family by hand or ends one's discount.
 */
export function AdminPartnerPage() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const money = useMoney();
  const { partnerId } = useParams<{ partnerId: string }>();
  const { activeNurseryId: nurseryId } = useActiveNurseryId();
  const detail = usePartnerDetail(nurseryId, partnerId);
  const setActive = useSetPartnerActive();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [filter, setFilter] = useState<StateFilter>('all');
  const [problem, setProblem] = useState<string | null>(null);

  const beneficiaries = useMemo(() => detail.data?.beneficiaries ?? [], [detail.data?.beneficiaries]);
  const counts = useMemo(() => {
    const byState = { pending: 0, active: 0, scheduled: 0, ended: 0, rejected: 0 } as Record<BeneficiaryState, number>;
    for (const b of beneficiaries) byState[b.state] += 1;
    return byState;
  }, [beneficiaries]);
  const rows = filter === 'all' ? beneficiaries : beneficiaries.filter((b) => b.state === filter);

  if (detail.isError) {
    return (
      <div className="space-y-5 pb-8">
        <LoadError message={t(discountErrorKey(detail.error))} onRetry={() => void detail.refetch()} />
      </div>
    );
  }
  if (!detail.data || !nurseryId) {
    return (
      <div className="space-y-5 pb-8">
        <TableCard title={t('discounts.detail.families')}>
          <TableLoading />
        </TableCard>
      </div>
    );
  }

  const { partner, canManage, canEdit, today } = detail.data;
  const name = partnerName(partner, isArabic);
  const details = localText(partner.offerDetailsAr, partner.offerDetailsEn, isArabic);
  const proofNote = localText(partner.proofNoteAr, partner.proofNoteEn, isArabic);
  const given = beneficiaries.reduce((sum, b) => sum + b.given, 0);
  const canGrant = canManage && ['active', 'ending_soon', 'scheduled'].includes(partner.state);
  const target = (beneficiary: PartnerBeneficiary) => ({ beneficiary, partner });

  const togglePartner = async () => {
    setProblem(null);
    try {
      await setActive.mutateAsync({ nurseryId, partnerId: partner.id, active: !partner.active });
      toast.success(partner.active ? t('discounts.page.paused', { name }) : t('discounts.page.resumed', { name }));
    } catch (error) {
      setProblem(t(discountErrorKey(error)));
    }
  };

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        icon={PARTNER_KIND_ICON[partner.kind]}
        eyebrow={`${t(`discounts.kinds.${partner.kind}`)}${partner.scope === 'chain' ? ` · ${t('discounts.scope.chain')}` : ''}`}
        title={name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill tone={partnerStateTone(partner.state)}>{t(`discounts.partnerStates.${partner.state}`)}</StatusPill>
            <span className="font-semibold text-on-surface">{partnerValueText(t, partner)}</span>
            <span>· {appliesText(t, partner.appliesTo)}</span>
            <span>· {validityText(t, partner.endsOn)}</span>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canGrant ? (
              <Button type="button" onClick={() => setDialog({ kind: 'grant' })} data-testid="grant-family">
                <MaterialSymbol name="person_add" size="text-base" />
                {t('discounts.detail.addFamily')}
              </Button>
            ) : null}
            {canEdit ? (
              <>
                <Button type="button" variant="outline" onClick={() => setDialog({ kind: 'edit' })}>
                  <MaterialSymbol name="edit" size="text-base" />
                  {t('common.edit')}
                </Button>
                <Button type="button" variant="outline" onClick={() => void togglePartner()} disabled={setActive.isPending}>
                  <MaterialSymbol name={partner.active ? 'pause_circle' : 'play_circle'} size="text-base" />
                  {partner.active ? t('discounts.page.pause') : t('discounts.page.resume')}
                </Button>
              </>
            ) : null}
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile
            icon="family_restroom"
            label={t('discounts.detail.stats.families')}
            value={
              partner.maxFamilies !== null
                ? t('discounts.page.familiesOfMax', { count: counts.active + counts.scheduled, max: partner.maxFamilies })
                : counts.active + counts.scheduled
            }
            tone="success"
            onClick={() => setFilter((f) => (f === 'active' ? 'all' : 'active'))}
            active={filter === 'active'}
          />
          <StatTile
            icon="pending_actions"
            label={t('discounts.detail.stats.pending')}
            value={counts.pending}
            tone={counts.pending > 0 ? 'warning' : 'neutral'}
            onClick={() => setFilter((f) => (f === 'pending' ? 'all' : 'pending'))}
            active={filter === 'pending'}
          />
          <StatTile icon="savings" label={t('discounts.detail.stats.given')} value={money(given)} />
          <StatTile
            icon="event"
            label={t('discounts.detail.stats.ends')}
            value={partner.endsOn ? formatDay(partner.endsOn) : t('discounts.noEndDate')}
            tone={partner.state === 'ending_soon' || partner.state === 'expired' ? 'warning' : 'neutral'}
          />
        </div>
      </PageHeader>

      <FormProblem message={problem} />

      {/* The families first, full width; the agreement beside them only on very wide screens. */}
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px] 2xl:items-start">
        <TableCard
          title={t('discounts.detail.families')}
          count={t('discounts.page.familiesCount', { count: beneficiaries.length })}
          filters={
            beneficiaries.length ? (
              <FilterChips
                label={t('discounts.detail.filterLabel')}
                value={filter}
                onChange={setFilter}
                hideEmpty
                options={[
                  { value: 'all', label: t('discounts.detail.all'), count: beneficiaries.length },
                  { value: 'pending', label: t('discounts.beneficiaryStates.pending'), count: counts.pending },
                  { value: 'active', label: t('discounts.beneficiaryStates.active'), count: counts.active },
                  { value: 'scheduled', label: t('discounts.beneficiaryStates.scheduled'), count: counts.scheduled },
                  { value: 'ended', label: t('discounts.beneficiaryStates.ended'), count: counts.ended },
                  { value: 'rejected', label: t('discounts.beneficiaryStates.rejected'), count: counts.rejected },
                ]}
              />
            ) : null
          }
        >
          {beneficiaries.length === 0 ? (
            <TableEmpty
              icon="family_restroom"
              title={t('discounts.detail.emptyTitle')}
              description={t('discounts.detail.emptyBody')}
              action={
                canGrant ? (
                  <Button type="button" onClick={() => setDialog({ kind: 'grant' })}>
                    <MaterialSymbol name="person_add" size="text-base" />
                    {t('discounts.detail.addFamily')}
                  </Button>
                ) : null
              }
            />
          ) : rows.length === 0 ? (
            <TableEmpty icon="filter_alt_off" title={t('discounts.detail.noMatch')} />
          ) : (
            <BeneficiariesTable
              rows={rows}
              canManage={canManage}
              onDecide={(beneficiary, approve) => setDialog({ kind: 'decide', beneficiary, approve })}
              onEnd={(beneficiary) => setDialog({ kind: 'end', beneficiary })}
            />
          )}
        </TableCard>

        <TableCard title={t('discounts.detail.agreement')}>
          {details ? <p className="whitespace-pre-line border-b border-outline-variant px-4 py-3 text-sm text-on-surface sm:px-5">{details}</p> : null}
          <FactList>
            <Fact icon="sell" label={t('discounts.detail.facts.offer')} value={partnerValueText(t, partner)} />
            <Fact icon="category" label={t('discounts.detail.facts.appliesTo')} value={appliesText(t, partner.appliesTo)} />
            <Fact icon="event_available" label={t('discounts.detail.facts.starts')} value={formatDay(partner.startsOn)} />
            <Fact icon="event_busy" label={t('discounts.detail.facts.ends')} value={partner.endsOn ? formatDay(partner.endsOn) : t('discounts.noEndDate')} />
            <Fact
              icon="verified_user"
              label={t('discounts.detail.facts.proof')}
              value={partner.requiresProof ? proofNote ?? t('discounts.detail.facts.proofYes') : t('discounts.detail.facts.proofNo')}
            />
            <Fact
              icon="group"
              label={t('discounts.detail.facts.maxFamilies')}
              value={partner.maxFamilies !== null ? t('discounts.detail.facts.openOfMax', { open: partner.openFamilies, max: partner.maxFamilies }) : t('discounts.detail.facts.noLimit')}
            />
            <Fact icon="tag" label={t('discounts.detail.facts.otherNames')} value={partner.aliases.join(isArabic ? '، ' : ', ')} />
            <Fact icon="contract" label={t('discounts.detail.facts.agreementRef')} value={partner.agreementRef} ltr />
            <Fact icon="person" label={t('discounts.detail.facts.contact')} value={partner.contactName} />
            <Fact icon="call" label={t('discounts.detail.facts.phone')} value={partner.contactPhone} ltr />
            <Fact icon="mail" label={t('discounts.detail.facts.email')} value={partner.contactEmail} ltr />
          </FactList>
        </TableCard>
      </div>

      {dialog?.kind === 'edit' ? (
        <PartnerEditorDialog nurseryId={nurseryId} today={today} partner={partner} canChooseChain={partner.scope === 'chain'} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'grant' ? <GrantDiscountDialog nurseryId={nurseryId} today={today} partner={partner} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === 'decide' ? <DecideClaimDialog target={target(dialog.beneficiary)} approve={dialog.approve} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === 'end' ? <EndDiscountDialog target={target(dialog.beneficiary)} today={today} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
