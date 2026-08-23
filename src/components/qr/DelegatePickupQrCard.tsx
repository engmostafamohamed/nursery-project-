import { useMemo, useState } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useQrTokenGeneration, type QrTokenPayload } from '@/hooks/useQrTokenGeneration';
import { addCalendarDaysYmd, getNurseryCalendarDateString } from '@/lib/nurseryDay';

type Props = {
  childId: string;
  nurseryId: string;
  childDisplayName: string;
};

const MAX_DAYS_AHEAD = 7;

/**
 * Parent-facing card to mint a one-time named pickup QR for a child.
 * The QR carries a chosen delegate name (e.g. "Ahmed - driver"), expires at the
 * end of the chosen day in Cairo time, and is invalidated on first scan by the
 * teacher's scanner via the qr-verify Edge Function.
 */
export function DelegatePickupQrCard({ childId, nurseryId, childDisplayName }: Props) {
  const { t } = useTranslation();
  const [delegateName, setDelegateName] = useState('');
  const today = useMemo(() => getNurseryCalendarDateString(), []);
  const maxDate = useMemo(() => addCalendarDaysYmd(today, MAX_DAYS_AHEAD), [today]);
  const [date, setDate] = useState<string>(today);
  const [issued, setIssued] = useState<QrTokenPayload | null>(null);
  const generate = useQrTokenGeneration();

  const onGenerate = async () => {
    const name = delegateName.trim();
    if (!name) {
      toast.error(t('qr.delegate.errors.nameRequired'));
      return;
    }
    if (!date) {
      toast.error(t('qr.delegate.errors.dateRequired'));
      return;
    }
    // Resolve TTL to end of the selected Cairo day.
    const [y, m, d] = date.split('-').map((s) => Number(s));
    if (!y || !m || !d) {
      toast.error(t('qr.delegate.errors.dateRequired'));
      return;
    }
    const endOfDayLocal = new Date(y, m - 1, d, 23, 59, 0, 0);
    const ttl = Math.max(60, Math.floor((endOfDayLocal.getTime() - Date.now()) / 1000));
    try {
      const result = await generate.mutateAsync({
        child_id: childId,
        nursery_id: nurseryId,
        purpose: 'delegate',
        delegate_name: name,
        single_use: true,
        ttl_seconds: ttl,
      });
      setIssued(result);
      toast.success(t('qr.delegate.successToast', { name }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t('qr.delegate.errors.failed'), { description: msg });
    }
  };

  const printableValue = issued
    ? `${window.location.origin}/qr/verify?token=${encodeURIComponent(issued.token)}`
    : '';

  const expiresLabel = issued
    ? new Date(issued.expires_at).toLocaleString()
    : '';

  const reset = () => {
    setIssued(null);
    setDelegateName('');
    setDate(today);
  };

  return (
    <section className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <div>
        <h3 className="text-sm font-semibold text-on-surface">{t('qr.delegate.title')}</h3>
        <p className="text-xs text-on-surface-variant">
          {t('qr.delegate.subtitle', { name: childDisplayName })}
        </p>
      </div>

      {!issued ? (
        <>
          <div className="space-y-2">
            <Label>{t('qr.delegate.fields.name')}</Label>
            <Input
              placeholder={t('qr.delegate.fields.namePlaceholder')}
              value={delegateName}
              onChange={(e) => setDelegateName(e.target.value)}
              maxLength={80}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('qr.delegate.fields.validOn')}</Label>
            <Input
              type="date"
              value={date}
              min={today}
              max={maxDate}
              onChange={(e) => setDate(e.target.value || today)}
            />
            <p className="text-xs text-on-surface-variant">{t('qr.delegate.fields.validOnHint')}</p>
          </div>
          <Button
            type="button"
            onClick={() => void onGenerate()}
            disabled={generate.isPending || !delegateName.trim()}
          >
            <span className="material-symbols-outlined me-1 text-base" aria-hidden>
              qr_code_2
            </span>
            {t('qr.delegate.generate')}
          </Button>
        </>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl border border-outline-variant bg-white p-4">
            <div className="flex flex-col items-center gap-2">
              <QRCodeSVG value={printableValue} size={220} />
              <p className="text-sm font-semibold text-on-surface">{issued.delegate_name}</p>
              <p className="text-xs text-on-surface-variant">{childDisplayName}</p>
              <p className="text-xs text-on-surface-variant">
                {t('qr.delegate.expiresLabel')}: {expiresLabel}
              </p>
              <p className="text-[11px] font-medium text-error">
                {t('qr.delegate.singleUseNotice')}
              </p>
            </div>
          </div>
          {/* hidden canvas backing for download */}
          <div className="pointer-events-none fixed -left-[9999px] top-0 opacity-0" aria-hidden>
            <QRCodeCanvas value={printableValue} size={512} marginSize={2} />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={reset}>
              {t('qr.delegate.generateAnother')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
