import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { QrCamera, QrCameraErrorKind } from '@/hooks/useQrCamera';
import { cn } from '@/lib/utils';

const ERROR_ICONS: Record<QrCameraErrorKind, string> = {
  not_found: 'no_photography',
  denied: 'lock',
  in_use: 'warning',
  unsupported: 'https',
  unknown: 'videocam_off',
};

type Props = {
  /** id of the element the camera picture is drawn into (shared with useQrCamera). */
  elementId: string;
  camera: QrCamera;
  /** Why the account cannot scan yet, if it cannot. */
  blocked: 'loading' | 'no_nursery' | null;
  /** A scanned code is being checked: the picture is frozen under a progress cover. */
  processing: boolean;
  onUseManual: () => void;
};

function CameraButton({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full backdrop-blur transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
        active ? 'bg-white text-neutral-900' : 'bg-black/45 text-white hover:bg-black/60',
      )}
    >
      <MaterialSymbol name={icon} size="text-xl" />
    </button>
  );
}

/** The camera frame of the QR scanner, with its starting / error / checking states. */
export function QrCameraView({ elementId, camera, blocked, processing, onUseManual }: Props) {
  const { t } = useTranslation();
  const live = !blocked && camera.status === 'scanning';
  const error = !blocked && camera.status === 'error' ? camera.error : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">
      <div className="relative isolate flex min-h-[16rem] items-center justify-center bg-gradient-to-b from-neutral-900 to-neutral-950 sm:min-h-[24rem]">
        {/* html5-qrcode draws the video and its read-area frame into this element. */}
        <div id={elementId} className={cn('w-full [&_video]:block [&_video]:w-full', !live && 'invisible')} />

        {blocked === 'loading' || (!blocked && camera.status === 'starting') ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80">
            <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" aria-hidden />
            <p className="text-sm">{t('teacher.scanner.camera.starting')}</p>
          </div>
        ) : null}

        {blocked === 'no_nursery' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
              <MaterialSymbol name="domain_disabled" size="text-3xl" />
            </span>
            <p className="text-base font-semibold">{t('teacher.scanner.camera.noNursery.title')}</p>
            <p className="max-w-sm text-sm text-white/70">{t('teacher.scanner.camera.noNursery.body')}</p>
          </div>
        ) : null}

        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-white">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
              <MaterialSymbol name={ERROR_ICONS[error.kind]} size="text-3xl" />
            </span>
            <div className="max-w-sm space-y-1">
              <p className="text-base font-semibold">{t(`teacher.scanner.camera.errors.${error.kind}.title`)}</p>
              <p className="text-sm leading-6 text-white/70">{t(`teacher.scanner.camera.errors.${error.kind}.body`)}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {error.kind !== 'unsupported' ? (
                <Button type="button" size="sm" variant="secondary" className="gap-1.5" onClick={camera.retry}>
                  <MaterialSymbol name="refresh" size="text-base" />
                  {t('teacher.scanner.retryCamera')}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 border-white/30 text-white hover:bg-white/10"
                onClick={onUseManual}
              >
                <MaterialSymbol name="keyboard" size="text-base" />
                {t('teacher.scanner.camera.useManual')}
              </Button>
            </div>
            {error.detail ? (
              <details className="max-w-sm text-xs text-white/45">
                <summary className="cursor-pointer select-none hover:text-white/70">{t('teacher.scanner.camera.technical')}</summary>
                <p className="mt-1 break-all font-mono" dir="ltr">{error.detail}</p>
              </details>
            ) : null}
          </div>
        ) : null}

        {live && !processing ? (
          <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-4 pb-4 pt-12 text-center text-sm font-medium text-white">
            {t('teacher.scanner.camera.hint')}
          </p>
        ) : null}

        {live && processing ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 text-white backdrop-blur-[2px]">
            <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/25 border-t-white" aria-hidden />
            <p className="text-sm font-medium">{t('teacher.scanner.camera.processing')}</p>
          </div>
        ) : null}

        {live && (camera.canFlip || camera.torchSupported) ? (
          <div className="absolute end-3 top-3 flex gap-2">
            {camera.torchSupported ? (
              <CameraButton
                icon={camera.torchOn ? 'flashlight_off' : 'flashlight_on'}
                label={t(camera.torchOn ? 'teacher.scanner.camera.torchOff' : 'teacher.scanner.camera.torchOn')}
                active={camera.torchOn}
                onClick={() => void camera.toggleTorch()}
              />
            ) : null}
            {camera.canFlip ? (
              <CameraButton icon="cameraswitch" label={t('teacher.scanner.flipCamera')} onClick={camera.flip} />
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
