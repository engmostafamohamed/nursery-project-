/*
 * One class as the nursery's admins see it (get_class_profile): its room, its team and who is on
 * duty today, its children and their day, what went to its families, its waiting list, the team's
 * changes, its media and cameras. The database's answer is read field by field here; the page's
 * numbers, filters and states are plain functions over it.
 */
import { ALLERGY_SEVERITIES, worstSeverity, type AllergySeverity } from '@/features/child-health/childHealth';
import { ABSENCE_REASONS, type AbsenceReason, type ClassCover } from '@/features/staff-absence/staffAbsence';
import { came, type DayAttendance, type ReportStage, type ReportStatus } from '@/lib/dailyReport';
import { count, day, list, numberOrNull, obj, oneOf, text, textOrNull, type JsonRecord } from '@/lib/jsonRead';
import type { ClassStaffRole } from '@/types/tables';

// -----------------------------------------------------------------------------------------------
// The profile

const STAFF_ROLES: readonly ClassStaffRole[] = ['lead', 'substitute', 'assistant'];
const DAY_ATTENDANCE: readonly DayAttendance[] = ['present', 'partial', 'absent', 'excused', 'off', 'not_enrolled'];
const REPORT_STATUSES: readonly ReportStatus[] = ['none', 'draft', 'published'];
export const CHILD_ABSENCE_REASONS = ['sick', 'travel', 'family', 'other'] as const;
export type ChildAbsenceReason = (typeof CHILD_ABSENCE_REASONS)[number];
const MESSAGE_KINDS = ['announcement', 'family_message'] as const;
const MESSAGE_STATUSES = ['draft', 'scheduled', 'sent', 'failed'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];
const WAIT_STATUSES = ['waiting', 'offered'] as const;
const TEAM_ACTIONS = ['assigned', 'changed', 'removed'] as const;

export type ClassInfo = {
  id: string;
  nurseryId: string;
  nameAr: string;
  nameEn: string;
  gradeLevel: string | null;
  roomNumber: string | null;
  capacity: number | null;
  createdAt: string;
  /** The nursery's time zone, for check-in and pick-up times; null means the device's. */
  timezone: string | null;
};

export type TeamMember = {
  id: string;
  nameAr: string;
  nameEn: string;
  email: string | null;
  phone: string | null;
  role: ClassStaffRole;
  since: string;
  /** The account can sign in (an inactive one stays on the team until it is changed). */
  active: boolean;
  onDuty: boolean;
  /** A backup who looks after the class today because its lead is away. */
  covering: boolean;
  absence: { reason: AbsenceReason; startsOn: string; endsOn: string } | null;
};

export type ChildAllergy = { name: string; severity: AllergySeverity };

export type ClassChild = {
  id: string;
  nameAr: string;
  nameEn: string;
  code: string | null;
  avatarUrl: string | null;
  dob: string | null;
  gender: 'male' | 'female' | null;
  enrolledOn: string;
  attendance: DayAttendance;
  checkIn: string | null;
  checkOut: string | null;
  absenceReason: ChildAbsenceReason | null;
  report: ReportStatus;
  /** The most serious first. */
  allergies: ChildAllergy[];
  conditions: number;
  /** Medicines the round gives today. */
  medications: number;
};

export type ClassMessage = {
  id: string;
  kind: (typeof MESSAGE_KINDS)[number];
  status: MessageStatus;
  bodyAr: string;
  bodyEn: string;
  senderAr: string;
  senderEn: string;
  sentAt: string;
};

export type WaitlistEntry = {
  id: string;
  inquiryId: string;
  position: number;
  status: (typeof WAIT_STATUSES)[number];
  addedAt: string;
  notifiedAt: string | null;
  childName: string;
  childDob: string | null;
  parentName: string;
  parentPhone: string | null;
  startDate: string | null;
};

export type TeamChange = {
  id: string;
  action: (typeof TEAM_ACTIONS)[number];
  role: ClassStaffRole | null;
  previousRole: ClassStaffRole | null;
  at: string;
  nameAr: string;
  nameEn: string;
  byAr: string;
  byEn: string;
};

export type ClassCamera = { id: string; nameAr: string; nameEn: string; location: string | null; active: boolean };

export type ClassProfile = {
  today: string;
  /** The nursery is open today (a working day that is not a holiday). */
  schoolDay: boolean;
  info: ClassInfo;
  team: TeamMember[];
  children: ClassChild[];
  messages: ClassMessage[];
  waitlist: WaitlistEntry[];
  teamChanges: TeamChange[];
  media: { pending: number; approvedLast30Days: number };
  cameras: ClassCamera[];
};

const role = (value: unknown): ClassStaffRole | null => (STAFF_ROLES.includes(value as ClassStaffRole) ? (value as ClassStaffRole) : null);

