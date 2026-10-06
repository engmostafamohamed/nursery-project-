import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FilterMenu } from '@/components/ui/FilterMenu';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminChildBilling } from '@/hooks/useAdminChildBilling';
import { BILLING_PERIODS, type BillingPeriodKind } from '@/hooks/useAdminTuitionBillingPeriods';
import {
  useBulkTuitionAssignment,
  type BulkAssignEffective,
  type BulkAssignResult,
} from '@/hooks/useBulkTuitionAssignment';
import { FormSection } from './FormSection';

const periodLabel = (key: BillingPeriodKind) => BILLING_PERIODS.find((p) => p.key === key)?.label ?? key;

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
  const { choicesQuery } = useAdminChildBilling(null, nurseryId);
  const { childrenQuery, assign } = useBulkTuitionAssignment(nurseryId);

  const [packageId, setPackageId] = useState('');
  const [period, setPeriod] = useState<BillingPeriodKind | ''>('');
  const [effective, setEffective] = useState<BulkAssignEffective>('next_period');
  const [search, setSearch] = useState('');
  const [includeAssigned, setIncludeAssigned] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<BulkAssignResult | null>(null);

  const packages = useMemo(() => choicesQuery.data?.tuitionPackages ?? [], [choicesQuery.data]);
  const pkg = packages.find((p) => p.id === packageId) ?? null;
  const periods = pkg?.periods ?? [];
  const chosenPeriod = periods.find((p) => p.billingPeriod === period) ?? null;

  const children = useMemo(() => childrenQuery.data ?? [], [childrenQuery.data]);
  const nameOf = useMemo(() => new Map(children.map((c) => [c.id, c.nameEn || c.nameAr])), [children]);
  const unassignedCount = children.filter((c) => !c.currentPackageEn && !c.currentPackageAr).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return children.filter((c) => {
      if (!includeAssigned && (c.currentPackageEn || c.currentPackageAr)) return false;
      if (!q) return true;
      return `${c.nameEn} ${c.nameAr} ${c.classNameEn ?? ''} ${c.classNameAr ?? ''}`.toLowerCase().includes(q);
    });
  }, [children, includeAssigned, search]);
  const selectable = visible.filter((c) => c.hasParent);
  const allVisibleSelected = selectable.length > 0 && selectable.every((c) => selected.has(c.id));

  const running = assign.isPending;
  const canSubmit = Boolean(pkg && chosenPeriod && selected.size > 0) && !running;

  const reset = () => {
    setPackageId('');
    setPeriod('');
    setEffective('next_period');
    setSearch('');
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
      if (res.failed.length === 0) toast.success(`Package assigned to ${res.succeeded.length} children.`);
      else toast.warning(`${res.succeeded.length} assigned, ${res.failed.length} failed.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not assign the package.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Assign a package to children</DialogTitle>
          <DialogDescription>
            Children with a package are billed automatically by the daily billing job. Use this for children enrolled
            before packages existed, or added by import or the enrollment wizard.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 max-h-[70vh] space-y-4 overflow-y-auto pe-1">
          <FormSection title="Package and billing" icon="payments">
            <div className="grid gap-3 sm:grid-cols-3">
              <FilterMenu<string>
                label="Package"
                value={packageId}
                onChange={(value) => {
                  setPackageId(value);
                  const first = packages.find((p) => p.id === value)?.periods[0]?.billingPeriod ?? '';
                  setPeriod(first);
                }}
                options={[
                  { value: '', label: choicesQuery.isLoading ? 'Loading…' : 'Choose a package' },
                  ...packages.map((p) => ({ value: p.id, label: p.nameEn || p.nameAr })),
                ]}
              />
              <FilterMenu<string>
                label="Billing period"
                value={period}
                onChange={(value) => setPeriod(value as BillingPeriodKind | '')}
                options={
                  periods.length
                    ? periods.map((p) => ({ value: p.billingPeriod, label: `${periodLabel(p.billingPeriod)} · EGP ${p.price.toFixed(2)}` }))
                    : [{ value: '', label: pkg ? 'No active billing periods' : 'Choose a package first' }]
                }
              />
              <FilterMenu<BulkAssignEffective>
                label="First invoice"
                value={effective}
                onChange={setEffective}
                options={[
                  { value: 'next_period', label: 'After one billing period', icon: 'event_upcoming' },
                  { value: 'immediate', label: 'Today (issue it now)', icon: 'receipt_long' },
                ]}
              />
            </div>
            <p className="text-xs text-on-surface-variant">
              {effective === 'immediate'
                ? 'An invoice for the first period is created for each child today, then billing repeats every period.'
                : 'No invoice today. The first invoice is created one billing period from today, then every period after.'}
              {' '}The invoice goes to the child's first linked parent.
            </p>
          </FormSection>

          <FormSection
            title="Children"
            description={`${unassignedCount} of ${children.length} active children have no package yet.`}
            icon="groups"
          >
            <div className="flex flex-wrap items-center gap-3">
              <Input
                className="h-11 min-w-[200px] flex-1"
                placeholder="Search by child or class…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <label className="flex items-center gap-2 text-sm text-on-surface">
                <Checkbox checked={includeAssigned} onCheckedChange={(v) => setIncludeAssigned(v === true)} />
                Include children who already have a package (it will be replaced)
              </label>
            </div>

            {childrenQuery.isLoading ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : visible.length === 0 ? (
              <p className="rounded-lg border border-dashed border-outline-variant p-4 text-center text-sm text-on-surface-variant">
                {children.length === 0 ? 'No active children.' : 'No children match.'}
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-outline-variant">
                <label className="flex items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-3 py-2 text-xs font-semibold uppercase text-on-surface-variant">
                  <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} disabled={running || selectable.length === 0} />
                  Select all shown ({selectable.length})
                  <span className="ms-auto normal-case">{selected.size} selected</span>
                </label>
                <ul className="max-h-72 divide-y divide-outline-variant overflow-y-auto">
                  {visible.map((c) => (
                    <li key={c.id}>
                      <label
                        className={`flex items-center gap-3 px-3 py-2 text-sm ${c.hasParent ? 'cursor-pointer hover:bg-surface-container-lowest' : 'opacity-60'}`}
                      >
                        <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} disabled={running || !c.hasParent} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-on-surface">{c.nameEn || c.nameAr}</span>
                          <span className="block truncate text-xs text-on-surface-variant">{c.classNameEn || c.classNameAr || 'No class'}</span>
                        </span>
                        {c.currentPackageEn || c.currentPackageAr ? (
                          <Badge variant="secondary">{c.currentPackageEn || c.currentPackageAr}</Badge>
                        ) : null}
                        {!c.hasParent ? <Badge variant="warning">No parent linked</Badge> : null}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </FormSection>

          {result ? (
            <div
              className={`rounded-lg border p-3 text-sm ${result.failed.length ? 'border-warning/30 bg-warning/10' : 'border-success/30 bg-success/10'}`}
            >
              <p className="font-semibold text-on-surface">
                <MaterialSymbol name={result.failed.length ? 'warning' : 'check_circle'} size="text-base" className="me-1" />
                {result.succeeded.length} assigned
                {result.invoicesIssued ? ` · ${result.invoicesIssued} first invoices issued` : ''}
                {result.failed.length ? ` · ${result.failed.length} failed (still selected, so you can retry)` : ''}
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

        <DialogFooter className="mt-5">
          <Button type="button" variant="outline" onClick={() => close(false)} disabled={running}>
            {result ? 'Done' : 'Cancel'}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!canSubmit}>
            {running
              ? `Assigning ${progress} / ${selected.size}…`
              : `Assign to ${selected.size} ${selected.size === 1 ? 'child' : 'children'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
