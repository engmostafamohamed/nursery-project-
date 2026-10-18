import { useQuery } from '@tanstack/react-query';

import {
  isParentPaymentMethodCode,
  isWalletProvider,
  type ParentPaymentMethodCode,
  type WalletDestinations,
} from '@/lib/paymentApi';
import { parseParentPackageTexts, type ParentPackageTexts } from '@/lib/parentPackageTexts';
import { supabase } from '@/lib/supabase';
import type { ExtraHoursHourlyPlan } from '@/components/parent/ApplicationExtraHoursPackageCard';
import type { ApplicationPaymentPackage } from '@/hooks/useApplicationPackagePayment';
import type { ApplicationExtraHoursPackage } from '@/hooks/useApplicationExtraHoursPackage';

export type SignupPaymentOptions = {
  packages: ApplicationPaymentPackage[];
  extraHoursPackages: ApplicationExtraHoursPackage[];
  /** The nursery's hourly rate for extra time; null while an older function omits it. */
  extraHoursHourlyPlan: ExtraHoursHourlyPlan | null;
  methods: ParentPaymentMethodCode[];
  testMode: boolean;
  paymobCheckoutUnavailable: boolean;
  instructions: string | null;
  /** The nursery's receiving number per wallet provider (only providers offered). */
  walletDestinations: WalletDestinations;
  instapay: { accountName: string | null; accountNumber: string | null; qrImageUrl: string | null };
  /** The nursery's own texts above the packages; empty ones show the standard text. */
  texts: ParentPackageTexts;
};

export class SignupPaymentOptionsError extends Error {
  readonly outdatedFunction: boolean;

  constructor(message: string, outdatedFunction: boolean) {
    super(message);
    this.outdatedFunction = outdatedFunction;
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Older functions only sent the Etisalat Cash number. */
function parseWalletDestinations(raw: Record<string, unknown> | null | undefined, etisalat: string | null | undefined): WalletDestinations {
  const destinations: WalletDestinations = {};
  for (const [provider, value] of Object.entries(raw ?? {})) {
    const number = text(value);
    if (isWalletProvider(provider) && number) destinations[provider] = number;
  }
  if (!raw && text(etisalat)) destinations.etisalat_cash = text(etisalat);
  return destinations;
}

export function useSignupPaymentOptions(nurseryId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['signup-payment-options', nurseryId],
    enabled: Boolean(nurseryId && enabled),
    queryFn: async (): Promise<SignupPaymentOptions> => {
      if (!nurseryId) throw new Error('Missing nursery');
      const { data, error } = await supabase.functions.invoke('parent-signup-complete', {
        body: { action: 'payment_options', nursery_id: nurseryId },
      });
      if (error) {
        let detail = error.message;
        const context = error.context;
        if (context instanceof Response) {
          try {
            const payload = (await context.clone().json()) as { error?: unknown; error_message?: unknown };
            const message = payload.error_message ?? payload.error;
            if (typeof message === 'string') detail = message;
          } catch {
            // Keep the Functions client error when the response is not JSON.
          }
        }
        const outdatedFunction = detail === 'Missing required fields';
        throw new SignupPaymentOptionsError(detail, outdatedFunction);
      }

      const response = data as {
        packages?: ApplicationPaymentPackage[];
        extra_hours_packages?: ApplicationExtraHoursPackage[];
        extra_hours_hourly_plan?: { rate?: unknown; grace_minutes?: unknown; closing_time?: unknown } | null;
        methods?: ParentPaymentMethodCode[];
        payment_test_mode?: boolean;
        paymob_checkout_unavailable?: boolean;
        payment_instructions?: string | null;
        etisalat_cash_account_number?: string | null;
        wallet_destinations?: Record<string, unknown> | null;
        instapay?: { account_name?: unknown; account_number?: unknown; qr_image_url?: unknown } | null;
        parent_texts?: unknown;
      } | null;
      if (!response || !Array.isArray(response.packages) || !Array.isArray(response.extra_hours_packages)) {
        throw new Error('Could not load payment options');
      }
      if (!Array.isArray(response.methods)) {
        throw new SignupPaymentOptionsError('The payment service needs to be updated before registration can continue.', true);
      }

      const plan = response.extra_hours_hourly_plan;
      const rate = Number(plan?.rate);
      return {
        packages: response.packages,
        extraHoursPackages: response.extra_hours_packages,
        extraHoursHourlyPlan: plan && Number.isFinite(rate) && rate >= 0
          ? {
              rate,
              graceMinutes: Number(plan.grace_minutes ?? 0) || 0,
              closingTime: typeof plan.closing_time === 'string' && plan.closing_time ? plan.closing_time : null,
            }
          : null,
        methods: response.methods.filter(isParentPaymentMethodCode),
        testMode: response.payment_test_mode === true,
        paymobCheckoutUnavailable: response.paymob_checkout_unavailable === true,
        instructions: response.payment_instructions?.trim() || null,
        walletDestinations: parseWalletDestinations(response.wallet_destinations, response.etisalat_cash_account_number),
        instapay: {
          accountName: text(response.instapay?.account_name),
          accountNumber: text(response.instapay?.account_number),
          qrImageUrl: text(response.instapay?.qr_image_url),
        },
        texts: parseParentPackageTexts(response.parent_texts),
      };
    },
  });
}
