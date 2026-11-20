import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { missingArabicPlurals, missingTexts, textKeysIn } from '@/test/localeKeys';

import { ageInMonths, attendanceTimeline, HISTORY_PARTS, partCounts, toChildHistory } from './childHistory';

const src = path.resolve(__dirname, '../..');

const raw = (over: Record<string, unknown> = {}) => ({
  child: {
    id: 'c1',
    name_ar: 'ليلى',
    name_en: 'Layla',
    code: 'CH-1',
    dob: '2023-05-10',
    gender: 'female',
    enrolled_on: '2026-01-10',
    class: { ar: 'الفراشات', en: 'Butterflies' },
  },
  parents: [{ id: 'p1', ar: 'الأب', en: 'Dad', relationship: 'father', phone: '+2010' }],
  allergies: [{ name: 'Milk', severity: 'life_threatening', reaction: 'rash', treatment: 'inhaler' }],
  reports: [{ id: 'r1', date: '2026-11-18', status: 'draft', mood: 'happy', note: 'Good', by: { ar: 'سارة', en: 'Sara' } }],
  attendance: [{ id: 'a1', date: '2026-11-18', check_in: 'x', check_out: 'y', late_minutes: 3, extra_hours: 0 }],
  absences: [{ id: 'b1', date: '2026-11-17', reason: 'sick', note: null }],
  events: [{ id: 'e1', ar: 'رحلة', en: 'Trip', starts_at: '2026-11-10', permission: 'granted', attended: true }],
  milestones: [{ id: 'm1', at: '2026-10-01', ar: 'أول كلمة', en: 'First word', by: { ar: 'سارة', en: 'Sara' } }],
  health: [{ id: 'h1', date: '2026-09-01', type: 'allergy', note: 'Inhaler' }],
  messages: [{ id: 'g1', at: '2026-11-01T08:00:00Z', body: 'Trip on Sunday', audience: 'class', by: { ar: 'سارة', en: 'Sara' } }],
  media: [{ id: 'd1', at: '2026-11-05', url: 'u', caption: 'Play', type: 'image' }],
  ...over,
});

describe("reading a child's record", () => {
  it('keeps who she is and the class she is in', () => {
    const h = toChildHistory(raw());
    expect(h?.child.name.en).toBe('Layla');
    expect(h?.child.className?.ar).toBe('الفراشات');
    expect(h?.child.gender).toBe('female');
  });

  it('keeps every part of her past', () => {
    const h = toChildHistory(raw())!;
    expect(h.parents).toHaveLength(1);
    expect(h.allergies[0]?.treatment).toBe('inhaler');
    expect(h.reports[0]?.by.en).toBe('Sara');
    expect(h.events[0]?.attended).toBe(true);
    expect(h.messages[0]?.body).toBe('Trip on Sunday');
    expect(h.media[0]?.url).toBe('u');
  });

  it('reads a record with nothing in it yet', () => {
    const h = toChildHistory({ child: { id: 'c1' } })!;
    expect(h.reports).toEqual([]);
    expect(h.child.className).toBeNull();
  });

  it('is nothing without a child', () => {
    expect(toChildHistory({})).toBeNull();
  });

  it('treats an unknown gender as not said', () => {
    expect(toChildHistory(raw({ child: { id: 'c1', gender: 'other' } }))?.child.gender).toBeNull();
  });
});

describe('the days she came and the days she was away', () => {
  it('read as one list, newest first', () => {
    const line = attendanceTimeline(toChildHistory(raw()));
    expect(line.map((d) => `${d.date}:${d.kind}`)).toEqual(['2026-11-18:present', '2026-11-17:away']);
  });

  it('counts both kinds of day under one tab', () => {
    expect(partCounts(toChildHistory(raw())).attendance).toBe(2);
  });

  it('counts nothing for an empty record', () => {
    expect(partCounts(null).reports).toBe(0);
  });
});

describe('how old she is', () => {
  it('counts whole months', () => {
    expect(ageInMonths('2023-05-10', new Date('2026-11-20T00:00:00Z'))).toBe(42);
  });

  it('does not count a month she has not finished', () => {
    expect(ageInMonths('2023-05-25', new Date('2026-11-20T00:00:00Z'))).toBe(41);
  });

  it('says nothing when the date of birth is not known', () => {
    expect(ageInMonths(null)).toBeNull();
    expect(ageInMonths('not a date')).toBeNull();
  });
});

describe('child record texts', () => {
  it('exist in English and Arabic', () => {
    expect(missingTexts(textKeysIn([path.join(src, 'features/child-history/ChildHistoryDialog.tsx')]))).toEqual([]);
  });

  it('name every part of the record, and say when a part is empty', () => {
    expect(
      missingTexts(HISTORY_PARTS.flatMap((p) => [`childHistory.parts.${p}`, `childHistory.empty.${p}`])),
    ).toEqual([]);
  });

  it('count her age in every Arabic plural form', () => {
    expect(missingArabicPlurals(['childHistory.ageMonths'])).toEqual([]);
  });
});
