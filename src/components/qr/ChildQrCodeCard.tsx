import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { CopyQrLinkButton } from '@/components/qr/CopyQrLinkButton';
import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { useQrTokenGeneration } from '@/hooks/useQrTokenGeneration';

export interface ChildQrInput {
  id: string;
  nursery_id: string;
  full_name_ar: string;
  full_name_en: string;
  avatar_url?: string | null;
}

type NurseryLanguagePref = 'ar' | 'en' | 'both';

interface ChildQrCodeCardProps {
  child: ChildQrInput;
  languagePref: NurseryLanguagePref;
  /** QR display size in px */
  qrSize?: number;
  /** If false, hide print (e.g. parent hub uses download only) */
  showPrint?: boolean;
}

export function ChildQrCodeCard({
  child,
  languagePref,
  qrSize = 220,
  showPrint = true,
}: ChildQrCodeCardProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const autoRefreshStarted = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState<string | null>(null);
  const [manualCodeExpiresAt, setManualCodeExpiresAt] = useState<string | null>(null);
  const [showManualToken, setShowManualToken] = useState(false);
  const [clockNow, setClockNow] = useState(0);

  const childName = useMemo(() => {
    if (languagePref === 'ar') return child.full_name_ar;
    if (languagePref === 'en') return child.full_name_en;
    return `${child.full_name_ar} / ${child.full_name_en}`;
  }, [child, languagePref]);

  const { mutateAsync: generateQrToken, isPending } = useQrTokenGeneration();

  const fetchToken = useCallback(async (rotate = false, announceManualRefresh = false) => {
    try {
      const data = await generateQrToken({
        child_id: child.id,
        nursery_id: child.nursery_id,
        purpose: 'parent',
        ...(rotate ? { rotate: true } : {}),
      });
      setToken(data.token);
      setManualCode(data.manual_code ?? null);
      setManualCodeExpiresAt(data.manual_code_expires_at ?? null);
      setClockNow(Date.now());
      autoRefreshStarted.current = false;
      if (rotate) toast.success(t('qr.rotated'));
      else if (announceManualRefresh) toast.success(t('qr.manualCodeRefreshed'));
    } catch {
      toast.error(t('qr.errors.generateFailed'));
    }
  }, [child.id, child.nursery_id, generateQrToken, t]);

  useEffect(() => {
    // This starts an async request; state is updated only after the server responds.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchToken(false);
  }, [fetchToken]);

  useEffect(() => {
    if (!manualCodeExpiresAt) return;
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [manualCodeExpiresAt]);

  const expiryTime = manualCodeExpiresAt ? Date.parse(manualCodeExpiresAt) : null;
  const remainingSeconds = expiryTime === null || !Number.isFinite(expiryTime)
    ? 0
    : Math.max(0, Math.ceil((expiryTime - clockNow) / 1000));
  const manualCodeExpired = Boolean(manualCode) && remainingSeconds === 0;
  const countdown = `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;

  useEffect(() => {
    if (!manualCodeExpired || autoRefreshStarted.current) return;
    autoRefreshStarted.current = true;
    // This starts an async refresh request; state is updated after the server responds.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchToken(false, true);
  }, [fetchToken, manualCodeExpired]);

  const printableValue = token
    ? `${window.location.origin}/qr/verify?token=${encodeURIComponent(token)}`
    : '';

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas || !printableValue) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `xo-qr-${child.id.slice(0, 8)}.png`;
    a.click();
  };

  const refreshToken = async () => {
    const accepted = await confirm({
      title: t('qr.refreshConfirm.title'),
      description: t('qr.refreshConfirm.description'),
      confirmText: t('qr.refreshConfirm.confirm'),
      variant: 'danger',
      icon: 'refresh',
    });
    if (accepted) await fetchToken(true);
  };

  const copyToken = async () => {
    if (!manualCode || manualCodeExpired) return;
    try {
      await navigator.clipboard.writeText(manualCode);
      toast.success(t('qr.tokenCopied'));
    } catch {
      setShowManualToken(true);
      toast.error(t('qr.copyTokenFailed'));
    }
  };

  return (
    <section className="rounded-3xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
      <h3 className="text-base font-semibold text-on-surface">{childName}</h3>
      <p className="mt-1 text-sm font-medium text-on-surface">{t('qr.parentPage.alwaysAvailable')}</p>
      <p className="mt-0.5 text-xs text-on-surface-variant">{t('qr.parentPage.alwaysAvailableHint')}</p>
      <p className="mt-1 text-xs text-on-surface-variant">{t('qr.parentPage.manualHint')}</p>

      <div className="mt-4 flex justify-center rounded-2xl bg-white p-4 print:border print:border-outline-variant">
        {token ? (
          <QRCodeSVG value={printableValue} size={qrSize} />
        ) : (
          <p className="text-sm text-on-surface-variant">{t('common.loading')}</p>
        )}
      </div>

      <div className="pointer-events-none fixed -left-[9999px] top-0 opacity-0" aria-hidden>
        {printableValue ? (
          <QRCodeCanvas ref={canvasRef} value={printableValue} size={512} marginSize={2} />
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={() => void refreshToken()} disabled={isPending}>
          <span className="material-symbols-outlined me-1 text-base" aria-hidden>
            refresh
          </span>
          {t('qr.rotate')}
        </Button>
        <Button type="button" variant="outline" onClick={downloadPng} disabled={!token}>
          <span className="material-symbols-outlined me-1 text-base" aria-hidden>
            download
          </span>
          {t('qr.download')}
        </Button>
        <CopyQrLinkButton url={printableValue} className={showPrint ? undefined : 'col-span-2'} />
        {showPrint ? (
          <Button type="button" variant="outline" onClick={() => window.print()}>
            <span className="material-symbols-outlined me-1 text-base" aria-hidden>
              print
            </span>
            {t('qr.print')}
          </Button>
        ) : null}
      </div>

      {manualCode ? (
        <div className="mt-3 rounded-xl border border-outline-variant bg-surface p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-auto px-1 py-1 text-sm"
              aria-expanded={showManualToken}
              onClick={() => setShowManualToken((visible) => !visible)}
            >
              <span className="material-symbols-outlined me-1 text-base" aria-hidden>
                {showManualToken ? 'visibility_off' : 'password'}
              </span>
              {t(showManualToken ? 'qr.hideToken' : 'qr.showToken')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void copyToken()} disabled={manualCodeExpired}>
              <span className="material-symbols-outlined me-1 text-base" aria-hidden>content_copy</span>
              {t('qr.copyToken')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void fetchToken(false, true)} disabled={isPending}>
              <span className="material-symbols-outlined me-1 text-base" aria-hidden>refresh</span>
              {t('qr.refreshManualCode')}
            </Button>
          </div>
          {showManualToken && !manualCodeExpired ? (
            <code dir="ltr" className="mt-2 block select-all rounded-lg bg-surface-container-lowest p-3 text-center font-mono text-2xl font-bold tracking-[0.3em] text-on-surface">
              {manualCode}
            </code>
          ) : null}
          <div className="mt-2" aria-live="polite">
            {manualCodeExpired ? (
              <p className="text-sm font-medium text-error">{t('qr.manualCodeExpired')}</p>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-on-surface-variant">
                  <span>{t('qr.manualCodeCountdown')}</span>
                  <span dir="ltr" className="font-mono font-semibold tabular-nums">{countdown}</span>
                </div>
                <div
                  className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-container-high"
                  role="progressbar"
                  aria-label={t('qr.manualCodeCountdown')}
                  aria-valuemin={0}
                  aria-valuemax={300}
                  aria-valuenow={remainingSeconds}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-1000"
                    style={{ width: `${Math.min(100, (remainingSeconds / 300) * 100)}%` }}
                  />
                </div>
              </>
            )}
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">{t('qr.manualCodeRefreshHint')}</p>
        </div>
      ) : null}
    </section>
  );
}
