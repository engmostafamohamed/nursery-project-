import { describe, expect, it } from 'vitest';

import {
  ageBands,
  agingBands,
  childrenPerTeacher,
  invoiceStatusParts,
  monthStart,
  ratePercent,
  topWithOther,
} from './platformDashboard';

describe('platform dashboard calculations', () => {
  it('gives a rate with one decimal, and none when nobody was expected', () => {
    expect(ratePercent(4643, 4982)).toBe(93.2);
    expect(ratePercent(3, 5)).toBe(60);
    expect(ratePercent(0, 0)).toBeNull();
  });

  it('fills every lateness band and age, in order, with the empty ones as zero', () => {
    expect(agingBands([{ band: 3, count: 2, amount: 900 }])).toEqual([
      { band: 1, count: 0, amount: 0 },
      { band: 2, count: 0, amount: 0 },
      { band: 3, count: 2, amount: 900 },
      { band: 4, count: 0, amount: 0 },
    ]);
    expect(ageBands([{ years: 5, count: 7 }, { years: 0, count: 1 }]).map((a) => a.count)).toEqual([1, 0, 0, 0, 0, 7]);
  });

  it('splits invoices into paid, pending and overdue with their shares', () => {
    const parts = invoiceStatusParts([
      { status: 'overdue', count: 1, amount: 1500 },
      { status: 'paid', count: 3, amount: 9000 },
    ]);
    expect(parts).toEqual([
      { status: 'paid', count: 3, amount: 9000, share: 0.75 },
      { status: 'pending', count: 0, amount: 0, share: 0 },
      { status: 'overdue', count: 1, amount: 1500, share: 0.25 },
    ]);
    expect(invoiceStatusParts([]).every((p) => p.share === 0)).toBe(true);
  });

  it('folds a long tail into one "other" row', () => {
    const rows = [
      { key: 'Cairo', count: 5 },
      { key: 'Giza', count: 1 },
      { key: 'Alexandria', count: 3 },
      { key: null, count: 2 },
    ];
    expect(topWithOther(rows, 3)).toEqual([
      { key: 'Cairo', count: 5 },
      { key: 'Alexandria', count: 3 },
      { key: '__other', count: 3 },
    ]);
    expect(topWithOther(rows, 4)).toBe(rows);
  });

  it('gives children per teacher, and none without teachers', () => {
    expect(childrenPerTeacher({ active_children: 250, teachers: 21 })).toBe(11.9);
    expect(childrenPerTeacher({ active_children: 12, teachers: 0 })).toBeNull();
  });

  it('reads a month key as its first day', () => {
    const d = monthStart('2026-02');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 1, 1]);
  });
});
