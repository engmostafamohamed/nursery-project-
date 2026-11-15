import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { getUserInitials, cn } from '@/lib/utils';

import { familyName, type EnrollmentFamily } from './childEnrollment';
import { useFamilySearch } from './useFamilySearch';

/**
 * Picks the child's family from the nursery's parent accounts: a search box with a list under it,
 * matching the father's or mother's name, the username or either parent's mobile. The arrow keys
 * move through the list, Enter picks, Escape closes. Once picked, the family shows as a card.
 */
export function FamilyPicker({ nurseryId, value, onChange, invalid }: {
  nurseryId: string;
  value: EnrollmentFamily | null;
  onChange: (family: EnrollmentFamily | null) => void;
  invalid?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const listId = useId();
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const search = useFamilySearch(nurseryId, term);
  const results = term.trim().length >= 2 ? search.data ?? [] : [];
  const childName = (c: EnrollmentFamily['children'][number]) => (isAr ? c.name_ar || c.name_en : c.name_en || c.name_ar) ?? '';

  const pick = (family: EnrollmentFamily) => {
    onChange(family);
    setOpen(false);
    setTerm('');
  };

  if (value) {
    const name = familyName(value, isAr);
    return (
      <div className="flex flex-wrap items-start gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4" data-testid="family-picked">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">
          {getUserInitials(name, value.email ?? '')}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold text-on-surface">{name}</p>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-on-surface-variant">
            {value.username ? <span className="inline-flex items-center gap-1"><MaterialSymbol name="alternate_email" size="text-sm" /><span dir="ltr">{value.username}</span></span> : null}
            {value.phone ? <span className="inline-flex items-center gap-1"><MaterialSymbol name="call" size="text-sm" /><span dir="ltr">{value.phone}</span></span> : null}
          </p>
          <p className="text-xs text-on-surface-variant">
            {value.children.length
              ? t('childEnrollment.family.children', { count: value.children.length, names: value.children.map(childName).join(t('childEnrollment.listJoin')) })
              : t('childEnrollment.family.noChildren')}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)} data-testid="family-change">
          <MaterialSymbol name="swap_horiz" size="text-base" className="me-1" />
          {t('childEnrollment.family.change')}
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <MaterialSymbol name="search" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
        <input
          type="search"
          role="combobox"
          aria-expanded={open && term.trim().length >= 2}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          autoComplete="off"
          value={term}
          placeholder={t('childEnrollment.family.searchPlaceholder')}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter' && results[active]) {
              e.preventDefault();
              pick(results[active]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          className={cn(
            'h-12 w-full rounded-xl border bg-surface ps-11 pe-3 text-sm text-on-surface shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20',
            invalid ? 'border-error ring-1 ring-error/30' : 'border-outline-variant',
          )}
          data-testid="family-search"
        />
      </div>
      {open && term.trim().length >= 2 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-outline-variant bg-surface p-1 shadow-lg"
        >
          {search.isError ? (
            <li className="px-3 py-3 text-sm text-error">{t('childEnrollment.family.searchError')}</li>
          ) : search.isFetching && !results.length ? (
            <li className="px-3 py-3 text-sm text-on-surface-variant">{t('childEnrollment.family.searching')}</li>
          ) : !results.length ? (
            <li className="px-3 py-3 text-sm text-on-surface-variant">{t('childEnrollment.family.noResults')}</li>
          ) : (
            results.map((family, index) => {
              const name = familyName(family, isAr);
              return (
                <li key={family.id} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => pick(family)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start transition-colors',
                      index === active ? 'bg-primary/10' : 'hover:bg-surface-container-low',
                    )}
                    data-testid="family-option"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {getUserInitials(name, family.email ?? '')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-on-surface">{name}</span>
                      <span className="block truncate text-xs text-on-surface-variant" dir="ltr">
                        {[family.username, family.phone].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-surface-container px-2 py-0.5 text-[11px] text-on-surface-variant">
                      {t('childEnrollment.family.childCount', { count: family.children.length })}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
      <p className="mt-2 text-xs text-on-surface-variant">{t('childEnrollment.family.searchHint')}</p>
    </div>
  );
}
