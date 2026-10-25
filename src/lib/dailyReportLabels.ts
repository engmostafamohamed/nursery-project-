import type { TFunction } from 'i18next';

import type { DayAttendance, Question, ReportStage } from './dailyReport';
import type { PillTone } from './tones';

// The words for a daily report's questions, where a report stands and whether the child came.

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
