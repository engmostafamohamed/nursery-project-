import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { BroadcastChannelCheckboxes } from '@/components/broadcast/BroadcastChannelCheckboxes';
import { BroadcastPreviewDialog } from '@/components/broadcast/BroadcastPreviewDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuthSession } from '@/hooks/useAuthSession';
import {
  runBroadcastDeliveryPipeline,
} from '@/lib/broadcastOps';
import { supabase } from '@/lib/supabase';
import type { BroadcastChannel } from '@/types/tables/batch3';

type Props = {
  classId: string;
  nurseryId: string;
  classLabel: string;
  /** Teachers may only use in-app until external dispatch is wired for their role */
  restrictToInApp?: boolean;
  titleKey?: string;
};

export function ClassAnnouncementComposer({
  classId,
  nurseryId,
  classLabel,
  restrictToInApp = false,
  titleKey = 'classAnnouncements.composeTitle',
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const queryClient = useQueryClient();
  const [contentAr, setContentAr] = useState('');
  const [contentEn, setContentEn] = useState('');
  const [channels, setChannels] = useState<BroadcastChannel[]>(['in_app']);
  const [sendMode, setSendMode] = useState<'now' | 'later'>('now');
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  const lockedChannels: BroadcastChannel[] = restrictToInApp
    ? ['whatsapp', 'sms', 'email']
    : [];

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('auth');
      if (!contentAr.trim() || !contentEn.trim()) throw new Error('content');
      const effectiveChannels = restrictToInApp ? (['in_app'] as BroadcastChannel[]) : channels;
      if (!effectiveChannels.length) throw new Error('channels');

      const scheduleIso =
        sendMode === 'later' && scheduledLocal
          ? new Date(scheduledLocal).toISOString()
          : null;
      if (sendMode === 'later') {
        if (!scheduledLocal || Number.isNaN(new Date(scheduledLocal).getTime())) {
          throw new Error('schedule');
        }
        if (new Date(scheduledLocal).getTime() <= Date.now()) {
          throw new Error('schedule_past');
        }
      }

      const baseRow = {
        nursery_id: nurseryId,
        sender_id: user.id,
        target_role: 'parent' as const,
        content_ar: contentAr.trim(),
        content_en: contentEn.trim(),
        audience_scope: 'class' as const,
        class_id: classId,
        channels: effectiveChannels,
        scheduled_for: scheduleIso,
        sent_at: null as string | null,
        delivery_status: (sendMode === 'later' ? 'scheduled' : 'draft') as 'scheduled' | 'draft',
      };

      const { data: created, error: insErr } = await supabase
        .from('broadcast_messages')
        .insert(baseRow as never)
        .select(
          'id, nursery_id, audience_scope, class_id, target_role, channels, content_ar, content_en',
        )
        .single();
      if (insErr) throw insErr;
      if (!created) throw new Error('insert');

      if (sendMode === 'later') {
        return { scheduled: true };
      }

      await runBroadcastDeliveryPipeline({
        row: created as never,
        titleAr: t('classAnnouncements.notificationTitleAr'),
        titleEn: t('classAnnouncements.notificationTitleEn'),
        notificationType: 'class_announcement',
      });
      return { scheduled: false };
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['class-broadcasts', classId] });
      if (res.scheduled) {
        toast.success(t('classAnnouncements.scheduledToast'));
      } else {
        toast.success(t('classAnnouncements.sentToast'));
      }
      setContentAr('');
      setContentEn('');
      setChannels(['in_app']);
      setSendMode('now');
      setScheduledLocal('');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'content') {
        toast.error(t('broadcastPage.validationContent'));
      } else if (msg === 'schedule' || msg === 'schedule_past') {
        toast.error(t('broadcastPage.validationSchedule'));
      } else if (msg === 'no_recipients') {
        toast.error(t('broadcastPage.noRecipientsToast'));
      } else {
        toast.error(t('classAnnouncements.errorToast'));
      }
    },
  });

  const canSubmit =
    Boolean(user?.id) &&
    contentAr.trim() &&
    contentEn.trim() &&
    (restrictToInApp || channels.length > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <span className="material-symbols-outlined text-primary" aria-hidden>
          campaign
        </span>
        <CardTitle className="text-base">{t(titleKey)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-on-surface-variant">{classLabel}</p>

        <div className="space-y-2">
          <Label htmlFor="ann-ar">{t('broadcastPage.contentAr')}</Label>
          <Textarea
            id="ann-ar"
            value={contentAr}
            onChange={(e) => setContentAr(e.target.value)}
            placeholder={t('broadcastPage.contentArPlaceholder')}
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ann-en">{t('broadcastPage.contentEn')}</Label>
          <Textarea
            id="ann-en"
            value={contentEn}
            onChange={(e) => setContentEn(e.target.value)}
            placeholder={t('broadcastPage.contentEnPlaceholder')}
            rows={3}
          />
        </div>

        <BroadcastChannelCheckboxes
          value={channels}
          onChange={setChannels}
          lockedOut={lockedChannels}
        />

        <div className="space-y-2">
          <Label>{t('broadcastPage.scheduleLabel')}</Label>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="ann-mode"
                checked={sendMode === 'now'}
                onChange={() => setSendMode('now')}
                className="accent-primary"
              />
              {t('broadcastPage.sendNow')}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="ann-mode"
                checked={sendMode === 'later'}
                onChange={() => setSendMode('later')}
                className="accent-primary"
              />
              {t('broadcastPage.sendLater')}
            </label>
          </div>
          {sendMode === 'later' ? (
            <input
              type="datetime-local"
              className="h-11 w-full max-w-xs rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
              value={scheduledLocal}
              onChange={(e) => setScheduledLocal(e.target.value)}
            />
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPreviewOpen(true)}
            disabled={!contentAr.trim() && !contentEn.trim()}
          >
            <span className="material-symbols-outlined me-1 text-base" aria-hidden>
              visibility
            </span>
            {t('broadcastPage.preview')}
          </Button>
          <Button
            type="button"
            onClick={() => void sendMutation.mutateAsync()}
            disabled={!canSubmit || sendMutation.isPending}
          >
            {sendMode === 'later' ? t('broadcastPage.scheduleSave') : t('broadcastPage.send')}
          </Button>
        </div>

        <BroadcastPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          audienceSummary={classLabel}
          channels={restrictToInApp ? ['in_app'] : channels}
          whenSummary={
            sendMode === 'later' && scheduledLocal
              ? new Date(scheduledLocal).toLocaleString()
              : t('broadcastPage.previewNow')
          }
          contentAr={contentAr}
          contentEn={contentEn}
        />
      </CardContent>
    </Card>
  );
}
