import { supabase } from '@/lib/supabase';

export type MealAmount = 'none' | 'some' | 'all';
export type NapQuality = 'good' | 'ok' | 'restless';
export type MoodType = 'happy' | 'content' | 'fussy' | 'cranky';
export type DailyReportStatus = 'draft' | 'published';

export type DailyReportFormData = {
  childId: string;
  reportDate: string;
  meals: {
    breakfast: { amount: MealAmount; notes: string };
    lunch: { amount: MealAmount; notes: string };
    snacks: { amount: MealAmount; notes: string };
  };
  nap: {
    napped: boolean;
    durationMinutes: number | null;
    quality: NapQuality;
    notes: string;
  };
  mood: {
    mood: MoodType;
    notes: string;
  };
  toilet: {
    changeCount: number;
    notes: string;
  };
  activities: {
    tags: string[];
    freeText: string;
    notes: string;
  };
  feeding: {
    bottleSessions: { time: string; amountMl: number }[];
    nursingCount: number;
    nursingDurationMinutes: number;
    solidFoods: boolean;
    notes: string;
  };
  specialNotes: string;
};

export const ACTIVITY_TAG_KEYS = [
  'art',
  'outdoor',
  'reading',
  'music',
  'circle_time',
  'story_time',
  'sensory_play',
  'free_play',
  'other',
] as const;

export const defaultDailyReportForm: DailyReportFormData = {
  childId: '',
  reportDate: new Date().toISOString().slice(0, 10),
  meals: {
    breakfast: { amount: 'some', notes: '' },
    lunch: { amount: 'some', notes: '' },
    snacks: { amount: 'some', notes: '' },
  },
  nap: { napped: true, durationMinutes: null, quality: 'good', notes: '' },
  mood: { mood: 'happy', notes: '' },
  toilet: { changeCount: 0, notes: '' },
  activities: { tags: [], freeText: '', notes: '' },
  feeding: { bottleSessions: [], nursingCount: 0, nursingDurationMinutes: 0, solidFoods: false, notes: '' },
  specialNotes: '',
};

function mapLegacyMealAmount(raw: unknown): MealAmount {
  const o = raw as Record<string, unknown> | null;
  const v = o?.amount ?? o?.appetite ?? raw;
  const s = String(v ?? '');
  if (s === 'none' || s === 'some' || s === 'all') return s;
  if (s === 'ate_all') return 'all';
  if (s === 'did_not_eat') return 'none';
  return 'some';
}

function mapLegacyNapQuality(v: unknown): NapQuality {
  const s = String(v ?? '');
  if (s === 'good' || s === 'ok' || s === 'restless') return s;
  if (s === 'slept_well') return 'good';
  if (s === 'restless') return 'restless';
  return 'ok';
}

function mapLegacyMood(v: unknown): MoodType {
  const s = String(v ?? '');
  if (s === 'happy' || s === 'content' || s === 'fussy' || s === 'cranky') return s;
  if (s === 'neutral') return 'content';
  if (s === 'sad') return 'fussy';
  if (s === 'tired') return 'content';
  if (s === 'upset') return 'cranky';
  return 'happy';
}

function mealSlot(meals: Record<string, unknown>, key: 'breakfast' | 'lunch' | 'snacks') {
  const slot = meals[key] as Record<string, unknown> | undefined;
  return {
    amount: mapLegacyMealAmount(slot),
    notes: String(slot?.notes ?? ''),
  };
}

export function hydrateDailyReportFormFromRow(
  row: Record<string, unknown> | null,
  prev: DailyReportFormData,
): DailyReportFormData {
  if (!row) return prev;
  const meals = (row.meals_json as Record<string, unknown> | null) ?? {};
  const nap = (row.nap_json as Record<string, unknown> | null) ?? {};
  const mood = (row.mood_json as Record<string, unknown> | null) ?? {};
  const toilet = (row.toilet_json as Record<string, unknown> | null) ?? {};
  const activities = (row.activities_json as Record<string, unknown> | null) ?? {};
  const feeding = (row.feeding_json as Record<string, unknown> | null) ?? {};

  const tagsRaw = activities.tags;
  const participated = activities.participated_in;
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map(String)
    : Array.isArray(participated)
      ? participated.map(String)
      : [];

  const bottleSessionsRaw = feeding.bottle_sessions;
  let bottleSessions: { time: string; amountMl: number }[] = [];
  if (Array.isArray(bottleSessionsRaw)) {
    bottleSessions = bottleSessionsRaw.map((x) => {
      const b = x as Record<string, unknown>;
      return { time: String(b.time ?? ''), amountMl: Number(b.amount_ml ?? b.amountMl ?? 0) };
    });
  } else if (Number(feeding.bottle_feeds_count ?? 0) > 0) {
    const n = Number(feeding.bottle_feeds_count ?? 0);
    const ml = Number(feeding.bottle_amount_ml ?? 0);
    bottleSessions = Array.from({ length: Math.min(n, 8) }, () => ({ time: '', amountMl: ml }));
  }

  const changeCount =
    toilet.change_count != null
      ? Number(toilet.change_count)
      : Number(toilet.diaper_changes ?? 0);

  return {
    ...prev,
    childId: String(row.child_id ?? prev.childId),
    reportDate: String(row.report_date ?? prev.reportDate),
    meals: {
      breakfast: mealSlot(meals, 'breakfast'),
      lunch: mealSlot(meals, 'lunch'),
      snacks: mealSlot(meals, 'snacks'),
    },
    nap: {
      napped: Boolean(nap.napped ?? true),
      durationMinutes:
        nap.duration_minutes != null && nap.duration_minutes !== ''
          ? Number(nap.duration_minutes)
          : null,
      quality: mapLegacyNapQuality(nap.quality),
      notes: String(nap.notes ?? ''),
    },
    mood: {
      mood: mapLegacyMood(mood.mood),
      notes: String(mood.notes ?? ''),
    },
    toilet: {
      changeCount,
      notes: String(toilet.notes ?? ''),
    },
    activities: {
      tags: [...new Set(tags)],
      freeText: String(activities.free_text ?? activities.other_activity ?? ''),
      notes: String(activities.notes ?? ''),
    },
    feeding: {
      bottleSessions,
      nursingCount: Number(feeding.nursing_count ?? 0),
      nursingDurationMinutes: Number(feeding.nursing_duration_minutes ?? 0),
      solidFoods: Boolean(feeding.solid_foods ?? false),
      notes: String(feeding.notes ?? ''),
    },
    specialNotes: String(row.special_notes ?? ''),
  };
}

export async function loadDailyReport(childId: string, reportDate: string) {
  const res = await supabase
    .from('daily_reports')
    .select('*')
    .eq('child_id', childId)
    .eq('report_date', reportDate)
    .maybeSingle();
  if (res.error) throw res.error;
  return res.data as Record<string, unknown> | null;
}

export async function copyYesterdayReport(childId: string, reportDate: string) {
  const day = new Date(reportDate);
  day.setDate(day.getDate() - 1);
  const y = day.toISOString().slice(0, 10);
  return loadDailyReport(childId, y);
}
