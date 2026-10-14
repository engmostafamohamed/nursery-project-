// Module 9 · Communication & notifications — notification texts and links, and who may chat with whom.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminNotificationMaterialIcon, resolveAdminNotificationPath } from './adminNotificationUtils';
import {
  CHAT_FILE_PREFIX,
  filePathFromContent,
  formatFileSize,
  getOrCreateConversationId,
  getUserDisplayName,
  isStorageFile,
  isStorageImage,
  storagePathFromContent,
} from './chat';
import { canChatWith, filterEligibleRecipients, type ChatActor } from './chatEligibility';
import { localizedNames, notificationText, templateNotificationRow } from './notificationText';
import {
  formatNotificationRelativeTime,
  parentNotificationMaterialIcon,
  resolveParentNotificationPath,
} from './parentNotificationUtils';

describe('notification text from templates', () => {
  const checkin = {
    template_key: 'attendance_checkin',
    template_params: {
      child: { ar: 'آدم', en: 'Adam' },
      staff: { ar: 'منى', en: 'Ms. Mona' },
      time: '2026-10-14T05:30:00Z',
      tz: 'Africa/Cairo',
      segments: ['staff', 'not_a_segment'],
    },
  };

  it('fills names, a clock time in the nursery time zone, and the known segments', () => {
    const text = notificationText(checkin, 'en');
    expect(text.title).toBe('Child checked in');
    expect(text.body).toMatch(/^Adam checked in at 8:30\sam by Ms\. Mona$/);
  });

  it('uses the reader’s language for names and words', () => {
    const text = notificationText(checkin, 'ar');
    expect(text.title).toBe('تم تسجيل حضور الطفل');
    expect(text.body).toContain('آدم');
    expect(text.body).toContain('منى');
  });

  it('falls back to the other language when a name has only one', () => {
    const row = { template_key: 'attendance_checkin', template_params: { child: { ar: 'آدم' }, time: 'x' } };
    expect(notificationText(row, 'en').body).toBe('آدم checked in at x');
  });

  it('formats money in EGP by default, and other currencies by code', () => {
    const paid = (params: Record<string, unknown>) => ({ template_key: 'invoice_paid', template_params: { invoice_number: 'INV-7', ...params } });
    expect(notificationText(paid({ amount: 1500 }), 'en').body).toBe('Your payment of EGP 1500.00 for invoice INV-7 was confirmed.');
    expect(notificationText(paid({ amount: 1500 }), 'ar').body).toBe('تم تأكيد سداد 1500.00 جنيه للفاتورة INV-7.');
    expect(notificationText(paid({ amount: 20, currency: 'USD' }), 'en').body).toContain('20.00 USD');
  });

  it('formats a calendar day without shifting it, and a month by name', () => {
    const absence = { template_key: 'absence_reported', template_params: { child: { en: 'Adam' }, date: '2026-10-05', reason: 'Sick' } };
    expect(notificationText(absence, 'en').body).toBe('Absence reported for Adam on 5 Oct 2026 (Sick).');
    const payslip = { template_key: 'staff_payroll_paid', template_params: { month: '2026-09', amount: 9000 } };
    expect(notificationText(payslip, 'en').body).toBe('Your September 2026 payslip has been paid: EGP 9000.00.');
  });

  it('shows a generic title for a template this app version does not know', () => {
    expect(notificationText({ template_key: 'from_the_future' }, 'en')).toEqual({ title: 'Notification', body: '' });
  });

  it('shows the stored text of a typed message, in the reader’s language first', () => {
    const typed = { title_ar: 'تنبيه', title_en: 'Notice', body_ar: 'غدا إجازة', body_en: '' };
    expect(notificationText(typed, 'en')).toEqual({ title: 'Notice', body: 'غدا إجازة' });
    expect(notificationText(typed, 'ar')).toEqual({ title: 'تنبيه', body: 'غدا إجازة' });
  });
});

describe('writing a template notification', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T09:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores the template key and raw parameters, not words', () => {
    expect(templateNotificationRow({ nurseryId: 'n1', userId: 'u1', type: 'invoice_paid', params: { amount: 10 } })).toEqual({
      nursery_id: 'n1',
      user_id: 'u1',
      type: 'invoice_paid',
      template_key: 'invoice_paid',
      template_params: { amount: 10 },
      read: false,
      channel: 'in_app',
      sent_at: '2026-10-14T09:00:00.000Z',
      action_link: null,
      urgency: 'normal',
      image_url: null,
    });
  });

  it('can use a template other than the type', () => {
    expect(templateNotificationRow({ nurseryId: null, userId: 'u1', type: 'custom', templateKey: 'invoice_ready' }).template_key).toBe('invoice_ready');
  });

  it('localizedNames trims names and stores blanks as null', () => {
    expect(localizedNames(' آدم ', '')).toEqual({ ar: 'آدم', en: null });
  });
});

