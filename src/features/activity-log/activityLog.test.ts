import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { missingTexts, textKeysIn } from '@/test/localeKeys';

import { ACTIVITY_ENTITIES, activityTitleKey, shownFields, toActivityLine, toActivityLines } from './activityLog';

const src = path.resolve(__dirname, '../..');

const line = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  at: '2026-11-19T08:00:00Z',
  subject: 'class',
  entity: 'class',
  action: 'updated',
  actor: { ar: 'المدير', en: 'Admin' },
  about: { ar: 'الفراشات', en: 'Butterflies' },
  summary: { changed: { name_en: { from: 'Butterflies', to: 'Little Butterflies' } } },
  ...over,
});

describe('reading a line of the log', () => {
  it('keeps who did it, what it was about and what moved', () => {
    const read = toActivityLine(line());
    expect(read?.actor.en).toBe('Admin');
    expect(read?.about.ar).toBe('الفراشات');
    expect(read?.changed.name_en).toEqual({ from: 'Butterflies', to: 'Little Butterflies' });
  });

  it('leaves out a line whose kind it does not know', () => {
    expect(toActivityLine(line({ entity: 'something_else' }))).toBeNull();
  });

  it('names the class a team change was on, and the place given', () => {
    const read = toActivityLine(
      line({ entity: 'class_team', action: 'created', class: { ar: 'النحل', en: 'Bees' }, summary: { role: 'co_teacher' } }),
    );
    expect(read?.onClass?.en).toBe('Bees');
    expect(read?.role).toBe('co_teacher');
  });

  it('treats a class with no name beside it as having none', () => {
    expect(toActivityLine(line({ class: { ar: null, en: null } }))?.onClass).toBeNull();
  });

  it('reads a whole page, skipping what it cannot read', () => {
    expect(toActivityLines({ lines: [line(), line({ entity: 'nope' }), line({ id: 'a2' })] })).toHaveLength(2);
  });

  it('reads an empty page', () => {
    expect(toActivityLines({})).toEqual([]);
  });
});

describe('what a line says', () => {
  it('names the event by its kind and what was done', () => {
    expect(activityTitleKey(toActivityLine(line())!)).toBe('activityLog.events.class.updated');
    expect(activityTitleKey(toActivityLine(line({ entity: 'staff_absence', action: 'created' }))!))
      .toBe('activityLog.events.staff_absence.created');
  });

  it('reads a class whose deleted_at was filled as closed, not as edited', () => {
    const closed = toActivityLine(line({ summary: { changed: { deleted_at: { from: null, to: '2026-11-19T09:00:00Z' } } } }));
    expect(activityTitleKey(closed!)).toBe('activityLog.events.class.closed');
    expect(shownFields(closed!)).toEqual([]);
  });

  it('lists the fields worth naming under it', () => {
    expect(shownFields(toActivityLine(line())!)).toEqual(['name_en']);
  });
});

describe('activity log texts', () => {
  it('exist in English and Arabic', () => {
    expect(missingTexts(textKeysIn([path.join(src, 'pages/admin/AdminActivityLogPage.tsx')]))).toEqual([]);
  });

  it('name every event the log can record', () => {
    const keys = ACTIVITY_ENTITIES.flatMap((entity) =>
      (['created', 'updated', 'deleted'] as const).map((action) => `activityLog.events.${entity}.${action}`),
    );
    expect(missingTexts([...keys, 'activityLog.events.class.closed'])).toEqual([]);
  });
});
