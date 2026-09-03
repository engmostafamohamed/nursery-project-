import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCheck, Megaphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ChatRecipientPicker } from '@/components/chat/ChatRecipientPicker';
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
import { cn } from '@/lib/utils';
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
};

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

      const map = new Map<string, { conversationId: string; lastAt: string; lastContent: string; unread: number }>();
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
    if (
      initialParticipantOpenedRef.current === initialTargetParticipantId &&
      selected?.participant.id === initialTargetParticipantId &&
      selected.conversationId === existing?.conversationId
    ) {
      return;
    }
    setSelected(existing ?? { participant, unread: 0 });
    initialParticipantOpenedRef.current = initialTargetParticipantId;
  }, [initialTargetParticipantId, inbox, participants, selected]);

  // The inbox sidebar lists only real conversations (people already messaged).
  // Starting a thread with anyone else goes through the recipient picker.
  const conversations = inbox.filter((r) => Boolean(r.lastAt));
  const filtered = search
    ? conversations.filter((r) => {
        const name = getUserDisplayName(r.participant.name_ar, r.participant.name_en, languagePref);
        return name.toLowerCase().includes(search.toLowerCase());
      })
    : conversations;

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

  return (
    <div
      className={cn(
        'flex overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest',
        className,
      )}
    >
      {/* ── Contacts sidebar ── */}
      <div
        className={cn(
          'relative flex w-80 shrink-0 flex-col border-e border-outline-variant',
          selected ? 'hidden md:flex' : 'flex',
        )}
      >
        <div className="border-b border-outline-variant px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-on-surface">{t('chat.inboxTitle')}</h2>
            {!readOnly ? (
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                <span className="material-symbols-outlined text-sm" aria-hidden>
                  edit_square
                </span>
                {t('chat.newMessage')}
              </button>
            ) : null}
          </div>
          <div className="relative">
            <span className="material-symbols-outlined pointer-events-none absolute start-3 top-2 text-sm text-on-surface-variant">
              search
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('chat.searchPlaceholder')}
              className="h-9 w-full rounded-xl border border-outline-variant bg-surface ps-9 pe-3 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center text-sm text-on-surface-variant">
              <span>{search ? t('chat.noResults') : t('chat.noConversations')}</span>
              {!readOnly && !search ? (
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  className="rounded-xl border border-outline-variant px-3 py-1.5 text-xs font-medium text-primary hover:bg-surface-container-low"
                >
                  {t('chat.newMessage')}
                </button>
              ) : null}
            </div>
          ) : (
            filtered.map((row) => {
              const name = getUserDisplayName(
                row.participant.name_ar,
                row.participant.name_en,
                languagePref,
              );
              const isSelected = selected?.participant.id === row.participant.id;
              const roleLabel = t(`chat.role.${row.participant.role}`);

              return (
                <button
                  key={row.participant.id}
                  type="button"
                  onClick={() => openConversation(row)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-surface-container-low',
                    isSelected && 'bg-primary/5',
                  )}
                >
                  <div className="relative shrink-0">
                    <Avatar>
                      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                        {name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {row.unread > 0 ? (
                      <span className="absolute -end-1 -top-1 min-w-[1.125rem] rounded-full bg-primary px-1 text-center text-[10px] font-semibold text-white">
                        {row.unread}
                      </span>
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p
                          className={cn(
                            'truncate text-sm',
                            row.unread ? 'font-semibold text-on-surface' : 'font-medium text-on-surface',
                          )}
                        >
                          {name}
                        </p>
                        {roleLabel ? (
                          <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            {roleLabel}
                          </span>
                        ) : null}
                      </div>
                      {row.lastAt ? (
                        <span className="shrink-0 text-[10px] text-on-surface-variant">
                          {new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
                            hour: '2-digit',
                            minute: '2-digit', hour12: true,
                          }).format(new Date(row.lastAt))}
                        </span>
                      ) : null}
                    </div>
                    {row.lastContent ? (
                      <p
                        className={cn(
                          'mt-0.5 truncate text-xs',
                          row.unread ? 'font-medium text-on-surface' : 'text-on-surface-variant',
                        )}
                      >
                        {row.lastContent}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs italic text-on-surface-variant">
                        {t('chat.startConversation')}
                      </p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {picking ? (
          <ChatRecipientPicker
            participants={participants}
            languagePref={languagePref}
            onSelect={openWithParticipant}
            onClose={() => setPicking(false)}
          />
        ) : null}
      </div>

      {/* ── Thread panel ── */}
      <div
        className={cn(
          'flex flex-1 flex-col overflow-hidden',
          selected ? 'flex' : 'hidden md:flex',
        )}
      >
        {selected ? (
          <>
            {/* Thread header */}
            <div className="flex items-center gap-3 border-b border-outline-variant px-4 py-3">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="-ms-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-high md:hidden"
              >
                <span className="material-symbols-outlined text-base">arrow_back</span>
              </button>
              <Avatar>
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                  {selectedName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-on-surface">{selectedName}</p>
                <p className="text-xs text-on-surface-variant">{selectedRoleLabel}</p>
              </div>
            </div>

            {/* Messages */}
            <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-4">
              {dayGroups.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-on-surface-variant">{t('chat.startConversation')}</p>
                </div>
              ) : (
                dayGroups.map((group) => (
                  <div key={group.dayKey}>
                    <div className="my-4 flex items-center gap-3">
                      <div className="h-px flex-1 bg-outline-variant" />
                      <span className="text-[11px] text-on-surface-variant">
                        {formatDayLabel(group.dayKey)}
                      </span>
                      <div className="h-px flex-1 bg-outline-variant" />
                    </div>
                    <div className="space-y-1.5">
                      {group.messages.map((msg) => {
                        const mine = msg.sender_id === currentUserId;
                        const ts = new Intl.DateTimeFormat(
                          i18n.language === 'ar' ? 'ar-EG' : 'en-US',
                          { hour: '2-digit', minute: '2-digit', hour12: true },
                        ).format(new Date(msg.created_at));

                        return (
                          <div
                            key={msg.id}
                            className={cn('flex', mine ? 'justify-end' : 'justify-start')}
                          >
                            <div
                              className={cn(
                                'max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm',
                                mine
                                  ? 'rounded-se-sm bg-primary text-white'
                                  : 'rounded-ss-sm bg-surface-container text-on-surface',
                              )}
                            >
                              {msg.content.startsWith('broadcast:') ? (
                                <div className="flex items-start gap-2">
                                  <Megaphone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                  <p className="text-sm">{msg.content.replace('broadcast:', '')}</p>
                                </div>
                              ) : msg.type === 'image' ? (
                                <img
                                  src={imageUrlsQuery.data?.[msg.id] ?? ''}
                                  alt="shared"
                                  className="max-h-48 rounded-xl"
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : msg.type === 'file' ? (
                                <a
                                  href={fileUrlsQuery.data?.[msg.id] ?? '#'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={msg.file_name ?? undefined}
                                  className={cn(
                                    'flex items-center gap-3 rounded-xl px-1 py-0.5',
                                    !fileUrlsQuery.data?.[msg.id] && 'pointer-events-none opacity-60',
                                  )}
                                >
                                  <span
                                    className={cn(
                                      'material-symbols-outlined shrink-0 text-2xl',
                                      mine ? 'text-white' : 'text-primary',
                                    )}
                                    aria-hidden
                                  >
                                    description
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block max-w-[200px] truncate text-sm font-medium">
                                      {msg.file_name ?? t('chat.previewFile')}
                                    </span>
                                    {msg.file_size_bytes ? (
                                      <span
                                        className={cn(
                                          'block text-[11px]',
                                          mine ? 'text-white/70' : 'text-on-surface-variant',
                                        )}
                                      >
                                        {formatFileSize(msg.file_size_bytes)}
                                      </span>
                                    ) : null}
                                  </span>
                                  <span
                                    className="material-symbols-outlined ms-auto text-base"
                                    aria-hidden
                                  >
                                    download
                                  </span>
                                </a>
                              ) : (
                                <p className="text-sm leading-relaxed">{msg.content}</p>
                              )}
                              <div
                                className={cn(
                                  'mt-1 flex items-center gap-1 text-[10px]',
                                  mine ? 'justify-end text-white/70' : 'text-on-surface-variant',
                                )}
                              >
                                <span>{ts}</span>
                                {mine ? (
                                  msg.read_at ? (
                                    <CheckCheck className="h-3 w-3" />
                                  ) : (
                                    <Check className="h-3 w-3" />
                                  )
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input area */}
            {!readOnly ? (
              <div className="border-t border-outline-variant p-4">
                <div className="flex items-end gap-2">
                  <label
                    title={t('chat.attachImage')}
                    className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-high"
                  >
                    <span className="material-symbols-outlined text-base">image</span>
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
                  <label
                    title={t('chat.attachFile')}
                    className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-high"
                  >
                    <span className="material-symbols-outlined text-base">attach_file</span>
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
                  <div className="flex-1">
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
                      className="w-full resize-none rounded-xl border border-outline-variant bg-surface px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                      style={{ maxHeight: '120px' }}
                      onInput={(e) => {
                        const el = e.currentTarget;
                        el.style.height = 'auto';
                        el.style.height = `${el.scrollHeight}px`;
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!text.trim() || sendMessage.isPending}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-opacity disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-base">send</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="border-t border-outline-variant px-4 py-3">
                <p className="text-center text-xs text-on-surface-variant">{t('chat.readOnlyHint')}</p>
              </div>
            )}
          </>
        ) : (
          /* No conversation selected — desktop placeholder */
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="material-symbols-outlined text-5xl text-outline-variant">chat</span>
            <p className="text-sm font-semibold text-on-surface">{t('chat.selectContact')}</p>
            <p className="max-w-xs text-xs text-on-surface-variant">{t('chat.selectContactHint')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
