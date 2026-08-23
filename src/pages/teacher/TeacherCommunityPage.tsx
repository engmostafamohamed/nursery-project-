import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useCommunity } from '@/hooks/useCommunity';
import { useUserProfile } from '@/hooks/useUserProfile';

export function TeacherCommunityPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const community = useCommunity(profile?.nursery_id ?? undefined, user?.id);
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-on-surface">{t('community.teacherTitle')}</h1>
      <section className="space-y-2 rounded-3xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
        {community.posts.map((post) => (
          <article key={String(post.id)} className="rounded-lg border border-outline-variant bg-surface text-foreground p-3">
            <p className="font-medium">{String(post.title)}</p>
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
