import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { createMediaSignedUrl } from '@/lib/mediaStorage';
import { supabase } from '@/lib/supabase';

type MediaItem = {
  id: string;
  file_url: string;
  file_type: 'photo' | 'video';
  uploaded_at: string;
  status: 'pending_approval' | 'approved' | 'rejected';
  caption: string | null;
  view_count: number;
};

export function TeacherMediaListPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const [searchParams] = useSearchParams();
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';
  const [status, setStatus] = useState<'all' | 'pending_approval' | 'approved' | 'rejected'>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activeItem, setActiveItem] = useState<MediaItem | null>(null);

  const listQuery = useQuery({
    queryKey: ['teacher-media-list', user?.id, status, fromDate, toDate],
    queryFn: async (): Promise<Array<MediaItem & { signedUrl: string }>> => {
      if (!user?.id || !profile?.nursery_id) return [];
      let q = supabase
        .from('media')
        .select('id, file_url, file_type, uploaded_at, status, caption, view_count')
        .eq('uploaded_by', user.id)
        .eq('nursery_id', profile.nursery_id)
        .order('uploaded_at', { ascending: false });
      if (status !== 'all') q = q.eq('status', status);
      if (fromDate) q = q.gte('uploaded_at', `${fromDate}T00:00:00`);
      if (toDate) q = q.lte('uploaded_at', `${toDate}T23:59:59`);
      const res = await q;
      if (res.error) throw res.error;
      const rows = (res.data ?? []) as MediaItem[];
      return Promise.all(
        rows.map(async (row) => ({
          ...row,
          signedUrl: await createMediaSignedUrl(row.file_url),
        })),
      );
    },
    enabled: Boolean(user?.id && profile?.nursery_id),
  });

  const items = listQuery.data ?? [];
  const statusKey = useMemo(
    () => ({ all: 'all', pending_approval: 'pending', approved: 'approved', rejected: 'rejected' } as const),
    [],
  );

  const onDelete = async (item: MediaItem) => {
    if (!(item.status === 'pending_approval' || item.status === 'rejected')) return;
    const { error } = await supabase.from('media').delete().eq('id', item.id);
    if (error) {
      toast.error(t('media.list.deleteError'));
      return;
    }
    toast.success(t('media.list.deleteSuccess'));
    await listQuery.refetch();
  };

  return (
    <div className="mx-auto w-full max-w-5xl lg:max-w-none space-y-4 pb-28">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-on-surface">{t('media.list.title')}</h1>
        <Button asChild><Link to={`/teacher/media/upload${qs}`}>{t('media.list.uploadNew')}</Link></Button>
      </div>

      <div className="grid gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 md:grid-cols-3">
        <div className="flex flex-wrap gap-2">
          {(['all', 'pending_approval', 'approved', 'rejected'] as const).map((v) => (
            <button key={v} type="button" className={`rounded-full px-3 py-1 text-xs ${status === v ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant'}`} onClick={() => setStatus(v)}>
              {t(`media.status.${statusKey[v]}`)}
            </button>
          ))}
        </div>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
      </div>

      {!listQuery.isLoading && !items.length ? (
        <EmptyState icon="imagesmode" title={t('media.list.emptyTitle')} description={t('media.list.emptyDescription')} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2">
              <button type="button" className="w-full text-start" onClick={() => setActiveItem(item)}>
                <div className="aspect-square overflow-hidden rounded-lg bg-surface-container">
                  {item.file_type === 'photo' ? (
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
              <div className="mt-2 space-y-1">
                <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] text-on-surface-variant">
                  {t(`media.status.${statusKey[item.status]}`)}
                </span>
                <p className="text-xs text-on-surface-variant">{new Date(item.uploaded_at).toLocaleDateString()}</p>
                <p className="truncate text-xs text-on-surface">{(item.caption ?? '').slice(0, 50) || '-'}</p>
                <p className="text-[10px] text-on-surface-variant">{t('media.list.views', { count: item.view_count })}</p>
              </div>
              {(item.status === 'pending_approval' || item.status === 'rejected') ? (
                <Button className="mt-2 w-full" size="sm" variant="outline" onClick={() => void onDelete(item)}>
                  {t('media.list.delete')}
                </Button>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <Dialog open={Boolean(activeItem)} onOpenChange={(open) => !open && setActiveItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('media.list.details')}</DialogTitle></DialogHeader>
          {activeItem ? (
            <div className="space-y-2 text-sm">
              <p>{t('media.list.status')}: {t(`media.status.${statusKey[activeItem.status]}`)}</p>
              <p>{t('media.list.uploadDate')}: {new Date(activeItem.uploaded_at).toLocaleString()}</p>
              <p>{t('media.list.caption')}: {activeItem.caption || '-'}</p>
              <p>{t('media.list.views', { count: activeItem.view_count })}</p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
