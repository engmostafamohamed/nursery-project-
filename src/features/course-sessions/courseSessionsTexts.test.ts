import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { notificationText } from '@/lib/notificationText';
import { missingArabicPlurals, missingTexts, textKeysIn } from '@/test/localeKeys';

import { COURSE_SESSION_ERROR_CODES } from './courseSessionsApi';

const NOTICE = {
  template_key: 'course_session_cancelled',
  template_params: {
    child: { ar: 'ليلى', en: 'Laila' },
    course: { ar: 'رسم', en: 'Art' },
    reason: 'The teacher is sick',
    date: '2026-11-09',
    minutes: 30,
    hours: 1.25,
    covered: 0,
    fee: 75,
    currency: 'EGP',
    segments: ['fee'],
  },
};

describe('course session texts', () => {
  it('exist in English and Arabic, including the ones built at run time', () => {
    expect(missingTexts([
      ...[...COURSE_SESSION_ERROR_CODES, 'network', 'failed'].map((code) => `courseSessions.errors.${code}`),
      ...['required', 'too_long'].map((issue) => `courseSessions.reasonIssues.${issue}`),
      ...['Roster', 'Sessions', 'Invoices'].map((tab) => `admin.courses.detail.tab${tab}`),
      ...['title', 'body', 'segments.covered', 'segments.fee'].map((part) => `notificationTemplates.course_session_cancelled.${part}`),
    ])).toEqual([]);
  });

  it('every text the session screens name exists in English and Arabic', () => {
    const dir = path.resolve(__dirname);
    const keys = textKeysIn([
      ...['CourseSessionsPanel.tsx', 'CourseSessionRow.tsx', 'CancelSessionDialog.tsx'].map((f) => path.join(dir, f)),
      ...['admin/AdminCourseDetailPage.tsx', 'teacher/TeacherCoursesPage.tsx'].map((f) => path.resolve(dir, '../../pages', f)),
    ]);
    expect(keys.length).toBeGreaterThan(20);
    expect(missingTexts(keys)).toEqual([]);
  });

  it('the count has every Arabic plural form', () => {
    expect(missingArabicPlurals(['courseSessions.rebilled'])).toEqual([]);
  });

  it('the parents’ end-of-day notice names the course, the day, the reason and the extra time', () => {
    const en = notificationText(NOTICE, 'en');
    expect(en.title).toBe('Art session cancelled');
    expect(en.body).toContain('Laila’s Art session on 9 Nov 2026 was cancelled. Reason: The teacher is sick.');
    expect(en.body).toContain('The 30 minutes spent at the nursery instead were counted as extra hours. Extra hours that day: 1.25');
    expect(en.body).toMatch(/Amount: .*75\.00/);

    const ar = notificationText(NOTICE, 'ar');
    expect(ar.title).toBe('إلغاء حصة رسم');
    expect(ar.body).toContain('السبب: The teacher is sick');
    expect(ar.body).toContain('ليلى');
    expect(ar.body).toContain('المبلغ');
  });
});
