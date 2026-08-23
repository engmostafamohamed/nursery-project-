import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { MediaDetailModal } from '@/components/admin/MediaDetailModal';
import { ActionGate } from '@/components/shared/ActionGate';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useMediaApproval, type AdminMediaItem, type MediaStatusTab } from '@/hooks/useMediaApproval';
import { useAuthSession } from '@/hooks/useAuthSession';
import { deleteMediaById, setMediaPending } from '@/lib/mediaApproval';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';

export function AdminMediaLibraryPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const [status, setStatus] = useState<MediaStatusTab>('all');
  const [classId, setClassId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activeItem, setActiveItem] = useState<AdminMediaItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminMediaItem | null>(null);

  const mediaQuery = useMediaApproval({
    nurseryId: profile?.nursery_id ?? undefined,
    status,
    classId: classId || undefined,
    teacherId: teacherId || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });

  const filtersMeta = useQuery({
    queryKey: ['admin-media-library-filters', profile?.nursery_id],
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

  const stats = useMemo(() => {
    const all = mediaQuery.media;
    const total = all.length;
    const pending = all.filter((m) => m.status === 'pending_approval').length;
    const thisMonth = new Date().getMonth();
    const approvedThisMonth = all.filter((m) => m.status === 'approved' && new Date(m.uploadedAt).getMonth() === thisMonth).length;
    const views = all.reduce((sum, m) => sum + m.viewCount, 0);
    return { total, pending, approvedThisMonth, views };
  }, [mediaQuery.media]);

  const runPending = async (item: AdminMediaItem) => {
    try {
      await setMediaPending(item.id);
      toast.success(t('admin.media.pendingSuccess'));
      await mediaQuery.refetch();
    } catch {
      toast.error(t('admin.media.actionError'));
    }
  };

  const runDelete = async (item: AdminMediaItem) => {
    try {
      await deleteMediaById(item.id);
      toast.success(t('admin.media.deleteSuccess'));
      await mediaQuery.refetch();
    } catch {
      toast.error(t('admin.media.actionError'));
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-on-surface">{t('admin.media.libraryTitle')}</h1>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('admin.media.stats.total')}</p><p className="text-lg font-bold">{stats.total}</p></div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('admin.media.stats.pending')}</p><p className="text-lg font-bold">{stats.pending}</p></div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('admin.media.stats.approvedThisMonth')}</p><p className="text-lg font-bold">{stats.approvedThisMonth}</p></div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('admin.media.stats.totalViews')}</p><p className="text-lg font-bold">{stats.views}</p></div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'approved', 'pending_approval', 'rejected'] as const).map((v) => (
          <button key={v} type="button" className={`rounded-full px-3 py-1 text-xs ${status === v ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant'}`} onClick={() => setStatus(v)}>
            {t(`admin.media.tabs.${v === 'pending_approval' ? 'pending' : v}`)}
          </button>
        ))}
      </div>

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

      {!mediaQuery.isLoading && !mediaQuery.media.length ? (
        <EmptyState icon="imagesmode" title={t('admin.media.emptyLibraryTitle')} description={t('admin.media.emptyLibraryDescription')} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {mediaQuery.media.map((item) => (
            <article key={item.id} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2">
              <button type="button" className="w-full text-start" onClick={() => setActiveItem(item)}>
                <div className="aspect-square overflow-hidden rounded-lg bg-surface-container">
                  {item.fileType === 'photo' ? (
                    <img
                    src={item.signedUrl}
                    alt={item.caption ?? item.id}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  ) : (
                    <video src={item.signedUrl} className="h-full w-full object-cover" />
                  )}
                </div>
              </button>
              <p className="mt-2 text-xs text-on-surface-variant">{new Date(item.uploadedAt).toLocaleDateString()}</p>
              <p className="truncate text-xs text-on-surface">{(item.caption ?? '-').slice(0, 50)}</p>
              <div className="mt-2 flex gap-1">
                <ActionGate feature="media_library" action="update">
                  {item.status === 'approved' ? (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => void runPending(item)}>
                      {t('admin.media.unapprove')}
                    </Button>
                  ) : null}
                  {item.status === 'rejected' ? (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => void runPending(item)}>
                      {t('admin.media.reconsider')}
                    </Button>
                  ) : null}
                </ActionGate>
                <ActionGate feature="media_library" action="delete">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setDeleteTarget(item)}>
                    {t('admin.media.delete')}
                  </Button>
                </ActionGate>
              </div>
            </article>
          ))}
        </div>
      )}

      <MediaDetailModal
        open={Boolean(activeItem)}
        item={activeItem}
        onOpenChange={(open) => !open && setActiveItem(null)}
        onPrev={() => {
          if (!activeItem) return;
          const idx = mediaQuery.media.findIndex((m) => m.id === activeItem.id);
          if (idx > 0) setActiveItem(mediaQuery.media[idx - 1]);
        }}
        onNext={() => {
          if (!activeItem) return;
          const idx = mediaQuery.media.findIndex((m) => m.id === activeItem.id);
          if (idx < mediaQuery.media.length - 1) setActiveItem(mediaQuery.media[idx + 1]);
        }}
      />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.media.deleteConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-on-surface-variant">{t('admin.media.deleteConfirmDescription')}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
            <Button
              onClick={() => {
                if (!deleteTarget) return;
                void runDelete(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              {t('admin.media.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
