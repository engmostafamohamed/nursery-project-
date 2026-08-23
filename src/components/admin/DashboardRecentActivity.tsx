import { useTranslation } from 'react-i18next';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardActivityItem } from '@/hooks/useAdminDashboardActivity';

type Props = {
  items: DashboardActivityItem[];
  isLoading: boolean;
};

function formatActivityTime(iso: string, locale: string): string {
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return '';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    hour: 'numeric',
    minute: '2-digit', hour12: true,
  }).format(new Date(d));
}

export function DashboardRecentActivity({ items, isLoading }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((k) => (
          <div key={k} className="flex items-center gap-3 rounded-2xl bg-surface-container-low p-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!items.length) {
    return <EmptyState icon="history" title={t('admin.dashboard.activityEmptyTitle')} description={t('admin.dashboard.activityEmptyDescription')} />;
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        if (item.kind === 'child_check_in') {
          const childName = locale === 'ar' ? item.childNameAr : item.childNameEn;
          const time = formatActivityTime(item.at, locale);
          const label = t('admin.dashboard.activityCheckIn', { name: childName, time });
          return (
            <div key={`a-${item.id}`} className="flex items-center gap-3 rounded-2xl bg-surface-container-low p-3">
              <Avatar className="h-10 w-10">
                <AvatarImage
                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(childName)}&background=eceef0&color=191c1e`}
                  alt=""
                />
                <AvatarFallback>{childName.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-on-surface">{label}</p>
              </div>
            </div>
          );
        }
        const title = locale === 'ar' ? item.titleAr : item.titleEn;
        const time = formatActivityTime(item.at, locale);
        return (
          <div key={`e-${item.id}`} className="flex items-center gap-3 rounded-2xl bg-surface-container-low p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-fixed text-primary">
              <span className="material-symbols-outlined text-lg" aria-hidden>
                event
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-on-surface">{t('admin.dashboard.activityEvent', { title })}</p>
              <p className="text-xs text-on-surface-variant">{time}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
