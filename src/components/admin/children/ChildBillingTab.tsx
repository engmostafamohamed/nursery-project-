import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { ExtraHoursLedger } from '@/components/financial/ExtraHoursLedger';
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
import { useExtraHoursLedger } from '@/hooks/useExtraHoursLedger';
import { formatDate } from '@/lib/datetime';
import { summarizeInvoices } from '@/lib/familyFinance';
import { formatMoneyAmount } from '@/lib/money';

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
  const { t } = useTranslation();
  const ledger = useExtraHoursLedger([childId]);
  const invoiceRows = useMemo(() => query.data?.invoices ?? [], [query.data?.invoices]);
  const totals = useMemo(
    () => summarizeInvoices(invoiceRows.map((invoice) => ({ ...invoice, type: invoice.invoiceType, childIds: [childId] }))),
    [childId, invoiceRows],
  );
  const paymentsMade = useMemo(
    () =>
      invoiceRows
        .flatMap((invoice) => invoice.payments.map((payment) => ({ ...payment, invoice })))
        .sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? '')),
    [invoiceRows],
  );
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }

  const { subscription, extraHours } = query.data ?? { subscription: null, extraHours: null };
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

      {/* What this child was billed and paid, from the admission invoice onwards. */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          { key: 'invoiced', label: t('financial.childHistory.invoiced'), value: money(totals.invoiced), tone: '' },
          { key: 'paid', label: t('financial.childHistory.paid'), value: money(totals.paid), tone: 'text-success' },
          { key: 'outstanding', label: t('financial.childHistory.outstanding'), value: money(totals.outstanding), tone: totals.outstanding > 0 ? 'text-error' : '' },
          { key: 'review', label: t('financial.childHistory.inReview'), value: String(totals.inReviewCount), tone: totals.inReviewCount > 0 ? 'text-warning' : '' },
        ].map((stat) => (
          <div key={stat.key} className="rounded-xl border border-outline-variant bg-surface p-3">
            <p className="text-xs text-on-surface-variant">{stat.label}</p>
            <p className={`mt-1 text-base font-bold tabular-nums text-on-surface ${stat.tone}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface p-4">
        <p className="text-xs font-semibold uppercase text-on-surface-variant">{t('financial.childHistory.invoices')}</p>
        {invoiceRows.length === 0 ? (
          <p className="mt-2 text-sm text-on-surface-variant">{t('financial.childHistory.noInvoices')}</p>
        ) : (
          <ul className="mt-2 divide-y divide-outline-variant">
            {invoiceRows.map((invoice) => (
              <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <Link className="font-medium text-primary underline" to={`/admin/invoices/${invoice.id}`}>
                    {invoice.invoiceNumber}
                  </Link>
                  <span className="block text-xs text-on-surface-variant">
                    {t(`invoice.types.${invoice.invoiceType}`)} · {formatDate(invoice.dueDate)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-end">
                    <span className="block font-medium tabular-nums text-on-surface">{money(invoice.amount)}</span>
                    {invoice.balance > 0 && invoice.paidAmount > 0 ? (
                      <span className="block text-[11px] text-on-surface-variant">{t('parent.paymentRecord.remaining', { amount: money(invoice.balance) })}</span>
                    ) : null}
                  </span>
                  <Badge
                    variant={
                      invoice.status === 'paid' ? 'success' : invoice.inReview ? 'secondary' : invoice.status === 'cancelled' ? 'outline' : 'error'
                    }
                  >
                    {invoice.inReview && invoice.status !== 'paid' ? t('parent.paymentRecord.pending') : t(`invoice.status.${invoice.status}`)}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface p-4">
        <p className="text-xs font-semibold uppercase text-on-surface-variant">{t('financial.childHistory.payments')}</p>
        {paymentsMade.length === 0 ? (
          <p className="mt-2 text-sm text-on-surface-variant">{t('parent.paymentRecord.noPaymentsMade')}</p>
        ) : (
          <ul className="mt-2 divide-y divide-outline-variant">
            {paymentsMade.map((payment, index) => (
              <li key={`${payment.invoice.id}-${index}`} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium text-on-surface">{payment.paidAt ? formatDate(payment.paidAt) : '—'}</span>
                  <span className="block text-xs text-on-surface-variant">
                    {payment.method ? t(`payment.manualMethods.${payment.method}.label`, { defaultValue: payment.method }) : '—'} ·{' '}
                    {payment.invoice.invoiceNumber}
                  </span>
                </span>
                <span className="font-semibold tabular-nums text-success">{money(payment.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ExtraHoursLedger days={ledger.data ?? []} isLoading={ledger.isLoading} invoiceLinkBase="/admin/invoices" />

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
