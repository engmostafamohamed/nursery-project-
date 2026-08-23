import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ParentMediaItem } from '@/hooks/useParentMedia';

interface Props {
  items: ParentMediaItem[];
  onOpen: (item: ParentMediaItem) => void;
}

export function RecentPhotosWidget({ items, onOpen }: Props) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-on-surface">{t('parent.media.recentTitle')}</h2>
        <Button asChild variant="outline" size="sm">
          <Link to="/parent/media">{t('parent.media.viewAll')}</Link>
        </Button>
      </div>
      {!items.length ? (
        <EmptyState icon="imagesmode" title={t('parent.media.noRecent')} description="" />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {items.slice(0, 6).map((item) => (
            <button key={item.id} type="button" onClick={() => onOpen(item)} className="aspect-square overflow-hidden rounded-lg">
              {item.fileType === 'photo' ? (
                <img
                src={item.gridSignedUrl}
                alt={item.caption ?? item.id}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
              ) : (
                <video src={item.signedUrl} className="h-full w-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
