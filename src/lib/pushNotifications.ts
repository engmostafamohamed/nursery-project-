import { deletePushSubscription, upsertPushSubscription } from '@/lib/pushSubscription';

/**
 * Browser notifications for one account on this device. The answer is kept on the device, per
 * account, because the browser's permission and its push subscription belong to the device.
 */
export type PushStatus =
  /** This browser cannot show them (e.g. iPhone Safari outside the installed app). */
  | 'unsupported'
  /** Refused in the browser's own settings; the app is not allowed to ask again. */
  | 'blocked'
  /** Never asked: the popup asks, once. */
  | 'unanswered'
  | 'on'
  | 'off';

type PushChoice = 'on' | 'off';

const listeners = new Set<() => void>();

const choiceKey = (userId: string) => `xo_push_choice:${userId}`;

function readChoice(userId: string): PushChoice | null {
  try {
    const stored = localStorage.getItem(choiceKey(userId));
    return stored === 'on' || stored === 'off' ? stored : null;
  } catch {
    return null;
  }
}

function saveChoice(userId: string, choice: PushChoice): void {
  try {
    localStorage.setItem(choiceKey(userId), choice);
  } catch {
    // Blocked storage: the choice holds until the page is reloaded.
  }
  listeners.forEach((listener) => listener());
}

export function getPushStatus(userId: string): PushStatus {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const choice = readChoice(userId);
  if (choice === null) return 'unanswered';
  return choice === 'on' && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Calls back whenever the status may have changed, including from another tab. */
export function subscribeToPushStatus(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function vapidKeyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/** Without a VAPID key there is nothing to subscribe to; notifications still show while the app is open. */
async function subscribeThisDevice(userId: string): Promise<void> {
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey || !('PushManager' in window)) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidKeyToBytes(vapidKey),
  });
  const { error } = await upsertPushSubscription(userId, subscription);
  if (error) throw error;
}

async function unsubscribeThisDevice(userId: string): Promise<void> {
  if (!('PushManager' in window)) return;

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  // The device first: "off" must hold even if the saved row cannot be removed right now.
  await subscription.unsubscribe();
  const { error } = await deletePushSubscription(userId, subscription.endpoint);
  if (error) throw error;
}

/** Call from a click: browsers only show their permission prompt in response to one. */
export async function turnOnPush(userId: string): Promise<void> {
  const permission = await Notification.requestPermission();
  saveChoice(userId, permission === 'granted' ? 'on' : 'off');
  if (permission === 'granted') await subscribeThisDevice(userId);
}

export async function turnOffPush(userId: string): Promise<void> {
  saveChoice(userId, 'off');
  await unsubscribeThisDevice(userId);
}
