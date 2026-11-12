// The daily report a teacher fills in for each child during the day and sends at its end: the seven
// required questions (the same rules as daily_report_missing in the database), how far a report is,
// what the server is sent and read back, and the teacher's day (get_my_daily_reports).
import { errorCodeIn } from '@/lib/errorCode';

/** How much of the plate the child ate, in quarters. */
export type MealAmount = 'none' | 'quarter' | 'half' | 'three_quarters' | 'all';
export type NapQuality = 'good' | 'ok' | 'restless';
export type Mood = 'happy' | 'content' | 'fussy' | 'cranky';
export type Meal = 'breakfast' | 'lunch' | 'snacks';

export const MEALS: Meal[] = ['breakfast', 'lunch', 'snacks'];
export const MEAL_AMOUNTS: MealAmount[] = ['none', 'quarter', 'half', 'three_quarters', 'all'];
/** The share of the plate each answer fills, 0–1. */
export const MEAL_SHARE: Record<MealAmount, number> = { none: 0, quarter: 0.25, half: 0.5, three_quarters: 0.75, all: 1 };

/** The portions of food on the plate for an answer: one per quarter, 0–4 (none when not answered). */
export const mealPortions = (amount: MealAmount | null) => (amount ? Math.round(MEAL_SHARE[amount] * 4) : 0);
export const NAP_QUALITIES: NapQuality[] = ['good', 'ok', 'restless'];
export const MOODS: Mood[] = ['happy', 'content', 'fussy', 'cranky'];
export const ACTIVITY_TAGS = ['art', 'outdoor', 'reading', 'music', 'circle_time', 'story_time', 'sensory_play', 'free_play', 'other'] as const;

/** The required questions, in the order the form asks them. */
export type Question = Meal | 'nap' | 'mood' | 'toilet' | 'activities';
export const QUESTIONS: Question[] = ['breakfast', 'lunch', 'snacks', 'nap', 'mood', 'toilet', 'activities'];

export type BottleSession = { time: string; amountMl: number };

/** What a toilet visit (or diaper change) was. */
export type ToiletType = 'urine' | 'stool';
export const TOILET_TYPES: ToiletType[] = ['urine', 'stool'];
/** The most visits one report records. */
export const TOILET_MAX = 30;
/** One visit of the day; its type is chosen for each (null until it is). */
export type ToiletVisit = { type: ToiletType | null };

/** A report's answers. A question nobody answered yet is null (or empty), never a default. */
export type DailyReportAnswers = {
  meals: Record<Meal, { amount: MealAmount | null; notes: string }>;
  nap: { napped: boolean | null; durationMinutes: number | null; quality: NapQuality | null; notes: string };
  mood: { mood: Mood | null; notes: string };
  /** null: not answered yet; []: no visits today. */
  toilet: { visits: ToiletVisit[] | null; notes: string };
  activities: { tags: string[]; freeText: string; notes: string };
  /** Optional, for the youngest children. */
  feeding: { bottleSessions: BottleSession[]; nursingCount: number; nursingDurationMinutes: number; solidFoods: boolean; notes: string };
  specialNotes: string;
};

export function emptyAnswers(): DailyReportAnswers {
  return {
    meals: { breakfast: { amount: null, notes: '' }, lunch: { amount: null, notes: '' }, snacks: { amount: null, notes: '' } },
    nap: { napped: null, durationMinutes: null, quality: null, notes: '' },
    mood: { mood: null, notes: '' },
    toilet: { visits: null, notes: '' },
    activities: { tags: [], freeText: '', notes: '' },
    feeding: { bottleSessions: [], nursingCount: 0, nursingDurationMinutes: 0, solidFoods: false, notes: '' },
    specialNotes: '',
  };
}

const isNumber = (value: number | null): value is number => value != null && Number.isFinite(value);

/**
 * The questions still to answer: a nap is "no nap", or how long and how well; the toilet is "none
 * today", or each visit with its type (urine or stool).
 */
export function missingQuestions(a: DailyReportAnswers): Question[] {
  const answered: Record<Question, boolean> = {
    breakfast: a.meals.breakfast.amount != null,
    lunch: a.meals.lunch.amount != null,
    snacks: a.meals.snacks.amount != null,
    nap: a.nap.napped === false || (a.nap.napped === true && isNumber(a.nap.durationMinutes) && a.nap.durationMinutes > 0 && a.nap.quality != null),
    mood: a.mood.mood != null,
    toilet: a.toilet.visits !== null && a.toilet.visits.every((v) => v.type !== null),
    activities: a.activities.tags.length > 0 || a.activities.freeText.trim() !== '',
  };
  return QUESTIONS.filter((q) => !answered[q]);
}

