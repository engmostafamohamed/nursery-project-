import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-on-surface">{t('community.adminTitle')}</h1>
      <section className="space-y-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <Input placeholder={t('community.title')} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input placeholder={t('community.content')} value={content} onChange={(e) => setContent(e.target.value)} />
        <div className="grid gap-2 md:grid-cols-3">
          <select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={postType} onChange={(e) => setPostType(e.target.value as 'announcement' | 'tip' | 'question')}>
            {(['announcement', 'tip', 'question'] as const).map((p) => <option key={p} value={p}>{t(`community.postTypes.${p}`)}</option>)}
          </select>
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

      <section className="space-y-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        {community.posts.map((post) => (
          <article key={String(post.id)} className="rounded-lg border border-outline-variant bg-surface text-foreground p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{String(post.title)}</p>
              <div className="flex gap-2">
                <span className="text-xs text-on-surface-variant">{t(`community.postTypes.${String(post.post_type)}`)}</span>
                {Boolean(post.pinned) ? <span className="text-xs text-secondary">{t('community.pinned')}</span> : null}
                <Button size="sm" variant="outline" onClick={() => void community.updatePost({ id: String(post.id), updates: { pinned: !Boolean(post.pinned) } })}>{t('community.togglePin')}</Button>
              </div>
            </div>
            <p className="mt-1 text-sm text-on-surface-variant">{String(post.content)}</p>
            <div className="mt-2 space-y-1">
              {((post.comments as Array<Record<string, unknown>>) ?? []).map((c) => <p key={String(c.id)} className="text-xs text-on-surface-variant">- {String(c.content)}</p>)}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                placeholder={t('community.addComment')}
                value={commentDraft[String(post.id)] ?? ''}
                onChange={(e) => setCommentDraft((d) => ({ ...d, [String(post.id)]: e.target.value }))}
              />
              <Button
                size="sm"
                onClick={() => {
                  const value = commentDraft[String(post.id)] ?? '';
                  if (!value.trim()) return;
                  void community.addComment({ post_id: String(post.id), content: value }).then(() => setCommentDraft((d) => ({ ...d, [String(post.id)]: '' })));
                }}
              >
                {t('community.comment')}
              </Button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
