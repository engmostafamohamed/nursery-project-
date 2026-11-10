import { readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { missingArabicPlurals, missingTexts, textKeysIn } from '@/test/localeKeys';

import { FOOD_ALLERGENS, MEALS } from './menu';
import { MENU_ERROR_CODES } from './menuErrors';
import { MENU_PERIODS } from './menuPeriod';

/** Every F&B text, in English and Arabic, including the ones built from a value at run time. */

const built = [
  ...FOOD_ALLERGENS.map((a) => `fnb.allergens.${a}`),
  ...MEALS.map((m) => `fnb.meals.${m}`),
  ...['life_threatening', 'severe', 'moderate', 'mild'].map((s) => `fnb.severity.${s}`),
  ...['today', 'this_week', 'next_week'].map((p) => `fnb.alerts.periods.${p}`),
  ...['name_required', 'name_too_long'].map((i) => `fnb.editor.issues.${i}`),
  ...['invalid_type', 'too_large'].map((i) => `fnb.file.errors.${i}`),
  ...MENU_PERIODS.flatMap((p) => ['this', 'next', 'last', 'previous', 'following', 'backToThis', 'copyLast'].map((k) => `fnb.period.${p}.${k}`)),
  ...[...MENU_ERROR_CODES, 'network', 'failed'].map((c) => `fnb.errors.${c}`),
  ...['food', 'drinks', 'kitchen_supplies'].map((c) => `fnb.kitchen.categories.${c}`),
  ...['restocked', 'used', 'spoiled', 'counted'].map((k) => `fnb.kitchen.kinds.${k}`),
  ...['restock', 'take', 'count'].map((m) => `fnb.kitchen.modes.${m}`),
  ...['required', 'invalid', 'zero', 'more_than_stock'].map((q) => `fnb.kitchen.quantityIssues.${q}`),
  ...['name_required', 'name_too_long', 'unit_required', 'level_invalid'].map((q) => `fnb.kitchen.issues.${q}`),
  ...['kg', 'g', 'liter', 'piece', 'pack', 'box', 'can', 'bottle', 'dozen'].map((u) => `fnb.kitchen.units.${u}`),
  ...['name_ar_required', 'name_en_required', 'name_too_long', 'meals_required', 'price_invalid'].map((q) => `fnb.plans.issues.${q}`),
  ...['all', 'charged', 'included', 'none', 'not_billed'].map((f) => `fnb.plans.filters.${f}`),
  ...['meal_plan_invalid', 'meal_plan_not_found', 'kitchen_item_invalid', 'kitchen_item_not_found', 'kitchen_invalid_quantity', 'kitchen_not_enough'].map((c) => `fnb.errors.${c}`),
  ...['menu_published', 'menu_published_month'].flatMap((k) => [`notificationTemplates.${k}.title`, `notificationTemplates.${k}.body`]),
  'admin.nav.mealPlans',
  'admin.nav.kitchenStock',
  'admin.nav.foodAlerts',
  'admin.nav.moreGroupFoodAndBeverage',
  'invoice.itemKinds.meal_plan',
  'teacher.nav.meals',
];

describe('F&B texts', () => {
  it('built from a value at run time, exist in English and Arabic', () => {
    expect(missingTexts(built)).toEqual([]);
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
    const keys = textKeysIn(files);
    expect(keys.length).toBeGreaterThan(40);
    expect(missingTexts(keys)).toEqual([]);
  });

  it('the counts have every Arabic plural form', () => {
    expect(missingArabicPlurals([
      'fnb.allergens.childrenCount', 'fnb.editor.notSafeFor', 'fnb.alerts.unmatchedCount', 'fnb.plans.childrenOnPlan', 'fnb.plans.childrenCount',
      'fnb.plans.tiles.monthlyHint', 'fnb.kitchen.itemCount', 'fnb.kitchen.historyCount', 'health.dashboard.count', 'health.dashboard.bulkBody',
      'health.dashboard.notifyShown', 'fnb.extract.replaceBody', 'fnb.extract.done', 'fnb.extract.review', 'fnb.extract.dropped',
    ])).toEqual([]);
  });
});
