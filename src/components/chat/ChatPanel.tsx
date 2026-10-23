import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ChatRecipientPicker } from '@/components/chat/ChatRecipientPicker';
import { FilterChips } from '@/components/ui/FilterChips';
import { TONE_TINT } from '@/components/ui/toneClasses';
import { useConversationMessages } from '@/hooks/useConversationMessages';
import { useChatParticipants } from '@/hooks/useChatParticipants';
import {
  CHAT_FILE_PREFIX,
  filePathFromContent,
  formatFileSize,
  getOrCreateConversationId,
  getUserDisplayName,
  isStorageFile,
  isStorageImage,
  storagePathFromContent,
} from '@/lib/chat';
import { supabase } from '@/lib/supabase';
import { avatarTone, chatListTime } from '@/lib/chatDisplay';
import { cn, getUserInitials } from '@/lib/utils';
import type { ChatParticipant, ChatParticipantRole, ChatRole } from '@/types/chat';

const MAX_CHAT_FILE_BYTES = 10 * 1024 * 1024;

const ALLOWED_CHAT_FILE_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
];

interface ChatPanelProps {
  role: ChatRole;
  currentUserId: string;
  nurseryId: string | null;
  languagePref: 'ar' | 'en' | 'both';
  initialParticipantId?: string | null;
  initialParticipantRole?: ChatParticipantRole | ChatParticipantRole[];
  readOnly?: boolean;
  className?: string;
}

type InboxRow = {
  participant: ChatParticipant;
  conversationId?: string;
  unread: number;
  lastAt?: string;
  lastContent?: string;
  /** The last message was sent by the current user (shows its read ticks in the list). */
  lastMine?: boolean;
  lastRead?: boolean;
};

/** Read ticks: one for sent, two for read (in the accent colour). */
function Ticks({ read, className }: { read: boolean; className?: string }) {
  return (
    <span className={cn('material-symbols-outlined text-[15px] leading-none', read ? 'text-primary' : 'text-on-surface-variant', className)} aria-hidden>
      {read ? 'done_all' : 'done'}
    </span>
  );
}

type MsgRow = {
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  type: string;
  read_at: string | null;
  created_at: string;
};

