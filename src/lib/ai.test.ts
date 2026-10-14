// Module 15 · AI help assistant — risky-action checks, the daily request limit and error messages.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/lib/i18n';

import { userMessageForAiAssistantFailure } from './aiAssistantFailureMessage';
import { AI_DAILY_REQUEST_LIMIT, canSendAiRequest, getAiQuotaState, recordAiRequest } from './aiRateLimit';
import { assessAiActionSafety, formatSafetyPreview } from './aiSafety';

const t = i18n.getFixedT('en');

describe('risky AI actions need confirmation', () => {
  it('always confirms deletes and child status changes', () => {
    expect(assessAiActionSafety('delete_media', {})).toMatchObject({ needsConfirmation: true, kind: 'delete' });
    expect(assessAiActionSafety('change_child_status', {})).toMatchObject({ needsConfirmation: true, kind: 'child_status' });
  });

  it('confirms a broadcast to more than 10 people, or to all parents', () => {
    expect(assessAiActionSafety('send_broadcast', { audience: 11 })).toMatchObject({ kind: 'broadcast', previewParams: { count: 11 } });
    expect(assessAiActionSafety('send_broadcast', { audience: 'all_parents' })).toMatchObject({ kind: 'broadcast', previewParams: { count: 10 } });
    expect(assessAiActionSafety('send_broadcast', { audience: 10 }).needsConfirmation).toBe(false);
  });

  it('confirms bulk changes to more than 5 items', () => {
    const six = { childIds: ['1', '2', '3', '4', '5', '6'] };
    expect(assessAiActionSafety('mark_present', six)).toMatchObject({ kind: 'bulk', previewParams: { count: 6, tool: 'mark_present' } });
    expect(assessAiActionSafety('any_tool', { mediaIds: ['1', '2', '3', '4', '5', '6'] }).kind).toBe('bulk');
    expect(assessAiActionSafety('mark_present', { childIds: ['1', '2', '3', '4', '5'] }).needsConfirmation).toBe(false);
  });

  it('lets read-only tools run straight away', () => {
    expect(assessAiActionSafety('get_attendance_summary', { date: '2026-10-14' })).toEqual({
      needsConfirmation: false,
      kind: 'none',
      previewKey: '',
    });
  });

  it('explains the risk in the confirmation', () => {
    const bulk = assessAiActionSafety('approve_media', { mediaIds: Array.from({ length: 8 }, String) });
    expect(formatSafetyPreview(t, bulk)).toBe('This affects 8 items (approve_media). Continue?');
    expect(formatSafetyPreview(t, assessAiActionSafety('read', {}))).toBe('');
  });
});

describe('daily AI request limit', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T09:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts each user with the full allowance', () => {
    expect(getAiQuotaState('u1')).toEqual({ used: 0, limit: AI_DAILY_REQUEST_LIMIT, remaining: AI_DAILY_REQUEST_LIMIT });
  });

  it('counts requests per user and stops at the limit', () => {
    for (let i = 0; i < AI_DAILY_REQUEST_LIMIT - 1; i += 1) recordAiRequest('u1');
    expect(canSendAiRequest('u1')).toBe(true);
    recordAiRequest('u1');
    expect(canSendAiRequest('u1')).toBe(false);
    expect(getAiQuotaState('u1').remaining).toBe(0);
    expect(canSendAiRequest('u2')).toBe(true);
  });

  it('resets the next day', () => {
    recordAiRequest('u1');
    vi.setSystemTime(new Date('2026-10-15T09:00:00Z'));
    expect(getAiQuotaState('u1').used).toBe(0);
  });

  it('refuses a signed-out user and survives broken storage', () => {
    expect(canSendAiRequest(undefined)).toBe(false);
    store.set('xo-ai-daily-quota-v1:u1', '{not json');
    expect(getAiQuotaState('u1').used).toBe(0);
  });
});

describe('AI assistant error messages', () => {
  it.each([
    [404, 'ai.errors.functionNotFound'],
    [401, 'ai.errors.sessionRejected'],
    [403, 'ai.errors.sessionRejected'],
    [503, 'ai.errors.aiNotConfigured'],
    [400, 'ai.errors.badRequest'],
    [429, 'ai.errors.rateLimited'],
    [502, 'ai.errors.providerError'],
  ])('HTTP %i shows %s', (status, key) => {
    expect(userMessageForAiAssistantFailure(t, undefined, status)).toBe(t(key));
  });

  it('shows the status for other client errors', () => {
    expect(userMessageForAiAssistantFailure(t, undefined, 418)).toBe(
      'The assistant returned an error (HTTP 418). Try again or use Resources (⌘/) for guides.',
    );
  });

  it.each([
    ['max_tool_rounds', 'ai.errors.maxToolRounds'],
    ['fetch_failed', 'ai.errors.network'],
    ['missing_vite_anon_key', 'ai.errors.misconfiguredClient'],
    ['missing_access_token', 'ai.errors.auth'],
    ['something else', 'ai.errors.tryAgainOrHelp'],
  ])('the "%s" error shows %s', (raw, key) => {
    expect(userMessageForAiAssistantFailure(t, raw)).toBe(t(key));
  });

  it('never shows the raw server text', () => {
    expect(userMessageForAiAssistantFailure(t, 'stack trace: secret at line 3')).not.toContain('secret');
  });
});
