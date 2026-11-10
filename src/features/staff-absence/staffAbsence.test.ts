import { describe, expect, it } from 'vitest';

import ar from '@/locales/ar.json';
import en from '@/locales/en.json';

import {
  ABSENCE_REASONS,
  absenceIssues,
  absenceState,
  coverStatus,
  needsTeam,
  daysBetween,
  overlapsExisting,
  sortAbsences,
  sortClassCover,
  toMyAbsences,
  toStaffAbsences,
  type ClassCover,
} from './staffAbsence';
import { absenceErrorKey } from './staffAbsenceApi';

const today = '2026-11-09';
const draft = { userId: '', startsOn: today, endsOn: today, reason: 'sick' as const, note: '' };

describe('absences', () => {
  it('know where they stand and how long they are', () => {
    expect(absenceState({ startsOn: '2026-11-08', endsOn: '2026-11-10', cancelled: false }, today)).toBe('today');
    expect(absenceState({ startsOn: '2026-11-10', endsOn: '2026-11-10', cancelled: false }, today)).toBe('upcoming');
    expect(absenceState({ startsOn: '2026-11-01', endsOn: '2026-11-08', cancelled: false }, today)).toBe('past');
    expect(absenceState({ startsOn: '2026-11-09', endsOn: '2026-11-09', cancelled: true }, today)).toBe('cancelled');
    expect(daysBetween('2026-11-09', '2026-11-11')).toBe(3);
    expect(daysBetween('2026-11-09', '2026-11-09')).toBe(1);
  });

  it('list the current and coming ones first, soonest first, then the past, latest first', () => {
    const items = [
      { id: 'past-old', startsOn: '2026-10-01', endsOn: '2026-10-02', cancelled: false },
      { id: 'later', startsOn: '2026-12-01', endsOn: '2026-12-02', cancelled: false },
      { id: 'cancelled', startsOn: '2026-11-20', endsOn: '2026-11-20', cancelled: true },
      { id: 'now', startsOn: '2026-11-09', endsOn: '2026-11-09', cancelled: false },
      { id: 'soon', startsOn: '2026-11-12', endsOn: '2026-11-12', cancelled: false },
      { id: 'past-new', startsOn: '2026-11-01', endsOn: '2026-11-02', cancelled: false },
    ];
    expect(sortAbsences(items, today).map((a) => a.id)).toEqual(['now', 'soon', 'later', 'past-new', 'past-old', 'cancelled']);
  });

  it('are checked as the database checks them', () => {
    expect(absenceIssues(draft, today, false)).toEqual({});
    expect(absenceIssues({ ...draft, startsOn: '2026-11-08' }, today, false)).toEqual({ startsOn: 'in_past' });
    expect(absenceIssues({ ...draft, startsOn: '2026-11-08' }, today, true)).toEqual({ userId: 'person_required' });
    expect(absenceIssues({ ...draft, userId: 'u', startsOn: '2026-10-01' }, today, true)).toEqual({ startsOn: 'too_far_back' });
    expect(absenceIssues({ ...draft, endsOn: '2026-11-08' }, today, false)).toEqual({ endsOn: 'before_start' });
    expect(absenceIssues({ ...draft, endsOn: '2027-01-09' }, today, false)).toEqual({ endsOn: 'too_long' });
    expect(absenceIssues({ ...draft, reason: '', note: 'x'.repeat(301) }, today, false)).toEqual({ reason: 'reason_required', note: 'note_too_long' });
  });

  it('cannot overlap one already reported for the same person', () => {
    const existing = [
      { userId: 'a', startsOn: '2026-11-10', endsOn: '2026-11-12', cancelled: false },
      { userId: 'a', startsOn: '2026-11-20', endsOn: '2026-11-20', cancelled: true },
    ];
    expect(overlapsExisting({ userId: 'a', startsOn: '2026-11-12', endsOn: '2026-11-13' }, existing)).toBe(true);
    expect(overlapsExisting({ userId: 'b', startsOn: '2026-11-12', endsOn: '2026-11-13' }, existing)).toBe(false);
    expect(overlapsExisting({ userId: 'a', startsOn: '2026-11-20', endsOn: '2026-11-20' }, existing)).toBe(false);
    // The caller's own list has no person on it.
    expect(overlapsExisting({ userId: '', startsOn: '2026-11-11', endsOn: '2026-11-11' }, [{ ...existing[0], userId: null }])).toBe(true);
  });
});

