import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  title: string;
  confirmLabel: string;
  minDate: string;
  maxDate: string;
  isBusy: boolean;
  onConfirm: (date: string) => void;
  onCancel: () => void;
};

/** Asks for the day a custom QR stays valid until, before it is (re)issued or reactivated. */
export function QrExpiryDatePrompt({ title, confirmLabel, minDate, maxDate, isBusy, onConfirm, onCancel }: Props) {
  const { t } = useTranslation();
  const [date, setDate] = useState(minDate);
  const isValid = date >= minDate && date <= maxDate;

  return (
    <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <p className="text-sm font-semibold text-on-surface">{title}</p>
      <div className="space-y-2">
        <Label>{t('qr.delegate.fields.validOn')}</Label>
        <Input
          type="date"
          value={date}
          min={minDate}
          max={maxDate}
          onChange={(e) => setDate(e.target.value)}
          aria-invalid={!isValid}
        />
        <p className={isValid ? 'text-xs text-on-surface-variant' : 'text-xs font-medium text-error'}>
          {t('qr.custom.newExpiryHint', { defaultValue: 'Valid until the end of the selected day, up to 7 days ahead.' })}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => onConfirm(date)} disabled={isBusy || !isValid}>
          {isBusy ? t('common.loading') : confirmLabel}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={isBusy}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
