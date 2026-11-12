import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

export type ChoiceCard<T extends string> = {
  value: T;
  label: string;
  /** A second line under the label. */
  hint?: string;
  icon?: string;
  disabled?: boolean;
};

/**
 * One choice among a few, as cards side by side (a radio group): who is charged, why a dose was
 * skipped, when a discount ends. `className` sets the columns (two by default).
 */
export function ChoiceCards<T extends string>({
  value,
  onChange,
  options,
  label,
  invalid = false,
  className,
}: {
  value: T | null;
  onChange: (value: T) => void;
  options: readonly ChoiceCard<T>[];
  /** The group's name for screen readers. */
  label: string;
  invalid?: boolean;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} aria-invalid={invalid || undefined} className={cn('grid grid-cols-2 gap-2', className)}>
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-start text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50',
              checked
                ? 'border-primary bg-primary/10 text-primary'
                : cn('text-on-surface enabled:hover:border-primary/60', invalid ? 'border-error' : 'border-outline-variant'),
            )}
          >
            {option.icon ? <MaterialSymbol name={option.icon} size="text-xl" className="shrink-0" /> : null}
            <span className="min-w-0">
              <span className="block">{option.label}</span>
              {option.hint ? <span className="block text-xs font-normal text-on-surface-variant">{option.hint}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
