import type { TFunction } from 'i18next';

import { splitMinutes, type DayAttendance, type MealAmount, type Mood, type NapQuality, type Question, type ReportStage } from './dailyReport';
import type { PillTone } from './tones';

// The words (and emoji and icons) for a daily report's answers and questions, where a report stands
// and whether the child came.

export function mealAmountName(t: TFunction, amount: MealAmount): string {
  switch (amount) {
    case 'none':
      return t('reports.daily.options.mealAmount.none');
    case 'quarter':
      return t('reports.daily.options.mealAmount.quarter');
    case 'half':
      return t('reports.daily.options.mealAmount.half');
    case 'three_quarters':
      return t('reports.daily.options.mealAmount.three_quarters');
    default:
      return t('reports.daily.options.mealAmount.all');
  }
}

export function napQualityName(t: TFunction, quality: NapQuality): string {
  if (quality === 'good') return t('reports.daily.options.napQuality.good');
  if (quality === 'ok') return t('reports.daily.options.napQuality.ok');
  return t('reports.daily.options.napQuality.restless');
}

export function moodName(t: TFunction, mood: Mood): string {
  switch (mood) {
    case 'happy':
      return t('reports.daily.options.mood.happy');
    case 'content':
      return t('reports.daily.options.mood.content');
    case 'fussy':
      return t('reports.daily.options.mood.fussy');
    default:
      return t('reports.daily.options.mood.cranky');
  }
}

export const MOOD_EMOJI: Record<Mood, string> = { happy: '😊', content: '😌', fussy: '😣', cranky: '😤' };

export const MOOD_TONE: Record<Mood, PillTone> = { happy: 'success', content: 'primary', fussy: 'warning', cranky: 'error' };

/** An emoji per activity, for its 3D tile; one not in the list gets the "other" star. */
export const ACTIVITY_EMOJI: Record<string, string> = {
  art: '🎨',
  outdoor: '🌳',
  reading: '📚',
  music: '🎵',
  circle_time: '🤝',
  story_time: '📖',
  sensory_play: '🧩',
  free_play: '🧸',
  other: '⭐',
};

/** The nap answer's 3D ball: slept, or stayed awake. */
export const NAP_EMOJI = { slept: '😴', awake: '☀️', night: '🌙' } as const;

/** The toilet question's ball. */
export const TOILET_EMOJI = '🚼';

/** "2 h 30 min", "45 min", "1 h" — in the reader's language. */
export function napDurationText(t: TFunction, minutes: number): string {
  const { hours, minutes: rest } = splitMinutes(minutes);
  const h = hours ? t('dailyReport.sheet.hours', { count: hours }) : '';
  const m = rest ? t('dailyReport.sheet.minutes', { count: rest }) : '';
  return h && m ? t('dailyReport.sheet.hoursAndMinutes', { hours: h, minutes: m }) : h || m;
}

export function questionName(t: TFunction, question: Question): string {
  switch (question) {
    case 'breakfast':
      return t('dailyReport.questions.breakfast');
    case 'lunch':
      return t('dailyReport.questions.lunch');
    case 'snacks':
      return t('dailyReport.questions.snacks');
    case 'nap':
      return t('dailyReport.questions.nap');
    case 'mood':
      return t('dailyReport.questions.mood');
    case 'toilet':
      return t('dailyReport.questions.toilet');
    default:
      return t('dailyReport.questions.activities');
  }
}

export function stageName(t: TFunction, stage: ReportStage): string {
  switch (stage) {
    case 'sent':
      return t('dailyReport.stage.sent');
    case 'ready':
      return t('dailyReport.stage.ready');
    case 'in_progress':
      return t('dailyReport.stage.in_progress');
    case 'not_started':
      return t('dailyReport.stage.not_started');
    default:
      return t('dailyReport.stage.not_expected');
  }
}

export const STAGE_TONE: Record<ReportStage, PillTone> = {
  sent: 'success',
  ready: 'primary',
  in_progress: 'warning',
  not_started: 'error',
  not_expected: 'neutral',
};

export const STAGE_ICON: Record<ReportStage, string> = {
  sent: 'mark_email_read',
  ready: 'task_alt',
  in_progress: 'edit_note',
  not_started: 'pending_actions',
  not_expected: 'remove',
};

export function attendanceName(t: TFunction, attendance: DayAttendance): string {
  switch (attendance) {
    case 'present':
      return t('dailyReport.attendance.present');
    case 'partial':
      return t('dailyReport.attendance.partial');
    case 'absent':
      return t('dailyReport.attendance.absent');
    case 'excused':
      return t('dailyReport.attendance.excused');
    case 'off':
      return t('dailyReport.attendance.off');
    default:
      return t('dailyReport.attendance.not_enrolled');
  }
}

export const ATTENDANCE_TONE: Record<DayAttendance, PillTone> = {
  present: 'success',
  partial: 'primary',
  absent: 'error',
  excused: 'warning',
  off: 'neutral',
  not_enrolled: 'neutral',
};

/** "Breakfast, Nap and Toilet / diaper". */
export function questionList(t: TFunction, questions: Question[], lang: string): string {
  const names = questions.map((q) => questionName(t, q));
  try {
    return new Intl.ListFormat(lang.startsWith('ar') ? 'ar' : 'en', { style: 'long', type: 'conjunction' }).format(names);
  } catch {
    return names.join(', ');
  }
}
