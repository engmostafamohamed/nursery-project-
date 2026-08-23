import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ParentMediaDetailModal } from '@/components/parent/ParentMediaDetailModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PARENT_MEDIA_ACTIVITY_FILTER_KEYS } from '@/constants/mediaActivities';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useParentMedia, type ParentMediaItem, type ParentMediaSort } from '@/hooks/useParentMedia';
import { useUserProfile } from '@/hooks/useUserProfile';
import { formatDate } from '@/lib/datetime';
import { supabase } from '@/lib/supabase';

export function ParentMediaGalleryPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const [searchParams, setSearchParams] = useSearchParams();

  const [childId, setChildId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activityType, setActivityType] = useState('');
  const [sort, setSort] = useState<ParentMediaSort>('newest');
  const [activeItem, setActiveItem] = useState<ParentMediaItem | null>(null);

  const media = useParentMedia({
    parentId: user?.id,
    nurseryId: profile?.nursery_id ?? undefined,
    filters: {
      childId: childId || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      activityType: activityType || undefined,
      sort,
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    void supabase
      .from('notifications')
      .update({ read: true } as never)
      .eq('user_id', user.id)
      .eq('type', 'media_shared')
      .eq('read', false);
  }, [user?.id]);

  useEffect(() => {
    const id = searchParams.get('id');
    if (!id || !media.media.length) return;
    const found = media.media.find((m) => m.id === id);
    if (found) setActiveItem(found);
  }, [searchParams, media.media]);

  useEffect(() => {
    if (!activeItem) return;
    void media.markViewed(activeItem);
  }, [activeItem]);

  const activeIndex = useMemo(
    () => (activeItem ? media.media.findIndex((m) => m.id === activeItem.id) : -1),
    [activeItem, media.media],
  );

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-lg font-semibold text-on-surface">
        <MaterialSymbol name="photo_library" className="text-primary" size="text-2xl" />
        {t('parent.media.galleryTitle')}
      </h1>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
          <p className="text-xs">{t('parent.media.stats.total')}</p>
          <p className="text-base font-semibold">{media.stats.total}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
          <p className="text-xs">{t('parent.media.stats.thisMonth')}</p>
          <p className="text-base font-semibold">{media.stats.thisMonthCount}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
          <p className="text-xs">{t('parent.media.stats.lastUploaded')}</p>
          <p className="text-xs font-semibold">
            {media.stats.lastUploaded ? formatDate(media.stats.lastUploaded) : '-'}
          </p>
        </div>
      </div>

      <div className="grid gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 md:grid-cols-5">
        <select
          className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
          value={childId}
          onChange={(e) => setChildId(e.target.value)}
        >
          <option value="">{t('parent.childSelector.allChildren')}</option>
          {media.children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <select
          className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
          value={activityType}
          onChange={(e) => setActivityType(e.target.value)}
        >
          <option value="">{t('parent.media.filterActivity')}</option>
          {PARENT_MEDIA_ACTIVITY_FILTER_KEYS.map((k) => (
            <option key={k} value={k}>
              {t(`media.activity.${k}`)}
            </option>
          ))}
        </select>
        <select
          className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
          value={sort}
          onChange={(e) => setSort(e.target.value as ParentMediaSort)}
        >
          <option value="newest">{t('parent.media.sortNewest')}</option>
          <option value="oldest">{t('parent.media.sortOldest')}</option>
          <option value="most_viewed">{t('parent.media.sortMostViewed')}</option>
        </select>
      </div>

      {!media.isLoading && !media.media.length ? (
        <EmptyState icon="photo_library" title={t('parent.media.emptyTitle')} description={t('parent.media.emptyDescription')} />
      ) : (
        <div className="columns-2 gap-3 md:columns-3">
          {media.media.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveItem(item);
                setSearchParams((prev) => {
                  prev.set('id', item.id);
                  return prev;
                });
              }}
              className="mb-3 w-full break-inside-avoid rounded-xl border border-outline-variant bg-surface-container-lowest p-2 text-start"
            >
              <div className="overflow-hidden rounded-lg">
                {item.fileType === 'photo' ? (
                  <img
                  src={item.gridSignedUrl}
                  alt={item.caption ?? item.id}
                  className="w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
                ) : (
                  <video src={item.signedUrl} className="w-full object-cover" />
                )}
              </div>
              <p className="mt-2 truncate text-xs text-on-surface">{(item.caption ?? '-').slice(0, 50)}</p>
              <div className="mt-1 flex items-center justify-between text-[11px] text-on-surface-variant">
                <span>{formatDate(item.capturedAt)}</span>
                <span className="inline-flex items-center gap-1">
                  {item.viewedByParent ? <MaterialSymbol name="visibility" size="text-sm" /> : null}
                  <MaterialSymbol name="download" size="text-sm" />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <ParentMediaDetailModal
        open={Boolean(activeItem)}
        media={activeItem}
        onOpenChange={(open) => {
          if (!open) {
            setActiveItem(null);
            setSearchParams((prev) => {
              prev.delete('id');
              return prev;
            });
          }
        }}
        onPrev={() => {
          if (activeIndex <= 0) return;
          setActiveItem(media.media[activeIndex - 1]);
        }}
        onNext={() => {
          if (activeIndex < 0 || activeIndex >= media.media.length - 1) return;
          setActiveItem(media.media[activeIndex + 1]);
        }}
      />
    </div>
  );
}
