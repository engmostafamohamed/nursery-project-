import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChatPanel } from '@/components/chat/ChatPanel';
import { useUnreadMessagesCount } from '@/hooks/useUnreadMessagesCount';
import { cn } from '@/lib/utils';
import type { ChatRole } from '@/types/chat';

interface ChatWidgetProps {
  role: ChatRole;
  currentUserId: string | undefined;
  nurseryId: string | null;
  languagePref: 'ar' | 'en' | 'both';
}

/**
 * Global floating chat launcher. Renders a FAB with an unread badge in every
 * role layout; opening it reveals the full ChatPanel (inbox + thread + the
 * name/role recipient picker) in a docked panel.
 */
export function ChatWidget({ role, currentUserId, nurseryId, languagePref }: ChatWidgetProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: unreadCount = 0 } = useUnreadMessagesCount(currentUserId);

  if (!currentUserId) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('chat.launcherLabel')}
        className={cn(
          'fixed bottom-24 end-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-ambient transition-transform hover:scale-105 md:bottom-6',
        )}
      >
        <span className="material-symbols-outlined text-2xl" aria-hidden>
          {open ? 'close' : 'forum'}
        </span>
        {!open && unreadCount > 0 ? (
          <span className="absolute -end-0.5 -top-0.5 min-w-[1.25rem] rounded-full bg-error px-1 text-center text-[11px] font-semibold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label={t('common.close')}
            className="fixed inset-0 z-40 bg-black/30 md:bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              'fixed inset-x-2 bottom-20 top-16 z-50 flex flex-col gap-2',
              'md:inset-auto md:bottom-24 md:end-6 md:h-[560px] md:w-[680px]',
            )}
          >
            <div className="flex items-center justify-between rounded-2xl border border-outline-variant bg-surface px-4 py-2 shadow-sm">
              <span className="text-sm font-semibold text-on-surface">{t('chat.inboxTitle')}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('common.close')}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-high"
              >
                <span className="material-symbols-outlined text-base" aria-hidden>
                  close
                </span>
              </button>
            </div>
            <ChatPanel
              role={role}
              currentUserId={currentUserId}
              nurseryId={nurseryId}
              languagePref={languagePref}
              className="min-h-0 flex-1 shadow-ambient"
            />
          </div>
        </>
      ) : null}
    </>
  );
}
