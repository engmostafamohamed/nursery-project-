import { useTranslation } from 'react-i18next';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import type { PushStatus } from '@/lib/pushNotifications';

/** Why the setting cannot be changed from here, for the states the app has no say in. */
const LOCKED_REASON: Partial<Record<PushStatus, string>> = {
  blocked: 'push.settingsBlocked',
  unsupported: 'push.settingsUnsupported',
};

export function PushNotificationsCard() {
  const { t } = useTranslation();
  const { status, turnOn, turnOff } = usePushNotifications();
  const lockedReason = LOCKED_REASON[status];

  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
      <h2 className="text-base font-semibold text-on-surface">{t('push.settingsTitle')}</h2>
      <p className="mt-1 text-xs text-on-surface-variant">{t('push.settingsSubtitle')}</p>
      <div className="mt-4 flex min-h-11 items-start gap-3">
        <Checkbox
          id="xo-pref-push"
          checked={status === 'on'}
          disabled={Boolean(lockedReason)}
          onCheckedChange={(checked) => (checked === true ? turnOn() : turnOff())}
          className="mt-1"
        />
        <Label htmlFor="xo-pref-push" className="cursor-pointer text-sm font-normal leading-snug">
          {t('push.settingsToggle')}
        </Label>
      </div>
      {lockedReason ? <p className="mt-2 text-xs text-on-surface-variant">{t(lockedReason)}</p> : null}
    </section>
  );
}
