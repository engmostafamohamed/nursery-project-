import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { InvoiceLineItemsBuilder, type BuilderLineItem } from '@/components/admin/InvoiceLineItemsBuilder';
import { PendingPaymentAttempts } from '@/components/admin/PendingPaymentAttempts';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useInvoiceDetails } from '@/hooks/useInvoiceDetails';
import { usePaymentAttempts } from '@/hooks/usePaymentAttempts';
import { downloadInvoicePdf } from '@/lib/exports';
import { cancelInvoice, markInvoiceAsPaid, sendInvoiceReminder } from '@/lib/invoiceActions';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

function statusBadgeClass(status: string | undefined) {
  if (status === 'paid') return 'border-success/30 bg-success/10 text-success';
  if (status === 'overdue') return 'border-error/30 bg-error/10 text-error';
  if (status === 'cancelled') return 'border-outline-variant bg-surface-container text-on-surface-variant';
  return 'border-warning/30 bg-warning/10 text-warning';
}

function SummaryMetric({
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
    <div className="rounded-lg border border-outline-variant bg-surface p-4 shadow-sm">
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

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 border-b border-outline-variant/70 py-3 last:border-b-0">
      <dt className="text-[11px] font-semibold uppercase text-on-surface-variant">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-on-surface">{value || '-'}</dd>
    </div>
  );
}

