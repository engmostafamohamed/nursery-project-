# Engineering Health & Roadmap

Last reviewed: **2026-10-08**. Owner: XO technical owner.

This is the single list of known engineering problems in the XO nursery platform and the agreed
direction for fixing them: finance/payments/HR, code structure, versioning, testing, and
logging/monitoring. Read it before working on invoices, payments, payroll or project structure.
When an item is fixed, tick it and add the date and PR, so the list stays true.

Status: `[ ]` open · `[~]` partly done · `[x]` done

Related documents: [incident-runbook.md](incident-runbook.md), [backup-and-recovery.md](backup-and-recovery.md),
[rbac-roles-positions-features.md](rbac-roles-positions-features.md), and the structure plans in this folder
(`xo-platform-modular-monolith-vertical-slices.pdf`, `xo-platform-structure-plan.pdf`).

---

## 1. Snapshot (2026-10-08)

| Measure | Value | Why it matters |
|---|---|---|
| TypeScript files in `src/` | ~630 (components 209, pages 148, hooks 123, lib 81, features 42) | Most code is grouped by file *type*, not by feature |
| Feature folders in `src/features/` | 3 (child-enrollment, parent-signup, staff-onboarding) | The feature structure exists but almost nothing uses it |
| Largest files | `ParentApplicationFormPage.tsx` 2,151 lines · `ParentSignUpPage.tsx` 1,851 · `ParentRegistrationTemplatesEditor.tsx` 1,283 · `DelegatePickupQrCard.tsx` 1,101 | Hard to read, review and test |
| `supabase.from(...)` calls | 242, in 33 page/component files directly | Data access is spread through the UI |
| `as never` casts | 252 | Database types are hand-written, so the compiler cannot check queries |
| Inline `queryKey: [...]` literals | 352 | Cache invalidation depends on matching strings by hand |
| Locale files | 6,255 lines each, one file per language | Every feature edits the same two files |
| Migrations / edge functions | 215 / 20 | Migrations are applied straight to production |
| Automated tests | **0** | Nothing catches a regression before users do |
| Error monitoring | **none** | Errors are seen only when someone reports them |
| CI | typecheck and lint run with `continue-on-error`; 115 TS errors on `main` | A broken change can still deploy |
| App version | `0.0.0`, no git tags | No way to say which version a user runs or roll back by version |

---

## 2. Finance, payments & HR — known problems

Evidence was taken from the live database on 2026-10-08. Some rows may be demo data, but the system allowed them.

| # | Problem | Evidence | Risk | Status |
|---|---|---|---|---|
| F1 | Invoice status is written by hand, not derived from money received | 42 of 71 invoices are `paid` with **no payment row**; 43 paid invoices whose payments do not add up to the amount | Reports and balances cannot be trusted | [ ] |
| F2 | Admins and finance managers can `UPDATE` `invoices.amount` / `status` directly from the browser (RLS `ALL`/`UPDATE` policies) | `invoices_branch_all`, `invoices_chain_all`, `invoices_finance_manager_update` | Silent mistakes or manipulation, no trace | [ ] |
| F3 | No audit log for money or HR tables | Only `role_assignments_log` and `child_routine_logs` exist | Cannot answer "who changed this, when, from what" | [ ] |
| F4 | No ledger, credit notes or refunds; discounts change the invoice amount in place | Loyalty redemption lowers `invoices.amount` and appends a line | History of what was billed is lost | [ ] |
| F5 | Invoice lines live in `line_items_json` (JSONB) with no constraints | Nothing stops the same attendance day / subscription month being billed twice except app logic | Double billing | [ ] |
| F6 | "Overdue" has two sources | Stored `status='overdue'` on 6 rows; computed in the client elsewhere | Different screens show different states | [ ] |
| F7 | Payroll is marked paid by a direct browser update (`usePayroll.markPaid`) | No lock, no idempotency, no approval, no unique (staff, period) rule, no trigger | Salary paid twice or changed after payment | [ ] |
| F8 | Online payment gateway not integrated | `src/lib/paymob/initiatePayment.ts` is a stub | Every payment needs manual confirmation | [ ] |
| F9 | No reconciliation | Nothing compares invoices, payments, attempts and gateway settlements | Mismatches are found by customers | [ ] |
| F10 | Pending payments can wait forever | No expiry or reminder on `payment_attempts` in `pending_confirmation` | Parents think they paid; finance never sees it | [ ] |

