/*
 * Signing in over the network: with a password (a username or an email), or with a link sent to
 * the email. Returns what happened; the screen decides what to show.
 */
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

import { magicLinkOutcome, signInErrorKey, toAuthEmail, type MagicLinkOutcome, type SignInErrorKey } from './signIn';

export type SignInResult = { ok: true } | { ok: false; reason: SignInErrorKey | 'notPersisted' };

/** Signs in with a password. On success the session is stored and the app moves on by itself. */
export async function signInWithPassword(identifier: string, password: string): Promise<SignInResult> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: toAuthEmail(identifier), password });
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
