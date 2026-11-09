import type { AbsenceReason, AbsenceState, CoverStatus } from './staffAbsence';

/** One icon per reason and one look per state, the same on every screen. */
export const REASON_ICON: Record<AbsenceReason, string> = {
  sick: 'sick',
  personal: 'person',
  vacation: 'beach_access',
  training: 'school',
  other: 'more_horiz',
};

export const STATE_TONE: Record<AbsenceState, 'primary' | 'warning' | 'neutral'> = {
  today: 'warning',
  upcoming: 'primary',
  past: 'neutral',
  cancelled: 'neutral',
};

export const COVER_LOOK: Record<CoverStatus, { tone: 'error' | 'warning' | 'neutral' | 'success'; icon: string }> = {
  uncovered: { tone: 'error', icon: 'person_off' },
  covered: { tone: 'warning', icon: 'swap_horiz' },
  no_lead: { tone: 'neutral', icon: 'help' },
  normal: { tone: 'success', icon: 'check_circle' },
};
