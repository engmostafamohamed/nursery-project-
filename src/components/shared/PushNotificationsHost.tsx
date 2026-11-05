import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePushDelivery } from '@/hooks/usePushDelivery';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useUserProfile } from '@/hooks/useUserProfile';

/**
 * Mount once in each dashboard layout. Delivers browser notifications to those who want them and
 * asks everyone else, once: closing the popup in any way is an answer too. The answer can be
 * changed afterwards from PushNotificationsCard.
 */
export function PushNotificationsHost() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { status, turnOn, turnOff } = usePushNotifications();
  usePushDelivery(user?.id, status === 'on');

  // "Allow" closes the popup at once: the browser's own prompt comes next, and the status only
  // changes when that is answered.
  const [answered, setAnswered] = useState(false);
  const answer = (apply: () => void) => {
    setAnswered(true);
    apply();
  };

  return (
    <Dialog
      open={status === 'unanswered' && !answered}
      onOpenChange={(open) => {
        if (!open) answer(turnOff);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('push.promptTitle')}</DialogTitle>
          <DialogDescription>
            {t(profile?.role === 'parent' ? 'push.promptBody' : 'push.promptBodyStaff')}
          </DialogDescription>
        </DialogHeader>
        <p className="mt-3 text-xs text-on-surface-variant">{t('push.promptHint')}</p>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => answer(turnOff)}>
            {t('push.notNow')}
          </Button>
          <Button onClick={() => answer(turnOn)}>{t('push.allow')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
