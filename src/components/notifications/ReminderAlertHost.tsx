import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useAuthSession } from '@/hooks/useAuthSession';
import { supabase } from '@/lib/supabase';

/**
 * Listens for personal-reminder notifications (inserted by the
 * run_personal_reminders cron) and pops a persistent "smart alert" toast with
 * Snooze + Dismiss actions when one fires while the app is open. Mount once per
 * authenticated layout (admin / teacher). The notification itself still lands in
 * the notification center independently of this alert.
 */
const SNOOZE_MS = 10 * 60 * 1000;
// Catch reminders that fired in the few minutes right before the app loaded.
const RECENT_WINDOW_MS = 10 * 60 * 1000;

type ReminderNotification = {
  id: string;
  type: string;
  title_ar: string | null;
  title_en: string | null;
  body_ar: string | null;
  body_en: string | null;
  read: boolean;
  sent_at: string;
};

export function ReminderAlertHost() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const userId = user?.id;
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const shownRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    const timers = timersRef.current;
    const lang = i18n.language;

    const pick = (ar: string | null, en: string | null) =>
      lang === 'ar' ? ar?.trim() || en?.trim() || '' : en?.trim() || ar?.trim() || '';

    const markRead = (id: string) => {
      void supabase.from('notifications').update({ read: true } as never).eq('id', id);
    };

    const showAlert = (n: ReminderNotification) => {
      const title = pick(n.title_ar, n.title_en) || t('reminders.alert.label');
      const body = pick(n.body_ar, n.body_en);
      toast.custom(
        (id) => (
          <div className="flex w-[360px] max-w-[88vw] items-start gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-lg">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <span className="material-symbols-outlined" aria-hidden>
                alarm
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                {t('reminders.alert.label')}
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold text-on-surface">{title}</p>
              {body ? (
                <p className="mt-0.5 line-clamp-2 text-xs text-on-surface-variant">{body}</p>
              ) : null}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    toast.dismiss(id);
                    const timer = setTimeout(() => {
                      timers.delete(timer);
                      showAlert(n);
                    }, SNOOZE_MS);
                    timers.add(timer);
                    toast.success(t('reminders.alert.snoozed'));
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-opacity hover:opacity-90"
                >
                  <span className="material-symbols-outlined text-sm" aria-hidden>
                    snooze
                  </span>
                  {t('reminders.alert.snooze')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    markRead(n.id);
                    toast.dismiss(id);
                  }}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                >
                  {t('reminders.alert.dismiss')}
                </button>
              </div>
            </div>
          </div>
        ),
        { id: `reminder-alert-${n.id}`, duration: Infinity },
      );
    };

    const maybeShow = (n: ReminderNotification) => {
      if (n.type !== 'personal_reminder' || n.read) return;
      if (shownRef.current.has(n.id)) return;
      shownRef.current.add(n.id);
      showAlert(n);
    };

    // 1) Reminders that fired just before this layout mounted.
    void (async () => {
      const since = new Date(Date.now() - RECENT_WINDOW_MS).toISOString();
      const { data } = await supabase
        .from('notifications')
        .select('id, type, title_ar, title_en, body_ar, body_en, read, sent_at')
        .eq('user_id', userId)
        .eq('type', 'personal_reminder')
        .eq('read', false)
        .gte('sent_at', since)
        .order('sent_at', { ascending: false })
        .limit(5);
      (data as ReminderNotification[] | null)?.forEach(maybeShow);
    })();

    // 2) Live: new reminder notifications as the cron inserts them.
    const channel = supabase
      .channel(`reminder-alerts-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => maybeShow(payload.new as ReminderNotification),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, [userId, i18n.language, t]);

  return null;
}
