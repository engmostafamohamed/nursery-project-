import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import ar from '@/locales/ar.json';
import en from '@/locales/en.json';

import {
  addDays,
  alertsByDayAndChild,
  dishIssue,
  dishWarnings,
  draftIssues,
  FOOD_ALLERGENS,
  MEALS,
  menuFilePath,
  menuFileProblem,
  openDays,
  severityTone,
  toSavePayload,
  weekdayKey,
  weekStartOf,
  type FoodConflict,
} from './menu';
import { menuErrorKey, toMenuWeek } from './menuApi';

const conflict = (patch: Partial<FoodConflict>): FoodConflict => ({
  dishId: 'd1', day: '2026-11-08', meal: 'lunch', dishName: 'Rice pudding', weekStatus: 'published',
  childId: 'c1', childNameAr: 'ليلى', childNameEn: 'Laila', classNameAr: null, classNameEn: 'Butterflies',
  allergen: 'milk', allergyName: "Cow's milk", severity: 'severe', reaction: null, treatment: null, eatsNurseryMeals: true,
  ...patch,
});

describe('the menu week', () => {
  it('runs Saturday to Friday, from any day of it', () => {
    expect(weekStartOf('2026-11-07')).toBe('2026-11-07'); // a Saturday
    expect(weekStartOf('2026-11-08')).toBe('2026-11-07'); // Sunday
    expect(weekStartOf('2026-11-13')).toBe('2026-11-07'); // Friday
    expect(weekStartOf('2026-11-14')).toBe('2026-11-14');
    expect(weekStartOf('2027-01-01')).toBe('2026-12-26'); // across the year
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(weekdayKey('2026-11-08')).toBe('sun');
  });

  it('shows the days the nursery is open, Sunday to Thursday when it has not said', () => {
    expect(openDays('2026-11-07', ['sun', 'mon', 'tue', 'wed', 'thu'])).toEqual(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12']);
    expect(openDays('2026-11-07', ['sat', 'sun'])).toEqual(['2026-11-07', '2026-11-08']);
    expect(openDays('2026-11-07', [])).toHaveLength(5);
  });
});

describe('editing dishes', () => {
  it('needs a name, not too long', () => {
    expect(dishIssue({ name: '   ' })).toBe('name_required');
    expect(dishIssue({ name: 'x'.repeat(121) })).toBe('name_too_long');
    expect(dishIssue({ name: ' Soup ' })).toBeNull();
    expect(draftIssues([
      { key: 'a', day: '2026-11-08', meal: 'lunch', name: '', allergens: [] },
      { key: 'b', day: '2026-11-08', meal: 'lunch', name: 'Soup', allergens: [] },
    ])).toEqual({ a: 'name_required' });
  });

  it('sends the dishes in day and meal order, trimmed, each allergen once', () => {
    expect(toSavePayload([
      { key: 'a', day: '2026-11-09', meal: 'breakfast', name: ' Eggs ', allergens: ['eggs', 'eggs'] },
      { key: 'b', day: '2026-11-08', meal: 'snacks', name: 'Fruit', allergens: [] },
      { key: 'c', day: '2026-11-08', meal: 'breakfast', name: 'Bread', allergens: ['gluten'] },
    ])).toEqual([
      { day: '2026-11-08', meal: 'breakfast', name: 'Bread', allergens: ['gluten'] },
      { day: '2026-11-08', meal: 'snacks', name: 'Fruit', allergens: [] },
      { day: '2026-11-09', meal: 'breakfast', name: 'Eggs', allergens: ['eggs'] },
    ]);
  });

  it('warns about the children a dish is not safe for while it is tagged, worst first, own food last', () => {
    const index = {
      milk: [
        { childId: 'own', childNameAr: '', childNameEn: 'Nour', severity: 'life_threatening', eatsNurseryMeals: false },
        { childId: 'c1', childNameAr: '', childNameEn: 'Laila', severity: 'mild', eatsNurseryMeals: true },
      ],
      eggs: [{ childId: 'c1', childNameAr: '', childNameEn: 'Laila', severity: 'severe', eatsNurseryMeals: true }],
      peanuts: [{ childId: 'c2', childNameAr: '', childNameEn: 'Adam', severity: 'severe', eatsNurseryMeals: true }],
    };
    const warnings = dishWarnings(['milk', 'eggs'], index);
    expect(warnings.map((w) => [w.childNameEn, w.allergens.join('+'), w.severity])).toEqual([
      ['Laila', 'milk+eggs', 'severe'],
      ['Nour', 'milk', 'life_threatening'],
    ]);
    expect(dishWarnings(['soy'], index)).toEqual([]);
  });
});

describe('alerts', () => {
  it('list each child once per day, worst first, families who send food last', () => {
    const days = alertsByDayAndChild([
      conflict({ childId: 'c1', meal: 'snacks', dishName: 'Cake', severity: 'mild' }),
      conflict({ childId: 'c1', meal: 'lunch', severity: 'severe' }),
      conflict({ childId: 'c2', childNameEn: 'Adam', severity: 'life_threatening', eatsNurseryMeals: false }),
      conflict({ childId: 'c3', childNameEn: 'Omar', severity: 'moderate' }),
      conflict({ childId: 'c3', childNameEn: 'Omar', day: '2026-11-09' }),
    ]);
    expect(days.map((d) => d.day)).toEqual(['2026-11-08', '2026-11-09']);
    expect(days[0].children.map((c) => [c.childNameEn, c.worstSeverity, c.items.map((i) => i.meal).join(',')])).toEqual([
      ['Laila', 'severe', 'lunch,snacks'],
      ['Omar', 'moderate', 'lunch'],
      ['Adam', 'life_threatening', 'lunch'],
    ]);
    expect(severityTone('mild')).toBe('warning');
    expect(severityTone(null)).toBe('error');
  });
});

describe('the menu file', () => {
  it('is a photo or a PDF, and a photo may be large before it is made smaller', () => {
    expect(menuFileProblem({ type: 'application/pdf', size: 5 * 1024 * 1024 })).toBeNull();
    expect(menuFileProblem({ type: 'application/pdf', size: 5 * 1024 * 1024 + 1 })).toBe('too_large');
    expect(menuFileProblem({ type: 'image/jpeg', size: 12 * 1024 * 1024 })).toBeNull();
    expect(menuFileProblem({ type: 'image/heic', size: 1000 })).toBe('invalid_type');
    expect(menuFileProblem({ type: 'text/plain', size: 10 })).toBe('invalid_type');
    expect(menuFilePath('n1', '2026-11-07', 'application/pdf', 42)).toBe('n1/2026-11-07/42.pdf');
    expect(menuFilePath('n1', '2026-11-07', 'image/webp', 42)).toBe('n1/2026-11-07/42.webp');
  });
});

describe('reading the server', () => {
  it('reads a week, its dishes, conflicts and allergy index, dropping what it does not know', () => {
    const week = toMenuWeek({
      week_start: '2026-11-07',
      working_days: ['sun', 7],
      can_edit: true,
      week: { id: 'w1', status: 'published', notes: 'Fruit daily', file_path: 'n/x.pdf', file_name: 'menu.pdf', file_type: 'application/pdf', file_size: 1000, updated_at: 'u' },
      dishes: [{ id: 'd1', day: '2026-11-08', meal: 'lunch', name: 'Rice pudding', allergens: ['milk', 'chocolate'],
                 conflicts: [{ dish_id: 'd1', child_id: 'c1', allergen: 'milk', eats_nursery_meals: false, week_status: 'published' }] }],
      allergy_index: { milk: [{ child_id: 'c1', child_name_en: 'Laila', severity: 'severe' }], unknown: [] },
    });
    expect(week.workingDays).toEqual(['sun']);
    expect(week.week).toMatchObject({ status: 'published', notes: 'Fruit daily', file: { path: 'n/x.pdf', size: 1000 } });
    expect(week.dishes[0].allergens).toEqual(['milk']);
    expect(week.dishes[0].conflicts[0]).toMatchObject({ childId: 'c1', eatsNurseryMeals: false, weekStatus: 'published' });
    expect(Object.keys(week.allergyIndex)).toEqual(['milk']);
    expect(toMenuWeek({ week: null }).week).toBeNull();
  });

  it('turns a function error into its message', () => {
    expect(menuErrorKey({ message: 'menu_week_not_empty' })).toBe('fnb.errors.menu_week_not_empty');
    expect(menuErrorKey(new Error('boom'))).toBe('fnb.errors.failed');
  });
});

describe('texts', () => {
  const lookup = (dict: unknown, key: string) =>
    key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
  const exists = (dict: unknown, key: string) => typeof lookup(dict, key) === 'string' || typeof lookup(dict, `${key}_other`) === 'string';

  const built = [
    ...FOOD_ALLERGENS.map((a) => `fnb.allergens.${a}`),
    ...MEALS.map((m) => `fnb.meals.${m}`),
    ...['life_threatening', 'severe', 'moderate', 'mild'].map((s) => `fnb.severity.${s}`),
    ...['today', 'this_week', 'next_week'].map((p) => `fnb.alerts.periods.${p}`),
    ...['name_required', 'name_too_long'].map((i) => `fnb.editor.issues.${i}`),
    ...['invalid_type', 'too_large'].map((i) => `fnb.file.errors.${i}`),
    ...['food', 'drinks', 'kitchen_supplies'].map((c) => `fnb.kitchen.categories.${c}`),
    ...['restocked', 'used', 'spoiled', 'counted'].map((k) => `fnb.kitchen.kinds.${k}`),
    ...['restock', 'take', 'count'].map((m) => `fnb.kitchen.modes.${m}`),
    ...['required', 'invalid', 'zero', 'more_than_stock'].map((q) => `fnb.kitchen.quantityIssues.${q}`),
    ...['name_required', 'name_too_long', 'unit_required', 'level_invalid'].map((q) => `fnb.kitchen.issues.${q}`),
    ...['kg', 'g', 'liter', 'piece', 'pack', 'box', 'can', 'bottle', 'dozen'].map((u) => `fnb.kitchen.units.${u}`),
    ...['name_ar_required', 'name_en_required', 'name_too_long', 'meals_required', 'price_invalid'].map((q) => `fnb.plans.issues.${q}`),
    ...['all', 'charged', 'included', 'none', 'not_billed'].map((f) => `fnb.plans.filters.${f}`),
    ...['meal_plan_invalid', 'meal_plan_not_found', 'kitchen_item_invalid', 'kitchen_item_not_found', 'kitchen_invalid_quantity', 'kitchen_not_enough'].map((c) => `fnb.errors.${c}`),
    'admin.nav.mealPlans',
    'admin.nav.kitchenStock',
    'invoice.itemKinds.meal_plan',
    ...['menu_forbidden', 'menu_invalid_dishes', 'menu_invalid_dish', 'menu_invalid_allergen', 'menu_notes_too_long', 'menu_week_empty',
        'menu_week_not_empty', 'menu_copy_source_empty', 'menu_invalid_file', 'failed'].map((c) => `fnb.errors.${c}`),
    'notificationTemplates.menu_published.title',
    'notificationTemplates.menu_published.body',
    'admin.nav.foodAlerts',
    'admin.nav.moreGroupFoodAndBeverage',
    'teacher.nav.meals',
  ];

  it.each(built)('%s exists in English and Arabic', (key) => {
    expect(exists(en, key), `en ${key}`).toBe(true);
    expect(exists(ar, key), `ar ${key}`).toBe(true);
  });

  it('every text the F&B screens name exists in English and Arabic', () => {
    const dir = path.resolve(__dirname);
    const files = [
      ...readdirSync(dir).filter((f) => f.endsWith('.tsx')).map((f) => path.join(dir, f)),
      ...['admin/AdminMealPlansPage.tsx', 'admin/AdminFoodAlertsPage.tsx', 'admin/AdminMealPricingPage.tsx', 'admin/AdminKitchenStockPage.tsx',
          'admin/AdminHealthAlertsDashboardPage.tsx', 'teacher/TeacherMealsPage.tsx', 'parent/ParentMealsPage.tsx'].map((f) =>
        path.resolve(dir, '../../pages', f),
      ),
    ];
    const keys = [...new Set(files.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1])))];
    expect(keys.length).toBeGreaterThan(40);
    const missing = keys.flatMap((key) => [...(exists(en, key) ? [] : [`en: ${key}`]), ...(exists(ar, key) ? [] : [`ar: ${key}`])]);
    expect(missing).toEqual([]);
  });

  it('the counts have every Arabic plural form', () => {
    for (const key of ['fnb.allergens.childrenCount', 'fnb.editor.notSafeFor', 'fnb.alerts.unmatchedCount', 'fnb.plans.childrenOnPlan', 'fnb.plans.childrenCount',
                       'fnb.plans.tiles.monthlyHint', 'fnb.kitchen.itemCount', 'fnb.kitchen.historyCount', 'health.dashboard.count', 'health.dashboard.bulkBody',
                       'health.dashboard.notifyShown']) {
      for (const form of ['zero', 'one', 'two', 'few', 'many', 'other']) expect(typeof lookup(ar, `${key}_${form}`), `${key}_${form}`).toBe('string');
    }
  });
});
