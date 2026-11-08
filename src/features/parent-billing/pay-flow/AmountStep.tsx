import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { formatDateTime } from '@/lib/datetime';
import { formatMoneyAmount } from '@/lib/money';
import { cn } from '@/lib/utils';

import { partAmountError } from '../parentBilling';
import type { InvoicePayment } from '../parentBillingApi';

export type AmountChoice = { mode: 'all' } | { mode: 'part'; text: string };

/**
 * How much to pay: everything left (the default) or, when the invoice allows it, a part the parent
 * types. Payments already waiting for the nursery are shown first, so a second one is a choice.
 */
export function AmountStep({
  payable,
  policy,
  inReview,
  choice,
  onChange,
}: {
  payable: number;
  policy: 'full' | 'flexible';
  inReview: InvoicePayment[];
  choice: AmountChoice;
  onChange: (choice: AmountChoice) => void;
}) {
  const { t } = useTranslation();
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  const [touched, setTouched] = useState(false);
  const error = choice.mode === 'part' ? partAmountError(choice.text, payable) : null;
  const showError = choice.mode === 'part' && error !== null && (touched || choice.text !== '');

  const option = (selected: boolean) =>
    cn(
      'flex w-full items-start gap-3 rounded-xl border p-4 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary',
      selected ? 'border-primary bg-primary/5' : 'border-outline-variant hover:bg-surface-container-lowest',
    );

  return (
    <div className="space-y-4">
      {inReview.length ? (
        <div role="note" className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-on-surface">
          <p className="flex items-center gap-1.5 font-semibold text-warning">
            <MaterialSymbol name="hourglass_top" size="text-base" />
            {t('parentBilling.pay.alreadySentTitle')}
          </p>
          <ul className="mt-1 space-y-0.5">
            {inReview.map((p) => (
              <li key={p.id}>{t('parentBilling.pay.alreadySentLine', { amount: money(p.amount), date: formatDateTime(p.at) })}</li>
            ))}
          </ul>
          <p className="mt-1 text-on-surface-variant">{t('parentBilling.pay.alreadySentHint')}</p>
        </div>
      ) : null}

      <div role="radiogroup" aria-label={t('parentBilling.pay.steps.amount')} className="space-y-2">
        <button type="button" role="radio" aria-checked={choice.mode === 'all'} className={option(choice.mode === 'all')} onClick={() => onChange({ mode: 'all' })}>
          <MaterialSymbol name={choice.mode === 'all' ? 'radio_button_checked' : 'radio_button_unchecked'} className="text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-on-surface">{t('parentBilling.pay.payAll')}</span>
            <span className="block text-2xl font-bold text-on-surface">{money(payable)}</span>
          </span>
        </button>

        {policy === 'flexible' ? (
          choice.mode === 'part' ? (
            <div className={option(true)}>
              <MaterialSymbol name="radio_button_checked" className="text-primary" />
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor="pay-part-amount">{t('parentBilling.pay.partLabel', { max: money(payable) })}</Label>
                <Input
                  id="pay-part-amount"
                  inputMode="decimal"
                  autoFocus
                  value={choice.text}
                  aria-invalid={showError}
                  aria-describedby={showError ? 'pay-part-amount-error' : undefined}
                  className={cn(showError && 'border-error')}
                  onChange={(e) => onChange({ mode: 'part', text: e.target.value.replace(/[^\d.]/g, '') })}
                  onBlur={() => setTouched(true)}
                />
                {showError ? (
                  <p id="pay-part-amount-error" role="alert" className="text-xs text-error">
                    {t(`parentBilling.pay.partErrors.${error}`, { max: money(payable) })}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <button type="button" className="text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => onChange({ mode: 'part', text: '' })}>
              {t('parentBilling.pay.payPart')}
            </button>
          )
        ) : (
          <p className="flex items-start gap-1.5 text-xs text-on-surface-variant">
            <MaterialSymbol name="info" size="text-sm" className="mt-0.5" />
            {t('payment.checkout.fullAmountHint')}
          </p>
        )}
      </div>
    </div>
  );
}
