import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { CopyQrLinkButton } from '@/components/qr/CopyQrLinkButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { Skeleton } from '@/components/ui/skeleton';
import { useQrTokenGeneration } from '@/hooks/useQrTokenGeneration';
import { cn } from '@/lib/utils';

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
  /** Largest QR display size in px; it shrinks to fit narrow screens. */
  qrSize?: number;
  /** If false, hide print (e.g. parent hub uses download only) */
  showPrint?: boolean;
}

/** The backup code is valid for 5 minutes. */
const MANUAL_CODE_TTL_SECONDS = 300;
const MANUAL_CODE_LOW_SECONDS = 60;

/** Scanner-style brackets around the QR frame. */
const QR_CORNERS = [
  '-left-1 -top-1 rounded-tl-[24px] border-l-[3px] border-t-[3px]',
  '-right-1 -top-1 rounded-tr-[24px] border-r-[3px] border-t-[3px]',
  '-bottom-1 -left-1 rounded-bl-[24px] border-b-[3px] border-l-[3px]',
  '-bottom-1 -right-1 rounded-br-[24px] border-b-[3px] border-r-[3px]',
];

/** Download / copy link / print: icon above the label so three fit on a phone. */
const ACTION_TILE = 'h-auto min-h-16 flex-col gap-1 whitespace-normal px-2 py-3 text-xs leading-4';

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

