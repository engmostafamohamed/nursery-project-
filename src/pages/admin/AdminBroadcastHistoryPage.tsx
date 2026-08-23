import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { BroadcastHistoryDetailDialog } from '@/components/broadcast/BroadcastHistoryDetailDialog';
import { CHANNEL_LABEL_KEY } from '@/components/broadcast/BroadcastChannelCheckboxes';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';
import { processDueScheduledBroadcastsForNursery } from '@/lib/broadcastOps';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types/enums';
import type { BroadcastMessagesRow } from '@/types/tables/batch3';

type ClassMeta = { id: string; name_ar: string; name_en: string };

export function AdminBroadcastHistoryPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);
  const queryClient = useQueryClient();
  const [detailRow, setDetailRow] = useState<BroadcastMessagesRow | null>(null);

  const classesQuery = useQuery({
    queryKey: ['broadcast-history-classes', profile?.nursery_id],
    queryFn: async (): Promise<ClassMeta[]> => {
      if (!profile?.nursery_id) return [];
      const { data, error } = await supabase
        .from('classes')
        .select('id, name_ar, name_en')
        .eq('nursery_id', profile.nursery_id);
      if (error) throw error;
      return (data ?? []) as ClassMeta[];
    },
    enabled: Boolean(profile?.nursery_id),
  });

  const listQuery = useQuery({
    queryKey: ['broadcast-history', profile?.nursery_id],
    queryFn: async (): Promise<BroadcastMessagesRow[]> => {
      if (!profile?.nursery_id) return [];
      const { data, error } = await supabase
        .from('broadcast_messages')
        .select('*')
        .eq('nursery_id', profile.nursery_id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as BroadcastMessagesRow[];
    },
    enabled: Boolean(profile?.nursery_id),
  });

  const processMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.nursery_id) throw new Error('nursery');
      return processDueScheduledBroadcastsForNursery(profile.nursery_id, {
        broadcast: {
          titleAr: t('broadcastPage.notificationTitleAr'),
          titleEn: t('broadcastPage.notificationTitleEn'),
        },
        classAnnouncement: {
          titleAr: t('classAnnouncements.notificationTitleAr'),
          titleEn: t('classAnnouncements.notificationTitleEn'),
        },
      });
    },
    onSuccess: (count) => {
      void queryClient.invalidateQueries({ queryKey: ['broadcast-history', profile?.nursery_id] });
      if (count === 0) {
        toast.message(t('broadcastPage.processScheduledNone'));
      } else {
        toast.success(t('broadcastPage.processScheduledDone', { count }));
      }
    },
    onError: () => {
      toast.error(t('broadcastHistory.connectionError'));
    },
  });

  const classLabel = useMemo(
    () => (row: ClassMeta) =>
      languagePref === 'ar'
        ? row.name_ar
        : languagePref === 'en'
          ? row.name_en
          : `${row.name_ar} / ${row.name_en}`,
    [languagePref],
  );

  const audienceLabelFor = (b: BroadcastMessagesRow): string => {
    if (b.audience_scope === 'all_parents') return t('broadcastHistory.audienceAllParents');
    if (b.audience_scope === 'class' && b.class_id) {
      const c = classesQuery.data?.find((x) => x.id === b.class_id);
      return c
        ? `${t('broadcastHistory.audienceClass')}: ${classLabel(c)}`
        : t('broadcastHistory.audienceClass');
    }
    const role = b.target_role as UserRole;
    const roleLabel =
      role === 'parent'
        ? t('broadcastPage.roleParent')
        : role === 'teacher'
          ? t('broadcastPage.roleTeacher')
          : t('broadcastPage.roleBranchAdmin');
    return t('broadcastHistory.audienceRole', { role: roleLabel });
  };

  const statusLabel = (s: BroadcastMessagesRow['delivery_status']) => {
    if (s === 'sent') return t('broadcastHistory.statusSent');
    if (s === 'scheduled') return t('broadcastHistory.statusScheduled');
    if (s === 'failed') return t('broadcastHistory.statusFailed');
    return t('broadcastHistory.statusDraft');
  };

  const displayDate = (b: BroadcastMessagesRow) => {
    const iso = b.sent_at ?? b.scheduled_for ?? b.created_at;
    return new Date(iso).toLocaleString();
  };

  if (listQuery.isError) {
    return (
      <EmptyState
        icon="error"
        title={t('broadcastHistory.loadError')}
        description={t('broadcastHistory.connectionError')}
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-on-surface">{t('broadcastHistory.title')}</h1>
          <p className="text-sm text-on-surface-variant">{t('broadcastHistory.subtitle')}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={processMutation.isPending || !profile?.nursery_id}
          onClick={() => void processMutation.mutateAsync()}
        >
          <span className="material-symbols-outlined me-1 text-base" aria-hidden>
            schedule_send
          </span>
          {t('broadcastPage.processScheduled')}
        </Button>
      </div>

      {listQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {!listQuery.isLoading && (listQuery.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon="campaign"
          title={t('broadcastHistory.emptyTitle')}
          description={t('broadcastHistory.emptyDescription')}
        />
      ) : null}

      <div className="space-y-2">
        {(listQuery.data ?? []).map((b) => {
          const chans = (b.channels ?? []) as BroadcastMessagesRow['channels'];
          return (
            <Card key={b.id}>
              <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium text-on-surface">{displayDate(b)}</p>
                  <p className="text-sm text-on-surface-variant">{audienceLabelFor(b)}</p>
                  <p className="text-xs text-on-surface-variant">
                    {chans.map((c) => t(CHANNEL_LABEL_KEY[c])).join(' · ')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-medium">
                    {statusLabel(b.delivery_status)}
                  </span>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setDetailRow(b)}>
                    <span className="material-symbols-outlined text-base" aria-hidden>
                      chevron_right
                    </span>
                    {t('broadcastHistory.openDetail')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <BroadcastHistoryDetailDialog
        open={Boolean(detailRow)}
        onOpenChange={(o) => {
          if (!o) setDetailRow(null);
        }}
        row={detailRow}
        audienceLabel={detailRow ? audienceLabelFor(detailRow) : ''}
      />
    </div>
  );
}
