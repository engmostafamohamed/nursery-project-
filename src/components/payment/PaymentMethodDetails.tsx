import { useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { TestBankCardForm } from '@/components/payment/TestBankCardForm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { isWalletProvider, type ParentPaymentMethodCode, type WalletDestinations, type WalletProvider } from '@/lib/paymentApi';
import {
  PAYMENT_DETAILS_ISSUE_KEYS,
  paymentFlowOf,
  RECEIPT_IMAGE_TYPES,
  receiptFileError,
  walletProviderForPhone,
  type PaymentDetails,
  type PaymentDetailsIssue,
} from '@/lib/paymentMethods';
import { cn } from '@/lib/utils';

export type PaymentSettingsView = {
  instapayAccountName: string | null;
  instapayAccountNumber: string | null;
  instapayQrImageUrl: string | null;
  /** The nursery's receiving number per wallet provider. */
  walletDestinations: WalletDestinations;
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
  /** Formatted amount to pay, e.g. "EGP 11,360". */
  amountLabel: string;
  testMode: boolean;
  /** Prefix for input ids; unique per page. */
  idPrefix: string;
  /** Wallet providers the parent can choose between (the picker folds them into one tile). */
  walletProviders?: WalletProvider[];
  /** Switch to another wallet provider. */
  onMethodChange?: (method: ParentPaymentMethodCode) => void;
};

function Field({ label, htmlFor, hint, error, children }: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-semibold text-on-surface">{label}</Label>
      {children}
      {error ? <p className="text-xs text-error">{error}</p> : hint ? <div className="text-xs text-on-surface-variant">{hint}</div> : null}
    </div>
  );
}

/** Common Egyptian banks, suggested in the bank-name field (any other name can be typed). */
const EGYPTIAN_BANKS = {
  en: ['National Bank of Egypt', 'Banque Misr', 'CIB', 'QNB Alahli', 'Banque du Caire', 'Bank of Alexandria', 'Arab African International Bank', 'Faisal Islamic Bank', 'HSBC Egypt', 'Emirates NBD Egypt'],
  ar: ['البنك الأهلي المصري', 'بنك مصر', 'البنك التجاري الدولي CIB', 'بنك QNB الأهلي', 'بنك القاهرة', 'بنك الإسكندرية', 'البنك العربي الأفريقي الدولي', 'بنك فيصل الإسلامي', 'HSBC مصر', 'بنك الإمارات دبي الوطني مصر'],
} as const;

/** Where the money goes: a label, a large value to type into the bank or wallet app, and Copy. */
function SendToBox({ label, value, footer, aside }: { label: string; value: string; footer?: ReactNode; aside?: ReactNode }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch (error) {
      toast.error(t('payment.errors.actionFailed'), { description: error instanceof Error ? error.message : undefined });
    }
  };

  return (
    <div className="flex items-stretch gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-on-surface-variant">{label}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p dir="ltr" className="break-all text-xl font-bold tracking-wide text-on-surface">{value}</p>
          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-primary hover:bg-primary/10"
          >
            <MaterialSymbol name={copied ? 'check' : 'content_copy'} size="text-sm" />
            {t(copied ? 'payment.steps.copied' : 'payment.steps.copy')}
          </button>
        </div>
        {footer ? <div className="mt-1.5 text-xs text-on-surface-variant">{footer}</div> : null}
      </div>
      {aside}
    </div>
  );
}

function Unavailable({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm text-on-surface">
      <MaterialSymbol name="info" size="text-base" className="mt-0.5 text-warning" />
      <span>{children}</span>
    </p>
  );
}

