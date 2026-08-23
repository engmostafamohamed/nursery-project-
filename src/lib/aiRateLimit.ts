const STORAGE_KEY = 'xo-ai-daily-quota-v1';
const DAILY_LIMIT = 50;

interface QuotaRow {
  date: string;
  count: number;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function load(userId: string): QuotaRow {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
    return { date: todayKey(), count: 0 };
  }
  try {
    const raw = globalThis.localStorage.getItem(`${STORAGE_KEY}:${userId}`);
    if (!raw) return { date: todayKey(), count: 0 };
    const parsed = JSON.parse(raw) as QuotaRow;
    if (parsed.date !== todayKey()) return { date: todayKey(), count: 0 };
    return parsed;
  } catch {
    return { date: todayKey(), count: 0 };
  }
}

function save(userId: string, row: QuotaRow): void {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return;
  try {
    globalThis.localStorage.setItem(`${STORAGE_KEY}:${userId}`, JSON.stringify(row));
  } catch {
    /* ignore */
  }
}

export function getAiQuotaState(userId: string | undefined): { used: number; limit: number; remaining: number } {
  const limit = DAILY_LIMIT;
  if (!userId) return { used: 0, limit, remaining: limit };
  const row = load(userId);
  return { used: row.count, limit, remaining: Math.max(0, limit - row.count) };
}

export function canSendAiRequest(userId: string | undefined): boolean {
  if (!userId) return false;
  const { remaining } = getAiQuotaState(userId);
  return remaining > 0;
}

/** Call after starting a request the user initiated (counts toward daily cap). */
export function recordAiRequest(userId: string | undefined): void {
  if (!userId) return;
  const row = load(userId);
  const d = todayKey();
  const count = row.date === d ? row.count + 1 : 1;
  save(userId, { date: d, count });
}

export const AI_DAILY_REQUEST_LIMIT = DAILY_LIMIT;
