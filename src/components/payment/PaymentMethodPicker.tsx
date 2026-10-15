import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { isWalletProvider, type ParentPaymentMethodCode } from '@/lib/paymentApi';
import { PAYMENT_METHOD_ICONS, paymentFlowOf } from '@/lib/paymentMethods';
import { cn } from '@/lib/utils';

type Props = {
  methods: ParentPaymentMethodCode[];
  value: ParentPaymentMethodCode | null;
  onChange: (method: ParentPaymentMethodCode) => void;
  /** Online checkout is simulated (test project). */
  testMode: boolean;
  disabled?: boolean;
  /** One column, for narrow side panels. */
  compact?: boolean;
  /** Radio group name; unique per page. */
  name: string;
};

/** Card networks Paymob's checkout accepts; brand names, shown as-is in every language. */
const CARD_BRANDS = ['VISA', 'Mastercard', 'Meeza'] as const;

/** The picker's entries: every method, with all wallet providers folded into one "Mobile wallet". */
type PickerEntry = { key: string; method: ParentPaymentMethodCode; wallet: boolean };

function pickerEntries(methods: ParentPaymentMethodCode[]): PickerEntry[] {
  const entries: PickerEntry[] = [];
  for (const method of methods) {
    if (isWalletProvider(method)) {
      if (!entries.some((entry) => entry.wallet)) entries.push({ key: 'mobile_wallet', method, wallet: true });
    } else {
      entries.push({ key: method, method, wallet: false });
    }
  }
  return entries;
}

/** The payment methods as selectable cards, each saying how it is paid. */
export function PaymentMethodPicker({ methods, value, onChange, testMode, disabled = false, compact = false, name }: Props) {
  const { t } = useTranslation();
  const walletProviders = methods.filter(isWalletProvider);

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="mb-3 text-sm font-semibold text-on-surface">{t('payment.methodsTitle')}</legend>
      <div className={cn('grid gap-2', !compact && 'sm:grid-cols-2 2xl:grid-cols-3')}>
        {pickerEntries(methods).map((entry) => {
          const active = entry.wallet ? isWalletProvider(value) : value === entry.method;
          const online = paymentFlowOf(entry.method) === 'online_checkout';
          const label = entry.wallet
            ? t('payment.wallet.label')
            : online && testMode
              ? t('payment.checkout.testCardLabel')
              : t(`payment.manualMethods.${entry.method}.label`);
          const help = entry.wallet
            ? t('payment.wallet.help', {
                providers: walletProviders.map((provider) => t(`payment.manualMethods.${provider}.label`)).join(' · '),
              })
            : online && testMode
              ? t('payment.checkout.testCardHelp')
              : t(`payment.manualMethods.${entry.method}.help`);
          return (
            <label
              key={entry.key}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary',
                active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-outline-variant bg-surface hover:border-primary/50',
                disabled && 'cursor-not-allowed opacity-70',
              )}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                value={entry.key}
                checked={active}
                // The wallet card keeps the provider already chosen, or starts on the first one.
                onChange={() => onChange(entry.wallet && isWalletProvider(value) ? value : entry.method)}
              />
              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                  active ? 'bg-primary text-primary-foreground' : 'bg-surface-container text-on-surface-variant',
                )}
              >
                <MaterialSymbol name={entry.wallet ? 'account_balance_wallet' : PAYMENT_METHOD_ICONS[entry.method]} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-on-surface">{label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-on-surface-variant">{help}</span>
                {online ? (
                  <span className="mt-2 flex flex-wrap gap-1" dir="ltr" aria-label={CARD_BRANDS.join(', ')}>
                    {CARD_BRANDS.map((brand) => (
                      <span
                        key={brand}
                        className="rounded border border-outline-variant bg-surface px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-on-surface"
                      >
                        {brand}
                      </span>
                    ))}
                  </span>
                ) : null}
                <span
                  className={cn(
                    'mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
                    online ? 'bg-success/10 text-success' : 'bg-surface-container text-on-surface-variant',
                  )}
                >
                  {t(online ? 'payment.checkout.badgeOnline' : 'payment.checkout.badgeManual')}
                </span>
              </span>
              <span
                className={cn(
                  'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                  active ? 'border-primary bg-primary text-primary-foreground' : 'border-outline-variant text-transparent',
                )}
              >
                <MaterialSymbol name="check" size="text-xs" />
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
