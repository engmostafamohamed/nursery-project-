import type { ParentInAppNotificationRow } from '@/hooks/useParentInAppNotifications';
import {
  formatNotificationRelativeTime,
  parentNotificationMaterialIcon,
} from '@/lib/parentNotificationUtils';
import { cn } from '@/lib/utils';

type Props = {
  item: ParentInAppNotificationRow;
  title: string;
  body: string;
  lang: string;
  rowAriaLabel: string;
  onRowClick: () => void;
  onDeleteClick: (e: React.MouseEvent) => void;
  deleteLabel: string;
};

export function ParentNotificationListItem({
  item,
  title,
  body,
  lang,
  rowAriaLabel,
  onRowClick,
  onDeleteClick,
  deleteLabel,
}: Props) {
  const icon = parentNotificationMaterialIcon(item.type);
  const time = formatNotificationRelativeTime(item.sent_at, lang);
  const isHighUrgency = item.urgency === 'high';
  const photoUrl = item.image_url?.trim() || null;

  return (
    <div
      className={cn(
        'flex gap-3 rounded-2xl border p-4 transition-colors',
        isHighUrgency
          ? 'border-error/60 bg-error/5 ring-1 ring-error/40'
          : 'border-outline-variant',
        item.read && !isHighUrgency ? 'bg-surface-container' : '',
        !item.read && !isHighUrgency ? 'bg-surface-container-lowest' : '',
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 gap-3 text-start"
        onClick={onRowClick}
        aria-label={rowAriaLabel}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="mt-0.5 h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-outline-variant"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span
            className={cn(
              'material-symbols-outlined mt-0.5 shrink-0 text-xl',
              isHighUrgency ? 'text-error' : 'text-primary',
            )}
            aria-hidden
          >
            {isHighUrgency ? 'priority_high' : icon}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-2">
            {!item.read ? (
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="text-sm font-semibold text-on-surface">{title}</span>
              <p className="mt-1 text-sm text-on-surface-variant">{body}</p>
              <p className="mt-2 text-xs text-on-surface-variant">{time}</p>
            </span>
          </span>
        </span>
      </button>
      <button
        type="button"
        className="material-symbols-outlined shrink-0 rounded-lg p-2 text-on-surface-variant hover:bg-surface-container"
        aria-label={deleteLabel}
        onClick={onDeleteClick}
      >
        delete
      </button>
    </div>
  );
}
