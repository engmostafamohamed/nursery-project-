import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ParentMediaDetailModal } from '@/components/parent/ParentMediaDetailModal';
import { TableCard, TableEmpty } from '@/components/ui/DataTable';
import { FilterBar } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { Input } from '@/components/ui/input';
import { LoadError } from '@/components/ui/LoadError';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { PARENT_MEDIA_ACTIVITY_FILTER_KEYS } from '@/constants/mediaActivities';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useParentMedia, type ParentMediaItem, type ParentMediaSort } from '@/hooks/useParentMedia';
import { useUserProfile } from '@/hooks/useUserProfile';
import { localName } from '@/lib/bilingualName';
import { formatDate } from '@/lib/datetime';
import { supabase } from '@/lib/supabase';

/** The photos and videos the nursery shared of the family's children; a notice opens one (?id=). */
export function ParentMediaGalleryPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const [searchParams, setSearchParams] = useSearchParams();

  const [childId, setChildId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activityType, setActivityType] = useState('');
  const [sort, setSort] = useState<ParentMediaSort>('newest');
  const [activeItem, setActiveItem] = useState<ParentMediaItem | null>(null);
  const filtered = Boolean(childId || fromDate || toDate || activityType);

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

  // Opening the gallery reads the "new photos" notices.
  useEffect(() => {
    if (!user?.id) return;
    void supabase
      .from('notifications')
      .update({ read: true } as never)
      .eq('user_id', user.id)
      .eq('type', 'media_shared')
      .eq('read', false);
  }, [user?.id]);

  // A link with ?id= opens that item once, as soon as the gallery has it.
  const linkedId = searchParams.get('id');
  const [openedLinkId, setOpenedLinkId] = useState<string | null>(null);
  if (linkedId && linkedId !== openedLinkId) {
    const found = media.media.find((m) => m.id === linkedId);
    if (found) {
      setOpenedLinkId(linkedId);
      setActiveItem(found);
    }
  }

  useEffect(() => {
    if (!activeItem) return;
    void media.markViewed(activeItem);
    // Only when another item opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItem]);

  const activeIndex = useMemo(() => (activeItem ? media.media.findIndex((m) => m.id === activeItem.id) : -1), [activeItem, media.media]);
  const open = (item: ParentMediaItem) => {
    setActiveItem(item);
    setSearchParams((prev) => {
      prev.set('id', item.id);
      return prev;
    });
  };
  const clearFilters = () => {
    setChildId('');
    setFromDate('');
    setToDate('');
    setActivityType('');
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-28">
      <PageHeader icon="photo_library" title={t('parent.media.galleryTitle')} description={t('parent.media.description')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon="photo_library" label={t('parent.media.stats.total')} value={media.stats.total} />
          <StatTile icon="calendar_month" label={t('parent.media.stats.thisMonth')} value={media.stats.thisMonthCount} tone="success" />
          <StatTile icon="fiber_new" label={t('parent.media.stats.new')} value={media.unseenCount} tone={media.unseenCount ? 'warning' : 'neutral'} />
          <StatTile
            icon="schedule"
            label={t('parent.media.stats.lastUploaded')}
            value={media.stats.lastUploaded ? formatDate(media.stats.lastUploaded, { day: 'numeric', month: 'short' }) : '—'}
            tone="neutral"
          />
        </div>
      </PageHeader>

      <TableCard
        title={t('parent.media.listTitle')}
        count={t('parent.media.count', { count: media.media.length })}
        filters={
          <FilterBar onClear={clearFilters} canClear={filtered}>
            {media.children.length > 1 ? (
              <FilterField label={t('parent.media.filterChild')} className="w-full sm:w-52">
                <Select value={childId} onChange={(e) => setChildId(e.target.value)}>
                  <option value="">{t('parent.childSelector.allChildren')}</option>
                  {media.children.map((c) => (
                    <option key={c.id} value={c.id}>{localName(c.nameAr, c.nameEn, isAr)}</option>
                  ))}
                </Select>
              </FilterField>
            ) : null}
            <FilterField label={t('parent.media.from')} className="w-[calc(50%-0.375rem)] sm:w-44">
              <Input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} />
            </FilterField>
            <FilterField label={t('parent.media.to')} className="w-[calc(50%-0.375rem)] sm:w-44">
              <Input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} />
            </FilterField>
            <FilterField label={t('parent.media.filterActivity')} className="w-full sm:w-48">
              <Select value={activityType} onChange={(e) => setActivityType(e.target.value)}>
                <option value="">{t('parent.media.allActivities')}</option>
                {PARENT_MEDIA_ACTIVITY_FILTER_KEYS.map((k) => (
                  <option key={k} value={k}>{t(`media.activity.${k}`)}</option>
                ))}
              </Select>
            </FilterField>
            <FilterField label={t('parent.media.sort')} className="w-full sm:w-44">
              <Select value={sort} onChange={(e) => setSort(e.target.value as ParentMediaSort)}>
                <option value="newest">{t('parent.media.sortNewest')}</option>
                <option value="oldest">{t('parent.media.sortOldest')}</option>
                <option value="most_viewed">{t('parent.media.sortMostViewed')}</option>
              </Select>
            </FilterField>
          </FilterBar>
        }
      >
        {media.isError ? (
          <LoadError inset message={t('parent.media.loadError')} onRetry={() => void media.refetch()} />
        ) : media.isLoading ? (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, k) => <Skeleton key={k} className="aspect-square w-full rounded-xl" />)}
          </div>
        ) : !media.media.length ? (
          <TableEmpty
            icon={filtered ? 'filter_alt_off' : 'photo_library'}
            title={filtered ? t('parent.media.noMatch') : t('parent.media.emptyTitle')}
            description={filtered ? undefined : t('parent.media.emptyDescription')}
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-4">
            {media.media.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  className="group relative block aspect-square w-full overflow-hidden rounded-xl border border-outline-variant bg-surface-high text-start"
                  data-testid="media-tile"
                >
                  {item.fileType === 'photo' ? (
                    <img src={item.gridSignedUrl} alt={item.caption ?? ''} className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" decoding="async" />
                  ) : (
                    <>
                      <video src={item.signedUrl} preload="metadata" muted className="h-full w-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white">
                          <MaterialSymbol name="play_arrow" size="text-2xl" />
                        </span>
                      </span>
                    </>
                  )}
                  {!item.viewedByParent ? (
                    <span className="absolute start-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">{t('parent.media.new')}</span>
                  ) : null}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6 text-white">
                    {item.caption ? <span className="block truncate text-xs font-medium">{item.caption}</span> : null}
                    <span className="block text-[11px] opacity-90">{formatDate(item.capturedAt, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </TableCard>

      <ParentMediaDetailModal
        open={Boolean(activeItem)}
        media={activeItem}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
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
