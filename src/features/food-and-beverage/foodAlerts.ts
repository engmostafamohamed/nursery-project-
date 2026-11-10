/*
 * Food allergy alerts for the people serving: the menu's conflicts grouped so each child shows once
 * a day, and the allergies the menu cannot be checked against grouped by what was typed.
 */
import { MEALS, severityRank, type FoodConflict } from './menu';

/** One child's alerts of a day, worst first, so the person serving sees each child once. */
export type ChildAlert = {
  childId: string;
  childNameAr: string;
  childNameEn: string;
  classNameAr: string | null;
  classNameEn: string | null;
  eatsNurseryMeals: boolean;
  worstSeverity: string | null;
  items: FoodConflict[];
};

export function alertsByDayAndChild(conflicts: FoodConflict[]): Array<{ day: string; children: ChildAlert[] }> {
  const days = [...new Set(conflicts.map((c) => c.day))].sort();
  return days.map((day) => {
    const byChild = new Map<string, ChildAlert>();
    for (const c of conflicts.filter((x) => x.day === day)) {
      const entry = byChild.get(c.childId) ?? {
        childId: c.childId,
        childNameAr: c.childNameAr,
        childNameEn: c.childNameEn,
        classNameAr: c.classNameAr,
        classNameEn: c.classNameEn,
        eatsNurseryMeals: c.eatsNurseryMeals,
        worstSeverity: c.severity,
        items: [],
      };
      entry.items.push(c);
      if (severityRank(c.severity) < severityRank(entry.worstSeverity)) entry.worstSeverity = c.severity;
      byChild.set(c.childId, entry);
    }
    const children = [...byChild.values()]
      .map((child) => ({ ...child, items: [...child.items].sort((a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal)) }))
      .sort((a, b) => Number(b.eatsNurseryMeals) - Number(a.eatsNurseryMeals) || severityRank(a.worstSeverity) - severityRank(b.worstSeverity) || a.childNameEn.localeCompare(b.childNameEn));
    return { day, children };
  });
}

export type UnmatchedAllergy = { childId: string; childNameAr: string; childNameEn: string; allergyName: string; severity: string | null };

/**
 * Allergies the menu is not checked against, grouped by the allergy as typed (case and spaces
 * ignored), the largest group first; each child once per group, worst reaction first.
 */
export function groupUnmatched(items: UnmatchedAllergy[]): Array<{ key: string; name: string; children: UnmatchedAllergy[] }> {
  const groups = new Map<string, { key: string; name: string; children: UnmatchedAllergy[] }>();
  for (const item of items) {
    const key = item.allergyName.trim().toLowerCase().replace(/\s+/g, ' ');
    const group = groups.get(key) ?? { key, name: item.allergyName.trim(), children: [] };
    if (!group.children.some((c) => c.childId === item.childId)) group.children.push(item);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, children: [...g.children].sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.childNameEn.localeCompare(b.childNameEn)) }))
    .sort((a, b) => b.children.length - a.children.length || a.name.localeCompare(b.name));
}
