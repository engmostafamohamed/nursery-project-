/* The class profile over the network: one read, a database function, so the page shows one moment. */
import { errorCodeIn, isNetworkError } from '@/lib/errorCode';
import { supabase } from '@/lib/supabase';

import { toClassProfile, type ClassProfile } from './classProfile';

export async function fetchClassProfile(classId: string): Promise<ClassProfile> {
  const { data, error } = await supabase.rpc('get_class_profile' as never, { p_class_id: classId } as never);
  if (error) throw error;
  return toClassProfile(data);
}

/** The text key for a failed read: the class is gone, the reader may not see it, or the network failed. */
export function classProfileErrorKey(error: unknown): string {
  const code = errorCodeIn(error, ['class_not_found', 'class_forbidden'] as const);
  if (code) return code === 'class_not_found' ? 'classProfile.errors.notFound' : 'classProfile.errors.forbidden';
  return isNetworkError(error) ? 'classProfile.errors.network' : 'classProfile.errors.failed';
}
