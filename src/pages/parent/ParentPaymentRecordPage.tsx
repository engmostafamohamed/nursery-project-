import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useParentInvoices, type ParentInvoiceItem } from '@/hooks/useParentInvoices';
import { supabase } from '@/lib/supabase';

const INVOICE_TYPES = ['monthly', 'event', 'extra_hours', 'other'] as const;

type MonthGroup = {
  key: string;
  label: string;
  paid: number;
  unpaid: number;
  rows: ParentInvoiceItem[];
};

export function ParentPaymentRecordPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';
  const { user } = useAuthSession();
  const locale = i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-GB';

  const invoicesQuery = useParentInvoices({ parentId: user?.id, status: 'all', sort: 'newest' });
  const rows = useMemo(
    () => invoicesQuery.allData.filter((r) => r.status !== 'cancelled'),
    [invoicesQuery.allData],
  );

  // Invoices the parent has submitted a payment for that finance has not yet confirmed.
  const pendingApprovalQuery = useQuery({
    queryKey: ['parent-pending-payment-attempts', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Set<string>> => {
      if (!user?.id) return new Set();
      const { data, error } = await supabase
        .from('payment_attempts')
        .select('invoice_id, status')
        .eq('parent_id', user.id)
        .eq('status', 'pending_confirmation');
      if (error) throw error;
      return new Set(((data ?? []) as Array<{ invoice_id: string }>).map((r) => r.invoice_id));
    },
  });
  const awaitingApproval = pendingApprovalQuery.data ?? new Set<string>();

  const nf = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [locale],
  );
  const egp = (amount: number) => t('invoice.egpAmount', { amount: nf.format(amount) });

  const totals = useMemo(() => {
    let paid = 0;
    let unpaid = 0;
    const byType = new Map<string, { paid: number; unpaid: number }>();
    for (const r of rows) {
      const isPaid = r.status === 'paid';
      if (isPaid) paid += r.amount;
      else unpaid += r.amount;
      const bucket = byType.get(r.type) ?? { paid: 0, unpaid: 0 };
      if (isPaid) bucket.paid += r.amount;
      else bucket.unpaid += r.amount;
      byType.set(r.type, bucket);
    }
    return { paid, unpaid, byType };
  }, [rows]);

  const months = useMemo<MonthGroup[]>(() => {
    const map = new Map<string, MonthGroup>();
    for (const r of rows) {
      const d = new Date(r.dueDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const existing = map.get(key);
      const group: MonthGroup =
        existing ?? {
          key,
          label: d.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
          paid: 0,
          unpaid: 0,
          rows: [],
        };
      if (r.status === 'paid') group.paid += r.amount;
      else group.unpaid += r.amount;
      group.rows.push(r);
      map.set(key, group);
    }
    return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [rows, locale]);

  const monthsPaid = months.filter((m) => m.unpaid === 0).length;
  const monthsUnpaid = months.length - monthsPaid;

  if (invoicesQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4 pb-28 lg:max-w-none">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-on-surface">{t('parent.paymentRecord.title')}</h1>
        <Button variant="outline" size="sm" onClick={() => navigate(`/parent/invoices${qs}`)}>
          {t('parent.paymentRecord.viewInvoices')}
        </Button>
      </div>

      {!rows.length ? (
        <EmptyState
          icon="payments"
          title={t('parent.paymentRecord.emptyTitle')}
          description={t('parent.paymentRecord.emptyDescription')}
        />
      ) : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
              <p className="text-xs text-on-surface-variant">{t('parent.paymentRecord.totalPaid')}</p>
              <p className="text-base font-bold text-tertiary">{egp(totals.paid)}</p>
              <p className="text-[11px] text-on-surface-variant">
                {t('parent.paymentRecord.monthsPaid', { count: monthsPaid })}
              </p>
            </div>
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
              <p className="text-xs text-on-surface-variant">{t('parent.paymentRecord.totalUnpaid')}</p>
              <p className="text-base font-bold text-error">{egp(totals.unpaid)}</p>
              <p className="text-[11px] text-on-surface-variant">
                {t('parent.paymentRecord.monthsUnpaid', { count: monthsUnpaid })}
              </p>
            </div>
          </div>

          {awaitingApproval.size > 0 ? (
            <div className="rounded-xl border border-outline-variant bg-surface-container p-3 text-sm">
              <span className="material-symbols-outlined me-1 align-middle text-base text-primary" aria-hidden>
                hourglass_top
              </span>
              {t('parent.paymentRecord.awaitingApproval', { count: awaitingApproval.size })}
            </div>
          ) : null}

          {/* Type breakdown */}
          <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
            <h2 className="mb-2 text-sm font-semibold text-on-surface">{t('parent.paymentRecord.byType')}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {INVOICE_TYPES.map((type) => {
                const b = totals.byType.get(type);
                if (!b || (b.paid === 0 && b.unpaid === 0)) return null;
                return (
                  <div key={type} className="flex items-center justify-between rounded-lg bg-surface-container px-3 py-2 text-sm">
                    <span>{t(`invoice.types.${type}`)}</span>
                    <span className="text-end text-xs">
                      <span className="text-tertiary">{egp(b.paid)}</span>
                      {b.unpaid > 0 ? <span className="text-error"> · {egp(b.unpaid)}</span> : null}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Monthly breakdown */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-on-surface">{t('parent.paymentRecord.byMonth')}</h2>
            {months.map((m) => (
              <Card key={m.key}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-on-surface">{m.label}</p>
                    <Badge variant={m.unpaid === 0 ? 'default' : 'error'}>
                      {m.unpaid === 0
                        ? t('parent.paymentRecord.statusPaid')
                        : t('parent.paymentRecord.statusUnpaid')}
                    </Badge>
                  </div>
                  <div className="flex gap-4 text-xs text-on-surface-variant">
                    <span>
                      {t('parent.paymentRecord.totalPaid')}: <span className="text-tertiary">{egp(m.paid)}</span>
                    </span>
                    <span>
                      {t('parent.paymentRecord.totalUnpaid')}: <span className="text-error">{egp(m.unpaid)}</span>
                    </span>
                  </div>
                  <ul className="divide-y divide-outline-variant">
                    {m.rows.map((r) => {
                      const pending = awaitingApproval.has(r.id);
                      return (
                        <li key={r.id}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-2 py-2 text-start text-sm"
                            onClick={() => navigate(`/parent/invoices/${r.id}${qs}`)}
                          >
                            <span className="min-w-0">
                              <span className="block truncate">{t(`invoice.types.${r.type}`)}</span>
                              <span className="block text-[11px] text-on-surface-variant">
                                {t('invoice.invoiceNumber', { number: r.invoiceNumber })}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="font-medium">{egp(r.amount)}</span>
                              {r.status === 'paid' ? (
                                <Badge variant="default">{t('invoice.status.paid')}</Badge>
                              ) : pending ? (
                                <Badge variant="secondary">{t('parent.paymentRecord.pending')}</Badge>
                              ) : (
                                <Badge variant="error">
                                  {r.status === 'overdue' ? t('invoice.status.overdue') : t('invoice.status.pending')}
                                </Badge>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