function toMember(m: JsonRecord): TeamMember {
  const absence = obj(m.absence);
  return {
    id: text(m.id),
    nameAr: text(m.name_ar),
    nameEn: text(m.name_en),
    email: textOrNull(m.email),
    phone: textOrNull(m.phone),
    role: role(m.role) ?? 'assistant',
    since: text(m.since),
    active: m.active !== false,
    onDuty: m.on_duty === true,
    covering: m.covering === true,
    absence: absence.starts_on
      ? { reason: oneOf(absence.reason, ABSENCE_REASONS, 'other'), startsOn: day(absence.starts_on), endsOn: day(absence.ends_on) }
      : null,
  };
}

function toChild(c: JsonRecord): ClassChild {
  return {
    id: text(c.id),
    nameAr: text(c.name_ar),
    nameEn: text(c.name_en),
    code: textOrNull(c.code),
    avatarUrl: textOrNull(c.avatar_url),
    dob: day(c.dob) || null,
    gender: c.gender === 'male' || c.gender === 'female' ? c.gender : null,
    enrolledOn: day(c.enrolled_on),
    attendance: oneOf(c.attendance, DAY_ATTENDANCE, 'absent'),
    checkIn: textOrNull(c.check_in),
    checkOut: textOrNull(c.check_out),
    absenceReason: c.absence_reason ? oneOf(c.absence_reason, CHILD_ABSENCE_REASONS, 'other') : null,
    report: oneOf(c.report, REPORT_STATUSES, 'none'),
    allergies: list(c.allergies)
      .filter((a) => text(a.name).trim())
      .map((a) => ({ name: text(a.name).trim(), severity: oneOf(a.severity, ALLERGY_SEVERITIES, 'mild') })),
    conditions: count(c.conditions),
    medications: count(c.medications),
  };
}

export function toClassProfile(raw: unknown): ClassProfile {
  const r = obj(raw);
  const info = obj(r.class);
  const media = obj(r.media);
  return {
    today: day(r.today) || new Date().toISOString().slice(0, 10),
    schoolDay: r.school_day !== false,
    info: {
      id: text(info.id),
      nurseryId: text(info.nursery_id),
      nameAr: text(info.name_ar),
      nameEn: text(info.name_en),
      gradeLevel: textOrNull(info.grade_level),
      roomNumber: textOrNull(info.room_number),
      capacity: numberOrNull(info.capacity),
      createdAt: text(info.created_at),
      timezone: textOrNull(info.timezone),
    },
    team: list(r.team).map(toMember),
    children: list(r.children).map(toChild),
    messages: list(r.messages).map((m) => ({
      id: text(m.id),
      kind: oneOf(m.kind, MESSAGE_KINDS, 'announcement'),
      status: oneOf(m.status, MESSAGE_STATUSES, 'sent'),
      bodyAr: text(m.body_ar),
      bodyEn: text(m.body_en),
      senderAr: text(m.sender_ar),
      senderEn: text(m.sender_en),
      sentAt: text(m.sent_at),
    })),
    waitlist: list(r.waitlist).map((w) => ({
      id: text(w.id),
      inquiryId: text(w.inquiry_id),
      position: count(w.position),
      status: oneOf(w.status, WAIT_STATUSES, 'waiting'),
      addedAt: text(w.added_at),
      notifiedAt: textOrNull(w.notified_at),
      childName: text(w.child_name),
      childDob: day(w.child_dob) || null,
      parentName: text(w.parent_name),
      parentPhone: textOrNull(w.parent_phone),
      startDate: day(w.start_date) || null,
    })),
    teamChanges: list(r.team_changes).map((c) => ({
      id: text(c.id),
      action: oneOf(c.action, TEAM_ACTIONS, 'changed'),
      role: role(c.role),
      previousRole: role(c.previous_role),
      at: text(c.at),
      nameAr: text(c.name_ar),
      nameEn: text(c.name_en),
      byAr: text(c.by_ar),
      byEn: text(c.by_en),
    })),
    media: { pending: count(media.pending), approvedLast30Days: count(media.approved_30d) },
    cameras: list(r.cameras).map((k) => ({
      id: text(k.id),
      nameAr: text(k.name_ar),
      nameEn: text(k.name_en),
      location: textOrNull(k.location),
      active: k.active !== false,
    })),
  };
}

// -----------------------------------------------------------------------------------------------
// The page's tabs

export const CLASS_PROFILE_TABS = ['children', 'team', 'activity', 'waitlist', 'details'] as const;
export type ClassProfileTab = (typeof CLASS_PROFILE_TABS)[number];

/** The tab a link asks for (?tab=team), else the children. */
export function tabFrom(value: string | null): ClassProfileTab {
  return CLASS_PROFILE_TABS.find((tab) => tab === value) ?? 'children';
}

// -----------------------------------------------------------------------------------------------
// The children's day

