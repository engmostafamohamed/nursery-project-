/*
 * Calling a database function: its answer, or the error it raised thrown (the error's message
 * carries the short code the screens explain, see lib/errorCode). Screens read and write through
 * functions so a change shows at once: the service worker answers table reads from its cache first.
 */
import { supabase } from '@/lib/supabase';

export async function callRpc(name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  return data;
}