export function ChatPanel({
  role,
  currentUserId,
  nurseryId,
  languagePref,
  initialParticipantId,
  initialParticipantRole,
  readOnly = false,
  className,
}: ChatPanelProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { data: participants = [] } = useChatParticipants(role, currentUserId, nurseryId);
  const [selected, setSelected] = useState<InboxRow | null>(null);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [listFilter, setListFilter] = useState<'all' | 'unread'>('all');
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const initialParticipantOpenedRef = useRef<string | null>(null);

  // Single batched query — one round-trip for all participants' inbox data
  const inboxQuery = useQuery({
    queryKey: ['chat-inbox', role, currentUserId],
    queryFn: async (): Promise<InboxRow[]> => {
      if (!participants.length) return [];

      const { data } = await supabase
        .from('messages')
        .select('conversation_id, sender_id, receiver_id, content, type, read_at, created_at')
        .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
        .order('created_at', { ascending: false })
        .limit(500);

      const msgs = (data ?? []) as MsgRow[];

      const map = new Map<string, { conversationId: string; lastAt: string; lastContent: string; unread: number; lastMine: boolean; lastRead: boolean }>();
      for (const m of msgs) {
        const otherId = m.sender_id === currentUserId ? m.receiver_id : m.sender_id;
        if (!map.has(otherId)) {
          const raw = m.content ?? '';
          let preview = raw;
          if (raw.startsWith('broadcast:')) preview = raw.replace('broadcast:', '');
          else if (m.type === 'image') preview = t('chat.previewImage');
          else if (m.type === 'file') preview = t('chat.previewFile');
          map.set(otherId, {
            conversationId: m.conversation_id,
            lastAt: m.created_at,
            lastContent: preview,
            unread: 0,
            lastMine: m.sender_id === currentUserId,
            lastRead: Boolean(m.read_at),
          });
        }
        if (m.receiver_id === currentUserId && !m.read_at) {
          map.get(otherId)!.unread++;
        }
      }

      return participants
        .map((p): InboxRow => {
          const d = map.get(p.id);
          return {
            participant: p,
            conversationId: d?.conversationId,
            lastAt: d?.lastAt,
            lastContent: d?.lastContent,
            unread: d?.unread ?? 0,
            lastMine: d?.lastMine,
            lastRead: d?.lastRead,
          };
        })
        .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
    },
    enabled: participants.length > 0,
  });

  const currentConversationId = selected?.conversationId ?? null;
  const messagesQuery = useConversationMessages(currentConversationId);
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);

  // Scroll to bottom whenever new messages arrive
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messagesQuery.data?.length]);

  const imageUrlsQuery = useQuery({
    queryKey: ['chat-image-urls', currentConversationId, messages.length],
    queryFn: async (): Promise<Record<string, string>> => {
      const map: Record<string, string> = {};
      for (const m of messages) {
        if (m.type === 'image' && isStorageImage(m.content)) {
          const path = storagePathFromContent(m.content);
          const { data } = await supabase.storage.from('chat-media').createSignedUrl(path, 3600);
          if (data?.signedUrl) map[m.id] = data.signedUrl;
        }
      }
      return map;
    },
    enabled: Boolean(currentConversationId && messages.length),
  });

  const fileUrlsQuery = useQuery({
    queryKey: ['chat-file-urls', currentConversationId, messages.length],
    queryFn: async (): Promise<Record<string, string>> => {
      const map: Record<string, string> = {};
      for (const m of messages) {
        if (m.type === 'file' && isStorageFile(m.content)) {
          const path = filePathFromContent(m.content);
          const { data } = await supabase.storage.from('chat-files').createSignedUrl(path, 3600);
          if (data?.signedUrl) map[m.id] = data.signedUrl;
        }
      }
      return map;
    },
    enabled: Boolean(currentConversationId && messages.length),
  });

  const markRead = useMutation({
    mutationFn: async () => {
      if (!selected?.conversationId) return;
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() } as never)
        .eq('conversation_id', selected.conversationId)
        .eq('receiver_id', currentUserId)
        .is('read_at', null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['chat-inbox'] });
      await queryClient.invalidateQueries({ queryKey: ['chat-unread-count'] });
    },
  });

  const sendMessage = useMutation({
    mutationFn: async (payload: {
      content: string;
      type: 'text' | 'image' | 'file';
      fileName?: string;
      mimeType?: string;
      fileSize?: number;
    }) => {
      if (!selected) return;
      const conversationId = getOrCreateConversationId(selected.conversationId);
      const { error } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: currentUserId,
        receiver_id: selected.participant.id,
        content: payload.content,
        type: payload.type,
        file_name: payload.fileName ?? null,
        mime_type: payload.mimeType ?? null,
        file_size_bytes: payload.fileSize ?? null,
      } as never);
      if (error) throw error;
      setSelected((prev) => (prev ? { ...prev, conversationId } : prev));
    },
    onSuccess: async () => {
      setText('');
      await queryClient.invalidateQueries({ queryKey: ['chat-inbox'] });
      await queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
    },
  });

  const handleSend = () => {
    if (!text.trim() || sendMessage.isPending) return;
    void sendMessage.mutateAsync({ content: text.trim(), type: 'text' });
  };

  const sendImage = async (file: File) => {
    if (!selected || readOnly) return;
    setUploading(true);
    try {
      const path = `${currentUserId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from('chat-media').upload(path, file);
      if (error) throw error;
      await sendMessage.mutateAsync({ content: `chat-media:${path}`, type: 'image' });
    } finally {
      setUploading(false);
    }
  };

  const sendFile = async (file: File) => {
    if (!selected || readOnly) return;
    if (file.size > MAX_CHAT_FILE_BYTES) {
      toast.error(t('chat.fileTooLarge', { max: '10 MB' }));
      return;
    }
    if (file.type && !ALLOWED_CHAT_FILE_MIME.includes(file.type)) {
      toast.error(t('chat.unsupportedFileType'));
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^\w.-]+/g, '_');
      const path = `${currentUserId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from('chat-files')
        .upload(path, file, { contentType: file.type || 'application/octet-stream' });
      if (error) throw error;
      await sendMessage.mutateAsync({
        content: `${CHAT_FILE_PREFIX}${path}`,
        type: 'file',
        fileName: file.name,
        mimeType: file.type || undefined,
        fileSize: file.size,
      });
    } catch {
      toast.error(t('chat.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const openConversation = (row: InboxRow) => {
    setSelected(row);
    void markRead.mutateAsync();
  };

  // Group messages by calendar day for thread separators
  const dayGroups = useMemo(() => {
    type Msg = (typeof messages)[number];
    const groups: Array<{ dayKey: string; messages: Msg[] }> = [];
    const msgs = messages;
    let currentDay = '';
    let current: Msg[] = [];
    for (const m of msgs) {
      const day = new Date(m.created_at).toDateString();
      if (day !== currentDay) {
        if (current.length) groups.push({ dayKey: currentDay, messages: current });
        currentDay = day;
        current = [m];
      } else {
        current.push(m);
      }
    }
    if (current.length) groups.push({ dayKey: currentDay, messages: current });
    return groups;
  }, [messages]);

  const inbox = useMemo(() => inboxQuery.data ?? [], [inboxQuery.data]);

  const initialRoleList = useMemo(
    () => (Array.isArray(initialParticipantRole) ? initialParticipantRole : initialParticipantRole ? [initialParticipantRole] : []),
    [initialParticipantRole],
  );
  const initialTargetParticipantId =
    initialParticipantId ??
    initialRoleList.map((roleName) => participants.find((p) => p.role === roleName)?.id).find(Boolean) ??
    null;

  useEffect(() => {
    if (!initialTargetParticipantId) return;
    const participant = participants.find((p) => p.id === initialTargetParticipantId);
    if (!participant) return;
    const existing = inbox.find((r) => r.participant.id === initialTargetParticipantId);
    // Open the starting conversation once. After that only fill in its conversation id when the
    // inbox loads, and never reopen it: Back (on phones) and picking another chat used to snap
    // straight back to it.
    if (initialParticipantOpenedRef.current === initialTargetParticipantId) {
      if (existing?.conversationId) {
        setSelected((prev) => (prev?.participant.id === initialTargetParticipantId && !prev.conversationId ? existing : prev));
      }
      return;
    }
    setSelected(existing ?? { participant, unread: 0 });
    initialParticipantOpenedRef.current = initialTargetParticipantId;
  }, [initialTargetParticipantId, inbox, participants]);

  // The inbox sidebar lists only real conversations (people already messaged).
  // Starting a thread with anyone else goes through the recipient picker.
  const conversations = inbox.filter((r) => Boolean(r.lastAt));
  const unreadConversations = conversations.filter((r) => r.unread > 0).length;
  const filtered = conversations.filter((r) => {
    if (listFilter === 'unread' && r.unread === 0) return false;
    if (!search) return true;
    const name = getUserDisplayName(r.participant.name_ar, r.participant.name_en, languagePref);
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const openWithParticipant = (participant: ChatParticipant) => {
    const existing = inbox.find((r) => r.participant.id === participant.id);
    if (existing) {
      openConversation(existing);
    } else {
      setSelected({ participant, unread: 0 });
    }
    setPicking(false);
    setSearch('');
  };

  const selectedName = selected
    ? getUserDisplayName(selected.participant.name_ar, selected.participant.name_en, languagePref)
    : '';

  const selectedRoleLabel = selected ? t(`chat.role.${selected.participant.role}`) : '';

  function formatDayLabel(dateStr: string): string {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return t('chat.today');
    if (date.toDateString() === yesterday.toDateString()) return t('chat.yesterday');
    return new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(date);
  }

  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';
  const clock = (iso: string) => new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
  const listTime = (iso: string) => chatListTime(iso, { locale, yesterday: t('chat.yesterday') });


  const iconButton =
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-high hover:text-on-surface';

  return (
    <div className={cn('flex overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm', className)}>
      {/* ── Chat list ── */}
      <div
        className={cn(
          'relative w-full shrink-0 flex-col border-e border-outline-variant bg-surface md:w-72 lg:w-80',
          selected ? 'hidden md:flex' : 'flex',
        )}
      >
        <div className="space-y-3 px-4 pb-3 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-on-surface">{t('chat.inboxTitle')}</h2>
            {!readOnly ? (
              <button type="button" onClick={() => setPicking(true)} className={iconButton} title={t('chat.newMessage')} aria-label={t('chat.newMessage')}>
                <span className="material-symbols-outlined text-xl" aria-hidden>edit_square</span>
              </button>
            ) : null}
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-on-surface-variant" aria-hidden>
              <span className="material-symbols-outlined text-lg">search</span>
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('chat.searchPlaceholder')}
              className="h-10 w-full rounded-full border border-transparent bg-surface-container-lowest pe-4 ps-10 text-sm outline-none focus:border-primary/40 focus:bg-surface"
            />
          </div>
          <FilterChips
            label={t('chat.inboxTitle')}
            value={listFilter}
            onChange={setListFilter}
            options={[
              { value: 'all', label: t('chat.filterAll') },
              { value: 'unread', label: t('chat.filterUnread'), count: unreadConversations },
            ]}
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center text-sm text-on-surface-variant">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-lowest" aria-hidden>
                <span className="material-symbols-outlined text-3xl">forum</span>
              </span>
              <span>{search ? t('chat.noResults') : listFilter === 'unread' ? t('chat.noUnread') : t('chat.noConversations')}</span>
              {!readOnly && !search && listFilter === 'all' ? (
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden>edit_square</span>
                  {t('chat.newMessage')}
                </button>
              ) : null}
            </div>
          ) : (
            <ul>
              {filtered.map((row) => {
                const name = getUserDisplayName(row.participant.name_ar, row.participant.name_en, languagePref);
                const isSelected = selected?.participant.id === row.participant.id;
                return (
                  <li key={row.participant.id}>
                    <button
                      type="button"
                      onClick={() => openConversation(row)}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-2.5 text-start transition-colors hover:bg-surface-container-lowest',
                        isSelected && 'bg-surface-container-lowest',
                      )}
                    >
                      <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold', TONE_TINT[avatarTone(row.participant.id)])} aria-hidden>
                        {getUserInitials(name, null)}
                      </span>
                      <span className="min-w-0 flex-1 border-b border-outline-variant/60 pb-2.5 pt-0.5">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-on-surface">{name}</span>
                          {row.lastAt ? (
                            <span className={cn('shrink-0 text-[11px]', row.unread ? 'font-semibold text-primary' : 'text-on-surface-variant')}>
                              {listTime(row.lastAt)}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          {row.lastMine ? <Ticks read={Boolean(row.lastRead)} className="shrink-0" /> : null}
                          <span className={cn('min-w-0 flex-1 truncate text-xs', row.unread ? 'font-medium text-on-surface' : 'text-on-surface-variant')}>
                            {row.lastContent ?? t('chat.startConversation')}
                          </span>
                          {row.unread > 0 ? (
                            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold tabular-nums text-primary-foreground">
                              {row.unread}
                            </span>
                          ) : (
                            <span className="shrink-0 rounded-full bg-surface-high px-1.5 py-0.5 text-[10px] font-medium text-on-surface-variant">
                              {t(`chat.role.${row.participant.role}`)}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {picking ? (
          <ChatRecipientPicker participants={participants} languagePref={languagePref} onSelect={openWithParticipant} onClose={() => setPicking(false)} />
        ) : null}
      </div>

      {/* ── Conversation ── */}
      <div className={cn('flex min-w-0 flex-1 flex-col overflow-hidden', selected ? 'flex' : 'hidden md:flex')}>
        {selected ? (
          <>
            <div className="flex items-center gap-3 border-b border-outline-variant bg-surface px-3 py-2.5">
              <button type="button" onClick={() => setSelected(null)} className={cn(iconButton, 'md:hidden')} aria-label={t('common.back')}>
                <span className="material-symbols-outlined text-xl rtl:rotate-180" aria-hidden>arrow_back</span>
              </button>
              <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold', TONE_TINT[avatarTone(selected.participant.id)])} aria-hidden>
                {getUserInitials(selectedName, null)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-on-surface">{selectedName}</p>
                <p className="truncate text-xs text-on-surface-variant">{selectedRoleLabel}</p>
              </div>
            </div>

            {/* Messages, over a light dotted wallpaper. */}
            <div
              ref={threadRef}
              className="flex-1 overflow-y-auto bg-surface-container-lowest px-3 py-3 sm:px-6"
              style={{ backgroundImage: 'radial-gradient(rgb(var(--border-default) / 0.55) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
            >
              {dayGroups.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="max-w-xs rounded-xl bg-surface px-5 py-4 text-center shadow-sm">
                    <span className="material-symbols-outlined text-3xl text-primary" aria-hidden>waving_hand</span>
                    <p className="mt-1 text-sm text-on-surface">{t('chat.startConversation')}</p>
                    <p className="mt-1 text-xs text-on-surface-variant">{t('chat.privacyNote')}</p>
                  </div>
                </div>
              ) : (
                dayGroups.map((group) => (
                  <div key={group.dayKey}>
                    <div className="sticky top-0 z-[1] my-3 flex justify-center">
                      <span className="rounded-full bg-surface px-3 py-1 text-[11px] font-medium text-on-surface-variant shadow-sm">
                        {formatDayLabel(group.dayKey)}
                      </span>
                    </div>
                    {group.messages.map((msg, index) => {
                      const mine = msg.sender_id === currentUserId;
                      const firstOfRun = index === 0 || group.messages[index - 1].sender_id !== msg.sender_id;
                      const isBroadcast = msg.content.startsWith('broadcast:');
                      const meta = (
                        <span className={cn('inline-flex items-center gap-1 text-[10px] leading-none text-on-surface-variant', msg.type === 'image' && 'rounded-full bg-black/45 px-1.5 py-1 text-white')}>
                          {clock(msg.created_at)}
                          {mine ? <Ticks read={Boolean(msg.read_at)} className={msg.type === 'image' ? 'text-white' : undefined} /> : null}
                        </span>
                      );
                      return (
                        <div key={msg.id} className={cn('flex', mine ? 'justify-end' : 'justify-start', firstOfRun ? 'mt-2.5' : 'mt-0.5')}>
                          <div
                            className={cn(
                              'relative max-w-[80%] rounded-lg px-2.5 py-1.5 shadow-sm sm:max-w-[70%]',
                              mine ? 'bg-primary/15 text-on-surface' : 'bg-surface text-on-surface',
                              firstOfRun && (mine ? 'rounded-se-none' : 'rounded-ss-none'),
                              msg.type === 'image' && 'p-1',
                            )}
                          >
                            {isBroadcast ? (
                              <>
                                <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-primary">
                                  <span className="material-symbols-outlined text-sm" aria-hidden>campaign</span>
                                  {t('chat.announcement')}
                                </p>
                                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                                  {msg.content.replace('broadcast:', '')}
                                  <span className="float-end ms-3 mt-2">{meta}</span>
                                </p>
                              </>
                            ) : msg.type === 'image' ? (
                              <div className="relative">
                                <img
                                  src={imageUrlsQuery.data?.[msg.id] ?? ''}
                                  alt={t('chat.previewImage')}
                                  className="max-h-64 min-h-24 min-w-40 rounded-md bg-surface-high object-cover"
                                  loading="lazy"
                                  decoding="async"
                                />
                                <span className="absolute bottom-1.5 end-1.5">{meta}</span>
                              </div>
                            ) : msg.type === 'file' ? (
                              <>
                                <a
                                  href={fileUrlsQuery.data?.[msg.id] ?? '#'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={msg.file_name ?? undefined}
                                  className={cn(
                                    'flex min-w-56 items-center gap-3 rounded-md bg-surface-container-lowest/80 p-2.5',
                                    !fileUrlsQuery.data?.[msg.id] && 'pointer-events-none opacity-60',
                                  )}
                                >
                                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-error/10 text-error" aria-hidden>
                                    <span className="material-symbols-outlined text-xl">description</span>
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block max-w-[200px] truncate text-sm font-medium">{msg.file_name ?? t('chat.previewFile')}</span>
                                    {msg.file_size_bytes ? (
                                      <span className="block text-[11px] text-on-surface-variant">{formatFileSize(msg.file_size_bytes)}</span>
                                    ) : null}
                                  </span>
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant" aria-hidden>
                                    <span className="material-symbols-outlined text-base">download</span>
                                  </span>
                                </a>
                                <div className="mt-1 flex justify-end">{meta}</div>
                              </>
                            ) : (
                              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                                {msg.content}
                                {/* Time and ticks sit at the end of the last line, as in WhatsApp. */}
                                <span className="float-end ms-3 mt-2">{meta}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {!readOnly ? (
              <div className="flex items-end gap-2 border-t border-outline-variant bg-surface px-2 py-2 sm:px-3">
                <div className="flex min-h-11 flex-1 items-end gap-0.5 rounded-3xl border border-outline-variant bg-surface-container-lowest px-1.5 focus-within:border-primary/40">
                  <label title={t('chat.attachFile')} className={cn(iconButton, 'cursor-pointer', uploading && 'pointer-events-none opacity-50')}>
                    <span className="material-symbols-outlined text-xl" aria-hidden>attach_file</span>
                    <span className="sr-only">{t('chat.attachFile')}</span>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void sendFile(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={uploading ? t('chat.uploading') : t('chat.messagePlaceholder')}
                    rows={1}
                    aria-label={t('chat.messagePlaceholder')}
                    className="min-h-11 flex-1 resize-none bg-transparent px-1.5 py-2.5 text-sm outline-none"
                    style={{ maxHeight: '120px' }}
                    onInput={(e) => {
                      const el = e.currentTarget;
                      el.style.height = 'auto';
                      el.style.height = `${el.scrollHeight}px`;
                    }}
                  />
                  <label title={t('chat.attachImage')} className={cn(iconButton, 'cursor-pointer', uploading && 'pointer-events-none opacity-50')}>
                    <span className="material-symbols-outlined text-xl" aria-hidden>photo_camera</span>
                    <span className="sr-only">{t('chat.attachImage')}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void sendImage(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!text.trim() || sendMessage.isPending}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition hover:opacity-90 disabled:opacity-40"
                  title={t('chat.send')}
                  aria-label={t('chat.send')}
                >
                  <span className="material-symbols-outlined text-xl rtl:rotate-180" aria-hidden>send</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 border-t border-outline-variant bg-surface px-4 py-3 text-xs text-on-surface-variant">
                <span className="material-symbols-outlined text-base" aria-hidden>visibility</span>
                {t('chat.readOnlyHint')}
              </div>
            )}
          </>
        ) : (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-3 bg-surface-container-lowest p-8 text-center"
            style={{ backgroundImage: 'radial-gradient(rgb(var(--border-default) / 0.55) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
          >
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden>
              <span className="material-symbols-outlined text-4xl">forum</span>
            </span>
            <p className="text-base font-semibold text-on-surface">{t('chat.selectContact')}</p>
            <p className="max-w-xs text-sm text-on-surface-variant">{t('chat.selectContactHint')}</p>
            <p className="mt-2 inline-flex items-center gap-1 text-xs text-on-surface-variant">
              <span className="material-symbols-outlined text-sm" aria-hidden>lock</span>
              {t('chat.privacyNote')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
