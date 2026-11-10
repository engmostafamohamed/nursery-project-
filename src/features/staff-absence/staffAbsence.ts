/*
 * Staff absences and class cover as plain data and rules (no React, no network). The database
 * (report_staff_absence, class_duty_teachers) makes the same checks; these give the forms the same
 * answers first.
 */
import { addDays } from '@/lib/calendarDay';

export const ABSENCE_REASONS = ['sick', 'personal', 'vacation', 'training', 'other'] as const;
export type AbsenceReason = (typeof ABSENCE_REASONS)[number];
const isReason = (v: unknown): v is AbsenceReason => (ABSENCE_REASONS as readonly unknown[]).includes(v);

/** The longest absence one report covers (the database's limit). */
export const MAX_ABSENCE_DAYS = 61;
/** How far back an admin may record an absence. */
export const ADMIN_BACKDATE_DAYS = 30;
export const NOTE_MAX = 300;

export type Absence = {
  id: string;
  userId: string | null;
  nameAr: string;
  nameEn: string;
  startsOn: string;
  endsOn: string;
  reason: AbsenceReason;
  note: string | null;
  cancelled: boolean;
  bySelf: boolean;
  byAr: string;
  byEn: string;
};

export type AbsenceState = 'cancelled' | 'past' | 'today' | 'upcoming';

/** Where an absence stands on `today`. */
export function absenceState(a: Pick<Absence, 'startsOn' | 'endsOn' | 'cancelled'>, today: string): AbsenceState {
  if (a.cancelled) return 'cancelled';
  if (a.endsOn < today) return 'past';
  if (a.startsOn <= today) return 'today';
  return 'upcoming';
}

/** Calendar days from `from` to `to`, both included. */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export { addDays };

/** Current and coming absences first (soonest first), then the past (latest first). */
export function sortAbsences<T extends Pick<Absence, 'startsOn' | 'endsOn' | 'cancelled'>>(items: T[], today: string): T[] {
  const rank: Record<AbsenceState, number> = { today: 0, upcoming: 1, past: 2, cancelled: 3 };
  return [...items].sort((a, b) => {
    const ra = rank[absenceState(a, today)];
    const rb = rank[absenceState(b, today)];
    if (ra !== rb) return ra - rb;
    return ra <= 1 ? a.startsOn.localeCompare(b.startsOn) : b.startsOn.localeCompare(a.startsOn);
  });
}

export type AbsenceDraft = { userId: string; startsOn: string; endsOn: string; reason: AbsenceReason | ''; note: string };
export type AbsenceField = keyof AbsenceDraft;

/** The problems of an absence about to be reported, by field. */
export function absenceIssues(d: AbsenceDraft, today: string, asAdmin: boolean): Partial<Record<AbsenceField, string>> {
  const issues: Partial<Record<AbsenceField, string>> = {};
  if (asAdmin && !d.userId) issues.userId = 'person_required';
  const earliest = asAdmin ? addDays(today, -ADMIN_BACKDATE_DAYS) : today;
  if (!d.startsOn) issues.startsOn = 'date_required';
  else if (d.startsOn < earliest) issues.startsOn = asAdmin ? 'too_far_back' : 'in_past';
  else if (d.startsOn > addDays(today, 180)) issues.startsOn = 'too_far_ahead';
  if (!d.endsOn) issues.endsOn = 'date_required';
  else if (d.startsOn && d.endsOn < d.startsOn) issues.endsOn = 'before_start';
  else if (d.startsOn && daysBetween(d.startsOn, d.endsOn) > MAX_ABSENCE_DAYS) issues.endsOn = 'too_long';
  if (!d.reason) issues.reason = 'reason_required';
  if (d.note.trim().length > NOTE_MAX) issues.note = 'note_too_long';
  return issues;
}

/** Whether a new absence would overlap one already reported (not cancelled). */
export function overlapsExisting(d: Pick<AbsenceDraft, 'userId' | 'startsOn' | 'endsOn'>, existing: Pick<Absence, 'userId' | 'startsOn' | 'endsOn' | 'cancelled'>[]): boolean {
  if (!d.startsOn || !d.endsOn) return false;
  return existing.some((a) => !a.cancelled && (a.userId === null || a.userId === d.userId) && a.startsOn <= d.endsOn && a.endsOn >= d.startsOn);
}

// -----------------------------------------------------------------------------------------------
// Class cover

