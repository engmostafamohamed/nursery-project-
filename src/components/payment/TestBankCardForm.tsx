import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  onValidityChange: (isValid: boolean) => void;
};

function passesLuhn(number: string): boolean {
  let sum = 0;
  let doubleDigit = false;
  for (let index = number.length - 1; index >= 0; index -= 1) {
    let digit = Number(number[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function cardNumberError(value: string, t: ReturnType<typeof useTranslation>['t']): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return t('signup.payment.testCard.numberRequired', { defaultValue: 'Enter the test card number.' });
  if (digits.length !== 16) return t('signup.payment.testCard.numberLength', { defaultValue: 'Enter all 16 card digits.' });
  if (!passesLuhn(digits)) return t('signup.payment.testCard.numberInvalid', { defaultValue: 'Check the card number.' });
  return '';
}

function expiryError(month: string, year: string, t: ReturnType<typeof useTranslation>['t']): string {
  if (!month || !year) return t('signup.payment.testCard.expiryRequired', { defaultValue: 'Select the expiry month and year.' });
  const monthNumber = Number(month);
  const yearNumber = Number(year);
  if (monthNumber < 1 || monthNumber > 12) return t('signup.payment.testCard.expiryInvalid', { defaultValue: 'Enter a valid expiry date.' });
  const now = new Date();
  if (yearNumber < now.getFullYear() || (yearNumber === now.getFullYear() && monthNumber < now.getMonth() + 1)) {
    return t('signup.payment.testCard.expiryPast', { defaultValue: 'The expiry date must be in the future.' });
  }
  return '';
}

export function TestBankCardForm({ onValidityChange }: Props) {
  const { t } = useTranslation();
  const [cardholder, setCardholder] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');
  const digits = cardNumber.replace(/\D/g, '');
  const numberError = cardNumberError(cardNumber, t);
  const expiryMessage = expiryError(expiryMonth, expiryYear, t);
  const cvvError = !cvv
    ? t('signup.payment.testCard.cvvRequired', { defaultValue: 'Enter the test security code.' })
    : !/^\d{3,4}$/.test(cvv)
      ? t('signup.payment.testCard.cvvInvalid', { defaultValue: 'Enter a 3 or 4 digit security code.' })
      : '';
  const cardholderError = cardholder.trim().length < 2
    ? t('signup.payment.testCard.nameRequired', { defaultValue: 'Enter the cardholder name.' })
    : '';
  const valid = !numberError && !expiryMessage && !cvvError && !cardholderError;

  useEffect(() => {
    onValidityChange(valid);
  }, [onValidityChange, valid]);

  const currentYear = new Date().getFullYear();
  const displayYear = expiryYear ? expiryYear.slice(-2) : 'YY';
  const previewNumber = digits.length > 0
    ? `${'•'.repeat(Math.max(0, 12 - Math.min(digits.length, 12)))}${digits.slice(-4)}`.match(/.{1,4}/g)?.join(' ')
    : '•••• •••• •••• ••••';

  return (
    <section aria-label={t('signup.payment.testCard.title', { defaultValue: 'Test bank card details' })} className="space-y-5 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 sm:p-5">
      <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-900 to-blue-800 p-5 text-white shadow-lg">
        <div className="absolute -end-10 -top-12 h-36 w-36 rounded-full border border-white/10" />
        <div className="absolute -end-2 -top-4 h-36 w-36 rounded-full border border-white/10" />
        <div className="relative flex items-start justify-between">
          <span className="flex h-10 w-12 items-center justify-center rounded-md bg-white/90 text-slate-800">
            <MaterialSymbol name="sim_card" />
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
            {t('signup.payment.testCard.preview', { defaultValue: 'TEST CARD' })}
          </span>
        </div>
        <p className="relative mt-7 font-mono text-lg tracking-[0.16em] sm:text-xl" aria-label={t('signup.payment.testCard.previewNumber', { defaultValue: 'Card number preview' })}>
          {previewNumber}
        </p>
        <div className="relative mt-6 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.18em] text-white/60">{t('signup.payment.testCard.cardholder', { defaultValue: 'Cardholder' })}</p>
            <p className="mt-1 truncate text-sm font-medium uppercase tracking-wide">{cardholder.trim() || 'YOUR NAME'}</p>
          </div>
          <div className="shrink-0 text-end">
            <p className="text-[9px] uppercase tracking-[0.18em] text-white/60">{t('signup.payment.testCard.expires', { defaultValue: 'Expires' })}</p>
            <p className="mt-1 font-mono text-sm">{expiryMonth || 'MM'}/{displayYear}</p>
          </div>
          <span aria-hidden className="text-xl font-black italic tracking-tight text-white">CARD</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="test-cardholder">{t('signup.payment.testCard.cardholder', { defaultValue: 'Cardholder name' })}</Label>
          <Input
            id="test-cardholder"
            autoComplete="off"
            value={cardholder}
            onChange={(event) => setCardholder(event.target.value)}
            placeholder={t('signup.payment.testCard.namePlaceholder', { defaultValue: 'Name as shown on card' })}
            aria-invalid={Boolean(cardholderError)}
          />
          {cardholderError ? <p className="text-xs text-error">{cardholderError}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="test-card-number">{t('signup.payment.testCard.number', { defaultValue: 'Card number' })}</Label>
          <Input
            id="test-card-number"
            inputMode="numeric"
            autoComplete="off"
            value={cardNumber}
            onChange={(event) => setCardNumber(event.target.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '))}
            placeholder="0000 0000 0000 0000"
            aria-invalid={Boolean(numberError)}
          />
          {numberError ? <p className="text-xs text-error">{numberError}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="test-card-cvv">{t('signup.payment.testCard.cvv', { defaultValue: 'CVV / security code' })}</Label>
          <Input
            id="test-card-cvv"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={cvv}
            onChange={(event) => setCvv(event.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="•••"
            aria-invalid={Boolean(cvvError)}
          />
          {cvvError ? <p className="text-xs text-error">{cvvError}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="test-card-month">{t('signup.payment.testCard.expiry', { defaultValue: 'Valid until' })}</Label>
          <select
            id="test-card-month"
            className="h-12 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
            value={expiryMonth}
            onChange={(event) => setExpiryMonth(event.target.value)}
            aria-invalid={Boolean(expiryMessage)}
          >
            <option value="">{t('signup.payment.testCard.month', { defaultValue: 'Month' })}</option>
            {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((month) => (
              <option key={month} value={month}>{month}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="test-card-year" className="sr-only">{t('signup.payment.testCard.year', { defaultValue: 'Year' })}</Label>
          <select
            id="test-card-year"
            className="mt-7 h-12 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
            value={expiryYear}
            onChange={(event) => setExpiryYear(event.target.value)}
            aria-label={t('signup.payment.testCard.year', { defaultValue: 'Year' })}
            aria-invalid={Boolean(expiryMessage)}
          >
            <option value="">{t('signup.payment.testCard.year', { defaultValue: 'Year' })}</option>
            {Array.from({ length: 15 }, (_, index) => String(currentYear + index)).map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
        {expiryMessage ? <p className="text-xs text-error sm:col-span-2">{expiryMessage}</p> : null}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs leading-5 text-on-surface">
        <MaterialSymbol name="info" className="mt-0.5 shrink-0 text-warning" size="text-base" />
        <p>{t('signup.payment.testCard.localOnly', { defaultValue: 'Test only. Use fake card details; never enter a real card. These fields stay in this page and are not sent or saved.' })}</p>
      </div>
    </section>
  );
}