Already fixed (migration `20261007000000_notification_templates_payments_hardening.sql`):

- [x] One server function per money action: `submit_invoice_payment`, `confirm_invoice_payment_attempt`, `reject_invoice_payment_attempt`, `admin_record_invoice_payment`, `redeem_loyalty_points`.
- [x] Idempotency keys (unique) on `payment_attempts`, `payments` and `loyalty_transactions`; unique `paymob_transaction_id` and `payments.gateway_ref`.
- [x] The invoice row is locked while a payment is recorded; an amount above the unpaid balance is refused; the same amount submitted again within 2 minutes is refused.
- [x] Confirmation dialogs and single-flight buttons on every payment action in the UI.
- [x] Loyalty points awarded once per payment on the server.
- [x] Notifications stored as template keys + parameters (no translated text in SQL).

### 2.1 Target finance design

1. **Ledger, append-only.** A `ledger_entries` table records every money movement: invoice issued (+), payment (−),
   credit note / discount (−), refund (+), write-off (−). Rows are never updated or deleted; a correction is a reversing entry.
   An invoice's balance is the sum of its entries and its status is derived from that balance (view or trigger), never typed in.

   ```sql
   create table public.ledger_entries (
     id uuid primary key default gen_random_uuid(),
     nursery_id uuid not null references public.nurseries(id),
     invoice_id uuid not null references public.invoices(id),
     kind text not null check (kind in ('invoice','payment','credit_note','refund','write_off','reversal')),
     amount numeric(12,2) not null,            -- signed: + owed, - settled
     currency text not null default 'EGP',
     source_type text, source_id uuid,          -- payment id, refund id, ...
     idempotency_key uuid unique,
     created_by uuid, created_at timestamptz not null default now()
   );
   ```

2. **Invoice lines in a real table** (`invoice_lines`) with `kind`, `name_ar`/`name_en`, quantity, unit price, and a
   `source_type`/`source_id` (attendance day, subscription month, event, package). A unique index on the source prevents
   billing the same thing twice.
3. **Issued invoices are immutable.** A change is a void + re-issue or a credit note. Closed accounting months are locked.
4. **Writes only through server functions.** Remove `INSERT`/`UPDATE`/`DELETE` RLS policies for `authenticated` on
   `invoices`, `payments`, `payment_attempts`, `staff_payroll`; keep `SELECT`. Every write is a `SECURITY DEFINER` RPC with
   a role check, a row lock and an idempotency key.
5. **State machines.** Invoice: `draft → issued → partially_paid → paid` or `void`. Payment attempt:
   `pending → confirmed | failed | cancelled | expired`. Payroll: `draft → approved → paid`. Transitions are checked in SQL.
6. **Maker–checker.** Refunds, waivers, payroll payments and manual "mark as paid" above a set amount need a second person to approve.
7. **Audit log.** One generic trigger writes `audit_log(table_name, row_id, action, old_row, new_row, actor_id, at)` on
   invoices, payments, payment attempts, payroll, nursery fee settings and loyalty.
8. **Payroll runs.** `payroll_runs` (one per nursery per month) with `payroll_lines` per employee: base, allowances,
   deductions, social insurance, tax. Unique `(staff_id, period)`. Approve the run → generate immutable payslips →
   mark paid with a bank transfer reference.
9. **Gateway (Paymob / Fawry).** Create the payment on the server; confirm only from the signed webhook (HMAC checked,
   amount checked); store every raw webhook in `payment_events` for replay; reconcile daily against the provider's settlement report.
10. **Reconciliation job** (pg_cron, nightly) — see §5.3.

---

## 3. Code structure (clean code)

### 3.1 Problems

- [ ] Code is grouped by type (`components/`, `hooks/`, `pages/`, `lib/`), so one feature such as payments is spread
      over a dozen folders, and 123 hooks share one flat folder.
- [ ] Pages and components call Supabase directly (33 files); the same query is written in several places.
- [ ] Very large files (2,000+ lines) mix data access, state, validation and markup.
- [ ] Database types are hand-written; 252 `as never` casts switch the type checker off.
- [ ] Query keys are string literals in 352 places; a typo silently breaks cache refresh.
- [ ] Notification inserts were duplicated in ~15 places (now centralised in `src/lib/notificationText.ts`); similar
      duplication remains elsewhere (signed URLs, storage uploads, name formatting).
