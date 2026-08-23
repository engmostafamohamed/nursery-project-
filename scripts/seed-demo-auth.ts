import type { SupabaseClient } from '@supabase/supabase-js';

/** Paginate auth.users so demo emails resolve even when not on page 1. */
export async function buildAuthEmailToIdMap(supabase: SupabaseClient): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const r = await supabase.auth.admin.listUsers({ page, perPage });
    if (r.error) throw new Error(`List auth users page ${page}: ${r.error.message}`);
    const batch = r.data?.users ?? [];
    for (const u of batch) {
      const em = u.email?.toLowerCase();
      if (em) map.set(em, u.id);
    }
    if (batch.length < perPage) break;
    page += 1;
    if (page > 100) throw new Error('Auth user list pagination exceeded 100 pages');
  }
  return map;
}
