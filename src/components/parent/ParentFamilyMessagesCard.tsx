import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { FamilyMessageDialog } from '@/components/family-messages/FamilyMessageView';
import { TableCard } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useMarkFamilyMessageRead, useParentFamilyMessages } from '@/hooks/useFamilyMessages';
import { useSenderLine } from '@/hooks/useSenderLine';
import { childrenOf, senderParts, type ParentFamilyMessage } from '@/lib/familyMessages';
import { cn, getUserInitials } from '@/lib/utils';

/**
 * The latest messages from the nursery's teachers and staff, unread first: who sent each (role,
 * title, department, class) and which children it is about. Shown only once there is one.
 */
export function ParentFamilyMessagesCard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const locale = lang.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const { user } = useAuthSession();
  const query = useParentFamilyMessages(user?.id);
  const markRead = useMarkFamilyMessageRead(user?.id);
  const senderLine = useSenderLine();
  const [open, setOpen] = useState<ParentFamilyMessage | null>(null);

  const messages = query.data ?? [];
  if (query.isPending) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (!messages.length) return null;

  const unread = messages.filter((m) => !m.read_at).length;
  const shown = [...messages].sort((a, b) => Number(Boolean(a.read_at)) - Number(Boolean(b.read_at))).slice(0, 4);

  return (
    <>
      <TableCard
        title={t('familyMessages.parentCard.title')}
        count={unread ? t('familyMessages.parentCard.unread', { count: unread }) : undefined}
        description={t('familyMessages.parentCard.description')}
        actions={
          <Link to="/parent/inbox?filter=staff" className="text-sm font-medium text-primary hover:underline">
            {t('familyMessages.parentCard.viewAll')}
          </Link>
        }
      >
        <ul className="divide-y divide-outline-variant">
          {shown.map((message) => {
            const parts = senderParts(message, lang);
            return (
              <li key={message.message_id}>
                <button
                  type="button"
                  onClick={() => setOpen(message)}
                  className={cn(
                    'flex w-full items-start gap-3 border-s-4 px-4 py-3 text-start outline-none transition-colors hover:bg-surface-container-lowest focus-visible:bg-surface-container-lowest sm:px-5',
                    message.read_at ? 'border-s-transparent' : 'border-s-primary',
                  )}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {getUserInitials(parts.name ?? '', null)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-3">
                      <span className={cn('min-w-0 truncate text-sm text-on-surface', message.read_at ? 'font-semibold' : 'font-bold')}>
                        {!message.read_at ? <span className="me-1.5 inline-block h-2 w-2 rounded-full bg-primary align-middle" aria-hidden /> : null}
                        {parts.name ?? t('familyMessages.unknownSender')}
                      </span>
                      <time dateTime={message.created_at} className="shrink-0 text-xs text-on-surface-variant">
                        {new Date(message.created_at).toLocaleString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
                      </time>
                    </span>
                    <span className="block truncate text-xs font-medium text-primary">{senderLine(message)}</span>
                    <span className="mt-0.5 line-clamp-2 block text-sm text-on-surface-variant">{message.body}</span>
                    <span className="mt-1 flex items-center gap-1 text-xs text-on-surface-variant">
                      <MaterialSymbol name="child_care" className="text-sm" />
                      {childrenOf(message, lang)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </TableCard>
      <FamilyMessageDialog message={open} onClose={() => setOpen(null)} onRead={(id) => markRead.mutate(id)} />
    </>
  );
}
