import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useParentInAppNotifications } from '@/hooks/useParentInAppNotifications';
import type { SurveyType } from '@/hooks/useSurveys';

export type ParentInboxKind =
  | 'chat'
  | 'announcement'
  | 'permission'
  | 'questionnaire'
  | 'notification';

export type ParentInboxItem = {
  id: string;
  kind: ParentInboxKind;
  title: string;
  preview: string;
  sentAt: string;
  unread: boolean;
  urgent: boolean;
  actionLink: string;
  imageUrl?: string | null;
  meta?: Record<string, unknown>;
};

type SurveyRow = {
  id: string;
  title: string | null;
  title_ar: string | null;
  title_en: string | null;
  type: SurveyType | null;
  deadline: string | null;
  status: string | null;
  created_at: string;
  nursery_id: string;
};

type BroadcastRow = {
  id: string;
  content_ar: string | null;
  content_en: string | null;
  sent_at: string | null;
  scheduled_for: string | null;
  audience_scope: 'all_parents' | 'class' | 'role' | string | null;
  class_id: string | null;
  target_role: string | null;
  nursery_id: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
};

function deadlineUrgent(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const ms = new Date(iso).getTime() - Date.now();
  return ms > 0 && ms < 48 * 60 * 60 * 1000;
}

/**
 * Aggregates everything a parent should see into a single sorted list.
 * Sources: surveys (permission + questionnaire), broadcast announcements,
 * direct messages, and high-urgency in-app notifications.
 */
