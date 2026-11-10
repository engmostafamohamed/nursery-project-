/*
 * The error codes the F&B menu functions raise (the database functions and menu-extract), each with
 * its message under fnb.errors.<code>.
 */
import { errorTextKey } from '@/lib/errorCode';

export const MENU_ERROR_CODES = [
  'menu_forbidden',
  'menu_invalid_day',
  'menu_invalid_period',
  'menu_invalid_dishes',
  'menu_invalid_dish',
  'menu_invalid_allergen',
  'menu_notes_too_long',
  'menu_empty',
  'menu_not_empty',
  'menu_copy_source_empty',
  'menu_invalid_file',
  'menu_file_missing',
  'menu_extract_unavailable',
  'menu_extract_refused',
  'menu_extract_too_long',
  'menu_extract_unreadable',
  'menu_extract_no_days',
  'menu_extract_busy',
  'menu_extract_network',
  'menu_extract_failed',
] as const;

/** The translation key for an F&B menu error (fnb.errors.<code>, network, failed). */
export const menuErrorKey = (error: unknown): string => errorTextKey(error, MENU_ERROR_CODES, 'fnb.errors');
