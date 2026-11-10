import { describe, expect, it } from 'vitest';

import { clockState, todaySummary, toClassProfile, type ClassChild, type TeamMember } from '@/features/classes/classProfile';
import ar from '@/locales/ar.json';
import en from '@/locales/en.json';

import { clockStage, hhmmIn, hoursParts, isLate, recordIssue, toMyStaffDay } from './staffClock';
import { staffClockErrorKey } from './staffClockApi';

describe('a member of staff’s day', () => {
  it('reads get_my_staff_day defensively', () => {
    const me = toMyStaffDay({ today: '2026-11-10', school_day: true, opens_at: '08:00:00', closes_at: '16:00:00', timezone: 'Africa/Cairo',
      day: { id: 'd', check_in_at: '2026-11-10T06:12:00Z', check_out_at: null, status: 'late', late_minutes: 12, work_hours: null, source: 'self' } });
    expect(me).toMatchObject({ opensAt: '08:00', closesAt: '16:00', day: { status: 'late', lateMinutes: 12, source: 'self', checkOutAt: null } });
    expect(toMyStaffDay({ today: '2026-11-10', day: null }).day).toBeNull();
    expect(clockStage(null)).toBe('not_in');
    expect(clockStage(me.day)).toBe('in');
    expect(clockStage({ checkInAt: 'a', checkOutAt: 'b' })).toBe('left');
  });

  it('counts late after 5 minutes and hours in minutes', () => {
    expect(isLate(5)).toBe(false);
    expect(isLate(6)).toBe(true);
    expect(isLate(null)).toBe(false);
    expect(hoursParts(7.67)).toEqual({ h: 7, m: 40 });
    expect(hoursParts(null)).toBeNull();
  });

  it('checks a day recorded by hand as the database does', () => {
    expect(recordIssue('', '', '', null)).toBe('in_required');
    expect(recordIssue('08:00', '07:59', '', null)).toBe('out_before_in');
    expect(recordIssue('08:00', '08:00', '', null)).toBe('out_before_in');
    expect(recordIssue('11:00', '', '', '10:30')).toBe('in_future');
    expect(recordIssue('08:00', '11:00', '', '10:30')).toBe('out_future');
    expect(recordIssue('08:00', '', 'x'.repeat(201), null)).toBe('note_too_long');
    expect(recordIssue('07:50', '15:30', 'Forgot her phone', null)).toBeNull();
  });

  it('reads a moment on the nursery’s clock', () => {
    expect(hhmmIn('2026-11-10T05:42:00Z', 'Africa/Cairo')).toBe('07:42');
    expect(hhmmIn(null, 'Africa/Cairo')).toBe('');
  });

  it('names a refused call', () => {
    expect(staffClockErrorKey({ message: 'staff_clock_already_in' })).toBe('staffClock.errors.already_in');
    expect(staffClockErrorKey({ message: 'Failed to fetch' })).toBe('staffClock.errors.network');
    expect(staffClockErrorKey({ message: '??' })).toBe('staffClock.errors.failed');
  });
});

describe('the class page’s day', () => {
  const member = (over: Partial<TeamMember>): TeamMember => ({
    id: 'u', nameAr: '', nameEn: 'Mona', email: null, phone: null, role: 'lead', since: '', active: true, onDuty: true, covering: false,
    absence: null, clockIn: null, clockOut: null, lateMinutes: null, clockSource: null, ...over,
  });

  it('knows where each of the team stands and sums them up', () => {
    const team = [
      member({ id: 'a', clockIn: 'x', lateMinutes: 12 }),
      member({ id: 'b', role: 'assistant', clockIn: 'x', clockOut: 'y' }),
      member({ id: 'c', role: 'nanny' }),
      member({ id: 'd', role: 'assistant', absence: { reason: 'sick', startsOn: '2026-11-10', endsOn: '2026-11-11' } }),
      member({ id: 'e', role: 'substitute', onDuty: false }),
    ];
    expect(team.map(clockState)).toEqual(['in', 'left', 'not_in', 'away', 'not_in']);
  });

  it('keeps a child who has not come yet apart from the absent ones while the nursery is open', () => {
    const p = toClassProfile({
      day_open: true,
      team: [{ id: 'n', role: 'nanny', clock_in: '2026-11-10T05:40:00Z', late_minutes: 0, clock_source: 'admin' }],
      children: [{ id: '1', attendance: 'expected' }, { id: '2', attendance: 'absent' }, { id: '3', attendance: 'partial' }, { id: '4', attendance: 'bogus' }],
    });
    expect(p.dayOpen).toBe(true);
    expect(p.team[0]).toMatchObject({ role: 'nanny', clockIn: '2026-11-10T05:40:00Z', clockSource: 'admin' });
    expect(p.children.map((c: ClassChild) => c.attendance)).toEqual(['expected', 'absent', 'partial', 'absent']);
    expect(todaySummary(p.children)).toMatchObject({ notArrived: 1, absent: 2, here: 1 });
  });
});

describe('texts', () => {
  it('exist in both languages', () => {
    const lookup = (dict: unknown, key: string) =>
      key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
    const keys = [
      'classTeam.roles.nanny', 'classTeam.tiles.withoutNanny', 'classTeam.filters.noNanny', 'classTeam.filters.nannies',
      'classTeam.card.noNannies', 'classTeam.card.addNanny', 'teacher.classesHub.nannyBadge',
      'classProfile.attendance.expected', 'classProfile.filters.not_arrived', 'classProfile.today.notArrived', 'classProfile.today.notArrivedHint',
      ...['inSince', 'notInYet', 'didNotClock', 'away', 'onTime', 'clockHint', 'byAdmin', 'record', 'correct']
        .map((k) => `classProfile.teamToday.${k}`),
      ...['titleNotIn', 'titleIn', 'titleLeft', 'opensAt', 'onTime', 'clockIn', 'clockOut', 'confirmOutTitle', 'recordedByAdmin', 'absentToday']
        .map((k) => `staffClock.${k}`),
      ...['forbidden', 'already_in', 'already_out', 'not_in', 'invalid', 'person', 'network', 'failed'].map((k) => `staffClock.errors.${k}`),
      ...['in_required', 'out_before_in', 'in_future', 'out_future', 'note_too_long'].map((k) => `staffClock.record.issues.${k}`),
    ];
    for (const key of keys) {
      expect(typeof lookup(en, key), `en ${key}`).toBe('string');
      expect(typeof lookup(ar, key), `ar ${key}`).toBe('string');
    }
  });
});
