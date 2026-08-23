import { useTranslation } from 'react-i18next';

export type ParentPaymentMethod =
  | 'card'
  | 'cash'
  | 'bank_transfer'
  | 'fawry'
  | 'instapay'
  | 'vodafone_cash'
  | 'orange_cash';

interface Props {
  enabled: string[];
  value: ParentPaymentMethod;
  onChange: (method: ParentPaymentMethod) => void;
}

const PAYMOB_METHODS: ParentPaymentMethod[] = ['card', 'fawry', 'instapay', 'vodafone_cash', 'orange_cash'];

function enabledMethodsFromSettings(enabled: string[]): ParentPaymentMethod[] {
  const methods: ParentPaymentMethod[] = [];
  if (enabled.includes('cash')) methods.push('cash');
  if (enabled.includes('bank_transfer')) methods.push('bank_transfer');
  if (enabled.includes('paymob')) methods.push(...PAYMOB_METHODS);
  return [...new Set(methods)];
}

export function PaymentMethodSelector({ enabled, value, onChange }: Props) {
  const { t } = useTranslation();
  const methods = enabledMethodsFromSettings(enabled);
  return (
    <div className="space-y-2">
      {methods.map((method) => (
        <label
          key={method}
          className={`block cursor-pointer rounded-xl border p-3 ${value === method ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface-container-lowest'}`}
        >
          <input
            className="me-2"
            type="radio"
            name="payment-method"
            value={method}
            checked={value === method}
            onChange={() => onChange(method)}
          />
          <span className="text-sm">{t(`payment.methods.${method}`)}</span>
          {PAYMOB_METHODS.includes(method) ? (
            <span className="ms-2 rounded-full bg-surface-container px-2 py-0.5 text-[10px] text-on-surface-variant">
              {t('payment.comingSoon')}
            </span>
          ) : null}
        </label>
      ))}
    </div>
  );
}
