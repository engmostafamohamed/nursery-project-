import { describe, expect, it } from 'vitest';

import type { MilestoneItem } from '@/hooks/useMilestones';

import { groupByMonth, isFiltered, matches, matchesExceptArea, milestoneStats, NO_MILESTONE_FILTER } from './milestones';

const m = (id: string, child: string, category: MilestoneItem['category'], day: string, shared = true) =>
  ({ id, child_id: child, category, achieved_at: day, shared_with_parent: shared, milestone_text: id }) as MilestoneItem;
const list = [
  m('walked', 'laila', 'motor_skills', '2026-10-03'),
  m('word', 'laila', 'language', '2026-11-12'),
  m('shared toys', 'omar', 'social', '2026-11-02', false),
];

describe('milestone lists', () => {
  it('filter by child, area, days and whether the family sees it', () => {
    const pick = (f: Partial<typeof NO_MILESTONE_FILTER>) => list.filter((x) => matches(x, { ...NO_MILESTONE_FILTER, ...f })).map((x) => x.id);
    expect(pick({})).toEqual(['walked', 'word', 'shared toys']);
    expect(pick({ childId: 'laila' })).toEqual(['walked', 'word']);
    expect(pick({ category: 'language' })).toEqual(['word']);
    expect(pick({ from: '2026-11-01', to: '2026-11-10' })).toEqual(['shared toys']);
    expect(pick({ shared: 'private' })).toEqual(['shared toys']);
    expect(matchesExceptArea(list[1], { ...NO_MILESTONE_FILTER, category: 'social' })).toBe(true);
    expect([isFiltered(NO_MILESTONE_FILTER), isFiltered({ ...NO_MILESTONE_FILTER, category: 'social' })]).toEqual([false, true]);
  });

  it('newest month first, newest first inside it', () => {
    expect(groupByMonth(list).map((g) => [g.month, g.items.map((x) => x.id)])).toEqual([
      ['2026-11', ['word', 'shared toys']],
      ['2026-10', ['walked']],
    ]);
  });

  it('the tiles count this month, the areas, the latest day and the shared ones', () => {
    expect(milestoneStats(list, '2026-11-14')).toEqual({ total: 3, thisMonth: 2, areas: 3, latest: '2026-11-12', shared: 2 });
    expect(milestoneStats([], '2026-11-14')).toEqual({ total: 0, thisMonth: 0, areas: 0, latest: null, shared: 0 });
  });
});
