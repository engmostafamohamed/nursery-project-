import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { ClassAnnouncementComposer } from '@/components/broadcast/ClassAnnouncementComposer';
import { CHANNEL_LABEL_KEY } from '@/components/broadcast/BroadcastChannelCheckboxes';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';
import type { BroadcastMessagesRow } from '@/types/tables/batch3';

type ClassRow = {
  id: string;
  nursery_id: string;
  name_ar: string;
  name_en: string;
};

export function AdminClassAnnouncementsPage() {
  const { t } = useTranslation();
  const { classId = '' } = useParams<{ classId: string }>();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);

  const classQuery = useQuery({
    queryKey: ['admin-class', classId, profile?.nursery_id],
    queryFn: async (): Promise<ClassRow | null> => {
      if (!classId || !profile?.nursery_id) return null;
      const { data, error } = await supabase
        .from('classes')
        .select('id, nursery_id, name_ar, name_en')
        .eq('id', classId)
        .eq('nursery_id', profile.nursery_id)
        .maybeSingle();
      if (error) throw error;
      return data as ClassRow | null;
    },
    enabled: Boolean(classId && profile?.nursery_id),
  });

  const historyQuery = useQuery({
    queryKey: ['class-broadcasts', classId],
    queryFn: async (): Promise<BroadcastMessagesRow[]> => {
      if (!classId || !profile?.nursery_id) return [];
      const { data, error } = await supabase
        .from('broadcast_messages')
        .select('*')
        .eq('nursery_id', profile.nursery_id)
        .eq('class_id', classId)
        .eq('audience_scope', 'class')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as BroadcastMessagesRow[];
    },
    enabled: Boolean(classId && profile?.nursery_id),
  });

  const classLabel = useMemo(() => {
    const row = classQuery.data;
    if (!row) return '';
    if (languagePref === 'ar') return row.name_ar;
    if (languagePref === 'en') return row.name_en;
    return `${row.name_ar} / ${row.name_en}`;
  }, [classQuery.data, languagePref]);

  if (classQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!classQuery.data) {
    return (
      <EmptyState
        icon="school"
        title={t('classAnnouncements.invalidClassTitle')}
        description={t('classAnnouncements.invalidClassDescription')}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-on-surface">{t('classAnnouncements.adminTitle')}</h1>
        <p className="text-sm text-on-surface-variant">{t('classAnnouncements.adminSubtitle')}</p>
      </div>

      <ClassAnnouncementComposer
        classId={classId}
        nurseryId={classQuery.data.nursery_id}
        classLabel={classLabel}
        restrictToInApp={false}
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-on-surface">{t('classAnnouncements.historyTitle')}</h2>
        {historyQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (historyQuery.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon="history"
            title={t('broadcastHistory.emptyTitle')}
            description={t('broadcastHistory.emptyDescription')}
          />
        ) : (
          <div className="space-y-2">
            {(historyQuery.data ?? []).map((b) => {
              const chans = (b.channels ?? []) as BroadcastMessagesRow['channels'];
              const when = b.sent_at ?? b.scheduled_for ?? b.created_at;
              return (
                <Card key={b.id}>
                  <CardContent className="space-y-1 p-4 text-sm">
                    <p className="font-medium text-on-surface">{new Date(when).toLocaleString()}</p>
                    <p className="text-on-surface-variant line-clamp-2">{b.content_ar}</p>
                    <p className="text-xs text-on-surface-variant">
                      {chans.map((c) => t(CHANNEL_LABEL_KEY[c])).join(' · ')} · {b.delivery_status}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
