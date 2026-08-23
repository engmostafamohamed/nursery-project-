import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { MediaApprovalGrid } from '@/components/admin/MediaApprovalGrid';
import { MediaDetailModal } from '@/components/admin/MediaDetailModal';
import { MediaRejectModal } from '@/components/admin/MediaRejectModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useMediaApproval, type AdminMediaItem } from '@/hooks/useMediaApproval';
import { useAuthSession } from '@/hooks/useAuthSession';
import { approveMedia, rejectMedia } from '@/lib/mediaApproval';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';

export function AdminMediaApprovalPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const [classId, setClassId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeItem, setActiveItem] = useState<AdminMediaItem | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminMediaItem | null>(null);

  const queue = useMediaApproval({
    nurseryId: profile?.nursery_id ?? undefined,
    status: 'pending_approval',
    classId: classId || undefined,
    teacherId: teacherId || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });

  const filtersMeta = useQuery({
    queryKey: ['admin-media-filters', profile?.nursery_id],
    queryFn: async () => {
      if (!profile?.nursery_id) return { classes: [], teachers: [] };
      const [classesRes, teachersRes] = await Promise.all([
        supabase.from('classes').select('id, name_ar, name_en').eq('nursery_id', profile.nursery_id),
        supabase.from('users').select('id, full_name_ar:name_ar, full_name_en:name_en').eq('nursery_id', profile.nursery_id).eq('role', 'teacher'),
      ]);
      if (classesRes.error) throw classesRes.error;
      if (teachersRes.error) throw teachersRes.error;
      return {
        classes: (classesRes.data ?? []) as { id: string; name_ar: string; name_en: string }[],
        teachers: (teachersRes.data ?? []) as { id: string; full_name_ar: string | null; full_name_en: string | null }[],
      };
    },
    enabled: Boolean(profile?.nursery_id),
  });

  const pendingItems = queue.media;
  const activeIndex = useMemo(
    () => (activeItem ? pendingItems.findIndex((i) => i.id === activeItem.id) : -1),
    [activeItem, pendingItems],
  );

  const runApprove = async (item: AdminMediaItem) => {
    if (!user?.id) return;
    try {
      await approveMedia({ mediaId: item.id, adminId: user.id });
      toast.success(t('admin.media.approveSuccess'));
      await queue.refetch();
      setSelectedIds((prev) => prev.filter((id) => id !== item.id));
      if (activeItem?.id === item.id) setActiveItem(null);
    } catch {
      toast.error(t('admin.media.actionError'));
    }
  };

  const runReject = async (item: AdminMediaItem, reason: string) => {
    if (!user?.id) return;
    try {
      await rejectMedia({ mediaId: item.id, adminId: user.id, reason });
      toast.success(t('admin.media.rejectSuccess'));
      await queue.refetch();
      setSelectedIds((prev) => prev.filter((id) => id !== item.id));
      if (activeItem?.id === item.id) setActiveItem(null);
    } catch {
      toast.error(t('admin.media.actionError'));
    }
  };

  const bulkApprove = async () => {
    const targets = pendingItems.filter((i) => selectedIds.includes(i.id));
    if (!user?.id || !targets.length) return;
    try {
      await Promise.all(targets.map((item) => approveMedia({ mediaId: item.id, adminId: user.id })));
      toast.success(t('admin.media.bulkApproveSuccess', { count: targets.length }));
      await queue.refetch();
      setSelectedIds([]);
      if (activeItem && targets.some((x) => x.id === activeItem.id)) setActiveItem(null);
    } catch {
      toast.error(t('admin.media.actionError'));
    }
  };

  const bulkReject = async () => {
    const targets = pendingItems.filter((i) => selectedIds.includes(i.id));
    await Promise.all(targets.map((item) => runReject(item, t('admin.media.bulkRejectDefaultReason'))));
    setSelectedIds([]);
  };

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-lg font-semibold text-on-surface">
        <MaterialSymbol name="fact_check" className="text-primary" size="text-2xl" />
        {t('admin.media.approvalTitle')}
      </h1>

      <div className="grid gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 md:grid-cols-4">
        <select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">{t('admin.media.filterClass')}</option>
          {(filtersMeta.data?.classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name_ar || c.name_en}</option>)}
        </select>
        <select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
          <option value="">{t('admin.media.filterTeacher')}</option>
          {(filtersMeta.data?.teachers ?? []).map((u) => <option key={u.id} value={u.id}>{u.full_name_ar || u.full_name_en}</option>)}
        </select>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="gap-1" onClick={() => void bulkApprove()} disabled={!selectedIds.length}>
          <MaterialSymbol name="done_all" size="text-lg" />
          {t('admin.media.approveSelected')}
        </Button>
        <Button variant="outline" className="gap-1" onClick={() => void bulkReject()} disabled={!selectedIds.length}>
          <MaterialSymbol name="block" size="text-lg" />
          {t('admin.media.rejectSelected')}
        </Button>
      </div>

      {!queue.isLoading && !pendingItems.length ? (
        <EmptyState icon="imagesmode" title={t('admin.media.emptyQueueTitle')} description={t('admin.media.emptyQueueDescription')} />
      ) : (
        <MediaApprovalGrid
          items={pendingItems}
          selectedIds={selectedIds}
          onToggleSelect={(id, checked) =>
            setSelectedIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)))
          }
          onView={setActiveItem}
          onApprove={runApprove}
          onReject={setRejectTarget}
        />
      )}

      <MediaDetailModal
        open={Boolean(activeItem)}
        item={activeItem}
        onOpenChange={(open) => !open && setActiveItem(null)}
        onPrev={() => {
          if (activeIndex <= 0) return;
          setActiveItem(pendingItems[activeIndex - 1]);
        }}
        onNext={() => {
          if (activeIndex < 0 || activeIndex >= pendingItems.length - 1) return;
          setActiveItem(pendingItems[activeIndex + 1]);
        }}
        onApprove={activeItem ? async () => runApprove(activeItem) : undefined}
        onRejectOpen={activeItem ? () => setRejectTarget(activeItem) : undefined}
      />

      <MediaRejectModal
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => !open && setRejectTarget(null)}
        onSubmit={(reason) => (rejectTarget ? runReject(rejectTarget, reason) : Promise.resolve())}
      />
    </div>
  );
}
