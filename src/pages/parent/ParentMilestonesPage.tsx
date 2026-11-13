import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { TableCard, TableEmpty, TableLoading, TablePagination } from '@/components/ui/DataTable';
import { LoadError } from '@/components/ui/LoadError';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatTile } from '@/components/ui/StatTile';
import { MilestoneCard } from '@/features/milestones/MilestoneCard';
import { MilestoneFilters } from '@/features/milestones/MilestoneFilters';
import { MilestoneMonths } from '@/features/milestones/MilestoneMonths';
import { matches, milestoneStats, NO_MILESTONE_FILTER, type MilestoneFilter } from '@/features/milestones/milestones';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useMilestones } from '@/hooks/useMilestones';
import { usePagination } from '@/hooks/usePagination';
import { formatDate } from '@/lib/datetime';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';

/** What the family's children learned, as their teachers share it; a notice opens it on the child (?child=). */
export function ParentMilestonesPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const [params] = useSearchParams();
  const milestone = useMilestones({ userId: user?.id, role: 'parent' });
  const [filter, setFilter] = useState<MilestoneFilter>(() => ({ ...NO_MILESTONE_FILTER, childId: params.get('child') ?? '' }));

  const kids = useMemo(
    () => milestone.children.map((c) => ({ id: c.id, name: (i18n.language === 'ar' ? c.full_name_ar : c.full_name_en) || c.full_name_en })),
    [milestone.children, i18n.language],
  );
  const filtered = useMemo(() => milestone.milestones.filter((m) => matches(m, filter)), [milestone.milestones, filter]);
  const stats = milestoneStats(filter.childId ? milestone.milestones.filter((m) => m.child_id === filter.childId) : milestone.milestones, getNurseryCalendarDateString());
  const pager = usePagination(filtered, 24, JSON.stringify(filter));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-28">
      <PageHeader icon="emoji_events" title={t('milestones.parent.title')} description={t('milestones.parent.description')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon="emoji_events" label={t('milestones.parent.stats.total')} value={stats.total} />
          <StatTile icon="calendar_month" label={t('milestones.parent.stats.thisMonth')} value={stats.thisMonth} tone="success" />
          <StatTile icon="category" label={t('milestones.parent.stats.areas')} value={t('milestones.parent.areasOf', { count: stats.areas })} tone="warning" />
          <StatTile icon="event" label={t('milestones.parent.stats.latest')} value={stats.latest ? formatDate(stats.latest, { day: 'numeric', month: 'short' }) : '—'} tone="neutral" />
        </div>
      </PageHeader>

      <TableCard
        title={t('milestones.parent.timeline')}
        count={t('milestones.parent.count', { count: filtered.length })}
        description={t('milestones.parent.timelineHint')}
        filters={milestone.milestones.length ? <MilestoneFilters value={filter} onChange={setFilter} items={milestone.milestones} kids={kids} /> : undefined}
        pagination={<TablePagination pager={pager} />}
      >
        {milestone.isError ? (
          <LoadError inset message={t('milestones.parent.loadError')} onRetry={milestone.retry} />
        ) : milestone.isLoading ? (
          <TableLoading rows={3} />
        ) : !milestone.milestones.length ? (
          <TableEmpty icon="emoji_events" title={t('milestones.parent.emptyTitle')} description={t('milestones.parent.emptyDescription')} />
        ) : !filtered.length ? (
          <TableEmpty icon="filter_alt_off" title={t('milestones.parent.noMatch')} />
        ) : (
          <MilestoneMonths items={pager.pageItems} card={(m) => <MilestoneCard key={m.id} milestone={m} />} />
        )}
      </TableCard>
    </div>
  );
}
