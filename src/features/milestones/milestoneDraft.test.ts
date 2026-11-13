import { describe, expect, it } from 'vitest';

import type { MilestoneItem } from '@/hooks/useMilestones';

import { blankMilestone, draftOf, milestoneProblems, templateBucket } from './milestoneDraft';

describe('milestone drafts', () => {
  it('a new one is for the chosen child, today, shared', () => {
    expect(blankMilestone('c1', '2026-11-14')).toMatchObject({ childId: 'c1', achievedAt: '2026-11-14', sharedWithParent: true, photoPath: null });
  });

  it('a recorded one is copied with its photo kept', () => {
    const m = { id: 'm1', child_id: 'c1', category: 'language', milestone_text: 'First sentence', achieved_at: '2026-11-10', notes: null, photo_url: 'n/milestones/c1/1.jpg', shared_with_parent: false } as MilestoneItem;
    expect(draftOf(m)).toEqual({ childId: 'c1', category: 'language', milestoneText: 'First sentence', achievedAt: '2026-11-10', notes: '', photoPath: 'n/milestones/c1/1.jpg', sharedWithParent: false });
  });

  it('suggestions follow the child\'s age', () => {
    expect([templateBucket(1), templateBucket(2), templateBucket(3), templateBucket(5), templateBucket(undefined)]).toEqual(['a12', 'a23', 'a34', 'a34', 'a23']);
  });

  it('the child, the text and a day not to come are needed', () => {
    const d = blankMilestone('', '2026-11-15');
    expect(milestoneProblems(d, '2026-11-14')).toEqual(['milestones.form.errors.child', 'milestones.form.errors.text', 'milestones.form.errors.date']);
    expect(milestoneProblems({ ...d, childId: 'c1', milestoneText: 'Hopped', achievedAt: '2026-11-14' }, '2026-11-14')).toEqual([]);
  });
});
