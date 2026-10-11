import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

type Props = {
  amount: string;
};

export function HostedCardCheckoutNotice({ amount }: Props) {
  const { t } = useTranslation();

  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MaterialSymbol name="credit_card" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-on-surface">
              {t('signup.payment.cardCheckout.title', { defaultValue: 'Secure card checkout' })}
            </h4>
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
              Paymob
            </span>
          </div>
          <p className="mt-1 text-sm leading-5 text-on-surface-variant">
            {t('signup.payment.cardCheckout.description', {
              defaultValue: 'After you submit, Paymob opens its secure checkout for your card number, expiry date, and security code. Paymob validates the details and handles any bank verification.',
            })}
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-on-surface-variant">
            <MaterialSymbol name="lock" size="text-sm" />
            {t('signup.payment.cardCheckout.securityNote', {
              defaultValue: 'Your card details are entered on Paymob and are never stored by the nursery.',
            })}
          </p>
          <p className="mt-2 text-xs leading-5 text-on-surface-variant">
            {t('signup.payment.cardCheckout.reviewNote', {
              defaultValue: 'The nursery verifies the payment after you return from Paymob.',
            })}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-outline-variant pt-3 text-sm">
        <span className="text-on-surface-variant">
          {t('signup.payment.totalDue', { defaultValue: 'Total payment' })}
        </span>
        <span className="font-semibold text-on-surface">{amount}</span>
      </div>
    </section>
  );
}
