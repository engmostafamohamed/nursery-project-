import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { useInvoiceDetails, type InvoiceDetailsData } from '@/hooks/useInvoiceDetails';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { downloadInvoicePdf } from '@/lib/exports';
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

function DetailMetric({
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

export function ParentInvoiceDetailsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { invoiceId } = useParams();
  const [searchParams] = useSearchParams();
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';
  const detailsQuery = useInvoiceDetails(invoiceId);
  const details = detailsQuery.data;
  const invoiceRef = useRef<HTMLElement | null>(null);
  const nowMs = useMemo(() => Date.now(), []);

  if (!detailsQuery.isLoading && !details) {
    return <EmptyState icon="receipt_long" title={t('invoice.details.notFound')} description={t('common.comingSoon')} />;
  }

  const dueDate = details ? new Date(details.dueDate) : null;
  const countdown = dueDate ? Math.ceil((dueDate.getTime() - nowMs) / 86400000) : 0;
  const canPay = (details?.status === 'pending' || details?.status === 'overdue') && !details?.inReview;
  const statusLabel = details?.inReview ? t('invoice.inReview') : t(`invoice.status.${details?.status ?? 'pending'}`);
  const typeLabel = details ? t(`invoice.types.${details.type}`) : '-';

  const downloadPdf = (receipt = false) => {
    if (!details) return;
    downloadInvoicePdf({
      receipt,
      invoiceNumber: details.invoiceNumber,
      parentName: details.parentName,
      childNames: details.childNames,
      typeLabel,
      statusLabel,
      dueDate: details.dueDate,
      createdAt: details.createdAt,
      paidAt: details.paidAt,
      paymentMethod: details.paymentMethod
        ? t(`invoice.paymentMethods.${details.paymentMethod}`, { defaultValue: details.paymentMethod })
        : null,
      lineItems: details.lineItems,
      subtotal: details.subtotal,
      tax: details.tax,
      total: details.total,
    });
  };

  const downloadImage = async () => {
    if (!details || !invoiceRef.current) return;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(invoiceRef.current, {
        backgroundColor: '#ffffff',
        scale: Math.min(2, window.devicePixelRatio || 1.5),
      });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `invoice-${safeFileName(details.invoiceNumber)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      toast.error(t('payment.errors.actionFailed'));
    }
  };

  const shareInvoice = async () => {
    if (!details) return;
    const shareText = `${details.invoiceNumber} - ${t('invoice.egpAmount', { amount: details.total.toFixed(2) })}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: details.invoiceNumber,
          text: shareText,
          url: window.location.href,
        });
        return;
      }
      await navigator.clipboard.writeText(`${shareText}\n${window.location.href}`);
      toast.success(t('common.copied', { defaultValue: 'Copied' }));
    } catch {
      toast.error(t('payment.errors.actionFailed'));
    }
  };

  const printInvoice = () => {
    window.print();
  };

  return (
    <div className="w-full max-w-none space-y-5 pb-28">
      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <div className="flex flex-col gap-4 border-b border-outline-variant bg-surface-container-lowest p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-primary">
              {t('invoice.details.title', { defaultValue: 'Invoice details' })}
            </p>
            <h1 className="mt-1 break-words text-3xl font-semibold text-on-surface">
              {details?.invoiceNumber ?? '-'}
            </h1>
            <p className="mt-2 text-sm text-on-surface-variant">
              {details ? `${t('invoice.table.createdDate')}: ${formatDate(details.createdAt)} | ${t('invoice.table.dueDate')}: ${formatDate(details.dueDate)}` : '-'}
            </p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <Button className="h-10 gap-2 rounded-md" variant="outline" onClick={() => void shareInvoice()}>
              <span className="material-symbols-outlined text-base" aria-hidden>share</span>
              {t('common.share', { defaultValue: 'Share' })}
            </Button>
            <Button className="h-10 gap-2 rounded-md" variant="outline" onClick={printInvoice}>
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
            {canPay ? (
              <Button className="h-10 gap-2 rounded-md" onClick={() => navigate(`/parent/invoices/${details?.id}/pay${qs}`)}>
                <span className="material-symbols-outlined text-base" aria-hidden>credit_card</span>
                {t('invoice.actions.payNow')}
              </Button>
            ) : null}
            <Button variant="outline" className="h-10 rounded-md" onClick={() => navigate(`/parent/invoices${qs}`)}>
              {t('invoice.details.back')}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
          <DetailMetric
            icon="payments"
            label={t('invoice.details.total')}
            value={details ? t('invoice.egpAmount', { amount: details.total.toFixed(2) }) : '-'}
          />
          <DetailMetric
            icon="check_circle"
            label={t('financial.paymentHistory.paidLabel', { defaultValue: 'Paid' })}
            value={details ? t('invoice.egpAmount', { amount: details.paidAmount.toFixed(2) }) : '-'}
            tone="success"
          />
          <DetailMetric
            icon="hourglass_top"
            label={t('invoice.inReview')}
            value={details ? t('invoice.egpAmount', { amount: details.pendingAmount.toFixed(2) }) : '-'}
            tone="warning"
          />
          <DetailMetric
            icon="account_balance_wallet"
            label={t('financial.paymentHistory.balanceLabel', { defaultValue: 'Balance' })}
            value={details ? t('invoice.egpAmount', { amount: details.balanceDue.toFixed(2) }) : '-'}
            tone={details?.balanceDue ? 'error' : 'success'}
          />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <article ref={invoiceRef} className="invoice-print-area overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
          <div className="flex flex-col gap-4 border-b border-outline-variant bg-surface-container-lowest p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-primary">XO Nursery</p>
              <h2 className="mt-1 text-2xl font-semibold text-on-surface">{details?.invoiceNumber ?? '-'}</h2>
              <p className="mt-2 text-sm text-on-surface-variant">{typeLabel}</p>
            </div>
            <Badge variant={invoiceStatusVariant(details)} className="w-fit">
              {statusLabel}
            </Badge>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
            <LabelValue label={t('invoice.table.parent')} value={details?.parentName ?? '-'} />
            <LabelValue label={t('invoice.table.children')} value={details?.childNames.length ? details.childNames.join(', ') : '-'} />
            <LabelValue label={t('invoice.table.type')} value={typeLabel} />
            <LabelValue label={t('invoice.table.createdDate')} value={details ? formatDateTime(details.createdAt) : '-'} />
            <LabelValue label={t('invoice.table.dueDate')} value={details ? formatDateTime(details.dueDate) : '-'} />
            <LabelValue
              label={t('invoice.markPaid.paymentMethod')}
              value={details?.paymentMethod ? t(`invoice.paymentMethods.${details.paymentMethod}`, { defaultValue: details.paymentMethod }) : '-'}
            />
          </div>

          {details?.inReview ? (
            <div className="mx-5 mb-5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm font-medium text-warning">
              {t('invoice.inReviewNote')}
            </div>
          ) : canPay ? (
            <div className="mx-5 mb-5 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm font-medium text-primary">
              {t('invoice.countdown', { days: Math.max(0, countdown) })}
            </div>
          ) : null}

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
                {(details?.lineItems ?? []).map((item, idx) => (
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

          <div className="grid gap-2 bg-surface-container-lowest p-5 text-sm sm:ms-auto sm:w-96">
            <div className="flex justify-between gap-3">
              <span className="text-on-surface-variant">{t('invoice.details.subtotal')}</span>
              <span className="font-medium text-on-surface">{t('invoice.egpAmount', { amount: (details?.subtotal ?? 0).toFixed(2) })}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-on-surface-variant">{t('invoice.details.tax')}</span>
              <span className="font-medium text-on-surface">{t('invoice.egpAmount', { amount: (details?.tax ?? 0).toFixed(2) })}</span>
            </div>
            <div className="flex justify-between gap-3 border-t border-outline-variant pt-2">
              <span className="font-semibold text-on-surface">{t('invoice.details.total')}</span>
              <span className="font-semibold text-on-surface">{t('invoice.egpAmount', { amount: (details?.total ?? 0).toFixed(2) })}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-on-surface-variant">{t('financial.paymentHistory.balanceLabel', { defaultValue: 'Balance' })}</span>
              <span className="font-semibold text-on-surface">{t('invoice.egpAmount', { amount: (details?.balanceDue ?? 0).toFixed(2) })}</span>
            </div>
          </div>
        </article>

        <aside className="no-print space-y-5">
          <section className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
            <h2 className="text-base font-semibold text-on-surface">{t('payment.summary.title')}</h2>
            <div className="mt-4 grid gap-3">
              <LabelValue label={t('invoice.table.invoiceNo')} value={details?.invoiceNumber ?? '-'} />
              <LabelValue label={t('invoice.details.paidAt')} value={details?.paidAt ? formatDateTime(details.paidAt) : '-'} />
              <LabelValue label={t('parent.financial.nextDueLabel', { defaultValue: 'Next payment' })} value={details ? formatDate(details.dueDate) : '-'} />
              <LabelValue label={t('invoice.table.status')} value={statusLabel} />
            </div>
            {details?.status === 'paid' ? (
              <Button className="mt-4 h-10 w-full gap-2 rounded-md" variant="outline" onClick={() => downloadPdf(true)}>
                <span className="material-symbols-outlined text-base" aria-hidden>receipt</span>
                {t('invoice.details.downloadReceipt')}
              </Button>
            ) : null}
          </section>

          <section className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
            <h2 className="text-base font-semibold text-on-surface">{t('invoice.details.activityLog')}</h2>
            <div className="mt-4 max-h-[340px] space-y-3 overflow-y-auto pe-1">
              {(details?.activity ?? []).map((item) => (
                <div key={item.key} className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3 text-sm">
                  <p className="font-semibold text-on-surface">{t(`invoice.details.activity.${item.type}`)}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {formatDateTime(item.at)} | {item.actor}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
