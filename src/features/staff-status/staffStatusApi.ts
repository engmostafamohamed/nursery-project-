import { errorTextKey } from '@/lib/errorCode';
import { supabase } from '@/lib/supabase';

/*
 * A staff member's status through the server (set_staff_active): deactivating shuts the account out
 * at once (no rights, no sign-in); reactivating gives the access back. Nobody changes a status, their
 * own included, any other way.
 */

/** Why the server refused. */
export const STAFF_STATUS_ERROR_CODES = ['staff_forbidden', 'staff_not_yourself', 'staff_not_found'] as const;

export async function setStaffActive(userId: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_staff_active' as never, { p_user_id: userId, p_active: active } as never);
  if (error) throw error;
}

/** The text key for a refusal (staff.deactivateErrors.<code>, network or failed). */
export const staffStatusErrorKey = (error: unknown): string => errorTextKey(error, STAFF_STATUS_ERROR_CODES, 'staff.deactivateErrors');
