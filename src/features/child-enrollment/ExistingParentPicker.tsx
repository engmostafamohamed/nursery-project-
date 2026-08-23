import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { parentDisplayName, useNurseryName, useParentSearch, type ParentSearchResult } from '@/hooks/useParentSearch';
import { cn } from '@/lib/utils';

type Props = {
  nurseryId: string | undefined;
  /** Name/mobile/email currently in the form, so a picked parent can be shown as attached. */
  linkedEmail: string;
  onPick: (parent: ParentSearchResult) => void;
  onClear: () => void;
};

/**
 * Attaches the child being enrolled to a parent account that already exists, rather
 * than relying on the admin retyping the email and phone exactly. The enrolment
 * function matches on those two fields, so a typo silently creates a second account.
 */
export function ExistingParentPicker({ nurseryId, linkedEmail, onPick, onClear }: Props) {
  const { t, i18n } = useTranslation();
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const preferArabic = i18n.language.startsWith('ar');
  const { data: results = [], isFetching } = useParentSearch(nurseryId, term);
  const { data: nurseryName = '' } = useNurseryName(nurseryId);

  if (linkedEmail) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-primary bg-primary/5 p-3 md:col-span-2">
        <MaterialSymbol name="link" className="text-primary" />
        <p className="min-w-0 flex-1 truncate text-sm text-on-surface">
          {t('childEnrollment.parentPicker.linkedTo', { email: linkedEmail })}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => { onClear(); setTerm(''); }}>
          {t('childEnrollment.parentPicker.unlink')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 md:col-span-2">
      <Input
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        placeholder={t('childEnrollment.parentPicker.searchPlaceholder')}
      />
      {open && term.trim().length >= 2 ? (
        <div className="max-h-56 overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-lowest">
          {isFetching ? (
            <p className="p-3 text-xs text-on-surface-variant">{t('common.loading')}</p>
          ) : results.length === 0 ? (
            <p className="p-3 text-xs text-on-surface-variant">
              {nurseryName
                ? t('childEnrollment.parentPicker.noResultsInNursery', { nursery: nurseryName })
                : t('childEnrollment.parentPicker.noResults')}
            </p>
          ) : (
            results.map((parent) => (
              <button
                key={parent.id}
                type="button"
                onClick={() => { onPick(parent); setOpen(false); setTerm(''); }}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 border-b border-outline-variant p-3 text-start last:border-b-0',
                  'hover:bg-primary/5',
                )}
              >
                <span className="text-sm font-medium text-on-surface">{parentDisplayName(parent, preferArabic)}</span>
                <span className="text-xs text-on-surface-variant">
                  {[parent.email, parent.phone].filter(Boolean).join(' · ')}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
      <p className="text-xs text-on-surface-variant">{t('childEnrollment.parentPicker.hint')}</p>
    </div>
  );
}
