import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { ParentMediaItem } from '@/hooks/useParentMedia';
import { formatDate } from '@/lib/datetime';
import { createMediaDownloadSignedUrl, createMediaShareSignedUrl, incrementMediaDownloadCount } from '@/lib/mediaDownload';
import { mediaActivityLabel } from '@/lib/mediaActivityLabels';

interface Props {
  open: boolean;
  media: ParentMediaItem | null;
  onOpenChange: (open: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
}

export function ParentMediaDetailModal({ open, media, onOpenChange, onPrev, onNext }: Props) {
  const { t } = useTranslation();

  const onDownload = async () => {
    if (!media) return;
    try {
      const url = await createMediaDownloadSignedUrl(media.filePath);
      await incrementMediaDownloadCount(media.id, media.downloadCount ?? 0);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error(t('parent.media.actionError'));
    }
  };

  const onShare = async () => {
    if (!media) return;
    try {
      const url = await createMediaShareSignedUrl(media.filePath);
      await navigator.clipboard.writeText(url);
      toast.success(t('parent.media.shareCopied'));
      toast.message(t('parent.media.shareWarning'));
    } catch {
      toast.error(t('parent.media.actionError'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MaterialSymbol name="photo" className="text-primary" />
            {t('parent.media.detailsTitle')}
          </DialogTitle>
        </DialogHeader>
        {media ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container">
              {media.fileType === 'photo' ? (
                <img
                src={media.signedUrl}
                alt={media.caption ?? media.id}
                className="max-h-[420px] w-full object-contain"
                loading="lazy"
                decoding="async"
              />
              ) : (
                <video src={media.signedUrl} controls className="max-h-[420px] w-full object-contain" />
              )}
            </div>
            <p className="text-sm text-on-surface">{media.caption || '-'}</p>
            <div className="grid gap-2 text-xs text-on-surface-variant md:grid-cols-2">
              <p>
                {t('parent.media.dateCaptured')}: {formatDate(media.capturedAt)}
              </p>
              <p>
                {t('parent.media.activity')}: {mediaActivityLabel(t, media.activityType)}
              </p>
              <p>
                {t('parent.media.viewCount')}: {media.viewCount}
              </p>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <div className="flex gap-2">
                <Button variant="outline" onClick={onPrev}>
                  {t('common.previous')}
                </Button>
                <Button variant="outline" onClick={onNext}>
                  {t('common.next')}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="gap-1" onClick={() => void onShare()}>
                  <MaterialSymbol name="share" size="text-lg" />
                  {t('parent.media.share')}
                </Button>
                <Button className="gap-1" onClick={() => void onDownload()}>
                  <MaterialSymbol name="download" size="text-lg" />
                  {t('parent.media.download')}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
