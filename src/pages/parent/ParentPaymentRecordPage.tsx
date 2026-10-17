import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { ExtraHoursLedger } from '@/components/financial/ExtraHoursLedger';
import { ChildSelector } from '@/components/parent/ChildSelector';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useExtraHoursLedger } from '@/hooks/useExtraHoursLedger';
import { useParentChildren } from '@/hooks/useParentChildren';
import { useParentInvoices, type ParentInvoiceItem } from '@/hooks/useParentInvoices';
import { formatDate } from '@/lib/datetime';
import {
  FAMILY_BUCKET,
  summarizeByChild,
  summarizeByType,
  summarizeInvoices,
  type MoneySummary,
} from '@/lib/familyFinance';
import { formatMoneyAmount } from '@/lib/money';
import { cn } from '@/lib/utils';

const INVOICE_TYPES = ['monthly', 'event', 'extra_hours', 'other'] as const;

type MonthGroup = { key: string; label: string; summary: MoneySummary; rows: ParentInvoiceItem[] };

function StatTile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'success' | 'error' | 'warning' }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-3 shadow-sm">
      <p className="text-xs text-on-surface-variant">{label}</p>
      <p
        className={cn(
          'mt-1 text-base font-bold tabular-nums text-on-surface',
          tone === 'success' && 'text-success',
          tone === 'error' && 'text-error',
          tone === 'warning' && 'text-warning',
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-[11px] text-on-surface-variant">{hint}</p> : null}
    </div>
  );
}

/**
 * The family's financial history: invoices, what was paid and is still owed, per child or for all
 * children, plus every payment made and the late-pickup (extra hours) days.
 */
