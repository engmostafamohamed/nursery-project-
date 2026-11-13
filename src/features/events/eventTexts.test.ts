import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { notificationText } from '@/lib/notificationText';
import { missingArabicPlurals, missingTexts, textKeysIn } from '@/test/localeKeys';

import { EVENT_FLOW_ERROR_CODES } from './eventFlowApi';
import { EVENT_CATEGORIES, EVENT_SCOPES, EVENT_STAGES } from './events';
import { TEACHER_EVENT_TABS } from './teacherEvents';
import { ROSTER_STATUSES } from './teacherEventsApi';

const dir = path.resolve(__dirname);
const pages = path.resolve(dir, '../../pages');
const components = path.resolve(dir, '../../components');

describe('event texts', () => {
  it('exist in English and Arabic, including the ones built at run time', () => {
    expect(missingTexts([
      ...[...EVENT_FLOW_ERROR_CODES, 'network', 'failed'].map((code) => `eventFlow.errors.${code}`),
      ...EVENT_CATEGORIES.flatMap((c) => [`admin.events.create.categories.${c}`, `eventForm.categoryHints.${c}`]),
      ...EVENT_SCOPES.flatMap((s) => [`admin.events.create.scope.${s}`, `eventForm.scopeHints.${s}`, `admin.events.list.scope.${s}`]),
      ...EVENT_STAGES.flatMap((s) => [`admin.events.edit.statusOptions.${s}`, `admin.events.list.statusBadge.${s}`]),
      ...['all', 'urgent', ...EVENT_STAGES].map((s) => `admin.events.list.statusTab.${s}`),
      ...['all', ...EVENT_CATEGORIES].map((c) => `admin.events.list.categoryOption.${c}`),
      ...['all', 'upcoming', 'past'].map((d) => `admin.events.list.dateOption.${d}`),
      ...['titleRequired', 'startInvalid', 'startInFuture', 'endAfterStart', 'amountPositive', 'urgentDaysRequired', 'urgentHoursRequired', 'classRequired', 'individualChildrenRequired', 'deadlineInvalid', 'deadlineBeforeStart', 'unknown'].map(
        (code) => `admin.events.errors.${code}`,
      ),
      ...['title', 'body', 'segments.full', 'segments.partial', 'segments.none'].map((part) => `notificationTemplates.event_refund_due.${part}`),
      ...['title', 'body'].map((part) => `notificationTemplates.event_cancelled.${part}`),
      ...['title', 'body', 'segments.place'].map((part) => `notificationTemplates.event_updated.${part}`),
      ...['title', 'body'].map((part) => `notificationTemplates.event_invitation_withdrawn.${part}`),
      ...['title', 'body', 'segments.full', 'segments.partial', 'segments.none'].map((part) => `notificationTemplates.event_withdrawn_paid.${part}`),
      ...['attendance_event_closed', 'attendance_event_no_permission'].map((code) => `attendance.errors.${code}`),
      ...['title', 'body', 'segments.place', 'segments.qr'].map((part) => `notificationTemplates.event_tomorrow.${part}`),
      ...['title', 'body_one', 'body_other'].map((part) => `notificationTemplates.event_tomorrow_staff.${part}`),
      ...TEACHER_EVENT_TABS.map((tab) => `teacher.events.tabs.${tab}`),
      ...EVENT_SCOPES.map((scope) => `teacher.events.scope.${scope}`),
      ...ROSTER_STATUSES.map((status) => `teacher.events.roster.groups.${status}`),
      ...['all', 'granted', 'pending', 'denied', 'checkedIn'].map((f) => `admin.events.details.filters.${f}`),
      ...['child', 'parent', 'status', 'respondedAt', 'checkedIn', 'parentNote', 'payment'].map((c) => `admin.events.details.csv.${c}`),
    ])).toEqual([]);
  });

  it('every text the event screens name exists in English and Arabic', () => {
    const keys = textKeysIn([
      ...[
        'AdminEventCard.tsx',
        'AdminEventsFilters.tsx',
        'CancelEventDialog.tsx',
        'EventAudienceFields.tsx',
        'EventCategoryPicker.tsx',
        'EventFormFields.tsx',
        'EventFormLayout.tsx',
        'EventPreviewCard.tsx',
        'EventRepliesBar.tsx',
        'EventUrgentFields.tsx',
        'UnbilledApprovalsNotice.tsx',
        'useEventActions.tsx',
        'TeacherEventCard.tsx',
        'EventRosterDialog.tsx',
      ].map((f) => path.join(dir, f)),
      ...['AdminEventsListPage.tsx', 'AdminEventCreatePage.tsx', 'AdminEventEditPage.tsx', 'AdminEventDetailsPage.tsx'].map((f) => path.join(pages, 'admin', f)),
      ...['ParentEventDetailsPage.tsx', 'ParentPermissionsPage.tsx'].map((f) => path.join(pages, 'parent', f)),
      path.join(pages, 'teacher', 'TeacherEventsPage.tsx'),
      ...['events/EventsCalendar.tsx', 'events/EventsViewToggle.tsx', 'events/SelectedDayChip.tsx', 'admin/AdminEventDetailsAttendanceSection.tsx'].map((f) => path.join(components, f)),
    ]);
    expect(keys.length).toBeGreaterThan(80);
    expect(missingTexts(keys)).toEqual([]);
  });

  it('the counts have every Arabic plural form', () => {
    expect(missingArabicPlurals([
      'eventFlow.publish.done',
      'eventFlow.cancel.doneFamilies',
      'eventFlow.cancel.doneInvoices',
      'eventFlow.cancel.donePaid',
      'eventForm.childrenChosen',
      'eventForm.preview.audienceChildren',
      'eventForm.replies.granted',
      'eventForm.replies.denied',
      'eventForm.replies.pending',
      'eventForm.eventsCount',
      'eventsCalendar.moreOnDay',
      'eventsCalendar.selectDay',
      'eventFlow.sync.asked',
      'eventFlow.sync.withdrawn',
      'eventFlow.bill.title',
      'eventFlow.bill.action',
      'eventFlow.bill.done',
      'teacher.events.going',
      'teacher.events.checkedIn',
      'notificationTemplates.event_tomorrow_staff.body',
    ])).toEqual([]);
  });

  it('the families read why an event was cancelled, and the admins how many paid and the refund policy', () => {
    const cancelled = { template_key: 'event_cancelled', template_params: { event: { ar: 'رحلة', en: 'Zoo trip' }, date: '2026-11-20', reason: 'Heavy rain' } };
    const en = notificationText(cancelled, 'en');
    expect(en.title).toBe('Zoo trip is cancelled');
    expect(en.body).toContain('20 Nov 2026');
    expect(en.body).toContain('Reason: Heavy rain');
    const ar = notificationText(cancelled, 'ar');
    expect(ar.title).toContain('رحلة');
    expect(ar.body).toContain('السبب: Heavy rain');

    const refunds = (policy: string) =>
      notificationText({ template_key: 'event_refund_due', template_params: { event: { ar: 'رحلة', en: 'Zoo trip' }, count: 2, segments: [policy] } }, 'en');
    expect(refunds('full').title).toBe('Refunds to arrange: Zoo trip');
    expect(refunds('full').body).toContain('2');
    expect(refunds('full').body).toContain('full refund');
    expect(refunds('partial').body).toContain('partial refund');
    expect(refunds('none').body).toContain('no refund');
  });

  it('the families read the new time and place of a moved event, and when no reply is needed', () => {
    const moved = notificationText(
      {
        template_key: 'event_updated',
        template_params: { event: { ar: 'متحف', en: 'Museum' }, date: '2026-11-23', start_time: '2026-11-23T08:00:00Z', tz: 'Africa/Cairo', location: 'Egyptian Museum', segments: ['place'] },
      },
      'en',
    );
    expect(moved.title).toBe('Museum: new time or place');
    expect(moved.body).toContain('23 Nov 2026');
    expect(moved.body).toMatch(/10:00/); // 08:00 UTC in Cairo
    expect(moved.body).toContain('Place: Egyptian Museum.');
    const withdrawn = notificationText({ template_key: 'event_invitation_withdrawn', template_params: { event: { ar: 'متحف', en: 'Museum' } } }, 'ar');
    expect(withdrawn.title).toContain('متحف');
    expect(withdrawn.body).toContain('لا حاجة للرد');
  });

  it('the admins read which child left a paid event, and the refund policy', () => {
    const notice = notificationText(
      { template_key: 'event_withdrawn_paid', template_params: { event: { ar: 'متحف', en: 'Museum' }, child: { ar: 'ليلى', en: 'Laila' }, segments: ['partial'] } },
      'en',
    );
    expect(notice.title).toBe('Refund to arrange: Museum');
    expect(notice.body).toBe("Laila won't join Museum; the family had already paid. The nursery's policy is a partial refund.");
  });

  it('the day before, the families read when and where, and the teachers how many of their children go', () => {
    const family = notificationText(
      {
        template_key: 'event_tomorrow',
        template_params: { event: { ar: 'رحلة', en: 'Zoo trip' }, start_time: '2026-12-02T07:00:00Z', tz: 'Africa/Cairo', location: 'Giza Zoo', segments: ['place', 'qr'] },
      },
      'en',
    );
    expect(family.title).toBe('Tomorrow: Zoo trip');
    expect(family.body).toMatch(/^Zoo trip is tomorrow at 9:00/); // 07:00 UTC in Cairo
    expect(family.body).toContain('Place: Giza Zoo.');
    expect(family.body).toContain('check-in code');
    const staff = (count: number, lang: 'en' | 'ar') =>
      notificationText(
        { template_key: 'event_tomorrow_staff', template_params: { event: { ar: 'رحلة', en: 'Zoo trip' }, start_time: '2026-12-02T07:00:00Z', tz: 'Africa/Cairo', count } },
        lang,
      ).body;
    expect(staff(1, 'en')).toMatch(/^1 child of your class is going to Zoo trip tomorrow at 9:00/);
    expect(staff(13, 'en')).toMatch(/^13 children of your classes are going/);
    expect(staff(2, 'ar')).toContain('طفلان');
  });
});
