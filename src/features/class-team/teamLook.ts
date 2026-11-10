import type { TeamStatus } from '@/lib/classTeam';
import type { PillTone } from '@/lib/tones';

/** One look per team status, the same in the Teams table, its dialog and a class's edit page. */
export const TEAM_STATUS_LOOK: Record<TeamStatus, { tone: PillTone; icon: string }> = {
  no_lead: { tone: 'error', icon: 'person_off' },
  incomplete: { tone: 'warning', icon: 'group_remove' },
  complete: { tone: 'success', icon: 'check_circle' },
};

export const CHANGE_ICON = { assigned: 'person_add', changed: 'swap_horiz', removed: 'person_remove' } as const;
