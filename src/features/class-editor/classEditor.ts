/*
 * A class being created or changed, as plain data and rules (no React, no network): what
 * get_class_editor returns, the details form and its checks (the database refuses the same:
 * save_class), the children lists' searches, and what adding children does to the places.
 */
import { ageOn } from '@/features/child-health/childHealth';
import { count, day, list, numberOrNull, obj, text, textOrNull } from '@/lib/jsonRead';

export const NAME_MAX = 60;
export const GRADE_MAX = 40;
export const ROOM_MAX = 20;
export const CAPACITY_MIN = 1;
export const CAPACITY_MAX = 100;

export type EditorChild = {
  id: string;
  nameAr: string;
  nameEn: string;
  code: string | null;
  dob: string | null;
  gender: 'male' | 'female' | null;
  avatarUrl: string | null;
  enrolledOn: string | null;
};

/** A child who could join: with the class they are in now (null: none). */
export type Candidate = EditorChild & { classId: string | null; classAr: string | null; classEn: string | null };

export type OtherClass = { id: string; nameAr: string; nameEn: string; gradeLevel: string | null; capacity: number | null; children: number };

export type EditorClass = { id: string; nameAr: string; nameEn: string; gradeLevel: string | null; roomNumber: string | null; capacity: number | null };

export type ClassEditor = {
  nurseryId: string;
  today: string;
  can: { create: boolean; update: boolean; delete: boolean };
  cls: EditorClass | null;
  children: EditorChild[];
  candidates: Candidate[];
  classes: OtherClass[];
  gradeLevels: string[];
};

const gender = (v: unknown) => (v === 'male' || v === 'female' ? v : null);
const child = (c: Record<string, unknown>): EditorChild => ({
  id: text(c.id),
  nameAr: text(c.name_ar),
  nameEn: text(c.name_en),
  code: textOrNull(c.code),
  dob: day(c.dob) || null,
  gender: gender(c.gender),
  avatarUrl: textOrNull(c.avatar_url),
  enrolledOn: day(c.enrolled_on) || null,
});

/** get_class_editor's answer, checked. */
export function toClassEditor(raw: unknown): ClassEditor {
  const r = obj(raw);
  const can = obj(r.can);
  const k = r.class ? obj(r.class) : null;
  return {
    nurseryId: text(r.nursery_id),
    today: day(r.today) || new Date().toISOString().slice(0, 10),
    can: { create: can.create === true, update: can.update === true, delete: can.delete === true },
    cls: k && text(k.id)
      ? { id: text(k.id), nameAr: text(k.name_ar), nameEn: text(k.name_en), gradeLevel: textOrNull(k.grade_level), roomNumber: textOrNull(k.room_number), capacity: numberOrNull(k.capacity) }
      : null,
    children: list(r.children).map(child),
    candidates: list(r.candidates).map((c) => ({ ...child(c), classId: textOrNull(c.class_id), classAr: textOrNull(c.class_ar), classEn: textOrNull(c.class_en) })),
    classes: list(r.classes).map((c) => ({
      id: text(c.id), nameAr: text(c.name_ar), nameEn: text(c.name_en), gradeLevel: textOrNull(c.grade_level), capacity: numberOrNull(c.capacity), children: count(c.children),
    })),
    gradeLevels: (Array.isArray(r.grade_levels) ? r.grade_levels : []).filter((g): g is string => typeof g === 'string' && Boolean(g.trim())),
  };
}

// -----------------------------------------------------------------------------------------------
// The details

export type ClassDraft = { nameAr: string; nameEn: string; gradeLevel: string; roomNumber: string; capacity: string };
export type DraftField = keyof ClassDraft;
export type DraftIssue = 'name_required' | 'name_too_long' | 'name_taken' | 'too_long' | 'capacity_invalid';

