import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { PayFlow } from '@/features/parent-billing/pay-flow/PayFlow';
import { useParentInvoice } from '@/features/parent-billing/useParentBilling';
import { formatDate } from '@/lib/datetime';

/** Paying one invoice: a short header, then the steps. */
export function ParentPaymentPage() {
  const { t } = useTranslation();
  const { invoiceId } = useParams();
  const [searchParams] = useSearchParams();
  // Only follow in-app parent routes so the param cannot redirect elsewhere.
  const returnTo = searchParams.get('returnTo');
  const safeReturnTo = returnTo && /^\/parent\/[^/]/.test(returnTo) ? returnTo : null;
  const query = useParentInvoice(invoiceId);
  const invoice = query.data;

  if (query.isLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }
  if (!invoice) {
    return <EmptyState icon="receipt_long" title={t('invoice.details.notFound')} description={t('parentBilling.notFoundHint')} />;
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pb-28">
      <header className="flex items-start justify-between gap-3 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary">{t('parentBilling.pay.eyebrow')}</p>
          <h1 className="truncate text-xl font-bold text-on-surface">{invoice.invoiceNumber}</h1>
          <p className="text-sm text-on-surface-variant">
            {t(`invoice.types.${invoice.type}`)} · {t('parentBilling.list.dueOn', { date: formatDate(invoice.dueDate) })}
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="shrink-0">
          <Link to={`/parent/invoices/${invoice.id}`}>
            <MaterialSymbol name="receipt_long" size="text-lg" className="me-1" />
            {t('parentBilling.pay.viewInvoice')}
          </Link>
        </Button>
      </header>
      <section className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5">
        <PayFlow invoice={invoice} returnPath={safeReturnTo ?? `/parent/invoices/${invoice.id}`} onChanged={() => query.refetch()} />
      </section>
    </div>
  );
}
