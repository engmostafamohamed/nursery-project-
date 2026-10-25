import { useTranslation } from 'react-i18next';

import type { PillTone } from '@/lib/tones';
import { cn } from '@/lib/utils';

const FILL: Record<PillTone, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  neutral: 'bg-outline',
};

/** A thin bar with the share (0–100) beside it, e.g. how far a report is or a send rate. */
export function CompletionBar({ percent, tone, label, detail, className }: { percent: number | null; tone?: PillTone; label: string; detail?: string; className?: string }) {
  const { t } = useTranslation();
  const value = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  const fill = tone ?? (value >= 100 ? 'success' : value >= 50 ? 'primary' : value > 0 ? 'warning' : 'neutral');
  return (
    <div className={cn('flex min-w-[8rem] items-center gap-2', className)}>
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-surface-high"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent == null ? undefined : value}
      >
        <div className={cn('h-full rounded-full transition-all', FILL[fill])} style={{ width: `${value}%` }} />
      </div>
      <span className="w-20 shrink-0 text-end text-xs font-semibold tabular-nums text-on-surface">
        {percent == null ? '—' : t('dailyReport.percent', { value: Math.round(percent * 10) / 10 })}
        {detail ? <span className="block font-normal text-on-surface-variant">{detail}</span> : null}
      </span>
    </div>
  );
}
