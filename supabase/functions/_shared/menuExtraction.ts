/*
 * Reading a nursery's menu file (a photo or PDF) with Claude: what is asked, the shape of the
 * answer, and how the answer is checked before the admin sees it. The menu-extract edge function
 * (Deno) and the app's tests (Vitest) share it; the menu's own rules come from menuRules.ts.
 */
import { DISH_NAME_MAX, FOOD_ALLERGENS, isFoodAllergen, isMeal, MEALS, toUtcDate, type FoodAllergen, type Meal, type MenuPeriod } from './menuRules.ts';

const UNCLEAR_MAX = 10;
const UNCLEAR_LENGTH = 200;
const WEEKDAY_NAMES = ['Sunday / الأحد', 'Monday / الاثنين', 'Tuesday / الثلاثاء', 'Wednesday / الأربعاء', 'Thursday / الخميس', 'Friday / الجمعة', 'Saturday / السبت'];

/** The period being filled: its first and last day, and the days the nursery is open in it. */
export type ExtractContext = { period: MenuPeriod; startsOn: string; endsOn: string; days: string[]; maxDishes: number };

export type ExtractedDish = { day: string; meal: Meal; name: string; allergens: FoodAllergen[] };
export type Extraction = { dishes: ExtractedDish[]; dropped: number; unclear: string[] };

/** The answer's shape (structured output): every dish with its day, meal and allergens. */
export const MENU_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    dishes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day: { type: 'string', format: 'date' },
          meal: { type: 'string', enum: [...MEALS] },
          name: { type: 'string' },
          allergens: { type: 'array', items: { type: 'string', enum: [...FOOD_ALLERGENS] } },
        },
        required: ['day', 'meal', 'name', 'allergens'],
        additionalProperties: false,
      },
    },
    unclear: { type: 'array', items: { type: 'string' } },
  },
  required: ['dishes', 'unclear'],
  additionalProperties: false,
} as const;

/** The same for every file, so it is the cacheable part of the request. */
export const MENU_SYSTEM_PROMPT = `You read the food menu of a children's nursery from a photo or a PDF and write out its dishes, for the nursery's staff to check before the menu is saved.

The menu may be in Arabic, English or both, typed or handwritten, laid out as a table, a calendar or a list. Copy each dish name as it is written, in the menu's own language; do not translate, explain or invent dishes. When one cell lists several items (for example "rice, chicken and salad"), write each as its own dish. Meals are breakfast (فطار، فطور، إفطار), lunch (غداء، غدا، الوجبة الرئيسية) and snacks (سناك، وجبة خفيفة، تصبيرة، الفاكهة بين الوجبات); put anything else under the closest of the three.

For each dish, list the food allergens it most likely contains, from the allowed codes only: milk (dairy, cheese, yoghurt, butter, labneh), eggs, peanuts, tree_nuts, gluten (wheat, bread, pasta, biscuits, semolina, freekeh), soy, fish, shellfish, sesame (tahini, halawa), strawberry, citrus. Include an allergen when the usual recipe contains it; leave the list empty when the dish has none of them.

Only give dishes for the dates you are told the nursery is open. If the menu names weekdays but no dates, use it for every listed date with that weekday. If it is numbered by week (week 1, week 2...), apply week 1 to the first week of the period, and so on. Anything you cannot read or place, write briefly in "unclear" instead of guessing.`;

/** The part of the request that changes with the period: its dates and which weekday each is. */
export function menuExtractInstructions(ctx: ExtractContext): string {
  const lines = ctx.days.map((day) => `- ${day} (${WEEKDAY_NAMES[toUtcDate(day).getUTCDay()]})`);
  return [
    `This menu is for the ${ctx.period === 'month' ? 'month' : 'week'} from ${ctx.startsOn} to ${ctx.endsOn}.`,
    'The nursery is open on these dates; give dishes for these dates only:',
    ...lines,
    `Give at most ${ctx.maxDishes} dishes in all.`,
  ].join('\n');
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const cleanText = (value: string) => value.replace(/\s+/g, ' ').trim();

/**
 * Claude's answer, checked: only open days of the period, known meals and allergens, a name of
 * 1–120 characters, each dish once per day and meal, in day and meal order, at most the period's
 * limit. `dropped` counts what was left out, so the screen can say so.
 */
export function normalizeExtraction(raw: unknown, ctx: ExtractContext): Extraction {
  const answer = isRecord(raw) ? raw : {};
  const open = new Set(ctx.days);
  const seen = new Set<string>();
  const kept: Array<ExtractedDish & { order: number }> = [];
  const items = Array.isArray(answer.dishes) ? answer.dishes : [];
  let dropped = 0;

  items.forEach((item, order) => {
    const day = isRecord(item) && typeof item.day === 'string' ? item.day.slice(0, 10) : '';
    const name = isRecord(item) && typeof item.name === 'string' ? cleanText(item.name).slice(0, DISH_NAME_MAX).trim() : '';
    const meal = isRecord(item) ? item.meal : null;
    const key = `${day}|${String(meal)}|${name.toLowerCase()}`;
    if (!open.has(day) || !isMeal(meal) || !name || seen.has(key)) {
      dropped += 1;
      return;
    }
    seen.add(key);
    const allergens = isRecord(item) && Array.isArray(item.allergens) ? [...new Set(item.allergens.filter(isFoodAllergen))].sort() : [];
    kept.push({ day, meal, name, allergens, order });
  });

  kept.sort((a, b) => a.day.localeCompare(b.day) || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal) || a.order - b.order);
  const dishes = kept.slice(0, ctx.maxDishes).map(({ order: _order, ...dish }) => dish);
  dropped += kept.length - dishes.length;

  const unclear = (Array.isArray(answer.unclear) ? answer.unclear : [])
    .filter((note): note is string => typeof note === 'string')
    .map((note) => cleanText(note).slice(0, UNCLEAR_LENGTH))
    .filter(Boolean)
    .slice(0, UNCLEAR_MAX);

  return { dishes, dropped, unclear };
}