- [ ] One 6,000-line locale file per language that every feature edits.

### 3.2 Target: modular monolith with feature folders (vertical slices)

```
src/
  app/                    # bootstrap, providers, router, layouts (no business logic)
  features/
    payments/
      api/                # the ONLY place that calls supabase for this feature (RPC/REST wrappers)
      model/              # types, zod schemas, pure functions (no React, no Supabase)
      hooks/              # React Query hooks built on api/ + queryKeys
      components/         # feature UI
      pages/              # route components: compose components, no data access
      queryKeys.ts        # key factory for this feature
      index.ts            # public API: what other features may import
      __tests__/ or *.test.ts(x) next to the file
    invoices/ attendance/ payroll/ notifications/ admissions/ children/ events/ loyalty/ ...
  shared/
    ui/                   # design-system components (button, dialog, confirm, ...)
    lib/                  # supabase client, i18n, datetime, money, errors
    hooks/                # generic hooks (useSingleFlight, ...)
    types/database.gen.ts # generated by `supabase gen types`
  locales/{ar,en}/<feature>.json   # one namespace per feature
supabase/
  migrations/  functions/  tests/<feature>/*.sql (pgTAP)
```

### 3.3 Rules

1. **Dependency direction:** `app → features → shared`. A feature imports another feature only through its `index.ts`.
   Enforce with ESLint (`import/no-restricted-paths` or `eslint-plugin-boundaries`).
2. **Data access** lives in `features/*/api/`. Components never import the Supabase client.
3. **Generated types:** `npx supabase gen types typescript --project-id hlhlpjecinkqqsqrjpcj > src/shared/types/database.gen.ts`,
   run in CI to detect drift. Remove `as never` as each query moves to `api/`.
4. **Validate RPC results** with zod in `api/`, so a changed SQL function fails loudly in one place.
5. **Query keys** come from each feature's `queryKeys.ts` factory, never inline arrays.
6. **Size limits** (review guideline): component ≤ 300 lines, function ≤ 50 lines. Split by responsibility, not by line count alone.
7. **No translated text in SQL or stored rows.** Store keys and parameters; words live in locale files
   (see `notificationTemplates`, `invoice.itemKinds`).
8. **Money** is `numeric(12,2)` in SQL and formatted only through one helper on the client.
9. **Errors** use codes (`payment_*`, `attendance_*`) mapped to locale messages; never show raw database text.

### 3.4 Migration plan (incremental, no big-bang)

Move one feature per PR, starting with the riskiest: `payments` → `invoices` → `payroll` → `attendance` →
`notifications` → the rest. New code goes into `features/` from now on. Each move: create `api/` + `queryKeys.ts`,
switch the pages to it, delete the old hooks, add tests for the moved logic.

---

## 4. Versioning & releases

### 4.1 App version — Semantic Versioning

- `MAJOR.MINOR.PATCH`. Stay on `0.x` until the first paying production nursery, then release `1.0.0`.
  - PATCH: bug fix, no behaviour change for users.
  - MINOR: new feature, backwards compatible.
  - MAJOR: a breaking change (removed screen or flow, data model change needing a migration of user habits).
- Commit messages follow **Conventional Commits** (already partly used): `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`,
  with `!` or a `BREAKING CHANGE:` footer for breaking changes. Check PR titles in CI (commitlint).
- **release-please** (GitHub Action) reads the commits, opens a release PR that bumps `package.json`, updates
  `CHANGELOG.md`, and on merge creates the git tag `vX.Y.Z` and a GitHub Release.
- The version and git SHA are injected at build time (Vite `define: { __APP_VERSION__, __GIT_SHA__ }`), shown on the
  settings/about screen, and sent as the Sentry `release`. The PWA shows "new version available" when the version changes.

### 4.2 Branches and environments

| Environment | Supabase | Frontend | Deployed when |
|---|---|---|---|
| Local | `supabase start` (Docker) + `seed.sql` | `npm run dev` | — |
| Staging | separate Supabase project | Vercel preview / `staging` branch | every merge to `main` |
| Production | `hlhlpjecinkqqsqrjpcj` | Vercel production | a release tag `vX.Y.Z` |