export function ChildQrCodeCard({
  child,
  languagePref,
  qrSize = 220,
  showPrint = true,
}: ChildQrCodeCardProps) {
  const { t, i18n } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const autoRefreshStarted = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState<string | null>(null);
  const [manualCodeExpiresAt, setManualCodeExpiresAt] = useState<string | null>(null);
  const [showManualToken, setShowManualToken] = useState(false);
  const [clockNow, setClockNow] = useState(0);

  const childName = useMemo(() => {
    const ar = child.full_name_ar?.trim() ?? '';
    const en = child.full_name_en?.trim() ?? '';
    if (languagePref === 'ar') return ar || en;
    if (languagePref === 'en') return en || ar;
    if (ar && en && ar !== en) return `${ar} / ${en}`;
    return ar || en;
  }, [child.full_name_ar, child.full_name_en, languagePref]);
  // Latin initials read better in the small tile when the English name is shown too.
  const initials = initialsOf(languagePref === 'ar' ? childName : child.full_name_en?.trim() || childName);

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
  const manualCodeLow = remainingSeconds <= MANUAL_CODE_LOW_SECONDS;
  const countdown = `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;
  const manualDigits = manualCode ? Array.from(manualCode) : [];

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

  // Prints only the QR and the child's name, not the whole dashboard page.
  const printQr = () => {
    const canvas = canvasRef.current;
    if (!canvas || !printableValue) {
      toast.error(t('qr.custom.exportMissing'));
      return;
    }
    const popup = window.open('', '_blank', 'width=720,height=860');
    if (!popup) {
      toast.error(t('qr.custom.printBlocked'));
      return;
    }
    const doc = popup.document;
    doc.title = t('qr.card.printTitle');
    doc.documentElement.dir = i18n.dir();
    const style = doc.createElement('style');
    style.textContent = [
      'body { font-family: Arial, sans-serif; margin: 40px; text-align: center; color: #111827; }',
      'h1 { font-size: 22px; margin: 0 0 8px; }',
      'p { margin: 6px 0; color: #4b5563; }',
      'img { width: 280px; height: 280px; margin: 24px auto; display: block; }',
    ].join('\n');
    doc.head.append(style);
    const heading = doc.createElement('h1');
    heading.textContent = t('qr.card.printTitle');
    const name = doc.createElement('p');
    name.textContent = childName;
    const image = doc.createElement('img');
    image.alt = '';
    const hint = doc.createElement('p');
    hint.textContent = t('qr.card.scanHint');
    image.onload = () => {
      popup.addEventListener('afterprint', () => popup.close());
      popup.focus();
      popup.print();
    };
    image.src = canvas.toDataURL('image/png');
    doc.body.append(heading, name, image, hint);
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
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
      <header className="flex items-start gap-3 border-b border-outline-variant bg-surface-container-lowest p-4 sm:p-5">
        {child.avatar_url ? (
          <img src={child.avatar_url} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" loading="lazy" decoding="async" />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary" aria-hidden>
            {initials}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="min-w-0 break-words text-base font-semibold leading-6 text-on-surface">{childName}</h3>
            <Badge variant="success" className="gap-1 rounded-full">
              <span className="material-symbols-outlined text-sm" aria-hidden>verified</span>
              {t('qr.parentPage.alwaysAvailable')}
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-on-surface-variant">{t('qr.card.scanHint')}</p>
        </div>
      </header>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex items-center justify-center rounded-lg bg-surface-container-lowest px-4 py-6 lg:px-6">
          <div className="relative w-full rounded-lg bg-white p-4 shadow-sm" style={{ maxWidth: qrSize + 32 }}>
            {QR_CORNERS.map((corner) => (
              <span key={corner} className={cn('pointer-events-none absolute h-10 w-10 border-primary', corner)} aria-hidden />
            ))}
            {token ? (
              <QRCodeSVG
                value={printableValue}
                size={qrSize}
                className={cn('block h-auto w-full transition-opacity', isPending && 'opacity-25')}
                aria-label={childName}
              />
            ) : (
              <Skeleton className="aspect-square w-full bg-neutral-200" style={{ maxWidth: qrSize }} />
            )}
            {isPending && token ? (
              <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
                <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="pointer-events-none fixed -left-[9999px] top-0 opacity-0" aria-hidden>
          {printableValue ? (
            <QRCodeCanvas ref={canvasRef} value={printableValue} size={512} marginSize={2} />
          ) : null}
        </div>

        <div className="min-w-0 space-y-4 lg:self-start">
          <div className={cn('grid gap-2', showPrint ? 'grid-cols-3' : 'grid-cols-2')}>
            <Button type="button" variant="outline" className={ACTION_TILE} onClick={downloadPng} disabled={!token}>
              <span className="material-symbols-outlined text-xl" aria-hidden>download</span>
              {t('qr.download')}
            </Button>
            <CopyQrLinkButton url={printableValue} stacked className={ACTION_TILE} />
            {showPrint ? (
              <Button type="button" variant="outline" className={ACTION_TILE} onClick={printQr} disabled={!token}>
                <span className="material-symbols-outlined text-xl" aria-hidden>print</span>
                {t('qr.print')}
              </Button>
            ) : null}
          </div>

          {manualCode ? (
            <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-lg" aria-hidden>pin</span>
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface">{t('qr.card.backupTitle')}</p>
                  <p className="mt-0.5 text-xs leading-5 text-on-surface-variant">{t('qr.card.backupHint')}</p>
                </div>
              </div>

              {manualCodeExpired ? (
                <p className="mt-4 flex items-center gap-2 rounded-md bg-error/10 px-3 py-2 text-sm font-medium text-error" role="status">
                  <span className="material-symbols-outlined animate-spin text-base" aria-hidden>progress_activity</span>
                  {t('qr.manualCodeExpired')}
                </p>
              ) : (
                <>
                  <div dir="ltr" className="mt-4 flex select-all items-center justify-center gap-1.5" aria-hidden>
                    {manualDigits.map((digit, index) => (
                      <Fragment key={index}>
                        {index > 0 && index === Math.floor(manualDigits.length / 2) ? (
                          <span className="h-0.5 w-2 shrink-0 rounded-full bg-outline" />
                        ) : null}
                        <span
                          className={cn(
                            'flex h-12 min-w-0 max-w-11 flex-1 items-center justify-center rounded-md border border-outline-variant bg-surface font-mono text-xl font-bold text-on-surface',
                            !showManualToken && 'text-on-surface-variant',
                          )}
                        >
                          {showManualToken ? digit : '•'}
                        </span>
                      </Fragment>
                    ))}
                  </div>
                  <span className="sr-only">{showManualToken ? manualCode : t('qr.card.codeHidden')}</span>
                </>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={showManualToken}
                  onClick={() => setShowManualToken((visible) => !visible)}
                  disabled={manualCodeExpired}
                >
                  <span className="material-symbols-outlined me-1 text-base" aria-hidden>
                    {showManualToken ? 'visibility_off' : 'visibility'}
                  </span>
                  {showManualToken ? t('qr.card.hideCode') : t('qr.card.showCode')}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void copyToken()} disabled={manualCodeExpired}>
                  <span className="material-symbols-outlined me-1 text-base" aria-hidden>content_copy</span>
                  {t('qr.card.copyCode')}
                </Button>
              </div>

              {!manualCodeExpired ? (
                <div className="mt-4">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-on-surface-variant">
                      {t('qr.manualCodeCountdown')}{' '}
                      <span dir="ltr" role="timer" className={cn('font-mono font-semibold tabular-nums', manualCodeLow ? 'text-warning' : 'text-on-surface')}>
                        {countdown}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="tertiary"
                      size="sm"
                      className="h-8 shrink-0 px-2"
                      onClick={() => void fetchToken(false, true)}
                      disabled={isPending}
                    >
                      <span className="material-symbols-outlined me-1 text-base" aria-hidden>refresh</span>
                      {t('qr.refreshManualCode')}
                    </Button>
                  </div>
                  <div
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-container-high"
                    role="progressbar"
                    aria-label={t('qr.manualCodeCountdown')}
                    aria-valuemin={0}
                    aria-valuemax={MANUAL_CODE_TTL_SECONDS}
                    aria-valuenow={remainingSeconds}
                  >
                    <div
                      className={cn('h-full rounded-full transition-[width] duration-1000', manualCodeLow ? 'bg-warning' : 'bg-primary')}
                      style={{ width: `${Math.min(100, (remainingSeconds / MANUAL_CODE_TTL_SECONDS) * 100)}%` }}
                    />
                  </div>
                </div>
              ) : null}
              <p className="mt-3 text-[11px] leading-4 text-on-surface-variant">{t('qr.manualCodeRefreshHint')}</p>
            </div>
          ) : !token ? (
            <Skeleton className="h-48 w-full" />
          ) : null}
        </div>
      </div>

      <footer className="flex flex-col gap-3 border-t border-outline-variant bg-surface-container-lowest px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="flex items-start gap-2 text-xs leading-5 text-on-surface-variant">
          <span className="material-symbols-outlined text-base text-warning" aria-hidden>gpp_maybe</span>
          {t('qr.card.revokeHint')}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 border-error/40 text-error hover:bg-error/10"
          onClick={() => void refreshToken()}
          disabled={isPending}
        >
          <span className="material-symbols-outlined me-1 text-base" aria-hidden>refresh</span>
          {t('qr.rotate')}
        </Button>
      </footer>
    </section>
  );
}
