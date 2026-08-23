const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const DATABASE_HEALTH_PATH = '/rest/v1/nurseries?select=id&limit=1';

export type DatabaseHealthResult =
  | { ok: true }
  | { ok: false; message: string; cause?: unknown };

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

let databaseHealthPromise: Promise<DatabaseHealthResult> | null = null;

async function runDatabaseHealthCheck(): Promise<DatabaseHealthResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      ok: false,
      message: 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.',
    };
  }

  if (import.meta.env.DEV) {
    try {
      const response = await fetch('/__xo-health/database');
      const result = (await response.json()) as { ok: boolean; message?: string };

      if (result.ok) {
        return { ok: true };
      }

      return {
        ok: false,
        message: result.message || 'Supabase database health check failed.',
      };
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      return {
        ok: false,
        message: `Cannot run local database health check: ${reason}`,
        cause,
      };
    }
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${trimTrailingSlash(SUPABASE_URL)}${DATABASE_HEALTH_PATH}`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        message: `Supabase database health check failed with HTTP ${response.status}.`,
      };
    }

    return { ok: true };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return {
      ok: false,
      message: `Cannot connect to Supabase database at ${SUPABASE_URL}: ${reason}`,
      cause,
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export function checkDatabaseHealth(): Promise<DatabaseHealthResult> {
  databaseHealthPromise ??= runDatabaseHealthCheck();
  return databaseHealthPromise;
}