export function AdminInvoiceDetailsPage() {
  const { t } = useTranslation();
  const { invoiceId } = useParams();
  const [searchParams] = useSearchParams();
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';
  const detailsQuery = useInvoiceDetails(invoiceId);
  const details = detailsQuery.data;
  const attemptsQuery = usePaymentAttempts(invoiceId);
  const [editOpen, setEditOpen] = useState(false);
  const [editingDueDate, setEditingDueDate] = useState('');
  const [editingItems, setEditingItems] = useState<BuilderLineItem[]>([]);

  const isUnpaid = details?.status === 'pending' || details?.status === 'overdue';
  const statusClass = statusBadgeClass(details?.status);

  const openEdit = () => {
    if (!details) return;
    setEditingDueDate(details.dueDate.slice(0, 10));
    setEditingItems(details.lineItems.map((item) => ({ description: item.description, quantity: item.quantity, unitPrice: item.unitPrice })));
    setEditOpen(true);
  };

  const editedTotal = useMemo(
    () => editingItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [editingItems],
  );

  const onSaveEdit = async () => {
    if (!details) return;
    const { error } = await supabase
      .from('invoices')
      .update({
        amount: editedTotal.toFixed(2),
        due_date: editingDueDate,
        line_items_json: { items: editingItems, notes: details.notes, tax: details.tax },
      } as never)
      .eq('id', details.id);
    if (error) throw error;
    toast.success(t('invoice.details.editSaved'));
    setEditOpen(false);
    await detailsQuery.refetch();
  };

  const handleMarkPaid = async () => {
    if (!details) return;
    try {
      await markInvoiceAsPaid({
        invoiceId: details.id,
        nurseryId: details.nurseryId,
        parentId: details.parentId,
        invoiceNumber: details.invoiceNumber,
        amount: details.amount,
        paymentMethod: 'cash',
        paidAt: new Date().toISOString(),
      });
      toast.success(t('invoice.markPaid.success'));
      await detailsQuery.refetch();
    } catch {
      toast.error(t('invoice.create.error'));
    }
  };

  const handleCancel = async () => {
    if (!details) return;
    try {
      await cancelInvoice({ invoiceId: details.id });
      toast.success(t('invoice.cancel.success'));
      await detailsQuery.refetch();
    } catch {
      toast.error(t('invoice.create.error'));
    }
  };

  const handleReminder = async () => {
    if (!details) return;
    try {
      await sendInvoiceReminder({
        nurseryId: details.nurseryId,
        parentId: details.parentId,
        parentEmail: details.parentEmail,
        parentPhone: details.parentPhone,
        parentLanguage: details.parentLanguage,
        invoiceNumber: details.invoiceNumber,
        amount: details.amount,
      });
      toast.success(t('invoice.details.reminderSent'));
      await detailsQuery.refetch();
    } catch {
      toast.error(t('invoice.create.error'));
    }
  };

  if (!detailsQuery.isLoading && !details) {
    return <EmptyState icon="receipt_long" title={t('invoice.details.notFound')} description={t('common.comingSoon')} />;
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <div className="flex flex-col gap-4 border-b border-outline-variant bg-surface-container-lowest px-4 py-5 sm:px-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-primary">{t('invoice.details.title', { defaultValue: 'Invoice details' })}</p>
            <h1 className="mt-1 break-words text-3xl font-semibold text-on-surface">{details?.invoiceNumber ?? '-'}</h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant">
              <span>{t('invoice.table.createdDate')}: {details ? new Date(details.createdAt).toLocaleDateString() : '-'}</span>
              <span>{t('invoice.table.dueDate')}: {details ? new Date(details.dueDate).toLocaleDateString() : '-'}</span>
              {details?.status === 'overdue' ? <span className="font-medium text-error">{t('invoice.overdueDays', { days: details.overdueDays })}</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-md border px-3 py-2 text-xs font-semibold ${statusClass}`}>
              {t(`invoice.status.${details?.status ?? 'pending'}`)}
            </span>
            {isUnpaid ? <Button className="gap-2 rounded-md" variant="outline" onClick={() => void handleMarkPaid()}><span className="material-symbols-outlined text-base" aria-hidden>paid</span>{t('invoice.actions.markPaid')}</Button> : null}
            {isUnpaid ? <Button className="gap-2 rounded-md border-error/40 text-error hover:bg-error/10" variant="outline" onClick={() => void handleCancel()}><span className="material-symbols-outlined text-base" aria-hidden>cancel</span>{t('invoice.actions.cancel')}</Button> : null}
            <Button className="gap-2 rounded-md" variant="outline" onClick={() => void handleReminder()}><span className="material-symbols-outlined text-base" aria-hidden>notifications_active</span>{t('invoice.details.sendReminder')}</Button>
            <Button
              className="gap-2 rounded-md"
              variant="outline"
              onClick={() =>
                details &&
                downloadInvoicePdf({
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
              <span className="material-symbols-outlined text-base" aria-hidden>download</span>
              {t('invoice.details.downloadPdf')}
            </Button>
            {isUnpaid ? <Button className="gap-2 rounded-md" variant="outline" onClick={openEdit}><span className="material-symbols-outlined text-base" aria-hidden>edit</span>{t('invoice.details.edit')}</Button> : null}
            <Button asChild className="rounded-md" variant="outline"><Link to={`/admin/invoices${qs}`}>{t('invoice.details.back')}</Link></Button>
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
          <SummaryMetric
            icon="payments"
            label={t('invoice.details.amountLabel')}
            value={details ? t('invoice.egpAmount', { amount: details.amount.toFixed(2) }) : '-'}
          />
          <SummaryMetric
            icon="check_circle"
            label={t('financial.paymentHistory.paidLabel', { defaultValue: 'Paid' })}
            value={details ? t('invoice.egpAmount', { amount: (details.paidAmount ?? 0).toFixed(2) }) : '-'}
            tone="success"
          />
          <SummaryMetric
            icon="hourglass_top"
            label={t('invoice.inReview')}
            value={details ? t('invoice.egpAmount', { amount: (details.pendingAmount ?? 0).toFixed(2) }) : '-'}
            tone="warning"
          />
          <SummaryMetric
            icon="account_balance_wallet"
            label={t('financial.paymentHistory.balanceLabel', { defaultValue: 'Balance' })}
            value={details ? t('invoice.egpAmount', { amount: (details.balanceDue ?? 0).toFixed(2) }) : '-'}
            tone={details?.balanceDue ? 'error' : 'success'}
          />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-lg" aria-hidden>person</span>
              </span>
              <h2 className="text-base font-semibold text-on-surface">{t('invoice.details.overview', { defaultValue: 'Overview' })}</h2>
            </div>
            <dl className="grid gap-x-8 md:grid-cols-2">
              <DetailRow label={t('invoice.table.parent')} value={details?.parentName} />
              <DetailRow label={t('invoice.table.children')} value={details?.childNames.length ? details.childNames.join(', ') : '-'} />
              <DetailRow label={t('invoice.table.type')} value={details ? t(`invoice.types.${details.type}`) : '-'} />
              <DetailRow label={t('invoice.markPaid.paymentMethod')} value={details?.paymentMethod ? t(`invoice.paymentMethods.${details.paymentMethod}`) : '-'} />
              <DetailRow label={t('invoice.details.paidAt')} value={details?.paidAt ? new Date(details.paidAt).toLocaleString() : '-'} />
              <DetailRow
                label={t('invoice.details.relatedEvent')}
                value={details?.eventLink ? (
                  <Link className="text-primary underline" to={`/admin/events/${details.eventLink.id}${qs}`}>
                    {details.eventLink.title}
                  </Link>
                ) : '-'}
              />
            </dl>
          </section>

          <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 py-3">
              <h2 className="text-base font-semibold text-on-surface">{t('invoice.details.lineItems')}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-surface-container text-xs uppercase text-on-surface-variant">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold">{t('invoice.details.description')}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t('invoice.details.quantity')}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t('invoice.details.unitPrice')}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t('invoice.details.total')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {(details?.lineItems ?? []).map((item, idx) => (
                    <tr key={`${idx}-${item.description}`} className="bg-surface">
                      <td className="px-4 py-3 font-medium text-on-surface">{item.description}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{item.quantity}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{t('invoice.egpAmount', { amount: item.unitPrice.toFixed(2) })}</td>
                      <td className="px-4 py-3 font-semibold text-on-surface">{t('invoice.egpAmount', { amount: item.total.toFixed(2) })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2 border-t border-outline-variant bg-surface-container-lowest p-4 text-sm sm:ms-auto sm:w-80">
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
            </div>
            {details?.notes ? <p className="border-t border-outline-variant px-4 py-3 text-sm text-on-surface-variant">{details.notes}</p> : null}
          </section>
        </div>

        <div className="space-y-5">
          {details ? (
            <PendingPaymentAttempts
              attempts={attemptsQuery.data ?? []}
              onUpdated={async () => {
                await attemptsQuery.refetch();
                await detailsQuery.refetch();
              }}
            />
          ) : null}

          <section className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-lg" aria-hidden>history</span>
              </span>
              <h2 className="text-base font-semibold text-on-surface">{t('invoice.details.activityLog')}</h2>
            </div>
            <div className="max-h-[360px] space-y-3 overflow-y-auto pe-1">
              {(details?.activity ?? []).map((item) => (
                <div key={item.key} className="relative rounded-lg border border-outline-variant bg-surface-container-lowest p-3 text-sm">
                  <p className="font-semibold text-on-surface">{t(`invoice.details.activity.${item.type}`)}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">{new Date(item.at).toLocaleString()} - {item.actor}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('invoice.details.edit')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{t('invoice.create.dueDate')}</Label>
              <Input type="date" value={editingDueDate} onChange={(e) => setEditingDueDate(e.target.value)} />
            </div>
            <InvoiceLineItemsBuilder items={editingItems} onChange={setEditingItems} />
            <p className="text-sm font-semibold">{t('invoice.create.total')}: {t('invoice.egpAmount', { amount: editedTotal.toFixed(2) })}</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={() => void onSaveEdit()}>{t('invoice.details.save')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
