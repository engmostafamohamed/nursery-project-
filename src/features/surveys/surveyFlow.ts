import type { SurveyStatus } from '@/types/survey';

/** What the admin meant by saving: keep it a draft, change a sent form, or send it out. */
export type SaveIntent = 'draft' | 'save' | 'send';

/** The status a form carries after this save. Only sending makes it active. */
export function statusAfterSave(current: SurveyStatus | 'new', intent: SaveIntent): SurveyStatus {
  if (intent === 'send') return 'active';
  if (intent === 'draft' || current === 'new') return 'draft';
  return current;
}

/** Families are told once, when the form is sent — never when it is saved or corrected. */
export function tellsFamilies(intent: SaveIntent): boolean {
  return intent === 'send';
}
