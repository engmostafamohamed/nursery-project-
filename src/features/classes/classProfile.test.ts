import { describe, expect, it } from 'vitest';

import { coverStatus } from '@/features/staff-absence/staffAbsence';

import { capacityFill } from './classCapacity';
import {
  classCover,
  dutyState,
  filterChildren,
  filterCounts,
  reportStageOf,
  tabFrom,
  toClassProfile,
  todaySummary,
  type ClassChild,
  type TeamMember,
} from './classProfile';

const child = (over: Partial<ClassChild> = {}): ClassChild => ({
  id: 'c1',
  nameAr: 'سارة',
  nameEn: 'Sara',
  code: 'CH-1',
  avatarUrl: null,
  dob: '2023-05-10',
  gender: 'female',
  enrolledOn: '2026-09-01',
  attendance: 'absent',
  checkIn: null,
  checkOut: null,
  absenceReason: null,
  report: 'none',
  allergies: [],
  conditions: 0,
  medications: 0,
  ...over,
});

const member = (over: Partial<TeamMember> = {}): TeamMember => ({
  id: 'u1',
  nameAr: 'منى',
  nameEn: 'Mona',
  email: null,
  phone: null,
  role: 'lead',
  since: '2026-09-01',
  active: true,
  onDuty: true,
  covering: false,
  absence: null,
  clockIn: null,
  clockOut: null,
  lateMinutes: null,
  clockSource: null,
  ...over,
});

