// Choosing a password without the old one: who must, which addresses can get a reset link, what a
// new password needs, and the message each failure shows.
import { describe, expect, it } from 'vitest';

import {
  confirmPasswordProblem,
  mustChangePassword,
  newPasswordProblem,
  resetEmailProblem,
  resetErrorKey,
  resetRedirectUrl,
} from '@/lib/passwordReset';

describe('mustChangePassword', () => {
  it('is set for staff given a first password, and only then', () => {
    expect(mustChangePassword({ user_metadata: { must_change_password: true } })).toBe(true);
    expect(mustChangePassword({ user_metadata: { must_change_password: false } })).toBe(false);
    expect(mustChangePassword({ user_metadata: { must_change_password: 'true' } })).toBe(false);
    expect(mustChangePassword({ user_metadata: {} })).toBe(false);
    expect(mustChangePassword(null)).toBe(false);
  });
});

describe('resetEmailProblem', () => {
  it('takes an email address', () => {
    expect(resetEmailProblem('  mona@example.com ')).toBeNull();
    expect(resetEmailProblem('')).toBe('required');
    expect(resetEmailProblem('   ')).toBe('required');
    expect(resetEmailProblem('mona@example')).toBe('invalid');
  });

  it('a username is not one: parents who sign in with it ask the nursery', () => {
    expect(resetEmailProblem('mona.ali')).toBe('username');
  });

  it('addresses no email reaches are refused before asking', () => {
    expect(resetEmailProblem('mona.ali@parents.xo.local')).toBe('noMailbox');
    expect(resetEmailProblem('201012345678@STAFF.placeholder.xo')).toBe('noMailbox');
  });
});

describe('a new password', () => {
  it('needs the sign-in minimum of 8 characters', () => {
    expect(newPasswordProblem('')).toBe('required');
    expect(newPasswordProblem('1234567')).toBe('tooShort');
    expect(newPasswordProblem('12345678')).toBeNull();
  });

  it('typed twice the same', () => {
    expect(confirmPasswordProblem('abcdefgh', '')).toBe('required');
    expect(confirmPasswordProblem('abcdefgh', 'abcdefgH')).toBe('mismatch');
    expect(confirmPasswordProblem('abcdefgh', 'abcdefgh')).toBeNull();
  });
});

describe('resetErrorKey', () => {
  it('names the failures a person can act on', () => {
    expect(resetErrorKey({ status: 429 })).toBe('tooManyRequests');
    expect(resetErrorKey({ code: 'over_email_send_rate_limit', status: 400 })).toBe('tooManyRequests');
    expect(resetErrorKey({ code: 'same_password', status: 422 })).toBe('samePassword');
    expect(resetErrorKey({ code: 'weak_password', status: 422 })).toBe('weakPassword');
    expect(resetErrorKey({ name: 'AuthSessionMissingError' })).toBe('linkExpired');
    expect(resetErrorKey({ code: 'otp_expired' })).toBe('linkExpired');
    expect(resetErrorKey({ code: 'unexpected_failure', status: 500 })).toBe('failed');
  });
});

it('the reset link opens the reset page of this site', () => {
  expect(resetRedirectUrl('https://app.example.com')).toBe('https://app.example.com/reset-password');
});
