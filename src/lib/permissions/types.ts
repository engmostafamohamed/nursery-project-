import type { UserRole } from '@/types/user';

/**
 * Permission model for the XO platform.
 *
 * This mirrors the Feature/Roles spreadsheet 1:1:
 *  - Each row in the sheet is a {@link FeatureKey}.
 *  - Each column (Top Management / Managers-Admin / Teacher) is a {@link RoleColumn}.
 *  - Each cell is an {@link Access} value:
 *      ✓               -> 'full'
 *      (blank)         -> 'none'
 *      "with approval" -> 'with_approval'
 *      "Finance"/"HR"  -> { requireDepartment: 'finance' | 'hr' }
 */

/** Department specialisation for managers (the "Finance" / "HR" cells). */
export type Department = 'finance' | 'hr' | 'operations';

/**
 * The three columns from the sheet, plus the implicit ones.
 * `super` (xo_super_admin) always has full access; `none` (e.g. parent) never appears in this matrix.
 */
export type RoleColumn = 'super' | 'topManagement' | 'manager' | 'teacher' | 'none';

/** What a single matrix cell can express. */
export type Access =
  | 'full' // ✓ — full access
  | 'none' // blank — no access
  | 'with_approval' // "with approval" — access, but actions need sign-off
  | { requireDepartment: Department }; // "Finance" / "HR" — only that department

/** One row of the matrix: how each column may access a feature. */
export interface FeatureAccess {
  topManagement: Access;
  manager: Access;
  teacher: Access;
}

/**
 * Every permission in the catalogue (`public.features`). Add new keys here and in the
 * `features` table (with the actions the module supports) and its label in rbac.features.*.
 */
export type FeatureKey =
  | 'dashboard_attendance'
  | 'qr_scanner'
  | 'invoices'
  | 'payments'
  | 'payroll'
  | 'packages'
  | 'deals'
  | 'courses'
  | 'chat'
  | 'community'
  | 'settings'
  | 'roles_permissions'
  | 'dashboard_finance'
  | 'newsfeed'
  | 'kids_applications'
  | 'staff'
  | 'classes'
  | 'admissions'
  | 'permissions'
  | 'event_calendar'
  | 'financial_reports'
  | 'notifications'
  | 'media_library'
  | 'upload_media'
  | 'content_library'
  | 'surveys'
  | 'messages'
  | 'daily_reports'
  | 'child_enrollment'
  | 'staff_onboarding'
  | 'inventory'
  | 'meals'
  | 'qr_code'
  | 'health_alerts'
  | 'loyalty'
  | 'broadcast_messages';

/** Result of resolving a feature for a given user. */
export interface AccessDecision {
  /** Whether the user may see/enter the feature at all. */
  allowed: boolean;
  /** True when access is granted but actions require approval (the "with approval" cells). */
  requiresApproval: boolean;
}

/**
 * Action a user can perform on a feature. Each feature supports a subset (features.actions).
 *
 * - `view`    — see the page and read items
 * - `create`  — see Create buttons / submit New forms
 * - `update`  — see Edit buttons / submit edits
 * - `delete`  — see Delete buttons / submit deletions
 * - `approve` — confirm or sign off (payments, payroll, corrections, waivers, approvals)
 * - `export`  — download / export data
 *
 * 'view' is the gatekeeper: a role_features row always grants at least view.
 * Absence of the row = no access at all. The server checks the same grants with
 * public.user_can(feature, action).
 */
export type Action = 'view' | 'create' | 'update' | 'delete' | 'approve' | 'export';

export const ALL_ACTIONS: readonly Action[] = ['view', 'create', 'update', 'delete', 'approve', 'export'] as const;

/** Full per-feature decision including which actions are unlocked. */
export interface FeatureActionDecision {
  /** True iff `actions` contains 'view'. Equivalent to AccessDecision.allowed. */
  allowed: boolean;
  /** Whether actions need sign-off (matches the old "with_approval" cell value). */
  requiresApproval: boolean;
  /** The set of CRUD actions this user can perform on this feature. */
  actions: ReadonlySet<Action>;
}

/** The minimal user shape the permission engine needs. */
export interface PermissionSubject {
  role: UserRole;
  department?: Department | null;
}
