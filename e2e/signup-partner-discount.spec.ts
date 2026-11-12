// A family names its workplace when it signs up, through the sign-up's own server function: the
// nursery's partners come with the payment options; a partner needing no proof takes its discount off
// the first invoice at once (tuition and extra hours, within the cap); one needing a proof waits for the
// nursery with the proof the family sent, and the first invoice stays at the full price; a partner
// that needs a proof is refused without one, before any account is made.
import { expect, test } from '@playwright/test';

import { ANON_KEY, cleanupTestNursery, createTestNursery, ok, PNG, service, sql, SUPABASE_URL, type TestNursery } from './support/nursery';

let n: TestNursery | undefined;
const partners: Record<'instant' | 'proof', string> = { instant: '', proof: '' };

const file = (name: string) => ({ name, type: 'image/png', base64: PNG.toString('base64') });

async function signupFunction(body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/parent-signup-complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** What the sign-up page sends: one family, its child, the four required documents, the plan and InstaPay. */
function application(key: string, partnerClaim: Record<string, unknown> | null) {
  return {
    nursery_id: n!.id,
    credentials: { username: `${n!.run}-${key}`, password: `Ui!${crypto.randomUUID()}` },
    files: {
      childPhoto: null,
      fatherIdPhoto: null,
      motherIdPhoto: file('mother-id.png'),
      birthCertificate: file('birth.png'),
      vaccinationCard: file('vaccination.png'),
      proofOfAddress: file('address.png'),
      medicalReport: null,
      otherDocument: null,
      pickupPerson1Photo: null,
      pickupPerson2Photo: null,
    },
    child: {
      full_name_ar: `طفل ${key}`, full_name_en: `Child ${key}`, first_name: 'Child', middle_name: null, last_name: key, nickname: null,
      dob: '2023-04-01', gender: 'female', nationality: 'Egyptian', department: null, school_preference: null, school_admissions_plan: null,
      academic_year: null, has_siblings: false, sibling_ages: null, avatar_url: null, birth_certificate_path: null, vaccination_card_path: null,
      daily_care_preferences: {}, emergency_contacts: [{ name: 'Aunt', relationship: 'aunt', phone: '01012345678' }], home_address: 'Cairo',
    },
    family: { marital_status: null, address: 'Cairo', referral_source: null },
    father: null,
    mother: { full_name: `UI Signup Mother ${key}`, job: 'Engineer at UI Telecom', mobile: '01012345679', email: null, id_photo_path: null },
    pickups: [],
    consents: { health_policy: true, financial_agreement: true, policies: true, info_accuracy: true },
    registration_template: null,
    registration_answers: {},
    payment: {
      package_id: n!.tuitionPackageId,
      billing_period: 'monthly',
      extra_hours_package_id: n!.extraHoursPackageId,
      method: 'instapay',
      reference: `Ref ${n!.run} ${key}; sender: mother@instapay`,
      idempotency_key: crypto.randomUUID(),
    },
    partner_claim: partnerClaim,
  };
}

/** The account the sign-up made, so the cleanup removes it too. */
async function track(applicationId: unknown) {
  const [row] = await sql<{ parent_id: string }>(`select parent_id from public.applications where id = '${String(applicationId)}'`);
  n!.extraUserIds = [...(n!.extraUserIds ?? []), row.parent_id];
  return row.parent_id;
}

test.describe.serial('naming a partner at sign-up', () => {
  test.beforeAll(async () => {
    n = await createTestNursery();
    const save = (name: string, payload: Record<string, unknown>) =>
      n!.admin.client.rpc('save_discount_partner', {
        p_nursery_id: n!.id,
        p_id: null,
        p: { kind: 'company', name_en: name, discount_type: 'percentage', starts_on: null, ...payload },
      });
    partners.instant = ok(await save('UI Club', { discount_value: 10, applies_to: ['tuition', 'extra_hours'], requires_proof: false }), 'instant partner') as string;
    partners.proof = ok(await save('UI Telecom', { discount_value: 20, applies_to: ['tuition'], requires_proof: true, aliases: ['ui telecom'] }), 'proof partner') as string;
  });

  test.afterAll(async () => {
    await cleanupTestNursery(n);
  });

  test('the payment options carry the partners and the cap', async () => {
    const { status, body } = await signupFunction({ action: 'payment_options', nursery_id: n!.id });
    expect(status).toBe(200);
    const offers = body.partner_offers as Array<{ id: string; requires_proof: boolean; contact_email?: unknown }>;
    expect(offers.map((o) => o.id).sort()).toEqual([partners.instant, partners.proof].sort());
    // No contact details for the public page.
    expect(offers.every((o) => o.contact_email === undefined)).toBe(true);
    expect(Number(body.discount_cap_percentage)).toBe(30);
  });

  test('a partner needing a proof is refused without one, before any account is made', async () => {
    const { status, body } = await signupFunction(application('noproof', { partner_id: partners.proof, proof: null }));
    expect(status).toBe(400);
    expect(body.error).toBe('partner_proof_required');
    const [left] = await sql<{ c: number }>(`select count(*)::int as c from public.users where username = '${n!.run}-noproof'`);
    expect(left.c).toBe(0);
  });

  test('a partner needing no proof takes its discount off the first invoice at once', async () => {
    const { status, body } = await signupFunction(application('instant', { partner_id: partners.instant, proof: null }));
    expect(status, JSON.stringify(body)).toBe(200);
    expect(body.partner_claim_state).toBe('active');
    const parentId = await track(body.application_id);
    // Tuition 3,000 less 10% and the extra-hours pack 500 less 10%: 3,150, which is what the family pays.
    const [inv] = await sql<{ amount: string; lines: string; paid: string }>(`
      select i.amount::text,
             (select string_agg(concat(item ->> 'source', ':', item ->> 'scope', ':', -(item ->> 'total')::numeric), ' ' order by item ->> 'scope' desc)
                from jsonb_array_elements(i.line_items_json -> 'items') item where item ->> 'kind' = 'discount') as lines,
             (select string_agg(pa.amount::text, ',') from public.payment_attempts pa where pa.invoice_id = i.id) as paid
        from public.invoices i where i.parent_id = '${parentId}'`);
    expect(inv).toEqual({ amount: '3150.00', lines: 'partnership:tuition:300.00 partnership:extra_hours:50.00', paid: '3150.00' });
  });

  test('a partner needing a proof waits for the nursery, with the proof; the first payment is the full price', async () => {
    const { status, body } = await signupFunction(application('proof', { partner_id: partners.proof, proof: file('staff-id.png') }));
    expect(status, JSON.stringify(body)).toBe(200);
    expect(body.partner_claim_state).toBe('pending');
    const parentId = await track(body.application_id);
    const [claim] = await sql<{ status: string; application: boolean; proof: string }>(`
      select status, application_id = '${String(body.application_id)}' as application, proof_path as proof
        from public.partner_beneficiaries where parent_id = '${parentId}'`);
    expect(claim.status).toBe('pending');
    expect(claim.application).toBe(true);
    expect(claim.proof).toMatch(new RegExp(`^${n!.id}/${parentId}/signup-.+\\.png$`));
    const svc = await service();
    const download = await svc.storage.from('partner-proofs').download(claim.proof);
    expect(download.error).toBeNull();
    const [inv] = await sql<{ amount: string }>(`select amount::text from public.invoices where parent_id = '${parentId}'`);
    expect(inv.amount).toBe('3500.00');
    // The nursery hears of it.
    const [note] = await sql<{ c: number }>(
      `select count(*)::int as c from public.notifications where user_id = '${n!.admin.id}' and template_key = 'partner_claim_received'`,
    );
    expect(note.c).toBe(1);
  });
});
