/*
 * Signing in as plain rules (no React, no network): what is wrong with what was typed, and which
 * message a failed sign-in or sign-in link shows. The messages never say whether an account exists.
 */
import { PASSWORD_MIN_LENGTH, resetEmailProblem, type ResetEmailProblem } from '@/lib/passwordReset';

export type IdentifierProblem = 'required';
export type PasswordProblem = 'required' | 'tooShort';

/** The username or email field: anything but blank (parents sign in with a username, staff with an email). */
export function identifierProblem(value: string): IdentifierProblem | null {
  return value.trim() ? null : 'required';
}

/** The password field: never shorter than any password the app lets someone choose. */
export function passwordProblem(value: string): PasswordProblem | null {
  if (!value) return 'required';
  return value.length < PASSWORD_MIN_LENGTH ? 'tooShort' : null;
}

/** A sign-in link goes to a real mailbox only: not a username, nor an address made from one. */
export function magicLinkProblem(value: string): ResetEmailProblem | null {
  return resetEmailProblem(value);
}

type AuthFailure = { code?: string | null; status?: number | null; name?: string | null; message?: string | null } | null | undefined;

const isNetwork = (error: NonNullable<AuthFailure>) =>
  error.name === 'AuthRetryableFetchError' || error.status === 0 || /failed to fetch|network|load failed/i.test(error.message ?? '');
const isRateLimited = (error: NonNullable<AuthFailure>) =>
  error.status === 429 || ['over_request_rate_limit', 'over_email_send_rate_limit'].includes(error.code ?? '');

export type SignInErrorKey = 'wrongCredentials' | 'notConfirmed' | 'tooManyRequests' | 'blocked' | 'network' | 'failed';

/** Which message a failed sign-in shows (auth.page.errors.<key>). */
export function signInErrorKey(error: AuthFailure): SignInErrorKey {
  if (!error) return 'failed';
  const code = error.code ?? '';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(error.message ?? '')) return 'wrongCredentials';
  if (code === 'email_not_confirmed') return 'notConfirmed';
  if (isRateLimited(error)) return 'tooManyRequests';
  if (code === 'user_banned') return 'blocked';
  if (isNetwork(error)) return 'network';
  return 'failed';
}

export type MagicLinkOutcome = 'sent' | 'tooManyRequests' | 'network' | 'failed';

/**
 * What asking for a sign-in link led to. The link never creates an account, so an address with no
 * account is refused; that is shown as sent too, or the form would tell anyone who has one.
 */
export function magicLinkOutcome(error: AuthFailure): MagicLinkOutcome {
  if (!error) return 'sent';
  const code = error.code ?? '';
  if (['otp_disabled', 'signup_disabled', 'user_not_found'].includes(code) || /signups? not allowed/i.test(error.message ?? '')) return 'sent';
  if (isRateLimited(error)) return 'tooManyRequests';
  if (isNetwork(error)) return 'network';
  return 'failed';
}
