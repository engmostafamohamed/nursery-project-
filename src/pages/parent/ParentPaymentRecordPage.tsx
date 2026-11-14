import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { ExtraHoursLedger } from '@/components/financial/ExtraHoursLedger';
import { Button } from '@/components/ui/button';
import { StatusPill, TableCard, TableEmpty, TableLoading } from '@/components/ui/DataTable';
import { FilterChips } from '@/components/ui/FilterChips';
import { LoadError } from '@/components/ui/LoadError';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatTile } from '@/components/ui/StatTile';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useExtraHoursLedger } from '@/hooks/useExtraHoursLedger';
import { useParentChildren } from '@/hooks/useParentChildren';
import { useParentInvoices, type ParentInvoiceItem } from '@/hooks/useParentInvoices';
import { localName } from '@/lib/bilingualName';
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
import { INVOICE_TYPES } from '@/lib/invoiceDisplay';


type MonthGroup = { key: string; label: string; summary: MoneySummary; rows: ParentInvoiceItem[] };

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
    return child ? (localName(child.nameAr, child.nameEn, isAr)) : null;
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

  const showPerChild = !selectedChildId && children.length > 1;
  // The cards of "By child": each child with invoices, and the charges for the whole family.
  const perChild = showPerChild
    ? [...children.map((c) => c.id), FAMILY_BUCKET].flatMap((id) => {
        const s = byChild.get(id);
        return s && s.invoiceCount > 0 ? [{ id, summary: s }] : [];
      })
    : [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-28">
      <PageHeader
        icon="account_balance_wallet"
        title={t('parent.paymentRecord.title')}
        description={t('parent.paymentRecord.description')}
        actions={
          <Button variant="outline" onClick={() => navigate(`/parent/invoices${qs}`)}>
            <MaterialSymbol name="receipt_long" size="text-base" className="me-1" />
            {t('parent.paymentRecord.viewInvoices')}
          </Button>
        }
      >
        {children.length > 1 ? (
          <FilterChips
            label={t('parent.paymentRecord.child')}
            value={selectedChildId}
            onChange={setSelectedChildId}
            options={[
              { value: '', label: t('parent.paymentRecord.allChildren') },
              ...children.map((c) => ({ value: c.id, label: localName(c.nameAr, c.nameEn, isAr) })),
            ]}
          />
        ) : null}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            icon="receipt_long"
            label={t('parent.paymentRecord.totalInvoiced')}
            value={money(summary.invoiced)}
            helper={t('parent.paymentRecord.invoiceCount', { count: summary.invoiceCount })}
            tone="neutral"
          />
          <StatTile icon="check_circle" label={t('parent.paymentRecord.totalPaid')} value={money(summary.paid)} tone="success" />
          <StatTile
            icon="pending_actions"
            label={t('parent.paymentRecord.totalUnpaid')}
            value={money(summary.outstanding)}
            tone={summary.outstanding > 0 ? 'error' : 'success'}
            to={summary.outstanding > 0 ? `/parent/invoices${qs}` : undefined}
          />
          <StatTile
            icon="hourglass_top"
            label={t('parent.paymentRecord.pending')}
            value={summary.inReviewCount}
            helper={t('parent.paymentRecord.inReviewHint')}
            tone={summary.inReviewCount > 0 ? 'warning' : 'neutral'}
          />
        </div>
      </PageHeader>

      {perChild.length ? (
        <TableCard title={t('parent.paymentRecord.byChild')}>
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
            {perChild.map(({ id, summary: s }) => (
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
            ))}
          </div>
        </TableCard>
      ) : null}

      {invoicesQuery.isError ? (
        <LoadError message={t('parent.paymentRecord.loadError')} onRetry={() => void invoicesQuery.refetch()} />
      ) : invoicesQuery.isLoading ? (
        <TableCard title={t('parent.paymentRecord.byMonth')}>
          <TableLoading rows={4} />
        </TableCard>
      ) : !rows.length ? (
        <TableCard title={t('parent.paymentRecord.byMonth')}>
          <TableEmpty icon="payments" title={t('parent.paymentRecord.emptyTitle')} description={t('parent.paymentRecord.emptyDescription')} />
        </TableCard>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <TableCard title={t('parent.paymentRecord.byType')}>
              <ul className="divide-y divide-outline-variant">
                {INVOICE_TYPES.map((type) => {
                  const s = byType.get(type);
                  if (!s || s.invoiceCount === 0) return null;
                  return (
                    <li key={type} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                      <span className="text-on-surface">{t(`invoice.types.${type}`)}</span>
                      <span className="text-end text-xs tabular-nums">
                        <span className="text-success">{money(s.paid)}</span>
                        {s.outstanding > 0 ? <span className="text-error"> · {money(s.outstanding)}</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </TableCard>

            <TableCard title={t('parent.paymentRecord.paymentsMade')} count={String(paymentsMade.length)}>
              {paymentsMade.length === 0 ? (
                <p className="px-4 py-4 text-sm text-on-surface-variant sm:px-5">{t('parent.paymentRecord.noPaymentsMade')}</p>
              ) : (
                <ul className="divide-y divide-outline-variant">
                  {paymentsMade.map((payment, index) => (
                    <li key={`${payment.invoice.id}-${index}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-5">
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
            </TableCard>
          </div>

          <TableCard title={t('parent.paymentRecord.byMonth')}>
            <div className="space-y-4 p-4 sm:p-5">
              {months.map((m) => (
                <section key={m.key} className="overflow-hidden rounded-xl border border-outline-variant" aria-label={m.label}>
                  <header className="flex flex-wrap items-center justify-between gap-2 bg-surface-container-lowest px-4 py-2.5">
                    <h3 className="font-semibold text-on-surface">{m.label}</h3>
                    <span className="flex items-center gap-3 text-xs tabular-nums">
                      <span className="text-success">{money(m.summary.paid)}</span>
                      {m.summary.outstanding > 0 ? <span className="text-error">{money(m.summary.outstanding)}</span> : null}
                      <StatusPill tone={m.summary.outstanding === 0 ? 'success' : 'error'}>
                        {m.summary.outstanding === 0 ? t('parent.paymentRecord.statusPaid') : t('parent.paymentRecord.statusUnpaid')}
                      </StatusPill>
                    </span>
                  </header>
                  <ul className="divide-y divide-outline-variant">
                    {m.rows.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-start text-sm hover:bg-surface-high"
                          onClick={() => navigate(`/parent/invoices/${r.id}${qs}`)}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-on-surface">
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
                              <span className="block font-medium tabular-nums text-on-surface">{money(r.amount)}</span>
                              {r.status !== 'paid' && r.paidAmount > 0 ? (
                                <span className="block text-[11px] text-on-surface-variant">{t('parent.paymentRecord.remaining', { amount: money(r.balance) })}</span>
                              ) : null}
                            </span>
                            {r.status === 'paid' ? (
                              <StatusPill tone="success">{t('invoice.status.paid')}</StatusPill>
                            ) : r.inReview ? (
                              <StatusPill tone="warning">{t('parent.paymentRecord.pending')}</StatusPill>
                            ) : (
                              <StatusPill tone="error">{r.status === 'overdue' ? t('invoice.status.overdue') : t('invoice.status.pending')}</StatusPill>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </TableCard>
        </>
      )}

      <ExtraHoursLedger
        days={ledger.data ?? []}
        isLoading={ledger.isLoading}
        childName={!selectedChildId && children.length > 1 ? childName : undefined}
        invoiceLinkBase="/parent/invoices"
      />
    </div>
  );
}
