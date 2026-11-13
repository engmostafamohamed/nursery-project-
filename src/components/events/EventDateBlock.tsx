import { TONE_TINT } from '@/components/ui/toneClasses';
import { categoryTone } from '@/lib/parentEventsCalendarUtils';
import { cn } from '@/lib/utils';

/** An event's day as a small calendar leaf (the month over the day) in its category's colour. */
export function EventDateBlock({ startsAt, category, locale, className }: {
  startsAt: string;
  category: string;
  locale: string;
  className?: string;
}) {
  const start = new Date(startsAt);
  return (
    <div className={cn('flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-lg', TONE_TINT[categoryTone(category)], className)}>
      <span className="text-[11px] font-semibold uppercase">{start.toLocaleDateString(locale, { month: 'short' })}</span>
      <span className="text-2xl font-bold leading-none tabular-nums">{start.toLocaleDateString(locale, { day: 'numeric' })}</span>
    </div>
  );
}
