import { describe, expect, it } from 'vitest';

import { menuExtractInstructions, MENU_OUTPUT_SCHEMA, normalizeExtraction, type ExtractContext } from '../../../supabase/functions/_shared/menuExtraction.ts';

import { FOOD_ALLERGENS, MEALS } from './menu';

/** The menu file reading is shared with the menu-extract edge function; its rules are tested here. */
const week: ExtractContext = { period: 'week', startsOn: '2026-11-07', endsOn: '2026-11-13', days: ['2026-11-08', '2026-11-09'], maxDishes: 100 };

describe('reading the menu file', () => {
  it('asks only for the meals and allergens the app knows', () => {
    const dish = MENU_OUTPUT_SCHEMA.properties.dishes.items.properties;
    expect(dish.meal.enum).toEqual([...MEALS]);
    expect(dish.allergens.items.enum).toEqual([...FOOD_ALLERGENS]);
  });

  it('tells Claude the open dates with their weekdays and the limit', () => {
    const text = menuExtractInstructions(week);
    expect(text).toContain('week from 2026-11-07 to 2026-11-13');
    expect(text).toContain('- 2026-11-08 (Sunday / الأحد)');
    expect(text).toContain('at most 100 dishes');
  });

  it('keeps open days, known meals and allergens, named dishes, each once, in day and meal order', () => {
    const result = normalizeExtraction({
      dishes: [
        { day: '2026-11-09', meal: 'lunch', name: '  Rice   and chicken ', allergens: ['gluten', 'chocolate', 'gluten'] },
        { day: '2026-11-08', meal: 'snacks', name: 'Fruit', allergens: [] },
        { day: '2026-11-08', meal: 'breakfast', name: 'Labneh', allergens: ['milk'] },
        { day: '2026-11-08', meal: 'breakfast', name: 'labneh', allergens: [] }, // the same dish again
        { day: '2026-11-13', meal: 'lunch', name: 'Fish', allergens: ['fish'] }, // Friday: closed
        { day: '2026-11-08', meal: 'dinner', name: 'Soup', allergens: [] }, // no such meal
        { day: '2026-11-08', meal: 'lunch', name: '   ', allergens: [] }, // no name
        'not a dish',
      ],
      unclear: ['  Week 3 is torn  ', 7, ''],
    }, week);
    expect(result.dishes).toEqual([
      { day: '2026-11-08', meal: 'breakfast', name: 'Labneh', allergens: ['milk'] },
      { day: '2026-11-08', meal: 'snacks', name: 'Fruit', allergens: [] },
      { day: '2026-11-09', meal: 'lunch', name: 'Rice and chicken', allergens: ['gluten'] },
    ]);
    expect(result.dropped).toBe(5);
    expect(result.unclear).toEqual(['Week 3 is torn']);
  });

  it('cuts long names and stops at the period limit', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ day: '2026-11-08', meal: 'lunch', name: `Dish ${i} ${'x'.repeat(200)}`, allergens: [] }));
    const result = normalizeExtraction({ dishes: many, unclear: [] }, { ...week, maxDishes: 3 });
    expect(result.dishes).toHaveLength(3);
    expect(result.dishes[0].name.length).toBe(120);
    expect(result.dropped).toBe(2);
  });

  it('answers with nothing, not an error, when the answer is not what was asked', () => {
    expect(normalizeExtraction(null, week)).toEqual({ dishes: [], dropped: 0, unclear: [] });
    expect(normalizeExtraction({ dishes: 'x' }, week)).toEqual({ dishes: [], dropped: 0, unclear: [] });
  });
});
