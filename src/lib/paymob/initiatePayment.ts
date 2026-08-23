export type PaymobMethod = 'card' | 'fawry' | 'instapay' | 'vodafone_cash' | 'orange_cash';

interface InitiatePaymentInput {
  invoice_id: string;
  amount: number;
  payment_method: PaymobMethod;
}

interface InitiatePaymentResult {
  payment_url?: string;
  iframe_id?: string;
}

export async function initiatePayment(_input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
  // TODO Feature 4: integrate with Paymob API and return hosted checkout URL/iframe.
  return { payment_url: '' };
}
