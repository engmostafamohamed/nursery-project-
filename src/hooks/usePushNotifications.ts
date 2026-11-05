import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useAuthSession } from '@/hooks/useAuthSession';
import { getPushStatus, subscribeToPushStatus, turnOffPush, turnOnPush, type PushStatus } from '@/lib/pushNotifications';

/** The signed-in account's browser notifications on this device, and the two ways to change them. */
export function usePushNotifications() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const userId = user?.id;

  const status = useSyncExternalStore<PushStatus>(subscribeToPushStatus, () =>
    userId ? getPushStatus(userId) : 'unsupported',
  );

  const change = (apply: (userId: string) => Promise<void>) => {
    if (!userId) return;
    apply(userId).catch(() => toast.error(t('errors.pushSubscriptionSave')));
  };

  return {
    status,
    turnOn: () => change(turnOnPush),
    turnOff: () => change(turnOffPush),
  };
}
