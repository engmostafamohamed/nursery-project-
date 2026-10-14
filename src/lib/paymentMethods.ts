import {
  enabledManualMethods,
  methodNeedsReference,
  type ParentPaymentMethodCode,
} from '@/lib/paymentApi';

/**
 * What every parent payment screen needs to know about a payment method: how it is paid, what
 * the parent must enter, and when that entry is complete. Screens render from this so they all
 * offer the same choices and ask for the same details. The server checks every payment again.
 */

/** How the money moves for a method. */
export type PaymentFlow =
  /** The parent pays on Paymob's hosted checkout page. */
  | 'online_checkout'
  /** The parent sends the money, then gives the transaction number so finance can match it. */
  | 'transfer'
  /** The parent sends from an Etisalat Cash wallet and uploads the receipt. */
  | 'wallet_receipt'
  /** Nothing to enter: finance confirms the payment by other means. */
  | 'review';

export const PAYMENT_METHOD_ICONS: Record<ParentPaymentMethodCode, string> = {
  card: 'credit_card',
  instapay: 'account_balance',
  vodafone_cash: 'phone_iphone',
  etisalat_cash: 'phone_iphone',
  fawry: 'confirmation_number',
  bank_transfer: 'account_balance',
  cash: 'payments',
  manual: 'receipt_long',
};

export function paymentFlowOf(method: ParentPaymentMethodCode): PaymentFlow {
  if (method === 'card') return 'online_checkout';
  if (method === 'etisalat_cash') return 'wallet_receipt';
  if (methodNeedsReference(method)) return 'transfer';
  return 'review';
}

/**
 * The methods a parent can choose, in display order: online checkout first when the server
 * reports it ready, then the manual methods the nursery turned on.
 */
export function availableParentPaymentMethods(input: {
  enabled: string[] | null | undefined;
  onlineCheckoutAvailable: boolean;
}): ParentPaymentMethodCode[] {
  const manual = enabledManualMethods(input.enabled);
  return input.onlineCheckoutAvailable ? ['card', ...manual] : manual;
}

/** What the parent typed or attached for the chosen method. */
export type PaymentDetails = {
  reference: string;
  walletPhone: string;
  walletCustomerName: string;
  walletReceipt: File | null;
  /** Test mode only: the local test card form passes its checks. */
  testCardValid: boolean;
};

export const EMPTY_PAYMENT_DETAILS: PaymentDetails = {
  reference: '',
  walletPhone: '',
  walletCustomerName: '',
  walletReceipt: null,
  testCardValid: false,
};

export type PaymentDetailsIssue =
  | 'reference_required'
  | 'wallet_destination_missing'
  | 'wallet_phone_invalid'
  | 'wallet_name_required'
  | 'wallet_receipt_required'
  | 'test_card_invalid';

/** Translation key for each issue, shown under the field or on the pay button. */
export const PAYMENT_DETAILS_ISSUE_KEYS: Record<PaymentDetailsIssue, string> = {
  reference_required: 'payment.referenceRequired',
  wallet_destination_missing: 'payment.etisalatWallet.destinationNotConfigured',
  wallet_phone_invalid: 'payment.etisalatWallet.phoneInvalid',
  wallet_name_required: 'payment.etisalatWallet.nameRequired',
  wallet_receipt_required: 'payment.etisalatWallet.completeRequired',
  test_card_invalid: 'payment.checkout.testCardIncomplete',
};

export type PaymentMethodContext = {
  /** The nursery's Etisalat Cash receiving number, when configured. */
  walletDestination: string | null;
  /** Online checkout is simulated: the parent fills the local test card form instead. */
  testMode: boolean;
};

const WALLET_PHONE_PATTERN = /^01[0125]\d{8}$/;
const MIN_REFERENCE_LENGTH = 4;
const MIN_WALLET_NAME_LENGTH = 2;

/** Everything still missing before this method can be paid. Empty means ready. */
export function paymentDetailsIssues(
  method: ParentPaymentMethodCode,
  details: PaymentDetails,
  context: PaymentMethodContext,
): PaymentDetailsIssue[] {
  const flow = paymentFlowOf(method);
  if (flow === 'transfer') {
    return details.reference.trim().length < MIN_REFERENCE_LENGTH ? ['reference_required'] : [];
  }
  if (flow === 'wallet_receipt') {
    const issues: PaymentDetailsIssue[] = [];
    if (!context.walletDestination?.trim()) issues.push('wallet_destination_missing');
    if (!WALLET_PHONE_PATTERN.test(details.walletPhone)) issues.push('wallet_phone_invalid');
    if (details.walletCustomerName.trim().length < MIN_WALLET_NAME_LENGTH) issues.push('wallet_name_required');
    if (!details.walletReceipt) issues.push('wallet_receipt_required');
    return issues;
  }
  if (flow === 'online_checkout' && context.testMode && !details.testCardValid) {
    return ['test_card_invalid'];
  }
  return [];
}

/** The reference saved with the payment request, so finance can match it to the money received. */
export function paymentReferenceFor(method: ParentPaymentMethodCode, details: PaymentDetails): string | null {
  const flow = paymentFlowOf(method);
  if (flow === 'wallet_receipt') {
    return `Wallet phone: ${details.walletPhone}; customer name: ${details.walletCustomerName.trim()}`;
  }
  if (flow === 'transfer') return details.reference.trim() || null;
  return null;
}

export const RECEIPT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

export type ReceiptFileError = 'invalid_type' | 'too_large';

export function receiptFileError(file: Pick<File, 'type' | 'size'>): ReceiptFileError | null {
  if (!RECEIPT_IMAGE_TYPES.some((type) => type === file.type)) return 'invalid_type';
  if (file.size > RECEIPT_MAX_BYTES) return 'too_large';
  return null;
}

/** Where a payment receipt is stored in the private `payment-proofs` bucket. */
export function receiptStoragePath(input: {
  nurseryId: string;
  parentId: string;
  invoiceId: string;
  file: Pick<File, 'type'>;
  now?: number;
}): string {
  const extension = input.file.type === 'image/png' ? 'png' : input.file.type === 'image/webp' ? 'webp' : 'jpg';
  return `${input.nurseryId}/${input.parentId}/${input.invoiceId}/${input.now ?? Date.now()}.${extension}`;
}

/**
 * The application an invoice was created for, if any. Such invoices are paid in one payment of
 * everything still due (the database refuses less: payment_full_amount_required).
 */
export function invoiceApplicationId(lineItemsJson: unknown): string | null {
  if (!lineItemsJson || typeof lineItemsJson !== 'object' || Array.isArray(lineItemsJson)) return null;
  const applicationId = (lineItemsJson as { application_id?: unknown }).application_id;
  return typeof applicationId === 'string' && applicationId.trim() ? applicationId : null;
}

/** What the parent can still pay now: the unpaid balance minus payments awaiting confirmation. */
export function payableNow(invoice: { balanceDue: number; pendingAmount: number }): number {
  return Math.max(0, Math.round((invoice.balanceDue - invoice.pendingAmount) * 100) / 100);
}
