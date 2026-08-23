import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { mediaActivityLabel } from '@/lib/mediaActivityLabels';
import type { AdminMediaItem } from '@/hooks/useMediaApproval';

interface Props {
  open: boolean;
  item: AdminMediaItem | null;
  onOpenChange: (open: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  onApprove?: () => Promise<void>;
  onRejectOpen?: () => void;
}

export function MediaDetailModal({
  open,
  item,
  onOpenChange,
  onPrev,
  onNext,
  onApprove,
  onRejectOpen,
}: Props) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MaterialSymbol name="perm_media" className="text-primary" />
            {t('admin.media.detailsTitle')}
          </DialogTitle>
        </DialogHeader>
        {item ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container">
              {item.fileType === 'photo' ? (
                <img
                src={item.signedUrl}
                alt={item.caption ?? item.id}
                className="max-h-[420px] w-full object-contain"
                loading="lazy"
                decoding="async"
              />
              ) : (
                <video src={item.signedUrl} controls className="max-h-[420px] w-full object-contain" />
              )}
            </div>
            <div className="grid gap-2 text-sm md:grid-cols-2">
              <p>
                <strong>{t('admin.media.uploadedBy')}:</strong> {item.teacherName}
              </p>
              <p>
                <strong>{t('admin.media.uploadDate')}:</strong> {new Date(item.uploadedAt).toLocaleString()}
              </p>
              <p>
                <strong>{t('admin.media.class')}:</strong> {item.className}
              </p>
              <p>
                <strong>{t('admin.media.activity')}:</strong> {mediaActivityLabel(t, item.activityType)}
              </p>
              <p>
                <strong>{t('admin.media.visibility')}:</strong> {t(`media.visibility.${item.visibility}`)}
              </p>
              <p>
                <strong>{t('admin.media.taggedCount')}:</strong> {item.taggedCount}
              </p>
            </div>
            {item.taggedChildNames.length ? (
              <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
                <p className="mb-2 flex items-center gap-2 text-sm font-medium text-on-surface">
                  <MaterialSymbol name="face" size="text-lg" />
                  {t('admin.media.taggedChildren')}
                </p>
                <ul className="list-inside list-disc text-sm text-on-surface-variant">
                  {item.taggedChildNames.map((name, idx) => (
                    <li key={`${item.id}-tag-${idx}`}>{name}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant">{t('admin.media.noneTagged')}</p>
            )}
            <p className="text-sm text-on-surface-variant">{item.caption || '-'}</p>
            <p className="text-xs text-on-surface-variant">
              {t('admin.media.fileInfo')}: {item.fileType}
            </p>
            <div className="flex flex-wrap justify-between gap-2">
              <div className="flex gap-2">
                <Button variant="outline" onClick={onPrev}>
                  {t('admin.media.previous')}
                </Button>
                <Button variant="outline" onClick={onNext}>
                  {t('admin.media.next')}
                </Button>
              </div>
              {onApprove && onRejectOpen ? (
                <div className="flex gap-2">
                  <Button className="gap-1" onClick={() => void onApprove()}>
                    <MaterialSymbol name="check_circle" size="text-lg" />
                    {t('admin.media.approve')}
                  </Button>
                  <Button variant="outline" className="gap-1" onClick={onRejectOpen}>
                    <MaterialSymbol name="cancel" size="text-lg" />
                    {t('admin.media.reject')}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
