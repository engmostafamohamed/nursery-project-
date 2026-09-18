const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const DATABASE_HEALTH_PATH = '/rest/v1/nurseries?select=id&limit=1';
const DATABASE_HEALTH_TIMEOUT_MS = 15_000;
const DATABASE_HEALTH_ATTEMPTS = 3;

export type DatabaseHealthResult =
  | { ok: true }
  | { ok: false; message: string; cause?: unknown };

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

let databaseHealthPromise: Promise<DatabaseHealthResult> | null = null;

const wait = (ms: number) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));

function formatHealthError(cause: unknown): string {
  if (cause instanceof DOMException && cause.name === 'AbortError') {
    return `Supabase database health check timed out after ${DATABASE_HEALTH_TIMEOUT_MS / 1000} seconds.`;
  }

  return cause instanceof Error ? cause.message : String(cause);
}

async function fetchDatabaseHealth(): Promise<DatabaseHealthResult> {
  let lastFailure: DatabaseHealthResult | null = null;

  for (let attempt = 1; attempt <= DATABASE_HEALTH_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), DATABASE_HEALTH_TIMEOUT_MS);

    try {
      const response = await fetch(`${trimTrailingSlash(SUPABASE_URL)}${DATABASE_HEALTH_PATH}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        cache: 'no-store',
        signal: controller.signal,
      });

      if (response.ok) {
        return { ok: true };
      }

      lastFailure = {
        ok: false,
        message:
          response.status === 401
            ? 'Supabase rejected VITE_SUPABASE_ANON_KEY with HTTP 401. Copy the publishable/anon key from the same Supabase project as VITE_SUPABASE_URL.'
            : `Supabase database health check failed with HTTP ${response.status}.`,
      };
    } catch (cause) {
      lastFailure = {
        ok: false,
        message: `Cannot connect to Supabase database at ${SUPABASE_URL}: ${formatHealthError(cause)}`,
        cause,
      };
    } finally {
      globalThis.clearTimeout(timeout);
    }

    if (attempt < DATABASE_HEALTH_ATTEMPTS) {
      await wait(500 * attempt);
    }
  }

  return (
    lastFailure ?? {
      ok: false,
      message: 'Supabase database health check failed.',
    }
  );
}

async function runDatabaseHealthCheck(): Promise<DatabaseHealthResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      ok: false,
      message: 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.',
    };
  }

  if (import.meta.env.DEV) {
    try {
      const response = await fetch('/__xo-health/database', { cache: 'no-store' });
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

  return fetchDatabaseHealth();
}

export function checkDatabaseHealth(): Promise<DatabaseHealthResult> {
  databaseHealthPromise ??= runDatabaseHealthCheck();
  return databaseHealthPromise;
}
