/*
 * The photo or PDF attached to a menu: which files are accepted, how large, and where each period's
 * file is stored. set_menu_period_file checks the same types and sizes.
 */
import { MENU_FILE_TYPES } from '../../../supabase/functions/_shared/menuRules.ts';

export { MENU_FILE_TYPES };

export const MENU_FILE_MAX_BYTES = 5 * 1024 * 1024;
/** Photos are made smaller before upload, so a large phone photo still fits. */
export const MENU_IMAGE_TARGET_MB = 1.5;
export const MENU_SOURCE_IMAGE_MAX_BYTES = 15 * 1024 * 1024;

export type MenuFileProblem = 'invalid_type' | 'too_large';

/** What is wrong with a file before it is prepared (a photo is compressed after this check). */
export function menuFileProblem(file: Pick<File, 'type' | 'size'>): MenuFileProblem | null {
  if (!(MENU_FILE_TYPES as readonly string[]).includes(file.type)) return 'invalid_type';
  const limit = file.type === 'application/pdf' ? MENU_FILE_MAX_BYTES : MENU_SOURCE_IMAGE_MAX_BYTES;
  return file.size > limit ? 'too_large' : null;
}

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

/** Where a period's file is stored: menu-files/<nursery>/<period start>/<time>.<ext>. */
export function menuFilePath(nurseryId: string, startsOn: string, type: string, now = Date.now()): string {
  return `${nurseryId}/${startsOn}/${now}.${EXTENSIONS[type] ?? 'bin'}`;
}
