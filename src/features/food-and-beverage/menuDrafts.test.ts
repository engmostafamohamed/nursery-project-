import { describe, expect, it } from 'vitest';

import { dishIssue, dishWarnings, draftIssues, toImportedDrafts, toSavePayload } from './menuDrafts';

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

  it('turns dishes read from the menu file into drafts, each with its own key', () => {
    expect(toImportedDrafts([
      { day: '2026-11-08', meal: 'lunch', name: 'Rice', allergens: [] },
      { day: '2026-11-08', meal: 'snacks', name: 'Cake', allergens: ['milk', 'eggs'] },
    ], 'f')).toEqual([
      { key: 'f-0', day: '2026-11-08', meal: 'lunch', name: 'Rice', allergens: [] },
      { key: 'f-1', day: '2026-11-08', meal: 'snacks', name: 'Cake', allergens: ['milk', 'eggs'] },
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
    expect(dishWarnings(['milk', 'eggs'], index).map((w) => [w.childNameEn, w.allergens.join('+'), w.severity])).toEqual([
      ['Laila', 'milk+eggs', 'severe'],
      ['Nour', 'milk', 'life_threatening'],
    ]);
    expect(dishWarnings(['soy'], index)).toEqual([]);
  });
});
