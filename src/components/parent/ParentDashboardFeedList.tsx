import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import type { ParentDashboardFeedItem } from '@/hooks/useParentDashboardFeed';
import { dayHeading, groupByDay } from '@/lib/dayGroups';
import { formatMoneyAmount } from '@/lib/money';
import { cn } from '@/lib/utils';

type Props = {
  items: ParentDashboardFeedItem[];
  isLoading: boolean;
};

/** Recent updates for the family, grouped under Today / Yesterday / date headings. */
export function ParentDashboardFeedList({ items, isLoading }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const locale = isAr ? 'ar-EG' : 'en-GB';

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((k) => (
          <Skeleton key={k} className="h-16 w-full rounded-xl" />
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

  const describe = (item: ParentDashboardFeedItem): { primary: string; to: string; icon: string; tile: string } => {
    switch (item.kind) {
      case 'daily_report':
        return {
          icon: 'description',
          tile: 'bg-primary/10 text-primary',
          primary: t('parent.dashboard.feed.report', { name: isAr ? item.childNameAr : item.childNameEn }),
          to: `/parent/daily-reports?child=${item.childId}&date=${item.reportDate}`,
        };
      case 'media':
        return {
          icon: 'photo_library',
          tile: 'bg-warning/10 text-warning',
          primary: item.caption?.trim() ? t('parent.dashboard.feed.mediaCaption', { caption: item.caption }) : t('parent.dashboard.feed.media'),
          to: '/parent/media',
        };
      case 'event_invite':
        return {
          icon: 'event',
          tile: 'bg-primary/10 text-primary',
          primary: t('parent.dashboard.feed.event', { title: isAr ? item.titleAr : item.titleEn }),
          to: `/parent/events/${item.eventId}`,
        };
      case 'invoice':
        return {
          icon: 'payments',
          tile: 'bg-error/10 text-error',
          primary: t('parent.dashboard.feed.invoice', { amount: t('invoice.egpAmount', { amount: formatMoneyAmount(item.amount) }) }),
          to: `/parent/invoices/${item.id}`,
        };
      case 'application_status':
        return {
          icon: item.status === 'approved' ? 'verified' : item.status === 'rejected' ? 'block' : 'upload_file',
          tile:
            item.status === 'approved'
              ? 'bg-success/10 text-success'
              : item.status === 'rejected'
                ? 'bg-error/10 text-error'
                : 'bg-primary/10 text-primary',
          primary: t(`parent.dashboard.feed.application.${item.status}`, { name: item.childName || t('common.parent') }),
          to: `/parent/applications/${item.id}`,
        };
    }
  };

  const groups = groupByDay(items, (item) => item.at);

  return (
    <div className="max-h-[560px] overflow-y-auto rounded-xl border border-outline-variant bg-surface shadow-sm">
      {groups.map((group) => (
        <section key={group.key}>
          <h3 className="sticky top-0 border-b border-outline-variant bg-surface-container-lowest px-4 py-2 text-xs font-semibold text-on-surface-variant">
            {dayHeading(group.key, locale, { today: t('common.today'), yesterday: t('common.yesterday') })}
          </h3>
          <ul className="divide-y divide-outline-variant">
            {group.items.map((item) => {
              const { primary, to, icon, tile } = describe(item);
              return (
                <li key={`${item.kind}-${item.id}`}>
                  <Link to={to} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-container-lowest">
                    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', tile)} aria-hidden>
                      <span className="material-symbols-outlined text-xl">{icon}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-on-surface">{primary}</span>
                      <span className="mt-0.5 block text-xs tabular-nums text-on-surface-variant">
                        {new Date(item.at).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true })}
                      </span>
                    </span>
                    <span className="material-symbols-outlined shrink-0 text-on-surface-variant transition group-hover:text-primary rtl:rotate-180" aria-hidden>
                      chevron_right
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
