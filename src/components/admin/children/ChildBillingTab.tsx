import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminChildBilling } from '@/hooks/useAdminChildBilling';
import type { BillingPeriodKind } from '@/hooks/useAdminTuitionBillingPeriods';

const PERIOD_LABELS: Record<BillingPeriodKind, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_annual: 'Half-annual',
  annual: 'Annual',
};

function fmtDate(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

export function ChildBillingTab({ childId, nurseryId }: { childId: string; nurseryId: string | null | undefined }) {
  const { query, choicesQuery, changeSubscription, assignExtraHours, unassignExtraHours } = useAdminChildBilling(
    childId,
    nurseryId,
  );
  const [tuitionDialogOpen, setTuitionDialogOpen] = useState(false);
  const [extraHoursDialogOpen, setExtraHoursDialogOpen] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState<BillingPeriodKind>('monthly');
  const [effective, setEffective] = useState<'next_period' | 'immediate'>('next_period');
  const [selectedExtraHoursPackageId, setSelectedExtraHoursPackageId] = useState('');

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }

  const { subscription, extraHours, invoices } = query.data ?? { subscription: null, extraHours: null, invoices: [] };
  const tuitionChoices = choicesQuery.data?.tuitionPackages ?? [];
  const extraHoursChoices = choicesQuery.data?.extraHoursPackages ?? [];
  const selectedChoice = tuitionChoices.find((p) => p.id === selectedPackageId);
  const availablePeriods = selectedChoice?.periods ?? [];

  const openTuitionDialog = () => {
    setSelectedPackageId(subscription?.tuitionPackageId ?? tuitionChoices[0]?.id ?? '');
    setSelectedPeriod(subscription?.billingPeriod ?? 'monthly');
    setEffective('next_period');
    setTuitionDialogOpen(true);
  };

  const submitTuitionChange = async () => {
    if (!selectedPackageId || !selectedPeriod) {
      toast.error('Choose a package and billing period.');
      return;
    }
    try {
      await changeSubscription.mutateAsync({
        tuitionPackageId: selectedPackageId,
        billingPeriod: selectedPeriod,
        effective,
      });
      toast.success('Tuition subscription updated.');
      setTuitionDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the subscription.');
    }
  };

  const openExtraHoursDialog = () => {
    setSelectedExtraHoursPackageId(extraHours?.packageId ?? extraHoursChoices[0]?.id ?? '');
    setExtraHoursDialogOpen(true);
  };

  const submitExtraHoursChange = async () => {
    if (!selectedExtraHoursPackageId) {
      toast.error('Choose a package.');
      return;
    }
    try {
      await assignExtraHours.mutateAsync(selectedExtraHoursPackageId);
      toast.success('Extra-hours package assigned.');
      setExtraHoursDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not assign the package.');
    }
  };

  const handleRemoveExtraHours = async () => {
    if (!extraHours) return;
    try {
      await unassignExtraHours.mutateAsync(extraHours.id);
      toast.success('Extra-hours package removed.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the package.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-outline-variant bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-on-surface-variant">Tuition</p>
            {subscription ? (
              <>
                <p className="mt-1 text-base font-semibold text-on-surface">
                  {subscription.packageNameEn || subscription.packageNameAr}
                </p>
                <p className="mt-0.5 text-sm text-on-surface-variant">
                  {PERIOD_LABELS[subscription.billingPeriod]} · EGP {subscription.lockedPrice.toFixed(2)} every{' '}
                  {subscription.durationMonths} month{subscription.durationMonths === 1 ? '' : 's'}
                </p>
                <p className="mt-0.5 text-xs text-on-surface-variant">
                  Next invoice: {fmtDate(subscription.nextInvoiceDate)}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-on-surface-variant">No active tuition subscription.</p>
            )}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={openTuitionDialog}>
            <MaterialSymbol name="edit" size="text-base" />
            {subscription ? 'Change package/period' : 'Set up tuition'}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-on-surface-variant">Extra hours</p>
            {extraHours ? (
              <>
                <p className="mt-1 text-base font-semibold text-on-surface">
                  {extraHours.packageNameEn || extraHours.packageNameAr}
                </p>
                <p className="mt-0.5 text-sm text-on-surface-variant">
                  {extraHours.coverageType === 'unlimited'
                    ? 'Unlimited extra hours'
                    : `${extraHours.hoursUsed} / ${extraHours.includedHours ?? 0} hours used`}
                </p>
                {extraHours.expiresAt ? (
                  <p className="mt-0.5 text-xs text-on-surface-variant">Expires: {fmtDate(extraHours.expiresAt)}</p>
                ) : null}
              </>
            ) : (
              <p className="mt-1 text-sm text-on-surface-variant">No active extra-hours package.</p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" size="sm" onClick={openExtraHoursDialog}>
              <MaterialSymbol name="edit" size="text-base" />
              {extraHours ? 'Change' : 'Assign'}
            </Button>
            {extraHours ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-error hover:bg-error/10"
                disabled={unassignExtraHours.isPending}
                onClick={() => void handleRemoveExtraHours()}
              >
                Remove
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface p-4">
        <p className="text-xs font-semibold uppercase text-on-surface-variant">Recent invoices</p>
        {invoices.length === 0 ? (
          <p className="mt-2 text-sm text-on-surface-variant">No invoices for this child yet.</p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-on-surface-variant">
                  {invoice.invoiceNumber} · {fmtDate(invoice.dueDate)}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-medium text-on-surface">EGP {invoice.amount.toFixed(2)}</span>
                  <Badge variant={invoice.status === 'paid' ? 'success' : invoice.status === 'overdue' ? 'warning' : 'outline'}>
                    {invoice.status}
                  </Badge>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={tuitionDialogOpen} onOpenChange={(open) => !changeSubscription.isPending && setTuitionDialogOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change tuition subscription</DialogTitle>
            <DialogDescription>This updates what this child is billed going forward.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label>Package</Label>
              <Select value={selectedPackageId} onChange={(e) => setSelectedPackageId(e.target.value)}>
                <option value="">Select a package</option>
                {tuitionChoices.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.nameEn || pkg.nameAr}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Billing period</Label>
              <Select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value as BillingPeriodKind)}>
                {availablePeriods.length === 0 ? <option value="">No periods configured</option> : null}
                {availablePeriods.map((period) => (
                  <option key={period.billingPeriod} value={period.billingPeriod}>
                    {PERIOD_LABELS[period.billingPeriod]} — EGP {period.price.toFixed(2)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Starts</Label>
              <Select value={effective} onChange={(e) => setEffective(e.target.value as 'next_period' | 'immediate')}>
                <option value="next_period">Next billing cycle</option>
                <option value="immediate">Immediately (bills today)</option>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => setTuitionDialogOpen(false)}
              disabled={changeSubscription.isPending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void submitTuitionChange()} disabled={changeSubscription.isPending}>
              {changeSubscription.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={extraHoursDialogOpen}
        onOpenChange={(open) => !assignExtraHours.isPending && setExtraHoursDialogOpen(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign extra-hours package</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-1.5">
            <Label>Package</Label>
            <Select value={selectedExtraHoursPackageId} onChange={(e) => setSelectedExtraHoursPackageId(e.target.value)}>
              <option value="">Select a package</option>
              {extraHoursChoices.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.nameEn || pkg.nameAr} — EGP {pkg.price.toFixed(2)}
                </option>
              ))}
            </Select>
          </div>
          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => setExtraHoursDialogOpen(false)}
              disabled={assignExtraHours.isPending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void submitExtraHoursChange()} disabled={assignExtraHours.isPending}>
              {assignExtraHours.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
