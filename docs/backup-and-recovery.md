# Backup And Recovery Policy

## Scope
- Applies to all XO nursery tenants in the shared Supabase project.
- Covers database records and storage objects needed for nursery operations.

## Baseline Strategy
- Platform backup: rely on Supabase managed backups/PITR for full-project disaster recovery.
- Tenant backup: use tenant export jobs to generate nursery-scoped logical snapshots.
- Retention target:
  - Daily tenant exports: 30 days.
  - Weekly tenant exports: 12 weeks.
  - Monthly tenant exports: 12 months.

## RPO/RTO Targets
- Recovery Point Objective (RPO): up to 1 hour for project-level incidents.
- Recovery Time Objective (RTO): up to 4 hours for project-level restore and verification.
- Tenant export restore target: same business day after request approval.

## Service-role seed export (staging / CI)

If you cannot call Edge Functions with your anon key, run a one-off export using the **service role** only on a secure machine:

`NURSERY_ID=<uuid> npm run ops:seed-export`

This mirrors the `tenant-export` function’s payload and storage layout. **Never** expose the service role key or run this from client code.

## Edge Function export (CLI)

If `npm run ops:trigger-export` returns **401 Invalid JWT**, the Functions gateway is rejecting the `apikey` header. Set **`SUPABASE_ANON_JWT`** in your shell or `.env` to the **legacy JWT** “anon public” key from Supabase Dashboard → Project Settings → API (starts with `eyJ...`), then run the script again. Publishable keys (`sb_publishable_*`) may work for Auth/PostgREST but not for all Edge Function routes.

## Operational Steps
1. Run integrity checks before backup/export (`npm run ops:integrity`).
2. Trigger tenant export from Admin Settings or via `tenant-export` edge function.
3. Verify artifact checksum against `tenant_export_artifacts.checksum_sha256`.
4. Record backup evidence in `PROGRESS.md` after each drill or production incident.

## Restore Approach
- Full restore: use Supabase managed restore flow, then run integrity checks.
- Tenant scoped restore:
  - Load export artifact into staging.
  - Validate table references and nursery ownership.
  - Execute approved import/restore script for target nursery only.

## Security Controls
- Export bucket `tenant-exports` is private.
- Export access is role-gated to branch admin / chain super admin / XO super admin.
- Export files are nursery-scoped by object path: `<nursery_id>/<job_id>.json`.

## Verification Checklist
- Core RLS enabled (`children`, `users`, `media`, `daily_reports`, `attendance_records`).
- No public avatar/object policy exposing tenant files.
- Tenant export job status reaches `completed`.
- Export artifact checksum matches stored checksum.
