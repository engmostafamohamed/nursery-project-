import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

export type SearchableOption = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
};

/**
 * A select with a type-to-filter box, for lists too long to scroll comfortably
 * (countries, and anything else that grows). Keeps a hidden input carrying `name`
 * so tests and autofill can find the field the same way they find a native select.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  id,
  name,
  disabled,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, term]);

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={value} readOnly />
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (disabled) return;
          setOpen((isOpen) => !isOpen);
          setTerm('');
        }}
        className={cn(
          'flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 text-start text-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className={cn('truncate', !selected && 'text-on-surface-variant')}>
          {selected?.label ?? placeholder ?? t('common.select')}
        </span>
        <MaterialSymbol name="expand_more" size="text-base" className="shrink-0 text-on-surface-variant" />
      </button>

      {open ? (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-outline-variant bg-surface-container-lowest shadow-lg">
          <div className="p-2">
            <Input
              autoFocus
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder={searchPlaceholder ?? t('common.search', { defaultValue: 'Search' })}
            />
          </div>
          <div className="max-h-56 overflow-y-auto pb-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-on-surface-variant">
                {emptyLabel ?? t('common.noResults', { defaultValue: 'No results' })}
              </p>
            ) : (
              filtered.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    setTerm('');
                  }}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-primary/5',
                    option.value === value && 'bg-primary/10 font-medium',
                  )}
                >
                  {option.label}
                  {option.value === value ? <MaterialSymbol name="check" size="text-base" /> : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
