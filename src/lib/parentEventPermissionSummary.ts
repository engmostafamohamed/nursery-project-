import type { ParentCatalogPermissionRow } from '@/hooks/useParentEventsCatalog';

export type ParentPermissionSummary =
  | { kind: 'none' }
  | { kind: 'pending'; names: string[] }
  | { kind: 'approved'; names: string[] }
  | { kind: 'declined' };

function childName(p: ParentCatalogPermissionRow, isAr: boolean): string {
  return (isAr ? p.child_name_ar : p.child_name_en) || p.child_name_en || p.child_name_ar;
}

export function summarizePermissionsForEvent(
  all: ParentCatalogPermissionRow[],
  eventId: string,
  isAr: boolean,
): ParentPermissionSummary {
  const list = all.filter((p) => p.event_id === eventId);
  if (!list.length) return { kind: 'none' };
  const pending = list.filter((p) => p.status === 'pending');
  if (pending.length) return { kind: 'pending', names: pending.map((p) => childName(p, isAr)) };
  const granted = list.filter((p) => p.status === 'granted');
  if (granted.length) return { kind: 'approved', names: granted.map((p) => childName(p, isAr)) };
  return { kind: 'declined' };
}
