import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { PointsRedemptionWidget } from '@/components/parent/PointsRedemptionWidget';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useInvoiceDetails, type InvoiceDetailsData } from '@/hooks/useInvoiceDetails';
import { useLoyalty } from '@/hooks/useLoyalty';
import { useSubmitInvoicePayment } from '@/hooks/useSubmitInvoicePayment';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { downloadInvoicePdf } from '@/lib/exports';
import { redeemLoyaltyPoints } from '@/lib/loyaltyPoints';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/lib/useSettings';
import { cn } from '@/lib/utils';

function invoiceStatusVariant(details: InvoiceDetailsData | null | undefined): 'default' | 'success' | 'warning' | 'error' | 'outline' {
  if (details?.inReview) return 'warning';
  if (details?.status === 'paid') return 'success';
  if (details?.status === 'overdue') return 'error';
  if (details?.status === 'cancelled') return 'outline';
  return 'default';
}

function safeFileName(value: string): string {
  return value.replace(/[^\w.-]+/g, '_').slice(0, 80);
}

function PaymentMetric({
  icon,
  label,
  value,
  tone = 'primary',
}: {
  icon: string;
  label: string;
  value: string;
  tone?: 'primary' | 'success' | 'warning' | 'error';
}) {
  const toneClass = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    error: 'bg-error/10 text-error',
  }[tone];

  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
      <div className="flex items-start gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', toneClass)}>
          <span className="material-symbols-outlined text-xl" aria-hidden>{icon}</span>
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-on-surface-variant">{label}</p>
          <p className="mt-1 break-words text-lg font-semibold text-on-surface">{value}</p>
        </div>
      </div>
    </div>
  );
}

function LabelValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
      <p className="text-[11px] font-semibold uppercase text-on-surface-variant">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-on-surface">{value || '-'}</p>
    </div>
  );
}

