import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LoyaltyDashboard } from '@/components/parent/LoyaltyDashboard';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useLoyalty } from '@/hooks/useLoyalty';
import { useSettings } from '@/lib/useSettings';

export function ParentRewardsPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { settings, nurseryId } = useSettings();
  const [typeFilter, setTypeFilter] = useState('all');
  const loyalty = useLoyalty({ parentId: user?.id, nurseryId: nurseryId ?? undefined, enabled: Boolean(settings.loyalty_enabled) });

  if (!settings.loyalty_enabled) {
    return <EmptyState icon="workspace_premium" title={t('loyalty.disabledTitle')} description={t('loyalty.disabledDescription')} />;
  }

  const rows = loyalty.transactions.filter((r) => typeFilter === 'all' || String(r.transaction_type) === typeFilter);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-on-surface">{t('loyalty.rewardsPageTitle')}</h1>
      <LoyaltyDashboard
        balance={loyalty.summary.balance}
        tier={loyalty.summary.tier as 'silver' | 'gold' | 'platinum'}
        progress={loyalty.summary.progress}
        nextTierPoints={loyalty.summary.nextTierPoints}
      />
      <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t('loyalty.history')}</h2>
          <select className="h-9 rounded-lg border border-outline-variant bg-surface text-foreground px-2 text-xs" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">{t('common.all')}</option>
            {(['earned', 'redeemed', 'expired', 'bonus'] as const).map((k) => <option key={k} value={k}>{t(`loyalty.transactionTypes.${k}`)}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          {rows.map((tx) => (
            <article key={String(tx.id)} className="rounded-lg border border-outline-variant bg-surface text-foreground p-2 text-sm">
              <p className="font-medium">{t(`loyalty.sources.${String(tx.source)}`)} - {Number(tx.points)} pts</p>
              <p className="text-xs text-on-surface-variant">{String(tx.description ?? '-')}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
