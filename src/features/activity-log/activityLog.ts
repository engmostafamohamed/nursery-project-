/*
 * What was done to a class or to a member of staff, as plain data and rules (no React, no network).
 * The server records a line per change; this turns one into the sentence a reader sees.
 */
import { obj, text, textOrNull } from '@/lib/jsonRead';

export type ActivitySubject = 'class' | 'staff';
export type ActivityAction = 'created' | 'updated' | 'deleted';

/** The kinds of record a line can be about, in the order the filter offers them. */
export const ACTIVITY_ENTITIES = ['class', 'class_team', 'staff', 'staff_absence', 'staff_attendance'] as const;
export type ActivityEntity = (typeof ACTIVITY_ENTITIES)[number];

export type BilingualName = { ar: string | null; en: string | null };

export type ActivityLine = {
  id: string;
  at: string;
  subject: ActivitySubject;
  entity: ActivityEntity;
  action: ActivityAction;
  /** Who did it; empty when the database itself did. */
  actor: BilingualName;
  /** The class or the person the line is about. */
  about: BilingualName;
  /** The class a team change was on, when the line is not about a class itself. */
  onClass: BilingualName | null;
  /** The fields that changed, as field -> { from, to }. */
  changed: Record<string, { from: string | null; to: string | null }>;
  /** The place a team change gave, when there was one. */
  role: string | null;
};

const name = (raw: unknown): BilingualName => {
  const o = obj(raw);
  return { ar: textOrNull(o.ar), en: textOrNull(o.en) };
};

const asText = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' ? v : JSON.stringify(v);
};

function readChanged(raw: unknown): ActivityLine['changed'] {
  const out: ActivityLine['changed'] = {};
  for (const [field, value] of Object.entries(obj(raw))) {
    const pair = obj(value);
    out[field] = { from: asText(pair.from), to: asText(pair.to) };
  }
  return out;
}

const isEntity = (v: string): v is ActivityEntity => (ACTIVITY_ENTITIES as readonly string[]).includes(v);

export function toActivityLine(raw: unknown): ActivityLine | null {
  const o = obj(raw);
  const id = textOrNull(o.id);
  const entity = text(o.entity);
  if (!id || !isEntity(entity)) return null;
  const summary = obj(o.summary);
  const action = text(o.action);
  const onClass = o.class ? name(o.class) : null;
  return {
    id,
    at: text(o.at),
    subject: o.subject === 'staff' ? 'staff' : 'class',
    entity,
    action: action === 'created' || action === 'deleted' ? action : 'updated',
    actor: name(o.actor),
    about: name(o.about),
    onClass: onClass && (onClass.ar || onClass.en) ? onClass : null,
    changed: readChanged(summary.changed),
    role: textOrNull(summary.role),
  };
}

export function toActivityLines(raw: unknown): ActivityLine[] {
  const lines = obj(raw).lines;
  return Array.isArray(lines) ? lines.flatMap((l) => { const line = toActivityLine(l); return line ? [line] : []; }) : [];
}

/**
 * The text key naming what happened. Deleting a class is a soft delete, so a line whose only
 * change is `deleted_at` being filled reads as closing the class, not as editing it.
 */
export function activityTitleKey(line: ActivityLine): string {
  if (line.entity === 'class' && line.action === 'updated' && line.changed.deleted_at?.to) {
    return 'activityLog.events.class.closed';
  }
  return `activityLog.events.${line.entity}.${line.action}`;
}

/** The fields worth naming under a line, leaving out the ones the sentence already carries. */
export function shownFields(line: ActivityLine): string[] {
  return Object.keys(line.changed).filter((f) => f !== 'deleted_at');
}
