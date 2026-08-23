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

export function TeacherClassAnnouncementsPage() {
  const { t } = useTranslation();
  const { classId = '' } = useParams<{ classId: string }>();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);

  const classQuery = useQuery({
    queryKey: ['teacher-class', classId, user?.id],
    queryFn: async (): Promise<ClassRow | null> => {
      if (!classId || !user?.id) return null;
      const { data, error } = await supabase
        .from('classes')
        .select('id, nursery_id, name_ar, name_en')
        .eq('id', classId)
        .maybeSingle();
      if (error) throw error;
      return data as ClassRow | null;
    },
    enabled: Boolean(classId && user?.id),
  });

  // Lead OR assistant on this class is allowed to send announcements.
  const membershipQuery = useQuery({
    queryKey: ['teacher-class-membership', classId, user?.id],
    queryFn: async (): Promise<boolean> => {
      if (!classId || !user?.id) return false;
      const { data, error } = await supabase
        .from('class_staff')
        .select('id')
        .eq('class_id', classId)
        .eq('user_id', user.id)
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
    enabled: Boolean(classId && user?.id),
  });

  const isOwner = membershipQuery.data === true;

  const historyQuery = useQuery({
    queryKey: ['class-broadcasts', classId, 'teacher'],
    queryFn: async (): Promise<BroadcastMessagesRow[]> => {
      if (!classId || !classQuery.data?.nursery_id) return [];
      const { data, error } = await supabase
        .from('broadcast_messages')
        .select('*')
        .eq('nursery_id', classQuery.data.nursery_id)
        .eq('class_id', classId)
        .eq('audience_scope', 'class')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as BroadcastMessagesRow[];
    },
    enabled: Boolean(classId && classQuery.data?.nursery_id && isOwner),
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
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
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

  if (!isOwner) {
    return (
      <EmptyState
        icon="lock"
        title={t('classAnnouncements.notYourClassTitle')}
        description={t('classAnnouncements.notYourClassDescription')}
      />
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-on-surface">{t('classAnnouncements.teacherTitle')}</h1>
        <p className="text-sm text-on-surface-variant">{t('classAnnouncements.teacherSubtitle')}</p>
      </div>

      <ClassAnnouncementComposer
        classId={classId}
        nurseryId={classQuery.data.nursery_id}
        classLabel={classLabel}
        restrictToInApp
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
