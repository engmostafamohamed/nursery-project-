import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { useInvoiceDetails } from '@/hooks/useInvoiceDetails';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { downloadInvoicePdf } from '@/lib/exports';

export function ParentInvoiceDetailsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { invoiceId } = useParams();
  const [searchParams] = useSearchParams();
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';
  const detailsQuery = useInvoiceDetails(invoiceId);
  const details = detailsQuery.data;
  const nowMs = useMemo(() => Date.now(), []);

  if (!detailsQuery.isLoading && !details) {
    return <EmptyState icon="receipt_long" title={t('invoice.details.notFound')} description={t('common.comingSoon')} />;
  }

  const dueDate = details ? new Date(details.dueDate) : null;
  const countdown = dueDate ? Math.ceil((dueDate.getTime() - nowMs) / 86400000) : 0;
  const inReview = Boolean(details?.inReview);
  const canPay = (details?.status === 'pending' || details?.status === 'overdue') && !inReview;

  return (
    <div className="mx-auto w-full max-w-md space-y-4 pb-28">
      <div className="space-y-1 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <p className="text-xs text-on-surface-variant">{t('invoice.invoiceNumber', { number: details?.invoiceNumber ?? '' })}</p>
        <div className="flex items-center justify-between">
          <p className="text-lg font-extrabold text-on-surface">{details ? t('invoice.egpAmount', { amount: details.amount.toFixed(2) }) : '-'}</p>
          <span className={`rounded-full px-2 py-1 text-xs ${inReview ? 'bg-primary/10 text-primary' : details?.status === 'overdue' ? 'bg-error-container text-on-error-container' : 'bg-surface-container text-on-surface-variant'}`}>
            {inReview ? t('invoice.inReview') : t(`invoice.status.${details?.status ?? 'pending'}`)}
          </span>
        </div>
        <p className="text-xs text-on-surface-variant">{t('invoice.dueDate', { date: dueDate ? formatDate(dueDate) : '-' })}</p>
        {canPay ? <p className="text-xs text-on-surface-variant">{t('invoice.countdown', { days: Math.max(0, countdown) })}</p> : null}
        {inReview ? <p className="text-xs text-primary">{t('invoice.inReviewNote')}</p> : null}
      </div>

      <section className="space-y-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <h2 className="text-sm font-semibold">{t('invoice.details.lineItems')}</h2>
        {(details?.lineItems ?? []).map((item, idx) => (
          <div key={`${idx}-${item.description}`} className="flex items-start justify-between gap-2 border-b border-outline-variant pb-2 text-sm last:border-b-0">
            <div>
              <p className="font-medium text-on-surface">{item.description}</p>
              <p className="text-xs text-on-surface-variant">{item.quantity} x {t('invoice.egpAmount', { amount: item.unitPrice.toFixed(2) })}</p>
            </div>
            <p className="font-semibold text-on-surface">{t('invoice.egpAmount', { amount: item.total.toFixed(2) })}</p>
          </div>
        ))}
        {details?.paymentMethod ? <p className="text-xs text-on-surface-variant">{t('invoice.markPaid.paymentMethod')}: {t(`invoice.paymentMethods.${details.paymentMethod}`)}</p> : null}
        {details?.paidAt ? <p className="text-xs text-on-surface-variant">{t('invoice.details.paidAt')}: {formatDateTime(details.paidAt)}</p> : null}
      </section>

      <div className="flex flex-wrap gap-2">
        {canPay ? (
          <Button className="flex-1" onClick={() => navigate(`/parent/invoices/${details?.id}/pay${qs}`)}>
            {t('invoice.actions.payNow')}
          </Button>
        ) : null}
        {details?.status === 'paid' ? (
          <Button
            variant="outline"
            className="flex-1"
            onClick={() =>
              details &&
              downloadInvoicePdf({
                receipt: true,
                invoiceNumber: details.invoiceNumber,
                parentName: details.parentName,
                childNames: details.childNames,
                typeLabel: t(`invoice.types.${details.type}`),
                statusLabel: t(`invoice.status.${details.status}`),
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
              })
            }
          >
            {t('invoice.details.downloadReceipt')}
          </Button>
        ) : null}
        <Button variant="outline" className="flex-1" onClick={() => navigate(`/parent/invoices${qs}`)}>
          {t('invoice.details.back')}
        </Button>
      </div>
    </div>
  );
}
