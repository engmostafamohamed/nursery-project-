# Incident Runbook

## Trigger Conditions
- Suspected cross-tenant data access.
- Missing tenant data or failed writes.
- Backup/export failures for production nursery.

## Roles
- Incident lead: XO technical owner.
- Database operator: executes Supabase recovery actions.
- Product owner: communicates status to nursery operators.

## Immediate Response
1. Freeze risky operations (disable affected UI actions if needed).
2. Collect evidence:
   - error logs
   - affected nursery IDs
   - impacted tables/storage paths
3. Run `npm run ops:integrity` and store output.

## Containment
- If isolation issue is detected:
  - apply latest isolation migration
  - verify RLS/policies again
  - confirm no public storage policy is active for tenant data

## Recovery
1. For full-project incident:
   - execute Supabase managed restore to safe point.
   - run integrity script suite.
2. For tenant-scoped incident:
   - request latest tenant export artifact.
   - restore in staging first, validate counts and sample records.
   - apply scoped restore to production nursery.

## Communication Template
- Incident start time:
- Nurseries affected:
- User-facing impact:
- Current mitigation:
- Next update ETA:

## Exit Criteria
- Integrity checks pass.
- Tenant can access own data normally.
- No cross-tenant access reproduced in negative tests.
- Post-incident summary added to `PROGRESS.md`.
