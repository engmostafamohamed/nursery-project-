import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { CommunityPostsTable } from '@/components/community/CommunityPostsTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useCommunity } from '@/hooks/useCommunity';
import { useSettings } from '@/lib/useSettings';

export function AdminCommunityPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { nurseryId } = useSettings();
  const community = useCommunity(nurseryId ?? undefined, user?.id);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<'announcement' | 'tip' | 'question'>('announcement');
  const [pinned, setPinned] = useState(true);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-on-surface">{t('community.adminTitle')}</h1>
      <section className="space-y-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <Input placeholder={t('community.title')} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input placeholder={t('community.content')} value={content} onChange={(e) => setContent(e.target.value)} />
        <div className="grid gap-2 md:grid-cols-3">
          <Select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={postType} onChange={(e) => setPostType(e.target.value as 'announcement' | 'tip' | 'question')}>
            {(['announcement', 'tip', 'question'] as const).map((p) => <option key={p} value={p}>{t(`community.postTypes.${p}`)}</option>)}
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            {t('community.pinned')}
          </label>
          <Button
            onClick={() => {
              if (!nurseryId || !user?.id || !title || !content) return;
              void community.createPost({ nursery_id: nurseryId, author_id: user.id, post_type: postType, title, content, pinned }).then(() => {
                setTitle('');
                setContent('');
                toast.success(t('community.postCreated'));
              });
            }}
          >
            {t('community.createPost')}
          </Button>
        </div>
      </section>

      <CommunityPostsTable community={community} canPin />
    </div>
  );
}
