import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { mediaActivityLabel } from '@/lib/mediaActivityLabels';
import type { AdminMediaItem } from '@/hooks/useMediaApproval';

interface Props {
  items: AdminMediaItem[];
  selectedIds: string[];
  onToggleSelect: (id: string, checked: boolean) => void;
  onView: (item: AdminMediaItem) => void;
  onApprove: (item: AdminMediaItem) => Promise<void>;
  onReject: (item: AdminMediaItem) => void;
}

export function MediaApprovalGrid({
  items,
  selectedIds,
  onToggleSelect,
  onView,
  onApprove,
  onReject,
}: Props) {
  const { t } = useTranslation();
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {items.map((item) => (
        <article key={item.id} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2">
          <div className="mb-2 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={selectedIds.includes(item.id)}
                onChange={(e) => onToggleSelect(item.id, e.target.checked)}
              />
              {t('admin.media.select')}
            </label>
            <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] text-on-surface-variant">
              {t(`media.status.${item.status === 'pending_approval' ? 'pending' : item.status}`)}
            </span>
          </div>
          <button type="button" className="w-full text-start" onClick={() => onView(item)}>
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
          <div className="mt-2 space-y-1 text-xs text-on-surface-variant">
            <p className="flex items-center gap-1">
              <MaterialSymbol name="person" size="text-sm" />
              {t('admin.media.uploadedBy')}: {item.teacherName}
            </p>
            <p className="flex items-center gap-1">
              <MaterialSymbol name="school" size="text-sm" />
              {t('admin.media.class')}: {item.className}
            </p>
            <p>
              {t('admin.media.taggedChildren')}:{' '}
              {item.taggedChildNames.length
                ? item.taggedChildNames.slice(0, 3).join(', ') +
                  (item.taggedChildNames.length > 3 ? t('admin.media.andMore', { count: item.taggedChildNames.length - 3 }) : '')
                : t('admin.media.noneTagged')}
            </p>
            <p>
              {t('admin.media.activity')}: {mediaActivityLabel(t, item.activityType)}
            </p>
            <p>{new Date(item.uploadedAt).toLocaleDateString()}</p>
            <p className="truncate text-on-surface">{(item.caption ?? '-').slice(0, 50)}</p>
          </div>
          <div className="mt-2 flex gap-1">
            <Button size="sm" className="flex-1 gap-1" onClick={() => void onApprove(item)} aria-label={t('admin.media.approve')}>
              <MaterialSymbol name="check_circle" size="text-lg" />
            </Button>
            <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => onReject(item)} aria-label={t('admin.media.reject')}>
              <MaterialSymbol name="cancel" size="text-lg" />
            </Button>
            <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => onView(item)} aria-label={t('admin.media.detailsTitle')}>
              <MaterialSymbol name="visibility" size="text-lg" />
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}
