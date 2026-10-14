type PaymobConfig = {
  secretKey: string;
  publicKey: string;
  paymentMethodIntegrationIds: number[];
  amountMultiplier: 1 | 100;
  appBaseUrl: string;
};

type PaymobIntentionInput = {
  amount: number;
  attemptId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  address: string | null;
  enabledPaymentMethods: string[] | null | undefined;
  /** App path Paymob sends the parent back to; it must start with `/`. Defaults to the signup success page. */
  returnPath?: string;
  /** Line shown on Paymob's checkout page. */
  item?: { name: string; description: string };
};

const PAYMOB_API_URL = 'https://accept.paymob.com/v1/intention/';
const PAYMOB_CHECKOUT_URL = 'https://accept.paymob.com/unifiedcheckout/';
const DEFAULT_RETURN_PATH = '/signup/success?payment=processing';
const DEFAULT_ITEM = { name: 'Nursery registration', description: 'Tuition and selected extra-hours package' };

/**
 * Test-only switch (never on production): online checkout is simulated, no Paymob request is
 * made, and the payment attempt is marked `[TEST PAYMENT]` so it can never be confirmed.
 */
export function onlinePaymentTestMode(): boolean {
  return Deno.env.get('SIGNUP_PAYMENT_TEST_MODE')?.trim().toLowerCase() === 'true';
}

export function getPaymobConfig(enabledMethods: string[] | null | undefined): PaymobConfig | null {
  const secretKey = Deno.env.get('PAYMOB_SECRET_KEY')?.trim();
  const publicKey = Deno.env.get('PAYMOB_PUBLIC_KEY')?.trim();
  const amountMultiplierValue = Deno.env.get('PAYMOB_AMOUNT_MULTIPLIER')?.trim();
  const appBaseUrl = Deno.env.get('APP_BASE_URL')?.trim();
  if (!secretKey || !publicKey || !amountMultiplierValue || !appBaseUrl) return null;

  const amountMultiplier = Number(amountMultiplierValue);
  if (amountMultiplier !== 1 && amountMultiplier !== 100) {
    throw new Error('PAYMOB_AMOUNT_MULTIPLIER must be 1 or 100');
  }

  const integrationSettings = [
    { setting: 'paymob', secret: 'PAYMOB_CARD_INTEGRATION_ID' },
    { setting: 'instapay', secret: 'PAYMOB_INSTAPAY_INTEGRATION_ID' },
    { setting: 'mobile_wallet', secret: 'PAYMOB_MOBILE_WALLET_INTEGRATION_ID' },
    { setting: 'fawry', secret: 'PAYMOB_FAWRY_INTEGRATION_ID' },
  ];
  const paymentMethodIntegrationIds = [...new Set(
    integrationSettings
      .filter(({ setting }) => enabledMethods?.includes(setting))
      .map(({ secret }) => Deno.env.get(secret)?.trim())
      .filter((value): value is string => Boolean(value))
      .map((value) => {
        const id = Number(value);
        if (!Number.isSafeInteger(id) || id <= 0) {
          throw new Error('Paymob integration IDs must be positive integers');
        }
        return id;
      }),
  )];
  if (paymentMethodIntegrationIds.length === 0) return null;

  const appUrl = new URL(appBaseUrl);
  if (appUrl.protocol !== 'https:' && appUrl.hostname !== 'localhost' && appUrl.hostname !== '127.0.0.1') {
    throw new Error('APP_BASE_URL must use HTTPS');
  }

  return {
    secretKey,
    publicKey,
    paymentMethodIntegrationIds,
    amountMultiplier,
    appBaseUrl: appUrl.origin,
  };
}

function paymobPhoneNumber(phone: string): string {
  const normalized = phone.replace(/[^\d+]/g, '');
  if (normalized.startsWith('+')) return normalized;
  if (normalized.startsWith('0')) return `+20${normalized.slice(1)}`;
  // Paymob requires the field; 'NA' is its placeholder for unknown billing values.
  return normalized || 'NA';
}

function nameParts(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || 'Parent',
    lastName: parts.slice(1).join(' ') || 'Parent',
  };
}

export async function createPaymobCheckout(input: PaymobIntentionInput): Promise<{
  checkoutUrl: string;
  intentionId: string;
}> {
  const config = getPaymobConfig(input.enabledPaymentMethods);
  if (!config) throw new Error('Paymob online checkout is not fully configured');
  const { firstName, lastName } = nameParts(input.customerName);
  const amount = Math.round(input.amount * config.amountMultiplier * 100) / 100;
  const returnPath = input.returnPath ?? DEFAULT_RETURN_PATH;
  if (!returnPath.startsWith('/') || returnPath.startsWith('//')) throw new Error('Invalid Paymob return path');
  const item = input.item ?? DEFAULT_ITEM;

  const response = await fetch(PAYMOB_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Token ${config.secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount,
      currency: 'EGP',
      payment_methods: config.paymentMethodIntegrationIds,
      items: [{
        name: item.name,
        amount,
        description: item.description,
        quantity: 1,
      }],
      billing_data: {
        apartment: 'NA',
        email: input.customerEmail,
        floor: 'NA',
        first_name: firstName,
        last_name: lastName,
        phone_number: paymobPhoneNumber(input.customerPhone),
        street: input.address?.trim() || 'NA',
        building: 'NA',
        country: 'EGY',
        state: 'NA',
      },
      customer: {
        first_name: firstName,
        last_name: lastName,
        email: input.customerEmail,
        phone_number: paymobPhoneNumber(input.customerPhone),
      },
      special_reference: input.attemptId,
      redirection_url: `${config.appBaseUrl}${returnPath}`,
    }),
  });

  let payload: {
    id?: unknown;
    client_secret?: unknown;
    detail?: unknown;
    message?: unknown;
  } | null = null;
  try {
    payload = await response.json();
  } catch {
    if (response.ok) throw new Error('Paymob returned an invalid response');
  }
  if (!response.ok) {
    const providerMessage = typeof payload?.detail === 'string'
      ? payload.detail
      : typeof payload?.message === 'string'
        ? payload.message
        : `Paymob checkout request failed (${response.status})`;
    throw new Error(providerMessage);
  }
  const intentionId = typeof payload?.id === 'string'
    ? payload.id
    : typeof payload?.id === 'number' && Number.isSafeInteger(payload.id)
      ? String(payload.id)
      : null;
  if (!intentionId || typeof payload?.client_secret !== 'string') {
    throw new Error('Paymob returned an incomplete checkout response');
  }

  const checkoutUrl = new URL(PAYMOB_CHECKOUT_URL);
  checkoutUrl.searchParams.set('publicKey', config.publicKey);
  checkoutUrl.searchParams.set('clientSecret', payload.client_secret);
  return { checkoutUrl: checkoutUrl.toString(), intentionId };
}
