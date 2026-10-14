import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

function remainingParts(endsAt: string): { days: number; hours: number; minutes: number; seconds: number } | null {
  const diffMs = new Date(endsAt).getTime() - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  const totalSeconds = Math.floor(diffMs / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * "Offer ends in …" chip for a deal's end date. Days away it reads "15d 19h"; on the last day
 * it counts down to the second.
 */
export function DiscountCountdown({ endsAt, className = '' }: { endsAt: string | null; className?: string }) {
  const { t } = useTranslation();
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!endsAt) return;
    const id = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [endsAt]);

  if (!endsAt) return null;
  const parts = remainingParts(endsAt);
  if (!parts) return null;

  const lastDay = parts.days === 0;
  const label = lastDay
    ? `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`
    : t('applications.paymentPackage.countdownDays', { days: parts.days, hours: parts.hours });

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
        lastDay ? 'bg-error/10 text-error' : 'bg-warning/10 text-warning',
        className,
      )}
    >
      <span className="material-symbols-outlined text-sm" aria-hidden>schedule</span>
      {t('applications.paymentPackage.dealEndsIn', { defaultValue: 'Ends in {{time}}', time: label })}
    </span>
  );
}
