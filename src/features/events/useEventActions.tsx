import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { confirm } from '@/components/ui/confirm';
import { invalidateAllEventQueries } from '@/lib/eventCache';
import { issueEventQrCodes } from '@/lib/eventQrOps';

import { CancelEventDialog } from './CancelEventDialog';
import { duplicateEvent } from './eventAdminApi';
import { deleteEvent, eventFlowErrorKey, publishEvent } from './eventFlowApi';

export type EventActionTarget = { id: string; title: string };

/**
 * What an admin can do to an event from a list or its page: publish a draft (after a check, since
 * every family asked is told), cancel an open one (with a reason), copy it as a new draft, or
 * delete a draft or a cancelled one (a soft delete). Render `dialog` once on the page.
 */
export function useEventActions(nurseryId: string | null | undefined, options: { qs?: string; onDeleted?: () => void } = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<EventActionTarget | null>(null);
  const refresh = () => invalidateAllEventQueries(queryClient);

  const run = async (work: () => Promise<void>, failure: string) => {
    if (busy || !nurseryId) return;
    setBusy(true);
    try {
      await work();
    } catch (error) {
      toast.error(failure, { description: t(eventFlowErrorKey(error)) });
    } finally {
      setBusy(false);
    }
  };

  const publish = async (event: EventActionTarget) => {
    const ok = await confirm({
      title: t('eventFlow.publish.confirmTitle', { event: event.title }),
      description: t('eventFlow.publish.confirmBody'),
      confirmText: t('admin.events.create.publish'),
      icon: 'send',
    });
    if (!ok) return;
    await run(async () => {
      const opened = await publishEvent(event.id);
      await issueEventQrCodes(event.id).catch(() => undefined);
      toast.success(t('admin.events.create.publishSuccess'), { description: t('eventFlow.publish.done', { count: opened.notified }) });
      await refresh();
    }, t('eventFlow.publish.failed'));
  };

  const remove = async (event: EventActionTarget) => {
    const ok = await confirm({
      title: t('admin.events.list.deleteTitle'),
      description: t('admin.events.list.deleteDescription'),
      confirmText: t('admin.events.list.deleteConfirm'),
      variant: 'danger',
    });
    if (!ok) return;
    await run(async () => {
      await deleteEvent(event.id);
      toast.success(t('admin.events.list.deleteSuccess'));
      await refresh();
      options.onDeleted?.();
    }, t('admin.events.list.deleteError'));
  };

  const duplicate = (event: EventActionTarget) =>
    run(async () => {
      const copyId = await duplicateEvent(event.id, nurseryId!, {
        ar: t('admin.events.list.duplicateSuffixAr'),
        en: t('admin.events.list.duplicateSuffixEn'),
      });
      toast.success(t('admin.events.list.duplicateSuccess'), {
        action: { label: t('eventFlow.editCopy'), onClick: () => navigate(`/admin/events/${copyId}/edit${options.qs ?? ''}`) },
      });
      await refresh();
    }, t('admin.events.list.duplicateError'));

  const dialog = cancelling ? (
    <CancelEventDialog
      eventId={cancelling.id}
      eventTitle={cancelling.title}
      onClose={() => setCancelling(null)}
      onCancelled={() => {
        setCancelling(null);
        void refresh();
      }}
    />
  ) : null;

  return { publish, cancel: setCancelling, remove, duplicate, busy, dialog };
}
