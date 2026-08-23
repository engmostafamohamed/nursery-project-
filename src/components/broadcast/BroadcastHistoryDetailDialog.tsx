import { useQuery } from '@tanstack/react-query';
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
import { Skeleton } from '@/components/ui/skeleton';
import { fetchBroadcastDeliveryStats } from '@/lib/broadcastOps';
import type { BroadcastMessagesRow } from '@/types/tables/batch3';

import { CHANNEL_LABEL_KEY } from './BroadcastChannelCheckboxes';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: BroadcastMessagesRow | null;
  audienceLabel: string;
};

export function BroadcastHistoryDetailDialog({ open, onOpenChange, row, audienceLabel }: Props) {
  const { t } = useTranslation();

  const statsQuery = useQuery({
    queryKey: ['broadcast-stats', row?.id],
    queryFn: () => fetchBroadcastDeliveryStats(row!.id),
    enabled: open && Boolean(row?.id) && row?.delivery_status === 'sent',
  });

  if (!row) return null;

  const channels = (row.channels ?? []) as BroadcastMessagesRow['channels'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('broadcastHistory.detailTitle')}</DialogTitle>
          <DialogDescription>{audienceLabel}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium">{t('broadcastHistory.colChannels')}</p>
            <p className="text-on-surface-variant">
              {channels.length ? channels.map((c) => t(CHANNEL_LABEL_KEY[c])).join(' · ') : '—'}
            </p>
          </div>
          {row.delivery_status === 'scheduled' && row.scheduled_for ? (
            <div>
              <p className="font-medium">{t('broadcastHistory.scheduledFor')}</p>
              <p className="text-on-surface-variant">
                {new Date(row.scheduled_for).toLocaleString()}
              </p>
            </div>
          ) : null}
          {row.delivery_status === 'sent' && row.sent_at ? (
            <div>
              <p className="font-medium">{t('broadcastHistory.colDate')}</p>
              <p className="text-on-surface-variant">{new Date(row.sent_at).toLocaleString()}</p>
            </div>
          ) : null}
          <div>
            <p className="font-medium">{t('broadcastHistory.recipientsStored')}</p>
            <p className="text-on-surface-variant">{row.recipient_count}</p>
          </div>
          {row.delivery_status === 'sent' ? (
            <div className="rounded-lg border border-outline-variant bg-surface-container p-3">
              <p className="mb-2 font-medium text-on-surface">{t('broadcastHistory.statsSection')}</p>
              {statsQuery.isLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <ul className="space-y-1 text-on-surface-variant">
                  <li>
                    {t('broadcastHistory.statsSent')}: {statsQuery.data?.inAppSent ?? '—'}
                  </li>
                  <li>
                    {t('broadcastHistory.statsRead')}: {statsQuery.data?.inAppRead ?? '—'}
                  </li>
                </ul>
              )}
            </div>
          ) : null}
          <div>
            <p className="font-medium">{t('broadcastHistory.detailContentAr')}</p>
            <p className="whitespace-pre-wrap text-on-surface-variant">{row.content_ar}</p>
          </div>
          <div>
            <p className="font-medium">{t('broadcastHistory.detailContentEn')}</p>
            <p className="whitespace-pre-wrap text-on-surface-variant">{row.content_en}</p>
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
