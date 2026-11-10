import { describe, expect, it } from 'vitest';

import { alertsByDayAndChild, groupUnmatched } from './foodAlerts';
import { severityTone, type FoodConflict } from './menu';

const conflict = (patch: Partial<FoodConflict>): FoodConflict => ({
  dishId: 'd1', day: '2026-11-08', meal: 'lunch', dishName: 'Rice pudding', weekStatus: 'published',
  childId: 'c1', childNameAr: 'ليلى', childNameEn: 'Laila', classNameAr: null, classNameEn: 'Butterflies',
  allergen: 'milk', allergyName: "Cow's milk", severity: 'severe', reaction: null, treatment: null, eatsNurseryMeals: true,
  ...patch,
});

describe('food alerts', () => {
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

  it('group the allergies the menu is not checked against: largest first, each child once, worst reaction first', () => {
    const groups = groupUnmatched([
      { childId: 'a', childNameAr: '', childNameEn: 'Ayman', allergyName: 'Dust mites', severity: 'mild' },
      { childId: 'b', childNameAr: '', childNameEn: 'Azza', allergyName: 'Penicillin', severity: 'mild' },
      { childId: 'c', childNameAr: '', childNameEn: 'Bassem', allergyName: 'penicillin ', severity: 'severe' },
      { childId: 'c', childNameAr: '', childNameEn: 'Bassem', allergyName: 'Penicillin', severity: 'severe' },
    ]);
    expect(groups.map((g) => [g.name, g.children.map((c) => c.childNameEn).join(',')])).toEqual([
      ['Penicillin', 'Bassem,Azza'],
      ['Dust mites', 'Ayman'],
    ]);
  });
});