export function useParentInbox(params: {
  userId: string | undefined;
  nurseryId: string | undefined;
  childClassIds: string[];
  language: 'ar' | 'en' | 'both';
}) {
  const { userId, nurseryId, childClassIds, language } = params;

  const surveysQuery = useQuery({
    queryKey: ['parent-inbox-surveys', nurseryId, userId],
    queryFn: async (): Promise<{ surveys: SurveyRow[]; respondedIds: Set<string> }> => {
      if (!nurseryId || !userId) return { surveys: [], respondedIds: new Set() };
      const [surveysRes, respRes] = await Promise.all([
        supabase
          .from('surveys')
          .select('id, title, title_ar, title_en, type, deadline, status, created_at, nursery_id')
          .eq('nursery_id', nurseryId)
          .in('status', ['active', 'published'])
          .eq('target_role', 'parent'),
        supabase.from('survey_responses').select('survey_id').eq('user_id', userId),
      ]);
      if (surveysRes.error) throw surveysRes.error;
      if (respRes.error) throw respRes.error;
      return {
        surveys: (surveysRes.data ?? []) as SurveyRow[],
        respondedIds: new Set(((respRes.data ?? []) as { survey_id: string }[]).map((r) => r.survey_id)),
      };
    },
    enabled: Boolean(nurseryId && userId),
  });

  const broadcastsQuery = useQuery({
    queryKey: ['parent-inbox-broadcasts', nurseryId, childClassIds.join(',')],
    queryFn: async (): Promise<BroadcastRow[]> => {
      if (!nurseryId) return [];
      const filters: string[] = ['audience_scope.eq.all_parents', `target_role.eq.parent`];
      if (childClassIds.length) {
        filters.push(`class_id.in.(${childClassIds.join(',')})`);
      }
      const res = await supabase
        .from('broadcast_messages')
        .select('id, content_ar, content_en, sent_at, scheduled_for, audience_scope, class_id, target_role, nursery_id')
        .eq('nursery_id', nurseryId)
        .or(filters.join(','))
        .order('sent_at', { ascending: false })
        .limit(50);
      if (res.error) throw res.error;
      // Filter out scheduled-for-future broadcasts.
      const now = Date.now();
      return ((res.data ?? []) as BroadcastRow[]).filter((b) => {
        if (b.scheduled_for && new Date(b.scheduled_for).getTime() > now) return false;
        return true;
      });
    },
    enabled: Boolean(nurseryId),
  });

  const messagesQuery = useQuery({
    queryKey: ['parent-inbox-messages', userId],
    queryFn: async (): Promise<{ rows: MessageRow[]; senderNames: Map<string, string> }> => {
      if (!userId) return { rows: [], senderNames: new Map() };
      const res = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, receiver_id, content, read_at, created_at')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(100);
      if (res.error) throw res.error;
      const rows = (res.data ?? []) as MessageRow[];
      // Take the latest message per conversation (rows already DESC).
      const seen = new Set<string>();
      const latestPerConv: MessageRow[] = [];
      for (const r of rows) {
        if (seen.has(r.conversation_id)) continue;
        seen.add(r.conversation_id);
        latestPerConv.push(r);
      }
      const otherIds = Array.from(
        new Set(latestPerConv.map((r) => (r.sender_id === userId ? r.receiver_id : r.sender_id))),
      );
      const senderNames = new Map<string, string>();
      if (otherIds.length) {
        const usersRes = await supabase
          .from('users')
          .select('id, name_ar, name_en')
          .in('id', otherIds);
        for (const u of (usersRes.data ?? []) as { id: string; name_ar: string | null; name_en: string | null }[]) {
          const ar = (u.name_ar ?? '').trim();
          const en = (u.name_en ?? '').trim();
          const display =
            language === 'ar' ? ar || en : language === 'en' ? en || ar : ar && en ? `${ar} / ${en}` : ar || en;
          senderNames.set(u.id, display || '—');
        }
      }
      return { rows: latestPerConv, senderNames };
    },
    enabled: Boolean(userId),
  });

  const notificationsQuery = useParentInAppNotifications(userId);

  const items: ParentInboxItem[] = useMemo(() => {
    const out: ParentInboxItem[] = [];

    const localized = (ar: string | null, en: string | null): string => {
      const a = (ar ?? '').trim();
      const e = (en ?? '').trim();
      if (language === 'ar') return a || e;
      if (language === 'en') return e || a;
      if (a && e) return `${a} / ${e}`;
      return a || e;
    };

    // Surveys (permissions + questionnaires) the parent hasn't answered yet.
    const respondedIds = surveysQuery.data?.respondedIds ?? new Set<string>();
    for (const s of surveysQuery.data?.surveys ?? []) {
      if (respondedIds.has(s.id)) continue;
      const sType = (s.type ?? 'questionnaire') as SurveyType;
      const isPermission = sType === 'permission';
      const urgent = isPermission && deadlineUrgent(s.deadline);
      const title = (s.title ?? localized(s.title_ar, s.title_en)) || '—';
      const preview = isPermission
        ? s.deadline
          ? `Deadline ${new Date(s.deadline).toLocaleString()}`
          : 'Awaiting your response'
        : 'Tap to respond';
      out.push({
        id: `survey:${s.id}`,
        kind: isPermission ? 'permission' : 'questionnaire',
        title,
        preview,
        sentAt: s.created_at,
        unread: true,
        urgent,
        actionLink: '/parent/surveys',
      });
    }

    // Broadcasts (announcements + class announcements).
    for (const b of broadcastsQuery.data ?? []) {
      const body = localized(b.content_ar, b.content_en);
      const firstLine = body.split('\n')[0]?.slice(0, 140) ?? '';
      const sentAt = b.sent_at ?? new Date().toISOString();
      out.push({
        id: `bcast:${b.id}`,
        kind: 'announcement',
        title: b.audience_scope === 'class' ? 'Class announcement' : 'Nursery announcement',
        preview: firstLine || '—',
        sentAt,
        unread: false,
        urgent: false,
        actionLink: '/parent/messages',
      });
    }

    // Direct messages (latest per conversation).
    const senderNames = messagesQuery.data?.senderNames ?? new Map<string, string>();
    for (const m of messagesQuery.data?.rows ?? []) {
      const otherId = m.sender_id === userId ? m.receiver_id : m.sender_id;
      const senderName = senderNames.get(otherId) ?? '—';
      const isInbound = m.receiver_id === userId;
      out.push({
        id: `msg:${m.id}`,
        kind: 'chat',
        title: senderName,
        preview: m.content?.slice(0, 140) ?? '',
        sentAt: m.created_at,
        unread: isInbound && !m.read_at,
        urgent: false,
        actionLink: '/parent/messages',
        meta: { conversationId: m.conversation_id },
      });
    }

    // High-urgency notifications that aren't already represented as surveys/broadcasts.
    for (const n of notificationsQuery.data ?? []) {
      const t = n.type.toLowerCase();
      if (t.startsWith('permission_') || t.startsWith('survey_')) continue; // surveys cover these
      if (t.startsWith('broadcast')) continue; // broadcasts cover these
      const isHigh = n.urgency === 'high';
      const title = language === 'ar' ? n.title_ar : n.title_en;
      const body = language === 'ar' ? n.body_ar : n.body_en;
      out.push({
        id: `notif:${n.id}`,
        kind: 'notification',
        title: title || '—',
        preview: body || '',
        sentAt: n.sent_at,
        unread: !n.read,
        urgent: isHigh,
        actionLink: n.action_link?.startsWith('/parent') ? n.action_link : '/parent/notifications',
        imageUrl: n.image_url ?? null,
      });
    }

    out.sort((a, b) => {
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      if (a.unread !== b.unread) return a.unread ? -1 : 1;
      return new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime();
    });

    return out;
  }, [
    surveysQuery.data,
    broadcastsQuery.data,
    messagesQuery.data,
    notificationsQuery.data,
    userId,
    language,
  ]);

  const counts = useMemo(() => {
    let actionNeeded = 0;
    let chats = 0;
    for (const it of items) {
      if (it.kind === 'permission' || it.kind === 'questionnaire' || it.urgent) actionNeeded += 1;
      if (it.kind === 'chat') chats += 1;
    }
    return { total: items.length, actionNeeded, chats };
  }, [items]);

  return {
    items,
    counts,
    isLoading:
      surveysQuery.isLoading ||
      broadcastsQuery.isLoading ||
      messagesQuery.isLoading ||
      notificationsQuery.isLoading,
  };
}