const SERIOUS: readonly AllergySeverity[] = ['severe', 'life_threatening'];

export const isHere = (c: Pick<ClassChild, 'attendance'>) => c.attendance === 'partial';
export const wentHome = (c: Pick<ClassChild, 'attendance'>) => c.attendance === 'present';
/** Did not come on a school day: with a parent's notice ('excused') or without. */
export const isAbsent = (c: Pick<ClassChild, 'attendance'>) => c.attendance === 'absent' || c.attendance === 'excused';
/** Came today and the day's report has not gone to the parents yet. */
export const reportDue = (c: Pick<ClassChild, 'attendance' | 'report'>) => came(c) && c.report !== 'published';
export const hasHealthNeeds = (c: Pick<ClassChild, 'allergies' | 'conditions' | 'medications'>) =>
  c.allergies.length > 0 || c.conditions > 0 || c.medications > 0;
export const hasSeriousAllergy = (c: Pick<ClassChild, 'allergies'>) => {
  const worst = worstSeverity(c.allergies);
  return worst !== null && SERIOUS.includes(worst);
};

/** Where the child's report stands, in the teachers' daily-report terms. */
export function reportStageOf(c: Pick<ClassChild, 'attendance' | 'report'>): ReportStage {
  if (c.report === 'published') return 'sent';
  if (c.report === 'draft') return 'in_progress';
  return came(c) ? 'not_started' : 'not_expected';
}

export type TodaySummary = {
  children: number;
  /** Expected today: enrolled by now, on a day the nursery is open. */
  expected: number;
  here: number;
  wentHome: number;
  /** Absent without a word from the parents. */
  absent: number;
  /** Absent with a parent's notice. */
  excused: number;
  reportsSent: number;
  reportsDue: number;
  health: number;
  seriousAllergies: number;
};

export function todaySummary(children: ClassChild[]): TodaySummary {
  const tally = (test: (c: ClassChild) => boolean) => children.filter(test).length;
  return {
    children: children.length,
    expected: tally((c) => c.attendance !== 'off' && c.attendance !== 'not_enrolled'),
    here: tally(isHere),
    wentHome: tally(wentHome),
    absent: tally((c) => c.attendance === 'absent'),
    excused: tally((c) => c.attendance === 'excused'),
    reportsSent: tally((c) => c.report === 'published'),
    reportsDue: tally(reportDue),
    health: tally(hasHealthNeeds),
    seriousAllergies: tally(hasSeriousAllergy),
  };
}

export const CHILD_FILTERS = ['all', 'here', 'went_home', 'absent', 'reports_due', 'health'] as const;
export type ChildFilter = (typeof CHILD_FILTERS)[number];

const FILTER_TEST: Record<ChildFilter, (c: ClassChild) => boolean> = {
  all: () => true,
  here: isHere,
  went_home: wentHome,
  absent: isAbsent,
  reports_due: reportDue,
  health: hasHealthNeeds,
};

export function filterCounts(children: ClassChild[]): Record<ChildFilter, number> {
  return Object.fromEntries(CHILD_FILTERS.map((f) => [f, children.filter(FILTER_TEST[f]).length])) as Record<ChildFilter, number>;
}

/** The children a filter keeps whose name (either language) or code holds every word searched for. */
export function filterChildren(children: ClassChild[], filter: ChildFilter, search: string): ClassChild[] {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return children.filter((c) => {
    if (!FILTER_TEST[filter](c)) return false;
    if (!words.length) return true;
    const haystack = `${c.nameAr} ${c.nameEn} ${c.code ?? ''}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

// -----------------------------------------------------------------------------------------------
// The team's day

export type DutyState = 'on_duty' | 'covering' | 'away' | 'standby' | 'inactive';

/** A team member today: in, covering for the lead, away, a backup not needed today, or unable to sign in. */
export function dutyState(m: Pick<TeamMember, 'active' | 'absence' | 'covering' | 'onDuty'>): DutyState {
  if (!m.active) return 'inactive';
  if (m.absence) return 'away';
  if (m.covering) return 'covering';
  if (m.onDuty) return 'on_duty';
  return 'standby';
}

/** The class in the absences screen's terms, so its cover status reads the same on both pages. */
export function classCover(p: Pick<ClassProfile, 'info' | 'team' | 'children'>): ClassCover {
  const person = (m: TeamMember | undefined) => (m ? { id: m.id, nameAr: m.nameAr, nameEn: m.nameEn, away: m.absence !== null } : null);
  return {
    classId: p.info.id,
    nameAr: p.info.nameAr,
    nameEn: p.info.nameEn,
    children: p.children.length,
    lead: person(p.team.find((m) => m.role === 'lead')),
    backup: person(p.team.find((m) => m.role === 'substitute')),
    onDuty: p.team.filter((m) => m.onDuty).length,
    coveredByBackup: p.team.some((m) => m.covering),
  };
}