export type Completion = { answered: number; required: number; percent: number; missing: Question[] };

export function completion(a: DailyReportAnswers): Completion {
  const missing = missingQuestions(a);
  const required = QUESTIONS.length;
  const answered = required - missing.length;
  return { answered, required, percent: Math.round((answered / required) * 100), missing };
}

export const percentOf = (answered: number, required: number) => (required > 0 ? Math.round((answered / required) * 100) : 0);

const text = (value: string) => (value.trim() ? value.trim() : null);

/** The answers as save_daily_report takes them (the shape of the daily_reports JSON columns). */
export function toPayload(a: DailyReportAnswers): Record<string, unknown> {
  const sessions = a.feeding.bottleSessions;
  return {
    meals: Object.fromEntries(MEALS.map((m) => [m, { amount: a.meals[m].amount, notes: text(a.meals[m].notes) }])),
    nap: {
      napped: a.nap.napped,
      duration_minutes: a.nap.napped ? a.nap.durationMinutes : null,
      quality: a.nap.napped ? a.nap.quality : null,
      notes: text(a.nap.notes),
    },
    mood: { mood: a.mood.mood, notes: text(a.mood.notes) },
    // change_count stays the number of visits, for anything that reads only that.
    toilet: { visits: a.toilet.visits?.map((v) => ({ type: v.type })) ?? null, change_count: a.toilet.visits?.length ?? null, notes: text(a.toilet.notes) },
    activities: { tags: a.activities.tags, free_text: text(a.activities.freeText), notes: text(a.activities.notes) },
    feeding: {
      bottle_sessions: sessions.map((s) => ({ time: s.time, amount_ml: s.amountMl })),
      bottle_feeds_count: sessions.length,
      bottle_amount_ml: sessions.length ? Math.round(sessions.reduce((sum, s) => sum + s.amountMl, 0) / sessions.length) : 0,
      nursing_count: a.feeding.nursingCount,
      nursing_duration_minutes: a.feeding.nursingDurationMinutes,
      solid_foods: a.feeding.solidFoods,
      notes: text(a.feeding.notes),
    },
    special_notes: text(a.specialNotes),
  };
}

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {});
const str = (value: unknown) => (value == null ? '' : String(value));
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

// Reports written before the questions were required, or before meals were answered in quarters,
// used other words for some answers.
export function parseMealAmount(value: unknown): MealAmount | null {
  const v = str(value);
  if ((MEAL_AMOUNTS as string[]).includes(v)) return v as MealAmount;
  if (v === 'some') return 'half';
  if (v === 'ate_all') return 'all';
  if (v === 'did_not_eat') return 'none';
  return null;
}

const mealAmount = (slot: Json): MealAmount | null => parseMealAmount(slot.amount ?? slot.appetite);

export function parseNapQuality(v: unknown): NapQuality | null {
  const s = str(v);
  if (s === 'good' || s === 'ok' || s === 'restless') return s;
  if (s === 'slept_well') return 'good';
  return null;
}

export function parseMood(v: unknown): Mood | null {
  const s = str(v);
  if (s === 'happy' || s === 'content' || s === 'fussy' || s === 'cranky') return s;
  if (s === 'neutral' || s === 'tired') return 'content';
  if (s === 'sad') return 'fussy';
  if (s === 'upset') return 'cranky';
  return null;
}

export const parseToiletType = (v: unknown): ToiletType | null => (v === 'urine' || v === 'stool' ? v : null);

/**
 * A saved report's toilet visits: each with its type, or (reports from before the type was asked)
 * as many visits as were counted, without a type. Null when the question was not answered.
 */
function toiletVisits(toilet: Json): ToiletVisit[] | null {
  if (Array.isArray(toilet.visits)) return toilet.visits.slice(0, TOILET_MAX).map((v) => ({ type: parseToiletType(obj(v).type) }));
  const counted = num(toilet.change_count) ?? num(toilet.diaper_changes);
  if (counted == null) return null;
  return Array.from({ length: Math.min(Math.max(0, Math.round(counted)), TOILET_MAX) }, () => ({ type: null }));
}

/** How many visits of each type; `untyped` are visits of reports from before the type was asked. */
export function toiletSummary(visits: ToiletVisit[]): { total: number; urine: number; stool: number; untyped: number } {
  const of = (type: ToiletType | null) => visits.filter((v) => v.type === type).length;
  return { total: visits.length, urine: of('urine'), stool: of('stool'), untyped: of(null) };
}