export function classDraft(cls: EditorClass | null): ClassDraft {
  return {
    nameAr: cls?.nameAr ?? '',
    nameEn: cls?.nameEn ?? '',
    gradeLevel: cls?.gradeLevel ?? '',
    roomNumber: cls?.roomNumber ?? '',
    capacity: cls?.capacity != null ? String(cls.capacity) : '',
  };
}

export function sameDraft(a: ClassDraft, b: ClassDraft): boolean {
  return (Object.keys(a) as DraftField[]).every((k) => a[k].trim() === b[k].trim());
}

const lower = (v: string) => v.trim().toLowerCase();

/** What is wrong with the details; `others` are the nursery's other classes (their names are taken). */
export function draftIssues(d: ClassDraft, others: Pick<OtherClass, 'nameAr' | 'nameEn'>[]): Partial<Record<DraftField, DraftIssue>> {
  const issues: Partial<Record<DraftField, DraftIssue>> = {};
  const ar = d.nameAr.trim();
  const en = d.nameEn.trim();
  if (!ar && !en) {
    issues.nameAr = 'name_required';
    issues.nameEn = 'name_required';
  }
  for (const field of ['nameAr', 'nameEn'] as const) {
    const v = d[field].trim();
    if (!v || issues[field]) continue;
    if (v.length > NAME_MAX) issues[field] = 'name_too_long';
    else if (others.some((o) => lower(o.nameAr) === lower(v) || lower(o.nameEn) === lower(v))) issues[field] = 'name_taken';
  }
  if (d.gradeLevel.trim().length > GRADE_MAX) issues.gradeLevel = 'too_long';
  if (d.roomNumber.trim().length > ROOM_MAX) issues.roomNumber = 'too_long';
  const cap = d.capacity.trim();
  if (cap && (!/^\d+$/.test(cap) || Number(cap) < CAPACITY_MIN || Number(cap) > CAPACITY_MAX)) issues.capacity = 'capacity_invalid';
  return issues;
}

export const capacityOf = (d: ClassDraft): number | null => (/^\d+$/.test(d.capacity.trim()) ? Number(d.capacity.trim()) : null);

/** The places after adding `adding` children to `current` ones; `over` is how many beyond them (0 when none, or no limit). */
export function placesAfter(current: number, adding: number, capacity: number | null): { after: number; over: number } {
  const after = current + adding;
  return { after, over: capacity == null ? 0 : Math.max(0, after - capacity) };
}

// -----------------------------------------------------------------------------------------------
// The lists

export const childName = (c: Pick<EditorChild, 'nameAr' | 'nameEn'>, isArabic: boolean) =>
  (isArabic ? c.nameAr || c.nameEn : c.nameEn || c.nameAr) || '—';

/** Children whose name (either language) or code holds every word searched for. */
export function searchChildren<T extends EditorChild>(children: T[], search: string): T[] {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return children;
  return children.filter((c) => {
    const hay = `${c.nameAr} ${c.nameEn} ${c.code ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export type CandidateScope = 'unassigned' | 'all';

export function candidatesIn(candidates: Candidate[], scope: CandidateScope, search: string): Candidate[] {
  return searchChildren(scope === 'unassigned' ? candidates.filter((c) => !c.classId) : candidates, search);
}

/** Age in whole years and months on `today`, or null without a birth date. */
export const ageOf = (dob: string | null, today: string) => ageOn(dob, today);

/** The text key for a refused call (classEditor.errors.<code>). */
export function classEditorErrorKey(error: unknown): string {
  const message = (error as { message?: string } | null)?.message ?? '';
  const codes = ['class_forbidden', 'class_not_found', 'class_name_required', 'class_name_taken', 'class_text_too_long', 'class_capacity_invalid',
    'class_children_invalid', 'class_over_capacity', 'class_has_children'];
  const hit = codes.find((c) => message.includes(c));
  if (hit) return `classEditor.errors.${hit.replace('class_', '')}`;
  if (/failed to fetch|network|load failed/i.test(message)) return 'classEditor.errors.network';
  return 'classEditor.errors.failed';
}
