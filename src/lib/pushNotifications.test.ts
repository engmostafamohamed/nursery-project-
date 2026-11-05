import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPushStatus, subscribeToPushStatus, turnOffPush, turnOnPush } from '@/lib/pushNotifications';

const pushSubscription = vi.hoisted(() => ({
  upsertPushSubscription: vi.fn(async () => ({ error: null as Error | null })),
  deletePushSubscription: vi.fn(async () => ({ error: null as Error | null })),
}));
vi.mock('@/lib/pushSubscription', () => pushSubscription);

const ACCOUNT = 'account-a';

type Permission = 'default' | 'granted' | 'denied';

/** A browser with notifications, whose permission prompt will be answered with `answer`. */
function stubBrowser(permission: Permission, answer: Permission = permission, subscription: unknown = null) {
  const store = new Map<string, string>();
  const notification = {
    permission,
    requestPermission: vi.fn(async () => {
      notification.permission = answer;
      return answer;
    }),
  };
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  });
  vi.stubGlobal('Notification', notification);
  const registration = {
    pushManager: {
      getSubscription: vi.fn(async () => subscription),
      subscribe: vi.fn(async () => ({ endpoint: 'https://push.example/new' })),
    },
  };
  vi.stubGlobal('navigator', {
    serviceWorker: { ready: Promise.resolve(registration), getRegistration: vi.fn(async () => registration) },
  });
  vi.stubGlobal('window', {
    Notification: notification,
    PushManager: class {},
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  return { notification, registration };
}

describe('browser notifications on this device', () => {
  beforeEach(() => {
    pushSubscription.upsertPushSubscription.mockClear();
    pushSubscription.deletePushSubscription.mockClear();
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'AQAB');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('asks only while the account has not answered on this device', async () => {
    stubBrowser('default', 'granted');
    expect(getPushStatus(ACCOUNT)).toBe('unanswered');

    await turnOffPush(ACCOUNT);

    expect(getPushStatus(ACCOUNT)).toBe('off');
    expect(getPushStatus('account-b')).toBe('unanswered');
  });

  it('asks an account that has not answered even when the browser already allows notifications', () => {
    stubBrowser('granted');
    expect(getPushStatus(ACCOUNT)).toBe('unanswered');
  });

  it('turning on asks the browser, saves the answer and subscribes the device', async () => {
    const { notification, registration } = stubBrowser('default', 'granted');

    await turnOnPush(ACCOUNT);

    expect(notification.requestPermission).toHaveBeenCalledOnce();
    expect(getPushStatus(ACCOUNT)).toBe('on');
    expect(registration.pushManager.subscribe).toHaveBeenCalledOnce();
    expect(pushSubscription.upsertPushSubscription).toHaveBeenCalledWith(ACCOUNT, { endpoint: 'https://push.example/new' });
  });

  it('closing the browser prompt counts as an answer, so the popup does not come back', async () => {
    const { registration } = stubBrowser('default', 'default');

    await turnOnPush(ACCOUNT);

    expect(getPushStatus(ACCOUNT)).toBe('off');
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('a refusal in the browser leaves the setting blocked, whatever was chosen', async () => {
    stubBrowser('default', 'denied');
    await turnOnPush(ACCOUNT);
    expect(getPushStatus(ACCOUNT)).toBe('blocked');
  });

  it('never popups on a browser without notifications', () => {
    stubBrowser('default');
    vi.stubGlobal('window', {});
    expect(getPushStatus(ACCOUNT)).toBe('unsupported');
  });

  it('without a VAPID key it still turns on, for notifications while the app is open', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');
    const { registration } = stubBrowser('default', 'granted');

    await turnOnPush(ACCOUNT);

    expect(getPushStatus(ACCOUNT)).toBe('on');
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('turning off removes the device subscription and its saved row', async () => {
    const unsubscribe = vi.fn(async () => true);
    stubBrowser('granted', 'granted', { endpoint: 'https://push.example/old', unsubscribe });

    await turnOffPush(ACCOUNT);

    expect(getPushStatus(ACCOUNT)).toBe('off');
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(pushSubscription.deletePushSubscription).toHaveBeenCalledWith(ACCOUNT, 'https://push.example/old');
  });

  it('turning off holds on this device even when the saved row cannot be removed', async () => {
    pushSubscription.deletePushSubscription.mockResolvedValueOnce({ error: new Error('offline') });
    stubBrowser('granted', 'granted', { endpoint: 'https://push.example/old', unsubscribe: vi.fn(async () => true) });

    await expect(turnOffPush(ACCOUNT)).rejects.toThrow('offline');

    expect(getPushStatus(ACCOUNT)).toBe('off');
  });

  it('tells listeners about a change until they unsubscribe', async () => {
    stubBrowser('default');
    const listener = vi.fn();
    const unsubscribe = subscribeToPushStatus(listener);

    await turnOffPush(ACCOUNT);
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    await turnOffPush(ACCOUNT);
    expect(listener).toHaveBeenCalledOnce();
  });
});
