/** The API returns at most this many rows per request (Supabase "Max rows"); larger results are cut off silently. */
export const API_MAX_ROWS = 1000;

/**
 * Reads every page of a query that can return more than API_MAX_ROWS rows.
 * `page(from, to)` must build the query with a stable order and end with `.range(from, to)`.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += API_MAX_ROWS) {
    const { data, error } = await page(start, start + API_MAX_ROWS - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < API_MAX_ROWS) return rows;
  }
}