describe('reading get_class_profile', () => {
  it('turns a missing or broken answer into an empty class instead of failing', () => {
    const p = toClassProfile(null);
    expect(p.team).toEqual([]);
    expect(p.children).toEqual([]);
    expect(p.messages).toEqual([]);
    expect(p.media).toEqual({ pending: 0, approvedLast30Days: 0 });
    expect(p.info.capacity).toBeNull();
    expect(p.schoolDay).toBe(true);
    expect(p.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('reads every part, keeping only known values', () => {
    const p = toClassProfile({
      today: '2026-11-09',
      school_day: false,
      class: { id: 'k1', nursery_id: 'n1', name_ar: 'الفراشات', name_en: 'Butterflies', grade_level: 'Toddlers', room_number: 'A2', capacity: 25, created_at: '2026-04-28T23:16:32Z', timezone: 'Africa/Cairo' },
      team: [
        { id: 'u1', name_ar: 'أ', name_en: 'A', role: 'lead', on_duty: false, covering: false, active: true, absence: { reason: 'sick', starts_on: '2026-11-09', ends_on: '2026-11-11' } },
        { id: 'u2', name_ar: 'ب', name_en: 'B', role: 'wizard', on_duty: true },
      ],
      children: [
        {
          id: 'c1', name_ar: 'سارة', name_en: 'Sara', dob: '2023-05-10', gender: 'robot', attendance: 'partial', report: 'published',
          check_in: '2026-11-09T06:05:00Z', absence_reason: null,
          allergies: [{ name: 'Peanut', severity: 'life_threatening' }, { name: '  ', severity: 'mild' }, { name: 'Dust', severity: 'unknown' }],
          conditions: '2', medications: -1,
        },
        { id: 'c2', attendance: 'teleported', report: 'archived', absence_reason: 'holiday' },
      ],
      messages: [{ id: 'm1', kind: 'family_message', status: 'scheduled', body_ar: 'مرحبا', body_en: 'Hi', sent_at: '2026-11-08T10:00:00Z' }],
      waitlist: [{ id: 'w1', inquiry_id: 'i1', position: 2, status: 'offered', child_name: 'Omar', child_dob: '2024-01-01' }],
      team_changes: [{ id: 't1', action: 'assigned', role: 'assistant', previous_role: null, at: '2026-11-01T09:00:00Z', name_en: 'B' }],
      media: { pending: 3, approved_30d: 12 },
      cameras: [{ id: 'cam', name_en: 'Room cam', active: false }],
    });

    expect(p.schoolDay).toBe(false);
    expect(p.info).toMatchObject({ nameEn: 'Butterflies', capacity: 25, roomNumber: 'A2', timezone: 'Africa/Cairo' });
    expect(p.team[0].absence).toEqual({ reason: 'sick', startsOn: '2026-11-09', endsOn: '2026-11-11' });
    expect(p.team[1].role).toBe('assistant');
    expect(p.team[1].active).toBe(true);

    expect(p.children[0]).toMatchObject({ gender: null, attendance: 'partial', report: 'published', conditions: 2, medications: 0 });
    expect(p.children[0].allergies).toEqual([
      { name: 'Peanut', severity: 'life_threatening' },
      { name: 'Dust', severity: 'mild' },
    ]);
    expect(p.children[1]).toMatchObject({ attendance: 'absent', report: 'none', absenceReason: 'other', nameEn: '' });

    expect(p.messages[0]).toMatchObject({ kind: 'family_message', status: 'scheduled' });
    expect(p.waitlist[0]).toMatchObject({ position: 2, status: 'offered', childDob: '2024-01-01', parentPhone: null });
    expect(p.teamChanges[0]).toMatchObject({ action: 'assigned', role: 'assistant', previousRole: null });
    expect(p.media).toEqual({ pending: 3, approvedLast30Days: 12 });
    expect(p.cameras[0]).toMatchObject({ active: false, location: null });
  });
});

describe('the children today', () => {
  const kids = [
    child({ id: 'here', attendance: 'partial', report: 'draft' }),
    child({ id: 'home', attendance: 'present', report: 'published' }),
    child({ id: 'home2', attendance: 'present', report: 'none', allergies: [{ name: 'Egg', severity: 'severe' }] }),
    child({ id: 'away', attendance: 'absent' }),
    child({ id: 'note', attendance: 'excused', absenceReason: 'sick', medications: 1 }),
    child({ id: 'later', attendance: 'not_enrolled', conditions: 1 }),
  ];

  it('counts who is here, who went home, who is absent, the reports still to send and the health needs', () => {
    expect(todaySummary(kids)).toEqual({
      children: 6,
      expected: 5,
      here: 1,
      wentHome: 2,
      notArrived: 0,
      absent: 1,
      excused: 1,
      reportsSent: 1,
      reportsDue: 2,
      health: 3,
      seriousAllergies: 1,
    });
  });

  it('a filter keeps the children its number counts', () => {
    const ids = (filter: Parameters<typeof filterChildren>[1]) => filterChildren(kids, filter, '').map((c) => c.id);
    expect(ids('here')).toEqual(['here']);
    expect(ids('went_home')).toEqual(['home', 'home2']);
    expect(ids('absent')).toEqual(['away', 'note']);
    expect(ids('reports_due')).toEqual(['here', 'home2']);
    expect(ids('health')).toEqual(['home2', 'note', 'later']);
    expect(filterCounts(kids)).toEqual({ all: 6, here: 1, went_home: 2, not_arrived: 0, absent: 2, reports_due: 2, health: 3 });
  });

  it('searches both names and the code, every word', () => {
    const list = [child({ id: 'a', nameEn: 'Sara Ali', nameAr: 'سارة علي', code: 'CH-7' }), child({ id: 'b', nameEn: 'Omar', nameAr: 'عمر', code: 'CH-8' })];
    expect(filterChildren(list, 'all', 'sara ali').map((c) => c.id)).toEqual(['a']);
    expect(filterChildren(list, 'all', 'عمر').map((c) => c.id)).toEqual(['b']);
    expect(filterChildren(list, 'all', 'ch-8').map((c) => c.id)).toEqual(['b']);
    expect(filterChildren(list, 'all', 'sara omar')).toEqual([]);
    expect(filterChildren(list, 'all', '   ')).toHaveLength(2);
  });

  it('a report is expected only from a child who came', () => {
    expect(reportStageOf({ attendance: 'partial', report: 'published' })).toBe('sent');
    expect(reportStageOf({ attendance: 'present', report: 'draft' })).toBe('in_progress');
    expect(reportStageOf({ attendance: 'present', report: 'none' })).toBe('not_started');
    expect(reportStageOf({ attendance: 'absent', report: 'none' })).toBe('not_expected');
  });
});

describe('the team today', () => {
  it('names each member’s state', () => {
    expect(dutyState(member())).toBe('on_duty');
    expect(dutyState(member({ role: 'substitute', onDuty: true, covering: true }))).toBe('covering');
    expect(dutyState(member({ onDuty: false, absence: { reason: 'sick', startsOn: '2026-11-09', endsOn: '2026-11-09' } }))).toBe('away');
    expect(dutyState(member({ role: 'substitute', onDuty: false }))).toBe('standby');
    expect(dutyState(member({ active: false }))).toBe('inactive');
    expect(dutyState(member({ role: 'nanny', onDuty: false }))).toBe('on_duty');
  });

  const profile = (team: TeamMember[], children = [child()]) =>
    ({ info: toClassProfile({ class: { id: 'k1', name_ar: 'ف', name_en: 'K' } }).info, team, children });

  it('reads the cover the way the absences screen does', () => {
    expect(coverStatus(classCover(profile([member(), member({ id: 'u2', role: 'assistant' })])))).toBe('normal');

    const away = { reason: 'sick' as const, startsOn: '2026-11-09', endsOn: '2026-11-10' };
    const covered = classCover(profile([member({ onDuty: false, absence: away }), member({ id: 'b', role: 'substitute', covering: true })]));
    expect(covered.lead?.away).toBe(true);
    expect(coverStatus(covered)).toBe('covered');

    expect(coverStatus(classCover(profile([member({ onDuty: false, absence: away })])))).toBe('uncovered');
    expect(coverStatus(classCover(profile([member({ id: 'a', role: 'assistant' })])))).toBe('no_lead');
    expect(coverStatus(classCover(profile([], [])))).toBe('no_lead');
  });
});

describe('the page', () => {
  it('opens the tab the address asks for, else the children', () => {
    expect(tabFrom('team')).toBe('team');
    expect(tabFrom('waitlist')).toBe('waitlist');
    expect(tabFrom('billing')).toBe('children');
    expect(tabFrom(null)).toBe('children');
  });

  it('shows how full a class is: green, amber from 90%, red over', () => {
    expect(capacityFill(10, 20)).toEqual({ pct: 50, over: 0, tone: 'success' });
    expect(capacityFill(18, 20)).toMatchObject({ over: 0, tone: 'warning' });
    expect(capacityFill(20, 20)).toMatchObject({ over: 0, tone: 'warning' });
    expect(capacityFill(23, 20)).toMatchObject({ over: 3, tone: 'error' });
    expect(capacityFill(5, null)).toEqual({ pct: null, over: 0, tone: 'primary' });
    expect(capacityFill(5, 0)).toEqual({ pct: null, over: 0, tone: 'primary' });
  });
});
