import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import { getAdminClient } from '../_shared/admin.ts';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

type ParentPayload = {
  full_name: string;
  job: string | null;
  mobile: string;
  /** Contact address only — the family signs in with the username below. */
  email: string | null;
  id_photo_path: string | null;
};

type PickupPayload = {
  name: string;
  phone: string;
  relation: string | null;
  authorization: string;
  photo_path: string | null;
};

type SignupFilePayload = {
  name: string;
  type: string;
  base64: string;
};

type SignupFilesPayload = {
  childPhoto: SignupFilePayload | null;
  fatherIdPhoto: SignupFilePayload | null;
  motherIdPhoto: SignupFilePayload | null;
  birthCertificate: SignupFilePayload | null;
  vaccinationCard: SignupFilePayload | null;
  pickupPerson1Photo: SignupFilePayload | null;
  pickupPerson2Photo: SignupFilePayload | null;
};

type AuthUserRef = {
  user: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
  };
};

type Body = {
  primary_auth_id?: string | null;
  signup_nonce?: string | null;
  secondary_auth_id?: string | null;
  secondary_email?: string | null;
  secondary_signup_nonce?: string | null;
  nursery_id: string;
  files?: SignupFilesPayload;
  child: {
    full_name_ar: string;
    full_name_en: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    nickname: string | null;
    dob: string;
    gender: string | null;
    nationality: string | null;
    department: string | null;
    school_preference: string | null;
    school_admissions_plan: string | null;
    academic_year: string | null;
    has_siblings: boolean;
    sibling_ages: string | null;
    avatar_url: string | null;
    birth_certificate_path: string | null;
    vaccination_card_path: string | null;
    daily_care_preferences: Record<string, unknown>;
    emergency_contacts: { name: string; relationship: string; phone: string }[];
    home_address: string | null;
  };
  family: {
    marital_status: string | null;
    address: string | null;
    referral_source: string | null;
  };
  credentials?: { username: string; password: string } | null;
  father: ParentPayload | null;
  mother: ParentPayload | null;
  pickups: PickupPayload[];
  consents: {
    health_policy: boolean;
    financial_agreement: boolean;
    policies: boolean;
    info_accuracy: boolean;
  };
};

class SignupHttpError extends Error {
  status: number;
  code: string;
  errorMessage: string;

  constructor(status: number, code: string, errorMessage: string) {
    super(errorMessage);
    this.status = status;
    this.code = code;
    this.errorMessage = errorMessage;
  }
}

function publicParentPayload(parent: ParentPayload | null): ParentPayload | null {
  // No credentials live on this payload any more — the family's username and
  // password arrive separately and are never echoed back into stored json.
  return parent ?? null;
}

function extFromFile(file: SignupFilePayload): string {
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();
  if (name.endsWith('.png') || mime === 'image/png') return 'png';
  if (name.endsWith('.webp') || mime === 'image/webp') return 'webp';
  if (name.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
  return 'jpg';
}

function fileToBlob(file: SignupFilePayload): Blob {
  const bytes = Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: file.type || 'application/octet-stream' });
}

type UploadedObject = { bucket: string; path: string };

async function uploadSignupFile(
  admin: ReturnType<typeof getAdminClient>,
  bucket: string,
  file: SignupFilePayload | null | undefined,
  path: string,
  uploaded: UploadedObject[],
): Promise<string | null> {
  if (!file) return null;
  const { error } = await admin.storage.from(bucket).upload(path, fileToBlob(file), {
    contentType: file.type || 'application/octet-stream',
    upsert: true,
  });
  if (error) throw new Error(`File upload failed (${path}): ${error.message}`);
  uploaded.push({ bucket, path });
  return path;
}

/** Signup uploads land before the child row exists, so a later failure would strand them. */
async function removeUploadedFiles(admin: ReturnType<typeof getAdminClient>, uploaded: UploadedObject[]) {
  const byBucket = new Map<string, string[]>();
  for (const { bucket, path } of uploaded) {
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), path]);
  }
  await Promise.all(
    [...byBucket].map(async ([bucket, paths]) => {
      const { error } = await admin.storage.from(bucket).remove(paths);
      if (error) console.error(`orphan cleanup failed (${bucket})`, error.message);
    }),
  );
}

