import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { flushOfflineQueue, getPendingCount, subscribeOfflineQueue } from '@/lib/offlineRequestQueue';

function subscribeOnline(onStoreChange: () => void) {
  return onlineManager.subscribe(onStoreChange);
}

function getOnlineSnapshot() {
  return onlineManager.isOnline();
}

function getServerOnlineSnapshot() {
  return true;
}

export function OfflineIndicator() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnlineSnapshot);
  const [pending, setPending] = useState(() => getPendingCount());

  useEffect(() => {
    return subscribeOfflineQueue(() => setPending(getPendingCount()));
  }, []);

  useEffect(() => {
    const unsub = onlineManager.subscribe(() => {
      if (onlineManager.isOnline()) {
        void queryClient.resumePausedMutations();
        void flushOfflineQueue();
        void queryClient.invalidateQueries();
      }
    });
    return unsub;
  }, [queryClient]);

  if (online && pending === 0) return null;

  return (
    <div
      className="sticky top-0 z-40 border-b border-outline-variant bg-error-container/90 px-4 py-2 text-on-error-container backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label={!online ? t('pwa.offlineStatusAria') : undefined}
    >
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 text-sm">
        {!online ? (
          <>
            <span className="material-symbols-outlined h-4 w-4 shrink-0 text-base" aria-hidden>
              cloud_off
            </span>
            <span>{t('pwa.offlineBanner')}</span>
          </>
        ) : null}
        {pending > 0 ? (
          <span className={!online ? 'border-s border-outline-variant ps-2' : ''}>
            {t('pwa.syncPending', { count: pending })}
          </span>
        ) : null}
      </div>
    </div>
  );
}
