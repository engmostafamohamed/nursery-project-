import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { InvoiceCheckoutPanel } from '@/components/payment/InvoiceCheckoutPanel';
import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useAuthSession } from '@/hooks/useAuthSession';
import type { ApplicationOnlineAttempt, ApplicationPackageInvoice } from '@/hooks/useApplicationPackagePayment';
import { useNurseryContact } from '@/hooks/useNurseryContact';
import { invalidatePaymentQueries } from '@/hooks/useSubmitInvoicePayment';
import { formatMoneyAmount } from '@/lib/money';
import { cancelUnfinishedOnlinePayment, paymentError, type ParentPaymentMethodCode } from '@/lib/paymentApi';
import { availableParentPaymentMethods, payableNow } from '@/lib/paymentMethods';
import { hasPaymobReturnParams, paymobReturnParams, verifyCheckoutReturn } from '@/lib/paymob/checkout';
import { useSettings } from '@/lib/useSettings';
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

/** Failure reasons with their own wording; anything else reads as a plain decline. */
const FAILURE_REASONS = new Set([
  'insufficient_funds',
  'authentication_failed',
  'card_expired',
  'timeout',
  'cancelled',
  'provider_error',
  'declined',
]);

type ReturnCheck = 'idle' | 'checking' | 'done' | { errorKey: string };

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

