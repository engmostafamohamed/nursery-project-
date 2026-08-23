import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { cn } from '@/lib/utils';

function localizedNurseryLabel(
  nameAr: string | null | undefined,
  nameEn: string | null | undefined,
  language: string,
): string {
  const ar = (nameAr ?? '').trim();
  const en = (nameEn ?? '').trim();
  if (language === 'ar') return ar || en || '—';
  return en || ar || '—';
}

/**
 * Sidebar picker shown to chain_super_admin and xo_super_admin so they can
 * choose which nursery the admin pages should target. Hidden for branch_admin
 * (and other roles) since their nursery is fixed by their profile.
 */
export function AdminNurseryPicker() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { activeNurseryId, setActiveNurseryId, availableNurseries, isMultiNurseryAdmin } =
    useActiveNurseryId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (!isMultiNurseryAdmin) return null;
  if (availableNurseries.length === 0) return null;

  const activeNursery = availableNurseries.find((n) => n.id === activeNurseryId) ?? availableNurseries[0];
  const activeLabel = localizedNurseryLabel(activeNursery?.name_ar, activeNursery?.name_en, i18n.language);

  return (
    <div ref={rootRef} className="relative w-full min-w-0">
      <button
        type="button"
        className="flex h-11 w-full items-center gap-3 rounded-full border border-outline-variant bg-surface-container-lowest px-3 text-start text-sm text-on-surface shadow-sm transition-colors hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Building2 className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium text-on-surface-variant">
            {t('admin.nurseryPicker.label')}
          </span>
          <span className="block truncate font-semibold">{activeLabel}</span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-on-surface-variant transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          className="absolute end-0 top-[calc(100%+0.5rem)] z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-2 text-on-surface shadow-ambient"
          role="listbox"
        >
          <div className="px-3 pb-2 pt-1">
            <p className="text-xs font-semibold text-on-surface">
              {t('admin.nurseryPicker.label')}
            </p>
            <p className="text-[11px] text-on-surface-variant">
              {availableNurseries.length} {t('xoAdmin.nav.nurseries')}
            </p>
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {availableNurseries.map((nursery) => {
              const selected = nursery.id === activeNurseryId;
              const label = localizedNurseryLabel(nursery.name_ar, nursery.name_en, i18n.language);
              const secondary = localizedNurseryLabel(nursery.name_en, nursery.name_ar, i18n.language);
              return (
                <button
                  key={nursery.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm transition-colors',
                    selected ? 'bg-primary text-primary-foreground' : 'hover:bg-surface-container',
                  )}
                  onClick={() => {
                    setActiveNurseryId(nursery.id);
                    setOpen(false);
                  }}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      selected ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary',
                    )}
                  >
                    {label.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{label}</span>
                    {secondary !== label ? (
                      <span className={cn('block truncate text-xs', selected ? 'text-white/75' : 'text-on-surface-variant')}>
                        {secondary}
                      </span>
                    ) : null}
                  </span>
                  {selected ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
