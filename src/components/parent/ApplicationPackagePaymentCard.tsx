import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  ApplicationPackageBillingPeriod,
  ApplicationPaymentPackage,
  ApplicationPackageInvoice,
} from '@/hooks/useApplicationPackagePayment';
import { cn } from '@/lib/utils';

type Props = {
  packages: ApplicationPaymentPackage[];
  invoice: ApplicationPackageInvoice | null;
  isLoading?: boolean;
  isSelecting?: boolean;
  canChoose: boolean;
  /** Overrides the default pay-now destination (used to return the parent to the application after paying). */
  payLink?: string | null;
  /** Terms must be accepted before the invoice is created; paying then submits the application. */
  termsAccepted: boolean;
  onTermsChange: (accepted: boolean) => void;
  onSelect: (packageId: string, billingPeriod: ApplicationPackageBillingPeriod) => Promise<unknown>;
};

const billingPeriodOptions: Array<{
  value: ApplicationPackageBillingPeriod;
  months: number;
  labelKey: string;
  defaultLabel: string;
}> = [
  { value: 'monthly', months: 1, labelKey: 'applications.paymentPackage.period.monthly', defaultLabel: 'Monthly' },
  { value: 'quarterly', months: 3, labelKey: 'applications.paymentPackage.period.quarterly', defaultLabel: 'Quarter' },
  { value: 'half_annual', months: 6, labelKey: 'applications.paymentPackage.period.halfAnnual', defaultLabel: 'Half annual' },
  { value: 'annual', months: 12, labelKey: 'applications.paymentPackage.period.annual', defaultLabel: 'Annual' },
];

function packageName(pkg: ApplicationPaymentPackage, isAr: boolean): string {
  return isAr ? pkg.nameAr || pkg.nameEn : pkg.nameEn || pkg.nameAr;
}

function statusVariant(status: ApplicationPackageInvoice['status'] | 'not_selected') {
  if (status === 'paid') return 'success';
  if (status === 'partial' || status === 'in_review') return 'warning';
  if (status === 'overdue') return 'error';
  return 'secondary';
}

function packageDescription(pkg: ApplicationPaymentPackage, isAr: boolean): string | null {
  return isAr ? pkg.descriptionAr || pkg.descriptionEn : pkg.descriptionEn || pkg.descriptionAr;
}

