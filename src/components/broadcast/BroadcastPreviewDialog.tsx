import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { BroadcastChannel } from '@/types/tables/batch3';

import { CHANNEL_LABEL_KEY } from './BroadcastChannelCheckboxes';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audienceSummary: string;
  channels: BroadcastChannel[];
  whenSummary: string;
  contentAr: string;
  contentEn: string;
};

export function BroadcastPreviewDialog({
  open,
  onOpenChange,
  audienceSummary,
  channels,
  whenSummary,
  contentAr,
  contentEn,
}: Props) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('broadcastPage.previewTitle')}</DialogTitle>
          <DialogDescription>{t('broadcastPage.preview')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium text-on-surface">{t('broadcastPage.previewAudience')}</p>
            <p className="text-on-surface-variant">{audienceSummary}</p>
          </div>
          <div>
            <p className="font-medium text-on-surface">{t('broadcastPage.previewChannels')}</p>
            <p className="text-on-surface-variant">
              {channels.map((c) => t(CHANNEL_LABEL_KEY[c])).join(' · ')}
            </p>
          </div>
          <div>
            <p className="font-medium text-on-surface">{t('broadcastPage.previewWhen')}</p>
            <p className="text-on-surface-variant">{whenSummary}</p>
          </div>
          <div className="rounded-lg border border-outline-variant bg-surface-container p-3">
            <p className="mb-1 text-xs font-medium text-on-surface-variant">{t('broadcastPage.contentAr')}</p>
            <p className="whitespace-pre-wrap text-on-surface">{contentAr || '—'}</p>
          </div>
          <div className="rounded-lg border border-outline-variant bg-surface-container p-3">
            <p className="mb-1 text-xs font-medium text-on-surface-variant">{t('broadcastPage.contentEn')}</p>
            <p className="whitespace-pre-wrap text-on-surface">{contentEn || '—'}</p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
