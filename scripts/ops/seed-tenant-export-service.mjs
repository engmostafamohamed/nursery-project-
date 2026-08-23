/**
 * Create a completed tenant export using the service role only (no Edge Function JWT).
 * Use for staging/ops when `sb_publishable_*` keys return 401 on `functions/v1`.
 * Never run from the browser; never commit the service role key.
 *
 * Env:
 * - VITE_SUPABASE_URL or SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - NURSERY_ID (required)
 * - REQUESTED_BY_USER_ID (optional: users.id in that nursery; defaults to first branch_admin)
 */
import process from 'node:process';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const nurseryId = process.env.NURSERY_ID;
let requestedBy = process.env.REQUESTED_BY_USER_ID;

if (!url || !serviceKey || !nurseryId) {
  console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, NURSERY_ID.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function sha256Hex(input) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

async function main() {
  if (!requestedBy) {
    const { data: u, error } = await admin
      .from('users')
      .select('id')
      .eq('nursery_id', nurseryId)
      .eq('role', 'branch_admin')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!u?.id) {
      const { data: anyUser, error: e2 } = await admin
        .from('users')
        .select('id')
        .eq('nursery_id', nurseryId)
        .limit(1)
        .maybeSingle();
      if (e2) throw e2;
      if (!anyUser?.id) throw new Error('No user found for nursery to set requested_by.');
      requestedBy = anyUser.id;
    } else {
      requestedBy = u.id;
    }
  }

  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();

  const { data: insertJob, error: insertErr } = await admin
    .from('tenant_export_jobs')
    .insert({
      nursery_id: nurseryId,
      requested_by: requestedBy,
      status: 'processing',
      started_at: nowIso,
      expires_at: expiresAt,
      export_scope: 'core',
    })
    .select('id')
    .single();

  if (insertErr || !insertJob) throw new Error(insertErr?.message ?? 'insert job failed');

  const jobId = insertJob.id;

  try {
    const [childrenRes, usersRes, classesRes] = await Promise.all([
      admin
        .from('children')
        .select('id, full_name_ar, full_name_en, class_id, status, created_at, updated_at')
        .eq('nursery_id', nurseryId),
      admin
        .from('users')
        .select('id, role, name_ar, name_en, email, status, created_at, updated_at')
        .eq('nursery_id', nurseryId),
      admin
        .from('classes')
        .select('id, name_ar, name_en, teacher_id, created_at, updated_at')
        .eq('nursery_id', nurseryId),
    ]);

    if (childrenRes.error) throw new Error(childrenRes.error.message);
    if (usersRes.error) throw new Error(usersRes.error.message);
    if (classesRes.error) throw new Error(classesRes.error.message);

    const payload = {
      meta: {
        generated_at: new Date().toISOString(),
        nursery_id: nurseryId,
        scope: 'core',
        version: 1,
      },
      data: {
        children: childrenRes.data ?? [],
        users: usersRes.data ?? [],
        classes: classesRes.data ?? [],
      },
    };

    const content = JSON.stringify(payload, null, 2);
    const checksum = sha256Hex(content);
    const objectPath = `${nurseryId}/${jobId}.json`;
    const bytes = Buffer.byteLength(content, 'utf8');

    const upload = await admin.storage.from('tenant-exports').upload(objectPath, content, {
      contentType: 'application/json',
      upsert: true,
    });
    if (upload.error) throw new Error(upload.error.message);

    const { error: artErr } = await admin.from('tenant_export_artifacts').insert({
      job_id: jobId,
      nursery_id: nurseryId,
      storage_bucket: 'tenant-exports',
      storage_object_path: objectPath,
      checksum_sha256: checksum,
      bytes_size: bytes,
      file_format: 'json',
    });
    if (artErr) throw new Error(artErr.message);

    const { error: upErr } = await admin
      .from('tenant_export_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    if (upErr) throw new Error(upErr.message);

    console.log(JSON.stringify({ success: true, job_id: jobId, nursery_id: nurseryId, checksum_sha256: checksum }, null, 2));
  } catch (e) {
    await admin
      .from('tenant_export_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: e instanceof Error ? e.message : String(e),
      })
      .eq('id', jobId);
    throw e;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
