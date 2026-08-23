import type { AdminInAppNotificationRow } from '@/hooks/useAdminInAppNotifications';
import {
  adminNotificationMaterialIcon,
  formatNotificationRelativeTime,
} from '@/lib/adminNotificationUtils';
import { cn } from '@/lib/utils';

type Props = {
  item: AdminInAppNotificationRow;
  title: string;
  body: string;
  lang: string;
  rowAriaLabel: string;
  onRowClick: () => void;
  onDeleteClick: (e: React.MouseEvent) => void;
  deleteLabel: string;
};

export function AdminNotificationListItem({
  item,
  title,
  body,
  lang,
  rowAriaLabel,
  onRowClick,
  onDeleteClick,
  deleteLabel,
}: Props) {
  const icon = adminNotificationMaterialIcon(item.type);
  const time = formatNotificationRelativeTime(item.sent_at, lang);

  return (
    <div
      className={cn(
        'flex gap-3 rounded-2xl border border-outline-variant p-4 transition-colors',
        item.read ? 'bg-surface-container' : 'bg-surface-container-lowest',
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 gap-3 text-start"
        onClick={onRowClick}
        aria-label={rowAriaLabel}
      >
        <span
          className="material-symbols-outlined mt-0.5 shrink-0 text-xl text-primary"
          aria-hidden
        >
          {icon}
        </span>
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
