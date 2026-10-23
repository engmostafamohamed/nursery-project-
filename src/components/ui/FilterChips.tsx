import { cn } from '@/lib/utils';

export type FilterChipOption<T extends string> = {
  value: T;
  label: string;
  /** Shown in a small badge on the chip. */
  count?: number;
};

/**
 * One-choice filter as a row of chips (a tab list), e.g. All / Draft / Approved with their
 * counts. With `hideEmpty`, chips whose count is 0 are hidden unless selected.
 */
export function FilterChips<T extends string>({
  value,
  onChange,
  options,
  label,
  hideEmpty = false,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: FilterChipOption<T>[];
  /** What the chips filter, for screen readers. */
  label: string;
  hideEmpty?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)} role="tablist" aria-label={label}>
      {options.map((option) => {
        if (hideEmpty && option.count === 0 && option.value !== value) return null;
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-high',
            )}
          >
            {option.label}
            {option.count != null ? (
              <span className={cn('rounded-full px-1.5 tabular-nums', selected ? 'bg-primary-foreground/20' : 'bg-surface-high')}>
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
