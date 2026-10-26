// The daily report: the seven required questions (the same rules as the database), what is saved
// and read back, the teacher's day (stages, numbers, what can be sent, filters), when reports are
// due, and the send rate's colours.
import { describe, expect, it } from 'vitest';

import {
  canSend,
  completion,
  dailyReportErrorKey,
  dueState,
  emptyAnswers,
  filterDay,
  fromRow,
  MEAL_AMOUNTS,
  MEAL_SHARE,
  missingQuestions,
  napSegments,
  nextChild,
  NO_DAY_FILTERS,
  parseMealAmount,
  reportDay,
  splitMinutes,
  stageOf,
  toPayload,
  type DailyReportAnswers,
  type MealAmount,
  type MyDailyReport,
} from './dailyReport';
import { rateTone, searchRows } from './dailyReportStats';

function filled(): DailyReportAnswers {
  const a = emptyAnswers();
  a.meals.breakfast.amount = 'all';
  a.meals.lunch.amount = 'half';
  a.meals.snacks.amount = 'none';
  a.nap = { napped: true, durationMinutes: 60, quality: 'good', notes: '' };
  a.mood.mood = 'happy';
  a.toilet.changeCount = 0;
  a.activities.tags = ['art'];
  return a;
}

describe('the required questions', () => {
  it('an empty report misses all seven, in the order they are asked', () => {
    expect(missingQuestions(emptyAnswers())).toEqual(['breakfast', 'lunch', 'snacks', 'nap', 'mood', 'toilet', 'activities']);
    expect(completion(emptyAnswers())).toMatchObject({ answered: 0, required: 7, percent: 0 });
  });

  it('a filled report misses none; no toilet visit (0) is an answer', () => {
    expect(completion(filled())).toEqual({ answered: 7, required: 7, percent: 100, missing: [] });
  });

  it('a nap needs how long and how well; "no nap" answers it', () => {
    const a = filled();
    a.nap = { napped: true, durationMinutes: null, quality: 'good', notes: '' };
    expect(missingQuestions(a)).toEqual(['nap']);
    a.nap = { napped: true, durationMinutes: 0, quality: 'good', notes: '' };
    expect(missingQuestions(a)).toEqual(['nap']);
    a.nap = { napped: true, durationMinutes: 45, quality: null, notes: '' };
    expect(missingQuestions(a)).toEqual(['nap']);
    a.nap = { napped: false, durationMinutes: null, quality: null, notes: '' };
    expect(missingQuestions(a)).toEqual([]);
  });

  it('activities can be written instead of picked; blank text is not an answer', () => {
    const a = filled();
    a.activities.tags = [];
    a.activities.freeText = '   ';
    expect(missingQuestions(a)).toEqual(['activities']);
    a.activities.freeText = 'Built a tower';
    expect(completion(a).percent).toBe(100);
  });

  it('counts how far a report is', () => {
    const a = emptyAnswers();
    a.meals.breakfast.amount = 'all';
    a.mood.mood = 'content';
    expect(completion(a)).toMatchObject({ answered: 2, percent: 29, missing: ['lunch', 'snacks', 'nap', 'toilet', 'activities'] });
  });
});

