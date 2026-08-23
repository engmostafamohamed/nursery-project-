import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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
  const [token, setToken] = useState<string | null>(null);

  const childName = useMemo(() => {
    if (languagePref === 'ar') return child.full_name_ar;
    if (languagePref === 'en') return child.full_name_en;
    return `${child.full_name_ar} / ${child.full_name_en}`;
  }, [child, languagePref]);

  const generateToken = useQrTokenGeneration();

  const fetchToken = async (rotate = false) => {
    try {
      const data = await generateToken.mutateAsync({
        child_id: child.id,
        nursery_id: child.nursery_id,
        purpose: 'parent',
        ...(rotate ? { rotate: true } : {}),
      });
      setToken(data.token);
      if (rotate) toast.success(t('qr.rotated'));
    } catch {
      toast.error(t('qr.errors.generateFailed'));
    }
  };

  useEffect(() => {
    void fetchToken(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [child.id]);

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

  return (
    <section className="rounded-3xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
      <h3 className="text-base font-semibold text-on-surface">{childName}</h3>
      <p className="mt-1 text-sm font-medium text-on-surface">{t('qr.parentPage.alwaysAvailable')}</p>
      <p className="mt-0.5 text-xs text-on-surface-variant">{t('qr.parentPage.alwaysAvailableHint')}</p>

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
        <Button type="button" variant="outline" onClick={() => void fetchToken(true)} disabled={generateToken.isPending}>
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
        {showPrint ? (
          <Button type="button" variant="outline" className="col-span-2" onClick={() => window.print()}>
            <span className="material-symbols-outlined me-1 text-base" aria-hidden>
              print
            </span>
            {t('qr.print')}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
