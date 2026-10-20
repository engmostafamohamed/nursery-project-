import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { confirm } from '@/components/ui/confirm';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useOnlineCheckoutOptions } from '@/hooks/useOnlineCheckoutOptions';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { invalidatePaymentQueries, useSubmitInvoicePayment } from '@/hooks/useSubmitInvoicePayment';
import { newIdempotencyKey, paymentError, walletDestinationsFrom, type ParentPaymentMethodCode } from '@/lib/paymentApi';
import {
  availableParentPaymentMethods,
  EMPTY_PAYMENT_DETAILS,
  paymentDetailsIssues,
  paymentFlowOf,
  paymentReferenceFor,
  receiptStoragePath,
  type PaymentDetails,
} from '@/lib/paymentMethods';
import { startInvoiceCheckout } from '@/lib/paymob/checkout';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/lib/useSettings';

export type CheckoutInvoice = {
  id: string;
  invoiceNumber: string;
  /** Unpaid balance minus payments already awaiting confirmation. */
  payableAmount: number;
};

/**
 * - `full`: one payment of everything still due (application packages; the server enforces it).
 * - `flexible`: the parent may pay part of the balance.
 */
export type CheckoutAmountPolicy = 'full' | 'flexible';

type Options = {
  invoice: CheckoutInvoice | null;
  amountPolicy: CheckoutAmountPolicy;
  /** In-app `/parent/...` path Paymob returns the parent to after online checkout. */
  returnPath: string;
  /**
   * Runs before the parent is asked to confirm (e.g. save the edits the payment depends on).
   * Return false to stop; the caller tells the parent why.
   */
  beforePay?: () => Promise<boolean>;
  /** Called once a payment request is recorded. Online checkout leaves the page instead. */
  onSubmitted?: (result: { duplicate: boolean }) => void;
  /** Method selected at first, when offered (e.g. "try again" after a failed online payment). */
  initialMethod?: ParentPaymentMethodCode | null;
};

const AMOUNT_TOLERANCE = 0.005;

/** Identifies one payment the parent is making: any change to it is a different payment. */
function paymentSignature(invoiceId: string, method: string, amount: number, details: PaymentDetails): string {
  const receipt = details.walletReceipt;
  return JSON.stringify([
    invoiceId,
    method,
    amount.toFixed(2),
    details.reference.trim(),
    details.senderAccount.trim(),
    details.senderName.trim(),
    details.senderBank.trim(),
    details.walletPhone,
    details.walletCustomerName.trim(),
    details.walletTransaction.trim(),
    receipt ? [receipt.name, receipt.size, receipt.lastModified] : null,
  ]);
}

/**
 * Everything a parent payment screen does, independent of layout: which methods to offer, what
 * the parent must enter, and paying exactly once.
 *
 * Paying once: a double click is dropped (single flight), and every retry of the same payment
 * reuses one idempotency key, so the server returns the first result instead of recording it
 * twice. A different method, amount or details is a new payment with a new key.
 */
