import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ChildSelector, useParentChildren } from '@/components/parent/ChildSelector';
import { InvoiceCard } from '@/components/parent/InvoiceCard';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  useParentInvoices,
  type ParentInvoiceSort,
  type ParentInvoiceStatusFilter,
} from '@/hooks/useParentInvoices';
import { useSubmitInvoicePayment } from '@/hooks/useSubmitInvoicePayment';
import { useAuthSession } from '@/hooks/useAuthSession';
import { formatDate } from '@/lib/datetime';

export function ParentInvoicesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';
  const { user } = useAuthSession();
  const initialStatus = searchParams.get('status');
  const initialChildId = searchParams.get('child') ?? '';
  const highlightId = searchParams.get('highlight');
  const [status, setStatus] = useState<ParentInvoiceStatusFilter>(
    initialStatus === 'pending' || initialStatus === 'paid' ? initialStatus : 'all',
  );
  const [sort, setSort] = useState<ParentInvoiceSort>('due_soon');
  const [selectedChildId, setSelectedChildId] = useState(initialChildId);

  const childrenQuery = useParentChildren();
  const invoicesQuery = useParentInvoices({
    parentId: user?.id,
    childId: selectedChildId || undefined,
    status,
    sort,
  });
  const invoices = invoicesQuery.data;

  const submitPayment = useSubmitInvoicePayment();
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const handlePayNow = async (invoice: { id: string; amount: number; invoiceNumber: string }) => {
    setSubmittingId(invoice.id);
    try {
      await submitPayment.mutateAsync({
        invoiceId: invoice.id,
        amount: invoice.amount,
        invoiceNumber: invoice.invoiceNumber,
      });
      toast.success(t('payment.submittedForApproval'));
    } catch {
      toast.error(t('payment.errors.actionFailed'));
    } finally {
      setSubmittingId(null);
    }
  };

  useEffect(() => {
    if (!highlightId || invoicesQuery.isLoading) return;
    const el = document.getElementById(`invoice-card-${highlightId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightId, invoicesQuery.isLoading, invoices.length]);

  const summary = useMemo(() => {
    const dueRows = invoices.filter((row) => row.status === 'pending' || row.status === 'overdue');
    const totalDue = dueRows.reduce((sum, row) => sum + row.amount, 0);
    const nextDue = [...dueRows].sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate))[0];
    return { totalDue, nextDue };
  }, [invoices]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-28">
      <section className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-primary">{t('parent.dashboard.sectionFinancial')}</p>
            <h1 className="mt-1 text-2xl font-semibold text-on-surface">{t('parent.invoices.title')}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'pending', 'paid'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`h-9 rounded-md px-3 text-xs font-semibold ${status === value ? 'bg-primary text-white' : 'border border-outline-variant bg-surface-container-lowest text-on-surface-variant'}`}
                onClick={() => setStatus(value)}
              >
                {t(`invoice.statusTabs.${value}`)}
              </button>
            ))}
            <select className="h-9 rounded-md border border-outline-variant bg-surface px-2 text-xs text-foreground" value={sort} onChange={(e) => setSort(e.target.value as ParentInvoiceSort)}>
              <option value="due_soon">{t('invoice.filters.parentSortDueSoon')}</option>
              <option value="newest">{t('invoice.filters.parentSortNewest')}</option>
            </select>
          </div>
        </div>
      </section>

      {(childrenQuery.data ?? []).length > 1 ? (
        <ChildSelector
          value={selectedChildId}
          onChange={setSelectedChildId}
          children={childrenQuery.data}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-outline-variant bg-surface p-4 shadow-sm">
          <p className="text-xs text-on-surface-variant">{t('parent.invoices.totalDue')}</p>
          <p className="mt-1 text-xl font-semibold text-on-surface">{t('invoice.egpAmount', { amount: summary.totalDue.toFixed(2) })}</p>
        </div>
        <div className="rounded-lg border border-outline-variant bg-surface p-4 shadow-sm">
          <p className="text-xs text-on-surface-variant">{t('parent.invoices.nextDue')}</p>
          <p className="mt-1 text-xl font-semibold text-on-surface">
            {summary.nextDue ? formatDate(summary.nextDue.dueDate) : '-'}
          </p>
        </div>
      </div>

      {!invoicesQuery.isLoading && !invoices.length ? (
        <EmptyState icon="receipt_long" title={t('parent.invoices.emptyTitle')} description={t('parent.invoices.emptyDescription')} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {invoices.map((invoice) => (
            <InvoiceCard
              key={invoice.id}
              invoice={invoice}
              highlighted={Boolean(highlightId && invoice.id === highlightId)}
              submitting={submittingId === invoice.id}
              onPayNow={() =>
                void handlePayNow({
                  id: invoice.id,
                  amount: invoice.amount,
                  invoiceNumber: invoice.invoiceNumber,
                })
              }
              onView={() => navigate(`/parent/invoices/${invoice.id}${qs}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
