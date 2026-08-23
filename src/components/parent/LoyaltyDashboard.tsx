import { useTranslation } from 'react-i18next';

type Props = {
  balance: number;
  tier: 'silver' | 'gold' | 'platinum';
  progress: number;
  nextTierPoints: number;
};

export function LoyaltyDashboard({ balance, tier, progress, nextTierPoints }: Props) {
  const { t } = useTranslation();
  return (
    <section className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <p className="text-xs text-on-surface-variant">{t('loyalty.currentPoints')}</p>
      <p className="text-2xl font-extrabold text-on-surface">{balance}</p>
      <p className="text-sm">{t('loyalty.currentTier')}: {t(`loyalty.tiers.${tier}`)}</p>
      <div className="h-2 overflow-hidden rounded-full bg-surface-container">
        <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-xs text-on-surface-variant">{t('loyalty.nextTierAt', { points: nextTierPoints })}</p>
    </section>
  );
}
