import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useParentInbox, type ParentInboxItem, type ParentInboxKind } from '@/hooks/useParentInbox';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';

type FilterKey = 'all' | 'action' | 'chats';

const ICONS: Record<ParentInboxKind, string> = {
  chat: 'chat',
  announcement: 'campaign',
  permission: 'task_alt',
  questionnaire: 'fact_check',
  notification: 'notifications',
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

  const renderItem = (it: ParentInboxItem) => {
    const icon = ICONS[it.kind];
    const isHigh = it.urgent;
    const ringClass = isHigh ? 'border-error/60 ring-1 ring-error/40 bg-error/5' : 'border-outline-variant';
    const unreadDot = it.unread && !isHigh;
    const photo = it.imageUrl?.trim();
    return (
      <Link
        key={it.id}
        to={it.actionLink}
        className={`flex items-start gap-3 rounded-2xl border p-4 transition-colors hover:bg-surface-container-low ${ringClass}`}
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            className="mt-0.5 h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-outline-variant"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span
            className={`material-symbols-outlined mt-0.5 shrink-0 text-xl ${
              isHigh ? 'text-error' : 'text-primary'
            }`}
            aria-hidden
          >
            {isHigh ? 'priority_high' : icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {unreadDot ? (
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
            ) : null}
            <p className="text-sm font-semibold text-on-surface">{it.title}</p>
            <Badge
              className={
                it.kind === 'permission' || isHigh
                  ? 'border-error bg-error/10 text-error text-[10px]'
                  : 'text-[10px]'
              }
            >
              {t(`parent.inbox.kinds.${isHigh && it.kind === 'notification' ? 'urgent' : it.kind}`)}
            </Badge>
          </div>
          <p className={`mt-1 text-sm ${isHigh ? 'text-error' : 'text-on-surface-variant'}`}>
            {it.preview}
          </p>
          <p className="mt-2 text-xs text-on-surface-variant">{relativeTime(it.sentAt, i18n.language)}</p>
        </div>
      </Link>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-on-surface">{t('parent.inbox.title')}</h1>
        <p className="mt-1 text-sm text-on-surface-variant">{t('parent.inbox.subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'action', 'chats'] as const).map((key) => {
          const labelKey = `parent.inbox.filters.${key}`;
          const count =
            key === 'all'
              ? inbox.counts.total
              : key === 'action'
                ? inbox.counts.actionNeeded
                : inbox.counts.chats;
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-outline-variant text-foreground hover:bg-surface-container-low'
              }`}
            >
              {t(labelKey)} {count > 0 ? `(${count})` : ''}
            </button>
          );
        })}
      </div>

      {inbox.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((k) => (
            <Skeleton key={k} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="inbox"
          title={t('parent.inbox.emptyTitle')}
          description={t('parent.inbox.emptyDescription')}
        />
      ) : (
        <div className="space-y-2">{filtered.map(renderItem)}</div>
      )}
    </div>
  );
}
