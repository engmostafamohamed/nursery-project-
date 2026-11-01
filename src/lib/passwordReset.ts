/**
 * Choosing a password without the old one: the "forgot password" request, the page its email link
 * opens, and the first sign-in of a staff member whose first password someone else handed them.
 */

/** The sign-in form's minimum, so a new password can always be used to sign in. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Set on an account whose first password was given by someone else (staff onboarding): its owner
 * chooses their own before anything else. Cleared when they do.
 */
export function mustChangePassword(user: { user_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  return user?.user_metadata?.must_change_password === true;
}

/**
 * Sign-in addresses no email reaches: a parent's username (the address is made from it) and staff
 * onboarded without an email (made from their mobile number). Their owners ask the nursery.
 */
const NO_MAILBOX_DOMAINS = ['parents.xo.local', 'staff.placeholder.xo'];

export type ResetEmailProblem = 'required' | 'username' | 'invalid' | 'noMailbox';

/** What is wrong with the address a reset link is asked for, or null. */
export function resetEmailProblem(value: string): ResetEmailProblem | null {
  const email = value.trim();
  if (!email) return 'required';
  if (!email.includes('@')) return 'username';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'invalid';
  if (NO_MAILBOX_DOMAINS.includes(email.split('@')[1].toLowerCase())) return 'noMailbox';
  return null;
}

export type NewPasswordProblem = 'required' | 'tooShort';

export function newPasswordProblem(password: string): NewPasswordProblem | null {
  if (!password) return 'required';
  if (password.length < PASSWORD_MIN_LENGTH) return 'tooShort';
  return null;
}

export function confirmPasswordProblem(password: string, confirm: string): 'required' | 'mismatch' | null {
  if (!confirm) return 'required';
  return confirm === password ? null : 'mismatch';
}

/** The page a reset link opens. Its address must be in Supabase Auth's redirect URLs. */
export function resetRedirectUrl(origin: string): string {
  return `${origin}/reset-password`;
}

export type ResetErrorKey = 'tooManyRequests' | 'samePassword' | 'weakPassword' | 'linkExpired' | 'failed';

/** Which message a failed reset request or password change shows. */
export function resetErrorKey(error: { code?: string | null; status?: number | null; name?: string | null }): ResetErrorKey {
  const code = error.code ?? '';
  if (error.status === 429 || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'tooManyRequests';
  if (code === 'same_password') return 'samePassword';
  if (code === 'weak_password') return 'weakPassword';
  if (error.name === 'AuthSessionMissingError' || code === 'session_not_found' || code === 'session_expired' || code === 'otp_expired') {
    return 'linkExpired';
  }
  return 'failed';
}