describe('saving and reading back', () => {
  it('sends the answers in the shape of the report columns, unanswered ones as null', () => {
    const payload = toPayload(emptyAnswers());
    expect(payload.meals).toEqual({ breakfast: { amount: null, notes: null }, lunch: { amount: null, notes: null }, snacks: { amount: null, notes: null } });
    expect(payload.nap).toEqual({ napped: null, duration_minutes: null, quality: null, notes: null });
    expect(payload.toilet).toEqual({ change_count: null, notes: null });
    expect(payload.special_notes).toBeNull();
  });

  it('drops how long and how well when there was no nap', () => {
    const a = filled();
    a.nap = { napped: false, durationMinutes: 30, quality: 'ok', notes: ' tired ' };
    expect(toPayload(a).nap).toEqual({ napped: false, duration_minutes: null, quality: null, notes: 'tired' });
  });

  it('reads back exactly what was saved', () => {
    const a = filled();
    a.meals.lunch.notes = 'Rice';
    a.feeding.bottleSessions = [{ time: '10:00', amountMl: 120 }];
    a.specialNotes = 'Bring a jacket';
    const p = toPayload(a);
    const back = fromRow({
      meals_json: p.meals, nap_json: p.nap, mood_json: p.mood, toilet_json: p.toilet,
      activities_json: p.activities, feeding_json: p.feeding, special_notes: p.special_notes,
    });
    expect(back).toEqual(a);
  });

  it('never fills in an answer that was not given', () => {
    expect(fromRow({ meals_json: {}, nap_json: {}, mood_json: {}, toilet_json: {}, activities_json: {} })).toEqual(emptyAnswers());
    expect(fromRow(null)).toEqual(emptyAnswers());
  });

  it('understands the words older reports used', () => {
    const a = fromRow({
      meals_json: { breakfast: { appetite: 'ate_all' }, lunch: { amount: 'did_not_eat' }, snacks: { amount: 'lots' } },
      nap_json: { napped: true, duration_minutes: 40, quality: 'slept_well' },
      mood_json: { mood: 'sad' },
      toilet_json: { diaper_changes: 3 },
      activities_json: { participated_in: ['music', 'music'], other_activity: 'Dance' },
    });
    expect(a.meals.breakfast.amount).toBe('all');
    expect(a.meals.lunch.amount).toBe('none');
    expect(a.meals.snacks.amount).toBeNull();
    expect(a.nap.quality).toBe('good');
    expect(a.mood.mood).toBe('fussy');
    expect(a.toilet.changeCount).toBe(3);
    expect(a.activities).toMatchObject({ tags: ['music'], freeText: 'Dance' });
  });
});

