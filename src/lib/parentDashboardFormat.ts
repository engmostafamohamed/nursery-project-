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
