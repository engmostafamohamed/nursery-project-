import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const nurseryId = process.env.NURSERY_ID;

if (!url || !serviceKey || !nurseryId) {
  console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, and NURSERY_ID.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data: jobs, error: jobsError } = await admin
    .from('tenant_export_jobs')
    .select('id,status,created_at,completed_at')
    .eq('nursery_id', nurseryId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (jobsError) throw jobsError;
  if (!jobs || jobs.length === 0) throw new Error('No export jobs found for nursery.');

  const job = jobs[0];
  if (job.status !== 'completed') throw new Error(`Latest export job is not completed (status=${job.status}).`);

  const { data: artifacts, error: artifactError } = await admin
    .from('tenant_export_artifacts')
    .select('storage_bucket,storage_object_path,checksum_sha256,bytes_size,created_at')
    .eq('job_id', job.id)
    .limit(1);
  if (artifactError) throw artifactError;
  if (!artifacts || artifacts.length === 0) throw new Error('No artifact found for latest export job.');

  console.log(
    JSON.stringify(
      {
        job,
        artifact: artifacts[0],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
