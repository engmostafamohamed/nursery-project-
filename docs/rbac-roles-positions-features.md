# Dynamic RBAC — Roles, Positions, Features

> **Status:** Design proposal, not implemented
> **Last updated:** 2026-05-27
> **Phases:** 0 (schema) → 1 (engine flip) → 2 (Positions UI) → 3 (Features UI) → 4 (Roles UI)
> **Touches:** `src/lib/permissions/`, `src/features/staff-onboarding/`, `src/hooks/useUserProfile.ts`, new `supabase/migrations/*`, new pages under `/admin/settings/`

## 1. Goals

Move the three pillars that today are hard-coded into TypeScript and Postgres enums into **database-driven configuration** so authorised admins can change them at runtime:

1. **Features** — add new feature keys without a code release.
2. **Roles** — create custom roles (e.g. "Floor Supervisor") and pick which features they unlock.
3. **Positions** — create custom HR positions (e.g. "Lead Cook") and optionally link each to a role.
4. **Assignment authority** — driven by the existing `users.role` enum. `xo_super_admin` bypasses everything; `branch_admin` / `chain_super_admin` can manage roles and positions inside their nursery; everyone else is read-only.

## 2. Non-goals

- **No RLS rewrite per custom role.** Every custom role is bound to a fixed *base role* whose Postgres-enum value drives all existing RLS policies. Custom roles can hide UI surface, never expand DB access.
- **No removal of `user_role` enum.** Keeps existing migrations and policies working untouched.
- **No hierarchical role inheritance** (no "Supervisor inherits from Teacher" graph). Flat feature lists per role.
- **No per-class or per-child role scoping.** Authority is nursery-scoped (or platform-scoped) only.
- **No replacement of `class_staff.role`, ChatRole, AiSurfaceRole.** Those are separate axes used only by their own subsystems.

## 3. Current state inventory

### 3.1 Features (25) — `FeatureKey` union

Defined in [`src/lib/permissions/types.ts:40-65`](../src/lib/permissions/types.ts). Mapped to roles via [`src/lib/permissions/matrix.ts`](../src/lib/permissions/matrix.ts).

| # | Feature key | Top Mgmt | Manager | Teacher |
|---|---|---|---|---|
| 1 | `dashboard_attendance` | full | full | full |
| 2 | `dashboard_finance` | full | finance dept | none |
| 3 | `newsfeed` | full | full | full |
| 4 | `kids_applications` | full | full | none |
| 5 | `staff` | full | hr dept | none |
| 6 | `classes` | full | full | none |
| 7 | `admissions` | full | full | none |
| 8 | `permissions` | full | full | none |
| 9 | `event_calendar` | full | full | full |
| 10 | `financial_reports` | full | finance dept | none |
| 11 | `notifications` | full | full | full |
| 12 | `media_library` | full | full | with_approval |
| 13 | `upload_media` | full | full | none |
| 14 | `content_library` | full | full | full |
| 15 | `surveys` | full | full | none |
| 16 | `messages` | full | full | none |
| 17 | `daily_reports` | full | full | with_approval |
| 18 | `child_enrollment` | full | full | none |
| 19 | `staff_onboarding` | full | full | none |
| 20 | `inventory` | full | full | none |
| 21 | `meals` | full | full | none |
| 22 | `qr_code` | full | full | none |
| 23 | `health_alerts` | full | full | full |
| 24 | `loyalty` | full | finance dept | none |
| 25 | `broadcast_messages` | full | full | none |

`xo_super_admin` short-circuits to full. `parent` is not in the matrix.

### 3.2 Roles (6) — `user_role` Postgres enum

Defined in [`supabase/migrations/001_foundation.sql:10-16`](../supabase/migrations/001_foundation.sql), `manager` added in [`20260521120000_add_manager_role_enum_value.sql`](../supabase/migrations/20260521120000_add_manager_role_enum_value.sql).

| Role | RLS scope | Optional sub-type |
|---|---|---|
| `xo_super_admin` | every nursery | — |
| `chain_super_admin` | nurseries in `chain_id` | — |
| `branch_admin` | own `nursery_id` | — |
| `manager` | own `nursery_id` | `users.department` ∈ {finance, hr, operations} |
| `teacher` | own classroom | `class_staff.role` ∈ {lead, assistant} |
| `parent` | linked children | — |

