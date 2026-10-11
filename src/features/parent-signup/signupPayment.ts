import { useQuery } from '@tanstack/react-query';

import {
  isParentPaymentMethodCode,
  type ParentPaymentMethodCode,
} from '@/lib/paymentApi';
import { supabase } from '@/lib/supabase';
import type { ApplicationPaymentPackage } from '@/hooks/useApplicationPackagePayment';
import type { ApplicationExtraHoursPackage } from '@/hooks/useApplicationExtraHoursPackage';

export type SignupPaymentOptions = {
  packages: ApplicationPaymentPackage[];
  extraHoursPackages: ApplicationExtraHoursPackage[];
  methods: ParentPaymentMethodCode[];
  cardCheckoutUnavailable: boolean;
  instructions: string | null;
};

export class SignupPaymentOptionsError extends Error {
  readonly outdatedFunction: boolean;

  constructor(message: string, outdatedFunction: boolean) {
    super(message);
    this.outdatedFunction = outdatedFunction;
  }
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
        methods?: ParentPaymentMethodCode[];
        card_checkout_unavailable?: boolean;
        payment_instructions?: string | null;
      } | null;
      if (!response || !Array.isArray(response.packages) || !Array.isArray(response.extra_hours_packages)) {
        throw new Error('Could not load payment options');
      }
      if (!Array.isArray(response.methods)) {
        throw new SignupPaymentOptionsError('The payment service needs to be updated before registration can continue.', true);
      }

      return {
        packages: response.packages,
        extraHoursPackages: response.extra_hours_packages,
        methods: response.methods.filter(isParentPaymentMethodCode),
        cardCheckoutUnavailable: response.card_checkout_unavailable === true,
        instructions: response.payment_instructions?.trim() || null,
      };
    },
  });
}
