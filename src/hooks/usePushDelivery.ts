import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { notificationText, type NotificationTextRow } from '@/lib/notificationText';
import { supabase } from '@/lib/supabase';

const ATTENDANCE_BATCH_MS = 2 * 60 * 1000;

function isEgyptQuietHours(): boolean {
  const cairoHour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Africa/Cairo' }).format(new Date()),
  );
  return cairoHour >= 21 || cairoHour < 7;
}

/**
 * While the app is open and `enabled`, shows each new in-app notification as a browser notification.
 * Attendance ones are held for two minutes so a busy morning arrives as one summary.
 */
export function usePushDelivery(userId: string | undefined, enabled: boolean) {
  const { t } = useTranslation();
  const heldAttendance = useRef<{ title: string; body: string }[]>([]);
  const batchTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!userId || !enabled) return;

    const flushAttendance = async (registration: ServiceWorkerRegistration) => {
      const held = heldAttendance.current;
      heldAttendance.current = [];
      batchTimer.current = null;
      if (held.length >= 2) {
        await registration.showNotification(t('push.batchedTitle'), {
          body: t('push.batchedBody', { count: held.length }),
          tag: 'attendance-batch',
        });
      } else if (held.length === 1) {
        await registration.showNotification(held[0].title, { body: held[0].body, tag: `attendance-${Date.now()}` });
      }
    };

    const channel = supabase
      .channel(`push-user-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        async (payload) => {
          if (isEgyptQuietHours()) return;
          const registration = await navigator.serviceWorker.getRegistration();
          if (!registration) return;

          const row = payload.new as NotificationTextRow & { type: string };
          const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';
          const { title, body } = notificationText(row, lang);

          if (!row.type.includes('attendance')) {
            await registration.showNotification(title, { body, tag: `xo-${Date.now()}` });
            return;
          }
          heldAttendance.current.push({ title, body });
          batchTimer.current ??= window.setTimeout(() => void flushAttendance(registration), ATTENDANCE_BATCH_MS);
        },
      )
      .subscribe();

    return () => {
      if (batchTimer.current !== null) window.clearTimeout(batchTimer.current);
      batchTimer.current = null;
      heldAttendance.current = [];
      void supabase.removeChannel(channel);
    };
  }, [t, userId, enabled]);
}