### 3.3 Positions (8) — `StaffPosition` union

Defined in [`src/features/staff-onboarding/staffOnboardingTypes.ts:3-11`](../src/features/staff-onboarding/staffOnboardingTypes.ts).

`teacher` · `assistant` · `nanny` · `driver` · `kitchen` · `cleaner` · `security` · `admin`

Stored in `staff_profiles.position` (text column, no SQL CHECK constraint, see [`022_staff_hr.sql:9`](../supabase/migrations/022_staff_hr.sql)).

### 3.4 What's linked today

```
USER (auth)                            STAFF (HR record)
─────────────                           ──────────────────
users.role     ──→ matrix.ts ──→ FeatureKey
users.department  (matrix gating)       staff_profiles.position  (8 fixed strings)
users.nursery_id                        staff_profiles.department (6 fixed strings, DIFFERENT from user_department)
                                        staff_profiles.user_id ──→ users.id
```

Three concepts share the word "department":
- `user_department` enum (finance / hr / operations) — gates the permission matrix for managers
- `staff_profiles.department` (teaching / admin / kitchen / maintenance / security / driver) — HR org bucket
- Anything in the UI labelled "Department" — could be either; check the source

This terminology overlap is the biggest source of confusion in the codebase.

## 4. Target model

### 4.1 The base-role constraint

A full RBAC where custom roles also rewrite RLS policies on every table is multi-week work. To make this shippable, **every custom role is bound to a fixed base role** that controls only the DB-level data scope.

| Custom role example | Base role (immutable, drives RLS) | Custom feature list (editable) |
|---|---|---|
| "Floor Supervisor" | `teacher` (sees own classroom only) | dashboard_attendance, classes, daily_reports |
| "Office Receptionist" | `branch_admin` (sees whole nursery) | newsfeed, messages, kids_applications |
| "Finance Head" | `manager` + department=finance | dashboard_finance, financial_reports, invoices, loyalty |

Custom roles can hide UI, never expand data visibility.

### 4.2 Schema

Five new tables. SQL types abbreviated for readability.

```sql
features (
  id text PK,                         -- the stable key, e.g. 'dashboard_attendance'
  name_en text, name_ar text,
  category text,                      -- 'operations' | 'finance' | 'comms' | …
  description_en text, description_ar text,
  is_seed boolean default false,      -- protects built-in features from deletion
  created_at, updated_at
);

roles (
  id uuid PK,
  nursery_id uuid NULL,               -- NULL = platform-wide seed roles
  key text NOT NULL,
  name_en, name_ar text,
  base_role public.user_role NOT NULL,        -- drives RLS
  base_department public.user_department NULL, -- only when base_role='manager'
  is_seed boolean default false,
  created_by uuid REFERENCES users(id),
  created_at, updated_at,
  UNIQUE (nursery_id, key)
);

role_features (
  role_id uuid REFERENCES roles ON DELETE CASCADE,
  feature_id text REFERENCES features ON DELETE CASCADE,
  access text NOT NULL CHECK (access IN ('full','with_approval','none')),
  PRIMARY KEY (role_id, feature_id)
);

positions (
  id uuid PK,
  nursery_id uuid NULL,
  key text, name_en, name_ar text,
  role_id uuid NOT NULL REFERENCES roles,       -- every position maps to exactly one role
  is_seed boolean default false,
  created_at, updated_at,
  UNIQUE (nursery_id, key)
);

role_assignments_log (
  id uuid PK,
  user_id uuid REFERENCES users,
  old_role_id uuid REFERENCES roles,
  new_role_id uuid REFERENCES roles,
  changed_by uuid REFERENCES users,
  changed_at timestamptz default now(),
  reason text
);
```

### 4.3 Modified columns

- `users` — add `role_id uuid REFERENCES roles(id)`. The existing `role public.user_role` column stays as the base role, kept in sync by trigger.
- `staff_profiles` — add `position_id uuid REFERENCES positions(id)`. The existing `position text` column becomes a denormalised snapshot of `positions.key`, kept in sync by trigger.

