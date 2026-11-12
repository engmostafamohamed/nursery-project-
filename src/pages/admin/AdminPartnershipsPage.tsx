import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DataTable,
  IconAction,
  StatusPill,
  TableCard,
  TableEmpty,
  TableLoading,
  TablePagination,
  TBody,
  THead,
  Td,
  Th,
  Tr,
} from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { FormProblem } from '@/components/ui/FormField';
import { LoadError } from '@/components/ui/LoadError';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { appliesText, discountErrorKey, partnerName, partnerValueText, validityText } from '@/features/discounts/discountLook';
import {
  normalizeForMatch,
  PARTNER_KIND_ICON,
  PARTNER_KINDS,
  PARTNER_STATES,
  partnerStateTone,
  type DiscountPartner,
  type PartnerKind,
  type PartnerState,
} from '@/features/discounts/discounts';
import { DiscountsSectionTabs } from '@/features/discounts/DiscountsSectionTabs';
import { PartnerEditorDialog } from '@/features/discounts/PartnerEditorDialog';
import { usePartnersPage, useSetPartnerActive } from '@/features/discounts/useDiscounts';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useAdminLinks } from '@/hooks/useAdminBasePath';
import { useMoney } from '@/hooks/useMoney';
import { usePagination } from '@/hooks/usePagination';
import { useTableSort } from '@/hooks/useTableSort';

type Quick = 'all' | 'running' | 'pending' | 'ending';
type SortKey = 'name' | 'value' | 'ends' | 'families' | 'given';

const running = (p: DiscountPartner) => p.state === 'active' || p.state === 'ending_soon';

/**
 * The companies, schools and organizations the nursery has an agreement with: what each offers,
 * until when, how many families have it or are waiting, and what it has taken off so far. A row
 * opens the partner's page with its families.
 */
