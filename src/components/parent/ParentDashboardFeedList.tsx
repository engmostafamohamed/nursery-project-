import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/datetime';
import type { ParentDashboardFeedItem } from '@/hooks/useParentDashboardFeed';

type Props = {
  items: ParentDashboardFeedItem[];
  isLoading: boolean;
};

export function ParentDashboardFeedList({ items, isLoading }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((k) => (
          <Skeleton key={k} className="h-16 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <EmptyState
        icon="notifications"
        title={t('parent.dashboard.feed.emptyTitle')}
        description={t('parent.dashboard.feed.emptyDescription')}
      />
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const when = formatDateTime(item.at, { dateStyle: 'medium', timeStyle: 'short', hour12: true });
        let primary = '';
        let to = '';
        let icon = 'notifications';

        switch (item.kind) {
          case 'daily_report':
            icon = 'description';
            primary = t('parent.dashboard.feed.report', {
              name: locale === 'ar' ? item.childNameAr : item.childNameEn,
            });
            to = `/parent/daily-reports?child=${item.childId}&date=${item.reportDate}`;
            break;
          case 'media':
            icon = 'photo_library';
            primary = item.caption?.trim()
              ? t('parent.dashboard.feed.mediaCaption', { caption: item.caption })
              : t('parent.dashboard.feed.media');
            to = '/parent/media';
            break;
          case 'event_invite':
            icon = 'event';
            primary = t('parent.dashboard.feed.event', {
              title: locale === 'ar' ? item.titleAr : item.titleEn,
            });
            to = `/parent/events/${item.eventId}`;
            break;
          case 'invoice':
            icon = 'payments';
            primary = t('parent.dashboard.feed.invoice', {
              amount: new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
                style: 'currency',
                currency: 'EGP',
                maximumFractionDigits: 0,
              }).format(item.amount),
            });
            to = `/parent/invoices/${item.id}`;
            break;
        }

        return (
          <li key={`${item.kind}-${item.id}`}>
            <Link
              to={to}
              className="flex items-start gap-3 rounded-2xl border border-outline-variant bg-surface text-foreground p-3 transition-colors hover:bg-surface-container"
            >
              <span className="material-symbols-outlined mt-0.5 shrink-0 text-primary" aria-hidden>
                {icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-on-surface">{primary}</span>
                <span className="mt-0.5 block text-xs text-on-surface-variant">{when}</span>
              </span>
              <span className="material-symbols-outlined shrink-0 text-on-surface-variant rtl:rotate-180" aria-hidden>
                chevron_right
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