describe('meals in quarters of the plate', () => {
  it.each([
    ['none', 'none', 0],
    ['quarter', 'quarter', 0.25],
    ['half', 'half', 0.5],
    ['three_quarters', 'three_quarters', 0.75],
    ['all', 'all', 1],
    // Reports from before the quarters said "some": shown as half the plate.
    ['some', 'half', 0.5],
  ])('"%s" is %s of the plate', (stored, amount, share) => {
    const parsed = parseMealAmount(stored);
    expect(parsed).toBe(amount);
    expect(MEAL_SHARE[parsed as MealAmount]).toBe(share);
  });

  it('anything else is no answer', () => {
    for (const v of ['lots', '', null, undefined, 3, 'ALL']) expect(parseMealAmount(v)).toBeNull();
  });

  it('offers the five amounts in order, emptiest first', () => {
    expect(MEAL_AMOUNTS).toEqual(['none', 'quarter', 'half', 'three_quarters', 'all']);
    expect(MEAL_AMOUNTS.map((x) => MEAL_SHARE[x])).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it('a quarter-plate report is complete and reads back as saved', () => {
    const a = filled();
    a.meals.breakfast.amount = 'quarter';
    a.meals.lunch.amount = 'three_quarters';
    expect(missingQuestions(a)).toEqual([]);
    const p = toPayload(a);
    expect(fromRow({ meals_json: p.meals }).meals.lunch.amount).toBe('three_quarters');
  });
});

describe('a nap as a bar per hour', () => {
  it.each([
    [150, [1, 1, 0.5]],
    [60, [1]],
    [45, [0.75]],
    [125, [1, 1, 0.08]],
    [0, []],
    [null, []],
    [-30, []],
    [NaN, []],
  ])('%s minutes → %j', (minutes, segments) => {
    expect(napSegments(minutes as number | null)).toEqual(segments);
  });

  it('never draws more than eight bars', () => {
    expect(napSegments(20 * 60)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('splits minutes into hours and minutes', () => {
    expect(splitMinutes(150)).toEqual({ hours: 2, minutes: 30 });
    expect(splitMinutes(45)).toEqual({ hours: 0, minutes: 45 });
    expect(splitMinutes(120)).toEqual({ hours: 2, minutes: 0 });
    expect(splitMinutes(-5)).toEqual({ hours: 0, minutes: 0 });
  });
});

function row(over: Partial<MyDailyReport>): MyDailyReport {
  return {
    child_id: 'c1', full_name_ar: 'ليلى', full_name_en: 'Laila', child_code: 'CH-2026-00001', avatar_url: null, dob: null,
    class_id: 'k1', class_name_ar: 'الفراشات', class_name_en: 'Butterflies', day: '2026-10-25',
    attendance: 'present', check_in: null, check_out: null, report_id: null, status: 'none',
    answered: 0, required: 7, missing: [], last_saved_at: null, published_at: null, due_at: '2026-10-25T14:00:00Z',
    ...over,
  };
}

const day = [
  row({ child_id: 'sent', full_name_en: 'Adam', report_id: 'r1', status: 'published', answered: 7 }),
  row({ child_id: 'ready', full_name_en: 'Bassem', report_id: 'r2', status: 'draft', answered: 7, attendance: 'partial' }),
  row({ child_id: 'half', full_name_en: 'Celine', report_id: 'r3', status: 'draft', answered: 3, class_id: 'k2' }),
  row({ child_id: 'new', full_name_en: 'Dalia', child_code: 'CH-2026-00042' }),
  row({ child_id: 'away', full_name_en: 'Eman', attendance: 'absent' }),
];

describe("the teacher's day", () => {
  it('says where each report stands; a report is expected from each child who came', () => {
    expect(day.map(stageOf)).toEqual(['sent', 'ready', 'in_progress', 'not_started', 'not_expected']);
  });

  it('counts the day', () => {
    expect(reportDay(day)).toEqual({ expected: 4, sent: 1, ready: 1, inProgress: 1, notStarted: 1, open: 3, rate: 25, avgCompletion: 61 });
    expect(reportDay([]).rate).toBe(100);
  });

  it('only a complete report not yet sent can be sent', () => {
    expect(day.filter(canSend).map((r) => r.child_id)).toEqual(['ready']);
  });

  it('filters by class, stage, name and code', () => {
    expect(filterDay(day, { ...NO_DAY_FILTERS, classId: 'k2' }).map((r) => r.child_id)).toEqual(['half']);
    expect(filterDay(day, { ...NO_DAY_FILTERS, stage: 'open' }).map((r) => r.child_id)).toEqual(['ready', 'half', 'new']);
    expect(filterDay(day, { ...NO_DAY_FILTERS, stage: 'ready' }).map((r) => r.child_id)).toEqual(['ready']);
    expect(filterDay(day, { ...NO_DAY_FILTERS, search: '00042' }).map((r) => r.child_id)).toEqual(['new']);
    expect(filterDay(day, { ...NO_DAY_FILTERS, search: 'celine' }).map((r) => r.child_id)).toEqual(['half']);
  });

  it('goes to the next and previous child who came', () => {
    expect(nextChild(day, 'half', 1)?.child_id).toBe('new');
    expect(nextChild(day, 'new', 1)).toBeNull();
    expect(nextChild(day, 'sent', -1)).toBeNull();
    expect(nextChild(day, 'ready', -1)?.child_id).toBe('sent');
  });

  it('turns to "soon" an hour before the reports are due, then "overdue"', () => {
    const due = '2026-10-25T14:00:00Z';
    expect(dueState({ open: 2 }, due, new Date('2026-10-25T12:59:00Z'))).toBe('open');
    expect(dueState({ open: 2 }, due, new Date('2026-10-25T13:00:00Z'))).toBe('soon');
    expect(dueState({ open: 2 }, due, new Date('2026-10-25T14:00:00Z'))).toBe('overdue');
    expect(dueState({ open: 0 }, due, new Date('2026-10-25T15:00:00Z'))).toBe('done');
  });

  it("names the server's refusals", () => {
    expect(dailyReportErrorKey({ message: 'daily_report_child_not_in_your_class' })).toBe('child_not_in_your_class');
    expect(dailyReportErrorKey(new Error('daily_report_already_sent'))).toBe('already_sent');
    expect(dailyReportErrorKey('boom')).toBe('failed');
  });
});

describe('the send rate', () => {
  it('is green from 90%, amber from 70%, red below, neutral with nothing expected', () => {
    expect([95, 90, 75, 40, null].map(rateTone)).toEqual(['success', 'success', 'warning', 'error', 'neutral']);
  });

  it('searches by child, code, class or teacher', () => {
    const rows = [
      { name_en: 'Omar', code: 'CH-1', class_en: 'Stars', lead_en: 'Nadia' },
      { name_en: 'Laila', code: 'CH-2', class_en: 'Butterflies', lead_en: 'Sara' },
    ];
    expect(searchRows(rows, 'sara').map((r) => r.name_en)).toEqual(['Laila']);
    expect(searchRows(rows, 'ch-1').map((r) => r.name_en)).toEqual(['Omar']);
    expect(searchRows(rows, '')).toHaveLength(2);
  });
});
