import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DiscountCountdown } from '@/components/parent/DiscountCountdown';
import {
  computePackageBillingQuote,
  isApplicationDealActive,
  type ApplicationPackageBillingPeriod,
  type ApplicationPaymentPackage,
  type ApplicationPackageInvoice,
} from '@/hooks/useApplicationPackagePayment';
import { cn } from '@/lib/utils';

type Props = {
  packages: ApplicationPaymentPackage[];
  invoice: ApplicationPackageInvoice | null;
  isLoading?: boolean;
  isError?: boolean;
  isSelecting?: boolean;
  canChoose: boolean;
  onRetry?: () => void;
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
  isError = false,
  isSelecting = false,
  canChoose,
  onRetry,
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
  const pendingQuote = activePackage ? computePackageBillingQuote(activePackage, billingPeriod) : null;
  const pendingTotal = pendingQuote?.total ?? 0;

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
      ) : isError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-6">
          <p role="alert" className="text-sm text-error">
            {t('applications.paymentPackage.loadError', {
              defaultValue: 'Could not load package and invoice information. Please try again.',
            })}
          </p>
          {onRetry ? (
            <Button type="button" variant="outline" onClick={onRetry}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          ) : null}
        </div>
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
              const quote = computePackageBillingQuote(pkg, billingPeriod);
              const dealLive = Boolean(pkg.deal && isApplicationDealActive(pkg.deal));
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
                  {dealLive ? (
                    <span className="mb-2 flex flex-wrap items-center gap-1.5">
                      <Badge variant="error">
                        {pkg.deal?.discountType === 'percentage'
                          ? t('applications.paymentPackage.dealPercentOff', {
                              value: pkg.deal.discountValue,
                              defaultValue: '{{value}}% OFF',
                            })
                          : t('applications.paymentPackage.dealAmountOff', {
                              value: pkg.deal?.discountValue.toFixed(2),
                              defaultValue: 'EGP {{value}} OFF',
                            })}
                      </Badge>
                      <DiscountCountdown endsAt={pkg.deal?.endsAt ?? null} />
                    </span>
                  ) : null}
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-on-surface">{packageName(pkg, isAr)}</span>
                      {pkg.dailyHours ? (
                        <span className="mt-1 block text-xs text-on-surface-variant">
                          {t('applications.paymentPackage.dailyHours', {
                            hours: pkg.dailyHours,
                            defaultValue: '{{hours}} hours/day',
                          })}
                        </span>
                      ) : null}
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
                  {pkg.featuresJson.length ? (
                    <ul className="mt-2 space-y-1">
                      {pkg.featuresJson.slice(0, 4).map((feature, index) => {
                        const text = isAr ? feature.ar || feature.en : feature.en || feature.ar;
                        return text ? (
                          <li key={index} className="flex items-start gap-1.5 text-xs leading-5 text-on-surface-variant">
                            <span className="material-symbols-outlined mt-0.5 text-sm text-success" aria-hidden>
                              check
                            </span>
                            <span className="line-clamp-1">{text}</span>
                          </li>
                        ) : null;
                      })}
                    </ul>
                  ) : null}
                  <span className="mt-auto flex flex-wrap items-baseline gap-2 pt-4">
                    {quote.discountAmount > 0 ? (
                      <span className="text-xs text-on-surface-variant line-through">
                        {t('invoice.egpAmount', { amount: quote.subtotal.toFixed(2) })}
                      </span>
                    ) : null}
                    <span className={cn('text-lg font-semibold', quote.discountAmount > 0 ? 'text-error' : 'text-on-surface')}>
                      {t('invoice.egpAmount', { amount: quote.total.toFixed(2) })}
                    </span>
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
                  {pendingQuote?.dealApplied ? (
                    <div className="mt-2">
                      <DiscountCountdown endsAt={activePackage.deal?.endsAt ?? null} />
                    </div>
                  ) : null}
                </div>
                <dl className="grid gap-2">
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">
                      {t('applications.paymentPackage.months', { defaultValue: 'Months' })}
                    </dt>
                    <dd className="font-medium text-on-surface">{pendingQuote?.billingMonths ?? billingOption.months}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">{t('invoice.details.subtotal', { defaultValue: 'Subtotal' })}</dt>
                    <dd className="font-medium text-on-surface">
                      {t('invoice.egpAmount', { amount: (pendingQuote?.subtotal ?? 0).toFixed(2) })}
                    </dd>
                  </div>
                  {pendingQuote && pendingQuote.discountAmount > 0 ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-error">{t('applications.paymentPackage.discount', { defaultValue: 'Discount' })}</dt>
                      <dd className="font-medium text-error">
                        -{t('invoice.egpAmount', { amount: pendingQuote.discountAmount.toFixed(2) })}
                      </dd>
                    </div>
                  ) : null}
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
                  {invoice.discountAmount > 0 && selectedPackage?.deal?.endsAt ? (
                    <div className="mt-2">
                      <DiscountCountdown endsAt={selectedPackage.deal.endsAt} />
                    </div>
                  ) : null}
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
                    <dt className="text-on-surface-variant">{t('invoice.details.subtotal', { defaultValue: 'Subtotal' })}</dt>
                    <dd className="font-medium text-on-surface">
                      {t('invoice.egpAmount', { amount: invoice.subtotal.toFixed(2) })}
                    </dd>
                  </div>
                  {invoice.discountAmount > 0 ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-error">{t('applications.paymentPackage.discount', { defaultValue: 'Discount' })}</dt>
                      <dd className="font-medium text-error">
                        -{t('invoice.egpAmount', { amount: invoice.discountAmount.toFixed(2) })}
                      </dd>
                    </div>
                  ) : null}
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
