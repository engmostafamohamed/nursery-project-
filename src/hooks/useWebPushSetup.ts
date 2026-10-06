import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { notificationText, type NotificationTextRow } from '@/lib/notificationText';
import { upsertPushSubscription } from '@/lib/pushSubscription';
import { supabase } from '@/lib/supabase';

type AttendancePayload = { childName: string; at: number };

function toUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function isEgyptQuietHours(): boolean {
  const cairoHour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Africa/Cairo' }).format(
      new Date(),
    ),
  );
  return cairoHour >= 21 || cairoHour < 7;
}

function shouldShowPushPrompt(): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  const dismissed = localStorage.getItem('xo_push_prompt_dismissed');
  const enabled = localStorage.getItem('xo_push_enabled');
  return !dismissed && !enabled && Notification.permission !== 'granted';
}

export function useWebPushSetup(userId: string | undefined) {
  const { t } = useTranslation();
  const [showPrompt, setShowPrompt] = useState(false);
  const queueRef = useRef<AttendancePayload[]>([]);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    setShowPrompt(shouldShowPushPrompt());
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`push-user-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        async (payload) => {
          if (Notification.permission !== 'granted' || isEgyptQuietHours()) return;
          const row = payload.new as NotificationTextRow & { type: string };
          const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';
          const { title, body } = notificationText(row, lang);

          const registration = await navigator.serviceWorker.getRegistration();
          if (!registration) return;

          if (row.type.includes('attendance')) {
            queueRef.current.push({ childName: body, at: Date.now() });
            if (!timeoutRef.current) {
              timeoutRef.current = window.setTimeout(async () => {
                const items = queueRef.current.filter((x) => Date.now() - x.at <= 2 * 60 * 1000);
                queueRef.current = [];
                timeoutRef.current = null;
                if (items.length >= 2) {
                  await registration.showNotification(
                    t('push.batchedTitle'),
                    { body: t('push.batchedBody', { count: items.length }), tag: 'attendance-batch' },
                  );
                } else if (items.length === 1) {
                  await registration.showNotification(title, { body, tag: `attendance-${Date.now()}` });
                }
              }, 2 * 60 * 1000);
            }
            return;
          }

          await registration.showNotification(title, { body, tag: `xo-${Date.now()}` });
        },
      )
      .subscribe();

    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      void supabase.removeChannel(channel);
    };
  }, [t, userId]);

  const enablePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !userId) return;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const registration = await navigator.serviceWorker.register('/sw.js');
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toUint8Array(vapidKey),
    });

    const { error } = await upsertPushSubscription(userId, subscription);
    if (error) {
      toast.error(t('errors.pushSubscriptionSave'));
    }

    localStorage.setItem('xo_push_enabled', '1');
    localStorage.setItem('xo_push_prompt_dismissed', '1');
    setShowPrompt(false);
  };

  const dismissPrompt = () => {
    localStorage.setItem('xo_push_prompt_dismissed', '1');
    setShowPrompt(false);
  };

  return { showPrompt, enablePush, dismissPrompt };
}
