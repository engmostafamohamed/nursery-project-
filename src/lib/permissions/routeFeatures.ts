import type { FeatureKey } from './types';

/**
 * The permission each screen needs. The longest matching path prefix wins; a path with no
 * entry (home, profile, inbox, notifications, personal reminders, onboarding) needs none.
 * `/xo-admin/nursery/...` screens are the admin screens and use the `/admin` table.
 */
const ADMIN_ROUTES: ReadonlyArray<readonly [string, FeatureKey]> = [
  ['/admin/attendance', 'dashboard_attendance'],
  ['/admin/scanner', 'qr_scanner'],
  ['/admin/children/enroll', 'child_enrollment'],
  ['/admin/children', 'kids_applications'],
  ['/admin/staff/payroll', 'payroll'],
  ['/admin/payroll', 'payroll'],
  ['/admin/staff/onboarding', 'staff_onboarding'],
  ['/admin/staff/new', 'staff_onboarding'],
  ['/admin/staff', 'staff'],
  ['/admin/classes', 'classes'],
  ['/admin/events', 'event_calendar'],
  ['/admin/calendar', 'event_calendar'],
  ['/admin/courses', 'courses'],
  ['/admin/invoices', 'invoices'],
  ['/admin/financial', 'dashboard_finance'],
  ['/admin/reports/financial', 'financial_reports'],
  ['/admin/reports', 'daily_reports'],
  ['/admin/packages', 'packages'],
  ['/admin/deals', 'deals'],
  ['/admin/loyalty', 'loyalty'],
  ['/admin/admissions', 'admissions'],
  ['/admin/inquiries', 'admissions'],
  ['/admin/import', 'admissions'],
  ['/admin/surveys', 'surveys'],
  ['/admin/inventory', 'inventory'],
  ['/admin/meals', 'meals'],
  ['/admin/community', 'community'],
  ['/admin/library', 'content_library'],
  ['/admin/media/upload', 'upload_media'],
  ['/admin/media', 'media_library'],
  ['/admin/health', 'health_alerts'],
  ['/admin/qr-codes', 'qr_code'],
  ['/admin/messages/broadcast', 'broadcast_messages'],
  ['/admin/messages/broadcasts', 'broadcast_messages'],
  ['/admin/messages', 'messages'],
  ['/admin/chat', 'chat'],
  ['/admin/teacher-reminders', 'notifications'],
  ['/admin/settings/roles', 'roles_permissions'],
  ['/admin/settings/positions', 'roles_permissions'],
  ['/admin/settings/features', 'roles_permissions'],
  ['/admin/settings', 'settings'],
];

const TEACHER_ROUTES: ReadonlyArray<readonly [string, FeatureKey]> = [
  ['/teacher/attendance', 'dashboard_attendance'],
  ['/teacher/scanner', 'qr_scanner'],
  ['/teacher/events', 'event_calendar'],
  ['/teacher/courses', 'courses'],
  ['/teacher/daily-reports', 'daily_reports'],
  ['/teacher/reports', 'daily_reports'],
  ['/teacher/milestones', 'daily_reports'],
  ['/teacher/media/upload', 'upload_media'],
  ['/teacher/media', 'media_library'],
  ['/teacher/classes', 'classes'],
  ['/teacher/messages', 'messages'],
  ['/teacher/chat', 'chat'],
  ['/teacher/community', 'community'],
];

/** The permission a path needs, or null when the screen is open to everyone signed in to that area. */
export function featureForPath(pathname: string): FeatureKey | null {
  const path = pathname.replace(/^\/xo-admin\/nursery(?=\/|$)/, '/admin').replace(/\/+$/, '') || '/';
  const table = path.startsWith('/teacher') ? TEACHER_ROUTES : path.startsWith('/admin') ? ADMIN_ROUTES : [];
  let best: readonly [string, FeatureKey] | null = null;
  for (const entry of table) {
    const matches = path === entry[0] || path.startsWith(`${entry[0]}/`);
    if (matches && (!best || entry[0].length > best[0].length)) best = entry;
  }
  return best ? best[1] : null;
}
