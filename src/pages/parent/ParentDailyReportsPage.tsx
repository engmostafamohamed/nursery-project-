import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ParentReportDetailModal } from '@/components/parent/ParentReportDetailModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useParentReports, type ParentReportItem } from '@/hooks/useParentReports';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';

export function ParentDailyReportsPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const [searchParams, setSearchParams] = useSearchParams();
  const [childId, setChildId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [active, setActive] = useState<ParentReportItem | null>(null);

  const reports = useParentReports({
    parentId: user?.id,
    nurseryId: profile?.nursery_id ?? undefined,
    childId: childId || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    sort,
  });

  useEffect(() => {
    const child = searchParams.get('child');
    const date = searchParams.get('date');
    const updates: { childId?: string; active?: ParentReportItem | null } = {};
    if (child) updates.childId = child;
    if (child && date && reports.reports.length) {
      const found = reports.reports.find((r) => r.childId === child && r.reportDate === date);
      if (found) updates.active = found;
    }
    if (updates.childId !== undefined) setChildId(updates.childId);
    if (updates.active !== undefined) setActive(updates.active);
  }, [searchParams, reports.reports]);

  const markRead = async () => {
    if (!user?.id) return;
    await supabase
      .from('notifications')
      .update({ read: true } as never)
      .eq('user_id', user.id)
      .eq('type', 'daily_report_published')
      .eq('read', false);
  };

  useEffect(() => {
    if (active) void markRead();
  }, [active]);

  const grouped = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yesterday = y.toISOString().slice(0, 10);
    const oneWeek = new Date();
    oneWeek.setDate(oneWeek.getDate() - 7);
    const result: Record<string, ParentReportItem[]> = { today: [], yesterday: [], thisWeek: [], earlier: [] };
    reports.reports.forEach((r) => {
      if (r.reportDate === today) result.today.push(r);
      else if (r.reportDate === yesterday) result.yesterday.push(r);
      else if (new Date(r.reportDate) >= oneWeek) result.thisWeek.push(r);
      else result.earlier.push(r);
    });
    return result;
  }, [reports.reports]);

  const activeIndex = useMemo(() => (active ? reports.reports.findIndex((r) => r.id === active.id) : -1), [active, reports.reports]);

  return (
    <div className="space-y-4 pb-28">
      <h1 className="flex items-center gap-2 text-lg font-semibold text-on-surface">
        <MaterialSymbol name="assignment" className="text-primary" size="text-2xl" />
        {t('parent.reports.title')}
      </h1>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('parent.reports.stats.thisWeek')}</p><p className="text-base font-semibold">{reports.stats.thisWeek}</p></div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('parent.reports.stats.thisMonth')}</p><p className="text-base font-semibold">{reports.stats.thisMonth}</p></div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('parent.reports.stats.lastReport')}</p><p className="text-xs font-semibold">{reports.stats.lastReportDate ?? '-'}</p></div>
      </div>

      <div className="grid gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 md:grid-cols-4">
        {reports.children.length > 1 ? (
          <select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={childId} onChange={(e) => setChildId(e.target.value)}>
            <option value="">{t('parent.reports.allChildren')}</option>
            {reports.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : <div />}
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={sort} onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')}>
          <option value="newest">{t('parent.reports.sortNewest')}</option>
          <option value="oldest">{t('parent.reports.sortOldest')}</option>
        </select>
      </div>

      {!reports.reports.length ? (
        <EmptyState icon="description" title={t('parent.reports.emptyTitle')} description={t('parent.reports.emptyDescription')} />
      ) : (
        (['today', 'yesterday', 'thisWeek', 'earlier'] as const).map((key) => (
          grouped[key].length ? (
            <section key={key} className="space-y-2">
              <h2 className="text-sm font-semibold text-on-surface">{t(`parent.reports.groups.${key}`)}</h2>
              {grouped[key].map((r) => (
                <article key={r.id} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>{r.childName.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <p className="font-medium text-on-surface">{r.childName}</p>
                  </div>
                  <p className="text-xs text-on-surface-variant">{r.reportDate}</p>
                  <p className="text-xs text-on-surface-variant">{String(r.mood.mood ?? '-')} - {t('parent.reports.quickSummary')}</p>
                  <button
                    type="button"
                    className="mt-2 text-sm text-primary underline"
                    onClick={() => {
                      setActive(r);
                      setSearchParams({ child: r.childId, date: r.reportDate });
                    }}
                  >
                    {t('parent.reports.viewFull')}
                  </button>
                </article>
              ))}
            </section>
          ) : null
        ))
      )}

      <ParentReportDetailModal
        open={Boolean(active)}
        report={active}
        reaction={active ? reports.reactions.find((x) => x.report_id === active.id) : undefined}
        onOpenChange={(open) => {
          if (!open) {
            setActive(null);
            setSearchParams((prev) => {
              prev.delete('child');
              prev.delete('date');
              return prev;
            });
          }
        }}
        onPrev={() => { if (activeIndex > 0) setActive(reports.reports[activeIndex - 1]); }}
        onNext={() => { if (activeIndex >= 0 && activeIndex < reports.reports.length - 1) setActive(reports.reports[activeIndex + 1]); }}
        onReact={(payload) => (active ? reports.saveReaction({ reportId: active.id, ...payload }) : Promise.resolve())}
      />
    </div>
  );
}