/** One more visit, its type still to choose (at most TOILET_MAX). */
export function addToiletVisit(visits: ToiletVisit[] | null): ToiletVisit[] {
  const list = visits ?? [];
  return list.length >= TOILET_MAX ? list : [...list, { type: null }];
}

export const setToiletVisitType = (visits: ToiletVisit[], index: number, type: ToiletType | null): ToiletVisit[] =>
  visits.map((v, i) => (i === index ? { type } : v));

/** Without one visit; removing the last leaves the question unanswered ("None today" is chosen, never assumed). */
export function removeToiletVisit(visits: ToiletVisit[], index: number): ToiletVisit[] | null {
  const rest = visits.filter((_, i) => i !== index);
  return rest.length ? rest : null;
}

const NAP_SEGMENTS_MAX = 8;

/**
 * A nap as one segment per hour, each 0–1 full: 150 minutes is [1, 1, 0.5]. Shown as that many
 * bars filling one after another; no nap (or no time) is none.
 */
export function napSegments(minutes: number | null | undefined): number[] {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return [];
  const capped = Math.min(minutes, NAP_SEGMENTS_MAX * 60);
  const full = Math.floor(capped / 60);
  const rest = Math.round(((capped % 60) / 60) * 100) / 100;
  return [...Array<number>(full).fill(1), ...(rest > 0 ? [rest] : [])];
}

/** 150 minutes → { hours: 2, minutes: 30 }. */
export function splitMinutes(total: number): { hours: number; minutes: number } {
  const whole = Math.max(0, Math.round(total));
  return { hours: Math.floor(whole / 60), minutes: whole % 60 };
}

/** A saved daily_reports row as answers; nothing missing is filled in. */
export function fromRow(row: Json | null | undefined): DailyReportAnswers {
  const a = emptyAnswers();
  if (!row) return a;
  const meals = obj(row.meals_json);
  const nap = obj(row.nap_json);
  const moodJson = obj(row.mood_json);
  const toilet = obj(row.toilet_json);
  const activities = obj(row.activities_json);
  const feeding = obj(row.feeding_json);

  for (const m of MEALS) a.meals[m] = { amount: mealAmount(obj(meals[m])), notes: str(obj(meals[m]).notes) };
  a.nap = {
    napped: typeof nap.napped === 'boolean' ? nap.napped : null,
    durationMinutes: num(nap.duration_minutes),
    quality: parseNapQuality(nap.quality),
    notes: str(nap.notes),
  };
  a.mood = { mood: parseMood(moodJson.mood), notes: str(moodJson.notes) };
  a.toilet = { visits: toiletVisits(toilet), notes: str(toilet.notes) };
  const tags = Array.isArray(activities.tags) ? activities.tags : Array.isArray(activities.participated_in) ? activities.participated_in : [];
  a.activities = { tags: [...new Set(tags.map(String))], freeText: str(activities.free_text ?? activities.other_activity), notes: str(activities.notes) };
  const sessions = Array.isArray(feeding.bottle_sessions) ? feeding.bottle_sessions : [];
  a.feeding = {
    bottleSessions: sessions.map((s) => ({ time: str(obj(s).time), amountMl: num(obj(s).amount_ml ?? obj(s).amountMl) ?? 0 })),
    nursingCount: num(feeding.nursing_count) ?? 0,
    nursingDurationMinutes: num(feeding.nursing_duration_minutes) ?? 0,
    solidFoods: feeding.solid_foods === true,
    notes: str(feeding.notes),
  };
  a.specialNotes = str(row.special_notes);
  return a;
}

// ---------------------------------------------------------------------------------------------
// The teacher's day

export type DayAttendance = 'present' | 'partial' | 'absent' | 'excused' | 'off' | 'not_enrolled';
export type ReportStatus = 'none' | 'draft' | 'published';

/** One child of the teacher's classes on a day (get_my_daily_reports). */
export type MyDailyReport = {
  child_id: string;
  full_name_ar: string | null;
  full_name_en: string | null;
  child_code: string | null;
  avatar_url: string | null;
  dob: string | null;
  class_id: string;
  class_name_ar: string | null;
  class_name_en: string | null;
  day: string;
  attendance: DayAttendance;
  check_in: string | null;
  check_out: string | null;
  report_id: string | null;
  status: ReportStatus;
  answered: number;
  required: number;
  missing: Question[];
  last_saved_at: string | null;
  published_at: string | null;
  due_at: string;
};

/** Where a child's report stands: a report is expected from each child who came. */
export type ReportStage = 'sent' | 'ready' | 'in_progress' | 'not_started' | 'not_expected';

export const came = (row: Pick<MyDailyReport, 'attendance'>) => row.attendance === 'present' || row.attendance === 'partial';

