import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useXoPaymentAttempts, type XoPaymentAttempt } from '@/hooks/useXoPaymentAttempts';

type StatusFilter = 'all' | XoPaymentAttempt['status'];

const STATUS_META: Record<XoPaymentAttempt['status'], { labelKey: string; variant: 'default' | 'secondary' | 'success' | 'error' }> = {
  pending_confirmation: { labelKey: 'xoAdmin.payments.statusPending', variant: 'secondary' },
  confirmed: { labelKey: 'xoAdmin.payments.statusConfirmed', variant: 'success' },
  cancelled: { labelKey: 'xoAdmin.payments.statusRejected', variant: 'error' },
  failed: { labelKey: 'xoAdmin.payments.statusFailed', variant: 'error' },
};

export function XoAdminPaymentsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const query = useXoPaymentAttempts();
  const [filter, setFilter] = useState<StatusFilter>('all');

  const rows = useMemo(
    () => (filter === 'all' ? query.data ?? [] : (query.data ?? []).filter((r) => r.status === filter)),
    [query.data, filter],
  );

  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale) : '—');
  const fmtAmount = (n: number) => t('invoice.egpAmount', { amount: n.toFixed(2) });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t('xoAdmin.payments.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('xoAdmin.payments.subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'pending_confirmation', 'confirmed', 'cancelled'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`rounded-full px-3 py-1 text-xs ${filter === value ? 'bg-primary text-primary-foreground' : 'bg-surface-low text-muted-foreground'}`}
            onClick={() => setFilter(value)}
          >
            {t(`xoAdmin.payments.filter.${value}`)}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !rows.length ? (
        <EmptyState icon="payments" title={t('xoAdmin.payments.emptyTitle')} description={t('xoAdmin.payments.emptyDescription')} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-low text-start text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start">{t('xoAdmin.payments.col.nursery')}</th>
                <th className="px-3 py-2 text-start">{t('xoAdmin.payments.col.parent')}</th>
                <th className="px-3 py-2 text-start">{t('xoAdmin.payments.col.invoice')}</th>
                <th className="px-3 py-2 text-start">{t('xoAdmin.payments.col.amount')}</th>
                <th className="px-3 py-2 text-start">{t('xoAdmin.payments.col.submitted')}</th>
                <th className="px-3 py-2 text-start">{t('xoAdmin.payments.col.status')}</th>
                <th className="px-3 py-2 text-start">{t('xoAdmin.payments.col.handledBy')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = STATUS_META[r.status];
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2">{r.nurseryName}</td>
                    <td className="px-3 py-2">{r.parentName}</td>
                    <td className="px-3 py-2">{t('invoice.invoiceNumber', { number: r.invoiceNumber })}</td>
                    <td className="px-3 py-2 font-medium">{fmtAmount(r.amount)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.createdAt)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={meta.variant}>{t(meta.labelKey)}</Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.status === 'confirmed' || r.status === 'cancelled' ? (
                        <div>
                          <p className="text-foreground">{r.confirmedByName ?? '—'}</p>
                          <p className="text-xs">{fmtDate(r.confirmedAt)}</p>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
