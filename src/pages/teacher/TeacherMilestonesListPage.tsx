import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/Pagination';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useMilestones, type MilestoneCategory } from '@/hooks/useMilestones';
import { usePagination } from '@/hooks/usePagination';
import { useUserProfile } from '@/hooks/useUserProfile';

const categories: Array<MilestoneCategory | 'all'> = ['all', 'motor_skills', 'social', 'cognitive', 'language', 'self_care', 'creative'];

export function TeacherMilestonesListPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const milestone = useMilestones({ userId: user?.id, nurseryId: profile?.nursery_id ?? undefined, role: 'teacher' });

  const [childId, setChildId] = useState('');
  const [category, setCategory] = useState<MilestoneCategory | 'all'>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [shared, setShared] = useState<'all' | 'yes' | 'no'>('all');

  const filtered = useMemo(() => milestone.milestones.filter((m) => {
    if (childId && m.child_id !== childId) return false;
    if (category !== 'all' && m.category !== category) return false;
    if (fromDate && m.achieved_at < fromDate) return false;
    if (toDate && m.achieved_at > toDate) return false;
    if (shared === 'yes' && !m.shared_with_parent) return false;
    if (shared === 'no' && m.shared_with_parent) return false;
    return true;
  }), [milestone.milestones, childId, category, fromDate, toDate, shared]);

  const pager = usePagination(filtered, 20, `${childId}|${category}|${fromDate}|${toDate}|${shared}`);

  const groupedByChild = useMemo(
    () =>
      pager.pageItems.reduce<Record<string, typeof filtered>>((acc, item) => {
        const key = item.childName ?? 'Child';
        acc[key] = [...(acc[key] ?? []), item];
        return acc;
      }, {}),
    [pager.pageItems],
  );

  return (
    <div className="space-y-4 pb-28">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-on-surface">{t('milestones.listTitle')}</h1>
        <Button asChild><Link to="/teacher/milestones/record">{t('milestones.recordNew')}</Link></Button>
      </div>
      <div className="grid gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 md:grid-cols-5">
        <select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={childId} onChange={(e) => setChildId(e.target.value)}>
          <option value="">{t('milestones.allChildren')}</option>
          {milestone.children.map((c) => <option key={c.id} value={c.id}>{i18n.language === 'ar' ? c.full_name_ar : c.full_name_en}</option>)}
        </select>
        <select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value as MilestoneCategory | 'all')}>
          {categories.map((c) => <option key={c} value={c}>{c === 'all' ? t('milestones.allCategories') : t(`milestones.categories.${c}`)}</option>)}
        </select>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={shared} onChange={(e) => setShared(e.target.value as 'all' | 'yes' | 'no')}>
          <option value="all">{t('milestones.sharedAll')}</option>
          <option value="yes">{t('milestones.sharedYes')}</option>
          <option value="no">{t('milestones.sharedNo')}</option>
        </select>
      </div>

      {!filtered.length ? (
        <EmptyState icon="trophy" title={t('milestones.emptyTitle')} description={t('milestones.emptyDescription')} />
      ) : (
        <div className="space-y-3">
          {Object.entries(groupedByChild).map(([name, items]) => (
            <section key={name} className="space-y-2">
              <h2 className="text-sm font-semibold text-on-surface">{name}</h2>
              {items.map((m) => (
                <article key={m.id} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-on-surface-variant">{m.shared_with_parent ? t('milestones.sharedYes') : t('milestones.sharedNo')}</span>
                  </div>
                  <p className="text-xs text-on-surface-variant">{t(`milestones.categories.${m.category}`)}</p>
                  <p className="mt-1 text-sm text-on-surface">{m.milestone_text}</p>
                  <p className="text-xs text-on-surface-variant">{new Date(m.achieved_at).toLocaleDateString()}</p>
                  {m.photo_url ? (
                    <img
                      src={m.photo_url}
                      alt={m.milestone_text}
                      className="mt-2 h-24 w-24 rounded-lg object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : null}
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => toast.message(t('common.comingSoon'))}>{t('milestones.edit')}</Button>
                    <Button size="sm" variant="outline" onClick={() => void milestone.deleteMilestone(m.id)}>{t('milestones.delete')}</Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await milestone.saveMilestone({ ...m, id: m.id, shared_with_parent: !m.shared_with_parent });
                        toast.success(t('milestones.updated'));
                      }}
                    >
                      {t('milestones.toggleShare')}
                    </Button>
                  </div>
                </article>
              ))}
            </section>
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
