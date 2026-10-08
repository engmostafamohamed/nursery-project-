import type { FeatureAccess, FeatureKey } from './types';

/**
 * PERMISSION_MATRIX — the single source of truth, copied directly from the
 * Feature/Roles spreadsheet.
 *
 * Legend:
 *   'full'                          = ✓ in the sheet
 *   'none'                          = blank cell
 *   'with_approval'                 = "with approval"
 *   { requireDepartment: 'finance' } = "Finance"
 *   { requireDepartment: 'hr' }      = "HR"
 *
 * `xo_super_admin` is not listed here — it always resolves to full access (see can.ts).
 */
export const PERMISSION_MATRIX: Record<FeatureKey, FeatureAccess> = {
  dashboard_attendance: { topManagement: 'full', manager: 'full', teacher: 'full' },
  qr_scanner: { topManagement: 'full', manager: 'full', teacher: 'full' },
  invoices: { topManagement: 'full', manager: { requireDepartment: 'finance' }, teacher: 'none' },
  payments: { topManagement: 'full', manager: { requireDepartment: 'finance' }, teacher: 'none' },
  payroll: { topManagement: 'full', manager: { requireDepartment: 'hr' }, teacher: 'none' },
  packages: { topManagement: 'full', manager: { requireDepartment: 'finance' }, teacher: 'none' },
  deals: { topManagement: 'full', manager: { requireDepartment: 'finance' }, teacher: 'none' },
  courses: { topManagement: 'full', manager: 'full', teacher: 'full' },
  chat: { topManagement: 'full', manager: 'full', teacher: 'full' },
  community: { topManagement: 'full', manager: 'full', teacher: 'full' },
  settings: { topManagement: 'full', manager: 'none', teacher: 'none' },
  roles_permissions: { topManagement: 'full', manager: 'none', teacher: 'none' },
  dashboard_finance: { topManagement: 'full', manager: { requireDepartment: 'finance' }, teacher: 'none' },
  newsfeed: { topManagement: 'full', manager: 'full', teacher: 'full' },
  kids_applications: { topManagement: 'full', manager: 'full', teacher: 'none' },
  staff: { topManagement: 'full', manager: { requireDepartment: 'hr' }, teacher: 'none' },
  classes: { topManagement: 'full', manager: 'full', teacher: 'full' },
  admissions: { topManagement: 'full', manager: 'full', teacher: 'none' },
  permissions: { topManagement: 'full', manager: 'full', teacher: 'none' },
  event_calendar: { topManagement: 'full', manager: 'full', teacher: 'full' },
  financial_reports: { topManagement: 'full', manager: { requireDepartment: 'finance' }, teacher: 'none' },
  notifications: { topManagement: 'full', manager: 'full', teacher: 'full' },
  media_library: { topManagement: 'full', manager: 'full', teacher: 'with_approval' },
  upload_media: { topManagement: 'full', manager: 'full', teacher: 'full' },
  content_library: { topManagement: 'full', manager: 'full', teacher: 'full' },
  surveys: { topManagement: 'full', manager: 'full', teacher: 'none' },
  messages: { topManagement: 'full', manager: 'full', teacher: 'full' },
  daily_reports: { topManagement: 'full', manager: 'full', teacher: 'with_approval' },
  child_enrollment: { topManagement: 'full', manager: 'full', teacher: 'none' },
  staff_onboarding: { topManagement: 'full', manager: 'full', teacher: 'none' },
  inventory: { topManagement: 'full', manager: 'full', teacher: 'none' },
  meals: { topManagement: 'full', manager: 'full', teacher: 'none' },
  qr_code: { topManagement: 'full', manager: 'full', teacher: 'none' },
  health_alerts: { topManagement: 'full', manager: 'full', teacher: 'full' },
  loyalty: { topManagement: 'full', manager: { requireDepartment: 'finance' }, teacher: 'none' },
  broadcast_messages: { topManagement: 'full', manager: 'full', teacher: 'none' },
};
