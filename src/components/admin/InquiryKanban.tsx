import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

type Props = {
  inquiries: Array<Record<string, unknown>>;
  onOpen: (row: Record<string, unknown>) => void;
  onStatusChange: (id: string, status: 'new' | 'contacted' | 'scheduled' | 'waitlisted' | 'enrolled' | 'declined') => void;
  onAssignToMe: (id: string) => void;
};

const statuses = ['new', 'contacted', 'scheduled', 'waitlisted', 'enrolled'] as const;

export function InquiryKanban({ inquiries, onOpen, onStatusChange, onAssignToMe }: Props) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-3 lg:grid-cols-5">
      {statuses.map((status) => (
        <section key={status} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2">
          <h3 className="mb-2 text-sm font-semibold text-on-surface">{t(`admissions.statuses.${status}`)}</h3>
          <div className="space-y-2">
            {inquiries
              .filter((r) => String(r.status) === status)
              .map((row) => {
                const days = Math.max(0, Math.floor((Date.now() - +new Date(String(row.created_at))) / 86400000));
                const age = Math.floor((Date.now() - +new Date(String(row.child_dob))) / (365.25 * 24 * 3600 * 1000));
                return (
                  <article key={String(row.id)} className="rounded-lg border border-outline-variant bg-surface text-foreground p-2 text-xs">
                    <p className="font-semibold text-on-surface">{String(row.parent_name)}</p>
                    <p className="text-on-surface-variant">{String(row.child_name)}</p>
                    <p className="text-on-surface-variant">{t('admissions.childAge')}: {age}</p>
                    <p className="text-on-surface-variant">{String(row.preferred_class ?? '-')}</p>
                    <p className="text-on-surface-variant">{t(`admissions.sources.${String(row.source ?? 'website')}`)}</p>
                    <p className="text-on-surface-variant">{t('admissions.daysSince')}: {days}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" onClick={() => onOpen(row)}>{t('invoice.actions.viewDetails')}</Button>
                      <Button size="sm" variant="outline" onClick={() => onAssignToMe(String(row.id))}>{t('admissions.assignToMe')}</Button>
                      <Button size="sm" onClick={() => onStatusChange(String(row.id), status === 'new' ? 'contacted' : status === 'contacted' ? 'scheduled' : status === 'scheduled' ? 'waitlisted' : 'enrolled')}>
                        {t('admissions.nextStatus')}
                      </Button>
                    </div>
                  </article>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
