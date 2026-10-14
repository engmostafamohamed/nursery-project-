import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { InvoiceCheckoutPanel } from '@/components/payment/InvoiceCheckoutPanel';
import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { ApplicationPackageInvoice } from '@/hooks/useApplicationPackagePayment';
import { formatMoneyAmount } from '@/lib/money';
import { payableNow } from '@/lib/paymentMethods';
import { cn } from '@/lib/utils';

type Props = {
  applicationId: string;
  invoice: ApplicationPackageInvoice | null;
  isLoading: boolean;
  /** The nursery did not accept the application, so no payment is taken. */
  rejected: boolean;
  /** The parent just came back from Paymob's checkout page. */
  returnedFromCheckout: boolean;
  onGoToPackages: () => void;
  /** Runs before the parent confirms a payment; return false to stop. */
  beforePay?: () => Promise<boolean>;
};

const PERIOD_LABEL_KEYS: Record<ApplicationPackageInvoice['billingPeriod'], string> = {
  monthly: 'applications.paymentPackage.period.monthly',
  quarterly: 'applications.paymentPackage.period.quarterly',
  half_annual: 'applications.paymentPackage.period.halfAnnual',
  annual: 'applications.paymentPackage.period.annual',
};

function StateCard({ icon, tone, title, body, children }: {
  icon: string;
  tone: 'primary' | 'success' | 'warning';
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-outline-variant bg-surface px-4 py-8 shadow-sm sm:px-6">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <span
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-full',
            tone === 'success' && 'bg-success/15 text-success',
            tone === 'warning' && 'bg-warning/15 text-warning',
            tone === 'primary' && 'bg-primary/10 text-primary',
          )}
        >
          <MaterialSymbol name={icon} size="text-2xl" />
        </span>
        <h2 className="mt-3 text-base font-semibold text-on-surface">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-on-surface-variant">{body}</p>
        {children}
      </div>
    </section>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' | 'error' | 'strong' }) {
  return (
    <div className={cn('flex justify-between gap-3', tone === 'strong' && 'border-t border-outline-variant pt-2')}>
      <dt className={cn('text-on-surface-variant', tone === 'strong' && 'font-semibold text-on-surface', tone === 'error' && 'text-error')}>{label}</dt>
      <dd
        className={cn(
          'font-medium text-on-surface',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-warning',
          tone === 'error' && 'text-error',
          tone === 'strong' && 'font-semibold',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * The application's Payment step: every way the nursery accepts payment, for the package invoice,
 * paid in full in one payment.
 */
export function ApplicationPaymentStep({
  applicationId,
  invoice,
  isLoading,
  rejected,
  returnedFromCheckout,
  onGoToPackages,
  beforePay,
}: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });

  const processingNotice = returnedFromCheckout ? (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-on-surface">
      <MaterialSymbol name="hourglass_top" className="mt-0.5 text-primary" />
      <p className="leading-6">{t('payment.checkout.returnedFromProvider')}</p>
    </div>
  ) : null;

  if (isLoading) {
    return <p className="rounded-xl border border-outline-variant bg-surface p-5 text-sm text-on-surface-variant shadow-sm">{t('common.loading')}</p>;
  }

  if (rejected) {
    return (
      <StateCard
        icon="block"
        tone="warning"
        title={t('applications.paymentTab.rejectedTitle')}
        body={t('applications.paymentTab.rejectedBody')}
      />
    );
  }

  if (!invoice) {
    return (
      <StateCard
        icon="inventory_2"
        tone="warning"
        title={t('applications.paymentTab.noInvoiceTitle')}
        body={t('applications.paymentTab.noInvoiceBody')}
      >
        <Button type="button" className="mt-4 gap-1" onClick={onGoToPackages}>
          <MaterialSymbol name="inventory_2" size="text-base" />
          {t('applications.paymentPackage.goToPackages')}
        </Button>
      </StateCard>
    );
  }

  const payable = payableNow(invoice);
  if (invoice.status === 'paid' || invoice.balanceDue <= 0) {
    return (
      <StateCard
        icon="verified"
        tone="success"
        title={t('applications.paymentTab.paidTitle')}
        body={t('applications.paymentTab.paidBody', { amount: money(invoice.paidAmount) })}
      />
    );
  }

  if (payable <= 0) {
    return (
      <div className="space-y-4">
        {processingNotice}
        <StateCard
          icon="hourglass_top"
          tone="primary"
          title={t('applications.paymentTab.awaitingTitle')}
          body={t('applications.paymentPackage.pendingCoversBalance', { amount: invoice.pendingAmount.toFixed(2) })}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {processingNotice}
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5">
          <div className="mb-5 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <MaterialSymbol name="payments" size="text-xl" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-on-surface">{t('applications.paymentTab.title')}</h2>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">{t('applications.paymentTab.subtitle')}</p>
            </div>
          </div>
          <InvoiceCheckoutPanel
            idPrefix="application-checkout"
            invoice={{ id: invoice.id, invoiceNumber: invoice.invoiceNumber, payableAmount: payable }}
            amountPolicy="full"
            returnPath={`/parent/applications/${applicationId}?step=payment`}
            beforePay={beforePay}
          />
        </section>

        <aside className="h-fit rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm 2xl:sticky 2xl:top-24">
          <h3 className="text-sm font-semibold text-on-surface">{t('signup.payment.orderSummary', { defaultValue: 'Order summary' })}</h3>
          <div className="mt-3 rounded-lg border border-outline-variant bg-surface p-3">
            <p className="font-semibold text-on-surface">{invoice.packageName || '-'}</p>
            <p className="mt-1 text-xs text-on-surface-variant">{t(PERIOD_LABEL_KEYS[invoice.billingPeriod])}</p>
          </div>
          <dl className="mt-3 grid gap-2 text-sm">
            <SummaryRow label={t('applications.paymentPackage.tuitionLine')} value={money(invoice.subtotal)} />
            {invoice.discountAmount > 0 ? (
              <SummaryRow label={t('applications.paymentPackage.discount')} value={`−${money(invoice.discountAmount)}`} tone="success" />
            ) : null}
            <SummaryRow
              label={
                invoice.extraHours
                  ? `${t('applications.extraHoursPackage.title')} · ${isAr ? invoice.extraHours.nameAr || invoice.extraHours.nameEn : invoice.extraHours.nameEn || invoice.extraHours.nameAr}`
                  : t('applications.extraHoursPackage.title')
              }
              value={invoice.extraHours ? money(invoice.extraHours.subtotal) : t('applications.extraHoursPackage.payPerHourBilledLater')}
            />
            {invoice.extraHours && invoice.extraHours.discountAmount > 0 ? (
              <SummaryRow
                label={t('applications.extraHoursPackage.discount')}
                value={`−${money(invoice.extraHours.discountAmount)}`}
                tone="success"
              />
            ) : null}
            <SummaryRow label={t('invoice.details.total')} value={money(invoice.amount)} />
            {invoice.paidAmount > 0 ? (
              <SummaryRow label={t('applications.paymentTab.paid')} value={money(invoice.paidAmount)} tone="success" />
            ) : null}
            {invoice.pendingAmount > 0 ? (
              <SummaryRow label={t('invoice.inReview')} value={money(invoice.pendingAmount)} tone="warning" />
            ) : null}
            <SummaryRow label={t('applications.paymentTab.dueNow')} value={money(payable)} tone="strong" />
          </dl>
          <Link className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary underline" to={`/parent/invoices/${invoice.id}`}>
            <MaterialSymbol name="receipt_long" size="text-sm" />
            {t('invoice.invoiceNumber', { number: invoice.invoiceNumber })}
          </Link>
        </aside>
      </div>
    </div>
  );
}
