import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { TONE_TINT } from '@/components/ui/toneClasses';
import { cn } from '@/lib/utils';

import { CATEGORY_ICON, categoryToneOf, EVENT_CATEGORIES, type EventCategory } from './events';

/** The event's kind as four tiles (a radio group), each in its category's colour. */
export function EventCategoryPicker({ value, onChange }: { value: EventCategory; onChange: (value: EventCategory) => void }) {
  const { t } = useTranslation();
  return (
    <div role="radiogroup" aria-label={t('admin.events.create.fields.category')} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {EVENT_CATEGORIES.map((category) => {
        const selected = category === value;
        return (
          <button
            key={category}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(category)}
            className={cn(
              'flex flex-col items-start gap-2 rounded-xl border p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              selected ? 'border-primary bg-primary/10' : 'border-outline-variant bg-surface hover:border-primary/60',
            )}
          >
            <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', TONE_TINT[categoryToneOf(category)])}>
              <MaterialSymbol name={CATEGORY_ICON[category]} size="text-lg" />
            </span>
            <span className="text-sm font-semibold text-on-surface">{t(`admin.events.create.categories.${category}`)}</span>
            <span className="text-xs leading-4 text-on-surface-variant">{t(`eventForm.categoryHints.${category}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
