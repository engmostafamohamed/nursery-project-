import { describe, expect, it } from 'vitest';

import type { ParentQuarterlyReport } from '@/hooks/useQuarterlyReports';

import { attendanceRate, gradedCount, pickReport } from './termReports';

const report = (id: string, grades: Record<string, string>) =>
  ({
    report: { id },
    template: { sections: [{ id: 's', items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }] },
    grades,
  }) as unknown as ParentQuarterlyReport;

describe('term reports', () => {
  it('attendance as a percent, none without days counted', () => {
    expect([attendanceRate(45, 50), attendanceRate(0, 50), attendanceRate(5, 0), attendanceRate(null, 50), attendanceRate(60, 50)]).toEqual([90, 0, null, null, 100]);
  });

  it('counts the graded items', () => {
    expect(gradedCount(report('r', { a: 'E', c: 'G' }))).toEqual({ graded: 2, items: 3 });
  });

  it('opens the report a notice names, else the newest', () => {
    const list = [report('new', {}), report('old', {})];
    expect([pickReport(list, 'old')?.report.id, pickReport(list, 'gone')?.report.id, pickReport(list, null)?.report.id, pickReport([], null)]).toEqual([
      'old',
      'new',
      'new',
      undefined,
    ]);
  });
});
