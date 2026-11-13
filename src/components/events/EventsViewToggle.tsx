import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

export type EventsView = 'calendar' | 'list';

/** Calendar or list, for an events page (in its TableCard's actions). */
export function EventsViewToggle({ value, onChange }: { value: EventsView; onChange: (value: EventsView) => void }) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex rounded-lg border border-outline-variant bg-surface p-0.5" role="group" aria-label={t('eventsCalendar.viewLabel')}>
      {(['calendar', 'list'] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            'inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-semibold transition-colors',
            value === option ? 'bg-primary text-primary-foreground' : 'text-on-surface-variant hover:bg-surface-high',
          )}
        >
          <span className="material-symbols-outlined text-base" aria-hidden>{option === 'calendar' ? 'calendar_month' : 'view_list'}</span>
          {option === 'calendar' ? t('eventsCalendar.viewCalendar') : t('eventsCalendar.viewList')}
        </button>
      ))}
    </div>
  );
}
