import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useCallback, useEffect, useRef, useState } from 'react';

export type QrCameraStatus = 'starting' | 'scanning' | 'error';
export type QrCameraErrorKind = 'not_found' | 'denied' | 'in_use' | 'unsupported' | 'unknown';
export type QrCameraError = { kind: QrCameraErrorKind; detail: string };

/** The same code seen again within this gap (i.e. still held in front of the camera) is ignored. */
const SAME_CODE_GAP_MS = 2000;

/**
 * html5-qrcode's start()/stop()/pause()/resume() throw synchronously (a plain string) when the
 * scanner is not in the state they expect — e.g. stop() while the camera is still starting.
 * A .catch() on the call never sees that throw, so run them through a promise first.
 */
function quietly(action: () => unknown): Promise<void> {
  return Promise.resolve()
    .then(action)
    .then(
      () => undefined,
      () => undefined,
    );
}

function classifyCameraError(e: unknown): QrCameraError {
  const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e ?? '');
  if (/NotAllowedError|PermissionDenied|SecurityError|permission/i.test(detail)) return { kind: 'denied', detail };
  if (/NotFoundError|DevicesNotFound|OverconstrainedError|device not found/i.test(detail)) return { kind: 'not_found', detail };
  if (/NotReadableError|TrackStartError|AbortError|Could not start video source/i.test(detail)) return { kind: 'in_use', detail };
  if (/not supported/i.test(detail)) return { kind: 'unsupported', detail };
  return { kind: 'unknown', detail };
}

/** Browsers expose the camera only to secure pages (https, or localhost). */
function cameraApiAvailable(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia);
}

/**
 * Runs the device camera as a QR reader inside the element `elementId`. Each decoded code is
 * handed to `onScan` one at a time; the picture freezes while it is handled, and a code that is
 * still in view afterwards is not read again until it has left the frame.
 */
export function useQrCamera({
  elementId,
  enabled,
  onScan,
}: {
  elementId: string;
  enabled: boolean;
  onScan: (text: string) => Promise<unknown>;
}) {
  const [status, setStatus] = useState<QrCameraStatus>('starting');
  const [error, setError] = useState<QrCameraError | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [attempt, setAttempt] = useState(0);
  const [canFlip, setCanFlip] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  // The previous scanner on this element finishing its shutdown; a new one waits for it.
  const stoppingRef = useRef<Promise<void>>(Promise.resolve());
  const onScanRef = useRef(onScan);
  const available = cameraApiAvailable();

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled || !available) return;

    let cancelled = false;
    let scanner: Html5Qrcode | null = null;
    let started: Promise<void> = Promise.resolve();
    let handling = false;
    let lastCode: { text: string; at: number } | null = null;

    const onDecoded = async (text: string) => {
      const current = scanner;
      if (!current || cancelled) return;
      if (lastCode && lastCode.text === text && Date.now() - lastCode.at < SAME_CODE_GAP_MS) {
        lastCode.at = Date.now();
        return;
      }
      if (handling) return;
      handling = true;
      await quietly(() => current.pause(true));
      try {
        await onScanRef.current(text);
      } catch {
        // The page reports its own errors; the camera just carries on.
      } finally {
        lastCode = { text, at: Date.now() };
        handling = false;
        if (!cancelled) await quietly(() => current.resume());
      }
    };

    // Wrapped so a synchronous throw inside start() becomes a rejection like any other start failure.
    const startScanner = (current: Html5Qrcode): Promise<void> =>
      Promise.resolve()
        .then(() =>
          current.start(
            { facingMode: facing },
            {
              fps: 10,
              // The read area follows the picture: about two thirds of its shorter side.
              qrbox: (width, height) => {
                const size = Math.max(160, Math.floor(Math.min(width, height) * 0.68));
                return { width: size, height: size };
              },
            },
            (text) => void onDecoded(text),
            () => {
              /* no QR in this frame */
            },
          ),
        )
        .then(() => undefined);

    // Start on the next task, after any previous scanner on this element has stopped. In development
    // React StrictMode mounts, unmounts and remounts at once; the throw-away mount then never opens
    // the camera, so two scanners never fight over the same element and camera.
    const timer = window.setTimeout(() => {
      void stoppingRef.current.then(() => {
        if (cancelled) return;
        const current = new Html5Qrcode(elementId, {
          verbose: false,
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        });
        scanner = current;
        scannerRef.current = current;
        setStatus('starting');
        setError(null);
        setTorchOn(false);
        started = startScanner(current).then(
          async () => {
            if (cancelled) return;
            // The library's own "Scanner paused" label is English-only; the page shows its own state.
            const pausedLabel = (current as unknown as { scannerPausedUiElement?: HTMLElement | null }).scannerPausedUiElement;
            pausedLabel?.style.setProperty('visibility', 'hidden');
            setStatus('scanning');
            try {
              setTorchSupported(current.getRunningTrackCameraCapabilities().torchFeature().isSupported());
            } catch {
              setTorchSupported(false);
            }
            try {
              const devices = await navigator.mediaDevices.enumerateDevices();
              if (!cancelled) setCanFlip(devices.filter((d) => d.kind === 'videoinput').length > 1);
            } catch {
              if (!cancelled) setCanFlip(false);
            }
          },
          (e: unknown) => {
            if (cancelled) return;
            setStatus('error');
            setError(classifyCameraError(e));
          },
        );
      });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (scannerRef.current === scanner) scannerRef.current = null;
      const current = scanner;
      if (!current) return;
      // Let a start that is still in progress finish, then stop it: stopping earlier throws and
      // would leave the camera on.
      stoppingRef.current = started
        .then(() => quietly(() => current.stop()))
        .then(() => {
          const el = document.getElementById(elementId);
          if (el) el.innerHTML = '';
        });
    };
  }, [attempt, available, elementId, enabled, facing]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const flip = useCallback(() => setFacing((f) => (f === 'environment' ? 'user' : 'environment')), []);
  const toggleTorch = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    const next = !torchOn;
    try {
      await scanner.getRunningTrackCameraCapabilities().torchFeature().apply(next);
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }, [torchOn]);

  return {
    status: available ? status : ('error' as const),
    error: available ? error : { kind: 'unsupported' as const, detail: 'window.isSecureContext = false or no mediaDevices' },
    retry,
    canFlip,
    flip,
    torchSupported,
    torchOn,
    toggleTorch,
  };
}

export type QrCamera = ReturnType<typeof useQrCamera>;
