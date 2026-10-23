import { useTranslation } from 'react-i18next';

import { TableEmpty } from '@/components/ui/DataTable';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardFeedItem } from '@/hooks/useAdminDashboardActivityFeed';
import { dayHeading, groupByDay } from '@/lib/dayGroups';
import { formatMoneyAmount } from '@/lib/money';
import { cn } from '@/lib/utils';

type Props = {
  items: DashboardFeedItem[];
  isLoading: boolean;
};

const KIND_STYLE: Record<DashboardFeedItem['kind'], { icon: string; tile: string }> = {
  child_enrolled: { icon: 'child_care', tile: 'bg-success/10 text-success' },
  inquiry: { icon: 'mail', tile: 'bg-primary/10 text-primary' },
  payment: { icon: 'payments', tile: 'bg-success/10 text-success' },
  media: { icon: 'photo_library', tile: 'bg-warning/10 text-warning' },
  daily_report: { icon: 'description', tile: 'bg-primary/10 text-primary' },
  child_check_in: { icon: 'how_to_reg', tile: 'bg-success/10 text-success' },
  event_created: { icon: 'event', tile: 'bg-warning/10 text-warning' },
};

/** Recent activity across the nursery, grouped under Today / Yesterday / date headings. */
export function AdminDashboardActivityFeed({ items, isLoading }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const locale = isAr ? 'ar-EG' : 'en-GB';

  if (isLoading) {
    return (
      <div className="space-y-3 p-4 sm:p-5">
        {[1, 2, 3, 4, 5].map((k) => (
          <div key={k} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!items.length) {
    return <TableEmpty icon="history" title={t('admin.dashboard.activityEmptyTitle')} description={t('admin.dashboard.activityFeedEmptyDescription')} />;
  }

  const describe = (item: DashboardFeedItem): { primary: string; secondary: string } => {
    switch (item.kind) {
      case 'child_enrolled':
        return { primary: t('admin.dashboard.feed.childEnrolled', { name: isAr ? item.childNameAr : item.childNameEn }), secondary: '' };
      case 'inquiry':
        return { primary: t('admin.dashboard.feed.inquiry', { parent: item.parentName, child: item.childName }), secondary: '' };
      case 'payment':
        return {
          primary: t('admin.dashboard.feed.payment', { amount: t('invoice.egpAmount', { amount: formatMoneyAmount(item.amount) }) }),
          secondary: isAr ? item.parentNameAr || item.parentNameEn : item.parentNameEn || item.parentNameAr,
        };
      case 'media':
        return {
          primary: t('admin.dashboard.feed.media'),
          secondary: isAr ? item.uploaderNameAr || item.uploaderNameEn : item.uploaderNameEn || item.uploaderNameAr,
        };
      case 'daily_report':
        return {
          primary: t('admin.dashboard.feed.dailyReport', { child: isAr ? item.childNameAr : item.childNameEn }),
          secondary: isAr ? item.teacherNameAr || item.teacherNameEn : item.teacherNameEn || item.teacherNameAr,
        };
      case 'child_check_in':
        return { primary: t('admin.dashboard.feed.checkIn', { name: isAr ? item.childNameAr : item.childNameEn }), secondary: '' };
      case 'event_created':
        return { primary: t('admin.dashboard.feed.event', { title: isAr ? item.titleAr : item.titleEn }), secondary: '' };
    }
  };

  const groups = groupByDay(items, (item) => item.at);
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <div>
      {groups.map((group) => (
        <section key={group.key}>
          <h3 className="border-b border-outline-variant bg-surface-container-lowest px-4 py-2 text-xs font-semibold text-on-surface-variant sm:px-5">
            {dayHeading(group.key, locale, { today: t('common.today'), yesterday: t('common.yesterday') })}
          </h3>
          <ul className="divide-y divide-outline-variant">
            {group.items.map((item) => {
              const { primary, secondary } = describe(item);
              const style = KIND_STYLE[item.kind];
              return (
                <li key={`${item.kind}-${item.id}`} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', style.tile)} aria-hidden>
                    <span className="material-symbols-outlined text-xl">{style.icon}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-on-surface">{primary}</p>
                    {secondary ? <p className="mt-0.5 truncate text-xs text-on-surface-variant">{secondary}</p> : null}
                  </div>
                  <span className="shrink-0 pt-0.5 text-xs tabular-nums text-on-surface-variant">{time(item.at)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
