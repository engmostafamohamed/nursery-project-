import { edgeFunctionErrorBody } from '@/lib/edgeFunctionError';
import { obj, text } from '@/lib/jsonRead';
import { supabase } from '@/lib/supabase';

import type { Extraction } from '../../../supabase/functions/_shared/menuExtraction.ts';

import { toMenu, type Menu } from './menuApi';

/*
 * A period's menu file (a photo or PDF in the private menu-files bucket): storing, replacing and
 * removing it, a short-lived link to open it, and reading its dishes with the app's AI.
 */

const BUCKET = 'menu-files';

/** set_menu_period_file answers with the menu and the file it replaced, which is deleted here. */
async function pointMenuAtFile(nurseryId: string, day: string, file: { path: string; name: string; type: string; size: number } | null): Promise<Menu> {
  const { data, error } = await supabase.rpc('set_menu_period_file' as never, {
    p_nursery_id: nurseryId,
    p_day: day,
    p_path: file?.path ?? null,
    p_name: file?.name ?? null,
    p_type: file?.type ?? null,
    p_size: file?.size ?? null,
  } as never);
  if (error) throw error;
  const result = obj(data);
  const previous = text(result.previous_path);
  if (previous) await supabase.storage.from(BUCKET).remove([previous]);
  return toMenu(obj(result.menu));
}

/**
 * Stores a period's menu file: upload, point the menu at it, then delete the file it replaces. When
 * pointing fails the new upload is removed again, so nothing is left behind.
 */
export async function replaceMenuFile(input: { nurseryId: string; day: string; path: string; file: File }): Promise<Menu> {
  const upload = await supabase.storage.from(BUCKET).upload(input.path, input.file, { contentType: input.file.type, upsert: false });
  if (upload.error) throw upload.error;
  try {
    return await pointMenuAtFile(input.nurseryId, input.day, { path: input.path, name: input.file.name, type: input.file.type, size: input.file.size });
  } catch (error) {
    await supabase.storage.from(BUCKET).remove([input.path]);
    throw error;
  }
}

export const removeMenuFile = (nurseryId: string, day: string) => pointMenuAtFile(nurseryId, day, null);

/** A link to the file that works for a few minutes (the bucket is private). */
export async function menuFileUrl(path: string, download?: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300, download ? { download } : undefined);
  if (error || !data?.signedUrl) throw error ?? new Error('menu_file_unavailable');
  return data.signedUrl;
}

/**
 * Reads the period's menu file with the app's AI (menu-extract): the dishes by day and meal with
 * suggested allergens, for the editor to show before anything is saved.
 */
export async function extractMenuFromFile(nurseryId: string, day: string): Promise<Extraction> {
  const { data, error } = await supabase.functions.invoke('menu-extract', { body: { nurseryId, day } });
  if (error) throw new Error((await edgeFunctionErrorBody(error))?.error ?? 'menu_extract_failed');
  return data as Extraction;
}
