import { Download, Share2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { trackPwaInstallEvent } from '@/lib/pwaInstallAnalytics';

const SNOOZE_KEY = 'xo_pwa_install_snooze_until';

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isSnoozed(): boolean {
  const raw = localStorage.getItem(SNOOZE_KEY);
  if (!raw) return false;
  const until = Number(raw);
  return Number.isFinite(until) && Date.now() < until;
}

export function PWAInstallPrompt() {
  const { t } = useTranslation();

  const [openIos, setOpenIos] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (isStandalone() || isSnoozed() || !isIos()) return false;
    const seen = sessionStorage.getItem('xo_pwa_ios_hint');
    if (seen) return false;
    sessionStorage.setItem('xo_pwa_ios_hint', '1');
    trackPwaInstallEvent('ios_hint_shown');
    return true;
  });

  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  const snoozed = useCallback(() => isSnoozed(), []);

  useEffect(() => {
    if (isStandalone() || snoozed()) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
      trackPwaInstallEvent('prompt_shown');
    };

    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, [snoozed]);

  useEffect(() => {
    const onInstalled = () => {
      trackPwaInstallEvent('install_completed');
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  const dismiss = () => {
    const until = Date.now() + 7 * 24 * 60 * 60 * 1000;
    localStorage.setItem(SNOOZE_KEY, String(until));
    setVisible(false);
    setDeferred(null);
    trackPwaInstallEvent('install_dismissed');
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === 'accepted') {
      trackPwaInstallEvent('install_accepted');
    }
    setDeferred(null);
    setVisible(false);
  };

  if (!visible && !openIos) return null;

  return (
    <>
      {visible ? (
        <Card className="mb-4 border-secondary/30 bg-surface-container-lowest">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Download className="mt-0.5 h-5 w-5 shrink-0 text-secondary rtl:scale-x-[-1]" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-on-surface">{t('pwa.installTitle')}</p>
                <p className="mt-1 text-xs text-on-surface-variant">{t('pwa.installBody')}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void install()} aria-label={t('pwa.installCta')}>
                {t('pwa.installCta')}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={dismiss} aria-label={t('pwa.later')}>
                {t('pwa.later')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={openIos} onOpenChange={setOpenIos}>
        <DialogContent aria-describedby="pwa-ios-desc">
          <DialogHeader>
            <DialogTitle>{t('pwa.iosTitle')}</DialogTitle>
            <DialogDescription id="pwa-ios-desc">{t('pwa.iosIntro')}</DialogDescription>
          </DialogHeader>
          <ol className="list-decimal space-y-2 ps-4 text-sm text-on-surface">
            <li className="flex gap-2">
              <Share2 className="h-4 w-4 shrink-0 text-secondary rtl:scale-x-[-1]" aria-hidden />
              <span>{t('pwa.iosStep1')}</span>
            </li>
            <li>{t('pwa.iosStep2')}</li>
            <li>{t('pwa.iosStep3')}</li>
          </ol>
          <Button type="button" className="w-full" onClick={() => setOpenIos(false)} aria-label={t('common.continue')}>
            {t('common.continue')}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
