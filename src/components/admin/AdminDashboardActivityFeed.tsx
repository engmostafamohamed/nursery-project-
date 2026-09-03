import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardFeedItem } from '@/hooks/useAdminDashboardActivityFeed';

type Props = {
  items: DashboardFeedItem[];
  isLoading: boolean;
};

function formatWhen(iso: string, locale: string): string {
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return '';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    dateStyle: 'short',
    timeStyle: 'short', hour12: true,
  }).format(new Date(d));
}

function iconFor(kind: DashboardFeedItem['kind']): string {
  switch (kind) {
    case 'child_enrolled':
      return 'child_care';
    case 'inquiry':
      return 'mail';
    case 'payment':
      return 'payments';
    case 'media':
      return 'photo_library';
    case 'daily_report':
      return 'description';
    case 'child_check_in':
      return 'how_to_reg';
    case 'event_created':
      return 'event';
  }
}

export function AdminDashboardActivityFeed({ items, isLoading }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  if (isLoading) {
    return (
      <div className="h-full max-h-[24rem] space-y-4 overflow-y-auto pe-2 xl:max-h-none">
        {[1, 2, 3, 4, 5].map((k) => (
          <div key={k} className="flex items-center gap-3 rounded-2xl bg-surface-container-low p-3">
            <Skeleton className="h-10 w-10 rounded-full" />
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
    return (
      <EmptyState
        icon="history"
        title={t('admin.dashboard.activityEmptyTitle')}
        description={t('admin.dashboard.activityFeedEmptyDescription')}
      />
    );
  }

  return (
    <ul className="h-full max-h-[24rem] space-y-3 overflow-y-auto pe-2 xl:max-h-none">
      {items.map((item) => {
        const when = formatWhen(item.at, locale);
        let primary = '';
        let secondary = '';

        switch (item.kind) {
          case 'child_enrolled':
            primary = t('admin.dashboard.feed.childEnrolled', {
              name: locale === 'ar' ? item.childNameAr : item.childNameEn,
            });
            break;
          case 'inquiry':
            primary = t('admin.dashboard.feed.inquiry', {
              parent: item.parentName,
              child: item.childName,
            });
            break;
          case 'payment':
            primary = t('admin.dashboard.feed.payment', {
              amount: new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
                style: 'currency',
                currency: 'EGP',
                maximumFractionDigits: 0,
              }).format(item.amount),
            });
            secondary =
              locale === 'ar'
                ? item.parentNameAr || item.parentNameEn
                : item.parentNameEn || item.parentNameAr;
            break;
          case 'media':
            primary = t('admin.dashboard.feed.media');
            secondary =
              locale === 'ar'
                ? item.uploaderNameAr || item.uploaderNameEn
                : item.uploaderNameEn || item.uploaderNameAr;
            break;
          case 'daily_report':
            primary = t('admin.dashboard.feed.dailyReport', {
              child: locale === 'ar' ? item.childNameAr : item.childNameEn,
            });
            secondary =
              locale === 'ar'
                ? item.teacherNameAr || item.teacherNameEn
                : item.teacherNameEn || item.teacherNameAr;
            break;
          case 'child_check_in':
            primary = t('admin.dashboard.feed.checkIn', {
              name: locale === 'ar' ? item.childNameAr : item.childNameEn,
            });
            break;
          case 'event_created':
            primary = t('admin.dashboard.feed.event', {
              title: locale === 'ar' ? item.titleAr : item.titleEn,
            });
            break;
        }

        return (
          <li
            key={`${item.kind}-${item.id}`}
            className="flex items-start gap-3 rounded-2xl bg-surface-container-low p-3"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-fixed text-primary">
              <span className="material-symbols-outlined text-lg" aria-hidden>
                {iconFor(item.kind)}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-on-surface">{primary}</p>
              {secondary ? <p className="text-xs text-on-surface-variant">{secondary}</p> : null}
              <p className="mt-0.5 text-xs text-on-surface-variant">{when}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
