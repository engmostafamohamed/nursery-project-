# RBAC Phase 6 — Lock RBAC management to Super Admin + scope staff to branch

> **Permanent reference doc.** This file is the team's source of truth for the
> Phase 6 RBAC lock-down. It is not deleted or modified when the implementation
> lands — code edits happen in other files only.

---

## Context

After Phases 0–5 made roles/positions/features dynamic and editable, the user reports two problems:

1. **Branch admin can currently manage the RBAC config** — they see Roles/Positions/Features in the sidebar, can hit those pages, and can CRUD records via RLS (`rls_staff_manages_nursery()`). That's wrong. Only Super Admin should configure the RBAC.
2. **Branch admin needs nursery-scoped staff** — they should only see staff that belong to their own nursery, not all staff across the platform. (This is likely already correct via RLS — verifying as part of this phase.)

User also asked "what must see every position or role from this features" — meaning: how do I configure which features each role/position sees? Answer: that's already the existing Roles page workflow (V/C/U/D per feature per role). Positions inherit their role's features via the sync trigger. **No new config surface is needed; this plan just clarifies the model and tightens who can edit it.**

## Decisions

| Question | Answer |
|---|---|
| Should branch_admin still **READ** roles/positions for dropdowns? | **Yes.** Without read, the Staff Onboarding form's Position dropdown breaks. |
| Should branch_admin still **WRITE** to roles/positions/features? | **No.** Lock to xo_super_admin only. |
| Should branch_admin still **CRUD** staff_profiles in their nursery? | **Yes.** No change to existing `staff_profiles_admin_manage` policy. |
| Should branch_admin see Roles/Positions/Features sidebar entries? | **No.** Hide them entirely. |
| Should the staff list at `/admin/staff` show only their nursery? | **Yes — already does** via existing RLS on `staff_profiles` and `users` (filters on `nursery_id = current_user_nursery_id()`). Will verify in this phase, no migration needed. |

## Implementation

### 1. SQL migration — drop branch-admin write access on RBAC tables

**New file:** `supabase/migrations/20260529100000_rbac_phase6_xo_only_writes.sql`

Drop the existing `roles_manage`, `role_features_manage`, `positions_manage`, `features_xo_manage` policies and recreate them with **only** `is_xo_super_admin()` in USING / WITH CHECK. Specifically remove the `OR rls_staff_manages_nursery(nursery_id)` clause from the first three.

`features_xo_manage` already restricts to xo only — no change there but recreated for cleanliness.

SELECT policies stay open to `authenticated` (no change). Dropdowns continue to work for everyone.

### 2. UI — hide sidebar items for non-xo users

[`src/components/layouts/AdminLayout.tsx`](src/components/layouts/AdminLayout.tsx) — the three RBAC items currently carry `feature: 'permissions'`. That means any role with the `permissions` feature ticked sees them (which is most non-teacher roles). Change to a dedicated `xoOnly` flag on the nav item, and filter those before the feature-based filter runs. xo_super_admin still sees all; branch_admin no longer sees the three items.

The same logic also applies to [`src/components/layouts/XoAdminLayout.tsx`](src/components/layouts/XoAdminLayout.tsx) — but xo_super_admin already sees all, so no behaviour change there.

### 3. UI — page-level guards (defense in depth)

In each of the three pages, early-return a "Super Admin only" notice if `profile?.role !== 'xo_super_admin'`:
- [`src/pages/admin/settings/AdminPositionsPage.tsx`](src/pages/admin/settings/AdminPositionsPage.tsx)
- [`src/pages/admin/settings/AdminRolesPage.tsx`](src/pages/admin/settings/AdminRolesPage.tsx)
- [`src/pages/admin/settings/AdminFeaturesPage.tsx`](src/pages/admin/settings/AdminFeaturesPage.tsx) (already does this; reuse the pattern)

This means typing the URL directly still shows the guard, not the editable form.

### 4. Verification — staff list scoping

No code change. Just confirm by signing in as `demo-branch-admin` and visiting `/admin/staff` → list shows only their nursery's staff (RLS already filters via `rls_staff_manages_nursery()`).