async function uploadSignupFiles(
  admin: ReturnType<typeof getAdminClient>,
  nurseryId: string,
  files: SignupFilesPayload | undefined,
  uploaded: UploadedObject[],
) {
  const sessionId = crypto.randomUUID();
  const base = `${nurseryId}/parent-signup/${sessionId}`;

  let childPhotoUrl: string | null = null;
  if (files?.childPhoto) {
    const path = `${base}/child-photo.${extFromFile(files.childPhoto)}`;
    await uploadSignupFile(admin, 'child-avatars', files.childPhoto, path, uploaded);
    const { data } = admin.storage.from('child-avatars').getPublicUrl(path);
    childPhotoUrl = data.publicUrl;
  }

  const fatherIdPath = await uploadSignupFile(
    admin,
    'child-documents',
    files?.fatherIdPhoto,
    `${base}/father-id.${files?.fatherIdPhoto ? extFromFile(files.fatherIdPhoto) : 'jpg'}`,
    uploaded,
  );
  const motherIdPath = await uploadSignupFile(
    admin,
    'child-documents',
    files?.motherIdPhoto,
    `${base}/mother-id.${files?.motherIdPhoto ? extFromFile(files.motherIdPhoto) : 'jpg'}`,
    uploaded,
  );
  const birthCertPath = await uploadSignupFile(
    admin,
    'child-documents',
    files?.birthCertificate,
    `${base}/birth-cert.${files?.birthCertificate ? extFromFile(files.birthCertificate) : 'jpg'}`,
    uploaded,
  );
  const vaccinationCardPath = await uploadSignupFile(
    admin,
    'child-documents',
    files?.vaccinationCard,
    `${base}/vaccination-card.${files?.vaccinationCard ? extFromFile(files.vaccinationCard) : 'jpg'}`,
    uploaded,
  );
  const pickup1PhotoPath = await uploadSignupFile(
    admin,
    'authorized-pickup-photos',
    files?.pickupPerson1Photo,
    `${base}/pickup-1.${files?.pickupPerson1Photo ? extFromFile(files.pickupPerson1Photo) : 'jpg'}`,
    uploaded,
  );
  const pickup2PhotoPath = await uploadSignupFile(
    admin,
    'authorized-pickup-photos',
    files?.pickupPerson2Photo,
    `${base}/pickup-2.${files?.pickupPerson2Photo ? extFromFile(files.pickupPerson2Photo) : 'jpg'}`,
    uploaded,
  );

  return { childPhotoUrl, fatherIdPath, motherIdPath, birthCertPath, vaccinationCardPath, pickup1PhotoPath, pickup2PhotoPath };
}

async function createApplicationDocuments(
  admin: ReturnType<typeof getAdminClient>,
  nurseryId: string,
  applicationId: string,
  files: SignupFilesPayload | undefined,
  useMotherId: boolean,
  uploaded: UploadedObject[],
) {
  const parentIdFile = useMotherId ? files?.motherIdPhoto ?? files?.fatherIdPhoto : files?.fatherIdPhoto ?? files?.motherIdPhoto;
  const rows: Array<{ application_id: string; document_type: string; file_url: string }> = [];
  const docs = [
    { documentType: 'birth_certificate', file: files?.birthCertificate, name: 'birth-certificate' },
    { documentType: 'vaccination_card', file: files?.vaccinationCard, name: 'vaccination-card' },
    { documentType: 'parent_id', file: parentIdFile, name: 'parent-id' },
  ];

  for (const doc of docs) {
    if (!doc.file) continue;
    const path = `${nurseryId}/${applicationId}/${doc.name}.${extFromFile(doc.file)}`;
    const uploadedPath = await uploadSignupFile(admin, 'application-documents', doc.file, path, uploaded);
    if (uploadedPath) {
      rows.push({
        application_id: applicationId,
        document_type: doc.documentType,
        file_url: uploadedPath,
      });
    }
  }

  if (rows.length > 0) {
    const { error } = await admin.from('application_documents').insert(rows as never);
    if (error) throw new Error(`application documents insert failed: ${error.message}`);
  }
}

async function findAuthUserByEmail(admin: ReturnType<typeof getAdminClient>, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1, email: normalizedEmail } as never);
  const users = (data as { users?: Array<{ id: string; email?: string | null }> } | null)?.users ?? [];
  return users.find((user) => user.email?.toLowerCase() === normalizedEmail) ?? null;
}

/**
 * Parents sign in with a username. Supabase Auth is email-keyed, so the account is
 * created against a synthetic address derived from it; the login screen resolves a
 * typed username back to this same address. Any real email the parent gave stays on
 * the profile row as a contact detail.
 */
const USERNAME_EMAIL_DOMAIN = 'parents.xo.local';
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{4,32}$/;

export function usernameToAuthEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
}

