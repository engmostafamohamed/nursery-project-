// The server functions in supabase/functions, described by hand from their code.
// audience: 'app'      — called by the app with the signed-in user's token
//           'public'   — no sign-in needed (only the apikey header)
//           'internal' — called by the server or a schedule; never from a mobile app

export const FUNCTIONS_TAGS = {
  app: 'Server functions · app',
  internal: 'Server functions · internal (not for apps)',
};

/** @typedef {{ name: string, audience: 'app' | 'public' | 'internal', summary: string, fields?: string[], method?: string, warning?: string }} EdgeFunction */

/** @type {EdgeFunction[]} */
export const EDGE_FUNCTIONS = [
  // Families and children
  {
    name: 'parent-signup-complete',
    audience: 'public',
    summary: 'Parent self-registration: creates the family account, the child application and the first payment. With { action: "payment_options", nursery_id } it only returns the payment options.',
    fields: ['action', 'nursery_id', 'signup_nonce', 'credentials', 'father', 'mother', 'family', 'child', 'pickups', 'consents', 'files', 'payment', 'registration_template', 'registration_answers', 'primary_auth_id'],
  },
  {
    name: 'child-enrollment-complete',
    audience: 'app',
    summary: 'Admin enrolls a child: creates the child, the parents and the people allowed to pick up.',
    fields: ['nursery_id', 'child', 'father', 'mother', 'pickups', 'enrollment_extended_json'],
  },

  // Attendance and QR codes
  {
    name: 'qr-token',
    audience: 'app',
    summary: 'Creates or returns a pickup QR code (parent, delegate or custom) and its 6-digit manual code; also edits, rotates or revokes one.',
    fields: ['child_id', 'nursery_id', 'purpose', 'ttl_seconds', 'single_use', 'rotate', 'delegate_name', 'pickup_person_full_name', 'pickup_relationship', 'pickup_identity_type', 'pickup_identity_number', 'pickup_identity_image_path', 'pickup_identity_back_image_path', 'pickup_notes', 'require_id_capture', 'edit_token_id', 'rotate_token_id', 'revoke_token_id', 'status_token_id', 'status'],
  },
  {
    name: 'qr-verify',
    audience: 'app',
    summary: 'Staff at the gate: checks a scanned QR code and records drop-off or pickup (or an event check-in).',
    fields: ['token', 'defer_consume'],
  },
  {
    name: 'event-qr-issue',
    audience: 'app',
    summary: 'Issues the QR code for an event.',
    fields: ['event_id'],
  },

  // Staff
  {
    name: 'staff-onboarding-complete',
    audience: 'app',
    summary: 'Admin onboards a staff member (new or existing user); returns staff_profile_id for uploading documents.',
    fields: ['nurseryId', 'userMode', 'existingUserId', 'newNameAr', 'newNameEn', 'newEmail', 'newMobile', 'employeeId', 'position', 'employmentType', 'startDate', 'gender', 'nationalId', 'baseSalary', 'workingDays', 'workStartTime', 'workEndTime', 'emergencyName', 'emergencyPhone', 'termsAccepted'],
    warning: 'Gives every new staff member the same first password; fix before using it from a mobile app (task T1.3).',
  },

  // Admin tools
  {
    name: 'ai-assistant',
    audience: 'app',
    summary: 'The in-app AI assistant chat.',
    fields: ['messages', 'context', 'tools'],
  },
  {
    name: 'ai-import-mapper',
    audience: 'app',
    summary: 'Bulk import, step 1: suggests how spreadsheet columns map to XO fields and creates an import job.',
    fields: ['fileData', 'fileName'],
  },
  {
    name: 'process-import',
    audience: 'app',
    summary: 'Bulk import, step 2: imports the rows of a confirmed import job.',
    fields: ['importJobId'],
  },
  {
    name: 'tenant-export',
    audience: 'app',
    summary: 'Nursery data export: GET lists the export jobs, POST starts a new export.',
    method: 'post',
  },

  // XO platform administration
  {
    name: 'xo-create-nursery',
    audience: 'app',
    summary: 'XO admin creates a nursery and its first branch admin.',
    fields: ['nameAr', 'nameEn', 'city', 'phone', 'languagePref', 'logoFileUrl', 'opensAt', 'closesAt', 'workingDays', 'departments', 'subscriptionPlan', 'pricingModel', 'baseFee', 'perChildRate', 'adminNameAr', 'adminNameEn', 'adminEmail', 'adminPhone'],
  },
  {
    name: 'xo-assign-nursery-admin',
    audience: 'app',
    summary: 'XO admin adds a branch admin to an existing nursery.',
    fields: ['nurseryId', 'adminNameAr', 'adminNameEn', 'adminEmail', 'adminPhone'],
  },
  {
    name: 'xo-check-admin-email',
    audience: 'app',
    summary: 'XO admin checks whether an email is free before creating a nursery admin.',
    fields: ['email'],
  },

  // Internal: messaging providers and schedules
  {
    name: 'emergency-broadcast',
    audience: 'internal',
    summary: 'Sends an emergency alert to every parent of a nursery.',
    fields: ['nursery_id', 'message', 'message_ar', 'message_en'],
    warning: 'Does not check who is calling: anyone with the public key could alert every parent of any nursery. Not deployed today; add a caller check before deploying it.',
  },
  {
    name: 'email-dispatch',
    audience: 'internal',
    summary: 'Sends one email notification. The email provider is not connected yet (it only logs).',
    fields: ['nursery_id', 'user_id', 'recipient_email', 'trigger_type', 'language', 'data'],
    warning: 'Does not check who is calling; add a check before connecting a real provider.',
  },
  {
    name: 'sms-dispatch',
    audience: 'internal',
    summary: 'Sends one SMS. The SMS provider is not connected yet (it only logs).',
    fields: ['nursery_id', 'user_id', 'recipient_phone', 'trigger_type', 'language', 'data', 'whatsapp_failed_at'],
    warning: 'Does not check who is calling; add a check before connecting a real provider.',
  },
  {
    name: 'whatsapp-dispatch',
    audience: 'internal',
    summary: 'Sends one WhatsApp message. The provider is not connected yet (it only logs).',
    fields: ['nursery_id', 'user_id', 'recipient_phone', 'trigger_type', 'language', 'data'],
    warning: 'Does not check who is calling; add a check before connecting a real provider.',
  },
  {
    name: 'payment-reminders',
    audience: 'internal',
    summary: 'Scheduled job: sends invoice payment reminders.',
  },
  {
    name: 'permission-deadline-reminder',
    audience: 'internal',
    summary: 'Scheduled job: reminds parents about event permission slips that are due.',
  },
];

