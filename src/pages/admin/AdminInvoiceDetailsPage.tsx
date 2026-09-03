import { useMemo, useState } from 'react';
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
  const statusClass = details?.status === 'overdue' ? 'bg-error-container text-on-error-container' : 'bg-surface-container text-on-surface-variant';

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold text-on-surface">{details?.invoiceNumber}</h1>
          <p className="text-xs text-on-surface-variant">
            {t('invoice.table.createdDate')}: {details ? new Date(details.createdAt).toLocaleDateString() : '-'} | {t('invoice.table.dueDate')}: {details ? new Date(details.dueDate).toLocaleDateString() : '-'}
          </p>
          {details?.status === 'overdue' ? <p className="text-xs text-error">{t('invoice.overdueDays', { days: details.overdueDays })}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full px-2 py-1 text-xs ${statusClass}`}>{t(`invoice.status.${details?.status ?? 'pending'}`)}</span>
          {isUnpaid ? <Button variant="outline" onClick={() => void handleMarkPaid()}>{t('invoice.actions.markPaid')}</Button> : null}
          {isUnpaid ? <Button variant="outline" onClick={() => void handleCancel()}>{t('invoice.actions.cancel')}</Button> : null}
          <Button variant="outline" onClick={() => void handleReminder()}>{t('invoice.details.sendReminder')}</Button>
          <Button
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
            {t('invoice.details.downloadPdf')}
          </Button>
          {isUnpaid ? <Button variant="outline" onClick={openEdit}>{t('invoice.details.edit')}</Button> : null}
          <Button asChild variant="outline"><Link to={`/admin/invoices${qs}`}>{t('invoice.details.back')}</Link></Button>
        </div>
      </div>

      <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <p><strong>{t('invoice.table.parent')}:</strong> {details?.parentName}</p>
          <p><strong>{t('invoice.table.children')}:</strong> {details?.childNames.length ? details.childNames.join(', ') : '-'}</p>
          <p><strong>{t('invoice.table.type')}:</strong> {details ? t(`invoice.types.${details.type}`) : '-'}</p>
          <p><strong>{t('invoice.details.amountLabel')}:</strong> {details ? t('invoice.egpAmount', { amount: details.amount.toFixed(2) }) : '-'}</p>
          {details?.paymentMethod ? <p><strong>{t('invoice.markPaid.paymentMethod')}:</strong> {t(`invoice.paymentMethods.${details.paymentMethod}`)}</p> : null}
          {details?.paidAt ? <p><strong>{t('invoice.details.paidAt')}:</strong> {new Date(details.paidAt).toLocaleString()}</p> : null}
        </div>
        {details?.eventLink ? (
          <p className="mt-2 text-sm">
            <strong>{t('invoice.details.relatedEvent')}:</strong>{' '}
            <Link className="text-secondary underline" to={`/admin/events/${details.eventLink.id}${qs}`}>
              {details.eventLink.title}
            </Link>
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <h2 className="mb-2 text-sm font-semibold">{t('invoice.details.lineItems')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="text-on-surface-variant"><th className="px-2 py-2 text-start">{t('invoice.details.description')}</th><th className="px-2 py-2 text-start">{t('invoice.details.quantity')}</th><th className="px-2 py-2 text-start">{t('invoice.details.unitPrice')}</th><th className="px-2 py-2 text-start">{t('invoice.details.total')}</th></tr></thead>
            <tbody>
              {(details?.lineItems ?? []).map((item, idx) => (
                <tr key={`${idx}-${item.description}`} className="border-t border-outline-variant">
                  <td className="px-2 py-2">{item.description}</td><td className="px-2 py-2">{item.quantity}</td><td className="px-2 py-2">{t('invoice.egpAmount', { amount: item.unitPrice.toFixed(2) })}</td><td className="px-2 py-2">{t('invoice.egpAmount', { amount: item.total.toFixed(2) })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-sm">
          <p>{t('invoice.details.subtotal')}: {t('invoice.egpAmount', { amount: (details?.subtotal ?? 0).toFixed(2) })}</p>
          <p>{t('invoice.details.tax')}: {t('invoice.egpAmount', { amount: (details?.tax ?? 0).toFixed(2) })}</p>
          <p className="font-semibold">{t('invoice.details.total')}: {t('invoice.egpAmount', { amount: (details?.total ?? 0).toFixed(2) })}</p>
          {details?.notes ? <p className="mt-2 text-on-surface-variant">{details.notes}</p> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <h2 className="mb-2 text-sm font-semibold">{t('invoice.details.activityLog')}</h2>
        <div className="space-y-2">
          {(details?.activity ?? []).map((item) => (
            <div key={item.key} className="rounded-lg border border-outline-variant p-2 text-sm">
              <p className="font-medium">{t(`invoice.details.activity.${item.type}`)}</p>
              <p className="text-xs text-on-surface-variant">{new Date(item.at).toLocaleString()} - {item.actor}</p>
            </div>
          ))}
        </div>
      </section>

      {details ? (
        <PendingPaymentAttempts
          attempts={attemptsQuery.data ?? []}
          onUpdated={async () => {
            await attemptsQuery.refetch();
            await detailsQuery.refetch();
          }}
        />
      ) : null}

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
