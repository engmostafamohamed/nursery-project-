// The nursery's own texts above the packages: read from settings or the sign-up options, shown in
// the reader's language, and the standard text when the nursery wrote none.
import { describe, expect, it } from 'vitest';

import {
  EMPTY_PARENT_PACKAGE_TEXTS,
  parentPackageTextsFromSettings,
  parseParentPackageTexts,
  textFor,
} from './parentPackageTexts';

describe('parent package texts', () => {
  it('reads the settings row, trimming and treating blanks as not set', () => {
    const texts = parentPackageTextsFromSettings({
      parent_payment_intro_ar: '  ادفع مرة واحدة  ',
      parent_payment_intro_en: '   ',
      parent_tuition_intro_en: 'Pick a plan',
      parent_extra_hours_intro_ar: null,
    });
    expect(texts.paymentIntro).toEqual({ ar: 'ادفع مرة واحدة', en: null });
    expect(texts.tuitionIntro).toEqual({ ar: null, en: 'Pick a plan' });
    expect(texts.extraHoursIntro).toEqual({ ar: null, en: null });
    expect(parentPackageTextsFromSettings(null)).toEqual(EMPTY_PARENT_PACKAGE_TEXTS);
  });

  it('reads the sign-up options, and survives an older function that does not send them', () => {
    expect(parseParentPackageTexts({ extra_hours_intro: { ar: 'باقات التأخير', en: 'Late packs' } }).extraHoursIntro).toEqual({
      ar: 'باقات التأخير',
      en: 'Late packs',
    });
    expect(parseParentPackageTexts(undefined)).toEqual(EMPTY_PARENT_PACKAGE_TEXTS);
  });

  it("shows only the reader's language, never the other one", () => {
    const text = { ar: 'نص عربي', en: null };
    expect(textFor(text, true)).toBe('نص عربي');
    expect(textFor(text, false)).toBeNull();
  });
});
