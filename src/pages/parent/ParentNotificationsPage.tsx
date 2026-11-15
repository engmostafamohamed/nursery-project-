import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { NotificationRow } from '@/components/notifications/NotificationRow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, TablePagination, TBody, Th, THead } from '@/components/ui/DataTable';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePagination } from '@/hooks/usePagination';
import {
  parentInAppNotificationsQueryKey,
  useParentInAppNotifications,
  type ParentInAppNotificationRow,
} from '@/hooks/useParentInAppNotifications';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { notificationText } from '@/lib/notificationText';
import {
  formatNotificationRelativeTime,
  parentNotificationMaterialIcon,
  resolveParentNotificationPath,
} from '@/lib/parentNotificationUtils';
import { supabase } from '@/lib/supabase';

type Tab = 'all' | 'unread';

export function ParentNotificationsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const userId = user?.id;
  const { data = [], isPending, isError, refetch } = useParentInAppNotifications(userId);
  const [tab, setTab] = useState<Tab>('all');
  const [deleteTarget, setDeleteTarget] = useState<ParentInAppNotificationRow | null>(null);

  const loadErrorToastSent = useRef(false);
  useEffect(() => {
    if (!isError) {
      loadErrorToastSent.current = false;
      return;
    }
    if (loadErrorToastSent.current) return;
    loadErrorToastSent.current = true;
    toast.error(t('parent.notifications.errors.loadFailed'));
  }, [isError, t]);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: parentInAppNotificationsQueryKey(userId) });
  }, [queryClient, userId]);

  const { containerRef, pullHandlers, refreshing } = usePullToRefresh({
    onRefresh: async () => {
      await refetch();
    },
  });

  const unreadCount = useMemo(() => data.filter((n) => !n.read).length, [data]);
  const visible = useMemo(() => {
    if (tab === 'unread') return data.filter((n) => !n.read);
    return data;
  }, [data, tab]);
  const pager = usePagination(visible, 10, tab);

  const markAllRead = async () => {
    if (!userId) return;
    const { error } = await supabase
      .from('notifications')
      .update({ read: true } as never)
      .eq('user_id', userId)
      .eq('read', false)
      .or('channel.eq.in_app,channel.is.null');
    if (error) {
      toast.error(t('parent.notifications.errors.markAllFailed'));
      return;
    }
    invalidate();
  };

  const onRowClick = async (item: ParentInAppNotificationRow) => {
    if (!userId) return;
    if (!item.read) {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true } as never)
        .eq('id', item.id);
      if (error) {
        toast.error(t('parent.notifications.errors.markReadFailed'));
        return;
      }
      invalidate();
    }
    navigate(resolveParentNotificationPath(item.type, item.action_link));
  };

  const confirmDelete = async () => {
    if (!userId || !deleteTarget) return;
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', deleteTarget.id)
      .eq('user_id', userId);
    if (error) {
      toast.error(t('parent.notifications.errors.deleteFailed'));
      return;
    }
    toast.success(t('parent.notifications.deleteSuccess'));
    setDeleteTarget(null);
    invalidate();
  };

  const titleFor = (item: ParentInAppNotificationRow) => notificationText(item, i18n.language).title;
  const bodyFor = (item: ParentInAppNotificationRow) => notificationText(item, i18n.language).body;

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-on-surface">{t('parent.notifications.title')}</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {t('parent.notifications.unreadCount', { count: unreadCount })}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 self-end sm:self-start"
          disabled={unreadCount === 0}
          onClick={() => void markAllRead()}
        >
          {t('parent.notifications.markAllRead')}
        </Button>
      </header>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setTab('all')}>
          <Badge
            className={
              tab === 'all'
                ? 'border-primary bg-primary-container text-white'
                : 'cursor-pointer border-outline-variant'
            }
          >
            {t('parent.notifications.tabAll')}
          </Badge>
        </button>
        <button type="button" onClick={() => setTab('unread')}>
          <Badge
            className={
              tab === 'unread'
                ? 'border-primary bg-primary-container text-white'
                : 'cursor-pointer border-outline-variant'
            }
          >
            {t('parent.notifications.tabUnread')}
            {unreadCount > 0 ? (
              <span className="ms-1 rounded-full bg-white/20 px-1.5 text-[10px]">{unreadCount}</span>
            ) : null}
          </Badge>
        </button>
      </div>

      {refreshing ? (
        <p className="text-center text-xs text-on-surface-variant">{t('parent.notifications.refreshing')}</p>
      ) : null}

      <div
        ref={containerRef}
        className="max-h-[min(70vh,560px)] space-y-3 overflow-y-auto pb-8"
        {...pullHandlers}
      >
        {isPending ? (
          <LoadingSkeleton variant="notificationList" notificationListLabel={t('parent.notifications.loadingLabel')} />
        ) : null}

        {!isPending && data.length === 0 ? (
          <EmptyState
            icon="notifications"
            title={t('parent.notifications.emptyAllTitle')}
            description={t('parent.notifications.emptyAllDescription')}
          />
        ) : null}

        {!isPending && data.length > 0 && tab === 'unread' && visible.length === 0 ? (
          <EmptyState
            icon="check_circle"
            title={t('parent.notifications.emptyUnreadTitle')}
            description={t('parent.notifications.emptyUnreadDescription')}
          />
        ) : null}

        {!isPending && visible.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
            <DataTable minWidth={640}>
              <THead>
                <Th><span className="sr-only">{t('parent.notifications.table.kind')}</span></Th>
                <Th>{t('parent.notifications.table.notification')}</Th>
                <Th>{t('parent.notifications.table.when')}</Th>
                <Th>{t('parent.notifications.table.status')}</Th>
                <Th align="end"><span className="sr-only">{t('parent.notifications.delete')}</span></Th>
              </THead>
              <TBody>
                {pager.pageItems.map((item) => (
                  <NotificationRow
                    key={item.id}
                    icon={parentNotificationMaterialIcon(item.type)}
                    photoUrl={item.image_url?.trim() || null}
                    urgent={item.urgency === 'high'}
                    read={item.read}
                    title={titleFor(item)}
                    body={bodyFor(item)}
                    time={formatNotificationRelativeTime(item.sent_at, i18n.language)}
                    onOpen={() => void onRowClick(item)}
                    onDelete={() => setDeleteTarget(item)}
                    deleteLabel={t('parent.notifications.delete')}
                    readLabel={t('parent.notifications.statusRead')}
                    unreadLabel={t('parent.notifications.statusUnread')}
                  />
                ))}
              </TBody>
            </DataTable>
            <TablePagination pager={pager} pageSizeOptions={[10, 20, 50]} />
          </div>
        ) : null}
      </div>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('parent.notifications.deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('parent.notifications.deleteConfirmDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('parent.notifications.deleteCancel')}
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmDelete()}>
              {t('parent.notifications.deleteConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
