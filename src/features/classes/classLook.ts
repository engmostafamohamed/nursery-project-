import type { DayAttendance, ReportStage } from '@/lib/dailyReport';
import type { PillTone } from '@/lib/tones';

import type { DutyState, MessageStatus } from './classProfile';

type Look = { tone: PillTone; icon: string };

/** One look per state of a child's day, the same in the table, the cards and the tiles. */
export const ATTENDANCE_LOOK: Record<DayAttendance, Look> = {
  partial: { tone: 'success', icon: 'how_to_reg' },
  present: { tone: 'primary', icon: 'directions_walk' },
  absent: { tone: 'warning', icon: 'person_off' },
  excused: { tone: 'neutral', icon: 'event_busy' },
  off: { tone: 'neutral', icon: 'weekend' },
  not_enrolled: { tone: 'neutral', icon: 'event_upcoming' },
};

export const REPORT_LOOK: Record<ReportStage, Look> = {
  sent: { tone: 'success', icon: 'mark_email_read' },
  ready: { tone: 'primary', icon: 'task_alt' },
  in_progress: { tone: 'primary', icon: 'edit_note' },
  not_started: { tone: 'warning', icon: 'pending_actions' },
  not_expected: { tone: 'neutral', icon: 'remove' },
};

export const DUTY_LOOK: Record<DutyState, Look> = {
  on_duty: { tone: 'success', icon: 'check_circle' },
  covering: { tone: 'primary', icon: 'swap_horiz' },
  away: { tone: 'warning', icon: 'event_busy' },
  standby: { tone: 'neutral', icon: 'schedule' },
  inactive: { tone: 'error', icon: 'block' },
};

export const MESSAGE_STATUS_TONE: Record<MessageStatus, PillTone> = {
  sent: 'success',
  scheduled: 'primary',
  draft: 'neutral',
  failed: 'error',
};