### 5. Role-aware staff list filtering

The user wants different roles to see different views of the staff list at `/admin/staff/directory`:

| Role | Sees | Edit/Delete buttons | Extra columns |
|---|---|---|---|
| `xo_super_admin` | **All staff across all nurseries** | Yes (every row) | Nursery column visible |
| `branch_admin` | Their nursery's staff only | Yes | (no nursery column — they only have one) |
| `chain_super_admin` | Staff in nurseries within their chain | Yes | Nursery column visible |
| `manager` (HR base_department) | Their nursery's staff | Yes — controlled by role grants | (no nursery column) |
| `manager` (finance) | Hidden — no `staff` feature | n/a | n/a |
| `teacher` | Hidden — no `staff` feature | n/a | n/a |
| `parent` | Hidden | n/a | n/a |

**[`src/hooks/useStaff.ts`](src/hooks/useStaff.ts)** — add `useAllStaff()` that mirrors `useStaff(nurseryId)` but **without** the nursery_id filter. RLS still enforces visibility (xo sees all, others see their nursery).

**[`src/pages/admin/AdminStaffDirectoryPage.tsx`](src/pages/admin/AdminStaffDirectoryPage.tsx)** — pick the hook by role; pass `showNurseryColumn`, `canEdit`, `canDelete` to the table.

**[`src/components/admin/staff/StaffDirectoryTable.tsx`](src/components/admin/staff/StaffDirectoryTable.tsx)** — accept those props; conditionally render Nursery column and Edit/Delete buttons.

## Files to modify / create

| File | Change |
|---|---|
| `supabase/migrations/20260529100000_rbac_phase6_xo_only_writes.sql` | NEW — drops branch-admin write clause from 3 RLS policies |
| `src/components/layouts/AdminLayout.tsx` | Add `xoOnly: true` to RBAC nav items; filter before feature-based filter |
| `src/pages/admin/settings/AdminPositionsPage.tsx` | Early-return Super Admin guard |
| `src/pages/admin/settings/AdminRolesPage.tsx` | Early-return Super Admin guard |
| `src/hooks/useStaff.ts` | NEW `useAllStaff()` hook (no nursery filter; RLS enforces visibility) |
| `src/pages/admin/AdminStaffDirectoryPage.tsx` | Pick hook by role; pass `showNurseryColumn`, `canEdit`, `canDelete` props |
| `src/components/admin/staff/StaffDirectoryTable.tsx` | Accept the new props; render conditional nursery column + action buttons |

## Verification

1. Apply migration → RLS policies updated.
2. Sign in as `demo-branch-admin` → sidebar shows no Roles/Positions/Features entries.
3. Direct URL `localhost:5000/admin/settings/positions` → shows "Super Admin only" guard, no form rendered.
4. As `demo-branch-admin` via REST: `POST /rest/v1/roles` returns 403 (RLS denial). `GET /rest/v1/positions` returns 200 with the platform-wide + nursery seeds (read still works for dropdowns).
5. As `demo-branch-admin`: `/admin/staff/directory` shows only their nursery's staff. No nursery column. Edit/Delete buttons gated by `useCanAction('staff', 'update'/'delete')`.
6. As `demo-xo-admin`: `/admin/staff/directory` shows staff from **all** nurseries with a "Nursery" column. Edit/Delete buttons on every row.
7. As `demo-manager-hr`: sees only their nursery's staff (they have `staff` feature). Buttons gated by role.
8. As `demo-manager` (finance) or `demo-teacher`: `/admin/staff/directory` blocked at sidebar level (no `staff` feature).
9. All 6 demo accounts still log in cleanly.

## Out of scope

- Per-nursery feature catalogue (the `features` table stays platform-wide, xo-only).
- Per-position feature overrides (positions still inherit from one role; no extra layer).
- Changing the read model — everyone authenticated can still SELECT roles/positions/features for dropdowns; that's required for the existing onboarding form to work.

## Answer to the secondary question

> "What must see every position or role from this features?"

