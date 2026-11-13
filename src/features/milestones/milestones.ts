import type { MilestoneCategory, MilestoneItem } from '@/hooks/useMilestones';
import type { PillTone } from '@/lib/tones';

/** The six areas a milestone belongs to, each with its icon and colour on every screen. */
export const MILESTONE_CATEGORIES: readonly MilestoneCategory[] = ['motor_skills', 'social', 'cognitive', 'language', 'self_care', 'creative'];

export const MILESTONE_LOOK: Record<MilestoneCategory, { icon: string; tone: PillTone }> = {
  motor_skills: { icon: 'directions_run', tone: 'primary' },
  social: { icon: 'diversity_3', tone: 'success' },
  cognitive: { icon: 'psychology', tone: 'warning' },
  language: { icon: 'record_voice_over', tone: 'primary' },
  self_care: { icon: 'self_improvement', tone: 'success' },
  creative: { icon: 'palette', tone: 'error' },
};

export type MilestoneFilter = {
  childId: string;
  category: MilestoneCategory | 'all';
  from: string;
  to: string;
  /** The teacher's view only: all, the ones the family sees, or the ones kept from it. */
  shared: 'all' | 'shared' | 'private';
};

export const NO_MILESTONE_FILTER: MilestoneFilter = { childId: '', category: 'all', from: '', to: '', shared: 'all' };

export const isFiltered = (f: MilestoneFilter) =>
  Boolean(f.childId || f.from || f.to) || f.category !== 'all' || f.shared !== 'all';

/** The milestones matching everything but the area (so the area chips can count each). */
export function matchesExceptArea(m: MilestoneItem, f: MilestoneFilter): boolean {
  if (f.childId && m.child_id !== f.childId) return false;
  if (f.from && m.achieved_at < f.from) return false;
  if (f.to && m.achieved_at > f.to) return false;
  if (f.shared === 'shared' && !m.shared_with_parent) return false;
  if (f.shared === 'private' && m.shared_with_parent) return false;
  return true;
}

export const matches = (m: MilestoneItem, f: MilestoneFilter) => matchesExceptArea(m, f) && (f.category === 'all' || m.category === f.category);

/** Newest first, in one group per month ("2026-11"). */
export function groupByMonth(items: MilestoneItem[]): { month: string; items: MilestoneItem[] }[] {
  const groups = new Map<string, MilestoneItem[]>();
  for (const m of [...items].sort((a, b) => b.achieved_at.localeCompare(a.achieved_at))) {
    const month = m.achieved_at.slice(0, 7);
    groups.set(month, [...(groups.get(month) ?? []), m]);
  }
  return [...groups].map(([month, list]) => ({ month, items: list }));
}

/** The tiles: how many, how many this month, how many areas, and the latest day. */
export function milestoneStats(items: MilestoneItem[], today: string) {
  const month = today.slice(0, 7);
  return {
    total: items.length,
    thisMonth: items.filter((m) => m.achieved_at.startsWith(month)).length,
    areas: new Set(items.map((m) => m.category)).size,
    latest: items.reduce<string | null>((latest, m) => (!latest || m.achieved_at > latest ? m.achieved_at : latest), null),
    shared: items.filter((m) => m.shared_with_parent).length,
  };
}
