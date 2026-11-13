import type { MilestoneItem } from '@/hooks/useMilestones';

import type { MilestoneDraft } from './milestonesApi';

/** A new milestone for the child (if chosen), achieved today and shared with the family. */
export function blankMilestone(childId: string, today: string): MilestoneDraft {
  return { childId, category: 'motor_skills', milestoneText: '', achievedAt: today, notes: '', photoPath: null, sharedWithParent: true };
}

/** The form's copy of a recorded milestone, to change it. */
export function draftOf(m: MilestoneItem): MilestoneDraft {
  return {
    childId: m.child_id,
    category: m.category,
    milestoneText: m.milestone_text,
    achievedAt: m.achieved_at,
    notes: m.notes ?? '',
    photoPath: m.photo_url,
    sharedWithParent: m.shared_with_parent,
  };
}

/** Which age's suggestions to offer (milestones.templates.<bucket>): under 2, 2, 3 and over. */
export function templateBucket(age: number | undefined): 'a12' | 'a23' | 'a34' {
  if (age == null) return 'a23';
  return age < 2 ? 'a12' : age < 3 ? 'a23' : 'a34';
}

/** What is missing before the form can be sent (text keys), else []. */
export function milestoneProblems(d: MilestoneDraft, today: string): string[] {
  const problems: string[] = [];
  if (!d.childId) problems.push('milestones.form.errors.child');
  if (!d.milestoneText.trim()) problems.push('milestones.form.errors.text');
  if (!d.achievedAt || d.achievedAt > today) problems.push('milestones.form.errors.date');
  return problems;
}