The model after Phase 5 is:

```
features  ←──  role_features  ←──  roles  ←──  positions  ←──  staff_profiles  ←──  users
                (V/C/U/D)                       (FK to ONE role)
```

- **A role** sees a feature when there's a row in `role_features` granting at least `view`. The Roles page (xo only) is where you tick each feature's V/C/U/D for each role.
- **A position** inherits the feature set from the **one role** it points at via `positions.role_id`. There is no per-position feature override.
- **A staff member** with a position gets that position's role auto-synced into `users.role_id` (via the sync trigger), which then drives `usePermissionMatrix()` at login time.

So to control what someone sees: edit their **role's** feature grants (in `/admin/settings/roles`). The position is just the assignment vehicle.

Per the lock-down in this plan, only Super Admin can change the role definitions — branch admins use the configured roles by picking them at staff onboarding time.

---

# Phase 7 — Staff onboarding hardening + visibility fixes (2026-05-29 → 2026-05-31)

After Phase 6 shipped, real-world testing of the onboarding flow surfaced a chain of issues. This phase fixes them and adds the missing UX guards so admins can actually create staff end-to-end through the UI.

## What was broken

| # | Symptom | Root cause |
|---|---|---|
| 1 | "Could not complete onboarding. FunctionsHttpError: returned a non-2xx status code" on second Submit | First Submit succeeded silently; second Submit hit a placeholder-email collision (`<digits-of-mobile>@staff.placeholder.xo`) — Edge Function returned 400 with no human-readable error. |
| 2 | "404 Not Found" on `/rest/v1/staff_national_ids` during Submit | Migration `20260419100000_staff_national_ids.sql` was checked into the repo but never deployed to the live DB. |
| 3 | Staff Directory empty for XO super admin even though staff existed | `public.users` had no SELECT policy for xo/branch/chain admins — they could only see themselves. |
| 4 | Position column shows "—" for the newly onboarded staff | Same root cause as #3, applied to `public.staff_profiles` — no SELECT policy for xo_super_admin. |
| 5 | `staff_profiles.department='teaching'` for a "Manager Teacher" position | Edge Function's `positionToDepartment()` switch only knew the 8 legacy positions; custom positions fell through to 'teaching'. |
| 6 | Form Submit button silently did nothing | Zod `position` field was a fixed enum of 8 values; rejected new custom position keys, so `form.handleSubmit` never called the inner handler. |
| 7 | Mobile/email collision discovered only at Submit time | No client-side check; admin had to fill the whole 5-step form to discover it. |

## What got built

### A. Edge Function patches — `supabase/functions/staff-onboarding-complete/`

- **Pre-check for existing email** before calling `auth.admin.createUser`. Returns `{ error: 'staff_already_exists', error_message: '...' }` with HTTP 409.
- **Client-side translation** of the body into a clear toast — [submitStaffOnboarding.ts](src/features/staff-onboarding/submitStaffOnboarding.ts) now extracts `error_message` from the response.

### B. Form-level validation

- **Zod `position` field relaxed** from a fixed enum to `z.string().min(1)`. Custom positions now pass validation; the DB trigger `trg_derive_position_id` enforces correctness by mapping the text key to `position_id`.
- **Live identity check** — new SQL function `public.check_staff_identity_exists(p_email, p_mobile)` (SECURITY DEFINER, returns booleans only). Backed by [`src/hooks/useStaffIdentityExists.ts`](src/hooks/useStaffIdentityExists.ts) with React Query caching + 400ms debounce.
- **Inline errors** on step 1 fields when collision detected — [StaffOnboardingStepPanels.tsx](src/features/staff-onboarding/StaffOnboardingStepPanels.tsx).
- **Next button blocks** when a collision is present — added to [StaffOnboardingWizard.tsx](src/features/staff-onboarding/StaffOnboardingWizard.tsx) `next()`, with scroll-to-field + focus on block.

### C. RLS hole fixes