async function createParentAuthUser(
  admin: ReturnType<typeof getAdminClient>,
  credentials: { username: string; password: string },
  parent: ParentPayload,
  metadata: Record<string, unknown>,
) {
  const username = credentials.username?.trim() ?? '';
  const password = credentials.password?.trim() ?? '';
  if (!USERNAME_PATTERN.test(username) || password.length < 8) {
    throw new SignupHttpError(400, 'missing_parent_credentials', 'Missing or invalid username/password');
  }

  // Check the profile table too: usernames are unique there and the taken one may
  // belong to an account created before this flow existed.
  const { data: takenProfile } = await admin
    .from('users')
    .select('id')
    .ilike('username', username)
    .maybeSingle();
  const authEmail = usernameToAuthEmail(username);
  if (takenProfile || (await findAuthUserByEmail(admin, authEmail))) {
    throw new SignupHttpError(409, 'username_taken', `This username is already taken: ${username}`);
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: {
      role: 'parent',
      name_en: parent.full_name,
      username,
      ...metadata,
    },
  });

  if (error || !created.user) {
    throw new SignupHttpError(400, 'create_parent_failed', error?.message ?? 'Parent account creation failed');
  }

  return created.user;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return jsonResponse({ error: 'Server misconfiguration' }, 500);

  const createdAuthUserIds: string[] = [];
  const uploadedObjects: UploadedObject[] = [];

  try {
    const body = (await req.json()) as Body;

    if (!body.nursery_id || !body.child?.full_name_ar?.trim() || !body.child?.dob) {
      return jsonResponse({ error: 'Missing required fields' }, 400);
    }

    const admin = getAdminClient();

    const { data: nursery } = await admin
      .from('nurseries')
      .select('id')
      .eq('id', body.nursery_id)
      .maybeSingle();
    if (!nursery) return jsonResponse({ error: 'Invalid nursery' }, 400);

    let primaryUser: AuthUserRef;

    if (body.primary_auth_id) {
      const { data: foundPrimaryUser, error: primaryUserErr } = await admin.auth.admin.getUserById(body.primary_auth_id);
      if (primaryUserErr || !foundPrimaryUser?.user) return jsonResponse({ error: 'Invalid primary_auth_id' }, 400);
      primaryUser = {
        user: {
          id: foundPrimaryUser.user.id,
          email: foundPrimaryUser.user.email,
          user_metadata: foundPrimaryUser.user.user_metadata as Record<string, unknown> | null,
        },
      };
    } else {
      const primaryParent = body.mother ?? body.father;
      if (!primaryParent) return jsonResponse({ error: 'At least one parent account is required' }, 400);
      if (!body.credentials) return jsonResponse({ error: 'Missing username and password' }, 400);
      const createdPrimary = await createParentAuthUser(admin, body.credentials, primaryParent, {});
      createdAuthUserIds.push(createdPrimary.id);
      primaryUser = { user: createdPrimary };
    }

    if (body.primary_auth_id) {
      let authUserId: string | null = null;
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: authData } = await userClient.auth.getUser();
        authUserId = authData.user?.id ?? null;
      }

      const primaryMeta = primaryUser.user.user_metadata as Record<string, unknown> | undefined;
      const nonceMatches =
        typeof body.signup_nonce === 'string' &&
        body.signup_nonce.length > 0 &&
        primaryMeta?.signup_nonce === body.signup_nonce;

      if (authUserId !== body.primary_auth_id && !nonceMatches) {
        return jsonResponse({ error: 'Auth mismatch: caller must be primary parent' }, 403);
      }
    }

    // A second auth account per family is gone: the whole family shares one login,
    // so the father/mother distinction is recorded on the profile and application
    // rather than by minting a second account.
    const uploaded = await uploadSignupFiles(admin, body.nursery_id, body.files, uploadedObjects);

    const primaryAuthId = primaryUser.user.id;
    const parentIds: string[] = [];

    // One account per family now, so there is a single profile row. It is named after
    // the primary parent (mother when both are given); the other parent's details are
    // kept on the application's extended json rather than getting their own login.
    const primaryParent = body.mother ?? body.father;
    if (!primaryParent) throw new SignupHttpError(400, 'missing_parent', 'At least one parent is required');
    const primaryIdPhoto = body.mother ? uploaded.motherIdPath : uploaded.fatherIdPath;

    const { error: profileErr } = await admin
      .from('users')
      .update({
        nursery_id: body.nursery_id,
        name_en: primaryParent.full_name,
        username: body.credentials?.username?.trim().toLowerCase() ?? null,
        // Contact email, not the synthetic address the account signs in with.
        email: primaryParent.email ?? null,
        phone: primaryParent.mobile,
        role: 'parent',
        status: 'active',
        onboarding_completed: true,
        occupation: primaryParent.job,
        id_photo_url: primaryIdPhoto,
      } as never)
      .eq('id', primaryAuthId);
    if (profileErr) throw new Error(profileErr.message);
    parentIds.push(primaryAuthId);

    const publicFamily = {
      marital_status: body.family.marital_status,
      address: body.family.address,
      referral_source: body.family.referral_source,
    };

    const enrollmentExtended = {
      family: publicFamily,
      consents: body.consents,
      // Both parents' details, since only the primary one gets a profile row.
      parents: { father: publicParentPayload(body.father), mother: publicParentPayload(body.mother) },
    };

    const { data: childRow, error: childErr } = await admin
      .from('children')
      .insert({
        nursery_id: body.nursery_id,
        full_name_ar: body.child.full_name_ar.trim(),
        full_name_en: body.child.full_name_en.trim() || body.child.full_name_ar.trim(),
        first_name: body.child.first_name,
        middle_name: body.child.middle_name,
        last_name: body.child.last_name,
        nickname: body.child.nickname,
        dob: body.child.dob,
        gender: body.child.gender,
        nationality: body.child.nationality,
        enrollment_department: body.child.department,
        school_preference: body.child.school_preference,
        school_admissions_plan: body.child.school_admissions_plan,
        academic_year: body.child.academic_year,
        has_siblings: body.child.has_siblings,
        sibling_ages: body.child.sibling_ages,
        birth_certificate_url: uploaded.birthCertPath,
        vaccination_card_url: uploaded.vaccinationCardPath,
        daily_care_preferences: body.child.daily_care_preferences,
        emergency_contacts: body.child.emergency_contacts,
        home_address: body.child.home_address,
        enrollment_date: new Date().toISOString().slice(0, 10),
        status: 'pending',
        avatar_url: uploaded.childPhotoUrl,
        enrollment_extended_json: enrollmentExtended,
      } as never)
      .select('id')
      .single();

    if (childErr || !childRow) throw new Error(childErr?.message ?? 'child insert failed');

    const childId = (childRow as { id: string }).id;

    const links = parentIds.map((pid, idx) => ({
      parent_id: pid,
      child_id: childId,
      relationship: idx === 0 ? (body.mother ? 'mother' : 'father') : 'father',
    }));
    if (links.length > 0) {
      const { error: pcErr } = await admin.from('parent_children').insert(links as never);
      if (pcErr) throw new Error(pcErr.message);
    }

    if (body.pickups.length > 0) {
      const rows = body.pickups.map((p, idx) => ({
        child_id: childId,
        name: p.name,
        phone: p.phone,
        relation: p.relation,
        photo_url: idx === 0 ? uploaded.pickup1PhotoPath : uploaded.pickup2PhotoPath,
        authorization_level: p.authorization || 'anytime',
        active: true,
      }));
      const { error: puErr } = await admin.from('authorized_pickups').insert(rows as never);
      if (puErr) throw new Error(puErr.message);
    }

    // Create an applications row so admin has a review queue entry.
    // Child + parent rows are already written but child.status='pending' — admin approval
    // will flip it to 'active' and flip the application status to 'approved'.
    const primaryParentId = parentIds[0] ?? null;
    const { data: applicationRow, error: appErr } = await admin.from('applications').insert({
      nursery_id: body.nursery_id,
      parent_id: primaryParentId,
      child_id: childId,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      parent_info_json: {
        father: publicParentPayload(body.father),
        mother: publicParentPayload(body.mother),
        family: publicFamily,
        pickups: body.pickups,
      },
      child_info_json: body.child,
      terms_accepted:
        body.consents.health_policy &&
        body.consents.financial_agreement &&
        body.consents.policies &&
        body.consents.info_accuracy,
    } as never).select('id').single();
    if (appErr) {
      // Non-fatal: child + parent rows are already written; log the gap for admin follow-up.
      console.error('applications row insert failed', appErr.message);
    } else if (applicationRow) {
      try {
        await createApplicationDocuments(
          admin,
          body.nursery_id,
          (applicationRow as { id: string }).id,
          body.files,
          Boolean(body.mother),
          uploadedObjects,
        );
      } catch (docErr) {
        console.error('application documents insert failed', docErr);
      }
    }

    return jsonResponse({ child_id: childId });
  } catch (e) {
    if (createdAuthUserIds.length > 0 || uploadedObjects.length > 0) {
      const admin = getAdminClient();
      await Promise.all(createdAuthUserIds.map((id) => admin.auth.admin.deleteUser(id)));
      await removeUploadedFiles(admin, uploadedObjects);
    }
    if (e instanceof SignupHttpError) {
      return jsonResponse({ error: e.code, error_message: e.errorMessage }, e.status);
    }
    return jsonResponse({ error: String(e) }, 500);
  }
});
