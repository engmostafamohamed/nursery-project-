import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { HostedOnlineCheckoutNotice } from '@/components/payment/HostedOnlineCheckoutNotice';
import { TestBankCardForm } from '@/components/payment/TestBankCardForm';
import { InstaPayTransferOptions } from '@/components/parent/InstaPayTransferOptions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { ParentPaymentMethodCode } from '@/lib/paymentApi';
import {
  PAYMENT_DETAILS_ISSUE_KEYS,
  paymentFlowOf,
  receiptFileError,
  RECEIPT_IMAGE_TYPES,
  type PaymentDetails,
  type PaymentDetailsIssue,
} from '@/lib/paymentMethods';

export type PaymentSettingsView = {
  instapayAccountName: string | null;
  instapayAccountNumber: string | null;
  instapayQrImageUrl: string | null;
  walletDestination: string | null;
  /** The nursery's free-text "where to send the money". */
  instructions: string | null;
};

type Props = {
  method: ParentPaymentMethodCode;
  details: PaymentDetails;
  onChange: (patch: Partial<PaymentDetails>) => void;
  /** Must be stable: the test card form reports from an effect. */
  onTestCardValidityChange: (valid: boolean) => void;
  issues: PaymentDetailsIssue[];
  settings: PaymentSettingsView;
  /** Formatted amount, shown on the online checkout notice. */
  amountLabel: string;
  testMode: boolean;
  /** Prefix for input ids; unique per page. */
  idPrefix: string;
};

