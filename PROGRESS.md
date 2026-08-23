# XO Build Progress

## Project Status
Phase: Wave 6 — PWA + RTL + performance polish COMPLETE
Last Updated: April 3, 2026
Paused at: Migration history drift blocks remote `supabase db push` for `056_fix_children_rls_recursion.sql`; Vercel production redeployed to `https://xo-platform.vercel.app`.

## Completed (April 3, 2026)
- [x] Pre-live tenant isolation hardening migration `20260403100000_prelive_tenant_isolation_hardening.sql`: re-enables RLS on core tables, hardens `create_event_permissions(...)` (`SECURITY DEFINER` guard checks + explicit grants), and removes public avatar-read exposure by enforcing authenticated tenant-scoped storage access
- [x] Tenant backup/export foundation migration `20260403102000_tenant_export_jobs.sql`: adds `tenant_export_jobs` + `tenant_export_artifacts` with RLS/policies, indexes/triggers, and private `tenant-exports` bucket policies
- [x] Added tenant export Edge Function `supabase/functions/tenant-export/index.ts` (role-gated nursery-scoped export payload, checksum generation, storage artifact write, audit status updates)
- [x] Added Admin Settings export UX (`src/components/admin/settings/TenantExportCard.tsx`, `src/hooks/useTenantExports.ts`) and wired it into `src/pages/admin/AdminSettingsPage.tsx`
- [x] Added AR/EN i18n keys for export workflow in `src/locales/ar.json` and `src/locales/en.json`
- [x] Added operations scripts and commands:
  - `npm run ops:integrity`
  - `npm run ops:verify-export`
  - `npm run ops:restore-rehearsal`
  - scripts under `scripts/ops/`
- [x] Added operational docs:
  - `docs/backup-and-recovery.md`
  - `docs/incident-runbook.md`

## Next Steps
- [x] Run `supabase db push --include-all` on linked remote (April 3, 2026)
- [x] Deploy `tenant-export` edge function (April 3, 2026)
- [x] Execute `npm run ops:integrity` with env loaded from `.env`
- [x] **Tenant export pipeline verified:** `NURSERY_ID=908fa1eb-e857-456c-a603-78c28c604c90 npm run ops:seed-export` then `npm run ops:verify-export` — completed job `715dea3f-efe3-42d5-be29-cbe63f14c653`, artifact checksum + `bytes_size` confirmed (April 3, 2026). *`ops:seed-export` uses service role on a secure machine; for real Edge Function JWT path, use Admin UI **Request export** or `ops:trigger-export` + `SUPABASE_ANON_JWT`.*
- [x] **Restore readiness (logical backup path):** `npm run ops:restore-rehearsal` checklist run; export job + artifact verified; integrity + cross-tenant checks passed (April 3, 2026). *Full **project** restore from Supabase backups/PITR is a separate quarterly drill in the Supabase Dashboard — see `docs/backup-and-recovery.md`.*
- [ ] Optional: set Dashboard **legacy anon JWT** in `SUPABASE_ANON_JWT` and confirm `npm run ops:trigger-export` succeeds (validates Edge Function + JWT path)
- [ ] Optional: remove or repurpose RLS test nursery `f8661bd9-5165-45eb-b206-d00828ba7eb4` if you do not want it in production data
- [ ] Before go-live: confirm Supabase project **backup / PITR** settings and retention match `docs/backup-and-recovery.md` (Dashboard → Database → Backups)