Trunk-based: short-lived branches → PR → CI (typecheck, lint, unit, db tests, build) → merge to `main` → staging →
tag → production. No direct pushes to `main`, no manual changes in production.

### 4.3 Database migrations

- The timestamped files in `supabase/migrations/` **are** the schema's version history. Never edit an applied migration;
  add a new one.
- Apply with `supabase db push` from CI: staging first, production on release. **Stop applying migrations by hand to
  production** (done until 2026-10-07 through the Management API).
- Staging migrations are run manually from the `main` branch using the
  **Supabase staging migrations** workflow. Configure the `staging` GitHub environment with
  `SUPABASE_ACCESS_TOKEN`, `SUPABASE_STAGING_PROJECT_REF`, and `SUPABASE_STAGING_DB_PASSWORD`.
  The workflow previews pending migrations before applying them and never targets production.
- **Expand → migrate → contract:** add new columns/functions first, ship code that uses them, remove the old ones in a later
  release. A migration must never break the app version currently in users' browsers (the PWA may run old code for days).
- Every migration runs in a transaction and is tested on staging with production-like data; run `supabase db diff` in CI
  to catch drift between the files and the real schema.

### 4.4 RPCs, edge functions and locale keys

- RPC changes are additive (new optional parameters with defaults). A breaking change gets a new name (`submit_invoice_payment_v2`);
  the old one stays until no supported app version calls it.
- Edge functions deploy from CI on release and return an `x-app-version` header.
- Locale keys are added freely; a key is removed only after no released code uses it.

---

## 5. Logging, monitoring & alerting

### 5.1 Errors

- [ ] **Sentry** in the React app: route-level error boundaries, `release` = app version, source maps uploaded in CI,
      PII scrubbing (no national IDs, phones masked). The Sentry event id is shown to the user as a support reference.
- [ ] **Sentry (Deno)** or structured logging in every edge function.
- [ ] Replace the 27 stray `console.*` calls with a small `logger` (levels, context, sends warnings/errors to Sentry).

### 5.2 Logs

- **Structured JSON** in edge functions: `{ level, fn, requestId, nurseryId, userId, action, durationMs, errorCode }`.
- **Supabase logs** (API, Postgres, Auth, Edge) forwarded with a log drain to Better Stack, Axiom or Datadog, with
  30–90 days retention.
- **Business events:** an `app_events` table for important actions (payment submitted, confirmed, rejected, webhook
  received, payroll approved/paid, attendance corrected). The `attendance_events` table already does this for attendance.
- **Audit log** (see §2.1) for who changed money and HR data.
- Never log passwords, tokens, full national IDs, card data or full phone numbers.

### 5.3 Monitors and alerts

- [ ] Nightly **reconciliation job** (pg_cron) writing to `finance_alerts` and notifying finance:
  - invoices `paid` whose ledger/payments do not equal the amount;
  - `payment_attempts` pending for more than 48 hours;
  - gateway transactions with no invoice, or invoices paid twice;
  - payroll lines paid without a payment reference, or two lines for the same staff and period.
- [ ] **Cron health:** alert when a job in `cron.job_run_details` fails or did not run on schedule
      (payment reminders, late-pickup sweep, pickup reminders, daily close, tuition billing).
- [ ] **Uptime checks** (Better Stack or UptimeRobot) on the app URL, a health-check edge function and the payment webhook URL.
- [ ] **Alert routing:** critical (webhook failures, reconciliation mismatch, cron failure, error-rate spike) → technical
      owner immediately; finance items → finance managers in-app; daily digest by email.
- [ ] **Ops dashboard** for XO admins: pending attempts, failed webhooks, open finance alerts, error rate, last cron runs.
- [ ] **Kill switch:** a setting that turns off online payment immediately during an incident.
- [ ] Extend [incident-runbook.md](incident-runbook.md) with a payment incident section: kill switch → reconcile → refund/correct with ledger entries → notify parents.

---

## 6. Testing strategy

There are no automated tests today. Target pyramid:

