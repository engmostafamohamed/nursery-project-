// Partnership discounts, end to end against the real database: the admin adds a partner (each
// mistake shown under its field); the parent, whose job names it, asks for its discount from the
// invoices page with the proof it needs; the admin hears of it, a rejection needs its reason, and
// the admin confirms it (the family is told); the next monthly invoice carries the discount as its own
// line, which the parent reads; the admin ends it (the family is told); the financial report counts it.
import { expect, test, type Page } from '@playwright/test';

import {
  cleanupTestNursery,
  confirmAndApprove,
  createTestNursery,
  payApplication,
  PNG,
  prepareApplication,
  signIn,
  sql,
  type TestNursery,
} from './support/nursery';

let n: TestNursery | undefined;
let partnerId = '';
let invoiceId = '';

const notes = async (userId: string, key: string) =>
  Number((await sql<{ c: number }>(`select count(*)::int as c from public.notifications where user_id = '${userId}' and template_key = '${key}'`))[0].c);

async function openPartner(page: Page) {
  await page.goto(`/admin/deals/partners/${partnerId}`);
  await expect(page.getByRole('heading', { name: 'UI Telecom' })).toBeVisible({ timeout: 30_000 });
}

test.describe.serial('partnership discounts', () => {
  test.beforeAll(async () => {
    n = await createTestNursery();
    const app = await prepareApplication(n, { first_name: 'Lina', full_name_en: 'Lina UI', full_name_ar: 'لينا', dob: '2023-03-01', gender: 'female' });
    await payApplication(n, app.invoiceId);
    await confirmAndApprove(n, app);
    // What the mother wrote as her job at signup.
    await sql(`update public.users set occupation = 'Network engineer at UI Telecom' where id = '${n.parent.id}'`);
  });

  test.afterAll(async () => {
    await cleanupTestNursery(n);
  });

  test('the admin adds a partner, each mistake under its field', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto('/admin/deals/partners');
    await expect(page.getByRole('heading', { name: 'Partnerships' })).toBeVisible();
    await expect(page.getByText('No partners yet')).toBeVisible();
    await page.getByTestId('new-partner').first().click();
    const editor = page.getByTestId('partner-editor');
    await editor.getByRole('button', { name: 'Save' }).click();
    await expect(editor.getByText('Enter a name in Arabic or English.')).toBeVisible();

    await editor.locator('#partner-name-en').fill('UI Telecom');
    await editor.locator('#partner-name-ar').fill('يو آي تليكوم');
    await editor.locator('#partner-aliases').fill('UI Tel, يو آي');
    await editor.locator('#partner-value').fill('120');
    await editor.locator('#partner-value').blur();
    await expect(editor.getByText('A percentage cannot be more than 100%.')).toBeVisible();
    await editor.locator('#partner-value').fill('20');
    await editor.locator('#partner-proof-en').fill('Staff ID card');
    await editor.locator('#partner-email').fill('hr@');
    await editor.locator('#partner-email').blur();
    await expect(editor.getByText('Enter a valid email address.')).toBeVisible();
    await editor.locator('#partner-email').fill('hr@uitelecom.example');
    await editor.getByRole('button', { name: 'Save' }).click();

    // Saved, it opens on its own page, with no family yet.
    await expect(page).toHaveURL(/\/admin\/deals\/partners\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    partnerId = page.url().split('/').pop()!;
    await expect(page.getByRole('heading', { name: 'UI Telecom' })).toBeVisible();
    await expect(page.getByText('No families yet')).toBeVisible();
    const [row] = await sql<{ requires_proof: boolean; aliases: string[]; value: string }>(
      `select requires_proof, aliases, discount_value::text as value from public.discount_partners where id = '${partnerId}'`,
    );
    expect(row).toEqual({ requires_proof: true, aliases: ['ui tel', 'يو آي'], value: '20.00' });
  });

  test('the parent asks for it with the proof it needs', async ({ page }) => {
    await signIn(page, n!.parent);
    await page.goto('/parent/invoices#discounts');
    const card = page.getByTestId('family-discounts');
    await expect(card.getByText('No discounts yet')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('family-claim-discount').click();
    const dialog = page.getByTestId('claim-discount-dialog');
    // Her job names the partner.
    const offer = dialog.getByRole('radio', { name: /UI Telecom/ });
    await expect(offer.getByText('Matches your job')).toBeVisible();
    await offer.click();
    await dialog.getByRole('button', { name: 'Send request' }).click();
    await expect(dialog.getByText('Attach the proof this partner needs.')).toBeVisible();
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'staff-id.png', mimeType: 'image/png', buffer: PNG });
    // Photos are shrunk (as JPEG) when chosen.
    await expect(dialog.getByText(/^staff-id.(png|jpg)$/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Send request' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expect(card.getByText('Waiting for review')).toBeVisible();
    await expect(card.getByText('The nursery is checking your proof.', { exact: false })).toBeVisible();
    expect(await notes(n!.admin.id, 'partner_claim_received')).toBe(1);
  });

  test('the admin rejects only with a reason, then confirms it', async ({ page }) => {
    await signIn(page, n!.admin);
    await openPartner(page);
    const row = page.locator('[data-testid^="beneficiary-"]').first();
    await expect(row.getByText('Waiting for review')).toBeVisible();
    await expect(row.getByRole('link', { name: 'View proof' })).toHaveAttribute('href', /partner-proofs/);

    await row.getByRole('button', { name: 'Reject' }).click();
    const reject = page.getByTestId('decide-claim-dialog');
    await reject.getByRole('button', { name: 'Reject' }).click();
    await expect(reject.getByText('Write the reason (the family reads it).')).toBeVisible();
    await reject.getByRole('button', { name: 'Cancel' }).click();

    await row.getByRole('button', { name: 'Confirm' }).click();
    const confirm = page.getByTestId('decide-claim-dialog');
    await confirm.locator('#decide-note').fill('Staff ID checked');
    await confirm.getByRole('button', { name: 'Confirm' }).click();
    await expect(confirm).toBeHidden({ timeout: 30_000 });
    await expect(row.getByText('Active', { exact: true })).toBeVisible();
    expect(await notes(n!.parent.id, 'partner_discount_approved')).toBe(1);
  });

  test('the next monthly invoice carries the discount as its own line', async ({ page }) => {
    // The billing job's own function, for the child's subscription, on the day its next invoice is due.
    const subscription = `(select s.id from public.child_tuition_subscriptions s where s.billed_parent_id = '${n!.parent.id}' and s.status = 'active' limit 1)`;
    await sql(`update public.child_tuition_subscriptions set next_invoice_date = public.nursery_today('${n!.id}') where id = ${subscription}`);
    const [generated] = await sql<{ id: string }>(`select public._generate_tuition_invoice(${subscription})::text as id`);
    invoiceId = generated.id;
    const [inv] = await sql<{ amount: string }>(`select amount::text from public.invoices where id = '${invoiceId}'`);
    expect(inv.amount).toBe('2400.00');

    await signIn(page, n!.parent);
    await page.goto(`/parent/invoices/${invoiceId}`);
    await expect(page.getByText('Partnership discount · UI Telecom (20%)')).toBeVisible({ timeout: 30_000 });
    await page.goto('/parent/invoices#discounts');
    await expect(page.getByTestId('family-discounts').getByText('Active', { exact: true })).toBeVisible({ timeout: 30_000 });
  });

  test('the admin ends it and the report counts what it took off', async ({ page }) => {
    await signIn(page, n!.admin);
    await openPartner(page);
    const row = page.locator('[data-testid^="beneficiary-"]').first();
    await expect(row.getByText('EGP 600', { exact: true })).toBeVisible();
    await row.getByRole('button', { name: 'End' }).click();
    const end = page.getByTestId('end-discount-dialog');
    await end.getByRole('button', { name: 'End discount' }).click();
    await expect(end).toBeHidden({ timeout: 30_000 });
    await expect(row.getByText('Ended', { exact: true })).toBeVisible();
    expect(await notes(n!.parent.id, 'partner_discount_ended')).toBe(1);

    await page.goto('/admin/reports/financial');
    const report = page.getByTestId('discounts-report');
    await expect(report.getByRole('link', { name: 'UI Telecom' })).toBeVisible({ timeout: 30_000 });
    await expect(report.getByText('EGP 600', { exact: true }).first()).toBeVisible();
  });
});
