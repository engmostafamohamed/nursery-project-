import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { MilestoneCard } from '@/components/parent/MilestoneCard';
import { MilestoneShareCard } from '@/components/parent/MilestoneShareCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/Pagination';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useMilestones, type MilestoneCategory } from '@/hooks/useMilestones';
import { usePagination } from '@/hooks/usePagination';
import { useUserProfile } from '@/hooks/useUserProfile';

const categories: Array<MilestoneCategory | 'all'> = ['all', 'motor_skills', 'social', 'cognitive', 'language', 'self_care', 'creative'];

export function ParentMilestonesPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const milestone = useMilestones({ userId: user?.id, nurseryId: profile?.nursery_id ?? undefined, role: 'parent' });

  const [childId, setChildId] = useState('');
  const [category, setCategory] = useState<MilestoneCategory | 'all'>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const filtered = useMemo(() => milestone.milestones.filter((m) => {
    if (!m.shared_with_parent) return false;
    if (childId && m.child_id !== childId) return false;
    if (category !== 'all' && m.category !== category) return false;
    if (fromDate && m.achieved_at < fromDate) return false;
    if (toDate && m.achieved_at > toDate) return false;
    return true;
  }), [milestone.milestones, childId, category, fromDate, toDate]);

  const pager = usePagination(filtered, 20, `${childId}|${category}|${fromDate}|${toDate}`);

  return (
    <div className="space-y-4 pb-28">
      <h1 className="text-lg font-semibold text-on-surface">{t('milestones.parentTitle')}</h1>
      <div className="grid gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 md:grid-cols-4">
        {milestone.children.length > 1 ? (
          <select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={childId} onChange={(e) => setChildId(e.target.value)}>
            <option value="">{t('milestones.allChildren')}</option>
            {milestone.children.map((c) => <option key={c.id} value={c.id}>{i18n.language === 'ar' ? c.full_name_ar : c.full_name_en}</option>)}
          </select>
        ) : <div />}
        <select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value as MilestoneCategory | 'all')}>
          {categories.map((c) => <option key={c} value={c}>{c === 'all' ? t('milestones.allCategories') : t(`milestones.categories.${c}`)}</option>)}
        </select>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
      </div>
      {!filtered.length ? (
        <EmptyState icon="trophy" title={t('milestones.emptyTitle')} description={t('milestones.emptyDescription')} />
      ) : (
        <div className="space-y-3">
          {pager.pageItems.map((m) => (
            <div key={m.id} className="space-y-1">
              <MilestoneCard milestone={m} onShare={async () => { toast.message(t('common.comingSoon')); }} />
              <MilestoneShareCard milestone={m} />
            </div>
          ))}
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
        </div>
      )}
    </div>
  );
}
