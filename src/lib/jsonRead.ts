/*
 * Reading a database function's JSON answer field by field: a missing or wrongly typed value turns
 * into a safe default (empty text, 0, null, the fallback choice) instead of breaking the screen.
 */

export type JsonRecord = Record<string, unknown>;

export function obj(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

/** The objects of a JSON array; anything else in it is dropped. */
export function list(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}

export function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Text that says something, else null (blank text counts as nothing). */
export function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/** A whole number of things: never negative, 0 when unreadable. */
export function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** A 'YYYY-MM-DD' day from a date or a timestamp; '' when there is none. */
export function day(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

/** One of the known values, else the fallback. */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
