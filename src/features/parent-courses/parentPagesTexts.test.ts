import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { notificationText } from '@/lib/notificationText';
import { missingArabicPlurals, missingTexts, textKeysIn } from '@/test/localeKeys';

import { BILL_TONE, COURSE_LOOK } from './parentCourses';

const src = path.resolve(__dirname, '../..');

describe("the family's pages: texts", () => {
  it('every text the pages name exists in English and Arabic', () => {
    const keys = textKeysIn(
      [
        'pages/parent/ParentCoursesPage.tsx',
        'pages/parent/ParentQuarterlyReportsPage.tsx',
        'features/term-reports/TermReportView.tsx',
        'pages/parent/ParentPaymentRecordPage.tsx',
        'pages/parent/ParentMediaGalleryPage.tsx',
        'pages/parent/ParentInvoicesPage.tsx',
      ].map((f) => path.join(src, f)),
    );
    expect(keys.length).toBeGreaterThan(80);
    expect(missingTexts(keys)).toEqual([]);
  });

  it('and the ones built at run time', () => {
    expect(
      missingTexts([
        ...Object.keys(COURSE_LOOK).map((c) => `admin.courses.categories.${c}`),
        ...Object.keys(BILL_TONE).map((s) => `parent.courses.invoiceStatus.${s}`),
        ...['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => `admin.courses.days.${d}`),
        ...['quarterly_report_sent', 'course_invoice_new'].flatMap((k) => [`notificationTemplates.${k}.title`, `notificationTemplates.${k}.body`]),
      ]),
    ).toEqual([]);
    expect(missingArabicPlurals(['parent.media.count'])).toEqual([]);
  });

  it('the family reads what was sent or billed, in its language', () => {
    const report = { template_key: 'quarterly_report_sent', template_params: { child: { ar: 'ليلى', en: 'Laila' }, term: 'Term 1' } };
    expect(notificationText(report, 'en').title).toBe("Laila's term report");
    expect(notificationText(report, 'ar').title).toContain('ليلى');
    const bill = {
      template_key: 'course_invoice_new',
      template_params: {
        child: { ar: 'ليلى', en: 'Laila' },
        course: { ar: 'سباحة', en: 'Swimming' },
        month: '2026-12',
        amount: 400,
        currency: 'EGP',
        due_date: '2027-01-05',
      },
    };
    const body = notificationText(bill, 'en').body;
    expect(body).toMatch(/^Laila's Swimming for December 2026: /);
    expect(body).toMatch(/400/);
    expect(body).toMatch(/5 Jan 2027/);
  });
});
