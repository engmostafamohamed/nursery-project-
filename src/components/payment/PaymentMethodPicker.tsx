import type { ReactNode } from 'react';
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
  /** Radio group name; unique per page. */
  name: string;
  /** The chosen method's own fields, opened inside its row. */
  renderDetails?: (method: ParentPaymentMethodCode) => ReactNode;
};

/** The picker's rows: every method, with all wallet providers folded into one "Mobile wallet". */
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
 * "Payment method": the methods as one list of rows (icon, name, one line, how it is confirmed).
 * The chosen row opens in place with that method's fields, so the parent reads and fills them
 * right under their choice; picking another row closes it and opens that one.
 */
export function PaymentMethodPicker({ methods, value, onChange, testMode, disabled = false, name, renderDetails }: Props) {
  const { t, i18n } = useTranslation();
  const walletProviders = methods.filter(isWalletProvider);
  const listSeparator = i18n.language.startsWith('ar') ? '، ' : ', ';

  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="mb-3 text-sm font-semibold text-on-surface">{t('payment.picker.title')}</legend>

      <div role="radiogroup" aria-label={t('payment.picker.title')} className="space-y-3">
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
          const panelId = `${name}-${entry.key}-details`;
          const open = active && value !== null && Boolean(renderDetails);
          return (
            <div
              key={entry.key}
              className={cn(
                'overflow-hidden rounded-2xl border bg-surface transition-[border-color,box-shadow]',
                active ? 'border-primary shadow-sm ring-1 ring-primary/30' : 'border-outline-variant hover:border-primary/40',
                disabled && 'opacity-60',
              )}
            >
              <label
                className={cn(
                  'flex items-center gap-3 px-4 py-3.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-primary',
                  disabled ? 'cursor-not-allowed' : 'cursor-pointer',
                  !active && 'hover:bg-surface-container-lowest',
                )}
              >
                <input
                  type="radio"
                  name={name}
                  className="sr-only"
                  value={entry.key}
                  checked={active}
                  aria-controls={open ? panelId : undefined}
                  // The wallet row keeps the provider already chosen, or starts on the first one.
                  onChange={() => onChange(entry.wallet && isWalletProvider(value) ? value : entry.method)}
                />
                <span
                  aria-hidden
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                    active ? 'border-primary' : 'border-outline-variant',
                  )}
                >
                  <span className={cn('h-2.5 w-2.5 rounded-full bg-primary transition-transform', active ? 'scale-100' : 'scale-0')} />
                </span>
                <span
                  aria-hidden
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
                    active ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant',
                  )}
                >
                  <MaterialSymbol name={entry.wallet ? 'account_balance_wallet' : PAYMENT_METHOD_ICONS[entry.method]} />
                </span>
                <span className="min-w-0 flex-1">
                  {/* The badge sits beside the name and wraps under it in narrow columns. */}
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold leading-5 text-on-surface">{label}</span>
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium leading-4',
                        online ? 'bg-success/10 text-success' : 'bg-surface-container text-on-surface-variant',
                      )}
                    >
                      {online ? t('payment.picker.badgeInstant') : t('payment.checkout.badgeManual')}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-on-surface-variant">{subtitle}</span>
                </span>
              </label>

              {open ? (
                <div
                  id={panelId}
                  role="region"
                  aria-label={label}
                  className="border-t border-outline-variant bg-surface-container-lowest/60 px-4 py-4 sm:px-5 sm:py-5"
                >
                  {renderDetails?.(value)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
