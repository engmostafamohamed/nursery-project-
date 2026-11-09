/* The class profile over the network: one read, a database function, so the page shows one moment. */
import { supabase } from '@/lib/supabase';

import { toClassProfile, type ClassProfile } from './classProfile';

export async function fetchClassProfile(classId: string): Promise<ClassProfile> {
  const { data, error } = await supabase.rpc('get_class_profile' as never, { p_class_id: classId } as never);
  if (error) throw error;
  return toClassProfile(data);
}

/** The text key for a failed read: the class is gone, the reader may not see it, or the network failed. */
export function classProfileErrorKey(error: unknown): string {
  const message = (error as { message?: string } | null)?.message ?? '';
  if (message.includes('class_not_found')) return 'classProfile.errors.notFound';
  if (message.includes('class_forbidden')) return 'classProfile.errors.forbidden';
  if (/failed to fetch|network|load failed/i.test(message)) return 'classProfile.errors.network';
  return 'classProfile.errors.failed';
}
