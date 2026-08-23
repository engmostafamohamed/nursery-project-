import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useWaitlist } from '@/hooks/useWaitlist';

export function AdminWaitlistPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const waitlist = useWaitlist(profile?.nursery_id ?? undefined);

  const grouped = useMemo(() => {
    const map = new Map<string, Array<Record<string, unknown>>>();
    for (const row of waitlist.waitlist) {
      const classObj = (row.classes as Record<string, unknown> | null) ?? {};
      const className = String(classObj.name_ar ?? classObj.name_en ?? 'Class');
      const arr = map.get(className) ?? [];
      arr.push(row);
      map.set(className, arr);
    }
    return [...map.entries()];
  }, [waitlist.waitlist]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-on-surface">{t('admissions.waitlistTitle')}</h1>
      {!grouped.length ? (
        <EmptyState icon="hourglass" title={t('admissions.waitlistEmptyTitle')} description={t('admissions.waitlistEmptyDescription')} />
      ) : (
        grouped.map(([className, rows]) => (
          <section key={className} className="space-y-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
            <h3 className="text-sm font-semibold text-on-surface">{className}</h3>
            {rows
              .sort((a, b) => Number(a.position) - Number(b.position))
              .map((row) => {
                const inquiry = (row.inquiries as Record<string, unknown> | null) ?? {};
                const days = Math.max(0, Math.floor((Date.now() - +new Date(String(row.added_at))) / 86400000));
                return (
                  <article key={String(row.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-outline-variant bg-surface text-foreground p-2 text-sm">
                    <div>
                      <p className="font-medium text-on-surface">#{String(row.position)} - {String(inquiry.parent_name ?? '-')}</p>
                      <p className="text-xs text-on-surface-variant">{String(inquiry.parent_phone ?? '-')} • {t('admissions.daysOnWaitlist')}: {days}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" onClick={() => void waitlist.reorderWaitlist({ id: String(row.id), classId: String(row.class_id), direction: 'up' })}>↑</Button>
                      <Button size="sm" variant="outline" onClick={() => void waitlist.reorderWaitlist({ id: String(row.id), classId: String(row.class_id), direction: 'down' })}>↓</Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void waitlist.notifyOpening({ waitlistId: String(row.id), inquiry, className }).then(() => toast.success(t('admissions.openingNotified')))}
                      >
                        {t('admissions.notifyOpening')}
                      </Button>
                      <Button size="sm" onClick={() => toast.message(t('common.comingSoon'))}>{t('admissions.convertToApplication')}</Button>
                    </div>
                  </article>
                );
              })}
          </section>
        ))
      )}
    </div>
  );
}