### 4.4 Helper functions

All `SECURITY DEFINER`, mirroring the existing `current_user_role()` helper in [`20260521120100_add_manager_department_and_policies.sql`](../supabase/migrations/20260521120100_add_manager_department_and_policies.sql).

```sql
public.user_has_feature(p_key text) RETURNS boolean;
-- Reuse existing helpers from prior migrations:
--   public.current_user_role()           — already defined in 20260521120100
--   public.is_xo_super_admin()           — already defined in 20260525130000
--   public.rls_staff_manages_nursery(uuid) — already defined in 20260521120200
```

## 5. Authority model

No numeric level system. Authority follows the existing `users.role` enum.

- **`xo_super_admin`** — bypass everything. Can create, edit, or delete any role / position / feature. Can assign, update, or remove any staff record's position. Can promote any user to any role. Auditable via `role_assignments_log`.
- **`branch_admin` / `chain_super_admin`** — can CRUD roles, positions, and role-feature grants within their nursery (or chain). Cannot edit or delete seed records. Cannot touch the `features` catalogue (platform-wide, xo_super_admin only).
- **`manager`, `teacher`, `parent`** — read-only on roles/positions for use in the UI dropdowns. No admin pages visible.

The check uses the existing `rls_staff_manages_nursery()` helper from [`20260521120100_add_manager_department_and_policies.sql`](../supabase/migrations/20260521120100_add_manager_department_and_policies.sql) plus the existing `is_xo_super_admin()` helper from [`20260525130000_fix_media_rls_recursion_and_add_manager.sql`](../supabase/migrations/20260525130000_fix_media_rls_recursion_and_add_manager.sql).

## 6. RLS strategy

For each new table, policies enforce the rules in §5 using the helpers in §4.4. Example sketch (full SQL deferred to Phase 0 migration):

```sql
-- features: anyone can SELECT, only xo_super_admin can mutate
CREATE POLICY features_select ON features FOR SELECT TO authenticated USING (true);
CREATE POLICY features_xo_manage ON features FOR ALL TO authenticated
  USING (public.is_xo_super_admin()) WITH CHECK (public.is_xo_super_admin());

-- roles: anyone can SELECT, branch_admin+ can manage in their nursery, seeds protected
CREATE POLICY roles_select ON roles FOR SELECT TO authenticated USING (true);
CREATE POLICY roles_manage ON roles FOR ALL TO authenticated
  USING (
    public.is_xo_super_admin()
    OR (is_seed = false AND public.rls_staff_manages_nursery(nursery_id))
  )
  WITH CHECK (
    public.is_xo_super_admin()
    OR public.rls_staff_manages_nursery(nursery_id)
  );

-- positions: same shape as roles
CREATE POLICY positions_select ON positions FOR SELECT TO authenticated USING (true);
CREATE POLICY positions_manage ON positions FOR ALL TO authenticated
  USING (
    public.is_xo_super_admin()
    OR (is_seed = false AND public.rls_staff_manages_nursery(nursery_id))
  )
  WITH CHECK (
    public.is_xo_super_admin()
    OR public.rls_staff_manages_nursery(nursery_id)
  );

-- … plus role_features, role_assignments_log following the same pattern
```

The `users` table policy that allows role changes adds: `public.is_xo_super_admin() OR public.rls_staff_manages_nursery(nursery_id)`.

## 7. TypeScript / permission engine changes

Phase 1 swaps the engine's source of truth from the static matrix to a DB query, with zero behavioural change at first (the seed data reproduces the current matrix exactly).

### 7.1 New hook

```ts
// src/hooks/usePermissionMatrix.ts
export function usePermissionMatrix() {
  // fetches role_features joined to features for current user's role_id
  // cached in React Query, staleTime 5 minutes
  // xo_super_admin short-circuits to a synthetic 'all full' map
}
```

### 7.2 `useCan` rewrite

[`src/lib/permissions/can.ts`](../src/lib/permissions/can.ts) `useCan(feature)` reads from `usePermissionMatrix()` instead of the static `PERMISSION_MATRIX`. The xo_super_admin short-circuit stays.

