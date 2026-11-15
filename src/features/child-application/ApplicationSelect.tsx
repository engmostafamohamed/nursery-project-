import { useState } from 'react';

import { cn } from '@/lib/utils';

/** The application form's choice list (the chosen row ticked). */
export function StyledSelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className={cn(
          'flex h-12 w-full items-center justify-between rounded-lg border px-3 py-2 text-start text-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
          className,
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={cn('truncate', !value && 'text-on-surface-variant')}>
          {selected?.label}
        </span>
        <span
          className={cn('material-symbols-outlined text-lg text-on-surface-variant transition-transform', open && 'rotate-180')}
          aria-hidden
        >
          expand_more
        </span>
      </button>
      {open ? (
        <div
          className="absolute z-30 mt-2 max-h-60 w-full overflow-auto rounded-lg border border-outline-variant bg-surface p-1 shadow-lg"
          role="listbox"
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  'flex min-h-10 w-full items-center justify-between rounded-md px-3 text-start text-sm text-on-surface transition hover:bg-primary/10',
                  active && 'bg-primary text-on-primary hover:bg-primary',
                )}
                role="option"
                aria-selected={active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="truncate">{option.label}</span>
                {active ? <span className="material-symbols-outlined text-base" aria-hidden>check</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