| Migration | What it adds |
|---|---|
| `20260419100000_staff_national_ids.sql` | (Existing migration, **applied now** for the first time.) Creates the `staff_national_ids` table + RLS + indexes. Onboarding's National ID upload step depended on it. |
| `20260531100000_users_admin_select_policies.sql` | Three new SELECT policies on `public.users`: xo sees all, branch_admin sees own nursery, chain_super_admin sees own chain. |
| `20260531110000_staff_profiles_xo_select.sql` | `staff_profiles_xo_select` + `staff_profiles_xo_manage` policies — xo_super_admin can read/manage any staff_profile across nurseries. |

### D. HR department auto-derive

`20260531120000_staff_hr_dept_derive.sql` adds a `BEFORE INSERT/UPDATE` trigger on `staff_profiles` that smart-derives `department` from the position's linked role:

1. `role.base_role` ∈ {branch_admin, chain_super_admin, manager} → `admin`
2. `role.key` or `role.name_en` matches `(manager|admin|supervisor|head|lead|director|principal)` → `admin`
3. Else if `base_role = teacher` → `teaching`
4. Explicit non-default values (e.g. `kitchen`, `security`) are **never overwritten**

Same migration **backfills** existing rows so Mostafa Mohamed (the test "Manager Teacher" staff) moved from `teaching` → `admin`.

### E. Directory UI improvements

- **Custom role name in the Role column** — [useStaff.ts](src/hooks/useStaff.ts) now embeds `role_data:role_id(name_en, name_ar, base_role, base_department)` in both `useStaff` and `useAllStaff`. [StaffDirectoryTable.tsx](src/components/admin/staff/StaffDirectoryTable.tsx) renders `role_data.name_en` (trimmed) over the base auth enum. So Mostafa's "Role" column now shows "Manager Teacher" instead of "Teacher".

## Current data state (as of 2026-05-31)

| Person | users.role (RLS scope) | users.role_id → role | staff_profiles.position | HR dept |
|---|---|---|---|---|
| demo-xo-admin | xo_super_admin | Super Admin | — | — |
| demo-branch-admin | branch_admin | Branch Admin | — | — |
| demo-manager | manager + dept=finance | Manager — Finance | — | — |
| demo-manager-hr | manager + dept=hr | Manager — HR | — | — |
| demo-teacher | teacher | Teacher | — | — |
| Mostafa Mohamed | teacher | **Manager Teacher** (custom) | manager_teacher | admin ✓ |

The split between `users.role` (RLS scope) and `users.role_id` (UI features) is the Phase 5/6 base-role design at work:

- Mostafa's `users.role = 'teacher'` keeps him RLS-scoped to his own classroom (he can't see other classes' data)
- Mostafa's `users.role_id → 'Manager Teacher'` controls what features his sidebar shows (the V/C/U/D grants you ticked when defining the role)

## Files affected (Phase 7 net change)

| Path | Status |
|---|---|
| `supabase/functions/staff-onboarding-complete/index.ts` | Patched (pre-check email, friendlier errors) — **needs `supabase functions deploy`** to land in production |
| `supabase/migrations/20260419100000_staff_national_ids.sql` | Existing — applied to live DB for the first time |
| `supabase/migrations/20260530120000_check_staff_identity_exists.sql` | New |
| `supabase/migrations/20260531100000_users_admin_select_policies.sql` | New |
| `supabase/migrations/20260531110000_staff_profiles_xo_select.sql` | New |
| `supabase/migrations/20260531120000_staff_hr_dept_derive.sql` | New |
| `src/hooks/useStaffIdentityExists.ts` | New |
| `src/hooks/useStaff.ts` | Embed `role_data` in queries |
| `src/components/admin/staff/StaffDirectoryTable.tsx` | Render custom role name |
| `src/features/staff-onboarding/staffOnboardingValidation.ts` | Position field relaxed |
| `src/features/staff-onboarding/StaffOnboardingWizard.tsx` | Next-button collision guard |
| `src/features/staff-onboarding/StaffOnboardingStepPanels.tsx` | Inline identity-collision errors |
| `src/features/staff-onboarding/submitStaffOnboarding.ts` | Surface Edge Function's `error_message` in toast |