export function ParentPaymentRecordPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';
  const { user } = useAuthSession();
  const isAr = i18n.language?.startsWith('ar');
  const locale = isAr ? 'ar-EG' : 'en-GB';
  const [selectedChildId, setSelectedChildId] = useState(searchParams.get('child') ?? '');

  const childrenQuery = useParentChildren();
  const children = useMemo(() => childrenQuery.data ?? [], [childrenQuery.data]);
  const childName = (id: string) => {
    const child = children.find((c) => c.id === id);
    return child ? (isAr ? child.nameAr || child.nameEn : child.nameEn || child.nameAr) : null;
  };

  const invoicesQuery = useParentInvoices({ parentId: user?.id, childId: selectedChildId || undefined, status: 'all', sort: 'newest' });
  const rows = useMemo(() => invoicesQuery.data.filter((r) => r.status !== 'cancelled'), [invoicesQuery.data]);
  const allRows = useMemo(() => invoicesQuery.allData.filter((r) => r.status !== 'cancelled'), [invoicesQuery.allData]);

  const ledgerChildIds = useMemo(
    () => (selectedChildId ? [selectedChildId] : children.map((c) => c.id)),
    [children, selectedChildId],
  );
  const ledger = useExtraHoursLedger(ledgerChildIds);

  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  // With one child selected, an invoice shared by several children counts only this child's part,
  // so the totals match the child's card in the all-children view.
  const share = useMemo(
    () => (row: ParentInvoiceItem) => (selectedChildId && row.childIds.length > 1 ? 1 / row.childIds.length : 1),
    [selectedChildId],
  );
  const summary = useMemo(() => summarizeInvoices(rows, share), [rows, share]);
  const byType = useMemo(() => summarizeByType(rows, share), [rows, share]);
  const byChild = useMemo(() => summarizeByChild(allRows), [allRows]);

  const paymentsMade = useMemo(
    () =>
      rows
        .flatMap((invoice) => invoice.paymentsMade.map((payment) => ({ ...payment, invoice })))
        .sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? '')),
    [rows],
  );

  const months = useMemo<MonthGroup[]>(() => {
    const map = new Map<string, ParentInvoiceItem[]>();
    for (const r of rows) {
      const d = new Date(r.dueDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()]
      .map(([key, list]) => ({
        key,
        label: new Date(`${key}-01T00:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
        summary: summarizeInvoices(list, share),
        rows: list,
      }))
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [rows, locale, share]);

  const methodLabel = (method: string | null) =>
    method ? t(`payment.manualMethods.${method}.label`, { defaultValue: method }) : '—';

  if (invoicesQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const showPerChild = !selectedChildId && children.length > 1;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-on-surface">{t('parent.paymentRecord.title')}</h1>
        <Button variant="outline" size="sm" onClick={() => navigate(`/parent/invoices${qs}`)}>
          {t('parent.paymentRecord.viewInvoices')}
        </Button>
      </div>

      <ChildSelector value={selectedChildId} onChange={setSelectedChildId} children={children} />

      {/* Statistics for the selection (all children or one child). */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatTile label={t('parent.paymentRecord.totalInvoiced')} value={money(summary.invoiced)} hint={t('parent.paymentRecord.invoiceCount', { count: summary.invoiceCount })} />
        <StatTile label={t('parent.paymentRecord.totalPaid')} value={money(summary.paid)} tone="success" />
        <StatTile label={t('parent.paymentRecord.totalUnpaid')} value={money(summary.outstanding)} tone={summary.outstanding > 0 ? 'error' : undefined} />
        <StatTile
          label={t('parent.paymentRecord.pending')}
          value={String(summary.inReviewCount)}
          hint={t('parent.paymentRecord.inReviewHint')}
          tone={summary.inReviewCount > 0 ? 'warning' : undefined}
        />
      </div>

      {showPerChild ? (
        <section className="rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-on-surface">{t('parent.paymentRecord.byChild')}</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[...children.map((c) => c.id), FAMILY_BUCKET].map((id) => {
              const s = byChild.get(id);
              if (!s || s.invoiceCount === 0) return null;
              return (
                <button
                  key={id || 'family'}
                  type="button"
                  disabled={!id}
                  onClick={() => id && setSelectedChildId(id)}
                  className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-start transition-colors enabled:hover:border-primary/50 disabled:cursor-default"
                >
                  <p className="flex items-center gap-1.5 font-semibold text-on-surface">
                    <MaterialSymbol name={id ? 'face' : 'family_restroom'} size="text-base" className="text-primary" />
                    {id ? childName(id) : t('parent.paymentRecord.familyCharges')}
                  </p>
                  <dl className="mt-2 grid grid-cols-3 gap-1 text-xs">
                    <div>
                      <dt className="text-on-surface-variant">{t('parent.paymentRecord.totalInvoiced')}</dt>
                      <dd className="font-medium tabular-nums text-on-surface">{money(s.invoiced)}</dd>
                    </div>
                    <div>
                      <dt className="text-on-surface-variant">{t('parent.paymentRecord.totalPaid')}</dt>
                      <dd className="font-medium tabular-nums text-success">{money(s.paid)}</dd>
                    </div>
                    <div>
                      <dt className="text-on-surface-variant">{t('parent.paymentRecord.totalUnpaid')}</dt>
                      <dd className={cn('font-medium tabular-nums', s.outstanding > 0 ? 'text-error' : 'text-on-surface')}>{money(s.outstanding)}</dd>
                    </div>
                  </dl>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {!rows.length ? (
        <EmptyState icon="payments" title={t('parent.paymentRecord.emptyTitle')} description={t('parent.paymentRecord.emptyDescription')} />
      ) : (
        <>
          <section className="rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-on-surface">{t('parent.paymentRecord.byType')}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {INVOICE_TYPES.map((type) => {
                const s = byType.get(type);
                if (!s || s.invoiceCount === 0) return null;
                return (
                  <div key={type} className="flex items-center justify-between rounded-lg bg-surface-container px-3 py-2 text-sm">
                    <span>{t(`invoice.types.${type}`)}</span>
                    <span className="text-end text-xs">
                      <span className="text-success">{money(s.paid)}</span>
                      {s.outstanding > 0 ? <span className="text-error"> · {money(s.outstanding)}</span> : null}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-on-surface">{t('parent.paymentRecord.paymentsMade')}</h2>
            {paymentsMade.length === 0 ? (
              <p className="text-sm text-on-surface-variant">{t('parent.paymentRecord.noPaymentsMade')}</p>
            ) : (
              <ul className="divide-y divide-outline-variant">
                {paymentsMade.map((payment, index) => (
                  <li key={`${payment.invoice.id}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium text-on-surface">{payment.paidAt ? formatDate(payment.paidAt) : '—'}</span>
                      <span className="block text-xs text-on-surface-variant">
                        {methodLabel(payment.method)} ·{' '}
                        <Link className="text-primary underline" to={`/parent/invoices/${payment.invoice.id}${qs}`}>
                          {t('invoice.invoiceNumber', { number: payment.invoice.invoiceNumber })}
                        </Link>
                        {payment.invoice.childIds.length === 1 && !selectedChildId ? ` · ${childName(payment.invoice.childIds[0]) ?? ''}` : ''}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums text-success">{money(payment.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <ExtraHoursLedger
        days={ledger.data ?? []}
        isLoading={ledger.isLoading}
        childName={!selectedChildId && children.length > 1 ? childName : undefined}
        invoiceLinkBase="/parent/invoices"
      />

      {months.length ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-on-surface">{t('parent.paymentRecord.byMonth')}</h2>
          {months.map((m) => (
            <Card key={m.key}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-on-surface">{m.label}</p>
                  <Badge variant={m.summary.outstanding === 0 ? 'success' : 'error'}>
                    {m.summary.outstanding === 0 ? t('parent.paymentRecord.statusPaid') : t('parent.paymentRecord.statusUnpaid')}
                  </Badge>
                </div>
                <div className="flex gap-4 text-xs text-on-surface-variant">
                  <span>
                    {t('parent.paymentRecord.totalPaid')}: <span className="text-success">{money(m.summary.paid)}</span>
                  </span>
                  <span>
                    {t('parent.paymentRecord.totalUnpaid')}: <span className="text-error">{money(m.summary.outstanding)}</span>
                  </span>
                </div>
                <ul className="divide-y divide-outline-variant">
                  {m.rows.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 py-2 text-start text-sm"
                        onClick={() => navigate(`/parent/invoices/${r.id}${qs}`)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate">
                            {t(`invoice.types.${r.type}`)}
                            {r.childIds.length === 1 && !selectedChildId ? (
                              <span className="ms-1.5 text-xs text-on-surface-variant">· {childName(r.childIds[0]) ?? ''}</span>
                            ) : null}
                          </span>
                          <span className="block text-[11px] text-on-surface-variant">{t('invoice.invoiceNumber', { number: r.invoiceNumber })}</span>
                          {selectedChildId && r.childIds.length > 1 ? (
                            <span className="block text-[11px] text-on-surface-variant">
                              {t('parent.paymentRecord.sharedInvoice', { count: r.childIds.length, amount: money(r.amount / r.childIds.length) })}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-end">
                            <span className="block font-medium tabular-nums">{money(r.amount)}</span>
                            {r.status !== 'paid' && r.paidAmount > 0 ? (
                              <span className="block text-[11px] text-on-surface-variant">
                                {t('parent.paymentRecord.remaining', { amount: money(r.balance) })}
                              </span>
                            ) : null}
                          </span>
                          {r.status === 'paid' ? (
                            <Badge variant="success">{t('invoice.status.paid')}</Badge>
                          ) : r.inReview ? (
                            <Badge variant="secondary">{t('parent.paymentRecord.pending')}</Badge>
                          ) : (
                            <Badge variant="error">{r.status === 'overdue' ? t('invoice.status.overdue') : t('invoice.status.pending')}</Badge>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  );
}