export function ParentPaymentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { invoiceId } = useParams();
  const [searchParams] = useSearchParams();
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';
  // Only follow in-app parent routes so the param cannot redirect elsewhere.
  const returnTo = searchParams.get('returnTo');
  const safeReturnTo = returnTo && /^\/parent\/[^/]/.test(returnTo) ? returnTo : null;
  const { user } = useAuthSession();
  const { settings, nurseryId } = useSettings();
  const loyalty = useLoyalty({ parentId: user?.id, nurseryId: nurseryId ?? undefined, enabled: Boolean(settings.loyalty_enabled) });
  const invoiceQuery = useInvoiceDetails(invoiceId);
  const invoice = invoiceQuery.data;
  const invoiceRef = useRef<HTMLElement | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submitPayment = useSubmitInvoicePayment();

  const inReview = Boolean(invoice?.inReview);
  const balanceDue = invoice?.balanceDue ?? invoice?.amount ?? 0;
  const parsedPaymentAmount = useMemo(() => Number(paymentAmount), [paymentAmount]);
  const defaultPaymentAmount = useMemo(
    () => (invoice ? (invoice.balanceDue || invoice.amount).toFixed(2) : ''),
    [invoice],
  );
  const validPaymentAmount =
    Number.isFinite(parsedPaymentAmount) && parsedPaymentAmount > 0 && parsedPaymentAmount <= balanceDue;
  const statusLabel = invoice?.inReview ? t('invoice.inReview') : t(`invoice.status.${invoice?.status ?? 'pending'}`);
  const typeLabel = invoice ? t(`invoice.types.${invoice.type}`) : '-';
  const quickAmounts = useMemo(() => {
    if (!balanceDue) return [];
    return [
      { label: t('payment.fullBalance', { defaultValue: 'Full balance' }), amount: balanceDue },
      { label: t('payment.halfBalance', { defaultValue: 'Half' }), amount: Math.max(1, balanceDue / 2) },
      { label: t('payment.quarterBalance', { defaultValue: 'Quarter' }), amount: Math.max(1, balanceDue / 4) },
    ];
  }, [balanceDue, t]);

  useEffect(() => {
    if (!defaultPaymentAmount) return;
    setPaymentAmount(defaultPaymentAmount);
  }, [defaultPaymentAmount]);

  if (!invoiceQuery.isLoading && !invoice) {
    return <EmptyState icon="receipt_long" title={t('invoice.details.notFound')} description={t('common.comingSoon')} />;
  }

  const downloadPdf = (receipt = false) => {
    if (!invoice) return;
    downloadInvoicePdf({
      receipt,
      invoiceNumber: invoice.invoiceNumber,
      parentName: invoice.parentName,
      childNames: invoice.childNames,
      typeLabel,
      statusLabel,
      dueDate: invoice.dueDate,
      createdAt: invoice.createdAt,
      paidAt: invoice.paidAt,
      paymentMethod: invoice.paymentMethod
        ? t(`invoice.paymentMethods.${invoice.paymentMethod}`, { defaultValue: invoice.paymentMethod })
        : null,
      lineItems: invoice.lineItems,
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      total: invoice.total,
    });
  };

  const downloadImage = async () => {
    if (!invoice || !invoiceRef.current) return;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(invoiceRef.current, {
        backgroundColor: '#ffffff',
        scale: Math.min(2, window.devicePixelRatio || 1.5),
      });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `invoice-${safeFileName(invoice.invoiceNumber)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      toast.error(t('payment.errors.actionFailed'));
    }
  };

  const shareInvoice = async () => {
    if (!invoice) return;
    const shareText = `${invoice.invoiceNumber} - ${t('invoice.egpAmount', { amount: invoice.total.toFixed(2) })}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: invoice.invoiceNumber,
          text: shareText,
          url: window.location.href,
        });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${shareText}\n${window.location.href}`);
        toast.success(t('common.copied', { defaultValue: 'Copied' }));
        return;
      }
      toast.error(t('payment.errors.actionFailed'));
    } catch {
      toast.error(t('payment.errors.actionFailed'));
    }
  };

  const handlePayNow = async () => {
    if (!invoice || !validPaymentAmount) return;
    setSubmitting(true);
    try {
      await submitPayment.mutateAsync({
        invoiceId: invoice.id,
        amount: parsedPaymentAmount,
        invoiceNumber: invoice.invoiceNumber,
      });
      await invoiceQuery.refetch();
      toast.success(t('payment.submittedForApproval'));
      navigate(safeReturnTo ?? `/parent/invoices${qs}`);
    } catch {
      toast.error(t('payment.errors.actionFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-none space-y-5 pb-28">
      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <div className="flex flex-col gap-4 border-b border-outline-variant bg-surface-container-lowest p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-primary">
              {t('payment.amountToPay', { defaultValue: 'Amount to pay' })}
            </p>
            <h1 className="mt-1 break-words text-3xl font-semibold text-on-surface">
              {t('invoice.egpAmount', { amount: balanceDue.toFixed(2) })}
            </h1>
            <p className="mt-2 text-sm text-on-surface-variant">
              {t('invoice.invoiceNumber', { number: invoice?.invoiceNumber ?? '' })}
            </p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <Button className="h-10 gap-2 rounded-md" variant="outline" onClick={() => void shareInvoice()}>
              <span className="material-symbols-outlined text-base" aria-hidden>share</span>
              {t('common.share', { defaultValue: 'Share' })}
            </Button>
            <Button className="h-10 gap-2 rounded-md" variant="outline" onClick={() => window.print()}>
              <span className="material-symbols-outlined text-base" aria-hidden>print</span>
              {t('common.print', { defaultValue: 'Print' })}
            </Button>
            <Button className="h-10 gap-2 rounded-md" variant="outline" onClick={() => void downloadImage()}>
              <span className="material-symbols-outlined text-base" aria-hidden>image</span>
              {t('invoice.details.downloadImage', { defaultValue: 'Download image' })}
            </Button>
            <Button className="h-10 gap-2 rounded-md" variant="outline" onClick={() => downloadPdf(false)}>
              <span className="material-symbols-outlined text-base" aria-hidden>picture_as_pdf</span>
              {t('invoice.details.downloadPdf')}
            </Button>
            <Button variant="outline" className="h-10 rounded-md" onClick={() => navigate(`/parent/invoices/${invoiceId}${qs}`)}>
              {t('invoice.details.back')}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
          <PaymentMetric
            icon="request_quote"
            label={t('invoice.details.total')}
            value={invoice ? t('invoice.egpAmount', { amount: invoice.total.toFixed(2) }) : '-'}
          />
          <PaymentMetric
            icon="check_circle"
            label={t('financial.paymentHistory.paidLabel', { defaultValue: 'Paid' })}
            value={invoice ? t('invoice.egpAmount', { amount: invoice.paidAmount.toFixed(2) }) : '-'}
            tone="success"
          />
          <PaymentMetric
            icon="hourglass_top"
            label={t('invoice.inReview')}
            value={invoice ? t('invoice.egpAmount', { amount: invoice.pendingAmount.toFixed(2) }) : '-'}
            tone="warning"
          />
          <PaymentMetric
            icon="event"
            label={t('parent.financial.nextDueLabel', { defaultValue: 'Next payment' })}
            value={invoice ? formatDate(invoice.dueDate) : '-'}
            tone={invoice?.balanceDue ? 'error' : 'success'}
          />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <article ref={invoiceRef} className="invoice-print-area overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
          <div className="flex flex-col gap-4 border-b border-outline-variant bg-surface-container-lowest p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-primary">XO Nursery</p>
              <h2 className="mt-1 break-words text-2xl font-semibold text-on-surface">{invoice?.invoiceNumber ?? '-'}</h2>
              <p className="mt-2 text-sm text-on-surface-variant">{typeLabel}</p>
            </div>
            <Badge variant={invoiceStatusVariant(invoice)} className="w-fit">
              {statusLabel}
            </Badge>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
            <LabelValue label={t('invoice.table.parent')} value={invoice?.parentName ?? '-'} />
            <LabelValue label={t('invoice.table.children')} value={invoice?.childNames.length ? invoice.childNames.join(', ') : '-'} />
            <LabelValue label={t('invoice.table.type')} value={typeLabel} />
            <LabelValue label={t('invoice.table.createdDate')} value={invoice ? formatDateTime(invoice.createdAt) : '-'} />
            <LabelValue label={t('invoice.table.dueDate')} value={invoice ? formatDateTime(invoice.dueDate) : '-'} />
            <LabelValue
              label={t('invoice.markPaid.paymentMethod')}
              value={invoice?.paymentMethod ? t(`invoice.paymentMethods.${invoice.paymentMethod}`, { defaultValue: invoice.paymentMethod }) : '-'}
            />
          </div>

          <div className="overflow-x-auto border-y border-outline-variant">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-surface-container-lowest text-xs uppercase text-on-surface-variant">
                <tr>
                  <th className="px-5 py-3 text-start font-semibold">{t('invoice.details.description')}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t('invoice.details.quantity')}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t('invoice.details.unitPrice')}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t('invoice.details.total')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {(invoice?.lineItems ?? []).map((item, idx) => (
                  <tr key={`${idx}-${item.description}`}>
                    <td className="px-5 py-4 font-semibold text-on-surface">{item.description}</td>
                    <td className="px-5 py-4 text-on-surface-variant">{item.quantity}</td>
                    <td className="px-5 py-4 text-on-surface-variant">{t('invoice.egpAmount', { amount: item.unitPrice.toFixed(2) })}</td>
                    <td className="px-5 py-4 font-semibold text-on-surface">{t('invoice.egpAmount', { amount: item.total.toFixed(2) })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-5 bg-surface-container-lowest p-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-3">
              {inReview ? (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm font-medium text-warning">
                  {t('invoice.inReviewNote')}
                </div>
              ) : (
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm font-medium text-primary">
                  {t('payment.approvalNote')}
                </div>
              )}
              {invoice?.notes ? <p className="text-sm text-on-surface-variant">{invoice.notes}</p> : null}
            </div>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-on-surface-variant">{t('invoice.details.subtotal')}</span>
                <span className="font-medium text-on-surface">{t('invoice.egpAmount', { amount: (invoice?.subtotal ?? 0).toFixed(2) })}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-on-surface-variant">{t('invoice.details.tax')}</span>
                <span className="font-medium text-on-surface">{t('invoice.egpAmount', { amount: (invoice?.tax ?? 0).toFixed(2) })}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-on-surface-variant">{t('financial.paymentHistory.paidLabel', { defaultValue: 'Paid' })}</span>
                <span className="font-semibold text-success">{t('invoice.egpAmount', { amount: (invoice?.paidAmount ?? 0).toFixed(2) })}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-on-surface-variant">{t('invoice.inReview')}</span>
                <span className="font-semibold text-warning">{t('invoice.egpAmount', { amount: (invoice?.pendingAmount ?? 0).toFixed(2) })}</span>
              </div>
              <div className="flex justify-between gap-3 border-t border-outline-variant pt-2">
                <span className="font-semibold text-on-surface">{t('financial.paymentHistory.balanceLabel', { defaultValue: 'Balance' })}</span>
                <span className="font-semibold text-on-surface">{t('invoice.egpAmount', { amount: balanceDue.toFixed(2) })}</span>
              </div>
            </div>
          </div>
        </article>

        <aside className="no-print space-y-5">
          <section className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm xl:sticky xl:top-24">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-on-surface">{t('payment.amountToPay', { defaultValue: 'Amount to pay' })}</h2>
                <p className="mt-1 text-xs leading-5 text-on-surface-variant">
                  {t('payment.partialHelp', { defaultValue: 'You can pay the full balance or submit a partial payment for finance review.' })}
                </p>
              </div>
              <Badge variant={invoiceStatusVariant(invoice)}>{statusLabel}</Badge>
            </div>

            {inReview ? (
              <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-primary">
                {t('invoice.inReviewNote')}
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label>{t('payment.amountToPay', { defaultValue: 'Amount to pay' })}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={balanceDue || undefined}
                    step={0.01}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {quickAmounts.map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPaymentAmount(preset.amount.toFixed(2))}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                {!validPaymentAmount && paymentAmount ? (
                  <p className="text-xs text-error">
                    {t('payment.invalidPartialAmount', { defaultValue: 'Enter an amount greater than 0 and not more than the balance.' })}
                  </p>
                ) : null}
                <Button className="h-11 w-full rounded-md" onClick={() => void handlePayNow()} disabled={submitting || !invoice || !validPaymentAmount}>
                  {submitting ? t('payment.submitting') : t('payment.payNowAmount', { amount: validPaymentAmount ? parsedPaymentAmount.toFixed(2) : '0.00' })}
                </Button>
              </div>
            )}

            <div className="mt-5 grid gap-3">
              <LabelValue label={t('invoice.table.invoiceNo')} value={invoice?.invoiceNumber ?? '-'} />
              <LabelValue label={t('parent.financial.nextDueLabel', { defaultValue: 'Next payment' })} value={invoice ? formatDate(invoice.dueDate) : '-'} />
              <LabelValue label={t('financial.paymentHistory.balanceLabel', { defaultValue: 'Balance' })} value={t('invoice.egpAmount', { amount: balanceDue.toFixed(2) })} />
            </div>

            {invoice?.status === 'paid' ? (
              <Button className="mt-4 h-10 w-full gap-2 rounded-md" variant="outline" onClick={() => downloadPdf(true)}>
                <span className="material-symbols-outlined text-base" aria-hidden>receipt</span>
                {t('invoice.details.downloadReceipt')}
              </Button>
            ) : null}
          </section>

          <PointsRedemptionWidget
            enabled={Boolean(settings.loyalty_enabled) && !inReview}
            balance={loyalty.summary.balance}
            invoiceAmount={invoice?.amount ?? 0}
            rate={Number(settings.points_redemption_rate ?? 0)}
            minPoints={100}
            maxDiscountPercent={0.5}
            onRedeem={async (points, discountEgp) => {
              if (!invoice || !nurseryId || !user?.id) return;
              await redeemLoyaltyPoints({
                nurseryId,
                parentId: user.id,
                invoiceId: invoice.id,
                points,
                description: `Redeemed for discount EGP ${discountEgp.toFixed(2)}`,
              });
              await supabase
                .from('invoices')
                .update({ amount: Math.max(0, invoice.amount - discountEgp).toFixed(2) } as never)
                .eq('id', invoice.id);
              await invoiceQuery.refetch();
              toast.success(t('loyalty.redemptionApplied'));
            }}
          />
        </aside>
      </section>
    </div>
  );
}
