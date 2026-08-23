import { useRef } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useQrTokenGeneration } from '@/hooks/useQrTokenGeneration';
import { Badge } from '@/components/ui/badge';
import { qrExpirySummaryFromSeconds } from '@/lib/qrExpiryLabel';

export type AdminQrChildRowData = {
  id: string;
  full_name_ar: string;
  full_name_en: string;
  avatar_url: string | null;
};

export type LatestQrToken = {
  token: string;
  expires_at: string;
};

type Props = {
  child: AdminQrChildRowData;
  displayName: string;
  latest: LatestQrToken | null;
  nurseryId: string;
  nowMs: number;
  onRegenerated: () => void;
};

export function AdminQrChildRow({ child, displayName, latest, nurseryId, nowMs, onRegenerated }: Props) {
  const { t, i18n } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const generate = useQrTokenGeneration();

  const expiresMs = latest ? new Date(latest.expires_at).getTime() : 0;
  const secondsLeft = latest ? Math.max(0, Math.ceil((expiresMs - nowMs) / 1000)) : 0;
  const isActive = Boolean(latest && expiresMs > nowMs);

  const printableValue = latest
    ? `${window.location.origin}/qr/verify?token=${encodeURIComponent(latest.token)}`
    : '';

  const statusKey = !latest ? 'none' : isActive ? 'active' : 'expired';

  const runGenerate = async () => {
    try {
      await generate.mutateAsync({ child_id: child.id, nursery_id: nurseryId });
      onRegenerated();
      toast.success(t(latest ? 'qr.admin.regenerateOk' : 'qr.admin.generateOk'));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(t('qr.admin.generateFailed'), { description: message });
    }
  };

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas || !printableValue) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `xo-qr-${child.id.slice(0, 8)}.png`;
    a.click();
  };

  const expiryFormatted = latest
    ? new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short', hour12: true,
      }).format(new Date(latest.expires_at))
    : '—';

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 md:flex-row md:items-start">
      <div className="flex shrink-0 justify-center md:block">
        {printableValue ? (
          <div className="rounded-xl bg-white p-2">
            <QRCodeSVG value={printableValue} size={112} />
          </div>
        ) : (
          <div className="flex h-[128px] w-[128px] items-center justify-center rounded-xl border border-dashed border-outline-variant text-xs text-on-surface-variant">
            {t('qr.admin.noCode')}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-on-surface">{displayName}</p>
          <Badge className="text-[10px]">
            {t(`qr.admin.status.${statusKey}`)}
          </Badge>
        </div>
        <p className="text-xs text-on-surface-variant">
          {t('qr.admin.expiresAt')}: {expiryFormatted}
        </p>
        {latest ? (
          <p className="text-xs text-on-surface-variant">{qrExpirySummaryFromSeconds(secondsLeft, t)}</p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" size="sm" disabled={generate.isPending} onClick={() => void runGenerate()}>
            <span className="material-symbols-outlined me-1 text-base" aria-hidden>
              autorenew
            </span>
            {latest ? t('qr.admin.regenerate') : t('qr.admin.generate')}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={!printableValue} onClick={downloadPng}>
            <span className="material-symbols-outlined me-1 text-base" aria-hidden>
              download
            </span>
            {t('qr.download')}
          </Button>
        </div>
      </div>
      <div className="pointer-events-none fixed -left-[9999px] top-0 opacity-0" aria-hidden>
        {printableValue ? (
          <QRCodeCanvas ref={canvasRef} value={printableValue} size={512} marginSize={2} />
        ) : null}
      </div>
    </div>
  );
}
