import { supabase } from '@/lib/supabase';

export type ExtraHoursAssignment = { childPackageId: string; invoiceId: string | null };

/**
 * Gives a child an extra-hours package: ends their current one and bills the paying parent its
 * price, less a live deal (admin_assign_extra_hours_package). A free package bills nothing.
 */
export async function assignExtraHoursPackage(childId: string, packageId: string): Promise<ExtraHoursAssignment> {
  // Cast: this RPC is newer than the generated database types.
  const { data, error } = await supabase.rpc(
    'admin_assign_extra_hours_package' as never,
    { p_child_id: childId, p_package_id: packageId } as never,
  );
  if (error) throw error;
  return data as unknown as ExtraHoursAssignment;
}

const ERROR_KEYS: Record<string, string> = {
  extra_hours_no_parent: 'packages.assignErrors.noParent',
  extra_hours_parent_not_linked: 'packages.assignErrors.noParent',
  extra_hours_package_not_found: 'packages.assignErrors.packageGone',
  extra_hours_child_not_found: 'packages.assignErrors.childGone',
  extra_hours_forbidden: 'packages.assignErrors.forbidden',
};

/** The message for a failed assignment, as a locale key. */
export function extraHoursAssignErrorKey(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  return ERROR_KEYS[message] ?? 'packages.saveFailed';
}
