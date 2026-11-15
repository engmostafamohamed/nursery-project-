import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LoyaltyDashboard } from '@/components/parent/LoyaltyDashboard';
import { DataTable, StatusPill, TableEmpty, TablePagination, TBody, Td, Th, THead, Tr, type PillTone } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/select';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useLoyalty } from '@/hooks/useLoyalty';
import { usePagination } from '@/hooks/usePagination';
import { formatDate } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { useSettings } from '@/lib/useSettings';

const TX_TONE: Record<string, PillTone> = { earned: 'success', bonus: 'primary', redeemed: 'warning', expired: 'neutral' };

export function ParentRewardsPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { settings, nurseryId } = useSettings();
  const [typeFilter, setTypeFilter] = useState('all');
  const loyalty = useLoyalty({ parentId: user?.id, nurseryId: nurseryId ?? undefined, enabled: Boolean(settings.loyalty_enabled) });

  const rows = loyalty.transactions.filter((r) => typeFilter === 'all' || String(r.transaction_type) === typeFilter);
  const pager = usePagination(rows, 10, `${typeFilter}|${rows.length}`);

  if (!settings.loyalty_enabled) {
    return <EmptyState icon="workspace_premium" title={t('loyalty.disabledTitle')} description={t('loyalty.disabledDescription')} />;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-on-surface">{t('loyalty.rewardsPageTitle')}</h1>
      <LoyaltyDashboard
        balance={loyalty.summary.balance}
        tier={loyalty.summary.tier as 'silver' | 'gold' | 'platinum'}
        progress={loyalty.summary.progress}
        nextTierPoints={loyalty.summary.nextTierPoints}
      />
      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-outline-variant px-4 py-3">
          <h2 className="text-sm font-semibold text-on-surface">{t('loyalty.history')}</h2>
          <Select className="h-9 rounded-lg border border-outline-variant bg-surface text-foreground px-2 text-xs" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">{t('common.all')}</option>
            {(['earned', 'redeemed', 'expired', 'bonus'] as const).map((k) => <option key={k} value={k}>{t(`loyalty.transactionTypes.${k}`)}</option>)}
          </Select>
        </div>
        {rows.length ? (
          <>
            <DataTable minWidth={640}>
              <THead>
                <Th>{t('loyalty.historyTable.what')}</Th>
                <Th align="end">{t('loyalty.historyTable.points')}</Th>
                <Th>{t('loyalty.historyTable.kind')}</Th>
                <Th>{t('loyalty.historyTable.date')}</Th>
              </THead>
              <TBody>
                {pager.pageItems.map((tx) => {
                  const kind = String(tx.transaction_type);
                  const points = Number(tx.points);
                  return (
                    <Tr key={String(tx.id)} data-testid="loyalty-transaction">
                      <Td className="min-w-[14rem]">
                        <span className="block font-medium text-on-surface">
                          {tx.transaction_type === 'redeemed' ? t('loyalty.redeemedForDiscount') : t(`loyalty.sources.${String(tx.source)}`)}
                        </span>
                        {/* Only an admin's bonus reason is free text; every other row is labelled by its type. */}
                        {tx.source === 'bonus' && typeof tx.description === 'string' && tx.description.trim() ? (
                          <span className="block text-xs text-on-surface-variant">{tx.description}</span>
                        ) : null}
                      </Td>
                      <Td align="end" className={cn('whitespace-nowrap font-semibold tabular-nums', kind === 'redeemed' || kind === 'expired' ? 'text-error' : 'text-success')}>
                        {kind === 'redeemed' || kind === 'expired' ? '−' : '+'}
                        {Math.abs(points)}
                      </Td>
                      <Td>
                        <StatusPill tone={TX_TONE[kind] ?? 'neutral'}>{t(`loyalty.transactionTypes.${kind}`)}</StatusPill>
                      </Td>
                      <Td className="whitespace-nowrap text-on-surface-variant">{tx.created_at ? formatDate(String(tx.created_at)) : '—'}</Td>
                    </Tr>
                  );
                })}
              </TBody>
            </DataTable>
            <TablePagination pager={pager} pageSizeOptions={[10, 20, 50]} />
          </>
        ) : (
          <TableEmpty icon="workspace_premium" title={t('loyalty.historyTable.emptyTitle')} />
        )}
      </section>
    </div>
  );
}
