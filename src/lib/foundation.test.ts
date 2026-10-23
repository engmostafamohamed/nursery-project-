// Module 16 · Platform foundation, security & quality — sessions, shared formatting, the offline
// queue and the two language files.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import ar from '@/locales/ar.json';
import en from '@/locales/en.json';
import i18n from '@/lib/i18n';
import { fakeDb } from '@/test/fakeSupabase';

import { isAuthSessionError } from './authErrors';
import { formatDate, formatTime, localDateInputValue } from './datetime';
import { formatMobileDisplayForInput, stripMobileInputDisplay } from './mobileDisplayFormat';
import {
  enqueueOfflineRetry,
  flushOfflineQueue,
  getOfflineQueueSnapshot,
  getPendingCount,
  removeQueued,
  subscribeOfflineQueue,
} from './offlineRequestQueue';
import { handleFailedRequest } from './sessionExpiry';
import { isTabRoot } from './tabRootPaths';
import { cn, formatQueryError, getUserInitials } from './utils';

vi.mock('@/lib/supabase', () => import('@/test/fakeSupabase'));

describe('telling an expired session from other errors', () => {
  it.each([
    [{ code: 'PGRST301', message: 'JWT expired' }],
    [{ status: 401 }],
    [{ name: 'AuthSessionMissingError' }],
    [{ message: 'Invalid JWT' }],
    [{ message: 'refresh token not found' }],
  ])('%o is a session error', (error) => {
    expect(isAuthSessionError(error)).toBe(true);
  });

  it.each([
    [{ code: '42501', message: 'permission denied for table invoices' }],
    [{ status: 500, message: 'Internal error' }],
    [new Error('Network request failed')],
    [null],
    ['JWT expired'],
  ])('%o is not a session error', (error) => {
    expect(isAuthSessionError(error)).toBe(false);
  });
});

describe('recovering from an expired session', () => {
  const expired = { code: 'PGRST301' };

  beforeEach(() => {
    fakeDb.reset();
  });

  it('ignores errors that are not about the session', async () => {
    expect(await handleFailedRequest({ code: '42501' })).toBe('ignored');
    expect(fakeDb.auth.refreshSession).not.toHaveBeenCalled();
  });

  it('keeps the user signed in when the session can be refreshed', async () => {
    fakeDb.auth.refreshSession.mockResolvedValueOnce({ data: { session: { access_token: 'new' } }, error: null });
    expect(await handleFailedRequest(expired)).toBe('refreshed');
    expect(fakeDb.auth.signOut).not.toHaveBeenCalled();
  });

  it('signs the user out when the session cannot be refreshed', async () => {
    expect(await handleFailedRequest(expired)).toBe('signed-out');
    expect(fakeDb.auth.signOut).toHaveBeenCalledOnce();
  });

  it('signs the user out when the refresh itself fails', async () => {
    fakeDb.auth.refreshSession.mockRejectedValueOnce(new Error('offline'));
    expect(await handleFailedRequest(expired)).toBe('signed-out');
  });

  it('refreshes once when many requests fail together', async () => {
    const results = await Promise.all([handleFailedRequest(expired), handleFailedRequest(expired), handleFailedRequest(expired)]);
    expect(results).toEqual(['signed-out', 'signed-out', 'signed-out']);
    expect(fakeDb.auth.refreshSession).toHaveBeenCalledOnce();
  });
});

