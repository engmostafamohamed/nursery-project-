import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { StatusPill, TableCard, TableEmpty, TableLoading, TablePagination, type PillTone } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatTile } from '@/components/ui/StatTile';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { usePagination } from '@/hooks/usePagination';
import { useParentInbox, type ParentInboxItem, type ParentInboxKind } from '@/hooks/useParentInbox';
import { useUserProfile } from '@/hooks/useUserProfile';
import { dayHeading, groupByDay } from '@/lib/dayGroups';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type FilterKey = 'all' | 'action' | 'chats';

const KIND_STYLE: Record<ParentInboxKind, { icon: string; tone: PillTone; tile: string }> = {
  chat: { icon: 'chat', tone: 'primary', tile: 'bg-primary/10 text-primary' },
  announcement: { icon: 'campaign', tone: 'primary', tile: 'bg-primary/10 text-primary' },
  permission: { icon: 'task_alt', tone: 'warning', tile: 'bg-warning/10 text-warning' },
  questionnaire: { icon: 'fact_check', tone: 'success', tile: 'bg-success/10 text-success' },
  notification: { icon: 'notifications', tone: 'neutral', tile: 'bg-surface-high text-on-surface-variant' },
};

function relativeTime(iso: string, lang: string): string {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar-EG' : 'en', { numeric: 'auto' });
  if (Math.abs(diffSec) < 60) return rtf.format(-diffSec, 'second');
  const mins = Math.round(diffSec / 60);
  if (Math.abs(mins) < 60) return rtf.format(-mins, 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  return rtf.format(-days, 'day');
}

export function ParentInboxPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id ?? undefined;
  const { data: languagePref = 'both' } = useNurseryLanguagePref(nurseryId);
  const [filter, setFilter] = useState<FilterKey>('all');
  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';

  // Pull this parent's children's class IDs to scope class-level announcements.
  const childClassesQuery = useQuery({
    queryKey: ['parent-inbox-child-classes', user?.id],
    queryFn: async (): Promise<string[]> => {
      if (!user?.id) return [];
      const links = await supabase
        .from('parent_children')
        .select('child_id')
        .eq('parent_id', user.id);
      const childIds = ((links.data ?? []) as { child_id: string }[]).map((r) => r.child_id);
      if (!childIds.length) return [];
      const kids = await supabase.from('children').select('class_id').in('id', childIds);
      const ids = ((kids.data ?? []) as { class_id: string | null }[])
        .map((r) => r.class_id)
        .filter((id): id is string => Boolean(id));
      return Array.from(new Set(ids));
    },
    enabled: Boolean(user?.id),
  });

  const inbox = useParentInbox({
    userId: user?.id,
    nurseryId,
    childClassIds: childClassesQuery.data ?? [],
    language: languagePref,
  });

  const filtered = useMemo(() => {
    if (filter === 'all') return inbox.items;
    if (filter === 'chats') return inbox.items.filter((it) => it.kind === 'chat');
    // action needed: permissions, questionnaires, urgent items
    return inbox.items.filter(
      (it) => it.kind === 'permission' || it.kind === 'questionnaire' || it.urgent,
    );
  }, [inbox.items, filter]);

  const unreadCount = useMemo(() => inbox.items.filter((it) => it.unread).length, [inbox.items]);
  const pager = usePagination(filtered, 10, filter);
  const groups = groupByDay(pager.pageItems, (it) => it.sentAt);
  const dayLabels = { today: t('common.today'), yesterday: t('common.yesterday') };

  const renderItem = (it: ParentInboxItem) => {
    const style = KIND_STYLE[it.kind] ?? KIND_STYLE.notification;
    const isHigh = it.urgent;
    const photo = it.imageUrl?.trim();
    return (
      <li key={it.id}>
        <Link
          to={it.actionLink}
          className={cn(
            'group flex items-start gap-3 border-s-4 px-4 py-4 outline-none transition-colors hover:bg-surface-container-lowest focus-visible:bg-surface-container-lowest sm:px-5',
            isHigh ? 'border-s-error bg-error/5' : it.unread ? 'border-s-primary' : 'border-s-transparent',
          )}
        >
          {photo ? (
            <img src={photo} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" loading="lazy" decoding="async" />
          ) : (
            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', isHigh ? 'bg-error/10 text-error' : style.tile)}>
              <span className="material-symbols-outlined text-xl" aria-hidden>{isHigh ? 'priority_high' : style.icon}</span>
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <p className={cn('min-w-0 text-sm text-on-surface', it.unread ? 'font-bold' : 'font-semibold')}>
                {it.unread ? <span className="me-1.5 inline-block h-2 w-2 rounded-full bg-primary align-middle" aria-hidden /> : null}
                {it.title}
              </p>
              <time dateTime={it.sentAt} className="shrink-0 text-xs text-on-surface-variant">
                {relativeTime(it.sentAt, i18n.language)}
              </time>
            </div>
            <p className="mt-0.5 line-clamp-2 text-sm text-on-surface-variant">{it.preview}</p>
            <div className="mt-2">
              <StatusPill tone={isHigh ? 'error' : style.tone}>
                {t(`parent.inbox.kinds.${isHigh && it.kind === 'notification' ? 'urgent' : it.kind}`)}
              </StatusPill>
            </div>
          </div>
          <span className="material-symbols-outlined mt-2 shrink-0 text-lg text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100 rtl:rotate-180" aria-hidden>
            chevron_right
          </span>
        </Link>
      </li>
    );
  };

  const toggle = (key: FilterKey) => setFilter((current) => (current === key && key !== 'all' ? 'all' : key));

  return (
    <div className="space-y-5 pb-8">
      <PageHeader icon="inbox" title={t('parent.inbox.title')} description={t('parent.inbox.subtitle')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon="inbox" label={t('parent.inbox.filters.all')} value={inbox.counts.total} onClick={() => toggle('all')} active={filter === 'all'} />
          <StatTile
            icon="pending_actions"
            label={t('parent.inbox.filters.action')}
            value={inbox.counts.actionNeeded}
            tone={inbox.counts.actionNeeded > 0 ? 'warning' : 'neutral'}
            onClick={() => toggle('action')}
            active={filter === 'action'}
          />
          <StatTile icon="chat" label={t('parent.inbox.filters.chats')} value={inbox.counts.chats} onClick={() => toggle('chats')} active={filter === 'chats'} />
          <StatTile icon="mark_email_unread" label={t('parent.inbox.unreadLabel')} value={unreadCount} tone={unreadCount > 0 ? 'primary' : 'neutral'} />
        </div>
      </PageHeader>

      <TableCard
        title={t(`parent.inbox.filters.${filter}`)}
        count={inbox.isLoading ? undefined : t('parent.inbox.resultsCount', { count: filtered.length })}
        pagination={inbox.isLoading || !filtered.length ? null : <TablePagination pager={pager} />}
      >
        {inbox.isLoading ? (
          <TableLoading rows={5} />
        ) : filtered.length === 0 ? (
          <TableEmpty icon="inbox" title={t('parent.inbox.emptyTitle')} description={t('parent.inbox.emptyDescription')} />
        ) : (
          <div className="divide-y divide-outline-variant">
            {groups.map((group) => (
              <section key={group.key} aria-label={dayHeading(group.key, locale, dayLabels)}>
                <h3 className="border-b border-outline-variant bg-surface-container-lowest px-4 py-2 text-xs font-semibold text-on-surface-variant sm:px-5">
                  {dayHeading(group.key, locale, dayLabels)}
                </h3>
                <ul className="divide-y divide-outline-variant">{group.items.map(renderItem)}</ul>
              </section>
            ))}
          </div>
        )}
      </TableCard>
    </div>
  );
}
