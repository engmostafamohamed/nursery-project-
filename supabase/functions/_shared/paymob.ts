type PaymobConfig = {
  secretKey: string;
  publicKey: string;
  cardIntegrationId: number;
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
};

const PAYMOB_API_URL = 'https://accept.paymob.com/v1/intention/';
const PAYMOB_CHECKOUT_URL = 'https://accept.paymob.com/unifiedcheckout/';

export function getPaymobConfig(): PaymobConfig | null {
  const secretKey = Deno.env.get('PAYMOB_SECRET_KEY')?.trim();
  const publicKey = Deno.env.get('PAYMOB_PUBLIC_KEY')?.trim();
  const integrationValue = Deno.env.get('PAYMOB_CARD_INTEGRATION_ID')?.trim();
  const amountMultiplierValue = Deno.env.get('PAYMOB_AMOUNT_MULTIPLIER')?.trim();
  const appBaseUrl = Deno.env.get('APP_BASE_URL')?.trim();
  if (!secretKey || !publicKey || !integrationValue || !amountMultiplierValue || !appBaseUrl) return null;

  const cardIntegrationId = Number(integrationValue);
  if (!Number.isSafeInteger(cardIntegrationId) || cardIntegrationId <= 0) {
    throw new Error('PAYMOB_CARD_INTEGRATION_ID must be a positive integer');
  }

  const amountMultiplier = Number(amountMultiplierValue);
  if (amountMultiplier !== 1 && amountMultiplier !== 100) {
    throw new Error('PAYMOB_AMOUNT_MULTIPLIER must be 1 or 100');
  }

  const appUrl = new URL(appBaseUrl);
  if (appUrl.protocol !== 'https:' && appUrl.hostname !== 'localhost' && appUrl.hostname !== '127.0.0.1') {
    throw new Error('APP_BASE_URL must use HTTPS');
  }

  return {
    secretKey,
    publicKey,
    cardIntegrationId,
    amountMultiplier,
    appBaseUrl: appUrl.origin,
  };
}

function paymobPhoneNumber(phone: string): string {
  const normalized = phone.replace(/[^\d+]/g, '');
  if (normalized.startsWith('+')) return normalized;
  if (normalized.startsWith('0')) return `+20${normalized.slice(1)}`;
  return normalized;
}

function nameParts(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || 'Parent',
    lastName: parts.slice(1).join(' ') || 'Parent',
  };
}

export async function createPaymobCardCheckout(input: PaymobIntentionInput): Promise<{
  checkoutUrl: string;
  intentionId: string;
}> {
  const config = getPaymobConfig();
  if (!config) throw new Error('Paymob card checkout is not fully configured');
  const { firstName, lastName } = nameParts(input.customerName);
  const amount = Math.round(input.amount * config.amountMultiplier * 100) / 100;

  const response = await fetch(PAYMOB_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Token ${config.secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount,
      currency: 'EGP',
      payment_methods: [config.cardIntegrationId],
      items: [{
        name: 'Nursery registration',
        amount,
        description: 'Tuition and selected extra-hours package',
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
      redirection_url: `${config.appBaseUrl}/signup/success?payment=processing`,
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