export function useInvoiceCheckout({ invoice, amountPolicy, returnPath, beforePay, onSubmitted, initialMethod = null }: Options) {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const queryClient = useQueryClient();
  const { settings, nurseryId } = useSettings();
  const online = useOnlineCheckoutOptions(nurseryId);
  const submitPayment = useSubmitInvoicePayment();
  const flight = useSingleFlight();
  const paymentKeyRef = useRef<{ signature: string; key: string } | null>(null);

  const walletDestinations = useMemo(() => walletDestinationsFrom(settings), [settings]);
  const methods = useMemo(
    () => availableParentPaymentMethods({
      enabled: settings.payment_methods_enabled,
      onlineCheckoutAvailable: online.options.available,
      walletDestinations,
    }),
    [online.options.available, settings.payment_methods_enabled, walletDestinations],
  );
  const [selectedMethod, setSelectedMethod] = useState<ParentPaymentMethodCode | null>(initialMethod);
  const method = selectedMethod && methods.includes(selectedMethod) ? selectedMethod : methods[0] ?? null;

  const [details, setDetails] = useState<PaymentDetails>(EMPTY_PAYMENT_DETAILS);
  const updateDetails = useCallback((patch: Partial<PaymentDetails>) => {
    setDetails((current) => ({ ...current, ...patch }));
  }, []);
  // Stable and change-only: the test card form reports its validity from an effect.
  const setTestCardValid = useCallback((valid: boolean) => {
    setDetails((current) => (current.testCardValid === valid ? current : { ...current, testCardValid: valid }));
  }, []);

  const payable = Math.max(0, invoice?.payableAmount ?? 0);
  const [customAmount, setCustomAmount] = useState<string | null>(null);
  const amountText = amountPolicy === 'flexible' ? customAmount ?? payable.toFixed(2) : payable.toFixed(2);
  const amount = amountPolicy === 'flexible' ? Number(amountText) : payable;
  const amountValid = Number.isFinite(amount) && amount > 0 && amount <= payable + AMOUNT_TOLERANCE;

  const testMode = online.options.testMode;
  const issues = method ? paymentDetailsIssues(method, details, { walletDestinations, testMode }) : [];
  const canPay = Boolean(invoice) && method !== null && amountValid && issues.length === 0 && !flight.running;

  const keyFor = (signature: string) => {
    if (paymentKeyRef.current?.signature !== signature) {
      paymentKeyRef.current = { signature, key: newIdempotencyKey() };
    }
    return paymentKeyRef.current.key;
  };

  const finishSubmitted = (duplicate: boolean) => {
    paymentKeyRef.current = null;
    // The test card form keeps its own fields, so its validity carries over.
    setDetails((current) => ({ ...EMPTY_PAYMENT_DETAILS, testCardValid: current.testCardValid }));
    setCustomAmount(null);
    toast.success(t(duplicate ? 'payment.alreadySubmitted' : 'payment.submittedForApproval'));
    onSubmitted?.({ duplicate });
  };

  const uploadReceipt = async (file: File): Promise<string> => {
    if (!user?.id || !nurseryId || !invoice) throw new Error(t('payment.etisalatWallet.uploadFailed'));
    const path = receiptStoragePath({ nurseryId, parentId: user.id, invoiceId: invoice.id, file });
    const { error } = await supabase.storage.from('payment-proofs').upload(path, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw error;
    return path;
  };

  const pay = () =>
    flight.run(async () => {
      if (!invoice || !method || !amountValid || issues.length > 0) return;
      try {
        if (beforePay && !(await beforePay())) return;
      } catch (error) {
        toast.error(t('payment.errors.actionFailed'), { description: error instanceof Error ? error.message : undefined });
        return;
      }
      const flow = paymentFlowOf(method);
      const amountLabel = t('invoice.egpAmount', { amount: amount.toFixed(2) });
      const methodLabel = t(`payment.manualMethods.${method}.label`);
      const ok = await confirm({
        title: t('payment.confirm.title'),
        description: [
          t('payment.confirm.description', { amount: amountLabel, number: invoice.invoiceNumber, method: methodLabel }),
          flow === 'transfer' ? t('payment.confirm.reference', { reference: details.reference.trim() }) : '',
          flow === 'online_checkout' && !testMode ? t('payment.checkout.redirectNote') : t('payment.confirm.reviewNote'),
        ].filter(Boolean).join(' '),
        confirmText: flow === 'online_checkout' && !testMode
          ? t('payment.checkout.continueToCheckout', { amount: amountLabel })
          : t('payment.confirm.submit', { amount: amountLabel }),
        icon: 'payments',
      });
      if (!ok) return;

      const idempotencyKey = keyFor(paymentSignature(invoice.id, method, amount, details));
      try {
        if (flow === 'online_checkout') {
          const result = await startInvoiceCheckout({ invoiceId: invoice.id, amount, idempotencyKey, returnPath });
          invalidatePaymentQueries(queryClient, user?.id);
          if (result.kind === 'redirect') {
            window.location.assign(result.checkoutUrl);
            return;
          }
          finishSubmitted(result.kind === 'duplicate');
          return;
        }

        const proofUrl = flow === 'wallet_receipt' && details.walletReceipt
          ? await uploadReceipt(details.walletReceipt)
          : null;
        const result = await submitPayment.mutateAsync({
          invoiceId: invoice.id,
          amount,
          method,
          reference: paymentReferenceFor(method, details),
          proofUrl,
          idempotencyKey,
        });
        finishSubmitted(result.status === 'duplicate');
      } catch (error) {
        const { key, values } = paymentError(error);
        // An unexplained failure may have reached the server, so its retry keeps the key and is
        // answered with the first result. A refused payment will not succeed on a retry.
        const unexplained = key === 'payment.errors.actionFailed' || key === 'payment.errors.payment_checkout_failed';
        if (!unexplained) paymentKeyRef.current = null;
        toast.error(t(key, values), {
          description: key === 'payment.errors.actionFailed' && error instanceof Error ? error.message : undefined,
        });
        invalidatePaymentQueries(queryClient, user?.id);
      }
    });

  return {
    methods,
    method,
    selectMethod: setSelectedMethod,
    details,
    updateDetails,
    setTestCardValid,
    issues,
    amount,
    amountText,
    amountValid,
    payable,
    setAmountText: setCustomAmount,
    testMode,
    isLoadingMethods: online.isLoading,
    settings: {
      instapayAccountName: settings.instapay_account_name,
      instapayAccountNumber: settings.instapay_account_number,
      instapayQrImageUrl: settings.instapay_qr_image_url,
      walletDestinations,
      instructions: settings.payment_instructions?.trim() || null,
    },
    canPay,
    submitting: flight.running,
    pay,
  };
}

export type InvoiceCheckout = ReturnType<typeof useInvoiceCheckout>;
