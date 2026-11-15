import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ContentLibraryTable } from '@/components/library/ContentLibraryTable';
import { useContentLibrary } from '@/hooks/useContentLibrary';
import { useSettings } from '@/lib/useSettings';
import { Select } from '@/components/ui/select';

export function ParentContentLibraryPage() {
  const { t } = useTranslation();
  const { nurseryId } = useSettings();
  const [category, setCategory] = useState('all');
  const library = useContentLibrary(nurseryId ?? undefined, category);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-on-surface">{t('library.parentTitle')}</h1>
      <Select className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="all">{t('common.all')}</option>
        {(['parenting_tips', 'activities', 'recipes', 'health'] as const).map((c) => <option key={c} value={c}>{t(`library.categories.${c}`)}</option>)}
      </Select>
      <ContentLibraryTable library={library} resetKey={category} />
    </div>
  );
}
