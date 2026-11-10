import { describe, expect, it } from 'vitest';

import { toMenu } from './menuApi';
import { menuErrorKey } from './menuErrors';

describe('reading a menu from the server', () => {
  it('reads the period, its dishes, conflicts and allergy index, dropping what it does not know', () => {
    const menu = toMenu({
      period: 'month',
      starts_on: '2026-11-01',
      ends_on: '2026-11-30',
      working_days: ['sun', 7],
      can_edit: true,
      menu: { id: 'w1', status: 'published', notes: 'Fruit daily', file_path: 'n/x.pdf', file_name: 'menu.pdf', file_type: 'application/pdf', file_size: 1000, updated_at: 'u' },
      dishes: [{ id: 'd1', day: '2026-11-08', meal: 'lunch', name: 'Rice pudding', allergens: ['milk', 'chocolate'],
                 conflicts: [{ dish_id: 'd1', child_id: 'c1', allergen: 'milk', eats_nursery_meals: false, week_status: 'published' }] }],
      allergy_index: { milk: [{ child_id: 'c1', child_name_en: 'Laila', severity: 'severe' }], unknown: [] },
    });
    expect([menu.period, menu.startsOn, menu.endsOn, menu.canEdit]).toEqual(['month', '2026-11-01', '2026-11-30', true]);
    expect(menu.workingDays).toEqual(['sun']);
    expect(menu.info).toMatchObject({ status: 'published', notes: 'Fruit daily', file: { path: 'n/x.pdf', size: 1000 } });
    expect(menu.dishes[0].allergens).toEqual(['milk']);
    expect(menu.dishes[0].conflicts[0]).toMatchObject({ childId: 'c1', eatsNurseryMeals: false, weekStatus: 'published' });
    expect(Object.keys(menu.allergyIndex)).toEqual(['milk']);
  });

  it('has no menu info when the period has no menu, and treats an unknown period as a week', () => {
    expect(toMenu({ menu: null }).info).toBeNull();
    expect(toMenu({ period: 'year' }).period).toBe('week');
  });
});

describe('menu errors', () => {
  it('turn a function error into its message, the longest code first', () => {
    expect(menuErrorKey({ message: 'menu_not_empty' })).toBe('fnb.errors.menu_not_empty');
    expect(menuErrorKey({ message: 'menu_invalid_dishes' })).toBe('fnb.errors.menu_invalid_dishes');
    expect(menuErrorKey({ message: 'menu_invalid_dish' })).toBe('fnb.errors.menu_invalid_dish');
    expect(menuErrorKey(new Error('menu_extract_refused'))).toBe('fnb.errors.menu_extract_refused');
    expect(menuErrorKey(new Error('boom'))).toBe('fnb.errors.failed');
  });
});
