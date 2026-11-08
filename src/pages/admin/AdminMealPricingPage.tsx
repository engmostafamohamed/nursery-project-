import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { DataTable, IconAction, StatusPill, TableCard, TableEmpty, TableLoading, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { ChildMealPlanDialog } from '@/features/food-and-beverage/ChildMealPlanDialog';
import { MealIcons } from '@/features/food-and-beverage/MealIcons';
import { MealPlanDialog } from '@/features/food-and-beverage/MealPlanDialog';
import { childMatches, isNotBilled, mealPlanTotals, type ChildPlanFilter, type MealPlan, type MealPlanChild } from '@/features/food-and-beverage/mealPlans';
import { localName } from '@/features/food-and-beverage/menu';
import { useMealPlansData } from '@/features/food-and-beverage/useMealPlansAndKitchen';
import { usePagination } from '@/hooks/usePagination';
import { formatDate } from '@/lib/datetime';
import { formatMoneyAmount } from '@/lib/money';
import { cn } from '@/lib/utils';
import { useSettings } from '@/lib/useSettings';

const FILTERS: ChildPlanFilter[] = ['all', 'charged', 'included', 'none', 'not_billed'];

/**
 * F&B · meal plans: what the nursery offers and its monthly price, and every child's plan. A
 * charged plan is billed on the child's monthly invoice; the page shows what it brings in a month
 * and which children would not be billed.
 */
export function AdminMealPricingPage() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const { nurseryId } = useSettings();
  const query = useMealPlansData(nurseryId);
  const data = query.data;
  const [planDialog, setPlanDialog] = useState<{ plan: MealPlan | null } | null>(null);
  const [childDialog, setChildDialog] = useState<MealPlanChild | null>(null);
  const [filter, setFilter] = useState<ChildPlanFilter>('all');
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('all');
  const money = (n: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(n) });

  const children = useMemo(() => data?.children ?? [], [data?.children]);
  const totals = useMemo(() => mealPlanTotals(children), [children]);
  const classes = useMemo(
    () => [...new Map(children.filter((c) => c.classId).map((c) => [c.classId!, localName(c.classNameAr, c.classNameEn, isArabic)])).entries()],
    [children, isArabic],
  );
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return children.filter(
      (c) => childMatches(c, filter) && (classId === 'all' || c.classId === classId) && (!term || `${c.nameAr} ${c.nameEn}`.toLowerCase().includes(term)),
    );
  }, [children, filter, classId, search]);
  const pager = usePagination(shown, 20, `${filter}|${classId}|${search}`);

  return (
    <div className="space-y-5">
      <PageHeader
        icon="restaurant_menu"
        eyebrow={t('fnb.eyebrow')}
        title={t('fnb.plans.title')}
        description={t('fnb.plans.subtitle')}
        actions={
          data?.canEdit ? (
            <Button type="button" onClick={() => setPlanDialog({ plan: null })}>
              <MaterialSymbol name="add" size="text-lg" className="me-1" />
              {t('fnb.plans.add')}
            </Button>
          ) : null
        }
      >
        {data ? (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile icon="payments" tone="success" label={t('fnb.plans.tiles.monthly')} value={money(totals.monthly)} helper={t('fnb.plans.tiles.monthlyHint', { count: totals.charged })} />
            <StatTile icon="restaurant" label={t('fnb.plans.tiles.withPlan')} value={totals.withPlan} helper={t('fnb.plans.tiles.withPlanHint', { included: totals.included })} onClick={() => setFilter('charged')} active={filter === 'charged'} />
            <StatTile icon="no_meals" tone="neutral" label={t('fnb.plans.tiles.none')} value={totals.none} onClick={() => setFilter('none')} active={filter === 'none'} />
            <StatTile icon="report" tone={totals.notBilled ? 'warning' : 'success'} label={t('fnb.plans.tiles.notBilled')} value={totals.notBilled} helper={t('fnb.plans.tiles.notBilledHint')} onClick={() => setFilter('not_billed')} active={filter === 'not_billed'} />
          </div>
        ) : (
          <Skeleton className="h-24 rounded-xl" />
        )}
      </PageHeader>

      <section>
        <SectionTitle icon="menu_book">{t('fnb.plans.offered')}</SectionTitle>
        {!data ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.plans.map((plan) => (
              <article key={plan.id} data-testid="meal-plan-card" className={cn('flex flex-col gap-3 rounded-2xl border bg-surface p-4 shadow-sm', plan.active ? 'border-outline-variant' : 'border-dashed border-outline-variant opacity-70')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-on-surface">{localName(plan.nameAr, plan.nameEn, isArabic)}</h3>
                    <p className="text-xs text-on-surface-variant">{t('fnb.plans.childrenOnPlan', { count: plan.children })}</p>
                  </div>
                  {plan.active ? null : <StatusPill tone="neutral">{t('fnb.plans.inactive')}</StatusPill>}
                </div>
                <MealIcons meals={plan.meals} />
                <div className="mt-auto flex items-end justify-between gap-2">
                  <p>
                    <span className="text-2xl font-bold text-on-surface">{money(plan.monthlyPrice)}</span>
                    <span className="text-xs text-on-surface-variant"> / {t('fnb.plans.month')}</span>
                  </p>
                  {data.canEdit ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setPlanDialog({ plan })}>
                      <MaterialSymbol name="edit" size="text-base" className="me-1" />
                      {t('common.edit')}
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
            {data.canEdit ? (
              <button
                type="button"
                onClick={() => setPlanDialog({ plan: null })}
                className="flex min-h-[9rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-outline-variant text-sm font-medium text-on-surface-variant outline-none transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
              >
                <MaterialSymbol name="add_circle" size="text-2xl" />
                {t('fnb.plans.add')}
              </button>
            ) : null}
          </div>
        )}
      </section>

      <TableCard
        title={t('fnb.plans.childrenTitle')}
        count={t('fnb.plans.childrenCount', { count: shown.length })}
        description={t('fnb.plans.childrenHint')}
        filters={
          <FilterBar onClear={() => { setFilter('all'); setSearch(''); setClassId('all'); }} canClear={filter !== 'all' || Boolean(search) || classId !== 'all'}>
            <FilterField label={t('common.search')} className="sm:flex-[2]">
              <SearchInput value={search} onChange={setSearch} placeholder={t('health.dashboard.searchChild')} />
            </FilterField>
            <FilterField label={t('health.dashboard.filterClass')}>
              <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="all">{t('health.dashboard.classAll')}</option>
                {classes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </Select>
            </FilterField>
            <FilterField label={t('fnb.plans.filterLabel')}>
              <Select value={filter} onChange={(e) => setFilter(e.target.value as ChildPlanFilter)}>
                {FILTERS.map((f) => <option key={f} value={f}>{t(`fnb.plans.filters.${f}`)}</option>)}
              </Select>
            </FilterField>
          </FilterBar>
        }
        pagination={shown.length ? <TablePagination pager={pager} pageSizeOptions={[20, 50, 100]} /> : null}
      >
        {query.isLoading ? (
          <TableLoading />
        ) : !shown.length ? (
          <TableEmpty icon="child_care" title={t('fnb.plans.noChildren')} />
        ) : (
          <DataTable minWidth={780}>
            <THead>
              <Th>{t('health.dashboard.columns.child')}</Th>
              <Th>{t('fnb.plans.columns.plan')}</Th>
              <Th align="end">{t('fnb.plans.columns.price')}</Th>
              <Th>{t('fnb.plans.columns.since')}</Th>
              <Th align="end">{t('health.dashboard.columns.actions')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map((child) => {
                const name = localName(child.nameAr, child.nameEn, isArabic);
                const plan = child.current;
                return (
                  <Tr key={child.childId} onClick={data?.canEdit ? () => setChildDialog(child) : undefined}>
                    <Td>
                      <span className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary" aria-hidden>{name.charAt(0)}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-on-surface">{name}</span>
                          <span className="block truncate text-xs text-on-surface-variant">{localName(child.classNameAr, child.classNameEn, isArabic) || t('health.dashboard.noClass')}</span>
                        </span>
                      </span>
                    </Td>
                    <Td>
                      {plan ? (
                        <span className="flex flex-col gap-1">
                          <span className="font-medium text-on-surface">{localName(plan.nameAr, plan.nameEn, isArabic)}</span>
                          <MealIcons meals={plan.meals} compact />
                        </span>
                      ) : (
                        <span className="text-on-surface-variant">{child.eatsNurseryMeals ? t('fnb.plans.noPlan') : t('fnb.ownFood')}</span>
                      )}
                    </Td>
                    <Td align="end" className="whitespace-nowrap">
                      {!plan ? '—' : plan.charged ? (
                        <span className="font-semibold tabular-nums text-on-surface">{money(plan.monthlyPrice)}</span>
                      ) : (
                        <StatusPill tone="primary" icon="inventory">{t('fnb.plans.includedShort')}</StatusPill>
                      )}
                      {isNotBilled(child) ? (
                        <span className="mt-1 flex items-center justify-end gap-1 text-xs text-warning" title={t('fnb.plans.noTuitionNote')}>
                          <MaterialSymbol name="warning" size="text-sm" />
                          {t('fnb.plans.notBilledShort')}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="whitespace-nowrap text-on-surface-variant">{plan ? formatDate(plan.startedOn) : '—'}</Td>
                    <Td align="end">
                      {data?.canEdit ? <IconAction icon="edit" label={t('fnb.plans.changeFor', { name })} onClick={() => setChildDialog(child)} /> : null}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
        )}
      </TableCard>

      {planDialog && nurseryId ? <MealPlanDialog nurseryId={nurseryId} plan={planDialog.plan} onClose={() => setPlanDialog(null)} /> : null}
      {childDialog && nurseryId && data ? <ChildMealPlanDialog nurseryId={nurseryId} child={childDialog} plans={data.plans} onClose={() => setChildDialog(null)} /> : null}
    </div>
  );
}
