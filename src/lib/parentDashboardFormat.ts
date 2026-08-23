/** Short labels for parent dashboard from daily report JSON */
export function formatMoodSummary(moodJson: Record<string, unknown> | undefined): string {
  if (!moodJson) return '';
  const mood = moodJson.mood;
  if (typeof mood === 'string' && mood.trim()) return mood;
  if (typeof mood === 'object' && mood !== null) {
    const m = (mood as Record<string, unknown>).mood;
    if (typeof m === 'string' && m.trim()) return m;
  }
  return '';
}

export function formatMealsSummary(mealsJson: Record<string, unknown> | undefined): string {
  if (!mealsJson || typeof mealsJson !== 'object') return '';
  const parts: string[] = [];
  const breakfast = mealsJson.breakfast as Record<string, unknown> | undefined;
  const lunch = mealsJson.lunch as Record<string, unknown> | undefined;
  const snacks = mealsJson.snacks as Record<string, unknown> | undefined;
  const ap = (m: Record<string, unknown> | undefined) => {
    const a = m?.appetite;
    return typeof a === 'string' ? a : '';
  };
  if (breakfast) {
    const v = ap(breakfast);
    if (v) parts.push(`B:${v}`);
  }
  if (lunch) {
    const v = ap(lunch);
    if (v) parts.push(`L:${v}`);
  }
  if (snacks) {
    const v = ap(snacks);
    if (v) parts.push(`S:${v}`);
  }
  return parts.join(' · ');
}
