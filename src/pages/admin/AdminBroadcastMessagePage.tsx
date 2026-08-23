import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  AdminBroadcastFormSections,
  type AudienceMode,
} from '@/components/broadcast/AdminBroadcastFormSections';
import { BroadcastPreviewDialog } from '@/components/broadcast/BroadcastPreviewDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';
import { runBroadcastDeliveryPipeline } from '@/lib/broadcastOps';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types/enums';
import type { BroadcastAudienceScope, BroadcastChannel } from '@/types/tables/batch3';

type ClassRow = { id: string; name_ar: string; name_en: string };

export function AdminBroadcastMessagePage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);

  const [audienceMode, setAudienceMode] = useState<AudienceMode>('all_parents');
  const [classId, setClassId] = useState('');
  const [rolePick, setRolePick] = useState<UserRole>('parent');
  const [contentAr, setContentAr] = useState('');
  const [contentEn, setContentEn] = useState('');
  const [channels, setChannels] = useState<BroadcastChannel[]>(['in_app']);
  const [sendMode, setSendMode] = useState<'now' | 'later'>('now');
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('xo_ai_prefill');
      if (!raw) return;
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (data.type !== 'broadcast') return;
      sessionStorage.removeItem('xo_ai_prefill');
      if (typeof data.message === 'string' && data.message) {
        const msg = data.message;
        setContentAr(msg);
        setContentEn(msg);
      }
      if (data.audience === 'all_parents') {
        setAudienceMode('all_parents');
      }
    } catch {
      /* ignore */
    }
  }, []);

  const classesQuery = useQuery({
    queryKey: ['broadcast-classes', profile?.nursery_id],
    queryFn: async (): Promise<ClassRow[]> => {
      if (!profile?.nursery_id) return [];
      const { data, error } = await supabase
        .from('classes')
        .select('id, name_ar, name_en')
        .eq('nursery_id', profile.nursery_id);
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
    enabled: Boolean(profile?.nursery_id),
  });

  const audienceScope: BroadcastAudienceScope = useMemo(() => {
    if (audienceMode === 'all_parents') return 'all_parents';
    if (audienceMode === 'class') return 'class';
    return 'role';
  }, [audienceMode]);

  const targetRole: UserRole = useMemo(() => {
    if (audienceMode === 'all_parents' || audienceMode === 'class') return 'parent';
    return rolePick;
  }, [audienceMode, rolePick]);

  const classLabel = useMemo(
    () => (row: ClassRow) =>
      languagePref === 'ar'
        ? row.name_ar
        : languagePref === 'en'
          ? row.name_en
          : `${row.name_ar} / ${row.name_en}`,
    [languagePref],
  );

  const audienceSummary = useMemo(() => {
    if (audienceMode === 'all_parents') return t('broadcastPage.audienceAllParents');
    if (audienceMode === 'class') {
      const row = classesQuery.data?.find((c) => c.id === classId);
      return row ? `${t('broadcastHistory.audienceClass')}: ${classLabel(row)}` : t('broadcastPage.selectClass');
    }
    const roleLabel =
      rolePick === 'parent'
        ? t('broadcastPage.roleParent')
        : rolePick === 'teacher'
          ? t('broadcastPage.roleTeacher')
          : t('broadcastPage.roleBranchAdmin');
    return t('broadcastHistory.audienceRole', { role: roleLabel });
  }, [audienceMode, classId, classesQuery.data, classLabel, rolePick, t]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !profile?.nursery_id) throw new Error('auth');
      if (!contentAr.trim() || !contentEn.trim()) throw new Error('content');
      if (!channels.length) throw new Error('channels');
      if (audienceMode === 'class' && !classId) throw new Error('audience');

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

      const insertPayload = {
        nursery_id: profile.nursery_id,
        sender_id: user.id,
        target_role: targetRole,
        content_ar: contentAr.trim(),
        content_en: contentEn.trim(),
        audience_scope: audienceScope,
        class_id: audienceMode === 'class' ? classId : null,
        channels,
        scheduled_for: scheduleIso,
        sent_at: null as string | null,
        delivery_status: (sendMode === 'later' ? 'scheduled' : 'draft') as 'scheduled' | 'draft',
      };

      const { data: created, error: insErr } = await supabase
        .from('broadcast_messages')
        .insert(insertPayload as never)
        .select(
          'id, nursery_id, audience_scope, class_id, target_role, channels, content_ar, content_en',
        )
        .single();
      if (insErr) throw insErr;
      if (!created) throw new Error('insert');

      if (sendMode === 'later') {
        return { scheduled: true };
      }

      const notifType = audienceScope === 'class' ? 'class_announcement' : 'broadcast';
      await runBroadcastDeliveryPipeline({
        row: created as never,
        titleAr: t('broadcastPage.notificationTitleAr'),
        titleEn: t('broadcastPage.notificationTitleEn'),
        notificationType: notifType,
      });
      return { scheduled: false };
    },
    onSuccess: (res) => {
      if (res.scheduled) {
        toast.success(t('broadcastPage.scheduledToast'));
      } else {
        toast.success(t('broadcastPage.sentToast'));
      }
      setContentAr('');
      setContentEn('');
      setChannels(['in_app']);
      setSendMode('now');
      setScheduledLocal('');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'content') toast.error(t('broadcastPage.validationContent'));
      else if (msg === 'channels') toast.error(t('broadcastPage.validationChannels'));
      else if (msg === 'audience') toast.error(t('broadcastPage.validationAudience'));
      else if (msg === 'schedule' || msg === 'schedule_past') {
        toast.error(t('broadcastPage.validationSchedule'));
      } else if (msg === 'no_recipients') toast.error(t('broadcastPage.noRecipientsToast'));
      else toast.error(t('broadcastPage.errorToast'));
    },
  });

  const whenSummary =
    sendMode === 'later' && scheduledLocal
      ? new Date(scheduledLocal).toLocaleString()
      : t('broadcastPage.previewNow');

  if (!profile?.nursery_id) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-on-surface">{t('broadcastPage.title')}</h1>
        <p className="text-sm text-on-surface-variant">{t('broadcastPage.subtitle')}</p>
      </div>

      <AdminBroadcastFormSections
        audienceMode={audienceMode}
        onAudienceMode={setAudienceMode}
        classId={classId}
        onClassId={setClassId}
        rolePick={rolePick}
        onRolePick={setRolePick}
        classes={classesQuery.data ?? []}
        classLabel={classLabel}
        contentAr={contentAr}
        onContentAr={setContentAr}
        contentEn={contentEn}
        onContentEn={setContentEn}
        channels={channels}
        onChannels={setChannels}
        sendMode={sendMode}
        onSendMode={setSendMode}
        scheduledLocal={scheduledLocal}
        onScheduledLocal={setScheduledLocal}
        onPreview={() => setPreviewOpen(true)}
        onSubmit={() => void sendMutation.mutateAsync()}
        submitPending={sendMutation.isPending}
        submitDisabled={
          !contentAr.trim() ||
          !contentEn.trim() ||
          !channels.length ||
          (audienceMode === 'class' && !classId)
        }
      />

      <BroadcastPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        audienceSummary={audienceSummary}
        channels={channels}
        whenSummary={whenSummary}
        contentAr={contentAr}
        contentEn={contentEn}
      />
    </div>
  );
}
