import { describe, expect, it } from 'vitest';

import { answersByEvent, awaitingAnswers, type FamilyAnswerRow } from './familyAnswers';

const now = new Date('2026-11-13T12:00:00Z');
const row = (event: string, child: string, status: string, starts: string, deadline: string | null = null): FamilyAnswerRow => ({
  event_id: event,
  child_id: child,
  event_title_ar: event,
  event_title_en: event,
  event_category: 'trip',
  starts_at: starts,
  status,
  deadline,
});

describe('where each event stands for the family', () => {
  it('a child still to answer first, then a child going, else none going', () => {
    expect(
      answersByEvent([
        row('zoo', 'laila', 'granted', '2026-11-20T08:00:00Z'),
        row('zoo', 'nour', 'pending', '2026-11-20T08:00:00Z'),
        row('museum', 'laila', 'denied', '2026-11-21T08:00:00Z'),
        row('museum', 'nour', 'granted', '2026-11-21T08:00:00Z'),
        row('party', 'laila', 'denied', '2026-11-22T08:00:00Z'),
      ]),
    ).toEqual({ zoo: 'needsAnswer', museum: 'going', party: 'notGoing' });
  });
});

describe('what waits for the family\'s answer', () => {
  it('per event with its children, the soonest due first; never one started or past its deadline', () => {
    const list = awaitingAnswers(
      [
        row('zoo', 'laila', 'pending', '2026-11-20T08:00:00Z', '2026-11-18T08:00:00Z'),
        row('zoo', 'nour', 'pending', '2026-11-20T08:00:00Z', '2026-11-18T08:00:00Z'),
        row('dentist', 'laila', 'pending', '2026-11-15T08:00:00Z'),
        row('closed', 'laila', 'pending', '2026-11-25T08:00:00Z', '2026-11-12T08:00:00Z'),
        row('started', 'laila', 'pending', '2026-11-13T08:00:00Z'),
        row('answered', 'laila', 'granted', '2026-11-25T08:00:00Z'),
      ],
      now,
    );
    expect(list.map((a) => [a.eventId, a.childIds.join('+')])).toEqual([
      ['dentist', 'laila'],
      ['zoo', 'laila+nour'],
    ]);
  });
});
