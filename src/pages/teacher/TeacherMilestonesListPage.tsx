import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { StatusPill, TableCard, TableEmpty, TableLoading, TablePagination } from '@/components/ui/DataTable';
import { LoadError } from '@/components/ui/LoadError';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatTile } from '@/components/ui/StatTile';
import { MilestoneCard } from '@/features/milestones/MilestoneCard';
import { draftOf } from '@/features/milestones/milestoneDraft';
import { MilestoneFilters } from '@/features/milestones/MilestoneFilters';
import { MilestoneMonths } from '@/features/milestones/MilestoneMonths';
import { matches, milestoneStats, NO_MILESTONE_FILTER, type MilestoneFilter } from '@/features/milestones/milestones';
import { milestoneErrorKey } from '@/features/milestones/milestonesApi';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useMilestones, type MilestoneItem } from '@/hooks/useMilestones';
import { usePagination } from '@/hooks/usePagination';
import { useUserProfile } from '@/hooks/useUserProfile';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';

/** The milestones of the teacher's classes: record, change, share with the family or not, remove. */
export function TeacherMilestonesListPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const milestone = useMilestones({ userId: user?.id, nurseryId: profile?.nursery_id ?? undefined, role: 'teacher' });
  const [filter, setFilter] = useState<MilestoneFilter>(NO_MILESTONE_FILTER);
  const [busy, setBusy] = useState<string | null>(null);

  const kids = useMemo(
    () => milestone.children.map((c) => ({ id: c.id, name: (i18n.language === 'ar' ? c.full_name_ar : c.full_name_en) || c.full_name_en })),
    [milestone.children, i18n.language],
  );
  const filtered = useMemo(() => milestone.milestones.filter((m) => matches(m, filter)), [milestone.milestones, filter]);
  const stats = milestoneStats(milestone.milestones, getNurseryCalendarDateString());
  const pager = usePagination(filtered, 24, JSON.stringify(filter));

  const run = async (m: MilestoneItem, action: () => Promise<unknown>, done: string) => {
    setBusy(m.id);
    try {
      await action();
      toast.success(t(done));
    } catch (error) {
      toast.error(t(milestoneErrorKey(error)));
    } finally {
      setBusy(null);
    }
  };
  const toggleShare = (m: MilestoneItem) =>
    run(m, () => milestone.saveMilestone({ id: m.id, draft: { ...draftOf(m), sharedWithParent: !m.shared_with_parent } }),
      m.shared_with_parent ? 'milestones.hidden' : 'milestones.sharedNow');
  const remove = async (m: MilestoneItem) => {
    const ok = await confirm({ title: t('milestones.removeTitle'), description: t('milestones.removeBody'), confirmText: t('milestones.delete'), variant: 'danger' });
    if (ok) await run(m, () => milestone.deleteMilestone(m.id), 'milestones.removed');
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-28">
      <PageHeader
        icon="emoji_events"
        title={t('milestones.listTitle')}
        description={t('milestones.teacherDescription')}
        actions={
          <Button asChild>
            <Link to="/teacher/milestones/record">
              <MaterialSymbol name="add" size="text-base" className="me-1" />
              {t('milestones.recordNew')}
            </Link>
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon="emoji_events" label={t('milestones.parent.stats.total')} value={stats.total} />
          <StatTile icon="calendar_month" label={t('milestones.parent.stats.thisMonth')} value={stats.thisMonth} tone="success" />
          <StatTile icon="family_restroom" label={t('milestones.sharedYes')} value={stats.shared} tone="primary" onClick={() => setFilter({ ...filter, shared: 'shared' })} active={filter.shared === 'shared'} />
          <StatTile icon="visibility_off" label={t('milestones.sharedNo')} value={stats.total - stats.shared} tone="warning" onClick={() => setFilter({ ...filter, shared: 'private' })} active={filter.shared === 'private'} />
        </div>
      </PageHeader>

      <TableCard
        title={t('milestones.listTitle')}
        count={t('milestones.parent.count', { count: filtered.length })}
        filters={milestone.milestones.length ? <MilestoneFilters value={filter} onChange={setFilter} items={milestone.milestones} kids={kids} withShared /> : undefined}
        pagination={<TablePagination pager={pager} />}
      >
        {milestone.isError ? (
          <LoadError inset message={t('milestones.parent.loadError')} onRetry={milestone.retry} />
        ) : milestone.isLoading ? (
          <TableLoading rows={3} />
        ) : !milestone.milestones.length ? (
          <TableEmpty
            icon="emoji_events"
            title={t('milestones.emptyTitle')}
            description={t('milestones.emptyDescription')}
            action={<Button asChild><Link to="/teacher/milestones/record">{t('milestones.recordNew')}</Link></Button>}
          />
        ) : !filtered.length ? (
          <TableEmpty icon="filter_alt_off" title={t('milestones.parent.noMatch')} />
        ) : (
          <MilestoneMonths
            items={pager.pageItems}
            card={(m) => (
              <MilestoneCard
                key={m.id}
                milestone={m}
                badge={
                  <StatusPill tone={m.shared_with_parent ? 'success' : 'neutral'} icon={m.shared_with_parent ? 'family_restroom' : 'visibility_off'}>
                    {m.shared_with_parent ? t('milestones.sharedYes') : t('milestones.sharedNo')}
                  </StatusPill>
                }
                actions={
                  <>
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/teacher/milestones/record?edit=${m.id}`}>
                        <MaterialSymbol name="edit" size="text-base" className="me-1" />
                        {t('milestones.edit')}
                      </Link>
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy === m.id} onClick={() => void toggleShare(m)}>
                      <MaterialSymbol name={m.shared_with_parent ? 'visibility_off' : 'family_restroom'} size="text-base" className="me-1" />
                      {m.shared_with_parent ? t('milestones.hideFromFamily') : t('milestones.shareWithFamily')}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-error" disabled={busy === m.id} onClick={() => void remove(m)}>
                      <MaterialSymbol name="delete" size="text-base" className="me-1" />
                      {t('milestones.delete')}
                    </Button>
                  </>
                }
              />
            )}
          />
        )}
      </TableCard>
    </div>
  );
}