describe('shared formatting', () => {
  let previousLanguage: string;
  beforeAll(async () => {
    previousLanguage = i18n.language;
    await i18n.changeLanguage('en');
  });
  afterAll(async () => {
    await i18n.changeLanguage(previousLanguage);
  });

  it('formats dates and times in the app language, with a dash for bad input', () => {
    expect(formatDate('2026-10-14T09:00:00Z', { day: 'numeric', month: 'short', year: 'numeric' })).toBe('14 Oct 2026');
    expect(formatTime('2026-10-14T05:30:00Z')).toMatch(/^08:30\sam$/);
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not a date')).toBe('—');
  });

  it('uses the local calendar date for date inputs around midnight', () => {
    expect(localDateInputValue(new Date(2026, 9, 17, 1, 0))).toBe('2026-10-17');
  });

  it('switches to Arabic formatting with the language', async () => {
    await i18n.changeLanguage('ar');
    expect(formatDate('2026-10-14T09:00:00Z', { month: 'long' })).toBe('أكتوبر');
    await i18n.changeLanguage('en');
  });

  it.each([
    ['Mona Ali', null, 'MA'],
    ['  mona   el sayed ', null, 'MS'],
    ['Mo', null, 'MO'],
    ['M', null, 'MM'],
    ['', 'sara@example.com', 'SA'],
    ['', null, '??'],
    // A bilingual "Arabic / English" name uses the first name only, so the letters never mix scripts.
    ['عمر حسن / Omar Hassan', null, 'عح'],
    ['Omar Hassan / عمر حسن', null, 'OH'],
    [' / Omar', null, 'OM'],
  ])('initials of "%s" (%s) are %s', (name, email, initials) => {
    expect(getUserInitials(name, email)).toBe(initials);
  });

  it('reads a message from any error shape', () => {
    expect(formatQueryError(new Error('boom'))).toBe('boom');
    expect(formatQueryError({ message: 'permission denied', code: '42501' })).toBe('permission denied');
    expect(formatQueryError({ code: '42501' })).toBe('{"code":"42501"}');
  });

  it('merges Tailwind classes, the later one winning, and drops empty ones', () => {
    expect(cn('px-2 text-sm', null, { hidden: false }, 'px-4')).toBe('text-sm px-4');
  });

  it.each([
    ['01012345678', '0 101 234 5678'],
    ['+201012345678', '+20 101 234 5678'],
    ['+44', '+44'],
    ['', ''],
  ])('shows the mobile %s as "%s"', (stored, shown) => {
    expect(formatMobileDisplayForInput(stored)).toBe(shown);
  });

  it('stores what was typed without the display spaces', () => {
    expect(stripMobileInputDisplay('+20 101 234 5678')).toBe('+201012345678');
  });

  it('hides the back button on tab pages only', () => {
    expect(isTabRoot('/admin/invoices')).toBe(true);
    expect(isTabRoot('/admin/invoices/123')).toBe(false);
  });
});

describe('offline retry queue', () => {
  afterEach(() => {
    for (const { id } of getOfflineQueueSnapshot()) removeQueued(id);
    vi.unstubAllGlobals();
  });

  it('keeps a failed save and tells listeners', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeOfflineQueue(listener);
    enqueueOfflineRetry('attendance.save', async () => {});
    expect(getPendingCount()).toBe(1);
    expect(getOfflineQueueSnapshot()[0].labelKey).toBe('attendance.save');
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('retries when back online, and keeps what still fails', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const works = vi.fn(async () => {});
    const fails = vi.fn(async () => {
      throw new Error('still offline');
    });
    enqueueOfflineRetry('a', works);
    enqueueOfflineRetry('b', fails);
    await flushOfflineQueue();
    expect(works).toHaveBeenCalledOnce();
    expect(getOfflineQueueSnapshot().map((q) => q.labelKey)).toEqual(['b']);
  });

  it('waits while the device is offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const retry = vi.fn(async () => {});
    enqueueOfflineRetry('a', retry);
    await flushOfflineQueue();
    expect(retry).not.toHaveBeenCalled();
    expect(getPendingCount()).toBe(1);
  });
});

describe('Arabic and English language files', () => {
  type Tree = { [key: string]: string | Tree };
  /** All forms of one text: a plain text has one, a plural text has one per ending (_one, _other, …). */
  type Text = { forms: string[]; plural: boolean };

  function texts(tree: Tree, prefix = '', out = new Map<string, Text>()): Map<string, Text> {
    for (const [key, value] of Object.entries(tree)) {
      const full = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'object') {
        texts(value, full, out);
        continue;
      }
      const base = full.replace(/_(zero|one|two|few|many|other)$/, '');
      const text = out.get(base) ?? { forms: [], plural: false };
      out.set(base, { forms: [...text.forms, value], plural: text.plural || base !== full });
    }
    return out;
  }

  /** The {{placeholders}} used across all forms of a text, ignoring `count` in plurals: an Arabic
   *  singular or dual may say the number in words ("يوم واحد"). */
  function placeholders({ forms, plural }: Text): string {
    const names = forms.flatMap((form) => [...form.matchAll(/\{\{\s*([\w.]+)/g)].map((m) => m[1]));
    return [...new Set(names)].filter((name) => !(plural && name === 'count')).sort().join();
  }

  const enTexts = texts(en as unknown as Tree);
  const arTexts = texts(ar as unknown as Tree);

  it('have the same keys', () => {
    expect([...enTexts.keys()].filter((key) => !arTexts.has(key))).toEqual([]);
    expect([...arTexts.keys()].filter((key) => !enTexts.has(key))).toEqual([]);
  });

  it('use the same placeholders in both languages', () => {
    const mismatched = [...enTexts]
      .filter(([key, text]) => arTexts.has(key) && placeholders(text) !== placeholders(arTexts.get(key)!))
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  it('have no empty texts', () => {
    const empty = [...enTexts, ...arTexts].filter(([, text]) => text.forms.some((form) => !form.trim())).map(([key]) => key);
    expect(empty).toEqual([]);
  });
});