export function AdminPartnershipsPage() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const navigate = useNavigate();
  const links = useAdminLinks();
  const money = useMoney();
  const { activeNurseryId: nurseryId } = useActiveNurseryId();
  const page = usePartnersPage(nurseryId);
  const setActive = useSetPartnerActive();
  const [editing, setEditing] = useState<DiscountPartner | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | PartnerKind>('all');
  const [state, setState] = useState<'all' | PartnerState>('all');
  const [quick, setQuick] = useState<Quick>('all');
  const [problem, setProblem] = useState<string | null>(null);
  const sort = useTableSort<SortKey>('name');

  const partners = useMemo(() => page.data?.partners ?? [], [page.data?.partners]);
  const filtered = useMemo(() => {
    const q = normalizeForMatch(search);
    return partners.filter((p) => {
      if (quick === 'running' && !running(p)) return false;
      if (quick === 'pending' && p.pendingFamilies === 0) return false;
      if (quick === 'ending' && p.state !== 'ending_soon') return false;
      if (kind !== 'all' && p.kind !== kind) return false;
      if (state !== 'all' && p.state !== state) return false;
      if (q && !normalizeForMatch([p.nameAr, p.nameEn, ...p.aliases].join(' ')).includes(q)) return false;
      return true;
    });
  }, [partners, quick, kind, state, search]);
  const rows = sort.sorted(filtered, {
    name: (a, b) => partnerName(a, isArabic).localeCompare(partnerName(b, isArabic)),
    value: (a, b) => a.discountType.localeCompare(b.discountType) || a.discountValue - b.discountValue,
    ends: (a, b) => (a.endsOn ?? '9999').localeCompare(b.endsOn ?? '9999'),
    families: (a, b) => a.activeFamilies - b.activeFamilies,
    given: (a, b) => a.given - b.given,
  });
  const filtersKey = `${quick}|${kind}|${state}|${search}|${sort.key}`;
  const pager = usePagination(rows, 10, filtersKey);
  const hasFilters = quick !== 'all' || kind !== 'all' || state !== 'all' || search.trim() !== '';
  const clear = () => {
    setQuick('all');
    setKind('all');
    setState('all');
    setSearch('');
  };
  const toggleQuick = (value: Quick) => setQuick((current) => (current === value ? 'all' : value));

  const canManage = page.data?.canManage ?? false;
  const today = page.data?.today ?? '';
  const stats = {
    running: partners.filter(running).length,
    families: partners.reduce((sum, p) => sum + p.activeFamilies, 0),
    pending: partners.reduce((sum, p) => sum + p.pendingFamilies, 0),
    ending: partners.filter((p) => p.state === 'ending_soon').length,
  };

  const togglePartner = async (partner: DiscountPartner) => {
    if (!nurseryId) return;
    setProblem(null);
    try {
      await setActive.mutateAsync({ nurseryId, partnerId: partner.id, active: !partner.active });
      toast.success(partner.active ? t('discounts.page.paused', { name: partnerName(partner, isArabic) }) : t('discounts.page.resumed', { name: partnerName(partner, isArabic) }));
    } catch (error) {
      setProblem(t(discountErrorKey(error)));
    }
  };

  const newButton = canManage ? (
    <Button type="button" onClick={() => setEditing('new')} data-testid="new-partner">
      <MaterialSymbol name="add" size="text-base" />
      {t('discounts.page.newPartner')}
    </Button>
  ) : null;

  return (
    <div className="space-y-5 pb-8">
      <DiscountsSectionTabs />
      <PageHeader icon="handshake" title={t('discounts.page.title')} description={t('discounts.page.subtitle')} actions={newButton}>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile icon="handshake" label={t('discounts.page.stats.running')} value={stats.running} tone="success" onClick={() => toggleQuick('running')} active={quick === 'running'} />
          <StatTile icon="family_restroom" label={t('discounts.page.stats.families')} value={stats.families} />
          <StatTile
            icon="pending_actions"
            label={t('discounts.page.stats.pending')}
            value={stats.pending}
            tone={stats.pending > 0 ? 'warning' : 'neutral'}
            onClick={() => toggleQuick('pending')}
            active={quick === 'pending'}
          />
          <StatTile
            icon="event_upcoming"
            label={t('discounts.page.stats.ending')}
            value={stats.ending}
            tone={stats.ending > 0 ? 'warning' : 'neutral'}
            onClick={() => toggleQuick('ending')}
            active={quick === 'ending'}
          />
        </div>
      </PageHeader>

      <FormProblem message={problem} />
      <TableCard
        title={t('discounts.page.tableTitle')}
        count={page.isLoading ? undefined : t('discounts.page.count', { count: filtered.length })}
        filters={
          partners.length ? (
            <FilterBar onClear={clear} canClear={hasFilters}>
              <FilterField label={t('packageFilters.search')} className="sm:flex-[2]">
                <SearchInput value={search} onChange={setSearch} placeholder={t('discounts.page.searchPlaceholder')} />
              </FilterField>
              <FilterField label={t('discounts.page.kind')}>
                <Select value={kind} onChange={(e) => setKind(e.target.value as 'all' | PartnerKind)}>
                  <option value="all">{t('discounts.page.allKinds')}</option>
                  {PARTNER_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`discounts.kinds.${k}`)}
                    </option>
                  ))}
                </Select>
              </FilterField>
              <FilterField label={t('packageFilters.status')}>
                <Select value={state} onChange={(e) => setState(e.target.value as 'all' | PartnerState)}>
                  <option value="all">{t('packageFilters.allStatuses')}</option>
                  {PARTNER_STATES.map((s) => (
                    <option key={s} value={s}>
                      {t(`discounts.partnerStates.${s}`)}
                    </option>
                  ))}
                </Select>
              </FilterField>
            </FilterBar>
          ) : null
        }
        pagination={page.isLoading || !rows.length ? null : <TablePagination pager={pager} />}
      >
        {page.isError ? (
          <LoadError inset message={t(discountErrorKey(page.error))} onRetry={() => void page.refetch()} />
        ) : page.isLoading || !nurseryId ? (
          <TableLoading />
        ) : partners.length === 0 ? (
          <TableEmpty icon="handshake" title={t('discounts.page.emptyTitle')} description={t('discounts.page.emptyBody')} action={newButton} />
        ) : rows.length === 0 ? (
          <TableEmpty icon="search_off" title={t('discounts.page.noMatch')} />
        ) : (
          <DataTable minWidth={960}>
            <THead>
              <Th sort={sort.sortFor('name')}>{t('discounts.page.columns.partner')}</Th>
              <Th sort={sort.sortFor('value')}>{t('discounts.page.columns.offer')}</Th>
              <Th sort={sort.sortFor('ends')}>{t('discounts.page.columns.validity')}</Th>
              <Th sort={sort.sortFor('families')}>{t('discounts.page.columns.families')}</Th>
              <Th sort={sort.sortFor('given')} align="end">
                {t('discounts.page.columns.given')}
              </Th>
              <Th align="end">{t('discounts.page.columns.actions')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map((partner) => {
                const name = partnerName(partner, isArabic);
                return (
                  <Tr key={partner.id} onClick={() => navigate(links.partnerPage(partner.id))} data-testid={`partner-row-${partner.id}`}>
                    <Td className="max-w-[260px]">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <MaterialSymbol name={PARTNER_KIND_ICON[partner.kind]} size="text-lg" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-on-surface">{name}</p>
                          <p className="truncate text-xs text-on-surface-variant">
                            {t(`discounts.kinds.${partner.kind}`)}
                            {partner.scope === 'chain' ? ` · ${t('discounts.scope.chain')}` : ''}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <p className="font-semibold text-on-surface">{partnerValueText(t, partner)}</p>
                      <p className="text-xs text-on-surface-variant">{appliesText(t, partner.appliesTo)}</p>
                    </Td>
                    <Td>
                      <StatusPill tone={partnerStateTone(partner.state)}>{t(`discounts.partnerStates.${partner.state}`)}</StatusPill>
                      <p className="mt-1 text-xs text-on-surface-variant">{validityText(t, partner.endsOn)}</p>
                    </Td>
                    <Td>
                      <p className="tabular-nums text-on-surface">
                        {partner.maxFamilies !== null
                          ? t('discounts.page.familiesOfMax', { count: partner.activeFamilies, max: partner.maxFamilies })
                          : t('discounts.page.familiesCount', { count: partner.activeFamilies })}
                      </p>
                      {partner.pendingFamilies > 0 ? (
                        <StatusPill tone="warning" icon="pending_actions" className="mt-1">
                          {t('discounts.page.pendingCount', { count: partner.pendingFamilies })}
                        </StatusPill>
                      ) : null}
                    </Td>
                    <Td align="end" className="tabular-nums text-on-surface">
                      {money(partner.given)}
                    </Td>
                    <Td align="end">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <IconAction icon="visibility" label={`${t('common.view')}: ${name}`} to={links.partnerPage(partner.id)} />
                        {partner.canEdit ? (
                          <>
                            <IconAction icon="edit" label={`${t('common.edit')}: ${name}`} onClick={() => setEditing(partner)} />
                            <IconAction
                              icon={partner.active ? 'pause_circle' : 'play_circle'}
                              label={`${partner.active ? t('discounts.page.pause') : t('discounts.page.resume')}: ${name}`}
                              onClick={() => void togglePartner(partner)}
                              disabled={setActive.isPending}
                            />
                          </>
                        ) : null}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
        )}
      </TableCard>

      {editing && nurseryId ? (
        <PartnerEditorDialog
          nurseryId={nurseryId}
          today={today}
          partner={editing === 'new' ? null : editing}
          canChooseChain={Boolean(page.data?.hasChain && page.data?.canManageChain)}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            if (editing === 'new') navigate(links.partnerPage(id));
          }}
        />
      ) : null}
    </div>
  );
}
