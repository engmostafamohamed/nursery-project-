/*
 * One child's whole record as plain data (no React, no network): who she is, who to reach, and
 * everything that happened to her — the reports, the days, the events, what she reached, her
 * health notes, what the teachers told her family, and her photographs.
 */
import { count, list, numberOrNull, obj, text, textOrNull } from '@/lib/jsonRead';

export type Bilingual = { ar: string | null; en: string | null };

const names = (raw: unknown): Bilingual => {
  const o = obj(raw);
  return { ar: textOrNull(o.ar), en: textOrNull(o.en) };
};

export type ChildHeader = {
  id: string;
  name: Bilingual;
  code: string | null;
  avatarUrl: string | null;
  dob: string | null;
  gender: 'male' | 'female' | null;
  enrolledOn: string | null;
  className: Bilingual | null;
};

export type ChildParent = { id: string; name: Bilingual; relationship: string | null; phone: string | null };
export type ChildAllergy = { name: string; severity: string | null; reaction: string | null; treatment: string | null };
export type ChildReport = { id: string; date: string; status: string; mood: string | null; napMinutes: number | null; note: string | null; by: Bilingual };
export type ChildDay = { id: string; date: string; checkIn: string | null; checkOut: string | null; lateMinutes: number; extraHours: number };
export type ChildAbsence = { id: string; date: string; reason: string | null; note: string | null };
export type ChildEvent = { id: string; name: Bilingual; startsAt: string; category: string | null; permission: string | null; attended: boolean };
export type ChildMilestone = { id: string; at: string; category: string | null; name: Bilingual; note: string | null; by: Bilingual };
export type ChildHealthNote = { id: string; date: string | null; type: string | null; note: string | null };
export type ChildMessage = { id: string; at: string; body: string; audience: string | null; by: Bilingual };
export type ChildPhoto = { id: string; at: string; url: string | null; caption: string | null; type: string | null };

export type ChildHistory = {
  child: ChildHeader;
  parents: ChildParent[];
  allergies: ChildAllergy[];
  reports: ChildReport[];
  attendance: ChildDay[];
  absences: ChildAbsence[];
  events: ChildEvent[];
  milestones: ChildMilestone[];
  health: ChildHealthNote[];
  messages: ChildMessage[];
  media: ChildPhoto[];
};

/** The parts a child's record is read in, in the order the tabs offer them. */
export const HISTORY_PARTS = ['reports', 'attendance', 'events', 'milestones', 'health', 'messages', 'media'] as const;
export type HistoryPart = (typeof HISTORY_PARTS)[number];

export function toChildHistory(raw: unknown): ChildHistory | null {
  const o = obj(raw);
  const child = obj(o.child);
  const id = textOrNull(child.id);
  if (!id) return null;
  const gender = text(child.gender);
  return {
    child: {
      id,
      name: { ar: textOrNull(child.name_ar), en: textOrNull(child.name_en) },
      code: textOrNull(child.code),
      avatarUrl: textOrNull(child.avatar_url),
      dob: textOrNull(child.dob),
      gender: gender === 'male' || gender === 'female' ? gender : null,
      enrolledOn: textOrNull(child.enrolled_on),
      className: child.class ? names(child.class) : null,
    },
    parents: list(o.parents).map((p) => ({
      id: text(p.id),
      name: { ar: textOrNull(p.ar), en: textOrNull(p.en) },
      relationship: textOrNull(p.relationship),
      phone: textOrNull(p.phone),
    })),
    allergies: list(o.allergies).map((a) => ({
      name: text(a.name),
      severity: textOrNull(a.severity),
      reaction: textOrNull(a.reaction),
      treatment: textOrNull(a.treatment),
    })),
    reports: list(o.reports).map((r) => ({
      id: text(r.id),
      date: text(r.date),
      status: text(r.status),
      mood: textOrNull(r.mood),
      napMinutes: numberOrNull(r.nap_minutes),
      note: textOrNull(r.note),
      by: names(r.by),
    })),
    attendance: list(o.attendance).map((a) => ({
      id: text(a.id),
      date: text(a.date),
      checkIn: textOrNull(a.check_in),
      checkOut: textOrNull(a.check_out),
      lateMinutes: count(a.late_minutes),
      extraHours: count(a.extra_hours),
    })),
    absences: list(o.absences).map((a) => ({
      id: text(a.id),
      date: text(a.date),
      reason: textOrNull(a.reason),
      note: textOrNull(a.note),
    })),
    events: list(o.events).map((e) => ({
      id: text(e.id),
      name: { ar: textOrNull(e.ar), en: textOrNull(e.en) },
      startsAt: text(e.starts_at),
      category: textOrNull(e.category),
      permission: textOrNull(e.permission),
      attended: e.attended === true,
    })),
    milestones: list(o.milestones).map((m) => ({
      id: text(m.id),
      at: text(m.at),
      category: textOrNull(m.category),
      name: { ar: textOrNull(m.ar), en: textOrNull(m.en) },
      note: textOrNull(m.note),
      by: names(m.by),
    })),
    health: list(o.health).map((h) => ({
      id: text(h.id),
      date: textOrNull(h.date),
      type: textOrNull(h.type),
      note: textOrNull(h.note),
    })),
    messages: list(o.messages).map((m) => ({
      id: text(m.id),
      at: text(m.at),
      body: text(m.body),
      audience: textOrNull(m.audience),
      by: names(m.by),
    })),
    media: list(o.media).map((p) => ({
      id: text(p.id),
      at: text(p.at),
      url: textOrNull(p.url),
      caption: textOrNull(p.caption),
      type: textOrNull(p.type),
    })),
  };
}

/** How many entries each part holds, for the tab counts. */
export function partCounts(history: ChildHistory | null | undefined): Record<HistoryPart, number> {
  return {
    reports: history?.reports.length ?? 0,
    // The days she came and the days she was away read as one timeline.
    attendance: (history?.attendance.length ?? 0) + (history?.absences.length ?? 0),
    events: history?.events.length ?? 0,
    milestones: history?.milestones.length ?? 0,
    health: history?.health.length ?? 0,
    messages: history?.messages.length ?? 0,
    media: history?.media.length ?? 0,
  };
}

export type TimelineDay =
  | { kind: 'present'; date: string; day: ChildDay }
  | { kind: 'away'; date: string; absence: ChildAbsence };

/** The days she came and the days she was away, newest first, as one list. */
export function attendanceTimeline(history: ChildHistory | null | undefined): TimelineDay[] {
  const days: TimelineDay[] = [
    ...(history?.attendance ?? []).map((day) => ({ kind: 'present' as const, date: day.date, day })),
    ...(history?.absences ?? []).map((absence) => ({ kind: 'away' as const, date: absence.date, absence })),
  ];
  return days.sort((a, b) => b.date.localeCompare(a.date));
}

/** The age a date of birth makes today, in whole months, or null when it is not known. */
export function ageInMonths(dob: string | null | undefined, today: Date = new Date()): number | null {
  if (!dob) return null;
  const born = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(born.getTime())) return null;
  const months = (today.getFullYear() - born.getFullYear()) * 12 + (today.getMonth() - born.getMonth());
  return today.getDate() < born.getDate() ? Math.max(0, months - 1) : Math.max(0, months);
}