export type ClassPerson = { id: string; nameAr: string; nameEn: string; away: boolean };
export type ClassCover = {
  classId: string;
  nameAr: string;
  nameEn: string;
  children: number;
  lead: ClassPerson | null;
  backup: ClassPerson | null;
  onDuty: number;
  coveredByBackup: boolean;
};

/** How a class stands today, the most urgent first (the order lists and filters use). */
export const COVER_STATUSES = ['uncovered', 'lead_away', 'covered', 'no_lead', 'normal'] as const;
export type CoverStatus = (typeof COVER_STATUSES)[number];

/**
 * How a class stands today: its lead is in ('normal'); the lead is away and the backup covers
 * ('covered'); the lead is away with no backup, only the assistants are in ('lead_away'); nobody is
 * on duty while children are enrolled ('uncovered'); or no lead is named.
 */
export function coverStatus(c: ClassCover): CoverStatus {
  if (c.onDuty === 0 && c.children > 0) return 'uncovered';
  if (c.coveredByBackup) return 'covered';
  if (!c.lead) return 'no_lead';
  if (c.lead.away) return 'lead_away';
  return 'normal';
}

/** Whether a class needs its team set: nobody on duty, no lead, or its lead away with no backup. */
export function needsTeam(c: ClassCover): boolean {
  const status = coverStatus(c);
  return status === 'uncovered' || status === 'lead_away' || status === 'no_lead' || Boolean(c.lead?.away && !c.backup);
}

/** The place of a status in COVER_STATUSES: the most urgent first. */
export const coverRank = (c: ClassCover): number => COVER_STATUSES.indexOf(coverStatus(c));
export function sortClassCover(items: ClassCover[]): ClassCover[] {
  return [...items].sort((a, b) => coverRank(a) - coverRank(b) || a.nameEn.localeCompare(b.nameEn));
}

// -----------------------------------------------------------------------------------------------
// Reading the database's answers

export type StaffMember = { id: string; nameAr: string; nameEn: string; role: string };
export type MyAbsences = { today: string; absences: Absence[]; covering: Array<{ classId: string; nameAr: string; nameEn: string; leadAr: string; leadEn: string }> };
export type StaffAbsences = { today: string; absences: Absence[]; staff: StaffMember[]; classes: ClassCover[] };

const text = (v: unknown) => (typeof v === 'string' ? v : '');
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object') : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const day = (v: unknown, fallback = '') => (typeof v === 'string' ? v.slice(0, 10) : fallback);

function toAbsence(a: Record<string, unknown>): Absence {
  return {
    id: text(a.id),
    userId: typeof a.user_id === 'string' ? a.user_id : null,
    nameAr: text(a.name_ar),
    nameEn: text(a.name_en),
    startsOn: day(a.starts_on),
    endsOn: day(a.ends_on),
    reason: isReason(a.reason) ? a.reason : 'other',
    note: typeof a.note === 'string' && a.note.trim() ? a.note : null,
    cancelled: a.cancelled === true,
    bySelf: a.by_self === true,
    byAr: text(a.by_ar),
    byEn: text(a.by_en),
  };
}

function toPerson(v: unknown): ClassPerson | null {
  const p = obj(v);
  return typeof p.id === 'string' ? { id: p.id, nameAr: text(p.name_ar), nameEn: text(p.name_en), away: p.away === true } : null;
}

export function toMyAbsences(raw: unknown): MyAbsences {
  const r = obj(raw);
  return {
    today: day(r.today, new Date().toISOString().slice(0, 10)),
    absences: list(r.absences).map(toAbsence),
    covering: list(r.covering).map((c) => ({ classId: text(c.class_id), nameAr: text(c.name_ar), nameEn: text(c.name_en), leadAr: text(c.lead_ar), leadEn: text(c.lead_en) })),
  };
}

export function toStaffAbsences(raw: unknown): StaffAbsences {
  const r = obj(raw);
  return {
    today: day(r.today, new Date().toISOString().slice(0, 10)),
    absences: list(r.absences).map(toAbsence),
    staff: list(r.staff).map((s) => ({ id: text(s.id), nameAr: text(s.name_ar), nameEn: text(s.name_en), role: text(s.role) })),
    classes: list(r.classes).map((c) => ({
      classId: text(c.class_id),
      nameAr: text(c.name_ar),
      nameEn: text(c.name_en),
      children: Number(c.children) || 0,
      lead: toPerson(c.lead),
      backup: toPerson(c.backup),
      onDuty: Number(c.on_duty) || 0,
      coveredByBackup: c.covered_by_backup === true,
    })),
  };
}
