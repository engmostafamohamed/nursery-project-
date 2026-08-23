import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';

type InboxKind =
  | 'chat'
  | 'announcement_outbound'
  | 'notification';

type InboxItem = {
  id: string;
  kind: InboxKind;
  title: string;
  preview: string;
  sentAt: string;
  unread: boolean;
  actionLink: string;
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

const ICONS: Record<InboxKind, string> = {
  chat: 'chat',
  announcement_outbound: 'campaign',
  notification: 'notifications',
};

export function AdminInboxPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id ?? undefined;
  const { data: languagePref = 'both' } = useNurseryLanguagePref(nurseryId);

  // Direct chats this admin is part of.
  const messagesQuery = useQuery({
    queryKey: ['admin-inbox-messages', user?.id, languagePref],
    queryFn: async () => {
      if (!user?.id) return [] as InboxItem[];
      const res = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, receiver_id, content, read_at, created_at')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(100);
      if (res.error) throw res.error;
      const rows = (res.data ?? []) as Array<{
        id: string;
        conversation_id: string;
        sender_id: string;
        receiver_id: string;
        content: string;
        read_at: string | null;
        created_at: string;
      }>;
      const seen = new Set<string>();
      const latest = [] as typeof rows;
      for (const r of rows) {
        if (seen.has(r.conversation_id)) continue;
        seen.add(r.conversation_id);
        latest.push(r);
      }
      const otherIds = Array.from(
        new Set(latest.map((r) => (r.sender_id === user.id ? r.receiver_id : r.sender_id))),
      );
      const senderNames = new Map<string, string>();
      if (otherIds.length) {
        const usersRes = await supabase
          .from('users')
          .select('id, name_ar, name_en, role')
          .in('id', otherIds);
        for (const u of (usersRes.data ?? []) as Array<{
          id: string;
          name_ar: string | null;
          name_en: string | null;
          role: string;
        }>) {
          const ar = (u.name_ar ?? '').trim();
          const en = (u.name_en ?? '').trim();
          const display =
            languagePref === 'ar'
              ? ar || en
              : languagePref === 'en'
                ? en || ar
                : ar && en
                  ? `${ar} / ${en}`
                  : ar || en;
          senderNames.set(u.id, `${display || '—'} (${u.role})`);
        }
      }
      return latest.map<InboxItem>((m) => {
        const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
        return {
          id: `msg:${m.id}`,
          kind: 'chat',
          title: senderNames.get(otherId) ?? '—',
          preview: m.content?.slice(0, 140) ?? '',
          sentAt: m.created_at,
          unread: m.receiver_id === user.id && !m.read_at,
          actionLink: '/admin/messages',
        };
      });
    },
    enabled: Boolean(user?.id),
  });

  // Recent broadcast announcements from this nursery.
  const broadcastsQuery = useQuery({
    queryKey: ['admin-inbox-broadcasts', nurseryId],
    queryFn: async () => {
      if (!nurseryId) return [] as InboxItem[];
      const res = await supabase
        .from('broadcast_messages')
        .select('id, content_ar, content_en, sent_at, audience_scope, recipient_count, read_count')
        .eq('nursery_id', nurseryId)
        .order('sent_at', { ascending: false })
        .limit(20);
      if (res.error) throw res.error;
      return ((res.data ?? []) as Array<{
        id: string;
        content_ar: string | null;
        content_en: string | null;
        sent_at: string | null;
        audience_scope: string | null;
        recipient_count: number | null;
        read_count: number | null;
      }>).map<InboxItem>((b) => {
        const ar = (b.content_ar ?? '').trim();
        const en = (b.content_en ?? '').trim();
        const body =
          languagePref === 'ar' ? ar || en : languagePref === 'en' ? en || ar : ar && en ? `${ar} / ${en}` : ar || en;
        const reach = `${b.read_count ?? 0}/${b.recipient_count ?? 0} read`;
        return {
          id: `bcast:${b.id}`,
          kind: 'announcement_outbound',
          title: b.audience_scope === 'class' ? 'Class announcement' : 'Nursery announcement',
          preview: `${body?.split('\n')[0]?.slice(0, 100) ?? '—'} · ${reach}`,
          sentAt: b.sent_at ?? new Date().toISOString(),
          unread: false,
          actionLink: '/admin/messages',
        };
      });
    },
    enabled: Boolean(nurseryId),
  });

  // System notifications addressed to this admin (e.g., "5 media awaiting approval").
  const notifQuery = useQuery({
    queryKey: ['admin-inbox-notif', user?.id, languagePref],
    queryFn: async () => {
      if (!user?.id) return [] as InboxItem[];
      const res = await supabase
        .from('notifications')
        .select('id, type, title_ar, title_en, body_ar, body_en, read, sent_at, urgency, action_link')
        .eq('user_id', user.id)
        .order('sent_at', { ascending: false })
        .limit(20);
      if (res.error) throw res.error;
      return ((res.data ?? []) as Array<{
        id: string;
        type: string;
        title_ar: string;
        title_en: string;
        body_ar: string;
        body_en: string;
        read: boolean;
        sent_at: string;
        urgency: 'low' | 'normal' | 'high' | null;
        action_link: string | null;
      }>).map<InboxItem>((n) => ({
        id: `notif:${n.id}`,
        kind: 'notification',
        title: languagePref === 'ar' ? n.title_ar : n.title_en,
        preview: languagePref === 'ar' ? n.body_ar : n.body_en,
        sentAt: n.sent_at,
        unread: !n.read,
        actionLink: n.action_link?.startsWith('/admin') ? n.action_link : '/admin/notifications',
      }));
    },
    enabled: Boolean(user?.id),
  });

  const items: InboxItem[] = useMemo(() => {
    const merged = [
      ...(messagesQuery.data ?? []),
      ...(notifQuery.data ?? []),
      ...(broadcastsQuery.data ?? []),
    ];
    merged.sort((a, b) => {
      if (a.unread !== b.unread) return a.unread ? -1 : 1;
      return new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime();
    });
    return merged;
  }, [messagesQuery.data, notifQuery.data, broadcastsQuery.data]);

  const isLoading =
    messagesQuery.isLoading ||
    notifQuery.isLoading ||
    broadcastsQuery.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-on-surface">{t('admin.inbox.title')}</h1>
          <p className="mt-1 text-sm text-on-surface-variant">{t('admin.inbox.subtitle')}</p>
        </div>
        <Link
          to="/admin/broadcast"
          className="inline-flex items-center gap-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-medium text-primary hover:bg-surface-container"
        >
          <span className="material-symbols-outlined text-base" aria-hidden>
            campaign
          </span>
          {t('admin.inbox.composeBroadcast')}
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((k) => (
            <Skeleton key={k} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="inbox"
          title={t('admin.inbox.emptyTitle')}
          description={t('admin.inbox.emptyDescription')}
        />
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <Link
              key={it.id}
              to={it.actionLink}
              className="flex items-start gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 transition-colors hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined mt-0.5 shrink-0 text-xl text-primary" aria-hidden>
                {ICONS[it.kind]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {it.unread ? (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                  ) : null}
                  <p className="text-sm font-semibold text-on-surface">{it.title}</p>
                  <Badge className="text-[10px]">{t(`admin.inbox.kinds.${it.kind}`)}</Badge>
                </div>
                <p className="mt-1 text-sm text-on-surface-variant">{it.preview}</p>
                <p className="mt-2 text-xs text-on-surface-variant">{relativeTime(it.sentAt, i18n.language)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
