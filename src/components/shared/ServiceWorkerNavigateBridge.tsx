import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/** Relays SW notificationclick navigation when WindowClient.navigate is unavailable. */
export function ServiceWorkerNavigateBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handler = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | undefined;
      if (data?.type !== 'XO_NAVIGATE' || typeof data.url !== 'string') return;
      try {
        const u = new URL(data.url, window.location.origin);
        navigate(`${u.pathname}${u.search}${u.hash}`);
      } catch {
        navigate(data.url);
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [navigate]);

  return null;
}