export function ApplicationPackagePaymentCard({
  packages,
  invoice,
  isLoading = false,
  isSelecting = false,
  canChoose,
  payLink = null,
  termsAccepted,
  onTermsChange,
  onSelect,
}: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const selectedId = invoice?.packageId ?? '';
  const [draftBillingPeriod, setDraftBillingPeriod] = useState<ApplicationPackageBillingPeriod | null>(null);
  // Clicking a card only stages it; the invoice is created from the confirm button in the side panel.
  const [draftPackageId, setDraftPackageId] = useState<string | null>(null);
  const billingPeriod = draftBillingPeriod ?? invoice?.billingPeriod ?? 'monthly';
  const activeId = draftPackageId ?? selectedId;

  const selectedPackage = useMemo(
    () => packages.find((pkg) => pkg.id === selectedId) ?? null,
    [packages, selectedId],
  );
  const activePackage = useMemo(
    () => packages.find((pkg) => pkg.id === activeId) ?? null,
    [packages, activeId],
  );
  const billingOption = billingPeriodOptions.find((option) => option.value === billingPeriod) ?? billingPeriodOptions[0];
  const paymentStarted = (invoice?.paidAmount ?? 0) > 0 || (invoice?.pendingAmount ?? 0) > 0;
  // What can still be paid once amounts already awaiting finance confirmation are excluded.
  const payableNow = invoice ? Math.max(0, invoice.balanceDue - invoice.pendingAmount) : 0;
  const selectionDisabled = !canChoose || isSelecting || paymentStarted;
  // Something staged that the invoice does not reflect yet (new invoice, or a different package/period).
  const hasPendingChange = Boolean(activePackage) && (activeId !== selectedId || billingPeriod !== invoice?.billingPeriod);
  const pendingTotal = activePackage ? activePackage.price * billingOption.months : 0;

  const resetDraft = () => {
    setDraftPackageId(null);
    setDraftBillingPeriod(null);
  };

  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-xl" aria-hidden>payments</span>
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-on-surface">
              {t('applications.paymentPackage.title', { defaultValue: 'Payment package' })}
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-on-surface-variant">
              {t('applications.paymentPackage.subtitle', {
                defaultValue: 'Choose a package and pay all or part of it before final approval.',
              })}
            </p>
          </div>
        </div>
        <Badge variant={statusVariant(invoice?.status ?? 'not_selected')}>
          {invoice
            ? t(
                invoice.status === 'partial'
                  ? 'financial.paymentHistory.partial'
                  : invoice.status === 'unpaid'
                    ? 'invoice.status.pending'
                    : invoice.status === 'in_review'
                      ? 'invoice.inReview'
                      : `invoice.status.${invoice.status}`,
                { defaultValue: invoice.status },
              )
            : t('applications.paymentPackage.notSelected', { defaultValue: 'Not selected' })}
        </Badge>
      </div>

      {isLoading ? (
        <p className="px-5 py-6 text-sm text-on-surface-variant">{t('common.loading')}</p>
      ) : packages.length === 0 ? (
        <div className="flex items-start gap-3 px-5 py-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-container text-on-surface-variant">
            <span className="material-symbols-outlined text-xl" aria-hidden>inventory_2</span>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-on-surface">
              {t('applications.paymentPackage.noPackages', {
                defaultValue: 'No active payment packages are available yet.',
              })}
            </p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">
              {t('applications.paymentPackage.noPackagesHint', {
                defaultValue: 'The nursery admin publishes packages from Admin → Packages. Once a package is active, it appears here and you can choose it and pay all or part of it.',
              })}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="space-y-4 p-4 sm:p-5">
            <div className="grid gap-2 sm:grid-cols-4">
              {billingPeriodOptions.map((option) => {
                const active = option.value === billingPeriod;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={selectionDisabled}
                    onClick={() => setDraftBillingPeriod(option.value)}
                    className={cn(
                      'h-11 rounded-lg border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70',
                      active
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'border-outline-variant bg-surface-container-lowest text-on-surface hover:border-primary hover:bg-primary/5',
                    )}
                  >
                    {t(option.labelKey, { defaultValue: option.defaultLabel })}
                  </button>
                );
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {packages.map((pkg) => {
              const active = pkg.id === activeId;
              const description = packageDescription(pkg, isAr);
              const total = pkg.price * billingOption.months;
              return (
                <button
                  key={pkg.id}
                  type="button"
                  disabled={selectionDisabled}
                  aria-pressed={active}
                  onClick={() => setDraftPackageId(pkg.id)}
                  className={cn(
                    'group flex min-h-[168px] flex-col rounded-lg border p-4 text-start text-sm transition-all disabled:cursor-not-allowed disabled:opacity-70',
                    active
                      ? 'border-primary bg-primary/10 shadow-sm ring-2 ring-primary/10'
                      : 'border-outline-variant bg-surface-container-lowest hover:border-primary hover:bg-primary/5',
                  )}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-on-surface">{packageName(pkg, isAr)}</span>
                      <span className="mt-1 block text-xs text-on-surface-variant">
                        {pkg.coverageType === 'hours_quota'
                          ? t('packages.typeQuota', { hours: pkg.includedHours ?? 0 })
                          : t('packages.typeUnlimited')}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                        active ? 'border-primary bg-primary text-primary-foreground' : 'border-outline-variant text-on-surface-variant',
                      )}
                    >
                      <span className="material-symbols-outlined text-base" aria-hidden>
                        {active ? 'check' : 'add'}
                      </span>
                    </span>
                  </span>
                  {description ? (
                    <span className="mt-3 line-clamp-2 text-xs leading-5 text-on-surface-variant">{description}</span>
                  ) : null}
                  <span className="mt-auto pt-4 text-lg font-semibold text-on-surface">
                    {t('invoice.egpAmount', { amount: total.toFixed(2) })}
                  </span>
                  <span className="mt-1 text-xs text-on-surface-variant">
                    {t('applications.paymentPackage.monthlyPrice', {
                      amount: pkg.price.toFixed(2),
                      defaultValue: 'EGP {{amount}} monthly',
                    })}
                  </span>
                  <span
                    className={cn(
                      'mt-3 inline-flex h-9 w-full items-center justify-center gap-1 rounded-md border text-xs font-semibold transition',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-primary/30 bg-surface text-primary group-hover:bg-primary group-hover:text-primary-foreground',
                    )}
                  >
                    <span className="material-symbols-outlined text-base" aria-hidden>{active ? 'check' : 'add'}</span>
                    {active
                      ? t('applications.paymentPackage.selectedButton', { defaultValue: 'Selected' })
                      : t('applications.paymentPackage.selectButton', { defaultValue: 'Select package' })}
                  </span>
                </button>
              );
            })}
            </div>
          </div>

          <aside className="border-t border-outline-variant bg-surface-container-lowest p-4 sm:p-5 lg:border-l lg:border-t-0">
            {hasPendingChange && activePackage ? (
              <div className="space-y-4 text-sm">
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <p className="text-xs font-semibold uppercase text-on-surface-variant">
                    {t('applications.paymentPackage.yourChoice', { defaultValue: 'Your choice' })}
                  </p>
                  <p className="mt-1 font-semibold text-on-surface">{packageName(activePackage, isAr)}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {t(billingOption.labelKey, { defaultValue: billingOption.defaultLabel })}
                  </p>
                </div>
                <dl className="grid gap-2">
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">
                      {t('applications.paymentPackage.monthlyBase', { defaultValue: 'Monthly package price' })}
                    </dt>
                    <dd className="font-medium text-on-surface">
                      {t('invoice.egpAmount', { amount: activePackage.price.toFixed(2) })}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">
                      {t('applications.paymentPackage.months', { defaultValue: 'Months' })}
                    </dt>
                    <dd className="font-medium text-on-surface">{billingOption.months}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-outline-variant pt-2">
                    <dt className="font-semibold text-on-surface">{t('invoice.details.total')}</dt>
                    <dd className="font-semibold text-on-surface">{t('invoice.egpAmount', { amount: pendingTotal.toFixed(2) })}</dd>
                  </div>
                </dl>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-outline-variant bg-surface p-3 text-xs leading-5 text-on-surface">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={termsAccepted}
                    disabled={selectionDisabled}
                    onChange={(event) => onTermsChange(event.target.checked)}
                  />
                  <span>{t('applications.termsAccept')}</span>
                </label>
                <Button
                  type="button"
                  className="h-11 w-full gap-2 rounded-md"
                  disabled={selectionDisabled || !termsAccepted}
                  onClick={() => void onSelect(activePackage.id, billingPeriod)}
                >
                  <span className="material-symbols-outlined text-base" aria-hidden>
                    {isSelecting ? 'hourglass_top' : 'receipt_long'}
                  </span>
                  {isSelecting
                    ? t('common.saving')
                    : invoice
                      ? t('applications.paymentPackage.updateInvoice', { defaultValue: 'Update package' })
                      : t('applications.paymentPackage.createInvoice', { defaultValue: 'Confirm & create invoice' })}
                </Button>
                <p className="text-xs leading-5 text-on-surface-variant">
                  {t('applications.paymentPackage.confirmHint', {
                    defaultValue: 'You can pay all or part of this amount after the invoice is created. The application is sent for review as soon as a payment is submitted.',
                  })}
                </p>
                {invoice ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-on-surface-variant underline"
                    onClick={resetDraft}
                    disabled={isSelecting}
                  >
                    {t('applications.paymentPackage.keepCurrent', { defaultValue: 'Keep current package' })}
                  </button>
                ) : null}
              </div>
            ) : invoice ? (
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase text-on-surface-variant">
                    {t('invoice.table.invoiceNo')}
                  </p>
                  <Link className="mt-1 inline-flex font-semibold text-primary underline" to={`/parent/invoices/${invoice.id}`}>
                    {invoice.invoiceNumber}
                  </Link>
                </div>
                <div className="rounded-lg border border-outline-variant bg-surface p-3">
                  <p className="text-xs font-semibold uppercase text-on-surface-variant">
                    {t('applications.paymentPackage.selected', { defaultValue: 'Selected' })}
                  </p>
                  <p className="mt-1 font-semibold text-on-surface">
                    {selectedPackage ? packageName(selectedPackage, isAr) : invoice.packageName || '-'}
                  </p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {t(
                      billingPeriodOptions.find((option) => option.value === invoice.billingPeriod)?.labelKey ??
                        'applications.paymentPackage.period.monthly',
                      {
                        defaultValue:
                          billingPeriodOptions.find((option) => option.value === invoice.billingPeriod)?.defaultLabel ?? 'Monthly',
                      },
                    )}
                  </p>
                </div>
                <dl className="grid gap-2">
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">
                      {t('applications.paymentPackage.monthlyBase', { defaultValue: 'Monthly package price' })}
                    </dt>
                    <dd className="font-medium text-on-surface">
                      {t('invoice.egpAmount', { amount: invoice.monthlyPrice.toFixed(2) })}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">{t('invoice.details.total')}</dt>
                    <dd className="font-medium text-on-surface">{t('invoice.egpAmount', { amount: invoice.amount.toFixed(2) })}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">{t('financial.paymentHistory.paidLabel', { defaultValue: 'Paid' })}</dt>
                    <dd className="font-medium text-success">{t('invoice.egpAmount', { amount: invoice.paidAmount.toFixed(2) })}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">{t('invoice.inReview')}</dt>
                    <dd className="font-medium text-warning">{t('invoice.egpAmount', { amount: invoice.pendingAmount.toFixed(2) })}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-outline-variant pt-2">
                    <dt className="font-semibold text-on-surface">{t('financial.paymentHistory.balanceLabel', { defaultValue: 'Balance' })}</dt>
                    <dd className="font-semibold text-on-surface">{t('invoice.egpAmount', { amount: invoice.balanceDue.toFixed(2) })}</dd>
                  </div>
                </dl>
                {invoice.balanceDue > 0 && payableNow <= 0 ? (
                  <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
                    <span className="material-symbols-outlined text-base" aria-hidden>hourglass_top</span>
                    <span>
                      {t('applications.paymentPackage.pendingCoversBalance', {
                        amount: invoice.pendingAmount.toFixed(2),
                        defaultValue: 'EGP {{amount}} is awaiting nursery confirmation. No further payment is needed right now.',
                      })}
                    </span>
                  </div>
                ) : null}
                {payableNow > 0 ? (
                  <div className="space-y-2">
                    <Button asChild className="h-11 w-full gap-2 rounded-md">
                      <Link to={payLink ?? `/parent/invoices/${invoice.id}/pay`}>
                        <span className="material-symbols-outlined text-base" aria-hidden>credit_card</span>
                        {t('payment.payNowAmount', { amount: payableNow.toFixed(2) })}
                      </Link>
                    </Button>
                    {!paymentStarted ? (
                      <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
                        {t('applications.paymentPackage.payHint', {
                          defaultValue: 'Pay all or part of the package price now. The application is sent for review as soon as your payment is submitted.',
                        })}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-outline-variant bg-surface p-4 text-sm leading-6 text-on-surface-variant">
                {t('applications.paymentPackage.chooseToCreateInvoice', {
                  defaultValue: 'Pick a billing period and press "Select package" on a card. The total appears here before the invoice is created.',
                })}
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
