const STORAGE_KEY = 'xo-help-ai-analytics-v1';
const MAX_EVENTS = 1000;

export type HelpAnalyticsEvent =
  | { type: 'help_article_viewed'; articleId: string; role: string; timestamp: string }
  | { type: 'help_search_query'; query: string; resultsCount: number; timestamp: string }
  | { type: 'ai_message_sent'; role: string; hasTools: boolean; timestamp: string }
  | { type: 'ai_action_executed'; actionType: string; success: boolean; timestamp: string }
  | { type: 'ai_error_occurred'; errorType: string; timestamp: string };

function load(): HelpAnalyticsEvent[] {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return [];
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as HelpAnalyticsEvent[]) : [];
  } catch {
    return [];
  }
}

function save(events: HelpAnalyticsEvent[]): void {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return;
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    /* ignore */
  }
}

export function trackHelpAnalytics(event: HelpAnalyticsEvent): void {
  const next = [...load(), event];
  while (next.length > MAX_EVENTS) {
    next.shift();
  }
  save(next);
}

export function getAnalyticsSummary(): {
  topArticles: { articleId: string; views: number }[];
  recentQueries: string[];
  actionCounts: Record<string, number>;
  errorCount: number;
} {
  const events = load();
  const articleViews = new Map<string, number>();
  const queries: string[] = [];
  const actionCounts: Record<string, number> = {};
  let errorCount = 0;

  for (const e of events) {
    if (e.type === 'help_article_viewed') {
      articleViews.set(e.articleId, (articleViews.get(e.articleId) ?? 0) + 1);
    } else if (e.type === 'help_search_query') {
      if (e.query.trim()) queries.push(e.query);
    } else if (e.type === 'ai_action_executed' && e.success) {
      actionCounts[e.actionType] = (actionCounts[e.actionType] ?? 0) + 1;
    } else if (e.type === 'ai_error_occurred') {
      errorCount += 1;
    }
  }

  const topArticles = [...articleViews.entries()]
    .map(([articleId, views]) => ({ articleId, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  return {
    topArticles,
    recentQueries: queries.slice(-20),
    actionCounts,
    errorCount,
  };
}
