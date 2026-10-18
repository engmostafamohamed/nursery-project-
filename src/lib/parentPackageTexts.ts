// The nursery's own texts above the packages parents choose from (nursery_settings
// parent_*_intro_ar / _en). An empty text means the app's standard text is shown.

export type BilingualText = { ar: string | null; en: string | null };

export type ParentPackageTexts = {
  /** Under the payment section title. */
  paymentIntro: BilingualText;
  /** Above the tuition plans. */
  tuitionIntro: BilingualText;
  /** Above the extra-hours packages. */
  extraHoursIntro: BilingualText;
};

export const PARENT_TEXT_MAX_LENGTH = 500;

const clean = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

const bilingual = (ar: unknown, en: unknown): BilingualText => ({ ar: clean(ar), en: clean(en) });

export const EMPTY_PARENT_PACKAGE_TEXTS: ParentPackageTexts = {
  paymentIntro: { ar: null, en: null },
  tuitionIntro: { ar: null, en: null },
  extraHoursIntro: { ar: null, en: null },
};

/**
 * The text in the reader's language, or null to show the standard text. The other language is not
 * used instead, so a page in English never shows an Arabic paragraph (and the reverse).
 */
export function textFor(text: BilingualText, isAr: boolean): string | null {
  return isAr ? text.ar : text.en;
}

/** From a nursery_settings row (the logged-in parent and the admin read it directly). */
export function parentPackageTextsFromSettings(row: Record<string, unknown> | null | undefined): ParentPackageTexts {
  if (!row) return EMPTY_PARENT_PACKAGE_TEXTS;
  return {
    paymentIntro: bilingual(row.parent_payment_intro_ar, row.parent_payment_intro_en),
    tuitionIntro: bilingual(row.parent_tuition_intro_ar, row.parent_tuition_intro_en),
    extraHoursIntro: bilingual(row.parent_extra_hours_intro_ar, row.parent_extra_hours_intro_en),
  };
}

/** From the sign-up options (`parent_texts`), which a parent without an account receives. */
export function parseParentPackageTexts(raw: unknown): ParentPackageTexts {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, { ar?: unknown; en?: unknown } | undefined>;
  return {
    paymentIntro: bilingual(obj.payment_intro?.ar, obj.payment_intro?.en),
    tuitionIntro: bilingual(obj.tuition_intro?.ar, obj.tuition_intro?.en),
    extraHoursIntro: bilingual(obj.extra_hours_intro?.ar, obj.extra_hours_intro?.en),
  };
}