### 7.3 `FeatureKey` union

[`src/lib/permissions/types.ts:40-65`](../src/lib/permissions/types.ts) stays as a TS union for IDE autocomplete. Adding a runtime-only feature works; UI just won't get type help for the new key until the union is regenerated. A script `scripts/codegen-feature-keys.ts` can regenerate from the DB; out of scope here.

### 7.4 Static matrix retention

[`matrix.ts`](../src/lib/permissions/matrix.ts) stays as a fallback for SSR / offline / tests — used only if `usePermissionMatrix()` hasn't loaded yet. To be removed in a future cleanup.

## 8. UI surfaces

Three new admin pages, all under `/admin/settings/*`. Gated by `useCan('settings_rbac')` (a new feature added to the matrix) plus `is_xo_super_admin() OR rls_staff_manages_nursery(...)` in RLS as defence in depth.

| Page | Route | Audience |
|---|---|---|
| **Features** | `/admin/settings/features` | xo_super_admin only |
| **Roles** | `/admin/settings/roles` | branch_admin and above |
| **Positions** | `/admin/settings/positions` | branch_admin and above |

UI patterns to reuse:
- React-query table from [`AdminStaffDirectoryPage.tsx`](../src/pages/admin/AdminStaffDirectoryPage.tsx)
- Form patterns from [`AdminStaffOnboardingPage.tsx`](../src/pages/admin/AdminStaffOnboardingPage.tsx)
- Role chips styling from [`LoginPage.tsx`](../src/pages/auth/LoginPage.tsx)

Sidebar entries added in [`AdminLayout.tsx`](../src/components/layouts/AdminLayout.tsx) under the existing Settings group.

## 9. Phased rollout

| Phase | Scope | Ships independently? | Risk |
|---|---|---|---|
| **0** | Migration: create 5 tables + helpers + RLS + seed from current state. Backfill `users.role_id` and `staff_profiles.position_id`. No UI change. | ✅ Yes — additive only | Low |
| **1** | Permission engine reads from DB. `useCan` swap. | ✅ Yes — one hook flip | Medium |
| **2** | `/admin/settings/positions` page. Staff Onboarding dropdown reads from DB. | ✅ Yes — smallest useful slice | Medium |
| **3** | `/admin/settings/features` page (xo_super_admin only). | ✅ Yes — internal mostly | Low |
| **4** | `/admin/settings/roles` page — the big editor. Define custom roles + assign feature grants. | ✅ Yes — final piece | High |

Each phase ships as its own migration and PR.

## 10. Files affected

### New files

| Path | Phase | Purpose |
|---|---|---|
| `supabase/migrations/20260527100000_rbac_phase0_tables.sql` | 0 | 5 tables, helpers, RLS, sync triggers |
| `supabase/migrations/20260527100100_rbac_phase0_backfill.sql` | 0 | Populate `users.role_id` and `staff_profiles.position_id` |
| `src/hooks/usePermissionMatrix.ts` | 1 | DB-driven matrix fetch |
| `src/hooks/usePositions.ts` | 2 | Positions fetch + assignment-gated filter |
| `src/hooks/useRoles.ts` | 4 | Roles fetch |
| `src/hooks/useFeatures.ts` | 3 | Features fetch |
| `src/pages/admin/settings/AdminPositionsPage.tsx` | 2 | CRUD UI for positions |
| `src/pages/admin/settings/AdminFeaturesPage.tsx` | 3 | CRUD UI for features |
| `src/pages/admin/settings/AdminRolesPage.tsx` | 4 | CRUD UI for roles + feature grants |

### Modified files

| Path | Phase | Change |
|---|---|---|
| `src/lib/permissions/can.ts` | 1 | Read matrix from hook instead of static import |
| `src/types/user.ts` | 0 | Add optional `role_id` field on UserRow |
| `src/hooks/useUserProfile.ts` | 0 | Also fetch `role_id` |
| `src/components/layouts/AdminLayout.tsx` | 2–4 | Sidebar entries for new settings pages |
| `src/router/AppRouter.tsx` | 2–4 | Routes for new pages |
| `src/features/staff-onboarding/staffOnboardingTypes.ts` | 2 | Drop `StaffPosition` literal union |
| `src/features/staff-onboarding/StaffOnboardingStepPanels.tsx` | 2 | Dropdown reads from `usePositions()` |
| `src/features/staff-onboarding/mapStaffOnboardingToProfile.ts` | 2 | Pass `position_id` instead of position string |
| `src/locales/en.json` and `ar.json` | 2–4 | New strings (page titles, buttons, role/position names) |

