import { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Props = {
  onScanResult: (rawText: string) => Promise<boolean>;
  disabled?: boolean;
};

export function QRScanner({ onScanResult, disabled }: Props) {
  const { t } = useTranslation();
  const reactId = useId().replace(/:/g, '');
  const elementId = `html5-qr-${reactId}`;
  const instanceRef = useRef<Html5Qrcode | null>(null);
  const startedRef = useRef(false);
  const busyRef = useRef(false);
  const onScanResultRef = useRef(onScanResult);
  onScanResultRef.current = onScanResult;

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (disabled) return;

    let cancelled = false;
    const instance = new Html5Qrcode(elementId, { verbose: false });
    instanceRef.current = instance;

    const handleDecoded = async (decodedText: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        await instance.pause(true);
        const resume = await onScanResultRef.current(decodedText);
        if (resume && !cancelled && startedRef.current) {
          await instance.resume();
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    };

    const boot = async () => {
      setCameraError(null);
      try {
        await instance.start(
          { facingMode: 'environment' },
          { fps: 8, qrbox: { width: 240, height: 240 } },
          handleDecoded,
          () => {
            /* no QR */
          },
        );
        if (!cancelled) startedRef.current = true;
      } catch (e) {
        if (!cancelled) {
          setCameraError(e instanceof Error ? e.message : t('teacher.scanner.cameraErrorUnknown'));
        }
      }
    };

    void boot();

    return () => {
      cancelled = true;
      startedRef.current = false;
      void instance
        .stop()
        .catch(() => {})
        .finally(() => {
          const el = document.getElementById(elementId);
          if (el) el.innerHTML = '';
        });
      instanceRef.current = null;
    };
  }, [disabled, elementId, retryKey, t]);

  const submitManual = async () => {
    const v = manualCode.trim();
    if (!v || busyRef.current || disabled) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const inst = instanceRef.current;
      if (inst && startedRef.current) {
        await inst.pause(true);
      }
      const resume = await onScanResultRef.current(v);
      if (resume && inst && startedRef.current) {
        await inst.resume();
      }
      setManualCode('');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className={cn('space-y-4', disabled && 'pointer-events-none opacity-60')}>
      <div
        id={elementId}
        className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-white/20 bg-black"
      />

      {cameraError ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-center text-sm text-on-surface-variant">
          <span className="material-symbols-outlined mb-1 block text-2xl text-error" aria-hidden>
            videocam_off
          </span>
          {t('teacher.scanner.cameraErrorTitle')}
          <p className="mt-1 text-xs">{cameraError}</p>
          <Button type="button" size="sm" className="mt-2" onClick={() => setRetryKey((k) => k + 1)}>
            {t('teacher.scanner.retryCamera')}
          </Button>
        </div>
      ) : null}

      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <p className="text-sm font-semibold text-on-surface">{t('teacher.scanner.manualTitle')}</p>
        <p className="mt-1 text-xs text-on-surface-variant">{t('teacher.scanner.manualHint')}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder={t('teacher.scanner.manualPlaceholder')}
            className="flex-1"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitManual();
            }}
          />
          <Button type="button" onClick={() => void submitManual()} disabled={busy || !manualCode.trim()}>
            <span className="material-symbols-outlined me-1 text-base" aria-hidden>
              keyboard_return
            </span>
            {t('teacher.scanner.manualSubmit')}
          </Button>
        </div>
      </div>
    </div>
  );
}
