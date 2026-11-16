import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { missingArabicPlurals, missingTexts, textKeysIn } from '@/test/localeKeys';

import { statusAfterSave, tellsFamilies } from './surveyFlow';

const src = path.resolve(__dirname, '../..');

describe('what saving a form does', () => {
  it('keeps a new form a draft until it is sent', () => {
    expect(statusAfterSave('new', 'draft')).toBe('draft');
    expect(tellsFamilies('draft')).toBe(false);
  });

  it('sends a new form and tells the families once', () => {
    expect(statusAfterSave('new', 'send')).toBe('active');
    expect(tellsFamilies('send')).toBe(true);
  });

  it('sends a draft the admin finished writing', () => {
    expect(statusAfterSave('draft', 'send')).toBe('active');
  });

  it('leaves a sent form sent when the admin only fixes a typo, and stays quiet', () => {
    expect(statusAfterSave('active', 'save')).toBe('active');
    expect(tellsFamilies('save')).toBe(false);
  });

  it('does not reopen a closed form by editing it', () => {
    expect(statusAfterSave('closed', 'save')).toBe('closed');
  });

  it('does not re-send an older published form that is edited', () => {
    expect(statusAfterSave('published', 'save')).toBe('published');
    expect(tellsFamilies('save')).toBe(false);
  });
});

describe('survey texts', () => {
  it('exist in English and Arabic', () => {
    expect(
      missingTexts(
        textKeysIn([
          path.join(src, 'pages/admin/AdminSurveysPage.tsx'),
          path.join(src, 'pages/parent/ParentSurveysPage.tsx'),
          path.join(src, 'components/surveys/FormBuilder.tsx'),
        ]),
      ),
    ).toEqual([]);
  });

  it('count the classes a form was sent to in every Arabic plural form', () => {
    expect(missingArabicPlurals(['survey.audienceClasses'])).toEqual([]);
  });
});