/** What the parent sees and fills in for the chosen method: where to pay, and what proof to give. */
export function PaymentMethodDetails({
  method,
  details,
  onChange,
  onTestCardValidityChange,
  issues,
  settings,
  amountLabel,
  testMode,
  idPrefix,
}: Props) {
  const { t } = useTranslation();
  const flow = paymentFlowOf(method);
  const issueText = (issue: PaymentDetailsIssue) => (issues.includes(issue) ? t(PAYMENT_DETAILS_ISSUE_KEYS[issue]) : null);

  const copyWalletDestination = async () => {
    if (!settings.walletDestination) return;
    try {
      await navigator.clipboard.writeText(settings.walletDestination);
      toast.success(t('payment.etisalatWallet.destinationCopied'));
    } catch (error) {
      toast.error(t('payment.etisalatWallet.destinationCopyFailed'), {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  if (flow === 'online_checkout') {
    return testMode ? (
      <div className="space-y-3">
        <div role="status" className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
          <MaterialSymbol name="science" className="mt-0.5 text-warning" />
          <p className="leading-5 text-on-surface">{t('payment.checkout.testModeNotice')}</p>
        </div>
        <TestBankCardForm onValidityChange={onTestCardValidityChange} />
      </div>
    ) : (
      <HostedOnlineCheckoutNotice amount={amountLabel} note={t('payment.checkout.onlineReviewNote')} />
    );
  }

  const referenceError = details.reference.length > 0 ? issueText('reference_required') : null;
  const phoneError = details.walletPhone.length > 0 ? issueText('wallet_phone_invalid') : null;
  const nameError = details.walletCustomerName.length > 0 ? issueText('wallet_name_required') : null;

  return (
    <div className="space-y-4">
      {method === 'instapay' ? (
        <InstaPayTransferOptions
          accountName={settings.instapayAccountName}
          accountNumber={settings.instapayAccountNumber}
          qrImageUrl={settings.instapayQrImageUrl}
        />
      ) : null}

      {method === 'fawry' ? (
        <div className="space-y-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
              <MaterialSymbol name="confirmation_number" />
            </span>
            <div>
              <h3 className="font-semibold text-on-surface">{t('payment.fawry.title')}</h3>
              <p className="mt-1 text-sm leading-5 text-on-surface-variant">{t('payment.fawry.description')}</p>
            </div>
          </div>
          <p className="rounded-lg bg-surface-container p-3 text-sm text-on-surface-variant">{t('payment.fawry.referenceNotice')}</p>
        </div>
      ) : null}

      {flow === 'wallet_receipt' ? (
        <fieldset className="space-y-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
          <legend className="px-1 font-semibold text-on-surface">{t('payment.etisalatWallet.title')}</legend>
          <p className="text-sm leading-5 text-on-surface-variant">{t('payment.etisalatWallet.description')}</p>
          {settings.walletDestination ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-container p-3">
              <div className="min-w-0">
                <p className="text-xs text-on-surface-variant">{t('payment.etisalatWallet.destination')}</p>
                <p dir="ltr" className="mt-1 break-all font-mono font-bold text-primary">{settings.walletDestination}</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => void copyWalletDestination()}>
                <MaterialSymbol name="content_copy" size="text-base" />
                {t('payment.etisalatWallet.copyDestination')}
              </Button>
            </div>
          ) : (
            <p role="alert" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-on-surface">
              {t('payment.etisalatWallet.destinationNotConfigured')}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-wallet-phone`}>{t('payment.etisalatWallet.phone')}</Label>
            <Input
              id={`${idPrefix}-wallet-phone`}
              inputMode="numeric"
              autoComplete="tel"
              maxLength={11}
              placeholder="01XXXXXXXXX"
              value={details.walletPhone}
              aria-invalid={Boolean(phoneError)}
              onChange={(event) => onChange({ walletPhone: event.target.value.replace(/\D/g, '').slice(0, 11) })}
            />
            {phoneError ? <p className="text-xs text-error">{phoneError}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-wallet-name`}>{t('payment.etisalatWallet.customerName')}</Label>
            <Input
              id={`${idPrefix}-wallet-name`}
              autoComplete="name"
              maxLength={100}
              placeholder={t('payment.etisalatWallet.namePlaceholder')}
              value={details.walletCustomerName}
              aria-invalid={Boolean(nameError)}
              onChange={(event) => onChange({ walletCustomerName: event.target.value })}
            />
            {nameError ? <p className="text-xs text-error">{nameError}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-wallet-receipt`}>{t('payment.etisalatWallet.screenshot')}</Label>
            <Input
              id={`${idPrefix}-wallet-receipt`}
              type="file"
              accept={RECEIPT_IMAGE_TYPES.join(',')}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                const fileError = file ? receiptFileError(file) : null;
                if (fileError) {
                  toast.error(t(fileError === 'too_large' ? 'payment.etisalatWallet.fileTooLarge' : 'payment.etisalatWallet.invalidFileType'));
                  event.target.value = '';
                  onChange({ walletReceipt: null });
                  return;
                }
                onChange({ walletReceipt: file });
              }}
            />
            <p className="text-xs text-on-surface-variant">
              {details.walletReceipt ? details.walletReceipt.name : t('payment.etisalatWallet.screenshotHelp')}
            </p>
          </div>
        </fieldset>
      ) : null}

      {settings.instructions && method !== 'cash' ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-sm">
          <p className="text-xs font-semibold text-on-surface-variant">{t('payment.instructionsTitle')}</p>
          <p className="mt-1 whitespace-pre-line break-words text-on-surface">{settings.instructions}</p>
        </div>
      ) : null}

      {flow === 'transfer' ? (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-reference`}>{t(method === 'fawry' ? 'payment.fawry.reference' : 'payment.reference')}</Label>
          <Input
            id={`${idPrefix}-reference`}
            value={details.reference}
            maxLength={80}
            autoComplete="off"
            placeholder={t('payment.referencePlaceholder')}
            aria-invalid={Boolean(referenceError)}
            onChange={(event) => onChange({ reference: event.target.value })}
          />
          <p className={referenceError ? 'text-xs text-error' : 'text-xs text-on-surface-variant'}>
            {referenceError ?? t('payment.referenceHelp')}
          </p>
        </div>
      ) : null}

      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
        <MaterialSymbol name="verified_user" size="text-base" className="mt-0.5" />
        <p className="leading-5">{t('payment.approvalNote')}</p>
      </div>
    </div>
  );
}
