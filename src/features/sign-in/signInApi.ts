/*
 * Signing in over the network: with a password (a username or an email), or with a link sent to
 * the email. Returns what happened; the screen decides what to show.
 */
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

import { magicLinkOutcome, signInErrorKey, type MagicLinkOutcome, type SignInErrorKey } from './signIn';

/** Mirrors the signup function: a parent's auth address is derived from their username. */
const USERNAME_EMAIL_DOMAIN = 'parents.xo.local';
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{4,32}$/;

/**
 * Parents registered before usernames existed authenticate with their real email, while newer ones
 * use the synthetic address signup mints. Ask the database which applies, and fall back to the
 * synthetic form if the lookup is unavailable.
 */
export async function toAuthEmail(identifier: string): Promise<string> {
  const value = identifier.trim();
  if (value.includes('@')) return value;
  if (!USERNAME_PATTERN.test(value)) return value;

  // Cast: this RPC is newer than the generated database types.
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>)('auth_email_for_username', { p_username: value });
  if (!error && typeof data === 'string' && data) return data;
  return `${value.toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
}

export type SignInResult = { ok: true } | { ok: false; reason: SignInErrorKey | 'notPersisted' };

/** Signs in with a password. On success the session is stored and the app moves on by itself. */
export async function signInWithPassword(identifier: string, password: string): Promise<SignInResult> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: await toAuthEmail(identifier), password });
    if (error) return { ok: false, reason: signInErrorKey(error) };
    let session: Session | null = data.session;
    if (!session) session = (await supabase.auth.getSession()).data.session;
    return session ? { ok: true } : { ok: false, reason: 'notPersisted' };
  } catch (error) {
    return { ok: false, reason: signInErrorKey(error as { message?: string }) };
  }
}

/** Emails a one-time sign-in link to an existing account; never creates one. */
export async function sendSignInLink(email: string): Promise<MagicLinkOutcome> {
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/` },
    });
    return magicLinkOutcome(error);
  } catch (error) {
    return magicLinkOutcome(error as { message?: string });
  }
}
