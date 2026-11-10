import { describe, expect, it } from 'vitest';

import { canChange, listRange, reasonIssue, REASON_MAX, sessionTime, splitSessions, type CourseSession } from './courseSessions';

const session = (date: string, patch: Partial<CourseSession> = {}): CourseSession => ({
  date, cancelled: false, reason: null, cancelledAt: null, cancelledBy: null, ...patch,
});

describe('cancelling a session', () => {
  it('needs a reason the parents can read, of at most 300 characters', () => {
    expect(reasonIssue('   ')).toBe('required');
    expect(reasonIssue('x'.repeat(REASON_MAX + 1))).toBe('too_long');
    expect(reasonIssue(` ${'x'.repeat(REASON_MAX)} `)).toBeNull();
    expect(reasonIssue('The teacher is ill')).toBeNull();
  });

  it('is open from the server’s first to its last day, both included', () => {
    const window = { changeFrom: '2026-11-03', changeTo: '2027-02-08' };
    expect(canChange('2026-11-02', window)).toBe(false);
    expect(canChange('2026-11-03', window)).toBe(true);
    expect(canChange('2027-02-08', window)).toBe(true);
    expect(canChange('2027-02-09', window)).toBe(false);
  });
});

describe('the session list', () => {
  it('covers the past week and the next four', () => {
    expect(listRange('2026-11-10')).toEqual({ from: '2026-11-03', to: '2026-12-08' });
  });

  it('shows the coming sessions from today, then the past ones latest first', () => {
    const { upcoming, past } = splitSessions(
      [session('2026-11-12'), session('2026-11-05'), session('2026-11-10', { cancelled: true }), session('2026-11-08')],
      '2026-11-10',
    );
    expect(upcoming.map((s) => s.date)).toEqual(['2026-11-10', '2026-11-12']);
    expect(past.map((s) => s.date)).toEqual(['2026-11-08', '2026-11-05']);
  });

  it('writes the course’s time as typed, or the end that is known', () => {
    expect(sessionTime('14:30', '15:30')).toBe('14:30–15:30');
    expect(sessionTime('14:30:00', null)).toBe('14:30');
    expect(sessionTime(null, ' ')).toBe('');
  });
});
