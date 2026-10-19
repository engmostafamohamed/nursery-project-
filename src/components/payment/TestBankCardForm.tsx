import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cardBrandOf, type CardBrand } from '@/lib/paymentMethods';

type Props = {
  onValidityChange: (isValid: boolean) => void;
};

type FieldName = 'number' | 'name' | 'expiry' | 'cvv';

const BRAND_LABELS: Record<CardBrand, string> = { visa: 'VISA', mastercard: 'Mastercard', meeza: 'Meeza' };

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

function cardNumberError(digits: string, t: ReturnType<typeof useTranslation>['t']): string {
  if (!digits) return t('signup.payment.testCard.numberRequired', { defaultValue: 'Enter the test card number.' });
  if (digits.length !== 16) return t('signup.payment.testCard.numberLength', { defaultValue: 'Enter all 16 card digits.' });
  if (!passesLuhn(digits)) return t('signup.payment.testCard.numberInvalid', { defaultValue: 'Check the card number.' });
  return '';
}

/** "MM/YY" as typed: digits only, with the slash added after the month. */
function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

function expiryError(expiry: string, t: ReturnType<typeof useTranslation>['t']): string {
  const match = /^(\d{2})\/(\d{2})$/.exec(expiry);
  if (!match) return t('signup.payment.testCard.expiryRequired', { defaultValue: 'Enter the expiry date as MM/YY.' });
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return t('signup.payment.testCard.expiryInvalid', { defaultValue: 'Enter a valid expiry date.' });
  const now = new Date();
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
    return t('signup.payment.testCard.expiryPast', { defaultValue: 'The expiry date must be in the future.' });
  }
  return '';
}

/**
 * Test-mode card form (no provider is contacted and nothing is sent): the same fields a real
 * card checkout asks for, checked only in this page. Errors show once a field is left.
 */
export function TestBankCardForm({ onValidityChange }: Props) {
  const { t } = useTranslation();
  const [cardNumber, setCardNumber] = useState('');
  const [cardholder, setCardholder] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [cvvHelpOpen, setCvvHelpOpen] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<FieldName, true>>>({});
  const touch = (field: FieldName) => () =>
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }));

  const digits = cardNumber.replace(/\D/g, '');
  const brand = cardBrandOf(digits);
  const errors: Record<FieldName, string> = {
    number: cardNumberError(digits, t),
    name: cardholder.trim().length < 2 ? t('signup.payment.testCard.nameRequired', { defaultValue: 'Enter the cardholder name.' }) : '',
    expiry: expiryError(expiry, t),
    cvv: !cvv
      ? t('signup.payment.testCard.cvvRequired', { defaultValue: 'Enter the test security code.' })
      : !/^\d{3,4}$/.test(cvv)
        ? t('signup.payment.testCard.cvvInvalid', { defaultValue: 'Enter a 3 or 4 digit security code.' })
        : '',
  };
  const valid = !errors.number && !errors.name && !errors.expiry && !errors.cvv;
  const shown = (field: FieldName) => (touched[field] && errors[field] ? errors[field] : null);

  useEffect(() => {
    onValidityChange(valid);
  }, [onValidityChange, valid]);

  return (
    <section aria-label={t('signup.payment.testCard.title', { defaultValue: 'Test bank card details' })} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="test-card-number" className="text-sm font-semibold text-on-surface">
          {t('signup.payment.testCard.number', { defaultValue: 'Card number' })}
        </Label>
        <div className="relative">
          <Input
            id="test-card-number"
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            className="pe-24 tabular-nums tracking-wide"
            value={cardNumber}
            placeholder="4242 4242 4242 4242"
            aria-invalid={Boolean(shown('number'))}
            onBlur={touch('number')}
            onChange={(event) => setCardNumber(event.target.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '))}
          />
          {brand ? (
            <span
              aria-live="polite"
              className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 rounded border border-outline-variant bg-surface px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-on-surface"
            >
              {BRAND_LABELS[brand]}
            </span>
          ) : null}
        </div>
        {shown('number') ? <p className="text-xs text-error">{shown('number')}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="test-card-name" className="text-sm font-semibold text-on-surface">
          {t('signup.payment.testCard.cardholder', { defaultValue: 'Name on card' })}
        </Label>
        <Input
          id="test-card-name"
          autoComplete="off"
          className="uppercase placeholder:normal-case"
          value={cardholder}
          placeholder={t('signup.payment.testCard.namePlaceholder', { defaultValue: 'Name as shown on card' })}
          aria-invalid={Boolean(shown('name'))}
          onBlur={touch('name')}
          onChange={(event) => setCardholder(event.target.value)}
        />
        {shown('name') ? <p className="text-xs text-error">{shown('name')}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
        <div className="space-y-1.5">
          <Label htmlFor="test-card-expiry" className="text-sm font-semibold text-on-surface">
            {t('signup.payment.testCard.expiry', { defaultValue: 'Expiry' })}
          </Label>
          <Input
            id="test-card-expiry"
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            className="tabular-nums"
            value={expiry}
            placeholder="MM/YY"
            aria-invalid={Boolean(shown('expiry'))}
            onBlur={touch('expiry')}
            onChange={(event) => setExpiry(formatExpiry(event.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="test-card-cvv" className="text-sm font-semibold text-on-surface">CVC</Label>
            <button
              type="button"
              className="text-on-surface-variant hover:text-primary"
              aria-label={t('payment.steps.cvvWhere')}
              aria-expanded={cvvHelpOpen}
              aria-controls="test-card-cvv-help"
              onClick={() => setCvvHelpOpen((open) => !open)}
            >
              <MaterialSymbol name="help" size="text-base" />
            </button>
          </div>
          <Input
            id="test-card-cvv"
            dir="ltr"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            className="tabular-nums"
            value={cvv}
            placeholder="123"
            aria-invalid={Boolean(shown('cvv'))}
            onBlur={touch('cvv')}
            onChange={(event) => setCvv(event.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </div>
      </div>
      {shown('expiry') || shown('cvv') ? (
        <p className="text-xs text-error">{shown('expiry') ?? shown('cvv')}</p>
      ) : null}
      {cvvHelpOpen ? (
        <p id="test-card-cvv-help" className="text-xs leading-5 text-on-surface-variant">{t('payment.steps.cvvHelp')}</p>
      ) : null}

      <p className="text-xs leading-5 text-on-surface-variant">{t('payment.steps.testCardNote')}</p>
    </section>
  );
}
