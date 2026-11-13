import { describe, expect, it } from 'vitest';

import { filterTeacherEvents, rosterSummary, teacherEventOrder, teacherEventsOverview, whenOf } from './teacherEvents';
import type { RosterChild } from './teacherEventsApi';

// Local times, so the day of each event is the same wherever the tests run.
const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0).toISOString();
const now = new Date(2026, 10, 20, 10, 0); // Fri 20 Nov, 10:00

const event = (id: string, starts: string, extra: Partial<{ ends_at: string | null; category: string; going: number }> = {}) => ({
  id,
  starts_at: starts,
  ends_at: null as string | null,
  category: 'trip',
  going: 0,
  ...extra,
});

describe('when an event is, for the teacher', () => {
  it('today: it starts today (earlier or later), or is still going on', () => {
    expect(whenOf(event('a', at(20, 8)), now)).toBe('today');
    expect(whenOf(event('b', at(20, 16)), now)).toBe('today');
    expect(whenOf(event('c', at(19, 9), { ends_at: at(21, 12) }), now)).toBe('today');
  });

  it('still to come, or done', () => {
    expect(whenOf(event('d', at(21, 9)), now)).toBe('upcoming');
    expect(whenOf(event('e', at(19, 9), { ends_at: at(19, 12) }), now)).toBe('past');
  });
});

describe('the teacher\'s list', () => {
  const events = [
    event('past-old', at(2, 9)),
    event('next-week', at(27, 9), { category: 'activity' }),
    event('today', at(20, 15), { going: 4 }),
    event('past-new', at(18, 9)),
    event('tomorrow', at(21, 9), { going: 2 }),
  ];

  it('today first, then the soonest to come, then the latest done', () => {
    expect(teacherEventOrder(events, now).map((e) => e.id)).toEqual(['today', 'tomorrow', 'next-week', 'past-new', 'past-old']);
  });

  it('filters by tab, kind and picked day', () => {
    const ids = (tab: 'all' | 'today' | 'upcoming' | 'past', category = 'all', dayKey: string | null = null) =>
      filterTeacherEvents(events, { tab, category, dayKey }, now).map((e) => e.id);
    expect(ids('upcoming')).toEqual(['tomorrow', 'next-week']);
    expect(ids('past')).toEqual(['past-new', 'past-old']);
    expect(ids('all', 'activity')).toEqual(['next-week']);
    expect(ids('all', 'all', '2026-11-21')).toEqual(['tomorrow']);
  });

  it('counts each tab, and the children going today', () => {
    expect(teacherEventsOverview(events, now)).toEqual({ counts: { all: 5, today: 1, upcoming: 2, past: 2 }, goingToday: 4 });
  });
});

describe('an event\'s roster', () => {
  const child = (name: string, status: RosterChild['status'], checkedIn = false): RosterChild => ({
    child_id: name,
    name_ar: name,
    name_en: name,
    avatar_url: null,
    class_name_ar: null,
    class_name_en: null,
    status,
    responded_at: null,
    checked_in_at: checkedIn ? at(20, 9) : null,
  });

  it('groups the children by answer, going first, and counts the check-ins', () => {
    const summary = rosterSummary([child('Nour', 'pending'), child('Laila', 'granted', true), child('Omar', 'granted'), child('Ali', 'denied')]);
    expect(summary.groups.map((g) => [g.status, g.children.map((c) => c.name_en)])).toEqual([
      ['granted', ['Laila', 'Omar']],
      ['pending', ['Nour']],
      ['denied', ['Ali']],
    ]);
    expect([summary.asked, summary.going, summary.checkedIn]).toEqual([4, 2, 1]);
  });

  it('leaves out the empty groups', () => {
    expect(rosterSummary([child('Laila', 'granted')]).groups.map((g) => g.status)).toEqual(['granted']);
    expect(rosterSummary([]).groups).toEqual([]);
  });
});