/** A declined or failed online payment: why, and the ways forward. */
function PaymentFailedCard({ reason, phone, email, onTryAgain, onChangeMethod }: {
  reason: string | null;
  phone: string | null;
  email: string | null;
  onTryAgain: () => void;
  onChangeMethod: () => void;
}) {
  const { t } = useTranslation();
  const reasonKey = reason && FAILURE_REASONS.has(reason) ? reason : 'declined';
  return (
    <section role="alert" className="rounded-xl border border-error/30 bg-error/5 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-error/15 text-error">
          <MaterialSymbol name="error" size="text-2xl" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-on-surface">{t('payment.failure.title')}</h2>
          <p className="mt-1 text-sm text-on-surface">
            <span className="font-medium">{t('payment.failure.reasonLabel')}</span>{' '}
            {t(`payment.failure.reasons.${reasonKey}`)}
          </p>
          <p className="mt-1 text-sm leading-6 text-on-surface-variant">{t('payment.failure.body')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" className="gap-1.5" onClick={onTryAgain}>
              <MaterialSymbol name="refresh" size="text-base" />
              {t('payment.failure.tryAgain')}
            </Button>
            <Button type="button" variant="outline" className="gap-1.5" onClick={onChangeMethod}>
              <MaterialSymbol name="swap_horiz" size="text-base" />
              {t('payment.failure.changeMethod')}
            </Button>
            {phone || email ? (
              <Button asChild variant="ghost" className="gap-1.5">
                <a href={phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : `mailto:${email}`}>
                  <MaterialSymbol name={phone ? 'call' : 'mail'} size="text-base" />
                  {t('payment.failure.contactNursery')}
                  <span dir="ltr" className="text-xs text-on-surface-variant">{phone ?? email}</span>
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Paymob issued a Fawry reference: the parent pays it at an outlet, then it confirms by itself. */
function FawryReferenceCard({ reference, amount }: { reference: string; amount: string }) {
  const { t } = useTranslation();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      toast.success(t('payment.fawryCode.copied'));
    } catch (error) {
      toast.error(t('payment.errors.actionFailed'), { description: error instanceof Error ? error.message : undefined });
    }
  };
  return (
    <section className="rounded-xl border border-outline-variant bg-surface p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
          <MaterialSymbol name="confirmation_number" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-on-surface">{t('payment.fawryCode.title')}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
            <p dir="ltr" className="font-mono text-3xl font-bold tracking-widest text-primary">{reference}</p>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void copy()}>
              <MaterialSymbol name="content_copy" size="text-base" />
              {t('payment.fawryCode.copy')}
            </Button>
          </div>
          <p className="mt-3 text-sm leading-6 text-on-surface">{t('payment.fawryCode.instructions', { amount })}</p>
          <p className="mt-1 text-xs text-on-surface-variant">{t('payment.fawryCode.expiryNote')}</p>
        </div>
      </div>
    </section>
  );
}

/**
 * The application's Payment step: every way the nursery accepts payment, for the package invoice,
 * paid in full in one payment. Coming back from Paymob, the signed result is checked on the
 * server and applied at once, so a failed payment can be retried right away.
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
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const { nurseryId, settings } = useSettings();
  // "Change payment method" opens on the first method that is not online checkout.
  const firstOtherMethod =
    availableParentPaymentMethods({ enabled: settings.payment_methods_enabled, onlineCheckoutAvailable: false })[0] ?? null;
  const contact = useNurseryContact(nurseryId).data;
  const [searchParams, setSearchParams] = useSearchParams();
  const [returnCheck, setReturnCheck] = useState<ReturnCheck>('idle');
  const returnCheckStarted = useRef(false);
  const [panel, setPanel] = useState<{ key: number; method: ParentPaymentMethodCode | null }>({ key: 0, method: null });
  const [cancelling, setCancelling] = useState(false);
  const checkoutRef = useRef<HTMLElement>(null);

  // Coming back from Paymob: have the server verify the signed result and apply it, then drop
  // Paymob's parameters from the address so a refresh does not send them again.
  useEffect(() => {
    if (returnCheckStarted.current || !hasPaymobReturnParams(searchParams)) return;
    returnCheckStarted.current = true;
    const params = paymobReturnParams(searchParams);
    setReturnCheck('checking');
    verifyCheckoutReturn(params)
      .then(() => setReturnCheck('done'))
      .catch((error: unknown) => setReturnCheck({ errorKey: paymentError(error).key }))
      .finally(() => {
        invalidatePaymentQueries(queryClient, user?.id);
        setSearchParams({ step: 'payment' }, { replace: true });
      });
  }, [queryClient, searchParams, setSearchParams, user?.id]);

  const showPanel = (method: ParentPaymentMethodCode | null) => {
    setPanel((current) => ({ key: current.key + 1, method }));
    requestAnimationFrame(() => checkoutRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const cancelUnfinished = async (attempt: ApplicationOnlineAttempt) => {
    const ok = await confirm({
      title: t('payment.unfinished.confirmTitle'),
      description: t('payment.unfinished.confirmBody'),
      confirmText: t('payment.unfinished.confirmAction'),
      icon: 'undo',
    });
    if (!ok) return;
    setCancelling(true);
    try {
      await cancelUnfinishedOnlinePayment(attempt.id);
      toast.success(t('payment.unfinished.done'));
    } catch (error) {
      const { key, values } = paymentError(error);
      toast.error(t(key, values));
    } finally {
      setCancelling(false);
      invalidatePaymentQueries(queryClient, user?.id);
    }
  };

  const returnNotice =
    returnCheck === 'checking' ? (
      <div role="status" className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-on-surface">
        <MaterialSymbol name="progress_activity" className="animate-spin text-primary" />
        <p className="leading-6">{t('payment.checkout.verifying')}</p>
      </div>
    ) : typeof returnCheck === 'object' ? (
      <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm text-on-surface">
        <MaterialSymbol name="warning" className="mt-0.5 text-warning" />
        <p className="leading-6">{t(returnCheck.errorKey)}</p>
      </div>
    ) : returnedFromCheckout && returnCheck === 'idle' ? (
      <div role="status" className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-on-surface">
        <MaterialSymbol name="hourglass_top" className="mt-0.5 text-primary" />
        <p className="leading-6">{t('payment.checkout.returnedFromProvider')}</p>
      </div>
    ) : null;

  if (isLoading || returnCheck === 'checking') {
    return returnNotice ?? (
      <p className="rounded-xl border border-outline-variant bg-surface p-5 text-sm text-on-surface-variant shadow-sm">{t('common.loading')}</p>
    );
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
  const attempt = invoice.onlineAttempt;
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
    const onlinePending = attempt?.status === 'pending_confirmation';
    return (
      <div className="space-y-4">
        {returnNotice}
        {onlinePending && attempt.providerReference ? (
          <FawryReferenceCard reference={attempt.providerReference} amount={money(invoice.pendingAmount)} />
        ) : (
          <StateCard
            icon="hourglass_top"
            tone="primary"
            title={t('applications.paymentTab.awaitingTitle')}
            body={t('applications.paymentPackage.pendingCoversBalance', { amount: invoice.pendingAmount.toFixed(2) })}
          >
            {onlinePending && !attempt.hasTransaction ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs leading-5 text-on-surface-variant">{t('payment.unfinished.hint')}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1.5"
                  disabled={cancelling}
                  aria-busy={cancelling}
                  onClick={() => void cancelUnfinished(attempt)}
                >
                  <MaterialSymbol name={cancelling ? 'hourglass_top' : 'undo'} size="text-base" />
                  {t('payment.unfinished.action')}
                </Button>
              </div>
            ) : null}
          </StateCard>
        )}
      </div>
    );
  }

  const lastOnlineFailed = attempt?.status === 'failed' && attempt.failureReason !== 'checkout_abandoned';

  return (
    <div className="space-y-4">
      {returnNotice}
      {lastOnlineFailed ? (
        <PaymentFailedCard
          reason={attempt.failureReason}
          phone={contact?.phone ?? null}
          email={contact?.email ?? null}
          onTryAgain={() => showPanel('card')}
          onChangeMethod={() => showPanel(firstOtherMethod)}
        />
      ) : null}
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <section ref={checkoutRef} className="scroll-mt-24 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5">
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
            key={panel.key}
            idPrefix="application-checkout"
            invoice={{ id: invoice.id, invoiceNumber: invoice.invoiceNumber, payableAmount: payable }}
            amountPolicy="full"
            returnPath={`/parent/applications/${applicationId}?step=payment`}
            beforePay={beforePay}
            initialMethod={panel.method}
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
