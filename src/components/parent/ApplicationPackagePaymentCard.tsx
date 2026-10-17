import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { DiscountCountdown } from '@/components/parent/DiscountCountdown';
import {
  computePackageBillingQuote,
  isApplicationDealActive,
  offeredBillingPeriods,
  type ApplicationPackageBillingPeriod,
  type ApplicationPaymentPackage,
  type ApplicationPackageInvoice,
} from '@/hooks/useApplicationPackagePayment';
import { formatMoneyAmount } from '@/lib/money';
import { payableNow as payableNowFor } from '@/lib/paymentMethods';
import { cn } from '@/lib/utils';

type Props = {
  packages: ApplicationPaymentPackage[];
  invoice: ApplicationPackageInvoice | null;
  isLoading?: boolean;
  isError?: boolean;
  isSelecting?: boolean;
  canChoose: boolean;
  onRetry?: () => void;
  /** Opens the payment step for the created invoice. */
  onPayNow: () => void;
  /** Terms must be accepted before the invoice is created; paying then submits the application. */
  termsAccepted: boolean;
  onTermsChange: (accepted: boolean) => void;
  onSelect: (packageId: string, billingPeriod: ApplicationPackageBillingPeriod) => Promise<unknown>;
  /** How extra time is paid, shown as its own section before the summary. */
  extraHoursSection?: ReactNode;
  /** The extra-hours package chosen so far (null = pay per hour), for the summary preview. */
  extraHoursChoice?: { name: string; subtotal: number; discountAmount: number } | null;
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

function packageDescription(pkg: ApplicationPaymentPackage, isAr: boolean): string | null {
  return isAr ? pkg.descriptionAr || pkg.descriptionEn : pkg.descriptionEn || pkg.descriptionAr;
}

function statusVariant(status: ApplicationPackageInvoice['status'] | 'not_selected') {
  if (status === 'paid') return 'success';
  if (status === 'partial' || status === 'in_review') return 'warning';
  if (status === 'overdue') return 'error';
  return 'secondary';
}

/** How much cheaper a longer period is than paying the same months one by one (before any deal). */
function periodSavingPercent(pkg: ApplicationPaymentPackage, period: ApplicationPackageBillingPeriod): number {
  const quote = computePackageBillingQuote(pkg, period);
  const monthByMonth = pkg.price * quote.billingMonths;
  if (monthByMonth <= 0 || quote.subtotal >= monthByMonth) return 0;
  return Math.round((1 - quote.subtotal / monthByMonth) * 100);
}

function SectionHeading({ index, title, hint, action }: { index: number; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
          {index}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
          {hint ? <p className="mt-0.5 text-xs leading-5 text-on-surface-variant">{hint}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

function SummaryLine({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' | 'total' }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', tone === 'total' && 'border-t border-outline-variant pt-3')}>
      <dt className={cn('text-on-surface-variant', tone === 'total' && 'font-semibold text-on-surface')}>{label}</dt>
      <dd
        className={cn(
          'font-medium tabular-nums text-on-surface',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-warning',
          tone === 'total' && 'text-xl font-bold tracking-tight',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function ApplicationPackagePaymentCard({
  packages,
  invoice,
  isLoading = false,
  isError = false,
  isSelecting = false,
  canChoose,
  onRetry,
  onPayNow,
  termsAccepted,
  onTermsChange,
  onSelect,
  extraHoursSection,
  extraHoursChoice = null,
}: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  const selectedId = invoice?.packageId ?? '';
  const [draftBillingPeriod, setDraftBillingPeriod] = useState<ApplicationPackageBillingPeriod | null>(null);
  // Clicking a card only stages it; the invoice is created from the confirm button in the summary.
  const [draftPackageId, setDraftPackageId] = useState<string | null>(null);
  // Only the periods at least one package offers; a package without the chosen period cannot be picked.
  const periodOptions = useMemo(() => {
    const offered = billingPeriodOptions.filter((option) => packages.some((pkg) => offeredBillingPeriods(pkg).includes(option.value)));
    return offered.length ? offered : billingPeriodOptions;
  }, [packages]);
  const billingPeriod = draftBillingPeriod ?? invoice?.billingPeriod ?? periodOptions[0].value;
  const activeId = draftPackageId ?? selectedId;

  const selectedPackage = useMemo(
    () => packages.find((pkg) => pkg.id === selectedId) ?? null,
    [packages, selectedId],
  );
  const activePackage = useMemo(
    () => packages.find((pkg) => pkg.id === activeId) ?? null,
    [packages, activeId],
  );
  // Best saving a period offers across the packages, shown on the period switch.
  const bestSavingByPeriod = useMemo(
    () => Object.fromEntries(
      billingPeriodOptions.map((option) => [
        option.value,
        Math.max(
          0,
          ...packages
            .filter((pkg) => offeredBillingPeriods(pkg).includes(option.value))
            .map((pkg) => periodSavingPercent(pkg, option.value)),
        ),
      ]),
    ) as Record<ApplicationPackageBillingPeriod, number>,
    [packages],
  );
  const periodLabel = (period: ApplicationPackageBillingPeriod) => {
    const option = billingPeriodOptions.find((candidate) => candidate.value === period) ?? billingPeriodOptions[0];
    return t(option.labelKey, { defaultValue: option.defaultLabel });
  };
  const paymentStarted = (invoice?.paidAmount ?? 0) > 0 || (invoice?.pendingAmount ?? 0) > 0;
  // What can still be paid once amounts already awaiting finance confirmation are excluded.
  const payableNow = invoice ? payableNowFor(invoice) : 0;
  const selectionDisabled = !canChoose || isSelecting || paymentStarted;
  // Something staged that the invoice does not reflect yet (new invoice, or a different package/period).
  const activeOffersPeriod = Boolean(activePackage && offeredBillingPeriods(activePackage).includes(billingPeriod));
  const hasPendingChange = activeOffersPeriod && (activeId !== selectedId || billingPeriod !== invoice?.billingPeriod);
  const pendingQuote = activePackage ? computePackageBillingQuote(activePackage, billingPeriod) : null;
  const extraHoursNet = extraHoursChoice ? Math.max(0, extraHoursChoice.subtotal - extraHoursChoice.discountAmount) : 0;
  const summaryIndex = extraHoursSection ? 4 : 3;
  /** The extra-hours lines of a summary: the chosen package, or the default per-hour billing. */
  const extraHoursLines = (extra: { name: string; subtotal: number; discountAmount: number } | null) =>
    extra ? (
      <>
        <SummaryLine label={`${t('applications.extraHoursPackage.title', { defaultValue: 'Extra hours' })} · ${extra.name}`} value={money(extra.subtotal)} />
        {extra.discountAmount > 0 ? (
          <SummaryLine
            label={t('applications.extraHoursPackage.discount', { defaultValue: 'Discount' })}
            value={`−${money(extra.discountAmount)}`}
            tone="success"
          />
        ) : null}
      </>
    ) : extraHoursSection ? (
      <SummaryLine
        label={t('applications.extraHoursPackage.title', { defaultValue: 'Extra hours' })}
        value={t('applications.extraHoursPackage.payPerHourBilledLater')}
      />
    ) : null;
  const statusLabel = invoice
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
    : t('applications.paymentPackage.notSelected', { defaultValue: 'Not selected' });

  const resetDraft = () => {
    setDraftPackageId(null);
    setDraftBillingPeriod(null);
  };

  const dealLabel = (pkg: ApplicationPaymentPackage) =>
    pkg.deal?.discountType === 'percentage'
      ? t('applications.paymentPackage.dealPercentOff', { value: pkg.deal.discountValue, defaultValue: '{{value}}% OFF' })
      : t('applications.paymentPackage.dealAmountOff', {
          value: formatMoneyAmount(pkg.deal?.discountValue ?? 0),
          defaultValue: 'EGP {{value}} OFF',
        });

  return (
    <section className="overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MaterialSymbol name="workspace_premium" size="text-2xl" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-on-surface">
              {t('applications.paymentPackage.title', { defaultValue: 'Payment package' })}
            </h2>
            <p className="mt-0.5 max-w-2xl text-sm leading-5 text-on-surface-variant">
              {t('applications.paymentPackage.subtitle')}
            </p>
          </div>
        </div>
        <Badge variant={statusVariant(invoice?.status ?? 'not_selected')}>{statusLabel}</Badge>
      </header>

      {isLoading ? (
        <div role="status" className="flex items-center gap-3 px-5 py-8 text-sm text-on-surface-variant">
          <MaterialSymbol name="progress_activity" className="animate-spin text-primary" />
          {t('common.loading')}
        </div>
      ) : isError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-6">
          <p role="alert" className="flex items-center gap-2 text-sm text-error">
            <MaterialSymbol name="error" />
            {t('applications.paymentPackage.loadError', {
              defaultValue: 'Could not load package and invoice information. Please try again.',
            })}
          </p>
          {onRetry ? (
            <Button type="button" variant="outline" onClick={onRetry}>
              <MaterialSymbol name="refresh" size="text-base" />
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          ) : null}
        </div>
      ) : packages.length === 0 ? (
        <div className="flex flex-col items-center px-5 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
            <MaterialSymbol name="inventory_2" size="text-2xl" />
          </span>
          <p className="mt-3 text-sm font-semibold text-on-surface">
            {t('applications.paymentPackage.noPackages', { defaultValue: 'No active payment packages are available yet.' })}
          </p>
          <p className="mt-1 max-w-md text-xs leading-5 text-on-surface-variant">{t('applications.paymentPackage.noPackagesHint')}</p>
        </div>
      ) : (
        <>
          <div className="space-y-7 p-5">
            <div className="space-y-3">
              <SectionHeading
                index={1}
                title={t('applications.paymentPackage.sections.period')}
                hint={t('applications.paymentPackage.periodHint')}
              />
              <div
                role="radiogroup"
                aria-label={t('applications.paymentPackage.sections.period')}
                className={cn(
                  'grid gap-1 rounded-xl bg-surface-container p-1',
                  periodOptions.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
                  periodOptions.length === 3 && 'sm:grid-cols-3',
                  periodOptions.length >= 4 && 'sm:grid-cols-4',
                )}
              >
                {periodOptions.map((option) => {
                  const active = option.value === billingPeriod;
                  const saving = bestSavingByPeriod[option.value];
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={selectionDisabled}
                      onClick={() => setDraftBillingPeriod(option.value)}
                      className={cn(
                        'flex min-h-[3.25rem] flex-col items-center justify-center rounded-lg px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60',
                        active
                          ? 'bg-surface text-primary shadow-sm ring-1 ring-primary/20'
                          : 'text-on-surface-variant hover:bg-surface/60 hover:text-on-surface',
                      )}
                    >
                      {t(option.labelKey, { defaultValue: option.defaultLabel })}
                      {saving > 0 ? (
                        <span className="mt-0.5 text-[11px] font-medium text-success">
                          {t('applications.paymentPackage.saveUpTo', { percent: saving })}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <SectionHeading index={2} title={t('applications.paymentPackage.sections.package')} />
              <div
                role="radiogroup"
                aria-label={t('applications.paymentPackage.sections.package')}
                className="grid gap-4 sm:grid-cols-2"
              >
                {packages.map((pkg) => {
                  const active = pkg.id === activeId;
                  const description = packageDescription(pkg, isAr);
                  const quote = computePackageBillingQuote(pkg, billingPeriod);
                  const offersPeriod = offeredBillingPeriods(pkg).includes(billingPeriod);
                  const dealLive = Boolean(pkg.deal && isApplicationDealActive(pkg.deal));
                  const perMonth = quote.billingMonths > 1 ? quote.total / quote.billingMonths : null;
                  const features = pkg.featuresJson
                    .map((feature) => (isAr ? feature.ar || feature.en : feature.en || feature.ar))
                    .filter(Boolean)
                    .slice(0, 4);
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={selectionDisabled || !offersPeriod}
                      onClick={() => setDraftPackageId(pkg.id)}
                      className={cn(
                        'group relative flex flex-col rounded-2xl border bg-surface p-5 text-start transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-70',
                        active
                          ? 'border-primary shadow-md ring-1 ring-primary'
                          : 'border-outline-variant hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md',
                      )}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-base font-semibold text-on-surface">{packageName(pkg, isAr)}</span>
                          {pkg.dailyHours ? (
                            <span className="mt-1 inline-flex items-center gap-1 text-xs text-on-surface-variant">
                              <MaterialSymbol name="schedule" size="text-sm" />
                              {t('applications.paymentPackage.dailyHours', { hours: pkg.dailyHours, defaultValue: '{{hours}} hours/day' })}
                            </span>
                          ) : null}
                        </span>
                        <span
                          aria-hidden
                          className={cn(
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition',
                            active ? 'border-primary bg-primary text-primary-foreground' : 'border-outline-variant text-transparent',
                          )}
                        >
                          <MaterialSymbol name="check" size="text-sm" />
                        </span>
                      </span>

                      {dealLive ? (
                        <span className="mt-3 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                            <MaterialSymbol name="sell" size="text-sm" />
                            {dealLabel(pkg)}
                          </span>
                          <DiscountCountdown endsAt={pkg.deal?.endsAt ?? null} />
                        </span>
                      ) : null}

                      {offersPeriod ? (
                        <span className="mt-4 block">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-3xl font-bold tracking-tight tabular-nums text-on-surface">{money(quote.total)}</span>
                            <span className="text-sm text-on-surface-variant">
                              {quote.billingMonths === 1
                                ? t('applications.paymentPackage.perMonth')
                                : t('applications.paymentPackage.forMonths', { count: quote.billingMonths })}
                            </span>
                          </span>
                          {quote.discountAmount > 0 || perMonth ? (
                            <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-on-surface-variant">
                              {quote.discountAmount > 0 ? <span className="tabular-nums line-through">{money(quote.subtotal)}</span> : null}
                              {perMonth ? (
                                <span className="tabular-nums">{t('applications.paymentPackage.perMonthEquivalent', { amount: money(perMonth) })}</span>
                              ) : null}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="mt-4 flex items-center gap-1.5 rounded-lg bg-surface-container px-3 py-2 text-sm text-on-surface-variant">
                          <MaterialSymbol name="event_busy" size="text-base" />
                          {t('applications.paymentPackage.periodNotOffered', { period: periodLabel(billingPeriod) })}
                        </span>
                      )}

                      {description ? (
                        <span className="mt-3 line-clamp-2 text-sm leading-5 text-on-surface-variant">{description}</span>
                      ) : null}

                      {features.length > 0 ? (
                        <span className="mt-4 block space-y-2 border-t border-outline-variant pt-4">
                          {features.map((feature) => (
                            <span key={feature} className="flex items-start gap-2 text-sm text-on-surface">
                              <MaterialSymbol name="check_circle" size="text-base" className="mt-px text-success" />
                              <span className="min-w-0">{feature}</span>
                            </span>
                          ))}
                        </span>
                      ) : null}

                      <span className="mt-auto block pt-5">
                        <span
                          className={cn(
                            'inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition',
                            active
                              ? 'bg-primary text-primary-foreground'
                              : 'border border-outline-variant text-on-surface group-hover:border-primary group-hover:text-primary',
                          )}
                        >
                          {active ? <MaterialSymbol name="check" size="text-base" /> : null}
                          {active
                            ? t('applications.paymentPackage.selectedButton', { defaultValue: 'Selected' })
                            : t('applications.paymentPackage.selectButton', { defaultValue: 'Select package' })}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {extraHoursSection ? (
            <div className="space-y-3 border-t border-outline-variant p-5">
              <SectionHeading
                index={3}
                title={t('applications.extraHoursPackage.title', { defaultValue: 'Extra hours' })}
                hint={t('applications.extraHoursPackage.sectionHint')}
              />
              {extraHoursSection}
            </div>
          ) : null}

          <div className="space-y-4 border-t border-outline-variant bg-surface-container-lowest p-5">
            <SectionHeading index={summaryIndex} title={t('applications.paymentPackage.sections.summary')} />

            {hasPendingChange && activePackage && pendingQuote ? (
              <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]">
                <div className="rounded-xl border border-outline-variant bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
                        {t('applications.paymentPackage.yourChoice', { defaultValue: 'Your choice' })}
                      </p>
                      <p className="mt-1 font-semibold text-on-surface">{packageName(activePackage, isAr)}</p>
                      <p className="text-xs text-on-surface-variant">
                        {periodLabel(billingPeriod)} · {t('applications.paymentPackage.monthsCount', { count: pendingQuote.billingMonths })}
                      </p>
                    </div>
                    {pendingQuote.dealApplied ? <DiscountCountdown endsAt={activePackage.deal?.endsAt ?? null} /> : null}
                  </div>
                  <dl className="mt-4 space-y-2 text-sm">
                    <SummaryLine label={t('applications.paymentPackage.tuitionLine')} value={money(pendingQuote.subtotal)} />
                    {pendingQuote.discountAmount > 0 ? (
                      <SummaryLine
                        label={t('applications.paymentPackage.discount', { defaultValue: 'Discount' })}
                        value={`−${money(pendingQuote.discountAmount)}`}
                        tone="success"
                      />
                    ) : null}
                    {extraHoursLines(extraHoursChoice)}
                    <SummaryLine label={t('invoice.details.total')} value={money(pendingQuote.total + extraHoursNet)} tone="total" />
                  </dl>
                </div>
                <div className="flex flex-col gap-3">
                  {/* Terms are normally accepted on the review step; ask here only if they were not. */}
                  {!termsAccepted ? (
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
                  ) : null}
                  <Button
                    type="button"
                    className="h-12 w-full gap-2 rounded-xl text-base"
                    disabled={selectionDisabled || !termsAccepted}
                    onClick={() => void onSelect(activePackage.id, billingPeriod)}
                  >
                    <MaterialSymbol name={isSelecting ? 'hourglass_top' : 'receipt_long'} size="text-lg" />
                    {isSelecting
                      ? t('common.saving')
                      : invoice
                        ? t('applications.paymentPackage.updateInvoice', { defaultValue: 'Update package' })
                        : t('applications.paymentPackage.createInvoice', { defaultValue: 'Confirm & create invoice' })}
                  </Button>
                  <p className="text-xs leading-5 text-on-surface-variant">{t('applications.paymentPackage.confirmHint')}</p>
                  {invoice ? (
                    <button
                      type="button"
                      className="self-start text-xs font-semibold text-primary hover:underline"
                      onClick={resetDraft}
                      disabled={isSelecting}
                    >
                      {t('applications.paymentPackage.keepCurrent', { defaultValue: 'Keep current package' })}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : invoice ? (
              <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]">
                <div className="rounded-xl border border-outline-variant bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-on-surface">
                        {selectedPackage ? packageName(selectedPackage, isAr) : invoice.packageName || '-'}
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        {periodLabel(invoice.billingPeriod)} · {t('applications.paymentPackage.monthsCount', { count: invoice.billingMonths })}
                      </p>
                    </div>
                    <Link
                      className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 text-xs font-semibold text-primary hover:underline"
                      to={`/parent/invoices/${invoice.id}`}
                    >
                      <MaterialSymbol name="receipt_long" size="text-sm" />
                      {invoice.invoiceNumber}
                    </Link>
                  </div>
                  {invoice.discountAmount > 0 && selectedPackage?.deal?.endsAt ? (
                    <div className="mt-2">
                      <DiscountCountdown endsAt={selectedPackage.deal.endsAt} />
                    </div>
                  ) : null}
                  <dl className="mt-4 space-y-2 text-sm">
                    <SummaryLine label={t('applications.paymentPackage.tuitionLine')} value={money(invoice.subtotal)} />
                    {invoice.discountAmount > 0 ? (
                      <SummaryLine
                        label={t('applications.paymentPackage.discount', { defaultValue: 'Discount' })}
                        value={`−${money(invoice.discountAmount)}`}
                        tone="success"
                      />
                    ) : null}
                    {extraHoursLines(
                      invoice.extraHours
                        ? {
                            name: (isAr ? invoice.extraHours.nameAr || invoice.extraHours.nameEn : invoice.extraHours.nameEn || invoice.extraHours.nameAr),
                            subtotal: invoice.extraHours.subtotal,
                            discountAmount: invoice.extraHours.discountAmount,
                          }
                        : null,
                    )}
                    <SummaryLine label={t('invoice.details.total')} value={money(invoice.amount)} />
                    {invoice.paidAmount > 0 ? (
                      <SummaryLine label={t('applications.paymentTab.paid')} value={money(invoice.paidAmount)} tone="success" />
                    ) : null}
                    {invoice.pendingAmount > 0 ? (
                      <SummaryLine label={t('invoice.inReview')} value={money(invoice.pendingAmount)} tone="warning" />
                    ) : null}
                    <SummaryLine label={t('applications.paymentTab.dueNow')} value={money(payableNow)} tone="total" />
                  </dl>
                </div>
                <div className="flex flex-col gap-3">
                  {payableNow > 0 ? (
                    <>
                      <Button type="button" className="h-12 w-full gap-2 rounded-xl text-base" onClick={onPayNow}>
                        <MaterialSymbol name="credit_card" size="text-lg" />
                        {t('applications.paymentPackage.continueToPayment')}
                      </Button>
                      <p className="text-xs leading-5 text-on-surface-variant">{t('applications.paymentPackage.payHint')}</p>
                    </>
                  ) : invoice.balanceDue > 0 ? (
                    <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs leading-5 text-warning">
                      <MaterialSymbol name="hourglass_top" size="text-base" />
                      <span>
                        {t('applications.paymentPackage.pendingCoversBalance', { amount: formatMoneyAmount(invoice.pendingAmount) })}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 rounded-xl border border-success/30 bg-success/10 p-3 text-xs leading-5 text-success">
                      <MaterialSymbol name="verified" size="text-base" />
                      <span>{t('applications.paymentTab.paidTitle')}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 rounded-xl border border-dashed border-outline-variant bg-surface p-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-container text-on-surface-variant">
                  <MaterialSymbol name="shopping_bag" size="text-2xl" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface">{t('applications.paymentPackage.emptySummaryTitle')}</p>
                  <p className="mt-0.5 text-xs leading-5 text-on-surface-variant">{t('applications.paymentPackage.chooseToCreateInvoice')}</p>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
