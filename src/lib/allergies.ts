/**
 * Common childhood allergies offered in the signup form, with "other" as the escape
 * hatch for anything not listed. Values are stored; labels are shown per language.
 */
export type AllergyOption = { value: string; en: string; ar: string };

export const ALLERGY_OPTIONS: AllergyOption[] = [
  { value: 'favism', en: 'Favism', ar: 'أنيميا الفول والبقوليات' },
  { value: 'dairy', en: 'Milk / Dairy products', ar: 'الحليب ومنتجات الألبان' },
  { value: 'lactose_intolerance', en: 'Lactose intolerance', ar: 'عدم تحمل اللاكتوز' },
  { value: 'strawberries', en: 'Strawberries', ar: 'الفراولة' },
  { value: 'bananas', en: 'Bananas', ar: 'الموز' },
  { value: 'citrus', en: 'Orange / Citrus', ar: 'البرتقال والحمضيات' },
  { value: 'eggs', en: 'Eggs', ar: 'البيض' },
  { value: 'peanuts', en: 'Peanuts', ar: 'الفول السوداني' },
  { value: 'nuts', en: 'Nuts (almond, cashew, pistachio, walnut, hazelnut)', ar: 'المكسرات (لوز، كاجو، فستق، جوز، بندق)' },
  { value: 'fish', en: 'Fish', ar: 'الأسماك' },
  { value: 'wheat', en: 'Wheat', ar: 'القمح' },
  { value: 'soy', en: 'Soy', ar: 'فول الصويا' },
  { value: 'sesame', en: 'Sesame', ar: 'السمسم' },
  { value: 'honey', en: 'Honey', ar: 'العسل' },
  { value: 'other', en: 'Others — please specify', ar: 'أخرى — يُرجى التحديد' },
];

export const OTHER_ALLERGY_VALUE = 'other';

export function allergyLabel(value: string, preferArabic: boolean): string {
  const match = ALLERGY_OPTIONS.find((option) => option.value === value);
  if (!match) return value;
  return preferArabic ? match.ar : match.en;
}
