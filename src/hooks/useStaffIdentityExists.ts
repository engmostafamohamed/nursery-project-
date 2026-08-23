import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export interface StaffIdentityCheckResult {
  emailTaken: boolean;
  mobileTaken: boolean;
}

/**
 * Live-checks whether the supplied email / mobile would collide with an
 * existing auth.users row when the staff onboarding form submits.
 *
 * Backed by the `public.check_staff_identity_exists` SECURITY DEFINER function
 * (added in 20260530120000). The function returns booleans only — no user data
 * leaks to the client.
 *
 * Trim/normalisation:
 * - `email`: passed as-is (the function does case-insensitive matching).
 * - `mobile`: digits-only are extracted by the SQL function before matching
 *   against the `<digits>@staff.placeholder.xo` pattern.
 *
 * The hook returns null until BOTH inputs are settled (or empty). The caller
 * controls debouncing — pass already-debounced values for best UX.
 */
export function useStaffIdentityExists(
  email: string | null | undefined,
  mobile: string | null | undefined,
) {
  const emailValue = email?.trim() ?? '';
  const mobileValue = mobile?.trim() ?? '';
  const noInputs = !emailValue && !mobileValue;

  return useQuery<StaffIdentityCheckResult>({
    queryKey: ['staff-identity-exists', emailValue.toLowerCase(), mobileValue.replace(/\D/g, '')],
    queryFn: async (): Promise<StaffIdentityCheckResult> => {
      const { data, error } = await supabase.rpc('check_staff_identity_exists', {
        p_email: emailValue || null,
        p_mobile: mobileValue || null,
      });
      if (error) throw error;
      const row = (data as Array<{ email_taken: boolean; mobile_taken: boolean }>)?.[0];
      return {
        emailTaken: Boolean(row?.email_taken),
        mobileTaken: Boolean(row?.mobile_taken),
      };
    },
    enabled: !noInputs,
    staleTime: 1000 * 30,
  });
}