| Level | Tool | What it covers | Where |
|---|---|---|---|
| Unit | **Vitest** | Pure logic: money and date formatting, `notificationText`, `invoiceItems`, `paymentApi` error mapping, validation schemas, attendance calculations | `*.test.ts` next to the file |
| Component / hook | **Vitest + React Testing Library + MSW** | Forms with live inline errors, confirm dialogs, single-flight buttons, hooks with mocked Supabase REST | `*.test.tsx` next to the file |
| Database | **pgTAP** (`supabase test db`) | Every money/attendance RPC and every RLS policy, including cross-tenant denial | `supabase/tests/<feature>/*.sql` |
| End to end | **Playwright** | Login per role, pay an invoice (incl. double click), finance confirm/reject, scanner manual code, application submission | `e2e/*.spec.ts` |

### 6.1 Required tests per feature

| Feature | Unit / component | Database (pgTAP) | E2E |
|---|---|---|---|
| Payments | error-code mapping, idempotency key reuse, single-flight, confirm dialog | submit (duplicate, over balance, other parent's invoice), confirm twice, reject twice, record twice, redeem limits | parent pays, finance confirms |
| Invoices | line description resolver, notes, totals | invoice generation (tuition, application, event, late pickup), no double billing | admin creates and edits an invoice |
| Payroll | totals, period validation | approve/pay once, unique (staff, period), RLS | mark paid with confirmation |
| Attendance | late-minutes estimate, scan result mapping | check-in/out, too-soon, QR checks, late charge, correction, waiver, sweep, KPIs | scanner manual code flow |
| Notifications | every template renders in ar/en with its params | `notify_users` recipients, no text columns written | — |
| Auth/RBAC | role guards | RLS cross-tenant suite (`npm run ops:cross-tenant`) | login per role |

The rollback test scripts used on 2026-10-06/07 for attendance and payments are the starting point for the pgTAP suites.

### 6.2 Rules

- Tests never touch production. Database tests run on `supabase start` with `supabase/seed.sql` fixtures.
- New finance or attendance code ships with tests; coverage gate ≥ 80% for `features/payments`, `invoices`, `payroll`, `attendance`.
- CI runs unit + db tests on every PR, E2E on merge to `main` (against staging).

### 6.3 Setup

```bash
npm i -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/user-event msw @playwright/test
```

`package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:db": "supabase test db"`,
`"test:e2e": "playwright test"`.

---

## 7. Roadmap

### Phase 1 — safety net (1–2 weeks)
- [ ] Remove direct write policies on `invoices` and `staff_payroll`; payroll "mark paid" through an RPC with idempotency and confirmation.
- [ ] `audit_log` trigger on money and HR tables.
- [ ] Nightly reconciliation job + `finance_alerts` + cron health alert.
- [ ] Sentry (frontend + edge functions) with releases.
- [ ] Staging Supabase project; migrations through `supabase db push` in CI only.
- [ ] Vitest + pgTAP set up; first suites for payments and attendance.
- [ ] Fix the 115 TS errors, then make typecheck and lint blocking in CI.
- [ ] release-please + `CHANGELOG.md`; first tag.

### Phase 2 — correct money model
- [ ] `ledger_entries`, `invoice_lines`, credit notes and refunds; derive invoice status from the ledger.
- [ ] Backfill legacy data (paid invoices without payments → `legacy` ledger entries, reviewed by finance).
- [ ] Payroll runs with maker–checker and immutable payslips.
- [ ] Start moving code into `features/` (payments, invoices, payroll first) with generated DB types.

### Phase 3 — automation
- [ ] Paymob (cards, wallets, kiosk) and/or Fawry with webhooks, `payment_events`, daily settlement reconciliation.
- [ ] Monthly period close; finance reports from the ledger.
- [ ] Playwright E2E in CI; ops dashboard; uptime checks.

---

## 8. Decision log

| Date | Decision |
|---|---|
| 2026-10-06 | Attendance writes go through audited RPCs (`record_attendance_check_in/out`, corrections, waivers); every scan writes an `attendance_events` row. |
| 2026-10-07 | No translated text in SQL or stored rows: notifications store `template_key` + `template_params`, invoice lines store `kind` + names; words live in `src/locales`. |
| 2026-10-07 | Every payment action is one locked, idempotent server function; the UI adds confirmation dialogs and single-flight buttons. |
| 2026-10-08 | Target architecture: modular monolith with feature folders on React + Supabase (no microservices); money moves to an append-only ledger. |
