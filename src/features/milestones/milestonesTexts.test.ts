import path from 'node:path';

import { describe, expect, it } from 'vitest';

import ar from '@/locales/ar.json';
import en from '@/locales/en.json';
import { notificationText } from '@/lib/notificationText';
import { missingArabicPlurals, missingTexts, textKeysIn } from '@/test/localeKeys';

import { MILESTONE_CATEGORIES } from './milestones';
import { MILESTONE_ERROR_CODES } from './milestonesApi';

const src = path.resolve(__dirname, '../..');

describe('milestone texts', () => {
  it('every text the screens name exists in English and Arabic', () => {
    const keys = textKeysIn([
      ...['MilestoneCard.tsx', 'MilestoneFilters.tsx', 'MilestoneMonths.tsx', 'milestoneDraft.ts'].map((f) => path.join(__dirname, f)),
      path.join(src, 'components/teacher/MilestoneForm.tsx'),
      path.join(src, 'pages/parent/ParentMilestonesPage.tsx'),
      path.join(src, 'pages/teacher/TeacherMilestonesListPage.tsx'),
      path.join(src, 'pages/teacher/TeacherMilestoneRecordPage.tsx'),
    ]);
    expect(keys.length).toBeGreaterThan(50);
    expect(missingTexts(keys)).toEqual([]);
  });

  it('and the ones built at run time', () => {
    expect(
      missingTexts([
        ...MILESTONE_CATEGORIES.flatMap((c) => [`milestones.categories.${c}`, `milestones.placeholders.${c}`]),
        ...[...MILESTONE_ERROR_CODES.map((c) => c.replace('milestone_', '')), 'network', 'failed'].map((c) => `milestones.errors.${c}`),
        'notificationTemplates.milestone_shared.title',
        'notificationTemplates.milestone_shared.body',
      ]),
    ).toEqual([]);
    for (const bucket of ['a12', 'a23', 'a34'] as const) {
      expect(en.milestones.templates[bucket].length).toBeGreaterThan(3);
      expect(ar.milestones.templates[bucket].length).toBe(en.milestones.templates[bucket].length);
    }
  });

  it('the count has every Arabic plural form', () => {
    expect(missingArabicPlurals(['milestones.parent.count'])).toEqual([]);
  });

  it('the family reads the child and the milestone in its language', () => {
    const row = { template_key: 'milestone_shared', template_params: { child: { ar: 'ليلى', en: 'Laila' }, milestone: 'Said her first sentence' } };
    expect(notificationText(row, 'en').body).toBe('New milestone for Laila: Said her first sentence');
    expect(notificationText(row, 'ar').body).toContain('ليلى');
  });
});