## Validation Notes (April 3, 2026)
- Ran `npm run ops:restore-rehearsal` locally: checklist printed successfully
- Ran `npm run ops:integrity` locally: blocked as expected without required env vars (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`)
- Lint diagnostics on newly added frontend/edge files: no linter errors

## Validation Notes (April 3, 2026 — live execution)
- [x] Ran `supabase db push --include-all` against linked remote project and applied:
  - `20260403100000_prelive_tenant_isolation_hardening.sql`
  - `20260403102000_tenant_export_jobs.sql`
- [x] Deployed edge function: `supabase functions deploy tenant-export`
- [x] Ran `npm run ops:integrity` with env loaded from `.env` (`set -a && source .env && set +a`): passed
- [x] Ran `npm run ops:restore-rehearsal`: checklist script passed
- [x] Ran `npm run ops:verify-export` with nursery `908fa1eb-e857-456c-a603-78c28c604c90`: passed after `ops:seed-export` created job + artifact
- [x] Ran strict cross-tenant RLS denial (`npm run ops:cross-tenant` with `RLS_CROSS_TENANT_TEST_PASSWORD`): passed — sample overlap none, direct cross-nursery `children` selects empty (script created a second nursery row when only one existed: `f8661bd9-5165-45eb-b206-d00828ba7eb4`)
- [x] Checked Supabase backups state via CLI: `supabase backups list --project-ref fsfveuuoaaihawgyrbmv --output json`
  - Result: `"pitr_enabled": false`, `"backups": []`, `"walg_enabled": true`
  - Go-live implication: full-project restore readiness is **not complete** until PITR/backups are enabled in Supabase Dashboard billing/backup settings

## Completed (March 29, 2026)
- [x] Added migration `056_fix_children_rls_recursion.sql` to remove recursive `children_parents_select` and redefine `user_can_access_child(uuid)` as non-recursive SQL helper
- [x] Synced remote migration files via `supabase migration fetch --linked --yes` (timestamp files restored locally); `supabase db push` still blocked by mixed legacy numeric + timestamp migration ordering
- [x] Redeployed production on Vercel; alias confirmed at `https://xo-platform.vercel.app`
- [x] Bilingual **Resources** help panel (slide-over, search, categories, checklists, placehold.co screenshots, localStorage progress) + admin sidebar / parent & teacher header entry points
- [x] **XO Assistant** FAB: calls `POST {VITE_SUPABASE_URL}/functions/v1/ai-assistant` with JWT + anon `apikey`, tool execution via `aiAgentActions` / `aiTools`, 50 req/day client quota, safety confirm dialog, offline-disabled FAB; HTTP-status-aware errors (`aiAssistantFailureMessage`); `getUser()` before token; `scripts/check-ai-assistant-endpoint.mjs` + `npm run check:ai-endpoint`; debug ingest removed after production deploy
- [x] Preferences: Admin Settings + `/parent/settings` & `/teacher/settings` (gear in header), localStorage toggles; `helpAnalytics` + `getAnalyticsSummary`; `.env.example` documents Edge-only AI secrets

## Completed (March 30, 2026)
- [x] Login page demo accounts panel: added guarded "DEMO ACCOUNTS" collapsible below Sign In in `src/pages/auth/LoginPage.tsx` (visible only when `import.meta.env.DEV` or `?preview=true`), fetches fruit/test users from `users` for `branch_admin`/`teacher`/`parent`, and one-click rows auto-fill email + test password then submit instantly

## Completed (April 2, 2026)
- [x] Dark mode: fixed invisible native selects/inputs by replacing hardcoded `bg-white` with theme tokens (`bg-surface` + `text-foreground`), adding `color-scheme` on `[data-theme]`, and correcting parent/teacher bottom nav / BottomSheet surfaces (`bg-surface/85`)
- [x] Admin Settings now includes editable **Nursery Profile** card (`src/components/admin/settings/NurseryProfileForm.tsx`) for logo upload (image-only, 10MB max), nursery identity fields (AR/EN name, city, phone, AR/EN address, AR/EN about), and social links (website/Facebook/Instagram/TikTok) with URL validation and AR/EN toasts
- [x] Added migration `20260402113000_add_nursery_profile_social_fields.sql` for new nursery profile/social columns on `public.nurseries`
- [x] Updated `NurseriesRow` type in `src/types/tables/foundation.ts` and integrated profile card in `src/pages/admin/AdminSettingsPage.tsx`
- [x] Migration hygiene cleanup (safe): archived duplicate `014_event_invoice_auto_generation.sql`, archived invalid `020b_report_reactions.sql`, added valid replacement `20260328124000_report_reactions.sql`, and successfully ran `supabase db push --include-all` with idempotent notices only

## Completed
- [x] Phase 1: Foundation — 42 DB tables, RLS, auth, 5 roles, routing ✅ March 25, 2026
- [x] Phase DS: Design System — Stitch colors, fonts, layouts, login, reusable components ✅ March 26, 2026
- [x] Phase 0.5: Onboarding Wizard — 6 screens, language preference, saves to Supabase ✅
- [x] Phase 2: Attendance + QR — scanner, health alerts, confirmation card, Edge Function deployed ✅
- [x] Phase 3: Communication — chat, broadcast, notifications, 5 Edge Functions deployed ✅

## Migrations Run
- [x] 006
- [x] 007
- [x] 008
- [x] 009

## Edge Functions Deployed
- [x] `qr-token`
- [x] `whatsapp-dispatch`
- [x] `sms-dispatch`
- [x] `email-dispatch`
- [x] `emergency-broadcast`

## Current Phase
- [x] Phase 4 — Events + Permissions COMPLETE
- [x] Phase 5 — Financial Module COMPLETE
- [x] Phase 6 — Media Gallery COMPLETE
- Completed now: Feature 1 Invoice List Pages (Admin + Parent) + migration 016 (local file)
- Completed now: Feature 2 Invoice Details (Admin + Parent) + Manual Invoice Creation
- Completed now: Feature 3 Parent Payment Page + payment attempts tracking + migration 017 (local file)
- Completed now: Feature 5 Payment Reminders + Financial Reports + migration 018 (local file)
- Completed now: Phase 6 Feature 1 Teacher Media Upload + Media List + migration 019 (local file)
- Completed now: Phase 6 Feature 2 Admin Media Approval Queue + Media Library + moderation workflow
- Completed now: Phase 6 Feature 3 Parent Media Gallery + detail modal + recent photos widget + nav media badge
- Completed now: Phase 10 Feature 1 Teacher Daily Report Card System + migration 020 (local file)
- Completed now: Phase 10 Feature 2 Parent Daily Report View + report reactions/comments + migration 020b (local file)
- Completed now: Phase 10 Feature 3 Milestones Tracking System + migration 021 (local file)
- Completed now: Phase 7 Feature 1 Staff HR Profiles & Schedules + migration 022 (local file)
- Completed now: Phase 7 Feature 2 Staff Payroll + payslip flow + migration 023 (local file)
- Note: Bus tracking deferred to Phase 8/later.
- Completed now: Phase 9 Feature 1 Public Inquiry Form + Inquiries Dashboard + Waitlist + migration 024 (local file)
- Completed now: Phase 9 Feature 2 Application Flow + Document Verification + migration 025 (local file)
- Completed now: Phase 9 Feature 3 Enrollment Activation + Bulk CSV/XLSX Import wizard
- Completed now: Phase 11 Feature 1 Parent Loyalty & Rewards Program + migration 026 (local file)
- Completed now: Phase 11 Features 2-4 (Simplified): Surveys + Inventory + Meal Plans + migration 027 (local file)
- Completed now: Phase 12 Community Board + Content Library (Simplified) + migration 028 (local file)
- Completed now: Staff onboarding wizard (`/admin/staff/onboarding`) + child enrollment wizard (`/admin/children/enroll`) — RHF/Zod, drafts, i18n, Edge Functions `staff-onboarding-complete` + `child-enrollment-complete`, migration 041 storage/JSON extensions (local file)
- Completed now: Staff onboarding hardening — gender required (Zod + Step 5), chain nursery authorization in Edge `staff-onboarding-complete`, migration 042 `staff_profiles` RLS for chain admins, storage upload errors via toast (March 27, 2026)
- Completed now: Migration 043 — `children` RLS rewritten non-recursively (drop all policies; parent SELECT via `parent_children` only; XO/chain/branch/teacher via 031 helpers only; `service_role` ALL) — run `supabase db push` (March 28, 2026)
- Completed now: Migration 044 — `children_parents_select` uses `user_can_access_child(id)` SECURITY DEFINER + `row_security = off` to break `children` ↔ `parent_children` recursion (March 28, 2026)
- Completed now: Migrations 045–047 — RLS recursion fixes: `045` core definer helpers, `046` policies for attendance/events/classes/surveys/nurseries/waitlist/staff_profiles/event_attendees, `047` media helpers + media/media_children/media_visibility policies + `service_role` allowlist (March 28, 2026)
- Completed now: Admin `/admin/attendance` — present-today list loads `children` in a second query (merge by `child_id`) so avatars and `full_name_ar` / `full_name_en` show under RLS; display names follow nursery `language_pref` via `useNurseryLanguagePref` (March 28, 2026)
- Completed now: Teacher + parent daily reports — routes `/teacher/daily-reports`, `/teacher/daily-reports/:childId/:date`, `/parent/daily-reports`; form fields (meals none/some/all, nap duration/quality, mood emoji row, toilet changes, activities tags + text, infant bottle log); Material Symbols; parent reactions love/thanks/happy + comment; legacy JSON hydration (March 28, 2026)
- Completed now: Media gallery workflow — teacher upload (`thumbnail_url` for photos, activity types field_trip/outdoor_play/etc., visibility all_class | tagged_only only), admin queue (tagged child names, bulk approve w/ single toast, Material Symbols), parent gallery (grid thumbnails, filters, modal download/share w/ Material Symbols) (March 28, 2026)
- Completed now: Attendance analytics & reporting — admin dashboard `/admin/attendance/dashboard` (presets + CSV), per-child report `/admin/attendance/child/:childId`, parent history `/parent/attendance` (child filter, 30-day rows); hooks + `attendanceAnalytics` helpers; AR/EN i18n; parent empty state when child not linked (March 28, 2026)
- Completed now: Broadcast & class announcements — migration `050_broadcast_messages_extended.sql` (audience_scope, class_id, channels[], scheduled_for, delivery_status, counts; `notifications.related_broadcast_id`; parent/teacher RLS); admin `/admin/messages/broadcast`, `/admin/messages/broadcasts`, `/admin/classes/:classId/announcements`; teacher `/teacher/classes` hub + `/teacher/classes/:classId/announcements` (in-app only + hint); `src/lib/broadcastOps.ts`; AR/EN i18n (March 28, 2026)
- Completed now: Admin dashboard overhaul — `AdminDashboardPage.tsx` (route `/admin` via `Dashboard` re-export): enhanced stats + trends, activity feed (10 types), Realtime invalidation, quick actions, CSS mini-charts (7-day attendance, 30-day revenue, enrollment by class), alerts strip; hooks `useAdminDashboardEnhancedStats`, `Charts`, `Alerts`, `ActivityFeed`, `Realtime`; `StatsCard` optional `hint`; AR/EN i18n (March 28, 2026)
- Completed now: Parent dashboard — `ParentDashboardPage.tsx` (route `/parent` via `ParentHomePage` re-export): per-child cards (attendance, last report mood/meals, account unread badge), schedule + pickup hint, merged feed (reports/media/events/invoices), quick actions, financial block via `FinancialSummaryCard`; hooks `useParentDashboardChildren`, `Schedule`, `Feed`; AR/EN i18n (March 28, 2026)
- Completed now: Admin financial overview — `/admin/financial/dashboard` (`AdminFinancialDashboardPage.tsx` + `useAdminFinancialDashboard`, `financialDashboardHelpers`, chart/table subcomponents): KPIs (period revenue vs prior period, outstanding, on-time collection rate, avg invoice in period), 6-month revenue bars, payment-method pie (completed payments), invoice status counts/amounts, top parents (6 months), last 20 filtered payments with invoice links, CSV export, AR/EN i18n; sidebar nav entry (March 28, 2026)
- Completed now: Staff management — `/admin/staff` (`AdminStaffDirectoryPage.tsx`): table with avatar, filters (department, status), search, CSV import/export, row → profile; `/admin/staff/:staffId` (`AdminStaffProfilePage.tsx`): profile, attendance month calendar + stats + history, payroll history, documents upload to `staff-documents` + signed URLs, edit dialog, deactivate confirm, certificate toast; `/admin/staff/payroll` (`AdminPayrollPage.tsx`): overview, bulk generate payroll, bulk mark paid, CSV export, redirects from `/admin/payroll`; hooks `useStaffAttendanceMonth`, `useStaffPayrollRecords`; `usePayroll` bulk mutations; `AdminStaffListPage` re-exports directory; AR/EN i18n (March 28, 2026)
- Completed now: Child health & safety — migrations `051_child_health_system.sql`, `052_child_health_documents.sql`, `053_child_health_records_parent_insert.sql` (local files; run `supabase db push`); admin `/admin/children/:childId/health` (`AdminChildHealthProfilePage.tsx`), parent `/parent/children/:childId/health` (`ParentChildHealthPage.tsx`), alerts `/admin/health/alerts` (`AdminHealthAlertsDashboardPage.tsx`); hooks `useChildHealth`, `useChildHealthMutations`, `useHealthAlerts`, `useParentHealthActions`; shared `src/components/health/*`; `healthNotifications` + `healthAlertsCompute`; AR/EN i18n; Material Symbols; life-threatening allergy banner (March 28, 2026)
- Completed now: **Wave 6 (final)** — PWA: `public/sw.js` v2 caches (offline-first navigation shell + HTML refresh, stale-while-revalidate for `/assets/*`, Supabase REST GET, Google Fonts/Material font CSS); push + notification click with `postMessage` fallback + `ServiceWorkerNavigateBridge` for SPA deep links; `public/manifest.json` (`id`, `start_url` `/?source=pwa`, theme `#000613` / surface `#f7f9fb`, shortcuts: parent/teacher/reports/attendance/admin/parent attendance); `PWAInstallPrompt` (`beforeinstallprompt`, 7-day snooze, iOS dialog, `appinstalled` → `install_completed` analytics); `OfflineIndicator` (Material `cloud_off`, `aria-label`); admin layout wired with offline + install banner; `useWebPushSetup` + `054_user_push_subscriptions.sql` (permission only on user action); RTL: layout comments, `DialogContent`/`DialogFooter` RTL + focus ring + `common.close`, `rtlTestingChecklist.ts`, parent/teacher nav `aria-label` + avatar alt i18n, global `:focus-visible`; avatars default `loading="lazy"`; `lazyPages.tsx` + Vite `manualChunks`; `.env.example` documents `VITE_VAPID_PUBLIC_KEY` (March 28, 2026)

## Partner Interview Updates

### Phase 2 additions
- Pickup photo capture
- Proactive pickup reminder (30 min before expected pickup)
- Medication photo proof with photo sent to parent
- Clinic return QR flow with checklist
- Per-child photo privacy flag (`photo_privacy_restricted` boolean on `children`)

### Phase 5 updates
- Configurable billing per parent (package/hourly/hybrid)
- Invoice overlap detection (bus delay + extra hours, extra course + extra hours)

### Phase 13 updates
- Summer pause configurable per nursery
- Min 2 weeks, max 4 months
- Some nurseries run summer camps

### Phase 8 deprioritized
- CCTV moved to after launch
- Expert did not mention CCTV as a priority

### Phase 21 additions (after launch)
- AI Help Tool: chat widget in admin portal
- AI Acting Agent: reads DB, takes actions, flags patterns, generates reports
- Powered by Anthropic Claude API
- Admin only

## Operational Improvements From Interview
- Internal communication must fully replace WhatsApp groups
- Summer pause is customizable per nursery
- Substitute teacher: show available staff first, build complexity later

## Next Session Prompt

```
We are continuing Phase 4 Events + Permissions.
Read .cursorrules and PROGRESS.md first.
Event creation form /admin/events/new is being built.
Event type mappings confirmed: general, trip, health, celebration, meeting.
Migration 009 permission_deadline already run.
Continue building feature 1 event creation form.
Tell me what you will build and wait for OK.
```
