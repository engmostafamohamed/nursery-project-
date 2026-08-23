import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ActionGate } from '@/components/shared/ActionGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useContentLibrary } from '@/hooks/useContentLibrary';
import { useSettings } from '@/lib/useSettings';

export function AdminContentLibraryPage() {
  const { t } = useTranslation();
  const { nurseryId } = useSettings();
  const library = useContentLibrary(nurseryId ?? undefined, 'all');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'parenting_tips' | 'activities' | 'recipes' | 'health'>('parenting_tips');
  const [content, setContent] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-on-surface">{t('library.adminTitle')}</h1>
      <ActionGate feature="content_library" action="create">
      <section className="space-y-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <Input placeholder={t('library.title')} value={title} onChange={(e) => setTitle(e.target.value)} />
        <select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value as 'parenting_tips' | 'activities' | 'recipes' | 'health')}>
          {(['parenting_tips', 'activities', 'recipes', 'health'] as const).map((c) => <option key={c} value={c}>{t(`library.categories.${c}`)}</option>)}
        </select>
        <Input placeholder={t('library.content')} value={content} onChange={(e) => setContent(e.target.value)} />
        <Input placeholder={t('library.mediaUrl')} value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} />
        <Button
          onClick={() => {
            if (!nurseryId || !title || !content) return;
            void library.saveItem({ nursery_id: nurseryId, title, category, content, media_url: mediaUrl || undefined }).then(() => {
              setTitle('');
              setContent('');
              setMediaUrl('');
              toast.success(t('library.saved'));
            });
          }}
        >
          {t('library.addContent')}
        </Button>
      </section>
      </ActionGate>
      <section className="space-y-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        {library.items.map((item) => (
          <article key={String(item.id)} className="rounded-lg border border-outline-variant bg-surface text-foreground p-3">
            <p className="font-medium">{String(item.title)}</p>
            <p className="text-xs text-on-surface-variant">{t(`library.categories.${String(item.category)}`)}</p>
            <p className="mt-1 text-sm text-on-surface-variant">{String(item.content)}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
