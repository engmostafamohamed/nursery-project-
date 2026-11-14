import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { INVOICE_TYPES } from '@/lib/invoiceDisplay';
import { notificationText } from '@/lib/notificationText';
import { missingArabicPlurals, missingTexts, textKeysIn } from '@/test/localeKeys';

import { COURSE_REQUEST_ERROR_CODES } from './courseRequestsApi';

describe('course requests: texts', () => {
  it('every text the screens name exists in English and Arabic', () => {
    const keys = textKeysIn([
      ...['CourseCatalog.tsx', 'CourseRequestDialog.tsx', 'CourseRequestsPanel.tsx'].map((f) => path.join(__dirname, f)),
      path.resolve(__dirname, '../../pages/parent/ParentCoursesPage.tsx'),
    ]);
    expect(keys.length).toBeGreaterThan(40);
    expect(missingTexts(keys)).toEqual([]);
  });

  it('and the ones built at run time', () => {
    expect(
      missingTexts([
        ...[...COURSE_REQUEST_ERROR_CODES.map((c) => c.replace('course_', '')), 'network', 'failed'].map((c) => `courseRequests.errors.${c}`),
        ...['pending', 'approved', 'declined', 'cancelled'].map((s) => `courseRequests.status.${s}`),
        ...['courses', 'catalog', 'invoices'].map((tab) => `parent.courses.tabs.${tab}`),
        ...['Roster', 'Requests', 'Sessions', 'Invoices'].map((tab) => `admin.courses.detail.tab${tab}`),
        ...INVOICE_TYPES.flatMap((type) => [`invoice.types.${type}`, `invoice.filters.types.${type}`]),
        ...['course_request_new', 'course_request_approved', 'course_request_declined'].flatMap((k) => [`notificationTemplates.${k}.title`, `notificationTemplates.${k}.body`]),
      ]),
    ).toEqual([]);
    expect(missingArabicPlurals(['parent.courses.catalog.placesLeft', 'courseRequests.waiting'])).toEqual([]);
  });

  it('the family and the admin read the request and its answer in their language', () => {
    const params = { child: { ar: 'ليلى', en: 'Laila' }, course: { ar: 'سباحة', en: 'Swimming' } };
    expect(notificationText({ template_key: 'course_request_new', template_params: params }, 'en').title).toBe('Course request: Swimming');
    expect(notificationText({ template_key: 'course_request_approved', template_params: { ...params, note: 'Welcome!' } }, 'en').body).toBe(
      'Laila is enrolled in Swimming. Welcome!',
    );
    expect(notificationText({ template_key: 'course_request_declined', template_params: { ...params, note: '' } }, 'ar').body).toContain('ليلى');
  });
});
