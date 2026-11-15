import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { DataTable, IconAction, StatusPill, TableEmpty, TableLoading, TablePagination, TBody, Td, Th, THead, Tr, type PillTone } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { useCommunity } from '@/hooks/useCommunity';
import { usePagination } from '@/hooks/usePagination';
import { formatDate } from '@/lib/datetime';

type Community = ReturnType<typeof useCommunity>;
type Post = Community['posts'][number];

const TYPE_TONE: Record<string, PillTone> = { announcement: 'primary', tip: 'success', question: 'warning' };

/**
 * The nursery's community posts as a table with a pager: one row per post (title and text, kind,
 * pinned, comments, date). A post's comments and the box to add one open in a row under it.
 * Staff who run the board may pin and unpin.
 */
export function CommunityPostsTable({ community, canPin = false }: { community: Community; canPin?: boolean }) {
  const { t } = useTranslation();
  const pager = usePagination(community.posts, 10, community.posts.length);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  if (community.isLoading) return <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm"><TableLoading rows={4} /></div>;
  if (!community.posts.length) {
    return (
      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <TableEmpty icon="forum" title={t('community.table.emptyTitle')} description={t('community.table.emptyDescription')} />
      </div>
    );
  }

  const send = (postId: string) => {
    const value = (draft[postId] ?? '').trim();
    if (!value) return;
    void community.addComment({ post_id: postId, content: value }).then(() => setDraft((d) => ({ ...d, [postId]: '' })));
  };

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
      <DataTable minWidth={820}>
        <THead>
          <Th>{t('community.table.post')}</Th>
          <Th>{t('community.table.kind')}</Th>
          <Th>{t('community.table.comments')}</Th>
          <Th>{t('community.table.date')}</Th>
          <Th align="end">{t('community.table.actions')}</Th>
        </THead>
        <TBody>
          {pager.pageItems.map((post: Post) => {
            const id = String(post.id);
            const type = String(post.post_type);
            const open = openId === id;
            const comments = post.comments ?? [];
            return (
              <Fragment key={id}>
                <Tr onClick={() => setOpenId(open ? null : id)} data-testid="community-post">
                  <Td className="min-w-[16rem] max-w-[28rem]">
                    <span className="flex items-center gap-1.5">
                      {post.pinned ? (
                        <span title={t('community.pinned')} className="shrink-0 text-secondary">
                          <MaterialSymbol name="push_pin" size="text-base" />
                          <span className="sr-only">{t('community.pinned')}</span>
                        </span>
                      ) : null}
                      <span className="font-semibold text-on-surface">{String(post.title)}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-on-surface-variant">{String(post.content)}</span>
                  </Td>
                  <Td>
                    <StatusPill tone={TYPE_TONE[type] ?? 'neutral'}>{t(`community.postTypes.${type}`)}</StatusPill>
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums text-on-surface-variant">{t('community.table.commentCount', { count: comments.length })}</Td>
                  <Td className="whitespace-nowrap text-on-surface-variant">{post.created_at ? formatDate(String(post.created_at)) : '—'}</Td>
                  <Td align="end">
                    <span className="flex items-center justify-end gap-0.5">
                      <IconAction icon={open ? 'expand_less' : 'chat_bubble'} label={t('community.table.showComments')} onClick={() => setOpenId(open ? null : id)} />
                      {canPin ? (
                        <IconAction
                          icon={post.pinned ? 'keep_off' : 'keep'}
                          label={t('community.togglePin')}
                          onClick={() => void community.updatePost({ id, updates: { pinned: !post.pinned } })}
                        />
                      ) : null}
                    </span>
                  </Td>
                </Tr>
                {open ? (
                  <tr className="bg-surface-container-lowest" data-testid="community-post-comments">
                    <td colSpan={5} className="px-4 py-3">
                      <p className="whitespace-pre-line text-sm text-on-surface">{String(post.content)}</p>
                      {comments.length ? (
                        <ul className="mt-3 space-y-1.5 border-s-2 border-outline-variant ps-3">
                          {comments.map((c) => (
                            <li key={String(c.id)} className="text-sm text-on-surface-variant">
                              {String(c.content)}
                              {c.created_at ? <span className="ms-2 text-xs text-on-surface-variant/80">{formatDate(String(c.created_at))}</span> : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 text-xs text-on-surface-variant">{t('community.table.noComments')}</p>
                      )}
                      <div className="mt-3 flex max-w-xl gap-2">
                        <Input
                          placeholder={t('community.addComment')}
                          value={draft[id] ?? ''}
                          onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') send(id);
                          }}
                        />
                        <Button size="sm" onClick={() => send(id)}>
                          {t('community.comment')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </TBody>
      </DataTable>
      <TablePagination pager={pager} pageSizeOptions={[10, 20, 50]} />
    </div>
  );
}
