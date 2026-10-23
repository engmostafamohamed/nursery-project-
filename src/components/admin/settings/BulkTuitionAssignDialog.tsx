import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusPill } from '@/components/ui/DataTable';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SearchInput } from '@/components/ui/FilterBar';
import { FilterMenu } from '@/components/ui/FilterMenu';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminChildBilling } from '@/hooks/useAdminChildBilling';
import { type BillingPeriodKind } from '@/hooks/useAdminTuitionBillingPeriods';
import {
  useBulkTuitionAssignment,
  type BulkAssignEffective,
  type BulkAssignResult,
} from '@/hooks/useBulkTuitionAssignment';
import { formatMoneyAmount } from '@/lib/money';
import { cn } from '@/lib/utils';
import { FormSection } from './FormSection';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/**
 * Gives many already-enrolled children a tuition package in one go, so the daily billing job
 * starts invoicing them. Uses the same server function as the per-child Billing tab.
 */
export function BulkTuitionAssignDialog({
  open,
  onOpenChange,
  nurseryId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nurseryId: string | null | undefined;
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const { choicesQuery } = useAdminChildBilling(null, nurseryId);
  const { childrenQuery, assign } = useBulkTuitionAssignment(nurseryId);

  const [packageId, setPackageId] = useState('');
  const [period, setPeriod] = useState<BillingPeriodKind | ''>('');
  const [effective, setEffective] = useState<BulkAssignEffective>('next_period');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [includeAssigned, setIncludeAssigned] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<BulkAssignResult | null>(null);

  const packages = useMemo(() => choicesQuery.data?.tuitionPackages ?? [], [choicesQuery.data]);
  const pkg = packages.find((p) => p.id === packageId) ?? null;
  const periods = pkg?.periods ?? [];
  const chosenPeriod = periods.find((p) => p.billingPeriod === period) ?? null;

  const children = useMemo(() => childrenQuery.data ?? [], [childrenQuery.data]);
  const childName = (c: { nameAr: string; nameEn: string }) => (isAr ? c.nameAr || c.nameEn : c.nameEn || c.nameAr);
  const classOf = (c: { classNameAr: string | null; classNameEn: string | null }) =>
    (isAr ? c.classNameAr || c.classNameEn : c.classNameEn || c.classNameAr) ?? '';
  const nameOf = useMemo(
    () => new Map(children.map((c) => [c.id, isAr ? c.nameAr || c.nameEn : c.nameEn || c.nameAr])),
    [children, isAr],
  );
  const classNames = useMemo(
    () =>
      [...new Set(children.map((c) => (isAr ? c.classNameAr || c.classNameEn : c.classNameEn || c.classNameAr) ?? '').filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [children, isAr],
  );
  const unassignedCount = children.filter((c) => !c.currentPackageEn && !c.currentPackageAr).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return children.filter((c) => {
      if (!includeAssigned && (c.currentPackageEn || c.currentPackageAr)) return false;
      if (classFilter && (isAr ? c.classNameAr || c.classNameEn : c.classNameEn || c.classNameAr) !== classFilter) return false;
      if (!q) return true;
      return `${c.nameEn} ${c.nameAr} ${c.classNameEn ?? ''} ${c.classNameAr ?? ''}`.toLowerCase().includes(q);
    });
  }, [children, includeAssigned, classFilter, search, isAr]);
  const selectable = visible.filter((c) => c.hasParent);
  const allVisibleSelected = selectable.length > 0 && selectable.every((c) => selected.has(c.id));

  const running = assign.isPending;
  const canSubmit = Boolean(pkg && chosenPeriod && selected.size > 0) && !running;

  const reset = () => {
    setPackageId('');
    setPeriod('');
    setEffective('next_period');
    setSearch('');
    setClassFilter('');
    setIncludeAssigned(false);
    setSelected(new Set());
    setProgress(0);
    setResult(null);
  };

  const close = (next: boolean) => {
    if (running) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) selectable.forEach((c) => next.delete(c.id));
      else selectable.forEach((c) => next.add(c.id));
      return next;
    });

  const submit = async () => {
    if (!pkg || !chosenPeriod) return;
    setProgress(0);
    try {
      const res = await assign.mutateAsync({
        childIds: [...selected],
        tuitionPackageId: pkg.id,
        billingPeriod: chosenPeriod.billingPeriod,
        effective,
        onProgress: setProgress,
      });
      setResult(res);
      setSelected(new Set(res.failed.map((f) => f.childId)));
      if (res.failed.length === 0) toast.success(t('tuitionBulkAssign.assignedToast', { count: res.succeeded.length }));
      else toast.warning(t('tuitionBulkAssign.partialToast', { succeeded: res.succeeded.length, failed: res.failed.length }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('tuitionBulkAssign.failedToast'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('tuitionBulkAssign.title')}</DialogTitle>
          <DialogDescription>{t('tuitionBulkAssign.description')}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 max-h-[70vh] space-y-4 overflow-y-auto pe-1">
          <FormSection title={t('tuitionBulkAssign.sections.billing')} icon="counter_1">
            <div className="grid gap-3 sm:grid-cols-3">
              <FilterMenu<string>
                label={t('tuitionBulkAssign.fields.package')}
                icon="school"
                value={packageId}
                onChange={(value) => {
                  setPackageId(value);
                  const first = packages.find((p) => p.id === value)?.periods[0]?.billingPeriod ?? '';
                  setPeriod(first);
                }}
                options={[
                  {
                    value: '',
                    label: choicesQuery.isLoading ? t('tuitionBulkAssign.fields.loading') : t('tuitionBulkAssign.fields.choosePackage'),
                  },
                  ...packages.map((p) => ({ value: p.id, label: isAr ? p.nameAr || p.nameEn : p.nameEn || p.nameAr })),
                ]}
              />
              <FilterMenu<string>
                label={t('tuitionBulkAssign.fields.period')}
                icon="event_repeat"
                value={period}
                onChange={(value) => setPeriod(value as BillingPeriodKind | '')}
                options={
                  periods.length
                    ? periods.map((p) => ({
                        value: p.billingPeriod,
                        label: t('tuitionBulkAssign.fields.periodOption', {
                          period: t(`tuitionPackages.periods.${p.billingPeriod}`),
                          price: t('invoice.egpAmount', { amount: formatMoneyAmount(p.price) }),
                        }),
                      }))
                    : [
                        {
                          value: '',
                          label: pkg ? t('tuitionBulkAssign.fields.noPeriods') : t('tuitionBulkAssign.fields.choosePackageFirst'),
                        },
                      ]
                }
              />
              <FilterMenu<BulkAssignEffective>
                label={t('tuitionBulkAssign.fields.firstInvoice')}
                value={effective}
                onChange={setEffective}
                options={[
                  { value: 'next_period', label: t('tuitionBulkAssign.fields.nextPeriod'), icon: 'event_upcoming' },
                  { value: 'immediate', label: t('tuitionBulkAssign.fields.immediate'), icon: 'receipt_long' },
                ]}
              />
            </div>
            <p className="flex items-start gap-2 rounded-lg border-s-4 border-primary/40 bg-primary/5 px-3 py-2 text-xs leading-5 text-on-surface">
              <MaterialSymbol name={effective === 'immediate' ? 'receipt_long' : 'event_upcoming'} size="text-base" className="shrink-0 text-primary" />
              <span>
                {effective === 'immediate' ? t('tuitionBulkAssign.fields.immediateHint') : t('tuitionBulkAssign.fields.nextPeriodHint')}{' '}
                {t('tuitionBulkAssign.fields.billedParentHint')}
              </span>
            </p>
          </FormSection>

          <FormSection
            title={t('tuitionBulkAssign.sections.children')}
            description={t('tuitionBulkAssign.sections.childrenHint', { unassigned: unassignedCount, total: children.length })}
            icon="counter_2"
          >
            <div className="flex flex-wrap items-center gap-3">
              <SearchInput
                className="min-w-[12rem] flex-[2]"
                value={search}
                onChange={setSearch}
                placeholder={t('tuitionBulkAssign.fields.searchPlaceholder')}
              />
              {classNames.length > 1 ? (
                <Select
                  className="min-w-[10rem] flex-1"
                  aria-label={t('tuitionBulkAssign.fields.class')}
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                >
                  <option value="">{t('tuitionBulkAssign.fields.allClasses')}</option>
                  {classNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </Select>
              ) : null}
            </div>
            <label className="flex items-center gap-2 text-sm text-on-surface">
              <Checkbox checked={includeAssigned} onCheckedChange={(v) => setIncludeAssigned(v === true)} />
              {t('tuitionBulkAssign.fields.includeAssigned')}
            </label>

            {childrenQuery.isLoading ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : visible.length === 0 ? (
              <p className="rounded-lg border border-dashed border-outline-variant p-4 text-center text-sm text-on-surface-variant">
                {children.length === 0 ? t('tuitionBulkAssign.noChildren') : t('tuitionBulkAssign.noMatch')}
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-outline-variant">
                <label className="flex items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-xs font-semibold text-on-surface-variant">
                  <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} disabled={running || selectable.length === 0} />
                  {t('tuitionBulkAssign.selectAllShown', { count: selectable.length })}
                  <span
                    className={cn(
                      'ms-auto rounded-full px-2 py-0.5 tabular-nums',
                      selected.size ? 'bg-primary text-primary-foreground' : 'bg-surface-high',
                    )}
                  >
                    {t('tuitionBulkAssign.selectedCount', { count: selected.size })}
                  </span>
                </label>
                <ul className="max-h-80 divide-y divide-outline-variant overflow-y-auto">
                  {visible.map((c) => {
                    const name = childName(c);
                    const className = classOf(c);
                    const currentPackage = isAr ? c.currentPackageAr || c.currentPackageEn : c.currentPackageEn || c.currentPackageAr;
                    const checked = selected.has(c.id);
                    return (
                      <li key={c.id}>
                        <label
                          className={cn(
                            'flex items-center gap-3 px-3 py-2.5 text-sm transition-colors',
                            c.hasParent ? 'cursor-pointer hover:bg-surface-container-lowest' : 'opacity-60',
                            checked && 'bg-primary/5',
                          )}
                        >
                          <Checkbox checked={checked} onCheckedChange={() => toggle(c.id)} disabled={running || !c.hasParent} />
                          <span
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                              checked ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
                            )}
                            aria-hidden
                          >
                            {initialsOf(name)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-on-surface" title={name}>{name}</span>
                            <span className="flex items-center gap-1 truncate text-xs text-on-surface-variant">
                              <MaterialSymbol name="school" size="text-sm" />
                              {className || t('tuitionBulkAssign.noClass')}
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
                            {currentPackage ? <StatusPill tone="neutral" icon="package_2">{currentPackage}</StatusPill> : null}
                            {!c.hasParent ? <StatusPill tone="warning" icon="link_off">{t('tuitionBulkAssign.noParent')}</StatusPill> : null}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </FormSection>

          {result ? (
            <div
              className={cn(
                'rounded-lg border p-3 text-sm',
                result.failed.length ? 'border-warning/30 bg-warning/10' : 'border-success/30 bg-success/10',
              )}
            >
              <p className="font-semibold text-on-surface">
                <MaterialSymbol name={result.failed.length ? 'warning' : 'check_circle'} size="text-base" className="me-1" />
                {[
                  t('tuitionBulkAssign.result.assigned', { count: result.succeeded.length }),
                  result.invoicesIssued ? t('tuitionBulkAssign.result.invoicesIssued', { count: result.invoicesIssued }) : null,
                  result.failed.length ? t('tuitionBulkAssign.result.failed', { count: result.failed.length }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {result.failed.length ? (
                <ul className="mt-2 space-y-1 text-xs text-on-surface-variant">
                  {result.failed.map((f) => (
                    <li key={f.childId}>
                      <span className="font-medium text-on-surface">{nameOf.get(f.childId) ?? f.childId}</span>: {f.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Summary at the start, buttons at the end, in both directions. */}
        <DialogFooter className="mt-5 items-center sm:justify-between sm:rtl:flex-row sm:rtl:justify-between">
          <p className="hidden text-xs text-on-surface-variant sm:block">
            {pkg && chosenPeriod
              ? t('tuitionBulkAssign.summary', {
                  package: isAr ? pkg.nameAr || pkg.nameEn : pkg.nameEn || pkg.nameAr,
                  period: t(`tuitionPackages.periods.${chosenPeriod.billingPeriod}`),
                })
              : t('tuitionBulkAssign.summaryEmpty')}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:rtl:flex-row-reverse">
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={running}>
              {result ? t('tuitionBulkAssign.done') : t('common.cancel')}
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={!canSubmit}>
              <MaterialSymbol name="group_add" size="text-base" />
              {running
                ? t('tuitionBulkAssign.assigning', { done: progress, total: selected.size })
                : t('tuitionBulkAssign.assign', { count: selected.size })}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