describe('notification links', () => {
  it('opens a safe in-app link from the notification', () => {
    expect(resolveAdminNotificationPath('invoice_paid', '/admin/invoices/123')).toBe('/admin/invoices/123');
    expect(resolveParentNotificationPath('invoice_paid', ' /parent/invoices/123 ')).toBe('/parent/invoices/123');
  });

  it.each([
    'https://evil.example/admin',
    '//evil.example/admin',
    '/admin//evil.example',
    'javascript:alert(1)',
    '/parent/invoices',
  ])('ignores the unsafe or foreign admin link %s', (link) => {
    expect(resolveAdminNotificationPath('invoice_paid', link)).toBe('/admin/invoices');
  });

  it('never sends a parent into the admin area', () => {
    expect(resolveParentNotificationPath('invoice_paid', '/admin/invoices')).toBe('/parent/invoices');
  });

  it.each([
    ['staff_onboarded', '/admin/staff'],
    ['new_message', '/admin/messages'],
    ['event_published', '/admin/calendar'],
    ['media_pending_approval', '/admin/media/approval'],
    ['application_submitted', '/admin/admissions/inquiries'],
    ['attendance_needs_review', '/admin/attendance'],
    ['something_new', '/admin'],
  ])('an admin %s notification opens %s', (type, path) => {
    expect(resolveAdminNotificationPath(type, null)).toBe(path);
  });

  it.each([
    ['attendance_checkin', '/parent'],
    ['new_message', '/parent/messages'],
    ['event_invoice_generated', '/parent/events'],
    ['invoice_due_reminder', '/parent/invoices'],
    ['daily_report_published', '/parent/daily-reports'],
    ['survey_open', '/parent/surveys'],
  ])('a parent %s notification opens %s', (type, path) => {
    expect(resolveParentNotificationPath(type, undefined)).toBe(path);
  });

  it('picks an icon from the type', () => {
    expect(adminNotificationMaterialIcon('payment_attempt_created')).toBe('payments');
    expect(adminNotificationMaterialIcon('Staff_payroll_paid')).toBe('badge');
    expect(parentNotificationMaterialIcon('attendance_checkout')).toBe('person_check');
    expect(parentNotificationMaterialIcon('permission_request')).toBe('task_alt');
    expect(parentNotificationMaterialIcon('anything')).toBe('notifications');
  });
});

describe('notification times', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T09:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['2026-10-14T08:59:30Z', '30 seconds ago'],
    ['2026-10-14T08:55:00Z', '5 minutes ago'],
    ['2026-10-14T06:00:00Z', '3 hours ago'],
    ['2026-10-13T09:00:00Z', 'yesterday'],
    ['2026-10-10T09:00:00Z', '4 days ago'],
  ])('%s reads "%s"', (sentAt, label) => {
    expect(formatNotificationRelativeTime(sentAt, 'en')).toBe(label);
  });
});

describe('who can chat with whom', () => {
  const actor = (id: string, role: ChatActor['role'], extra: Partial<ChatActor> = {}): ChatActor => ({
    id,
    role,
    nursery_id: 'n1',
    chain_id: 'chain1',
    ...extra,
  });
  const parent = actor('p1', 'parent', { childClassIds: ['k1'] });
  const otherParent = actor('p2', 'parent', { childClassIds: ['k1'] });
  const classTeacher = actor('t1', 'teacher', { classIds: ['k1'] });
  const otherTeacher = actor('t2', 'teacher', { classIds: ['k2'] });
  const branchAdmin = actor('a1', 'branch_admin');
  const chainAdmin = actor('ca', 'chain_super_admin', { nursery_id: null });
  const xo = actor('xo', 'xo_super_admin', { nursery_id: null, chain_id: null });

  it.each([
    ['a parent and their child’s teacher', parent, classTeacher, true],
    ['a parent and another class’s teacher', parent, otherTeacher, false],
    ['two parents', parent, otherParent, false],
    ['two teachers of the same nursery', classTeacher, otherTeacher, true],
    ['a branch admin and a parent', branchAdmin, parent, true],
    ['a chain admin and a teacher in the chain', chainAdmin, classTeacher, true],
    ['a chain admin and a teacher in another chain', chainAdmin, actor('t9', 'teacher', { chain_id: 'chain2' }), false],
    ['a branch admin and a parent of another nursery', branchAdmin, actor('p9', 'parent', { nursery_id: 'n2' }), false],
    ['the XO admin and anyone', xo, branchAdmin, false],
    ['a person and themselves', parent, parent, false],
  ] as const)('%s: %s', (_label, from, to, allowed) => {
    expect(canChatWith(from, to)).toBe(allowed);
    // The rule is the same in both directions.
    expect(canChatWith(to, from)).toBe(allowed);
  });

  it('a teacher with no class list cannot reach parents', () => {
    expect(canChatWith(actor('t3', 'teacher'), parent)).toBe(false);
  });

  it('filters a recipient list to the allowed people', () => {
    const allowed = filterEligibleRecipients(parent, [classTeacher, otherTeacher, otherParent, branchAdmin, xo]);
    expect(allowed.map((a) => a.id)).toEqual(['t1', 'a1']);
  });
});

describe('chat messages', () => {
  it('shows a name in the nursery language, or both', () => {
    expect(getUserDisplayName('منى', 'Mona', 'ar')).toBe('منى');
    expect(getUserDisplayName('منى', 'Mona', 'en')).toBe('Mona');
    expect(getUserDisplayName('منى', 'Mona', 'both')).toBe('منى / Mona');
  });

  it('recognises stored images and files and reads their paths', () => {
    expect(isStorageImage('chat-media:n1/a.jpg')).toBe(true);
    expect(storagePathFromContent('chat-media:n1/a.jpg')).toBe('n1/a.jpg');
    expect(isStorageFile(`${CHAT_FILE_PREFIX}n1/a.pdf`)).toBe(true);
    expect(filePathFromContent(`${CHAT_FILE_PREFIX}n1/a.pdf`)).toBe('n1/a.pdf');
    expect(isStorageImage('hello')).toBe(false);
  });

  it.each([
    [null, ''],
    [0, ''],
    [500, '500 B'],
    [2048, '2 KB'],
    [5.5 * 1024 * 1024, '5.5 MB'],
  ])('a %s byte file shows "%s"', (bytes, label) => {
    expect(formatFileSize(bytes)).toBe(label);
  });

  it('keeps an open conversation id, or starts a new one', () => {
    expect(getOrCreateConversationId('conv-1')).toBe('conv-1');
    expect(getOrCreateConversationId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
