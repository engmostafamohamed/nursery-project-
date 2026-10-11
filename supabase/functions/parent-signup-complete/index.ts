import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import { getAdminClient } from '../_shared/admin.ts';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';
import { createPaymobCheckout, getPaymobConfig } from '../_shared/paymob.ts';

type ParentPayload = {
  full_name: string;
  job: string | null;
  mobile: string;
  /** Contact address only — the family signs in with the username below. */
  email: string | null;
  id_photo_path: string | null;
};

type PickupPayload = {
  slot?: 1 | 2 | null;
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
  proofOfAddress: SignupFilePayload | null;
  medicalReport: SignupFilePayload | null;
  otherDocument: SignupFilePayload | null;
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
  action?: string;
  payment?: {
    package_id: string;
    billing_period: string;
    extra_hours_package_id: string | null;
    method: string;
    reference: string | null;
    wallet_phone?: string | null;
    wallet_customer_name?: string | null;
    wallet_receipt?: SignupFilePayload | null;
    idempotency_key: string;
  } | null;
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
  registration_template?: {
    id: string;
    name: string;
    version: number;
    questions: unknown[];
  } | null;
  registration_answers?: Record<string, unknown> | null;
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
    { documentType: 'proof_of_address', file: files?.proofOfAddress, name: 'proof-of-address' },
    { documentType: 'medical_report', file: files?.medicalReport, name: 'medical-report' },
    { documentType: 'other', file: files?.otherDocument, name: 'other-document' },
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

function paymobCheckoutConfigured(enabled: string[] | null | undefined): boolean {
  return getPaymobConfig(enabled) !== null;
}

function signupPaymentTestMode(): boolean {
  return Deno.env.get('SIGNUP_PAYMENT_TEST_MODE')?.trim().toLowerCase() === 'true';
}

function signupPaymentMethods(enabled: string[] | null | undefined): string[] {
  const methods: string[] = [];
  if (signupPaymentTestMode() || paymobCheckoutConfigured(enabled)) methods.push('card');
  if (enabled?.includes('fawry_manual')) methods.push('fawry');
  if (enabled?.includes('etisalat_cash')) methods.push('etisalat_cash');
  return methods;
}

function paymentMethodNeedsReference(method: string): boolean {
  return method === 'instapay' || method === 'vodafone_cash' || method === 'bank_transfer' || method === 'fawry';
}

function isMissingEtisalatCashAccountColumn(error: { code?: string; message?: string } | null): boolean {
  const message = error?.message?.toLowerCase() ?? '';
  return Boolean(
    error &&
    ['42703', 'PGRST204'].includes(error.code ?? '') &&
    message.includes('etisalat_cash_account_number') &&
    (message.includes('does not exist') || message.includes('could not find')),
  );
}

async function getEtisalatCashAccountNumber(
  admin: ReturnType<typeof getAdminClient>,
  nurseryId: string,
): Promise<{ accountNumber: string | null; migrationRequired: boolean }> {
  const { data, error } = await admin
    .from('nursery_settings')
    .select('etisalat_cash_account_number')
    .eq('nursery_id', nurseryId)
    .maybeSingle();
  if (isMissingEtisalatCashAccountColumn(error)) {
    return { accountNumber: null, migrationRequired: true };
  }
  if (error) throw new Error(error.message);
  return {
    accountNumber: data?.etisalat_cash_account_number?.trim() || null,
    migrationRequired: false,
  };
}

async function getSignupPaymentOptions(admin: ReturnType<typeof getAdminClient>, nurseryId: string) {
  const { data: nursery, error: nurseryError } = await admin
    .from('nurseries')
    .select('id')
    .eq('id', nurseryId)
    .maybeSingle();
  if (nurseryError) throw new Error(nurseryError.message);
  if (!nursery) throw new SignupHttpError(400, 'invalid_nursery', 'Invalid nursery');

  const { data: settings, error: settingsError } = await admin
    .from('nursery_settings')
    .select('parent_registration_enabled, payment_methods_enabled, payment_instructions')
    .eq('nursery_id', nurseryId)
    .maybeSingle();
  if (settingsError) throw new Error(settingsError.message);
  if (settings?.parent_registration_enabled === false) {
    throw new SignupHttpError(403, 'registration_closed', 'Registration is currently closed for this nursery.');
  }
  const etisalatEnabled = settings?.payment_methods_enabled?.includes('etisalat_cash') ?? false;
  const etisalatSetup = etisalatEnabled
    ? await getEtisalatCashAccountNumber(admin, nurseryId)
    : { accountNumber: null, migrationRequired: false };

  const { data, error } = await admin
    .from('tuition_packages')
    .select(`
      id, name_ar, name_en, description_ar, description_en, daily_hours, features_json, price,
      deals (id, name_ar, name_en, discount_type, discount_value, starts_at, ends_at, active),
      tuition_package_billing_periods (billing_period, duration_months, price, active)
    `)
    .eq('nursery_id', nurseryId)
    .eq('active', true)
    .order('price', { ascending: true });
  if (error) throw new Error(error.message);

  const { data: extraHoursRows, error: extraHoursError } = await admin
    .from('packages')
    .select(`
      id, name_ar, name_en, description_ar, description_en, coverage_type,
      included_hours, price, validity_value, validity_unit,
      deals (id, name_ar, name_en, discount_type, discount_value, starts_at, ends_at, active)
    `)
    .eq('nursery_id', nurseryId)
    .eq('active', true)
    .order('price', { ascending: true });
  if (extraHoursError) throw new Error(extraHoursError.message);

  type DealRow = {
    id: string;
    name_ar: string;
    name_en: string;
    discount_type: 'percentage' | 'fixed_amount';
    discount_value: number | string;
    starts_at: string | null;
    ends_at: string | null;
    active: boolean;
  };
  type PeriodRow = {
    billing_period: string;
    duration_months: number;
    price: number | string;
    active: boolean;
  };
  const packages = ((data ?? []) as Array<{
    id: string;
    name_ar: string;
    name_en: string;
    description_ar: string | null;
    description_en: string | null;
    daily_hours: number | null;
    features_json: unknown;
    price: number | string;
    deals: DealRow | DealRow[] | null;
    tuition_package_billing_periods: PeriodRow[] | null;
  }>).map((pkg) => {
    const deal = Array.isArray(pkg.deals) ? pkg.deals[0] : pkg.deals;
    return {
      id: pkg.id,
      nameAr: pkg.name_ar,
      nameEn: pkg.name_en,
      descriptionAr: pkg.description_ar,
      descriptionEn: pkg.description_en,
      price: Number(pkg.price),
      dailyHours: pkg.daily_hours,
      featuresJson: Array.isArray(pkg.features_json)
        ? pkg.features_json
            .filter((item): item is { ar?: unknown; en?: unknown } => Boolean(item) && typeof item === 'object')
            .map((item) => ({ ar: String(item.ar ?? ''), en: String(item.en ?? '') }))
        : [],
      deal: deal
        ? {
            id: deal.id,
            nameAr: deal.name_ar,
            nameEn: deal.name_en,
            discountType: deal.discount_type,
            discountValue: Number(deal.discount_value),
            startsAt: deal.starts_at,
            endsAt: deal.ends_at,
            active: deal.active,
          }
        : null,
      billingPeriods: (pkg.tuition_package_billing_periods ?? [])
        .filter((period) => period.active && ['monthly', 'quarterly', 'half_annual', 'annual'].includes(period.billing_period))
        .map((period) => ({
          billingPeriod: period.billing_period,
          durationMonths: period.duration_months,
          price: Number(period.price),
        })),
    };
  });
  const extraHoursPackages = ((extraHoursRows ?? []) as Array<{
    id: string;
    name_ar: string;
    name_en: string;
    description_ar: string | null;
    description_en: string | null;
    coverage_type: 'unlimited' | 'hours_quota';
    included_hours: number | null;
    price: number | string;
    validity_value: number | null;
    validity_unit: 'months' | 'years' | null;
    deals: DealRow | DealRow[] | null;
  }>).map((pkg) => {
    const deal = Array.isArray(pkg.deals) ? pkg.deals[0] : pkg.deals;
    return {
      id: pkg.id,
      nameAr: pkg.name_ar,
      nameEn: pkg.name_en,
      descriptionAr: pkg.description_ar,
      descriptionEn: pkg.description_en,
      coverageType: pkg.coverage_type,
      includedHours: pkg.included_hours,
      price: Number(pkg.price),
      validityValue: pkg.validity_value,
      validityUnit: pkg.validity_unit,
      deal: deal
        ? {
            id: deal.id,
            nameAr: deal.name_ar,
            nameEn: deal.name_en,
            discountType: deal.discount_type,
            discountValue: Number(deal.discount_value),
            startsAt: deal.starts_at,
            endsAt: deal.ends_at,
            active: deal.active,
          }
        : null,
    };
  });

  return jsonResponse({
    packages,
    extra_hours_packages: extraHoursPackages,
    methods: signupPaymentMethods(settings?.payment_methods_enabled).filter(
      (method) => method !== 'etisalat_cash' || Boolean(etisalatSetup.accountNumber),
    ),
    etisalat_cash_setup_issue: etisalatEnabled
      ? etisalatSetup.migrationRequired
        ? 'migration'
        : etisalatSetup.accountNumber
          ? null
          : 'configuration'
      : null,
    payment_test_mode: signupPaymentTestMode(),
    paymob_checkout_unavailable: !signupPaymentTestMode() && Boolean(
      ['paymob', 'instapay', 'mobile_wallet', 'fawry'].some((method) =>
        settings?.payment_methods_enabled?.includes(method),
      ) && !paymobCheckoutConfigured(settings?.payment_methods_enabled),
    ),
    payment_instructions: settings?.payment_instructions ?? null,
    etisalat_cash_account_number: etisalatSetup.accountNumber,
  });
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
  let signupCommitted = false;
  let paymentRequested = false;
  let paymentAttemptId: string | null = null;
  let paymobCheckoutRequested = false;

  try {
    const body = (await req.json()) as Body;
    paymentRequested = Boolean(body.payment);
    paymobCheckoutRequested = body.payment?.method === 'card' && !signupPaymentTestMode();
    const admin = getAdminClient();

    if (body.action === 'payment_options') {
      if (!body.nursery_id) return jsonResponse({ error: 'Missing nursery_id' }, 400);
      return await getSignupPaymentOptions(admin, body.nursery_id);
    }

    if (!body.nursery_id || !body.child?.full_name_ar?.trim() || !body.child?.dob) {
      return jsonResponse({ error: 'Missing required fields' }, 400);
    }

    const { data: nursery } = await admin
      .from('nurseries')
      .select('id')
      .eq('id', body.nursery_id)
      .maybeSingle();
    if (!nursery) return jsonResponse({ error: 'Invalid nursery' }, 400);

    const { data: signupSettings, error: signupSettingsErr } = await admin
      .from('nursery_settings')
      .select('parent_registration_enabled, payment_methods_enabled')
      .eq('nursery_id', body.nursery_id)
      .maybeSingle();
    if (signupSettingsErr) throw new Error(signupSettingsErr.message);
    if (signupSettings?.parent_registration_enabled === false) {
      return jsonResponse(
        {
          error: 'registration_closed',
          error_message: 'Registration is currently closed for this nursery.',
        },
        403,
      );
    }

    if (body.payment) {
      const payment = body.payment;
      if (!body.credentials && !req.headers.get('Authorization')) {
        return jsonResponse({ error: 'Payment requires an authenticated parent' }, 400);
      }
      if (!['monthly', 'quarterly', 'half_annual', 'annual'].includes(payment.billing_period)) {
        return jsonResponse({ error: 'Invalid billing period' }, 400);
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payment.idempotency_key)) {
        return jsonResponse({ error: 'Invalid payment idempotency key' }, 400);
      }
      if (!signupPaymentMethods(signupSettings?.payment_methods_enabled).includes(payment.method)) {
        return jsonResponse({ error: 'Selected payment method is not enabled' }, 400);
      }
      if (paymentMethodNeedsReference(payment.method) && (payment.reference?.trim().length ?? 0) < 4) {
        return jsonResponse({ error: 'A valid payment reference is required' }, 400);
      }
      if (payment.method === 'etisalat_cash') {
        const etisalatSetup = await getEtisalatCashAccountNumber(admin, body.nursery_id);
        if (etisalatSetup.migrationRequired) {
          throw new SignupHttpError(
            503,
            'payment_configuration_incomplete',
            'Etisalat Cash is unavailable until the nursery database migration has been applied.',
          );
        }
        if (!/^01[0125]\d{8}$/.test(payment.wallet_phone?.trim() ?? '')) {
          return jsonResponse({ error: 'A valid Etisalat Cash phone number is required' }, 400);
        }
        if ((payment.wallet_customer_name?.trim().length ?? 0) < 2 || (payment.wallet_customer_name?.trim().length ?? 0) > 100) {
          return jsonResponse({ error: 'A valid Etisalat Cash customer name is required' }, 400);
        }
        if (!payment.wallet_receipt || !['image/jpeg', 'image/png', 'image/webp'].includes(payment.wallet_receipt.type)) {
          return jsonResponse({ error: 'An Etisalat Cash payment screenshot is required' }, 400);
        }
        if (
          !payment.wallet_receipt.base64 ||
          payment.wallet_receipt.base64.length > Math.ceil(5 * 1024 * 1024 * 4 / 3) ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(payment.wallet_receipt.base64)
        ) {
          return jsonResponse({ error: 'The Etisalat Cash payment screenshot is invalid' }, 400);
        }
        if (atob(payment.wallet_receipt.base64).length > 5 * 1024 * 1024) {
          return jsonResponse({ error: 'The Etisalat Cash payment screenshot is too large' }, 400);
        }
        if (!etisalatSetup.accountNumber) {
          return jsonResponse({ error: 'Etisalat Cash is not configured for this nursery' }, 400);
        }
      }
      const { data: packageRow, error: packageError } = await admin
        .from('tuition_packages')
        .select('id')
        .eq('id', payment.package_id)
        .eq('nursery_id', body.nursery_id)
        .eq('active', true)
        .maybeSingle();
      if (packageError) throw new Error(packageError.message);
      if (!packageRow) return jsonResponse({ error: 'Selected payment package is not available' }, 400);
      if (payment.extra_hours_package_id) {
        const { data: extraHoursPackage, error: extraHoursPackageError } = await admin
          .from('packages')
          .select('id')
          .eq('id', payment.extra_hours_package_id)
          .eq('nursery_id', body.nursery_id)
          .eq('active', true)
          .maybeSingle();
        if (extraHoursPackageError) throw new Error(extraHoursPackageError.message);
        if (!extraHoursPackage) return jsonResponse({ error: 'Selected extra-hours package is not available' }, 400);
      }
    }

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
      const rows = body.pickups.map((p, idx) => {
        const slot = p.slot === 1 || p.slot === 2 ? p.slot : idx + 1;
        return {
        child_id: childId,
        name: p.name,
        phone: p.phone,
        relation: p.relation,
        photo_url: slot === 1 ? uploaded.pickup1PhotoPath : uploaded.pickup2PhotoPath,
        authorization_level: p.authorization || 'anytime',
        active: true,
        };
      });
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
      status: body.payment ? 'draft' : 'submitted',
      submitted_at: body.payment ? null : new Date().toISOString(),
      parent_info_json: {
        father: publicParentPayload(body.father),
        mother: publicParentPayload(body.mother),
        family: publicFamily,
        pickups: body.pickups,
      },
      child_info_json: body.child,
      registration_template_id: body.registration_template?.id ?? null,
      registration_template_snapshot: body.registration_template ?? null,
      registration_answers_json: body.registration_answers ?? {},
      terms_accepted:
        body.consents.health_policy &&
        body.consents.financial_agreement &&
        body.consents.policies &&
        body.consents.info_accuracy,
    } as never).select('id').single();
    if (appErr || !applicationRow) throw new Error(appErr?.message ?? 'applications row insert failed');
    const applicationId = (applicationRow as { id: string }).id;
    signupCommitted = true;

    try {
      await createApplicationDocuments(
        admin,
        body.nursery_id,
        applicationId,
        body.files,
        Boolean(body.mother),
        uploadedObjects,
      );
    } catch (docErr) {
      if (body.payment) throw docErr;
      console.error('application documents insert failed', docErr);
    }

    if (body.payment) {
      const payment = body.payment;
      const { data: documentsComplete, error: documentsCheckError } = await admin.rpc(
        'application_has_required_documents' as never,
        { p_application_id: applicationId } as never,
      );
      if (documentsCheckError) throw new Error(`Could not verify required application documents: ${documentsCheckError.message}`);
      if (documentsComplete !== true) throw new Error('Upload all required application documents before paying.');

      const paymentClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        ...(body.credentials
          ? {}
          : { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }),
      });

      if (body.credentials) {
        const { error: signInError } = await paymentClient.auth.signInWithPassword({
          email: usernameToAuthEmail(body.credentials.username),
          password: body.credentials.password,
        });
        if (signInError) throw new Error(`Could not authenticate parent for payment: ${signInError.message}`);
      }

      const { data: invoiceId, error: packageSelectionError } = await paymentClient.rpc(
        'select_application_payment_package' as never,
        {
          p_application_id: applicationId,
          p_package_id: payment.package_id,
          p_billing_period: payment.billing_period,
        } as never,
      );
      if (packageSelectionError) throw new Error(`Could not create the package invoice: ${packageSelectionError.message}`);
      if (typeof invoiceId !== 'string') throw new Error('Package selection did not return an invoice');

      const { data: invoice, error: invoiceError } = await admin
        .from('invoices')
        .select('amount, line_items_json')
        .eq('id', invoiceId)
        .single();
      if (invoiceError || !invoice) throw new Error(invoiceError?.message ?? 'Package invoice not found');

      const { error: extraHoursSelectionError } = await paymentClient.rpc(
        'select_application_extra_hours_package' as never,
        {
          p_application_id: applicationId,
          p_package_id: payment.extra_hours_package_id,
        } as never,
      );
      if (extraHoursSelectionError) {
        throw new Error(`Could not save the extra-hours package: ${extraHoursSelectionError.message}`);
      }

      let invoiceAmount = Number(invoice.amount);
      const lineItems = invoice.line_items_json && typeof invoice.line_items_json === 'object' && !Array.isArray(invoice.line_items_json)
        ? invoice.line_items_json as Record<string, unknown>
        : {};
      const invoiceItems = Array.isArray(lineItems.items) ? [...lineItems.items] : [];

      if (payment.extra_hours_package_id) {
        const { data: extraHoursPackage, error: extraHoursPackageError } = await admin
          .from('packages')
          .select(`
            id, name_ar, name_en, price,
            deals (id, name_ar, name_en, discount_type, discount_value, starts_at, ends_at, active)
          `)
          .eq('id', payment.extra_hours_package_id)
          .eq('nursery_id', body.nursery_id)
          .eq('active', true)
          .single();
        if (extraHoursPackageError || !extraHoursPackage) {
          throw new Error(extraHoursPackageError?.message ?? 'Selected extra-hours package is not available');
        }

        type ExtraHoursDealRow = {
          id: string;
          name_ar: string;
          name_en: string;
          discount_type: 'percentage' | 'fixed_amount';
          discount_value: string | number;
          starts_at: string | null;
          ends_at: string | null;
          active: boolean;
        };
        const extraPackage = extraHoursPackage as {
          id: string;
          name_ar: string;
          name_en: string;
          price: string | number;
          deals: ExtraHoursDealRow | ExtraHoursDealRow[] | null;
        };
        const deal = Array.isArray(extraPackage.deals) ? extraPackage.deals[0] : extraPackage.deals;
        const extraSubtotal = Number(extraPackage.price);
        if (!Number.isFinite(extraSubtotal) || extraSubtotal < 0) throw new Error('Invalid extra-hours package price');
        const dealIsActive = Boolean(
          deal?.active &&
          (!deal.starts_at || new Date(deal.starts_at).getTime() <= Date.now()) &&
          (!deal.ends_at || new Date(deal.ends_at).getTime() > Date.now()),
        );
        let extraDiscount = 0;
        if (dealIsActive && deal) {
          extraDiscount = deal.discount_type === 'percentage'
            ? Math.round(extraSubtotal * Number(deal.discount_value)) / 100
            : Number(deal.discount_value);
          extraDiscount = Math.round(Math.min(Math.max(extraDiscount, 0), extraSubtotal) * 100) / 100;
        }
        const extraTotal = Math.max(extraSubtotal - extraDiscount, 0);
        invoiceAmount = Math.round((invoiceAmount + extraTotal) * 100) / 100;

        invoiceItems.push({
          kind: 'extra_hours_package',
          name_ar: extraPackage.name_ar,
          name_en: extraPackage.name_en,
          description: extraPackage.name_en || extraPackage.name_ar || 'Extra hours package',
          quantity: 1,
          unitPrice: extraSubtotal,
          unit_price: extraSubtotal,
          total: extraSubtotal,
        });
        if (extraDiscount > 0 && deal) {
          invoiceItems.push({
            kind: 'discount',
            name_ar: deal.name_ar,
            name_en: deal.name_en,
            description: deal.name_en || deal.name_ar || 'Discount',
            quantity: 1,
            unitPrice: -extraDiscount,
            unit_price: -extraDiscount,
            total: -extraDiscount,
          });
        }

        const { error: invoiceUpdateError } = await admin
          .from('invoices')
          .update({
            amount: invoiceAmount,
            line_items_json: {
              ...lineItems,
              extra_hours_package_id: extraPackage.id,
              extra_hours_package_name_ar: extraPackage.name_ar,
              extra_hours_package_name_en: extraPackage.name_en,
              extra_hours_subtotal: extraSubtotal,
              extra_hours_discount_amount: extraDiscount,
              items: invoiceItems,
            },
          } as never)
          .eq('id', invoiceId);
        if (invoiceUpdateError) throw new Error(`Could not add extra-hours package to the invoice: ${invoiceUpdateError.message}`);
      }

      let paymentProofPath: string | null = null;
      if (payment.method === 'etisalat_cash' && payment.wallet_receipt) {
        paymentProofPath = await uploadSignupFile(
          admin,
          'payment-proofs',
          payment.wallet_receipt,
          `${body.nursery_id}/${primaryUser.user.id}/${invoiceId}/signup-${crypto.randomUUID()}.${extFromFile(payment.wallet_receipt)}`,
          uploadedObjects,
        );
      }
      const paymentReference = payment.method === 'etisalat_cash'
        ? `Etisalat Cash wallet phone: ${payment.wallet_phone?.trim()}; customer name: ${payment.wallet_customer_name?.trim()}`
        : paymentMethodNeedsReference(payment.method)
          ? payment.reference?.trim() || null
          : null;
      const { data: attempt, error: paymentError } = await paymentClient.rpc('submit_invoice_payment' as never, {
        p_invoice_id: invoiceId,
        p_amount: invoiceAmount,
        p_method: payment.method,
        p_reference: paymentReference,
        p_proof_url: paymentProofPath,
        p_idempotency_key: payment.idempotency_key,
      } as never);
      if (paymentError) throw new Error(`Could not submit the payment request: ${paymentError.message}`);
      const attemptResult = attempt as { attempt_id?: unknown } | null;
      paymentAttemptId = typeof attemptResult?.attempt_id === 'string' ? attemptResult.attempt_id : null;
      if (!paymentAttemptId) throw new Error('The payment request was created without an attempt ID');

      let checkoutUrl: string | undefined;
      if (payment.method === 'card') {
        if (signupPaymentTestMode()) {
          const { error: testNoteError } = await admin
            .from('payment_attempts')
            .update({ notes: '[TEST PAYMENT] No money was charged. Do not confirm as a real payment.' })
            .eq('id', paymentAttemptId);
          if (testNoteError) throw new Error(`Could not mark the payment as a test: ${testNoteError.message}`);
        } else {
          const primaryParent = body.mother ?? body.father;
          if (!primaryParent) throw new Error('A parent contact is required for card checkout');
          const checkout = await createPaymobCheckout({
            amount: invoiceAmount,
            attemptId: paymentAttemptId,
            customerName: primaryParent.full_name,
            customerEmail: primaryParent.email?.trim() || primaryUser.user.email || '',
            customerPhone: primaryParent.mobile,
            address: body.family.address,
            enabledPaymentMethods: signupSettings?.payment_methods_enabled,
          });
          checkoutUrl = checkout.checkoutUrl;
          const { error: intentionUpdateError } = await admin
            .from('payment_attempts')
            .update({ paymob_intention_id: checkout.intentionId })
            .eq('id', paymentAttemptId);
          if (intentionUpdateError) throw new Error(`Could not save the Paymob checkout reference: ${intentionUpdateError.message}`);
        }
      }

      const { data: submittedApplication, error: applicationStatusError } = await admin
        .from('applications')
        .select('status')
        .eq('id', applicationId)
        .single();
      if (applicationStatusError) throw new Error(applicationStatusError.message);
      if (submittedApplication.status !== 'submitted') {
        throw new Error('Payment was recorded, but the application could not be sent for review. Contact the nursery.');
      }

      if (checkoutUrl) {
        return jsonResponse({
          child_id: childId,
          application_id: applicationId,
          payment_attempt_id: paymentAttemptId,
          checkout_url: checkoutUrl,
        });
      }
      if (signupPaymentTestMode() && payment.method === 'card') {
        return jsonResponse({
          child_id: childId,
          application_id: applicationId,
          payment_attempt_id: paymentAttemptId,
          payment_test_mode: true,
        });
      }
    }

    return jsonResponse({ child_id: childId, application_id: applicationId, payment_attempt_id: paymentAttemptId });
  } catch (e) {
    if (!signupCommitted && (createdAuthUserIds.length > 0 || uploadedObjects.length > 0)) {
      const admin = getAdminClient();
      await Promise.all(createdAuthUserIds.map((id) => admin.auth.admin.deleteUser(id)));
      await removeUploadedFiles(admin, uploadedObjects);
    }
    if (signupCommitted && paymentRequested) {
      if (paymobCheckoutRequested && paymentAttemptId) {
        const { error: failAttemptError } = await getAdminClient()
          .from('payment_attempts')
          .update({ status: 'failed', notes: 'Paymob checkout could not be initialized.' })
          .eq('id', paymentAttemptId)
          .eq('status', 'pending_confirmation');
        if (failAttemptError) console.error('Could not mark the failed Paymob attempt:', failAttemptError.message);
      }
      return jsonResponse(
        {
          error: 'signup_created_payment_failed',
          error_message: e instanceof Error ? e.message : String(e),
          account_created: true,
        },
        409,
      );
    }
    if (e instanceof SignupHttpError) {
      return jsonResponse({ error: e.code, error_message: e.errorMessage }, e.status);
    }
    return jsonResponse({ error: String(e) }, 500);
  }
});
