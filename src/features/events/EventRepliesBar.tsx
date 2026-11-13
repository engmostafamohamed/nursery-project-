import { useTranslation } from 'react-i18next';

import type { EventPermissionStats } from '@/hooks/useAdminEventPermissionStats';
import { cn } from '@/lib/utils';

import { replyShares } from './events';

/** The families' replies for an event: one bar (yes, no, still waiting) and the three counts. */
export function EventRepliesBar({ stats, className }: { stats: EventPermissionStats | undefined; className?: string }) {
  const { t } = useTranslation();
  const shares = replyShares(stats);
  if (!stats || !shares) return null;
  const parts = [
    { key: 'granted', value: stats.granted, share: shares.granted, bar: 'bg-success', text: 'text-success', label: t('eventForm.replies.granted', { count: stats.granted }) },
    { key: 'denied', value: stats.denied, share: shares.denied, bar: 'bg-error', text: 'text-error', label: t('eventForm.replies.denied', { count: stats.denied }) },
    { key: 'pending', value: stats.pending, share: shares.pending, bar: 'bg-warning', text: 'text-warning', label: t('eventForm.replies.pending', { count: stats.pending }) },
  ];
  return (
    <div className={cn('space-y-1.5', className)}>
      <div
        className="flex h-2 overflow-hidden rounded-full bg-surface-high"
        role="img"
        aria-label={t('eventForm.replies.summary', { total: stats.total, granted: stats.granted, denied: stats.denied, pending: stats.pending })}
      >
        {parts.map((p) => (p.share > 0 ? <span key={p.key} className={p.bar} style={{ width: `${p.share}%` }} /> : null))}
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-on-surface-variant">
        {parts.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1">
            <span className={cn('h-2 w-2 rounded-full', p.bar)} aria-hidden />
            <span className={cn('font-semibold tabular-nums', p.value > 0 && p.text)}>{p.label}</span>
          </span>
        ))}
      </p>
    </div>
  );
}