## 11. Open questions

1. **Per-nursery vs platform-wide features.** Currently this design assumes features are platform-wide (only xo_super_admin can create). Should branch admins be able to create nursery-specific features (e.g. a custom widget only their nursery uses)? Adds a `features.nursery_id` column.
2. **Role assignment audit.** The `role_assignments_log` table is included. Should there be an admin UI to view it, or is it write-only for forensic queries?
3. **Phase 1 cutover safety.** When swapping `useCan` to the DB-driven matrix, do we want a feature flag so the static matrix can be toggled back on instantly in an incident? Recommended: yes, environment variable `VITE_USE_DB_PERMISSIONS=true`.
4. **Removing `StaffPosition` union.** Phase 2 drops it from TypeScript. Any callers outside the staff-onboarding form? Search confirms only [`staffOnboardingTypes.ts`](../src/features/staff-onboarding/staffOnboardingTypes.ts) and [`mapStaffOnboardingToProfile.ts`](../src/features/staff-onboarding/mapStaffOnboardingToProfile.ts) import it. Safe to remove.

## 12. Verification (end-to-end, after all phases)

1. **As `xo_super_admin`:** visit `/admin/settings/features`, add "Daily Standup". Save.
2. Visit `/admin/settings/roles`, click "New role". Name "Floor Supervisor", base=`teacher`, feature list = [dashboard_attendance, classes, daily_reports, "Daily Standup"]. Save.
3. Visit `/admin/settings/positions`, create position "Lead Teacher", role = Floor Supervisor.
4. Onboard a new staff via Staff Onboarding form. The position dropdown shows "Lead Teacher". Pick it. Save.
5. Verify in DB — the sync trigger has linked everything:
   ```sql
   SELECT u.role, u.role_id, r.name_en AS role_name, sp.position_id, p.name_en AS position_name
   FROM users u
   JOIN roles r ON r.id = u.role_id
   JOIN staff_profiles sp ON sp.user_id = u.id
   JOIN positions p ON p.id = sp.position_id
   WHERE u.email = '<new staff email>';
   ```
   Expect `u.role = 'teacher'` (base_role of Floor Supervisor), `r.name_en = 'Floor Supervisor'`, `p.name_en = 'Lead Teacher'`.
6. **Log in as that new staff:** sidebar shows only Dashboard Attendance, Classes, Daily Reports, Daily Standup. Nothing else.
7. **As `demo-teacher`:** try to open `/admin/settings/roles` — sidebar entry hidden, direct URL redirects to unauthorized. API: `POST /rest/v1/roles` with their JWT — 403.
8. **As `demo-branch-admin`:** can create roles within their nursery, can edit/delete only `is_seed=false` rows. Seeds (the migrated 6 base roles + 8 base positions) are read-only.
9. **xo_super_admin bypass.** As `demo-xo-admin`: rename a seed role via `/admin/settings/roles` — succeeds. Delete a custom position — succeeds. Promote another user's `users.role_id` directly — succeeds (audited via `role_assignments_log`).

## 13. References

- Earlier research catalogue: `C:\Users\ROG STRIX\.claude\plans\what-all-postion-or-mutable-clarke.md` (Claude private plan folder, not committed)
- Existing permission helpers: `current_user_role()` in [`20260521120100_add_manager_department_and_policies.sql`](../supabase/migrations/20260521120100_add_manager_department_and_policies.sql)
- Manager-role full RLS patch: [`20260521120200_manager_full_rls_policies.sql`](../supabase/migrations/20260521120200_manager_full_rls_policies.sql)
- The fixed permission matrix this design replaces: [`src/lib/permissions/matrix.ts`](../src/lib/permissions/matrix.ts)
