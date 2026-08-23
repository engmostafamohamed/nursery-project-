import { supabase } from '@/lib/supabase';

/** Insert permission rows for the given child IDs (does not check for duplicates). */
export async function insertEventPermissionsForChildren(
  eventId: string,
  childIds: string[],
  deadline?: string | null,
): Promise<void> {
  const unique = [...new Set(childIds.filter(Boolean))];
  if (!unique.length) return;
  const rows = unique.map((child_id) => ({
    child_id,
    event_id: eventId,
    permission_type: 'event',
    status: 'pending',
    ...(deadline ? { deadline } : {}),
  }));
  const { error } = await supabase.from('permissions').insert(rows as never);
  if (error) throw error;
}

export async function fetchPermissionChildIdsForEvent(eventId: string): Promise<
  { child_id: string; id: string; status: string }[]
> {
  const { data, error } = await supabase
    .from('permissions')
    .select('id, child_id, status')
    .eq('event_id', eventId);
  if (error) throw error;
  return (data ?? []) as { child_id: string; id: string; status: string }[];
}

/** Insert permissions only for children that don't already have one (idempotent). */
export async function ensureEventPermissionsForChildren(
  eventId: string,
  childIds: string[],
  deadline?: string | null,
): Promise<void> {
  const unique = [...new Set(childIds.filter(Boolean))];
  if (!unique.length) return;
  const existing = await fetchPermissionChildIdsForEvent(eventId);
  const existingSet = new Set(existing.map((e) => e.child_id));
  const toAdd = unique.filter((id) => !existingSet.has(id));
  if (!toAdd.length) return;
  await insertEventPermissionsForChildren(eventId, toAdd, deadline);
}

/**
 * Fetch the target child IDs for an event scope and create permission rows.
 * - 'all': every active child in the nursery
 * - 'class': every active child in the target class
 * - 'individual': the explicitly supplied childIds
 * Uses ensureEventPermissionsForChildren so it is safe to call multiple times.
 */
export async function createPermissionsForEventScope(
  eventId: string,
  scope: 'all' | 'class' | 'individual',
  options: {
    nurseryId?: string | null;
    classId?: string | null;
    childIds?: string[];
    deadline?: string | null;
  },
): Promise<void> {
  let targetChildIds: string[] = [];

  if (scope === 'all') {
    if (!options.nurseryId) return;
    const { data, error } = await supabase
      .from('children')
      .select('id')
      .eq('nursery_id', options.nurseryId)
      .eq('status', 'active');
    if (error) throw error;
    targetChildIds = (data ?? []).map((r: { id: string }) => r.id);
  } else if (scope === 'class') {
    if (!options.classId) return;
    const { data, error } = await supabase
      .from('children')
      .select('id')
      .eq('class_id', options.classId)
      .eq('status', 'active');
    if (error) throw error;
    targetChildIds = (data ?? []).map((r: { id: string }) => r.id);
  } else {
    targetChildIds = options.childIds ?? [];
  }

  await ensureEventPermissionsForChildren(eventId, targetChildIds, options.deadline);
}

/** Sync invited children for an individual-scope event (pending rows only for removals). */
export async function syncIndividualEventPermissions(
  eventId: string,
  nextChildIds: string[],
  deadline?: string | null,
): Promise<void> {
  const existing = await fetchPermissionChildIdsForEvent(eventId);
  const next = new Set(nextChildIds.filter(Boolean));
  const toAdd = [...next].filter((id) => !existing.some((e) => e.child_id === id));
  const toRemove = existing.filter((e) => e.status === 'pending' && !next.has(e.child_id));

  if (toRemove.length) {
    const { error } = await supabase.from('permissions').delete().in(
      'id',
      toRemove.map((r) => r.id),
    );
    if (error) throw error;
  }
  if (toAdd.length) {
    await insertEventPermissionsForChildren(eventId, toAdd, deadline);
  }
}
