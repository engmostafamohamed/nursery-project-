import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { isWalletProvider, type ParentPaymentMethodCode } from '@/lib/paymentApi';
import { paymentFlowOf } from '@/lib/paymentMethods';
import { cn } from '@/lib/utils';

type Props = {
  methods: ParentPaymentMethodCode[];
  value: ParentPaymentMethodCode | null;
  onChange: (method: ParentPaymentMethodCode) => void;
  /** Online checkout is simulated (test project). */
  testMode: boolean;
  disabled?: boolean;
  /** Radio group name; unique per page. */
  name: string;
  /** The fields for the chosen method, shown under the tiles. */
  renderDetails?: (method: ParentPaymentMethodCode) => ReactNode;
};

/** The picker's tiles: every method, with all wallet providers folded into one "Mobile wallet". */
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

/**
 * "Payment method": one compact tile per method (a name and one line), then the chosen
 * method's own fields underneath.
 */
export function PaymentMethodPicker({ methods, value, onChange, testMode, disabled = false, name, renderDetails }: Props) {
  const { t, i18n } = useTranslation();
  const walletProviders = methods.filter(isWalletProvider);
  const listSeparator = i18n.language.startsWith('ar') ? '، ' : ', ';

  return (
    <fieldset disabled={disabled} className="space-y-5">
      <legend className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
        {t('payment.picker.title')}
      </legend>

      <div role="radiogroup" aria-label={t('payment.picker.title')} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pickerEntries(methods).map((entry) => {
          const active = entry.wallet ? isWalletProvider(value) : value === entry.method;
          const online = paymentFlowOf(entry.method) === 'online_checkout';
          const label = entry.wallet
            ? t('payment.wallet.label')
            : online && testMode
              ? t('payment.checkout.testCardLabel')
              : t(`payment.manualMethods.${entry.method}.label`);
          const subtitle = entry.wallet
            ? walletProviders.map((provider) => t(`payment.picker.walletShort.${provider}`)).join(listSeparator)
            : t(`payment.picker.short.${entry.method}`, { defaultValue: t(`payment.manualMethods.${entry.method}.help`) });
          return (
            <label
              key={entry.key}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-1',
                active
                  ? 'border-primary bg-primary/[0.07]'
                  : 'border-outline-variant bg-surface hover:border-primary/40 hover:bg-surface-container-lowest',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                value={entry.key}
                checked={active}
                // The wallet tile keeps the provider already chosen, or starts on the first one.
                onChange={() => onChange(entry.wallet && isWalletProvider(value) ? value : entry.method)}
              />
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                  active ? 'border-primary bg-primary' : 'border-outline-variant bg-surface',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full bg-primary-foreground', !active && 'hidden')} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-5 text-on-surface">{label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-on-surface-variant">{subtitle}</span>
              </span>
            </label>
          );
        })}
      </div>

      {renderDetails && value && methods.includes(value) ? <div>{renderDetails(value)}</div> : null}
    </fieldset>
  );
}
