/**
 * Single source of truth for "tab root" paths — the destinations a user reaches
 * directly from the app shell (sidebar / bottom nav / header links), as opposed
 * to deeper pages they drill into from within a tab.
 *
 * The BackButton hides itself on these paths: arriving at a tab is navigation,
 * not a drill-down, so a back affordance would be confusing. On any path NOT in
 * this set (e.g. `/admin/children/:childId`, `/parent/events/:eventId`) the back
 * button shows so users can return to the tab they came from.
 *
 * Tabs live at varying depths (e.g. `/admin/children` but also
 * `/admin/admissions/inquiries` and `/admin/financial/dashboard`), so this can't
 * be derived from path depth — it must mirror the nav configs in the layout
 * components. When you add a nav destination to a layout, add it here too.
 */

/** Public / unauthenticated entry points. */
const PUBLIC_ROOTS = [
  '/',
  '/login',
  '/signup',
  '/signup/success',
  '/unauthorized',
];

/** Parent shell — see ParentLayout primaryNavItems + secondaryNavItems + header. */
const PARENT_ROOTS = [
  '/parent',
  '/parent/messages',
  '/parent/daily-reports',
  '/parent/events',
  '/parent/inbox',
  '/parent/qr-code',
  '/parent/attendance',
  '/parent/milestones',
  '/parent/media',
  '/parent/rewards',
  '/parent/meals',
  '/parent/library',
  '/parent/profile',
  '/parent/invoices',
  '/parent/courses',
  '/parent/quarterly-reports',
  '/parent/settings',
];

/** Teacher shell — see TeacherLayout primaryNavItems + secondaryNavItems. */
const TEACHER_ROOTS = [
  '/teacher',
  '/teacher/attendance',
  '/teacher/events',
  '/teacher/courses',
  '/teacher/messages',
  '/teacher/daily-reports',
  '/teacher/milestones',
  '/teacher/media',
  '/teacher/scanner',
  '/teacher/classes',
  '/teacher/profile',
  '/teacher/settings',
];

/** Admin shell — see AdminLayout navItems + moreNavGroups (also XoAdminLayout NURSERY_ITEMS). */
const ADMIN_ROOTS = [
  '/admin',
  '/admin/children',
  '/admin/children/enroll',
  '/admin/staff',
  '/admin/staff/onboarding',
  '/admin/staff/payroll',
  '/admin/classes',
  '/admin/admissions/inquiries',
  '/admin/admissions/import',
  '/admin/attendance',
  '/admin/attendance/dashboard',
  '/admin/events',
  '/admin/courses',
  '/admin/packages',
  '/admin/reports',
  '/admin/reports/financial',
  '/admin/messages',
  '/admin/messages/broadcast',
  '/admin/messages/broadcasts',
  '/admin/surveys',
  '/admin/financial/dashboard',
  '/admin/media',
  '/admin/media/upload',
  '/admin/media/approval',
  '/admin/library',
  '/admin/inventory',
  '/admin/meals',
  '/admin/qr-codes',
  '/admin/calendar',
  '/admin/invoices',
  '/admin/health/alerts',
  '/admin/loyalty',
  '/admin/teacher-reminders',
  '/admin/settings',
  '/admin/settings/positions',
  '/admin/settings/roles',
  '/admin/settings/features',
];

/** XO platform-admin shell — see XoAdminLayout PLATFORM_ITEMS. */
const XO_ADMIN_ROOTS = [
  '/xo-admin',
  '/xo-admin/nurseries',
  '/xo-admin/analytics',
  '/xo-admin/settings',
];

/** Staff portal — see StaffLayout. */
const STAFF_ROOTS = [
  '/staff/payslips',
  '/staff/payroll',
];

export const TAB_ROOT_PATHS = new Set<string>([
  ...PUBLIC_ROOTS,
  ...PARENT_ROOTS,
  ...TEACHER_ROOTS,
  ...ADMIN_ROOTS,
  ...XO_ADMIN_ROOTS,
  ...STAFF_ROOTS,
]);

/** True when `pathname` is a top-level tab destination (no back button). */
export function isTabRoot(pathname: string): boolean {
  return TAB_ROOT_PATHS.has(pathname);
}