/** Pick a receipt image: one line with the file name and Upload / Change / Remove. */
function ReceiptInput({ file, onChange }: { file: File | null; onChange: (file: File | null) => void }) {
  const { t } = useTranslation();
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl border border-dashed px-3 py-2.5',
          error ? 'border-error/50' : file ? 'border-success/40 bg-success/5' : 'border-outline-variant',
        )}
      >
        <MaterialSymbol name={file ? 'task' : 'receipt_long'} size="text-lg" className={file ? 'text-success' : 'text-on-surface-variant'} />
        <span className={cn('min-w-0 flex-1 truncate text-sm', file ? 'text-on-surface' : 'text-on-surface-variant')}>
          {file ? file.name : t('payment.steps.noReceipt')}
        </span>
        <label
          htmlFor={inputId}
          className="cursor-pointer rounded-lg border border-outline-variant bg-surface px-3 py-1.5 text-xs font-semibold text-on-surface hover:border-primary hover:text-primary"
        >
          {t(file ? 'payment.steps.replaceReceipt' : 'payment.steps.uploadReceipt')}
        </label>
        <input
          id={inputId}
          type="file"
          className="sr-only"
          accept={RECEIPT_IMAGE_TYPES.join(',')}
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            event.target.value = '';
            if (!next) return;
            const fileError = receiptFileError(next);
            if (fileError) {
              setError(t(fileError === 'too_large' ? 'payment.etisalatWallet.fileTooLarge' : 'payment.etisalatWallet.invalidFileType'));
              return;
            }
            setError(null);
            onChange(next);
          }}
        />
        {file ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-md p-1 text-on-surface-variant hover:bg-error/10 hover:text-error"
            aria-label={t('payment.steps.removeReceipt')}
          >
            <MaterialSymbol name="close" size="text-base" />
          </button>
        ) : null}
      </div>
      <p className={cn('text-xs', error ? 'text-error' : 'text-on-surface-variant')}>
        {error ?? t('payment.etisalatWallet.screenshotHelp')}
      </p>
    </div>
  );
}

