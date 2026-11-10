import { describe, expect, it } from 'vitest';

import { courseSessionErrorKey, toCourseSessions } from './courseSessionsApi';

describe('reading the sessions from the server', () => {
  it('reads the window, the course time and each session, cancelled or not', () => {
    const data = toCourseSessions({
      today: '2026-11-10',
      change_from: '2026-11-03',
      change_to: '2027-02-08',
      time_start: '14:30',
      time_end: null,
      sessions: [
        { date: '2026-11-09', cancelled: true, reason: 'The teacher is ill', cancelled_at: '2026-11-09T10:00:00Z', cancelled_by: { ar: 'منى', en: 'Mona' } },
        { date: '2026-11-11', cancelled: false, reason: null, cancelled_at: null, cancelled_by: null },
        'not a session',
      ],
    });
    expect([data.today, data.changeFrom, data.changeTo, data.timeStart, data.timeEnd]).toEqual(['2026-11-10', '2026-11-03', '2027-02-08', '14:30', null]);
    expect(data.sessions).toEqual([
      { date: '2026-11-09', cancelled: true, reason: 'The teacher is ill', cancelledAt: '2026-11-09T10:00:00Z', cancelledBy: { ar: 'منى', en: 'Mona' } },
      { date: '2026-11-11', cancelled: false, reason: null, cancelledAt: null, cancelledBy: null },
    ]);
    expect(toCourseSessions({}).sessions).toEqual([]);
  });

  it('turns a refusal into its message', () => {
    expect(courseSessionErrorKey({ message: 'course_session_reason_too_long' })).toBe('courseSessions.errors.course_session_reason_too_long');
    expect(courseSessionErrorKey(new Error('course_forbidden'))).toBe('courseSessions.errors.course_forbidden');
    expect(courseSessionErrorKey(new Error('Failed to fetch'))).toBe('courseSessions.errors.network');
    expect(courseSessionErrorKey(new Error('boom'))).toBe('courseSessions.errors.failed');
  });
});
