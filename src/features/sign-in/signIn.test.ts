import { describe, expect, it } from 'vitest';

import ar from '@/locales/ar.json';
import en from '@/locales/en.json';

import { identifierProblem, magicLinkOutcome, magicLinkProblem, passwordProblem, signInErrorKey, toAuthEmail } from './signIn';

describe('what is typed', () => {
  it('needs a username or email and a password of at least 8 characters', () => {
    expect(identifierProblem('  ')).toBe('required');
    expect(identifierProblem('mona.ali')).toBeNull();
    expect(passwordProblem('')).toBe('required');
    expect(passwordProblem('1234567')).toBe('tooShort');
    expect(passwordProblem('12345678')).toBeNull();
  });

  it('sends a sign-in link only to a real mailbox', () => {
    expect(magicLinkProblem('')).toBe('required');
    expect(magicLinkProblem('mona.ali')).toBe('username');
    expect(magicLinkProblem('mona@')).toBe('invalid');
    expect(magicLinkProblem('mona.ali@parents.xo.local')).toBe('noMailbox');
    expect(magicLinkProblem(' mona@example.com ')).toBeNull();
  });
});

describe('the sign-in address', () => {
  it('is the email as typed, or the address signup made from the username (never asked of the server)', () => {
    expect(toAuthEmail(' mona@example.com ')).toBe('mona@example.com');
    expect(toAuthEmail('Mona.Ali')).toBe('mona.ali@parents.xo.local');
    expect(toAuthEmail('ab')).toBe('ab'); // not a username: sent as typed, the server refuses it
  });
});

describe('what went wrong', () => {
  it('names a failed sign-in in words people understand', () => {
    expect(signInErrorKey({ code: 'invalid_credentials', status: 400 })).toBe('wrongCredentials');
    expect(signInErrorKey({ status: 400, message: 'Invalid login credentials' })).toBe('wrongCredentials');
    expect(signInErrorKey({ code: 'email_not_confirmed' })).toBe('notConfirmed');
    expect(signInErrorKey({ status: 429 })).toBe('tooManyRequests');
    expect(signInErrorKey({ code: 'user_banned' })).toBe('blocked');
    expect(signInErrorKey({ name: 'AuthRetryableFetchError', status: 0 })).toBe('network');
    expect(signInErrorKey({ message: 'TypeError: Failed to fetch' })).toBe('network');
    expect(signInErrorKey({ code: 'unexpected_failure', status: 500 })).toBe('failed');
    expect(signInErrorKey(null)).toBe('failed');
  });

  it('never tells whether an address has an account', () => {
    expect(magicLinkOutcome(null)).toBe('sent');
    expect(magicLinkOutcome({ code: 'otp_disabled', status: 422, message: 'Signups not allowed for otp' })).toBe('sent');
    expect(magicLinkOutcome({ status: 422, message: 'Signups not allowed for this instance' })).toBe('sent');
    expect(magicLinkOutcome({ code: 'over_email_send_rate_limit', status: 429 })).toBe('tooManyRequests');
    expect(magicLinkOutcome({ name: 'AuthRetryableFetchError', status: 0 })).toBe('network');
    expect(magicLinkOutcome({ status: 500 })).toBe('failed');
  });
});

describe('texts', () => {
  it('exist in both languages', () => {
    const lookup = (dict: unknown, key: string) =>
      key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
    const keys = [
      'auth.page.welcome', 'auth.page.welcomeHint', 'auth.page.capsLock', 'auth.page.signingIn', 'auth.page.newParent', 'auth.page.heroBody',
      'auth.page.problems.identifier.required', 'auth.page.problems.password.required', 'auth.page.problems.password.tooShort',
      ...['wrongCredentials', 'notConfirmed', 'tooManyRequests', 'blocked', 'network', 'failed'].map((k) => `auth.page.errors.${k}`),
      ...['required', 'username', 'invalid', 'noMailbox'].map((k) => `auth.page.magic.problems.${k}`),
      ...['tooManyRequests', 'network', 'failed'].map((k) => `auth.page.magic.errors.${k}`),
      'auth.page.magic.sentTitle', 'auth.page.magic.sentBody', 'auth.page.demo.password', 'auth.featureThreeTitle', 'auth.featureThreeDescription',
      ...['xoAdmin', 'branchAdmin', 'financeManager', 'hrManager', 'teacher', 'managerTeacher', 'parent'].flatMap((k) => [`auth.page.demo.accounts.${k}.name`, `auth.page.demo.accounts.${k}.access`]),
    ];
    for (const key of keys) {
      expect(typeof lookup(en, key), `en ${key}`).toBe('string');
      expect(typeof lookup(ar, key), `ar ${key}`).toBe('string');
    }
  });
});