describe('class cover', () => {
  const cls = (patch: Partial<ClassCover>): ClassCover => ({
    classId: 'c', nameAr: '', nameEn: 'Class', children: 10, lead: { id: 'l', nameAr: '', nameEn: 'Lead', away: false }, backup: null, onDuty: 1, coveredByBackup: false, ...patch,
  });

  it('tells how each class stands and puts the ones needing a teacher first', () => {
    expect(coverStatus(cls({}))).toBe('normal');
    expect(coverStatus(cls({ coveredByBackup: true }))).toBe('covered');
    expect(coverStatus(cls({ onDuty: 0 }))).toBe('uncovered');
    // The lead away, no backup, an assistant in: not "lead in".
    expect(coverStatus(cls({ lead: { id: 'l', nameAr: '', nameEn: 'Lead', away: true }, backup: null, onDuty: 1 }))).toBe('lead_away');
    expect(needsTeam(cls({ lead: { id: 'l', nameAr: '', nameEn: 'Lead', away: true }, backup: null, onDuty: 1 }))).toBe(true);
    expect(needsTeam(cls({}))).toBe(false);
    expect(coverStatus(cls({ onDuty: 0, children: 0, lead: null }))).toBe('no_lead');
    const sorted = sortClassCover([
      cls({ classId: 'a', nameEn: 'A' }),
      cls({ classId: 'b', nameEn: 'B', coveredByBackup: true }),
      cls({ classId: 'c', nameEn: 'C', onDuty: 0 }),
    ]);
    expect(sorted.map((c) => c.classId)).toEqual(['c', 'b', 'a']);
  });
});

describe('reading the database', () => {
  it('maps the answers defensively', () => {
    const mine = toMyAbsences({ today: '2026-11-09', absences: [{ id: 'x', starts_on: '2026-11-09', ends_on: '2026-11-10', reason: 'odd', by_self: true }], covering: [{ class_id: 'k', name_en: 'Bees', lead_en: 'Sara' }] });
    expect(mine.absences[0]).toMatchObject({ reason: 'other', userId: null, bySelf: true, note: null });
    expect(mine.covering[0]).toMatchObject({ classId: 'k', leadEn: 'Sara' });
    const all = toStaffAbsences({ classes: [{ class_id: 'k', children: '4', lead: { id: 'l', away: true }, backup: null, on_duty: 1, covered_by_backup: true }] });
    expect(all.classes[0]).toMatchObject({ children: 4, lead: { away: true }, backup: null, coveredByBackup: true });
    expect(absenceErrorKey({ message: 'absence_overlaps' })).toBe('staffAbsence.errors.overlaps');
    expect(absenceErrorKey({ message: 'boom' })).toBe('staffAbsence.errors.failed');
  });
});

describe('texts', () => {
  it('exist in both languages', () => {
    const lookup = (dict: unknown, key: string) =>
      key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
    const keys = [
      ...ABSENCE_REASONS.map((r) => `staffAbsence.reasons.${r}`),
      ...['today', 'upcoming', 'past', 'cancelled'].map((s) => `staffAbsence.states.${s}`),
      ...['uncovered', 'lead_away', 'covered', 'no_lead', 'normal'].map((s) => `staffAbsence.board.status.${s}`),
      ...['person_required', 'date_required', 'in_past', 'too_far_back', 'too_far_ahead', 'before_start', 'too_long', 'overlaps', 'reason_required', 'note_too_long'].map((k) => `staffAbsence.issues.${k}`),
      ...['class_cover_today', 'class_cover_cancelled', 'class_uncovered', 'staff_absence_reported', 'staff_absence_recorded'].flatMap((k) => [`notificationTemplates.${k}.title`, `notificationTemplates.${k}.body`]),
    ];
    for (const key of keys) {
      expect(typeof lookup(en, key), `en ${key}`).toBe('string');
      expect(typeof lookup(ar, key), `ar ${key}`).toBe('string');
    }
  });
});
