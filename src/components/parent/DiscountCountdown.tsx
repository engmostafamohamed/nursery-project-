import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

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

/** Live "time left" chip for a deal's end date — ticks every second while the offer is still open. */
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

  const label =
    parts.days > 0
      ? `${parts.days}d ${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`
      : `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-error/10 px-2 py-0.5 text-xs font-semibold text-error ${className}`}>
      <span className="material-symbols-outlined text-sm" aria-hidden>schedule</span>
      {t('applications.paymentPackage.dealEndsIn', { defaultValue: 'Ends in {{time}}', time: label })}
    </span>
  );
}