/**
 * The chosen method's fields, plain and short: where to send the exact amount, and what the
 * nursery needs to match the payment. Card payments only say where the card is entered: on
 * Paymob's secure page, never here.
 */
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
  walletProviders = [],
  onMethodChange,
}: Props) {
  const { t, i18n } = useTranslation();
  const flow = paymentFlowOf(method);
  const providerLabel = (provider: WalletProvider) => t(`payment.manualMethods.${provider}.label`);
  // A field's error shows once the parent has left it, not while the form is still empty.
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const touch = (field: string) => () => setTouched((current) => (current.has(field) ? current : new Set(current).add(field)));
  const shownIssue = (field: string, issue: PaymentDetailsIssue) =>
    touched.has(field) && issues.includes(issue) ? t(PAYMENT_DETAILS_ISSUE_KEYS[issue]) : null;

  if (flow === 'online_checkout') {
    return testMode ? (
      <TestBankCardForm onValidityChange={onTestCardValidityChange} />
    ) : (
      <div className="flex items-start gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MaterialSymbol name="lock" size="text-lg" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-on-surface">{t('payment.steps.cardSecure', { amount: amountLabel })}</p>
          <p className="text-xs leading-5 text-on-surface-variant">{t('payment.steps.cardOtp')}</p>
        </div>
      </div>
    );
  }

  // A method with nothing to fill in only says who confirms it.
  if (flow === 'review') {
    return <p className="text-xs leading-5 text-on-surface-variant">{t('payment.approvalNote')}</p>;
  }

  const referenceField = (label: string, hint?: string) => (
    <Field label={label} htmlFor={`${idPrefix}-reference`} hint={hint}>
      <Input
        id={`${idPrefix}-reference`}
        dir="auto"
        className="tabular-nums"
        value={details.reference}
        maxLength={80}
        autoComplete="off"
        placeholder={t('payment.referencePlaceholder')}
        aria-invalid={details.reference.length > 0 && issues.includes('reference_required')}
        onChange={(event) => onChange({ reference: event.target.value })}
      />
    </Field>
  );

  const nurseryNote = settings.instructions ? (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
      <p className="text-xs font-medium text-on-surface-variant">{t('payment.instructionsTitle')}</p>
      <p className="mt-1.5 whitespace-pre-line break-words text-sm text-on-surface">{settings.instructions}</p>
    </div>
  ) : null;

  if (method === 'instapay') {
    const address = settings.instapayAccountNumber?.trim() || '';
    const accountName = settings.instapayAccountName?.trim() || '';
    return (
      <div className="space-y-4">
        {address ? (
          <SendToBox
            label={t('payment.steps.instapaySend', { amount: amountLabel })}
            value={address}
            footer={accountName ? <>{t('payment.steps.accountName')} <span className="font-semibold text-on-surface">{accountName}</span></> : null}
            aside={settings.instapayQrImageUrl ? (
              <img
                src={settings.instapayQrImageUrl}
                alt={t('payment.instaPay.qrAlt')}
                title={t('payment.steps.scanQr')}
                className="hidden h-20 w-20 shrink-0 rounded-lg border border-outline-variant bg-surface object-contain p-1 sm:block"
              />
            ) : null}
          />
        ) : (
          <Unavailable>{t('payment.steps.instapayNotConfigured')}</Unavailable>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('payment.steps.instapaySender')}
            htmlFor={`${idPrefix}-instapay-sender`}
            hint={t('payment.steps.instapaySenderHint')}
            error={shownIssue('instapay-sender', 'instapay_sender_invalid')}
          >
            <Input
              id={`${idPrefix}-instapay-sender`}
              dir="ltr"
              autoComplete="off"
              maxLength={80}
              placeholder="name@instapay"
              value={details.senderAccount}
              aria-invalid={Boolean(shownIssue('instapay-sender', 'instapay_sender_invalid'))}
              onBlur={touch('instapay-sender')}
              onChange={(event) => onChange({ senderAccount: event.target.value.trimStart() })}
            />
          </Field>
          {referenceField(t('payment.reference'), t('payment.steps.enterReferenceHint'))}
        </div>
        {nurseryNote}
      </div>
    );
  }

  if (flow === 'wallet_receipt' && isWalletProvider(method)) {
    const destination = settings.walletDestinations[method]?.trim() || null;
    const detected = details.walletPhone.length >= 3 ? walletProviderForPhone(details.walletPhone) : null;
    const phoneInvalid = details.walletPhone.length === 11 && issues.includes('wallet_phone_invalid');
    return (
      <div className="space-y-4">
        {walletProviders.length > 1 ? (
          <Field label={t('payment.steps.walletChoose')}>
            <div role="radiogroup" aria-label={t('payment.steps.walletChoose')} className="flex flex-wrap gap-2">
              {walletProviders.map((provider) => {
                const active = provider === method;
                return (
                  <button
                    key={provider}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onMethodChange?.(provider)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      active
                        ? 'border-primary bg-primary/[0.07] text-primary'
                        : 'border-outline-variant bg-surface text-on-surface hover:border-primary/40',
                    )}
                  >
                    {providerLabel(provider)}
                  </button>
                );
              })}
            </div>
          </Field>
        ) : null}

        {destination ? (
          <SendToBox label={t('payment.steps.walletSend', { amount: amountLabel, provider: providerLabel(method) })} value={destination} />
        ) : (
          <Unavailable>{t('payment.wallet.destinationNotConfigured')}</Unavailable>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('payment.wallet.phone')}
            htmlFor={`${idPrefix}-wallet-phone`}
            error={phoneInvalid ? t('payment.wallet.phoneInvalid') : null}
            hint={
              detected === method ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <MaterialSymbol name="check_circle" size="text-sm" />
                  {t('payment.steps.walletPrefixMatch', { provider: providerLabel(method) })}
                </span>
              ) : detected && walletProviders.includes(detected) ? (
                <>
                  {t('payment.steps.walletPrefixSuggest', { provider: providerLabel(detected) })}{' '}
                  <button type="button" className="font-semibold text-primary hover:underline" onClick={() => onMethodChange?.(detected)}>
                    {t('payment.steps.walletUse', { provider: providerLabel(detected) })}
                  </button>
                </>
              ) : (
                t('payment.steps.walletPhoneHint')
              )
            }
          >
            <Input
              id={`${idPrefix}-wallet-phone`}
              dir="ltr"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={11}
              placeholder="01XXXXXXXXX"
              className="tabular-nums tracking-wide"
              value={details.walletPhone}
              aria-invalid={phoneInvalid}
              onChange={(event) => onChange({ walletPhone: event.target.value.replace(/\D/g, '').slice(0, 11) })}
            />
          </Field>
          <Field label={t('payment.wallet.customerName')} htmlFor={`${idPrefix}-wallet-name`}>
            <Input
              id={`${idPrefix}-wallet-name`}
              autoComplete="name"
              maxLength={100}
              placeholder={t('payment.etisalatWallet.namePlaceholder')}
              value={details.walletCustomerName}
              onChange={(event) => onChange({ walletCustomerName: event.target.value })}
            />
          </Field>
        </div>

        <Field label={t('payment.wallet.screenshot')}>
          <ReceiptInput file={details.walletReceipt} onChange={(file) => onChange({ walletReceipt: file })} />
        </Field>

        <Field label={t('payment.wallet.transaction')} htmlFor={`${idPrefix}-wallet-transaction`}>
          <Input
            id={`${idPrefix}-wallet-transaction`}
            dir="auto"
            className="tabular-nums"
            maxLength={80}
            autoComplete="off"
            placeholder={t('payment.referencePlaceholder')}
            value={details.walletTransaction}
            onChange={(event) => onChange({ walletTransaction: event.target.value })}
          />
        </Field>
        {nurseryNote}
      </div>
    );
  }

  if (method === 'bank_transfer') {
    return (
      <div className="space-y-4">
        {settings.instructions ? (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
            <p className="text-xs font-medium text-on-surface-variant">
              {t('payment.steps.bankSend', { amount: amountLabel })}
            </p>
            <p className="mt-1.5 whitespace-pre-line break-words text-sm font-medium text-on-surface">{settings.instructions}</p>
          </div>
        ) : (
          <Unavailable>{t('payment.steps.bankNoDetails')}</Unavailable>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('payment.steps.bankSenderName')}
            htmlFor={`${idPrefix}-bank-sender`}
            error={shownIssue('bank-sender', 'bank_sender_name_required')}
          >
            <Input
              id={`${idPrefix}-bank-sender`}
              autoComplete="name"
              maxLength={100}
              placeholder={t('payment.steps.bankSenderNamePlaceholder')}
              value={details.senderName}
              aria-invalid={Boolean(shownIssue('bank-sender', 'bank_sender_name_required'))}
              onBlur={touch('bank-sender')}
              onChange={(event) => onChange({ senderName: event.target.value })}
            />
          </Field>
          <Field
            label={t('payment.steps.bankSenderBank')}
            htmlFor={`${idPrefix}-bank-name`}
            error={shownIssue('bank-name', 'bank_sender_bank_required')}
          >
            <Input
              id={`${idPrefix}-bank-name`}
              autoComplete="off"
              maxLength={100}
              list={`${idPrefix}-bank-list`}
              placeholder={t('payment.steps.bankSenderBankPlaceholder')}
              value={details.senderBank}
              aria-invalid={Boolean(shownIssue('bank-name', 'bank_sender_bank_required'))}
              onBlur={touch('bank-name')}
              onChange={(event) => onChange({ senderBank: event.target.value })}
            />
            <datalist id={`${idPrefix}-bank-list`}>
              {EGYPTIAN_BANKS[i18n.language.startsWith('ar') ? 'ar' : 'en'].map((bank) => <option key={bank} value={bank} />)}
            </datalist>
          </Field>
        </div>
        {referenceField(t('payment.reference'), t('payment.steps.bankReferenceHint'))}
      </div>
    );
  }

  // Fawry, with a reference the nursery or Fawry issued.
  return (
    <div className="space-y-4">
      {referenceField(t('payment.fawry.reference'))}
      {nurseryNote}
    </div>
  );
}
