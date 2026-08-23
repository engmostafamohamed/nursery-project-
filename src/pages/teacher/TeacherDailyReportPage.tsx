import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Pagination } from '@/components/ui/Pagination';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useDailyReports } from '@/hooks/useDailyReports';
import { usePagination } from '@/hooks/usePagination';
import { useUserProfile } from '@/hooks/useUserProfile';

const todayStr = () => new Date().toISOString().slice(0, 10);

export function TeacherDailyReportPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const daily = useDailyReports({ userId: user?.id, nurseryId: profile?.nursery_id ?? undefined });

  const [status, setStatus] = useState<'all' | 'draft' | 'published'>('all');
  const [classId, setClassId] = useState('');
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return daily.list.filter((r) => {
      const reportDate = String(r.report_date ?? '');
      const childName = daily.childNameMap.get(String(r.child_id ?? '')) ?? '';
      const childClass = daily.children.find((c) => c.id === String(r.child_id ?? ''))?.class_id ?? '';
      if (status !== 'all' && String(r.status) !== status) return false;
      if (classId && childClass !== classId) return false;
      if (fromDate && reportDate < fromDate) return false;
      if (toDate && reportDate > toDate) return false;
      if (search && !childName.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [daily.list, daily.childNameMap, daily.children, status, classId, fromDate, toDate, search]);

  const pager = usePagination(filtered, 20, `${status}|${classId}|${fromDate}|${toDate}|${search}`);

  const publishDraft = async (item: Record<string, unknown>) => {
    try {
      const childId = String(item.child_id ?? '');
      const id = String(item.id ?? '');
      if (!childId || !id) return;
      await daily.publishDraftById({ id, childId });
      toast.success(t('reports.daily.published'));
    } catch {
      toast.error(t('reports.daily.actionError'));
    }
  };

  const newReportPath = () => {
    const first = daily.children[0]?.id;
    if (!first) return null;
    return `/teacher/daily-reports/${first}/${todayStr()}`;
  };

  const path = newReportPath();

  return (
    <div className="space-y-4 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MaterialSymbol name="assignment" className="text-primary" size="text-2xl" />
          <h1 className="text-lg font-semibold text-on-surface">{t('reports.daily.listTitle')}</h1>
        </div>
        {path ? (
          <Button asChild>
            <Link to={path}>{t('reports.daily.createNew')}</Link>
          </Button>
        ) : (
          <Button type="button" disabled>
            {t('reports.daily.createNew')}
          </Button>
        )}
      </div>

      <p className="text-xs text-on-surface-variant">{t('reports.daily.todayListHint')}</p>

      <div className="grid gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 md:grid-cols-5">
        <Input placeholder={t('reports.daily.searchChild')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select
          className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        >
          <option value="">{t('reports.daily.filterClass')}</option>
          {daily.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name_ar || c.name_en}
            </option>
          ))}
        </select>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <select
          className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as 'all' | 'draft' | 'published')}
        >
          <option value="all">{t('reports.daily.status.all')}</option>
          <option value="draft">{t('reports.daily.status.draft')}</option>
          <option value="published">{t('reports.daily.status.published')}</option>
        </select>
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => {
          setFromDate('');
          setToDate('');
        }}>
          {t('reports.daily.clearDates')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const t = todayStr();
            setFromDate(t);
            setToDate(t);
          }}
        >
          {t('reports.daily.todayOnly')}
        </Button>
      </div>

      {!filtered.length ? (
        <EmptyState icon="assignment" title={t('reports.daily.emptyTitle')} description={t('reports.daily.emptyDescription')} />
      ) : (
        <ul className="space-y-2">
          {pager.pageItems.map((item) => {
            const childId = String(item.child_id ?? '');
            const date = String(item.report_date ?? '');
            const mood = String((item.mood_json as Record<string, unknown> | null)?.mood ?? '-');
            const nap = (item.nap_json as Record<string, unknown> | null)?.duration_minutes ?? '-';
            const statusValue = String(item.status ?? 'draft');
            return (
              <li key={String(item.id)}>
                <article className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-on-surface">
                        {daily.childNameMap.get(childId) ?? t('reports.daily.unknownChild')}
                      </p>
                      <p className="text-xs text-on-surface-variant">{date}</p>
                      <p className="text-xs text-on-surface-variant">{t('reports.daily.quickStats', { mood, nap })}</p>
                      {(daily.reactionsCountMap.get(String(item.id)) ?? 0) > 0 ? (
                        <p className="text-xs text-on-surface-variant">
                          {t('reports.daily.parentFeedback', { count: daily.reactionsCountMap.get(String(item.id)) ?? 0 })}
                          {daily.latestReactionCommentMap.get(String(item.id))
                            ? ` — ${daily.latestReactionCommentMap.get(String(item.id))}`
                            : ''}
                        </p>
                      ) : null}
                    </div>
                    <span className="rounded-full bg-surface-container px-2 py-0.5 text-xs">
                      {t(`reports.daily.status.${statusValue}`)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/teacher/daily-reports/${childId}/${date}`}>{t('reports.daily.edit')}</Link>
                    </Button>
                    {statusValue === 'draft' ? (
                      <>
                        <Button size="sm" onClick={() => void publishDraft(item)}>
                          {t('reports.daily.publish')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void daily.deleteDraftReport(String(item.id))}>
                          {t('reports.daily.delete')}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </article>
              </li>
            );
          })}
          <Pagination
            page={pager.page}
            pageCount={pager.pageCount}
            total={pager.total}
            startIndex={pager.startIndex}
            endIndex={pager.endIndex}
            hasPrev={pager.hasPrev}
            hasNext={pager.hasNext}
            onPrev={pager.prev}
            onNext={pager.next}
          />
        </ul>
      )}
    </div>
  );
}
