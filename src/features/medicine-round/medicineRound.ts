/*
 * Today's medicine round as plain data and rules (no React, no network): where each dose stands
 * against the clock, the order a carer works through them, and the checks on recording one. The
 * database (record_medication_dose, run_medication_reminders) uses the same windows: due from 10
 * minutes before its time, overdue 30 minutes after.
 */

export const SKIP_REASONS = ['absent', 'refused', 'parent_gave', 'not_needed', 'other'] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];
export const NOTE_MAX = 200;
/** A dose is due from this many minutes before its time… */
export const DUE_BEFORE_MINUTES = 10;
/** …and overdue this many minutes after it. */
export const OVERDUE_AFTER_MINUTES = 30;

export type RoundDose = {
  id: string;
  scheduledTime: string | null;
  status: 'given' | 'skipped';
  skipReason: SkipReason | null;
  note: string | null;
  recordedAt: string;
  byAr: string;
  byEn: string;
};

export type RoundMedicine = {
  medicationId: string;
  childId: string;
  nameAr: string;
  nameEn: string;
  classAr: string | null;
  classEn: string | null;
  here: boolean;
  medicine: string;
  dosage: string | null;
  method: string;
  instructions: string | null;
  storage: string | null;
  doseTimes: string[];
  doses: RoundDose[];
};

export type Round = { today: string; now: string; /** The nursery's time zone, for the times doses were recorded. */ tz: string; scope: 'mine' | 'nursery'; medicines: RoundMedicine[] };

export type SlotState = 'overdue' | 'due' | 'upcoming' | 'when_needed' | 'not_here' | 'given' | 'skipped';
export type RoundSlot = { key: string; medicine: RoundMedicine; time: string | null; dose: RoundDose | null; state: SlotState };

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Where a timed dose stands at `now` (HH:MM, the nursery's clock). */
export function slotState(time: string, now: string, dose: RoundDose | null, here: boolean): SlotState {
  if (dose) return dose.status;
  if (!here) return 'not_here';
  const late = minutes(now) - minutes(time);
  if (late >= OVERDUE_AFTER_MINUTES) return 'overdue';
  if (late >= -DUE_BEFORE_MINUTES) return 'due';
  return 'upcoming';
}

const RANK: Record<SlotState, number> = { overdue: 0, due: 1, upcoming: 2, when_needed: 3, not_here: 4, given: 5, skipped: 5 };

/**
 * Every dose of the day as one list in working order: overdue, due now, later today, when-needed
 * medicines, children not here, then what is done; by time within each.
 */
export function roundSlots(round: Round): RoundSlot[] {
  const slots: RoundSlot[] = [];
  for (const m of round.medicines) {
    for (const time of m.doseTimes) {
      const dose = m.doses.find((d) => d.scheduledTime === time) ?? null;
      slots.push({ key: `${m.medicationId}-${time}`, medicine: m, time, dose, state: slotState(time, round.now, dose, m.here) });
    }
    if (!m.doseTimes.length) {
      slots.push({ key: `${m.medicationId}-needed`, medicine: m, time: null, dose: null, state: m.here ? 'when_needed' : 'not_here' });
      for (const dose of m.doses.filter((d) => !d.scheduledTime)) {
        slots.push({ key: dose.id, medicine: m, time: null, dose, state: dose.status });
      }
    }
  }
  return slots.sort((a, b) => RANK[a.state] - RANK[b.state] || (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.medicine.nameEn.localeCompare(b.medicine.nameEn));
}

export type RoundCounts = { overdue: number; due: number; upcoming: number; done: number };
export function roundCounts(slots: RoundSlot[]): RoundCounts {
  return {
    overdue: slots.filter((s) => s.state === 'overdue').length,
    due: slots.filter((s) => s.state === 'due').length,
    upcoming: slots.filter((s) => s.state === 'upcoming').length,
    done: slots.filter((s) => s.state === 'given' || s.state === 'skipped').length,
  };
}

/** The problem with recording a dose as not given, or null. */
export function skipIssue(reason: SkipReason | '', note: string): 'reason_required' | 'note_required' | 'note_too_long' | null {
  if (!reason) return 'reason_required';
  if (reason === 'other' && !note.trim()) return 'note_required';
  if (note.trim().length > NOTE_MAX) return 'note_too_long';
  return null;
}

// -----------------------------------------------------------------------------------------------
type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const list = (v: unknown): Json[] => (Array.isArray(v) ? v.filter((x): x is Json => Boolean(x) && typeof x === 'object') : []);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const textOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
const hhmm = (v: unknown) => (typeof v === 'string' && /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : null);
const isReason = (v: unknown): v is SkipReason => (SKIP_REASONS as readonly unknown[]).includes(v);

/** get_medication_round's answer, checked. */
export function toRound(raw: unknown): Round {
  const r = obj(raw);
  return {
    today: text(r.today).slice(0, 10),
    now: hhmm(r.now) ?? '00:00',
    tz: text(r.tz) || 'Africa/Cairo',
    scope: r.scope === 'nursery' ? 'nursery' : 'mine',
    medicines: list(r.medicines).map((m) => ({
      medicationId: text(m.medication_id),
      childId: text(m.child_id),
      nameAr: text(m.name_ar),
      nameEn: text(m.name_en),
      classAr: textOrNull(m.class_ar),
      classEn: textOrNull(m.class_en),
      here: m.here === true,
      medicine: text(m.medicine),
      dosage: textOrNull(m.dosage),
      method: text(m.method) || 'oral',
      instructions: textOrNull(m.instructions),
      storage: textOrNull(m.storage),
      doseTimes: (Array.isArray(m.dose_times) ? m.dose_times : []).map(hhmm).filter((t): t is string => Boolean(t)).sort(),
      doses: list(m.doses).map((d) => ({
        id: text(d.id),
        scheduledTime: hhmm(d.scheduled_time),
        status: d.status === 'skipped' ? 'skipped' : 'given',
        skipReason: isReason(d.skip_reason) ? d.skip_reason : null,
        note: textOrNull(d.note),
        recordedAt: text(d.recorded_at),
        byAr: text(d.by_ar),
        byEn: text(d.by_en),
      })),
    })),
  };
}
