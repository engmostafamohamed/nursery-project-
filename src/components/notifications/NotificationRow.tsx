import { useTranslation } from 'react-i18next';

import { StatusPill, Td, Tr } from '@/components/ui/DataTable';
import { cn } from '@/lib/utils';

/**
 * One notification in a notifications table (the family's and the staff's): its icon or photo, the
 * title and text, when it came, read or not, and delete. An urgent one is marked in red. The row
 * opens it.
 */
export function NotificationRow({
  icon,
  photoUrl = null,
  urgent = false,
  read,
  title,
  body,
  time,
  onOpen,
  onDelete,
  deleteLabel,
  readLabel,
  unreadLabel,
}: {
  icon: string;
  photoUrl?: string | null;
  urgent?: boolean;
  read: boolean;
  title: string;
  body: string;
  time: string;
  onOpen: () => void;
  onDelete: () => void;
  deleteLabel: string;
  readLabel: string;
  unreadLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <Tr onClick={onOpen} className={cn(urgent ? 'bg-error/5' : !read && 'bg-primary/5')} data-testid="notification-row">
      <Td className="w-12">
        {photoUrl ? (
          <img src={photoUrl} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-outline-variant" loading="lazy" decoding="async" />
        ) : (
          <span className={cn('material-symbols-outlined text-xl', urgent ? 'text-error' : 'text-primary')} aria-hidden>
            {urgent ? 'priority_high' : icon}
          </span>
        )}
      </Td>
      <Td className="min-w-[16rem]">
        <span className={cn('block text-on-surface', !read && 'font-semibold')}>{title}</span>
        {body ? <span className="mt-0.5 line-clamp-2 block text-xs text-on-surface-variant">{body}</span> : null}
      </Td>
      <Td className="whitespace-nowrap text-xs text-on-surface-variant">{time}</Td>
      <Td>
        <StatusPill tone={read ? 'neutral' : 'primary'}>{read ? readLabel : unreadLabel}</StatusPill>
      </Td>
      <Td align="end">
        <button
          type="button"
          className="material-symbols-outlined rounded-lg p-2 text-on-surface-variant hover:bg-surface-container hover:text-error"
          aria-label={deleteLabel}
          title={deleteLabel || t('common.delete')}
          onClick={onDelete}
        >
          delete
        </button>
      </Td>
    </Tr>
  );
}