## Verification end-to-end

1. **Audit migrations** — `supabase_migrations.schema_migrations` should include the 4 Phase 7 migrations above.
2. **Onboard a new staff** — sign in as xo, `/admin/staff/onboarding`, use a **fresh** mobile number. After Submit, you land on `/admin/staff` and see the new row.
3. **Try to duplicate** — start onboarding again with the SAME mobile. Step 1 shows the red inline error within 400ms. Next button is blocked.
4. **Inspect the new row** — Position, Department, and Role columns are all populated (no "—"). The Role column shows the custom role name from `/admin/settings/roles`, not the base auth enum.
5. **Switch users** — sign in as `demo-branch-admin`. Staff Directory still shows only their nursery. Sidebar still hides Roles/Positions/Features (Phase 6 lockdown intact).

## Known non-issues (browser noise)

The console errors `"A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received"` are emitted by **Chrome browser extensions** (commonly AdBlock), not by this codebase. Verify by opening the app in Incognito mode — they disappear.

## Outstanding cleanup

- The "Manager Teacher" custom role's `name_en` still has a trailing tab character in the DB (`"Manager Teacher\t"`). The directory UI trims it at render time so it displays correctly, but the underlying data could be cleaned via `UPDATE public.roles SET name_en = btrim(name_en), name_ar = btrim(name_ar)` — `btrim` only matched on first attempt for some rows due to an oddity in the source data.
- The Edge Function code changes (collision-friendly errors) are in source but **need a deploy** to take effect (`supabase functions deploy staff-onboarding-complete`).
- `staff_profiles.department` for users **without** a staff_profile renders as "Teaching" (a React default fallback) — misleading. Should fall back to "—" instead. Trivial UI tweak if you want it.

Per the lock-down in this plan, only Super Admin can change the role definitions — branch admins use the configured roles by picking them at staff onboarding time.

---

# RBAC Phase 8 — Hierarchy-based position visibility (2026-06-01)

## Context

Two related visibility issues:

1. **Staff Onboarding → Position dropdown shows every position** regardless of viewer. Manager Teacher should only see positions they manage (Teacher / Assistant / Nanny).
2. **Staff Directory shows everyone in the nursery** regardless of viewer. Manager Teacher should see only their direct reports.

The fix: **each role declares which position keys it can manage** via a new nullable `roles.managed_position_keys text[]` column. Both the staff list AND the position-pick dropdown filter by that list.

## Convention

- `NULL` = manage all positions (super_admin, chain_admin, branch_admin, manager_operations)
- `[]` = manage none (teacher, parent)
- `['teacher', 'assistant', ...]` = manage only these positions

## Seed defaults

| Role | managed_position_keys |
|---|---|
| super_admin / chain_admin / branch_admin / manager_operations | NULL |
| manager_hr | teacher, assistant, nanny, driver, kitchen, cleaner, security, admin |
| manager_finance | admin |
| manager_teacher (custom) | teacher, assistant, nanny |
| teacher / parent | [] |

## Files changed

- `supabase/migrations/20260601200000_roles_managed_positions.sql` — schema + seed backfill
- `src/hooks/useRoles.ts` — `RoleRow.managed_position_keys: string[] | null`, `useUpdateRole` mutation
- `src/hooks/useStaff.ts` — embed `managed_position_keys` in role_data
- `src/features/staff-onboarding/StaffOnboardingStepPanels.tsx` — filter Position dropdown
- `src/pages/admin/AdminStaffDirectoryPage.tsx` — filter rows
- `src/pages/admin/settings/AdminRolesPage.tsx` — "Managed positions" multi-checkbox UI

## Verification

- demo-manager-teacher: Position dropdown shows only teacher/assistant/nanny; staff list hides Branch Admin, Mostafa, Demo Managers
- demo-manager-hr: dropdown excludes manager_* positions; list excludes branch_admin/managers
- demo-manager (finance): dropdown shows only "Admin"
- demo-branch-admin / demo-xo-admin: unchanged
- xo can edit a role's managed positions via /admin/settings/roles
