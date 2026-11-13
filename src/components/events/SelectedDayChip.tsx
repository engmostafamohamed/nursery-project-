import { useTranslation } from 'react-i18next';

/** The day picked on an events calendar, as a chip that clears it. */
export function SelectedDayChip({ dateKey, locale, onClear }: { dateKey: string; locale: string; onClear: () => void }) {
  const { t } = useTranslation();
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(new Date(y, (m ?? 1) - 1, d ?? 1));
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
      <span className="material-symbols-outlined text-sm" aria-hidden>event</span>
      {t('eventsCalendar.selectedDay', { date })}
      <button
        type="button"
        onClick={onClear}
        aria-label={t('eventsCalendar.clearDay')}
        className="ms-1 flex h-5 w-5 items-center justify-center rounded-full hover:bg-primary/15"
      >
        <span className="material-symbols-outlined text-sm" aria-hidden>close</span>
      </button>
    </span>
  );
}
