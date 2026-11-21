/* How each state of a staff day looks, in one place, so the tiles, the pills and the charts agree. */
import type { PillTone } from '@/components/ui/DataTable';
import type { StatTone } from '@/components/ui/StatTile';

import type { DayState } from './staffAttendanceRange';

export const STATE_PILL: Record<DayState, PillTone> = {
  review: 'warning',
  still_in: 'primary',
  late: 'warning',
  on_time: 'success',
  away: 'neutral',
  missing: 'error',
};

export const STATE_ICON: Record<DayState, string> = {
  review: 'pending_actions',
  still_in: 'badge',
  late: 'more_time',
  on_time: 'task_alt',
  away: 'event_busy',
  missing: 'person_off',
};

export const STATE_TILE: Record<DayState, StatTone> = {
  review: 'warning',
  still_in: 'primary',
  late: 'warning',
  on_time: 'success',
  away: 'neutral',
  missing: 'error',
};

/** The tone for a share out of a hundred, where more is better. */
export const rateTone = (rate: number | null): StatTone =>
  rate == null ? 'neutral' : rate >= 90 ? 'success' : rate >= 75 ? 'warning' : 'error';
