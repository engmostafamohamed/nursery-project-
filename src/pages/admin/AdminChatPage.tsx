import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useAuthSession } from '@/hooks/useAuthSession';
import {
  useChatActions,
  useChatConversations,
  useChatDirectory,
  useChatMembers,
  useChatThread,
  type ChatConversation,
} from '@/hooks/useAdminChat';
import { cn } from '@/lib/utils';

type NewKind = 'direct' | 'group';

export function AdminChatPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const userId = user?.id;

  const dn = (ar: string | null | undefined, en: string | null | undefined) =>
    i18n.language === 'ar' ? ar?.trim() || en?.trim() || '' : en?.trim() || ar?.trim() || '';

  const conversationsQuery = useChatConversations(userId);
  const conversations = conversationsQuery.data ?? [];
  const actions = useChatActions(userId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [newKind, setNewKind] = useState<NewKind>('group');
  const [membersOpen, setMembersOpen] = useState(false);

  const filtered = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => convTitle(c).toLowerCase().includes(q));
  })();

  function convTitle(c: ChatConversation): string {
    if (c.kind === 'group') return c.title?.trim() || t('chatAdmin.untitledGroup');
    return dn(c.other_name_ar, c.other_name_en) || t('chatAdmin.directChat');
  }

  const openConversation = (c: ChatConversation) => {
    setSelectedId(c.id);
    if (c.unread_count > 0) actions.markRead.mutate(c.id);
  };

  const canPost = Boolean(selected && selected.can_write && (!selected.is_read_only || selected.is_admin));
  // Only a conversation admin (creator / promoted) sees manage / read-only / delete.
  // Regular members (staff, parents) can only read, reply-if-allowed, and hide.
  const canManage = Boolean(selected && selected.is_admin);

  const onSend = async () => {
    if (!selected || !draft.trim()) return;
    const content = draft.trim();
    setDraft('');
    try {
      await actions.sendMessage.mutateAsync({ conversationId: selected.id, content });
    } catch {
      setDraft(content);
      toast.error(t('chatAdmin.sendFailed'));
    }
  };

  return (
    <div className="flex h-[calc(100vh-9rem)] gap-4">
      {/* ── Left: conversation list ───────────────────────────────── */}
      <aside className="flex w-full max-w-xs shrink-0 flex-col rounded-2xl border border-outline-variant bg-surface-container-lowest">
        <div className="flex items-center justify-between gap-2 border-b border-outline-variant p-3">
          <h1 className="text-base font-semibold text-on-surface">{t('chatAdmin.title')}</h1>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setNewKind('group');
              setNewOpen(true);
            }}
          >
            <span className="material-symbols-outlined me-1 text-sm" aria-hidden>
              add
            </span>
            {t('chatAdmin.new')}
          </Button>
        </div>
        <div className="p-3">
          <div className="relative">
            <span className="material-symbols-outlined pointer-events-none absolute start-2.5 top-2 text-base text-on-surface-variant" aria-hidden>
              search
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('chatAdmin.searchPlaceholder')}
              className="h-9 w-full rounded-lg border border-outline-variant bg-surface ps-9 pe-3 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-on-surface-variant">{t('chatAdmin.noConversations')}</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => openConversation(c)}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-xl p-2.5 text-start transition-colors',
                  selectedId === c.id ? 'bg-primary/10' : 'hover:bg-surface-container',
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-lg" aria-hidden>
                    {c.kind === 'group' ? 'groups' : 'person'}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-on-surface">{convTitle(c)}</span>
                    {c.is_read_only ? (
                      <span className="material-symbols-outlined text-xs text-on-surface-variant" aria-hidden title={t('chatAdmin.readOnly')}>
                        lock
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-on-surface-variant">
                    {c.last_message ?? t('chatAdmin.noMessages')}
                  </span>
                </span>
                {c.unread_count > 0 ? (
                  <span className="mt-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-on-primary">
                    {c.unread_count}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Right: thread ─────────────────────────────────────────── */}
      <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-outline-variant bg-surface-container-lowest">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState icon="forum" title={t('chatAdmin.emptyTitle')} description={t('chatAdmin.emptyDescription')} />
          </div>
        ) : (
          <ThreadView
            key={selected.id}
            conversation={selected}
            title={convTitle(selected)}
            canManage={canManage}
            canPost={canPost}
            draft={draft}
            setDraft={setDraft}
            onSend={onSend}
            onOpenMembers={() => setMembersOpen(true)}
            onToggleReadOnly={() =>
              actions.setReadOnly.mutate({ conversationId: selected.id, value: !selected.is_read_only })
            }
            onHide={() => {
              actions.hideConversation.mutate(selected.id);
              setSelectedId(null);
            }}
            onDelete={() => {
              if (window.confirm(t('chatAdmin.confirmDelete'))) {
                actions.deleteConversation.mutate(selected.id);
                setSelectedId(null);
              }
            }}
            onModerate={(messageId, kind) => actions.moderateMessage.mutate({ messageId, kind })}
            currentUserId={userId}
          />
        )}
      </section>

      {newOpen ? (
        <NewConversationDialog
          open={newOpen}
          kind={newKind}
          setKind={setNewKind}
          onClose={() => setNewOpen(false)}
          onCreate={async (kind, title, memberIds) => {
            try {
              const id = await actions.createConversation.mutateAsync({ kind, title, memberIds });
              setNewOpen(false);
              setSelectedId(id);
            } catch {
              toast.error(t('chatAdmin.createFailed'));
            }
          }}
        />
      ) : null}

      {membersOpen && selected ? (
        <ManageMembersDialog
          conversationId={selected.id}
          canManage={Boolean(selected.is_admin)}
          onClose={() => setMembersOpen(false)}
          onSetWrite={(memberId, value) =>
            actions.setMemberCanWrite.mutate({ conversationId: selected.id, memberId, value })
          }
          onRemove={(memberId) => actions.removeMember.mutate({ conversationId: selected.id, memberId })}
          onAdd={(memberIds) => actions.addMembers.mutate({ conversationId: selected.id, memberIds })}
        />
      ) : null}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
function ThreadView(props: {
  conversation: ChatConversation;
  title: string;
  canManage: boolean;
  canPost: boolean;
  draft: string;
  setDraft: (v: string) => void;
  onSend: () => void;
  onOpenMembers: () => void;
  onToggleReadOnly: () => void;
  onHide: () => void;
  onDelete: () => void;
  onModerate: (messageId: string, kind: 'removed' | 'disabled' | null) => void;
  currentUserId: string | undefined;
}) {
  const { t, i18n } = useTranslation();
  const { conversation, title, canManage, canPost, draft, setDraft, currentUserId } = props;
  const thread = useChatThread(conversation.id);
  const messages = thread.data ?? [];
  const [menuOpen, setMenuOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const dn = (ar: string | null, en: string | null) =>
    i18n.language === 'ar' ? ar?.trim() || en?.trim() || '' : en?.trim() || ar?.trim() || '';

  return (
    <>
      <header className="flex items-center justify-between gap-2 border-b border-outline-variant p-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-lg" aria-hidden>
              {conversation.kind === 'group' ? 'groups' : 'person'}
            </span>
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-on-surface">{title}</p>
            <p className="text-xs text-on-surface-variant">
              {conversation.kind === 'group'
                ? t('chatAdmin.memberCount', { count: conversation.member_count })
                : t(`chatAdmin.roles.${conversation.other_role ?? 'member'}`, { defaultValue: conversation.other_role ?? '' })}
              {conversation.is_read_only ? ` · ${t('chatAdmin.readOnly')}` : ''}
            </p>
          </div>
        </div>
        <div className="relative shrink-0">
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => setMenuOpen((o) => !o)} aria-label={t('common.more', { defaultValue: 'More' })}>
            <span className="material-symbols-outlined" aria-hidden>
              more_vert
            </span>
          </Button>
          {menuOpen ? (
            <>
              <button type="button" className="fixed inset-0 z-10" aria-hidden onClick={() => setMenuOpen(false)} />
              <div className="absolute end-0 top-10 z-20 w-52 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest py-1 shadow-lg">
                {canManage && conversation.kind === 'group' ? (
                  <MenuItem icon="group" label={t('chatAdmin.manageMembers')} onClick={() => { setMenuOpen(false); props.onOpenMembers(); }} />
                ) : null}
                {canManage ? (
                  <MenuItem
                    icon={conversation.is_read_only ? 'lock_open' : 'lock'}
                    label={conversation.is_read_only ? t('chatAdmin.makeWritable') : t('chatAdmin.makeReadOnly')}
                    onClick={() => { setMenuOpen(false); props.onToggleReadOnly(); }}
                  />
                ) : null}
                <MenuItem icon="visibility_off" label={t('chatAdmin.hide')} onClick={() => { setMenuOpen(false); props.onHide(); }} />
                {canManage ? (
                  <MenuItem icon="delete" danger label={t('chatAdmin.delete')} onClick={() => { setMenuOpen(false); props.onDelete(); }} />
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-xs text-on-surface-variant">{t('chatAdmin.noMessages')}</p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === currentUserId;
            const time = new Date(m.created_at).toLocaleTimeString(i18n.language === 'ar' ? 'ar-EG' : 'en', {
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <div key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
                <div className={cn('group/msg flex max-w-[80%] items-center gap-1', mine ? 'flex-row-reverse' : 'flex-row')}>
                  {m.moderation ? (
                    <div className="flex items-center gap-1.5 rounded-2xl border border-dashed border-outline-variant bg-surface-container px-3 py-2 text-xs italic text-on-surface-variant">
                      <span className="material-symbols-outlined text-sm" aria-hidden>
                        {m.moderation === 'removed' ? 'block' : 'visibility_off'}
                      </span>
                      {m.moderation === 'removed' ? t('chatAdmin.removedByAdmin') : t('chatAdmin.disabledByAdmin')}
                    </div>
                  ) : (
                    <div
                      className={cn(
                        'whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm',
                        mine ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface',
                      )}
                    >
                      {m.content}
                    </div>
                  )}
                  {canManage ? <MessageModMenu moderation={m.moderation} onModerate={(kind) => props.onModerate(m.id, kind)} /> : null}
                </div>
                <span className="mt-0.5 flex items-center gap-1 px-1 text-[10px] text-on-surface-variant">
                  <span className="font-medium text-on-surface-variant">{dn(m.sender_name_ar, m.sender_name_en)}</span>
                  <span aria-hidden>·</span>
                  <span>{time}</span>
                </span>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-outline-variant p-3">
        {canPost ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              props.onSend();
            }}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  props.onSend();
                }
              }}
              rows={1}
              placeholder={t('chatAdmin.messagePlaceholder')}
              className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={!draft.trim()} aria-label={t('chatAdmin.send')}>
              <span className="material-symbols-outlined" aria-hidden>
                send
              </span>
            </Button>
          </form>
        ) : (
          <p className="flex items-center justify-center gap-1.5 rounded-xl bg-surface-container py-2.5 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-sm" aria-hidden>
              lock
            </span>
            {conversation.is_read_only ? t('chatAdmin.readOnlyNotice') : t('chatAdmin.mutedNotice')}
          </p>
        )}
      </div>
    </>
  );
}

function MessageModMenu(props: {
  moderation: 'removed' | 'disabled' | null;
  onModerate: (kind: 'removed' | 'disabled' | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-6 w-6 items-center justify-center rounded-full text-on-surface-variant opacity-0 transition-opacity hover:bg-surface-container group-hover/msg:opacity-100"
        aria-label={t('chatAdmin.moderate')}
      >
        <span className="material-symbols-outlined text-base" aria-hidden>
          more_horiz
        </span>
      </button>
      {open ? (
        <>
          <button type="button" className="fixed inset-0 z-10" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute end-0 top-7 z-20 w-44 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest py-1 shadow-lg">
            {props.moderation ? (
              <MenuItem
                icon="restart_alt"
                label={t('chatAdmin.restoreMessage')}
                onClick={() => {
                  setOpen(false);
                  props.onModerate(null);
                }}
              />
            ) : (
              <>
                <MenuItem
                  icon="block"
                  danger
                  label={t('chatAdmin.removeMessage')}
                  onClick={() => {
                    setOpen(false);
                    props.onModerate('removed');
                  }}
                />
                <MenuItem
                  icon="visibility_off"
                  label={t('chatAdmin.disableMessage')}
                  onClick={() => {
                    setOpen(false);
                    props.onModerate('disabled');
                  }}
                />
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function MenuItem(props: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-start text-sm transition-colors hover:bg-surface-container',
        props.danger ? 'text-error' : 'text-on-surface',
      )}
    >
      <span className="material-symbols-outlined text-base" aria-hidden>
        {props.icon}
      </span>
      {props.label}
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────────
function NewConversationDialog(props: {
  open: boolean;
  kind: NewKind;
  setKind: (k: NewKind) => void;
  onClose: () => void;
  onCreate: (kind: NewKind, title: string | null, memberIds: string[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const { activeNurseryId } = useActiveNurseryId();
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const directory = useChatDirectory(search, activeNurseryId);
  const dn = (ar: string | null, en: string | null) =>
    i18n.language === 'ar' ? ar?.trim() || en?.trim() || '' : en?.trim() || ar?.trim() || '';

  const toggle = (id: string) => {
    if (props.kind === 'direct') {
      setPicked((p) => (p[0] === id ? [] : [id]));
    } else {
      setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    }
  };

  const canCreate = picked.length > 0 && (props.kind === 'direct' || picked.length >= 1);

  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-md flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t('chatAdmin.newTitle')}</DialogTitle>
          <DialogDescription>{t('chatAdmin.newHint')}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            {(['direct', 'group'] as NewKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  props.setKind(k);
                  setPicked([]);
                }}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                  props.kind === k
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-outline-variant text-on-surface-variant hover:bg-surface-container',
                )}
              >
                <span className="material-symbols-outlined text-base" aria-hidden>
                  {k === 'group' ? 'groups' : 'person'}
                </span>
                {t(`chatAdmin.kind.${k}`)}
              </button>
            ))}
          </div>

          {props.kind === 'group' ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('chatAdmin.groupNamePlaceholder')}
              className="h-10 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-primary"
            />
          ) : null}

          <div className="relative">
            <span className="material-symbols-outlined pointer-events-none absolute start-2.5 top-2.5 text-base text-on-surface-variant" aria-hidden>
              search
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('chatAdmin.searchPeople')}
              className="h-10 w-full rounded-xl border border-outline-variant bg-surface ps-9 pe-3 text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="max-h-64 space-y-1 overflow-y-auto">
            {(directory.data ?? []).map((p) => {
              const checked = picked.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-xl p-2 text-start transition-colors',
                    checked ? 'bg-primary/10' : 'hover:bg-surface-container',
                  )}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
                    <span className="material-symbols-outlined text-base" aria-hidden>
                      person
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-on-surface">{dn(p.name_ar, p.name_en)}</span>
                    <span className="block text-[11px] text-on-surface-variant">
                      {t(`chatAdmin.roles.${p.role}`, { defaultValue: p.role })}
                    </span>
                  </span>
                  {checked ? (
                    <span className="material-symbols-outlined text-primary" aria-hidden>
                      check_circle
                    </span>
                  ) : null}
                </button>
              );
            })}
            {(directory.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-xs text-on-surface-variant">{t('chatAdmin.noPeople')}</p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="mt-3 shrink-0 border-t border-outline-variant pt-3">
          <Button type="button" variant="outline" onClick={props.onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={!canCreate}
            onClick={() => props.onCreate(props.kind, props.kind === 'group' ? title.trim() || null : null, picked)}
          >
            {t('chatAdmin.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────────────────────
function ManageMembersDialog(props: {
  conversationId: string;
  canManage: boolean;
  onClose: () => void;
  onSetWrite: (memberId: string, value: boolean) => void;
  onRemove: (memberId: string) => void;
  onAdd: (memberIds: string[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const membersQuery = useChatMembers(props.conversationId);
  const members = membersQuery.data ?? [];
  const { activeNurseryId } = useActiveNurseryId();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const directory = useChatDirectory(search, activeNurseryId);
  const existingIds = new Set(members.map((m) => m.user_id));
  const dn = (ar: string | null, en: string | null) =>
    i18n.language === 'ar' ? ar?.trim() || en?.trim() || '' : en?.trim() || ar?.trim() || '';

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-md flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t('chatAdmin.manageMembers')}</DialogTitle>
          <DialogDescription>{t('chatAdmin.manageMembersHint')}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-2.5 rounded-xl p-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
                <span className="material-symbols-outlined text-base" aria-hidden>
                  person
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm text-on-surface">{dn(m.name_ar, m.name_en)}</span>
                  {m.is_admin ? (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      {t('chatAdmin.admin')}
                    </span>
                  ) : null}
                </span>
                <span className="block text-[11px] text-on-surface-variant">
                  {t(`chatAdmin.roles.${m.role}`, { defaultValue: m.role })}
                </span>
              </span>
              {props.canManage && !m.is_admin ? (
                <>
                  <label className="flex items-center gap-1.5 text-[11px] text-on-surface-variant" title={t('chatAdmin.canWrite')}>
                    <Checkbox checked={m.can_write} onCheckedChange={(v) => props.onSetWrite(m.user_id, v === true)} />
                    {t('chatAdmin.canWrite')}
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-on-surface-variant hover:bg-error/10 hover:text-error"
                    onClick={() => props.onRemove(m.user_id)}
                    aria-label={t('chatAdmin.removeMember')}
                  >
                    <span className="material-symbols-outlined text-base" aria-hidden>
                      person_remove
                    </span>
                  </Button>
                </>
              ) : null}
            </div>
          ))}

          {props.canManage ? (
            <div className="mt-2 border-t border-outline-variant pt-2">
              {!adding ? (
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setAdding(true)}>
                  <span className="material-symbols-outlined me-1 text-sm" aria-hidden>
                    person_add
                  </span>
                  {t('chatAdmin.addMembers')}
                </Button>
              ) : (
                <div className="space-y-1">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('chatAdmin.searchPeople')}
                    className="h-9 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-primary"
                  />
                  <div className="max-h-44 space-y-1 overflow-y-auto">
                    {(directory.data ?? [])
                      .filter((p) => !existingIds.has(p.id))
                      .map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => props.onAdd([p.id])}
                          className="flex w-full items-center gap-2 rounded-lg p-2 text-start hover:bg-surface-container"
                        >
                          <span className="material-symbols-outlined text-base text-on-surface-variant" aria-hidden>
                            person_add
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm text-on-surface">{dn(p.name_ar, p.name_en)}</span>
                          <span className="text-[11px] text-on-surface-variant">{t(`chatAdmin.roles.${p.role}`, { defaultValue: p.role })}</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter className="mt-3 shrink-0 border-t border-outline-variant pt-3">
          <Button type="button" variant="outline" onClick={props.onClose}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
