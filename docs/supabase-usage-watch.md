# Watching Supabase limits (XO)

## What we can and cannot do

- **The app cannot email or WhatsApp you** when Supabase hits a limit. That only happens if **you** turn on alerts in Supabase (or another tool you connect).
- **In Cursor**, the AI follows `.cursorrules`: when you ask about hosting, costs, scaling, or “are we safe?”, it should remind you to check **Usage** and (if needed) **spend caps**.

## Where to look (you, in the browser)

1. **Organization usage (all projects):**  
   [supabase.com/dashboard/org/_/usage](https://supabase.com/dashboard/org/_/usage)  
   Shows database size, egress, Auth, Realtime, Edge Functions, etc., against your plan.

2. **Project overview:**  
   Your project → **Settings** / **Reports** as shown in the Dashboard (varies by Supabase UI version).

3. **Control unexpected charges:**  
   [Control your costs](https://supabase.com/docs/guides/platform/spend-cap) (spend cap / billing settings in the org).

## Optional: CLI check (developer machine only)

If you create a **Personal Access Token** (Dashboard → **Account** → **Access Tokens**), you can run locally:

```bash
export SUPABASE_ACCESS_TOKEN='your_pat_here'
npm run ops:usage
```

This calls the Management API for **disk utilization** (one useful signal). Do **not** commit the token. The PAT is **not** the same as `SUPABASE_SERVICE_ROLE_KEY`.

## Free plan reminder

On **Free**, some features (for example **PITR**) are not available. Limits still apply to storage, egress, and Auth — use **Organization → Usage** to see trends.
