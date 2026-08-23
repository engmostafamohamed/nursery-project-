import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useContentLibrary } from '@/hooks/useContentLibrary';
import { useSettings } from '@/lib/useSettings';

export function ParentContentLibraryPage() {
  const { t } = useTranslation();
  const { nurseryId } = useSettings();
  const [category, setCategory] = useState('all');
  const library = useContentLibrary(nurseryId ?? undefined, category);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-on-surface">{t('library.parentTitle')}</h1>
      <select className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="all">{t('common.all')}</option>
        {(['parenting_tips', 'activities', 'recipes', 'health'] as const).map((c) => <option key={c} value={c}>{t(`library.categories.${c}`)}</option>)}
      </select>
      <section className="space-y-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        {library.items.map((item) => (
          <article key={String(item.id)} className="rounded-lg border border-outline-variant bg-surface text-foreground p-3">
            <p className="font-medium">{String(item.title)}</p>
            <p className="text-xs text-on-surface-variant">{t(`library.categories.${String(item.category)}`)}</p>
            <p className="mt-1 text-sm text-on-surface-variant">{String(item.content)}</p>
            {item.media_url ? <a className="mt-1 block text-xs text-secondary underline" href={String(item.media_url)} target="_blank" rel="noreferrer">{t('library.openMedia')}</a> : null}
          </article>
        ))}
      </section>
    </div>
  );
}
