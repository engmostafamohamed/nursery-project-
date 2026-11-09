import { describe, expect, it } from 'vitest';

import ar from '@/locales/ar.json';
import en from '@/locales/en.json';

import { roundCounts, roundSlots, skipIssue, slotState, SKIP_REASONS, toRound, type Round, type RoundMedicine } from './medicineRound';
import { roundErrorKey } from './medicineRoundApi';

const med = (patch: Partial<RoundMedicine>): RoundMedicine => ({
  medicationId: 'm', childId: 'c', nameAr: '', nameEn: 'Laila', classAr: null, classEn: 'Bees', here: true, medicine: 'Ventolin', dosage: '2 puffs',
  method: 'inhaler', instructions: null, storage: null, doseTimes: [], doses: [], ...patch,
});

describe('a dose against the clock', () => {
  it('is due from 10 minutes before its time and overdue 30 minutes after', () => {
    expect(slotState('12:00', '11:49', null, true)).toBe('upcoming');
    expect(slotState('12:00', '11:50', null, true)).toBe('due');
    expect(slotState('12:00', '12:29', null, true)).toBe('due');
    expect(slotState('12:00', '12:30', null, true)).toBe('overdue');
    expect(slotState('12:00', '12:30', null, false)).toBe('not_here');
    expect(slotState('12:00', '12:30', { id: 'd', scheduledTime: '12:00', status: 'given', skipReason: null, note: null, recordedAt: '', byAr: '', byEn: '' }, true)).toBe('given');
  });
});

describe('the round', () => {
  const round: Round = {
    today: '2026-11-09', now: '12:40', tz: 'Africa/Cairo', scope: 'mine',
    medicines: [
      med({ medicationId: 'v', doseTimes: ['09:00', '12:00', '12:45', '16:00'],
        doses: [{ id: 'd1', scheduledTime: '09:00', status: 'given', skipReason: null, note: null, recordedAt: '', byAr: '', byEn: 'Sara' }] }),
      med({ medicationId: 'p', nameEn: 'Adam', here: false, medicine: 'Panadol', doseTimes: ['12:00'] }),
      med({ medicationId: 'c', medicine: 'Cream', doseTimes: [],
        doses: [{ id: 'd2', scheduledTime: null, status: 'given', skipReason: null, note: null, recordedAt: '', byAr: '', byEn: 'Sara' }] }),
    ],
  };

  it('lists every dose in working order', () => {
    expect(roundSlots(round).map((s) => `${s.medicine.medicine}@${s.time ?? '-'}:${s.state}`)).toEqual([
      'Ventolin@12:00:overdue',
      'Ventolin@12:45:due',
      'Ventolin@16:00:upcoming',
      'Cream@-:when_needed',
      'Panadol@12:00:not_here',
      'Ventolin@09:00:given',
      'Cream@-:given',
    ]);
    expect(roundCounts(roundSlots(round))).toEqual({ overdue: 1, due: 1, upcoming: 1, done: 2 });
  });

  it('asks why a dose was not given', () => {
    expect(skipIssue('', '')).toBe('reason_required');
    expect(skipIssue('other', ' ')).toBe('note_required');
    expect(skipIssue('refused', 'x'.repeat(201))).toBe('note_too_long');
    expect(skipIssue('absent', '')).toBeNull();
  });

  it('reads get_medication_round defensively', () => {
    const r = toRound({ today: '2026-11-09', now: '12:40:11', scope: 'nursery',
      medicines: [{ medication_id: 'm', here: true, dose_times: ['16:00:00', '09:00:00', 'junk'], doses: [{ id: 'd', status: 'skipped', skip_reason: 'nope', scheduled_time: '09:00:00' }] }] });
    expect(r).toMatchObject({ now: '12:40', scope: 'nursery' });
    expect(r.medicines[0].doseTimes).toEqual(['09:00', '16:00']);
    expect(r.medicines[0].doses[0]).toMatchObject({ status: 'skipped', skipReason: null, scheduledTime: '09:00' });
    expect(roundErrorKey({ message: 'medication_no_consent' })).toBe('medicineRound.errors.no_consent');
    expect(roundErrorKey({ message: '??' })).toBe('medicineRound.errors.failed');
  });
});

describe('texts', () => {
  it('exist in both languages', () => {
    const lookup = (dict: unknown, key: string) =>
      key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
    const keys = [
      ...SKIP_REASONS.map((r) => `medicineRound.reasons.${r}`),
      ...['overdue', 'due', 'upcoming', 'when_needed', 'not_here', 'given', 'skipped'].map((s) => `medicineRound.states.${s}`),
      ...['todo', 'done', 'all', 'none_mine', 'none_nursery'].map((s) => `medicineRound.empty.${s}`),
      ...['forbidden', 'invalid', 'no_consent', 'not_active', 'child_not_here', 'already_recorded', 'undo_closed', 'network', 'failed'].map((k) => `medicineRound.errors.${k}`),
      ...['medication_due', 'medication_overdue', 'medication_given', 'medication_skipped', 'medication_dose_undone', 'class_cover_parents']
        .flatMap((k) => [`notificationTemplates.${k}.title`, `notificationTemplates.${k}.body`]),
      ...['time_invalid', 'time_repeated', 'too_many_times', 'ends_before_start'].map((k) => `health.profile.issues.${k}`),
      'settings.fields.notify_parents_of_cover.label', 'teacher.nav.medicines', 'admin.nav.medicinesToday',
    ];
    for (const key of keys) {
      expect(typeof lookup(en, key), `en ${key}`).toBe('string');
      expect(typeof lookup(ar, key), `ar ${key}`).toBe('string');
    }
  });
});
