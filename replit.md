# XO Platform

A React + Vite single-page application connected to Supabase for backend/auth/database.

## Stack

- **Frontend**: React 19, TypeScript, Vite 8
- **Styling**: Tailwind CSS, Radix UI, shadcn/ui components
- **State**: Zustand, TanStack React Query
- **Auth/DB**: Supabase (`@supabase/supabase-js`)
- **Forms**: React Hook Form + Zod
- **Routing**: React Router v7
- **i18n**: i18next + react-i18next

## Running on Replit

The dev server runs on **port 5000** (`npm run dev`), configured via the "Start application" workflow.

Vite is configured with `host: '0.0.0.0'` and `allowedHosts: true` for Replit proxy compatibility.

## Required Environment Variables

Set these in the Replit Secrets panel:

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_VAPID_PUBLIC_KEY` | (Optional) Web Push VAPID public key |

## Parent Self-Registration

A multi-step sign-up wizard at `/signup` allows parents to register themselves and their child. Features:

- **9-step form**: Child Info → Parents → Family → Enrollment → Health → Emergency → Daily Care → Pickups → Consents
- **Dual-parent login**: Either mother or father email can be used; both get Supabase auth accounts
- **Per-step validation**: Required fields are validated before allowing navigation to the next step
- **Bilingual**: Full Arabic and English translations
- **Data models**: `ChildrenRow`, `UsersRow`, `ParentChildrenRow`, `AuthorizedPickupsRow` updated with new fields (name parts, nationality, department, daily care preferences, emergency contacts, occupation, authorization levels)
- **Submission**: Creates Supabase auth user, then calls `parent-signup-complete` edge function for enrollment persistence

### Key files:
- `src/features/parent-signup/` — Types, validation schema, defaults, submission logic
- `src/pages/auth/ParentSignUpPage.tsx` — Multi-step wizard UI
- `src/types/tables/foundation.ts` — Updated data models (ChildrenRow, UsersRow, etc.)

## Project Structure

```
src/
  App.tsx          - Root app component
  main.tsx         - Entry point
  components/      - Shared UI components
  features/        - Feature modules
    parent-signup/ - Parent self-registration feature
  pages/           - Route-level page components
  hooks/           - Custom React hooks
  store/           - Zustand stores
  lib/             - Supabase client, i18n, utilities
  router/          - React Router config
  providers/       - Context providers
  types/           - TypeScript types
  utils/           - Utility functions
  locales/         - i18n translation files (en.json, ar.json)
```

## Multi-Child Parent Dashboard

Parents with multiple children get enhanced views across the app:

- **ChildSelector** (`src/components/parent/ChildSelector.tsx`): Shared component with "All Children" option, used by invoices and attendance pages
- **Invoice filtering**: `useParentInvoices` joins `event_invoices` to resolve per-child invoice associations; supports `childId` filter parameter
- **Dashboard totals**: Summary row showing checked-in count and unread notifications across all children
- **Financial breakdown**: Per-child outstanding amounts in `FinancialSummaryCard`, with proportional splitting for shared invoices
- **Attendance history**: Uses shared `ChildSelector`; auto-selects first child

## Bulk Import (Cherries / Google-Forms format)

`/admin/import` lets a nursery admin upload an XLSX/CSV exported from a Google
Form (e.g. `Active_Kids_Data.xlsx`, 65 columns). The flow is:

1. **AI mapping** — `ai-import-mapper` Edge Function asks GPT to map sheet
   columns onto our schema; admin reviews on `/admin/import/review/:jobId`.
2. **Bulk insert** — `process-import` Edge Function runs the mapping row-by-row.
   It now:
   - Creates a Supabase auth user for each unique parent email via
     `auth.admin.inviteUserByEmail` (the `handle_new_user` trigger then
     populates `public.users`). Parents receive a "set password" email and on
     first login land on the existing multi-child parent dashboard.
   - Populates `child_dietary_preferences`, `child_diaper_care`,
     `child_allergies`, and `authorized_pickups` (up to 2) when the AI maps
     columns onto those tables.
   - Embeds emergency contacts on `children.emergency_contacts` jsonb and any
     unrecognised cells on `children.daily_care_preferences` jsonb so nothing
     is silently dropped.
   - Normalises Egypt phones to `+20…`, Excel time fractions to `HH:MM:SS`,
     `M/D/YYYY` and Excel-serial dates to ISO, and common nationality typos
     ("Egyptain"/"Egyption" → "Egyptian").

Migration `20260417180000_cherries_import_alignment.sql` adds:
- `users.lead_source` (referral source from the Google Form)
- `nurseries.lead_sources` jsonb catalog
- backfill from the legacy typo column `children.school_admissions_plan` into
  the canonical `children.school_admission_plan`.

## Scripts

- `npm run dev` — Start dev server (port 5000)
- `npm run build` — TypeScript check + Vite build
- `npm run lint` — ESLint
- `npm run seed:demo` — Seed demo data (requires Supabase env vars)