export function stageOf(row: Pick<MyDailyReport, 'attendance' | 'status' | 'answered' | 'required'>): ReportStage {
  if (row.status === 'published') return 'sent';
  if (row.status === 'draft') return row.answered >= row.required ? 'ready' : 'in_progress';
  return came(row) ? 'not_started' : 'not_expected';
}

/** A report the teacher can send now: complete and not sent yet. */
export const canSend = (row: Pick<MyDailyReport, 'attendance' | 'status' | 'answered' | 'required' | 'report_id'>) =>
  Boolean(row.report_id) && stageOf(row) === 'ready';

export type ReportDay = {
  /** Children who came today: one report each. */
  expected: number;
  sent: number;
  ready: number;
  inProgress: number;
  notStarted: number;
  /** Reports still to send among those expected (and any started for a child who did not come). */
  open: number;
  /** Sent out of expected, 0–100 (100 when nothing is expected). */
  rate: number;
  /** The average answered share of the expected reports, 0–100. */
  avgCompletion: number;
};

export function reportDay(rows: MyDailyReport[]): ReportDay {
  const expectedRows = rows.filter((r) => came(r) || r.status !== 'none');
  const count = (stage: ReportStage) => expectedRows.filter((r) => stageOf(r) === stage).length;
  const expected = expectedRows.length;
  const sent = count('sent');
  return {
    expected,
    sent,
    ready: count('ready'),
    inProgress: count('in_progress'),
    notStarted: count('not_started'),
    open: expected - sent,
    rate: expected ? Math.round((sent / expected) * 100) : 100,
    avgCompletion: expected ? Math.round(expectedRows.reduce((sum, r) => sum + percentOf(r.answered, r.required), 0) / expected) : 0,
  };
}

/** How close the reports are to being due: "open" until an hour before, then "soon", then "overdue". */
export type DueState = 'done' | 'open' | 'soon' | 'overdue';

export const REMINDER_LEAD_MINUTES = 60;

export function dueState(day: Pick<ReportDay, 'open'>, dueAt: string | null | undefined, now: Date = new Date()): DueState {
  if (day.open === 0) return 'done';
  if (!dueAt) return 'open';
  const due = new Date(dueAt).getTime();
  if (now.getTime() >= due) return 'overdue';
  if (now.getTime() >= due - REMINDER_LEAD_MINUTES * 60_000) return 'soon';
  return 'open';
}

export type StageFilter = 'all' | ReportStage | 'open';

export type DayFilters = { search: string; classId: string; stage: StageFilter };
export const NO_DAY_FILTERS: DayFilters = { search: '', classId: '', stage: 'all' };

export function filterDay(rows: MyDailyReport[], filters: DayFilters): MyDailyReport[] {
  const q = filters.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (filters.classId && r.class_id !== filters.classId) return false;
    const stage = stageOf(r);
    if (filters.stage === 'open' ? stage === 'sent' || stage === 'not_expected' : filters.stage !== 'all' && stage !== filters.stage) return false;
    if (q && ![r.full_name_ar, r.full_name_en, r.child_code].some((v) => v?.toLowerCase().includes(q))) return false;
    return true;
  });
}

/** The report a teacher opens next after this one: the next child who came, in list order. */
export function nextChild(rows: MyDailyReport[], childId: string, step: 1 | -1): MyDailyReport | null {
  const list = rows.filter((r) => came(r) || r.status !== 'none');
  const at = list.findIndex((r) => r.child_id === childId);
  if (at < 0) return list[0] ?? null;
  return list[at + step] ?? null;
}

/** The server's refusal as a locale key under dailyReport.errors (unknown ones fall back to `failed`). */
const DAILY_REPORT_ERROR_CODES = [
  'daily_report_child_not_in_your_class',
  'daily_report_already_sent',
  'daily_report_date_invalid',
  'daily_report_incomplete',
  'daily_report_none_selected',
  'daily_report_forbidden',
  'daily_report_child_not_found',
  'daily_report_search_invalid',
] as const;

export function dailyReportErrorKey(error: unknown): string {
  const code = errorCodeIn(error, DAILY_REPORT_ERROR_CODES);
  return code ? code.replace('daily_report_', '') : 'failed';
}

/** What send_daily_reports answered. */
export type SendResult = {
  sent: string[];
  sent_count: number;
  incomplete: { id: string; child_id: string; missing: Question[] }[];
  already_sent: number;
};

/** What save_daily_report answered. */
export type SaveResult = { id: string; status: ReportStatus; answered: number; required: number; missing: Question[]; last_saved_at: string };
