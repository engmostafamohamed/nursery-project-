import { formatNotificationRelativeTime } from '@/lib/parentNotificationUtils';

export { formatNotificationRelativeTime };

/** Material Symbol name for admin notification `type`. */
export function adminNotificationMaterialIcon(type: string): string {
  const t = type.toLowerCase();
  if (t.startsWith('staff_')) return 'badge';
  if (t.startsWith('report_') || t.includes('daily_report') || t.includes('financial_report')) {
    return 'monitoring';
  }
  if (t.startsWith('payment')) return 'payments';
  if (t.startsWith('event')) return 'calendar_month';
  if (t.startsWith('invoice')) return 'receipt';
  if (t === 'attendance_checkin' || t === 'attendance_checkout' || t.startsWith('attendance')) {
    return 'person_check';
  }
  if (t === 'broadcast' || t.startsWith('broadcast')) return 'campaign';
  if (t.includes('media')) return 'photo_library';
  if (t.includes('inquiry') || t.includes('application') || t.includes('waitlist')) {
    return 'group_add';
  }
  if (t.includes('payroll') || t.includes('payslip')) return 'payments';
  if (t.includes('message') || t.includes('chat')) return 'chat';
  if (t.includes('survey')) return 'fact_check';
  if (t === 'custom') return 'notifications';
  return 'notifications';
}

export function adminNotificationFallbackPath(type: string): string {
  const t = type.toLowerCase();
  if (t.startsWith('staff_')) return '/admin/staff';
  if (t.startsWith('report_') || t.includes('daily_report')) return '/admin/reports/financial';
  if (t.includes('message') || t.includes('chat')) return '/admin/messages';
  if (t.includes('event')) return '/admin/calendar';
  if (t.includes('invoice') || t.includes('payment') || t.includes('financial')) return '/admin/invoices';
  if (t.includes('media')) return '/admin/media/approval';
  if (t.includes('inquiry') || t.includes('application') || t.includes('waitlist')) {
    return '/admin/admissions/inquiries';
  }
  if (t.includes('payroll') || t.includes('payslip')) return '/admin/staff/payroll';
  if (t.includes('survey')) return '/admin/surveys';
  if (t.includes('attendance')) return '/admin/attendance';
  return '/admin';
}

export function resolveAdminNotificationPath(type: string, actionLink: string | null | undefined): string {
  if (actionLink) {
    const trimmed = actionLink.trim();
    if (trimmed.startsWith('/admin') && !trimmed.includes('//')) {
      if (!/^[a-zA-Z][a-zA-Z+.-]*:/.test(trimmed)) {
        return trimmed;
      }
    }
  }
  return adminNotificationFallbackPath(type);
}
