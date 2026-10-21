// A child's admission journey: which steps show, in what order, and the waits between them.
import { describe, expect, it } from 'vitest';

import { admissionSteps, minutesBetween, type AdmissionTimeline } from './admissionTimeline';

const fromApplication: AdmissionTimeline = {
  childId: 'c1',
  applicationId: 'a1',
  applicationStartedAt: '2026-10-20T20:40:00Z',
  submittedAt: '2026-10-20T21:14:00Z',
  paymentConfirmedAt: '2026-10-21T05:50:00Z',
  approvedAt: '2026-10-21T05:52:35Z',
  approvedBy: { ar: 'المديرة', en: 'Head Admin' },
  enrollmentDate: '2026-10-21',
  joinedAt: '2026-10-21T05:52:35Z',
  firstCheckIn: null,
};

describe('admission journey', () => {
  it('shows every step of an application in order, the first day still to come', () => {
    expect(admissionSteps(fromApplication)).toEqual([
      { key: 'started', at: '2026-10-20T20:40:00Z', day: null },
      { key: 'submitted', at: '2026-10-20T21:14:00Z', day: null },
      { key: 'paid', at: '2026-10-21T05:50:00Z', day: null },
      { key: 'approved', at: '2026-10-21T05:52:35Z', day: null },
      { key: 'joined', at: '2026-10-21T05:52:35Z', day: null },
      { key: 'firstDay', at: null, day: null },
    ]);
  });

  it('a child added by the nursery has only joining and the first day; a hand-set date has no time', () => {
    const direct: AdmissionTimeline = {
      ...fromApplication,
      applicationId: null,
      applicationStartedAt: null,
      submittedAt: null,
      paymentConfirmedAt: null,
      approvedAt: null,
      joinedAt: null,
      enrollmentDate: '2026-09-01',
      firstCheckIn: '2026-09-02T06:10:00Z',
    };
    expect(admissionSteps(direct)).toEqual([
      { key: 'joined', at: null, day: '2026-09-01' },
      { key: 'firstDay', at: '2026-09-02T06:10:00Z', day: null },
    ]);
  });

  it('measures the wait between two steps', () => {
    expect(minutesBetween(fromApplication.submittedAt, fromApplication.approvedAt)).toBe(8 * 60 + 39);
    expect(minutesBetween(fromApplication.approvedAt, null)).toBeNull();
    expect(minutesBetween(fromApplication.approvedAt, fromApplication.submittedAt)).toBeNull();
  });
});
