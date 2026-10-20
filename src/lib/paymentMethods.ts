import {
  enabledManualMethods,
  isWalletProvider,
  methodNeedsReference,
  type ParentPaymentMethodCode,
  type WalletDestinations,
  type WalletProvider,
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
  /** The parent sends from a mobile wallet (Vodafone, Etisalat, Orange or WE) and uploads the receipt. */
  | 'wallet_receipt'
  /** Nothing to enter: finance confirms the payment by other means. */
  | 'review';

export const PAYMENT_METHOD_ICONS: Record<ParentPaymentMethodCode, string> = {
  card: 'credit_card',
  instapay: 'account_balance',
  vodafone_cash: 'phone_iphone',
  etisalat_cash: 'phone_iphone',
  orange_cash: 'phone_iphone',
  we_pay: 'phone_iphone',
  fawry: 'confirmation_number',
  bank_transfer: 'account_balance',
  cash: 'payments',
  manual: 'receipt_long',
};

export function paymentFlowOf(method: ParentPaymentMethodCode): PaymentFlow {
  if (method === 'card') return 'online_checkout';
  if (isWalletProvider(method)) return 'wallet_receipt';
  if (methodNeedsReference(method)) return 'transfer';
  return 'review';
}

/**
 * Display order: InstaPay first (instant and trusted), then online card checkout, then mobile
 * wallets, bank transfer, and Fawry (cash at an outlet) last.
 */
const PARENT_METHOD_ORDER: readonly ParentPaymentMethodCode[] = [
  'instapay',
  'card',
  'vodafone_cash',
  'etisalat_cash',
  'orange_cash',
  'we_pay',
  'bank_transfer',
  'fawry',
  'manual',
  'cash',
];

/**
 * The methods a parent can choose, in display order: the manual methods the nursery turned on,
 * plus online checkout when the server reports it ready.
 */
export function availableParentPaymentMethods(input: {
  enabled: string[] | null | undefined;
  onlineCheckoutAvailable: boolean;
  /** A wallet provider is offered only when the nursery set its receiving number. */
  walletDestinations?: WalletDestinations;
}): ParentPaymentMethodCode[] {
  const manual = enabledManualMethods(input.enabled, input.walletDestinations);
  const methods: ParentPaymentMethodCode[] = input.onlineCheckoutAvailable ? [...manual, 'card'] : manual;
  return [...methods].sort((a, b) => PARENT_METHOD_ORDER.indexOf(a) - PARENT_METHOD_ORDER.indexOf(b));
}

/** What the parent typed or attached for the chosen method. */
export type PaymentDetails = {
  reference: string;
  /** InstaPay: the parent's own InstaPay address (name@instapay) or registered mobile. */
  senderAccount: string;
  /** Bank transfer: the name on the account the money was sent from. */
  senderName: string;
  /** Bank transfer: the bank the money was sent from. */
  senderBank: string;
  walletPhone: string;
  walletCustomerName: string;
  walletReceipt: File | null;
  /** Optional: the wallet transaction number, when the parent has it. */
  walletTransaction: string;
  /** Test mode only: the local test card form passes its checks. */
  testCardValid: boolean;
};

export const EMPTY_PAYMENT_DETAILS: PaymentDetails = {
  reference: '',
  senderAccount: '',
  senderName: '',
  senderBank: '',
  walletPhone: '',
  walletCustomerName: '',
  walletReceipt: null,
  walletTransaction: '',
  testCardValid: false,
};

export type PaymentDetailsIssue =
  | 'reference_required'
  | 'instapay_sender_invalid'
  | 'bank_sender_name_required'
  | 'bank_sender_bank_required'
  | 'wallet_destination_missing'
  | 'wallet_phone_invalid'
  | 'wallet_name_required'
  | 'wallet_receipt_required'
  | 'test_card_invalid';

/** Translation key for each issue, shown under the field or on the pay button. */
export const PAYMENT_DETAILS_ISSUE_KEYS: Record<PaymentDetailsIssue, string> = {
  reference_required: 'payment.referenceRequired',
  instapay_sender_invalid: 'payment.steps.instapaySenderInvalid',
  bank_sender_name_required: 'payment.steps.bankSenderNameRequired',
  bank_sender_bank_required: 'payment.steps.bankSenderBankRequired',
  wallet_destination_missing: 'payment.wallet.destinationNotConfigured',
  wallet_phone_invalid: 'payment.wallet.phoneInvalid',
  wallet_name_required: 'payment.wallet.nameRequired',
  wallet_receipt_required: 'payment.wallet.receiptRequired',
  test_card_invalid: 'payment.checkout.testCardIncomplete',
};

export type PaymentMethodContext = {
  /** The nursery's receiving number per wallet provider. */
  walletDestinations: WalletDestinations;
  /** Online checkout is simulated: the parent fills the local test card form instead. */
  testMode: boolean;
};

const WALLET_PHONE_PATTERN = /^01[0125]\d{8}$/;
/** An InstaPay address: something@instapay. */
const INSTAPAY_ADDRESS_PATTERN = /^[^\s@]{2,}@instapay$/i;
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
    const issues: PaymentDetailsIssue[] = [];
    if (method === 'instapay' && !isInstapaySender(details.senderAccount)) issues.push('instapay_sender_invalid');
    if (method === 'bank_transfer') {
      if (details.senderName.trim().length < MIN_WALLET_NAME_LENGTH) issues.push('bank_sender_name_required');
      if (details.senderBank.trim().length < MIN_WALLET_NAME_LENGTH) issues.push('bank_sender_bank_required');
    }
    if (details.reference.trim().length < MIN_REFERENCE_LENGTH) issues.push('reference_required');
    return issues;
  }
  if (flow === 'wallet_receipt') {
    const issues: PaymentDetailsIssue[] = [];
    if (!isWalletProvider(method) || !context.walletDestinations[method]?.trim()) issues.push('wallet_destination_missing');
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

/** The parent's InstaPay identity: an InstaPay address (name@instapay) or an Egyptian mobile. */
export function isInstapaySender(value: string): boolean {
  const trimmed = value.trim();
  return INSTAPAY_ADDRESS_PATTERN.test(trimmed) || WALLET_PHONE_PATTERN.test(trimmed.replace(/\s/g, ''));
}

/** Egyptian mobile prefixes and the wallet each network issues. */
const WALLET_PREFIXES: Record<string, WalletProvider> = {
  '010': 'vodafone_cash',
  '011': 'etisalat_cash',
  '012': 'orange_cash',
  '015': 'we_pay',
};

/**
 * The wallet a number most likely belongs to, from its network prefix (010 Vodafone, 011
 * Etisalat, 012 Orange, 015 WE). A hint only: numbers can move between networks.
 */
export function walletProviderForPhone(phone: string): WalletProvider | null {
  return WALLET_PREFIXES[phone.replace(/\D/g, '').slice(0, 3)] ?? null;
}

export type CardBrand = 'visa' | 'mastercard' | 'meeza';

/** Card networks Paymob's checkout accepts; brand names, shown as-is in every language. */
export const CARD_BRAND_NAMES = ['VISA', 'Mastercard', 'Meeza'] as const;

/** The card network from the first digits: Meeza 5078…, Mastercard 51–55 / 2221–2720, Visa 4…. */
export function cardBrandOf(cardNumber: string): CardBrand | null {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.startsWith('5078')) return 'meeza';
  if (/^5[1-5]/.test(digits)) return 'mastercard';
  const firstFour = Number(digits.slice(0, 4));
  if (digits.length >= 4 && firstFour >= 2221 && firstFour <= 2720) return 'mastercard';
  if (digits.startsWith('4')) return 'visa';
  return null;
}

/** The reference saved with the payment request, so finance can match it to the money received. */
export function paymentReferenceFor(method: ParentPaymentMethodCode, details: PaymentDetails): string | null {
  const flow = paymentFlowOf(method);
  if (flow === 'wallet_receipt') {
    const transaction = details.walletTransaction.trim();
    return `Wallet phone: ${details.walletPhone}; customer name: ${details.walletCustomerName.trim()}${transaction ? `; transaction: ${transaction}` : ''}`;
  }
  if (flow === 'transfer') {
    const reference = details.reference.trim();
    if (!reference) return null;
    if (method === 'instapay' && details.senderAccount.trim()) {
      return `Reference: ${reference}; sender: ${details.senderAccount.trim()}`;
    }
    if (method === 'bank_transfer' && (details.senderName.trim() || details.senderBank.trim())) {
      return `Reference: ${reference}; sender: ${details.senderName.trim()}; bank: ${details.senderBank.trim()}`;
    }
    return reference;
  }
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