/**
 * @param {Map<string, boolean | null>} deployed  function name -> deployed (null = not checked)
 */
export function toFunctionPaths(deployed) {
  const paths = {};
  for (const fn of EDGE_FUNCTIONS) {
    paths[`/functions/v1/${fn.name}`] = { [fn.method ?? 'post']: toOperation(fn, deployed.get(fn.name) ?? null) };
  }
  return paths;
}

function toOperation(fn, isDeployed) {
  const notes = [
    fn.audience === 'public' ? 'No sign-in needed; send only the apikey header.' : null,
    fn.audience === 'internal' ? 'Internal: called by the server or a schedule, not by apps.' : null,
    deploymentNote(isDeployed),
    fn.warning ? `Warning: ${fn.warning}` : null,
  ].filter(Boolean);

  return {
    tags: [fn.audience === 'internal' ? FUNCTIONS_TAGS.internal : FUNCTIONS_TAGS.app],
    summary: fn.summary,
    description: notes.join('\n\n'),
    ...(fn.audience === 'public' ? { security: [{ apikey: [] }] } : {}),
    'x-audience': fn.audience,
    'x-deployed': isDeployed,
    parameters: fn.fields ? [bodyParameter(fn.fields)] : [],
    responses: {
      200: { description: 'JSON result' },
      400: { description: 'Missing or invalid fields' },
      401: { description: 'Not signed in' },
      403: { description: 'Signed in, but not allowed' },
    },
  };
}

function bodyParameter(fields) {
  return {
    in: 'body',
    name: 'body',
    required: true,
    schema: { type: 'object', properties: Object.fromEntries(fields.map((field) => [field, {}])) },
  };
}

function deploymentNote(isDeployed) {
  if (isDeployed === true) return 'Deployed in production.';
  if (isDeployed === false) return 'Not deployed in production.';
  return 'Deployment not checked.';
}
