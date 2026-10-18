import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { SignupPaymentOptions } from '@/features/parent-signup/signupPayment';

type Props = {
  options: SignupPaymentOptions | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  outdatedFunction: boolean;
  onRetry: () => void;
};

/**
 * While the nursery's packages and payment options load, fail, or there are none, this says so;
 * once they are ready it renders nothing and the step shows its content.
 */
export function SignupOptionsStatus({ options, isLoading, isError, errorMessage, outdatedFunction, onRetry }: Props) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div role="status" className="flex items-center gap-3 rounded-2xl bg-surface-container p-5 text-sm text-on-surface-variant">
        <MaterialSymbol name="progress_activity" className="animate-spin text-primary" />
        {t('common.loading')}
      </div>
    );
  }

  if (isError || !options) {
    return (
      <div className="rounded-2xl border border-error/20 bg-error/5 p-5">
        <div className="flex items-start gap-3">
          <MaterialSymbol name="error" className="mt-0.5 text-error" />
          <div className="min-w-0 space-y-2">
            <p role="alert" className="text-sm font-medium text-error">
              {outdatedFunction ? t('signup.payment.functionNeedsDeploy') : t('signup.payment.loadError')}
            </p>
            {errorMessage && !outdatedFunction ? <p className="break-words text-xs text-on-surface-variant">{errorMessage}</p> : null}
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <MaterialSymbol name="refresh" size="text-base" />
              {t('common.retry')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (options.packages.length === 0) {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/5 p-5 text-sm text-on-surface">
        <MaterialSymbol name="info" className="text-warning" />
        {t('applications.paymentPackage.noPackages')}
      </div>
    );
  }

  return null;
}
