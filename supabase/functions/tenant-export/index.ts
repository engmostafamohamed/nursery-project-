import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

type ExportJob = {
  id: string;
  nursery_id: string;
  requested_by: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired';
};

const ALLOWED_ROLES = new Set(['branch_admin', 'chain_super_admin', 'xo_super_admin']);

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function parseBearer(header: string | null): string | null {
  const bearer = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer && bearer.length > 0 ? bearer : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Server misconfiguration' }, 500);
  }

  const accessToken = parseBearer(req.headers.get('Authorization'));
  if (!accessToken) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authData, error: authErr } = await userClient.auth.getUser(accessToken);
  if (authErr || !authData.user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  const userId = authData.user.id;

  const { data: profile, error: profileErr } = await serviceClient
    .from('users')
    .select('id, role, nursery_id')
    .eq('id', userId)
    .maybeSingle();

  if (profileErr || !profile || !ALLOWED_ROLES.has(String(profile.role))) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  if (req.method === 'GET') {
    const { data, error } = await serviceClient
      .from('tenant_export_jobs')
      .select('id, nursery_id, requested_by, status, created_at, completed_at, expires_at, error_message')
      .eq('nursery_id', String(profile.nursery_id))
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }
    return jsonResponse({ jobs: data ?? [] });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const nurseryId = String(profile.nursery_id);
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();

  const { data: insertJob, error: insertErr } = await serviceClient
    .from('tenant_export_jobs')
    .insert({
      nursery_id: nurseryId,
      requested_by: userId,
      status: 'processing',
      started_at: nowIso,
      expires_at: expiresAt,
      export_scope: 'core',
    })
    .select('id, nursery_id, requested_by, status')
    .single<ExportJob>();

  if (insertErr || !insertJob) {
    return jsonResponse({ error: insertErr?.message ?? 'Failed to create export job' }, 400);
  }

  try {
    const [childrenRes, usersRes, classesRes] = await Promise.all([
      serviceClient
        .from('children')
        .select('id, full_name_ar, full_name_en, class_id, status, created_at, updated_at')
        .eq('nursery_id', nurseryId),
      serviceClient
        .from('users')
        .select('id, role, name_ar, name_en, email, status, created_at, updated_at')
        .eq('nursery_id', nurseryId),
      serviceClient
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
    const checksum = await sha256Hex(content);
    const objectPath = `${nurseryId}/${insertJob.id}.json`;
    const bytes = new TextEncoder().encode(content).byteLength;

    const upload = await serviceClient.storage
      .from('tenant-exports')
      .upload(objectPath, content, {
        contentType: 'application/json',
        upsert: true,
      });

    if (upload.error) {
      throw new Error(upload.error.message);
    }

    const artifactInsert = await serviceClient.from('tenant_export_artifacts').insert({
      job_id: insertJob.id,
      nursery_id: nurseryId,
      storage_bucket: 'tenant-exports',
      storage_object_path: objectPath,
      checksum_sha256: checksum,
      bytes_size: bytes,
      file_format: 'json',
    });
    if (artifactInsert.error) throw new Error(artifactInsert.error.message);

    const complete = await serviceClient
      .from('tenant_export_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', insertJob.id);
    if (complete.error) throw new Error(complete.error.message);

    return jsonResponse({ success: true, job_id: insertJob.id });
  } catch (error) {
    await serviceClient
      .from('tenant_export_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'Unknown export failure',
      })
      .eq('id', insertJob.id);

    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Failed to export tenant data',
      },
      500,
    );
  }
});
