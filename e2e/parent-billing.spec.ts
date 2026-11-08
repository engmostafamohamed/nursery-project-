// The parent's bills, end to end against the real database: what they owe at the top and the
// button to the oldest overdue invoice; paying in steps (everything by default, a part only when
// asked, points first, then the method and a last check); one payment however many clicks; a second
// payment warned about; points that cover the rest close the invoice without a method; an invoice
// cancelled while the parent pays; the nursery's confirmation reaching the parent; and the Arabic
// screens with nothing left in English.
import { expect, test, type Page } from '@playwright/test';

import { cleanupTestNursery, createTestNursery, signIn, sql, type TestNursery } from './support/nursery';

let n: TestNursery | undefined;
const ids: Record<string, string> = {};

/** An invoice for the test parent, due `days` from the nursery's today (negative: overdue). */
async function addInvoice(key: string, amount: number, days: number, status = 'pending') {
  const [row] = await sql<{ id: string }>(`
    insert into public.invoices (nursery_id, parent_id, amount, due_date, status, invoice_type, line_items_json)
    select '${n!.id}', '${n!.parent.id}', ${amount},
           (now() at time zone ns.timezone)::date + ${days}, '${status}', 'monthly',
           jsonb_build_object('items', jsonb_build_array(jsonb_build_object('description', 'UI tuition ${key}', 'quantity', 1, 'unit_price', ${amount}, 'total', ${amount})))
      from public.nursery_settings ns where ns.nursery_id = '${n!.id}'
    returning id`);
  ids[key] = row.id;
}

const attempts = (key: string) =>
  sql<{ amount: string; status: string }>(`select amount::text, status from public.payment_attempts where invoice_id = '${ids[key]}' order by created_at`);

async function openPay(page: Page, key: string) {
  await page.goto(`/parent/invoices/${ids[key]}/pay`);
  await expect(page.getByRole('heading', { name: 'How much do you want to pay?' })).toBeVisible();
}

/** From the amount step to the confirm step with InstaPay. */
async function payWithInstapay(page: Page, reference: string) {
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Continue without points' }).click();
  await expect(page.getByRole('heading', { name: 'How will you pay?' })).toBeVisible();
  await page.locator('#pay-flow-instapay-sender').fill('ui.mother@instapay');
  await page.locator('#pay-flow-reference').fill(reference);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Check and send' })).toBeVisible();
}

test.describe.serial('the parent pays their bills', () => {
  test.beforeAll(async () => {
    n = await createTestNursery();
    await sql(`update public.nursery_settings set loyalty_enabled = true, points_redemption_rate = 0.10 where nursery_id = '${n.id}'`);
    await sql(`insert into public.loyalty_transactions (nursery_id, parent_id, transaction_type, points, source)
               values ('${n.id}', '${n.parent.id}', 'earned', 6000, 'manual')`);
    await addInvoice('oldLate', 3000, -10);
    await addInvoice('late', 1200, -3);
    await addInvoice('next', 800, 7);
    await addInvoice('paid', 500, -20, 'paid');
    await addInvoice('cancelMe', 600, 5);
  });

  test.afterAll(async () => {
    await cleanupTestNursery(n);
  });

  test('the top says what is owed, and its button opens the oldest overdue invoice', async ({ page }) => {
    await signIn(page, n!.parent);
    await page.goto('/parent/invoices');
    await expect(page.getByTestId('balance-owed')).toHaveText('EGP 5,600');
    await expect(page.getByText('2 invoices overdue · EGP 4,200')).toBeVisible();
    await expect(page.getByTestId('invoice-item')).toHaveCount(5);
    await expect(page.getByTestId('invoice-item').filter({ hasText: 'UI tuition paid' })).toContainText('Paid');

    await page.getByRole('button', { name: 'Pay overdue' }).click();
    await expect(page).toHaveURL(new RegExp(`/parent/invoices/${ids.oldLate}/pay`));
  });

  test('paying everything sends one payment, however many clicks, and shows it waiting', async ({ page }) => {
    await signIn(page, n!.parent);
    await openPay(page, 'oldLate');
    // Everything left is the default; a part is only one click away.
    await expect(page.getByRole('radio', { name: /Pay everything left/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radio', { name: /Pay everything left/ })).toContainText('EGP 3,000');
    await payWithInstapay(page, 'UIREF3000');
    await expect(page.getByTestId('confirm-amount')).toHaveText('EGP 3,000');

    const send = page.getByRole('button', { name: 'Send payment · EGP 3,000' });
    await send.dblclick();
    await expect(page.getByTestId('pay-outcome-sent')).toBeVisible();
    await expect(page.getByTestId('pay-outcome-sent')).toContainText('Waiting for confirmation');
    expect(await attempts('oldLate')).toEqual([{ amount: '3000.00', status: 'pending_confirmation' }]);

    // Read again at once: the list already shows it waiting, and it no longer counts as owed.
    await page.getByRole('link', { name: 'Back to my invoices' }).click();
    await expect(page.getByTestId('balance-owed')).toHaveText('EGP 2,600');
    await expect(page.getByText('EGP 3,000 sent and waiting for the nursery to confirm')).toBeVisible();
    await expect(page.getByTestId('invoice-item').filter({ hasText: 'UI tuition oldLate' })).toContainText('Waiting for confirmation');

    // Its pay page now says there is nothing to send, only to wait for.
    await page.goto(`/parent/invoices/${ids.oldLate}/pay`);
    await expect(page.getByTestId('pay-outcome-waiting')).toBeVisible();
  });

  test('a part payment is checked under the field, and a second payment is warned about', async ({ page }) => {
    await signIn(page, n!.parent);
    await openPay(page, 'late');
    await page.getByRole('button', { name: 'Pay part of it instead' }).click();
    const amount = page.locator('#pay-part-amount');
    await amount.fill('5000');
    await expect(page.locator('#pay-part-amount-error')).toHaveText('You can pay up to EGP 1,200.');
    await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
    await amount.fill('0');
    await expect(page.locator('#pay-part-amount-error')).toHaveText('The amount must be more than 0.');
    await amount.fill('200');
    await expect(page.locator('#pay-part-amount-error')).toHaveCount(0);
    await payWithInstapay(page, 'UIREF0200');
    await expect(page.getByTestId('confirm-amount')).toHaveText('EGP 200');
    await page.getByRole('button', { name: 'Send payment · EGP 200' }).click();
    await expect(page.getByTestId('pay-outcome-sent')).toBeVisible();
    expect(await attempts('late')).toEqual([{ amount: '200.00', status: 'pending_confirmation' }]);

    // Coming back: the payment already sent is shown first, and only the rest can be paid.
    await openPay(page, 'late');
    await expect(page.getByText('You already sent a payment for this invoice')).toBeVisible();
    await expect(page.getByRole('radio', { name: /Pay everything left/ })).toContainText('EGP 1,000');
    await page.goto(`/parent/invoices/${ids.late}`);
    await expect(page.getByRole('note')).toContainText('EGP 200 on');
    await expect(page.locator('dl > div').filter({ hasText: 'Left to pay' })).toContainText('EGP 1,000');
    await expect(page.getByRole('link', { name: 'Pay EGP 1,000' })).toBeVisible();
  });

  test('points come off before paying, within the limits, and can close an invoice on their own', async ({ page }) => {
    await signIn(page, n!.parent);
    await openPay(page, 'next');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('heading', { name: 'Use your points?' })).toBeVisible();
    await expect(page.getByText('You have 6,000 points')).toBeVisible();
    // Half of 800 at 0.10 per point: up to 4000 points.
    await page.locator('#pay-points').fill('50');
    await expect(page.locator('#pay-points-error')).toHaveText('Use at least 100 points.');
    await page.locator('#pay-points').fill('4001');
    await expect(page.locator('#pay-points-error')).toHaveText('You can use up to 4,000 points on this invoice.');
    await page.getByRole('button', { name: 'Use the most' }).click();
    await page.getByRole('button', { name: 'Apply discount · EGP 400' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Redeem' }).click();
    await expect(page.getByText('Discount applied: EGP 400 off this invoice')).toBeVisible();
    const [after] = await sql<{ amount: string; points: string }>(`
      select (select amount::text from public.invoices where id = '${ids.next}') as amount,
             (select sum(points)::text from public.loyalty_transactions where parent_id = '${n!.parent.id}' and nursery_id = '${n!.id}') as points`);
    expect(after).toEqual({ amount: '400.00', points: '2000' });
    await page.getByTestId('pay-back').click();
    await expect(page.getByRole('radio', { name: /Pay everything left/ })).toContainText('EGP 400');

    // An invoice with 100 left after a payment: points cover the rest, no method is asked for.
    await addInvoice('almostPaid', 300, 2);
    await sql(`insert into public.payments (invoice_id, amount, method, status, paid_at) values ('${ids.almostPaid}', 200, 'cash', 'completed', now())`);
    await openPay(page, 'almostPaid');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Use the most' }).click();
    await page.getByRole('button', { name: 'Apply discount · EGP 100' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Redeem' }).click();
    await expect(page.getByTestId('pay-outcome-paid_with_points')).toBeVisible();
    const [closed] = await sql<{ status: string }>(`select status from public.invoices where id = '${ids.almostPaid}'`);
    expect(closed.status).toBe('paid');
  });

  test('an invoice cancelled while the parent pays is not paid, and says so', async ({ page }) => {
    await signIn(page, n!.parent);
    await openPay(page, 'cancelMe');
    await payWithInstapay(page, 'UIREF0600');
    await sql(`update public.invoices set status = 'cancelled' where id = '${ids.cancelMe}'`);
    await page.getByRole('button', { name: 'Send payment · EGP 600' }).click();
    await expect(page.getByText('This invoice is already paid or cancelled.')).toBeVisible();
    await expect(page.getByTestId('pay-outcome-cancelled')).toBeVisible();
    expect(await attempts('cancelMe')).toEqual([]);
  });

  test('when the nursery confirms, the parent is told and the invoice reads paid', async ({ page }) => {
    const [attempt] = await sql<{ id: string }>(`select id from public.payment_attempts where invoice_id = '${ids.oldLate}' and status = 'pending_confirmation'`);
    const { error } = await n!.admin.client.rpc('confirm_invoice_payment_attempt', { p_attempt_id: attempt.id });
    expect(error).toBeNull();
    const notices = await sql<{ type: string }>(`select type from public.notifications where user_id = '${n!.parent.id}' and type = 'invoice_paid'`);
    expect(notices.length).toBe(1);

    await signIn(page, n!.parent);
    await page.goto('/parent/invoices');
    await expect(page.getByTestId('invoice-item').filter({ hasText: 'UI tuition oldLate' })).toContainText('Paid');
    await page.goto(`/parent/invoices/${ids.oldLate}`);
    await expect(page.getByText('EGP 3,000 paid by InstaPay')).toBeVisible();
    await page.getByRole('button', { name: 'More actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Download receipt' })).toBeVisible();
  });

  test('in Arabic the invoice and pay screens have no English left', async ({ page }) => {
    await signIn(page, n!.parent);
    // Registered after signIn's own (English) one, so it wins on every page load.
    await page.addInitScript(() => localStorage.setItem('xo_i18nextLng', 'ar'));
    await page.goto(`/parent/invoices/${ids.late}`);
    await page.getByRole('button', { name: 'إجراءات أخرى' }).click();
    const menu = page.getByRole('menu');
    for (const label of ['طباعة', 'مشاركة', 'حفظ كصورة', 'تنزيل PDF']) await expect(menu.getByRole('menuitem', { name: label })).toBeVisible();
    await page.keyboard.press('Escape');
    for (const path of [`/parent/invoices/${ids.late}`, `/parent/invoices/${ids.late}/pay`, '/parent/invoices']) {
      await page.goto(path);
      await page.waitForTimeout(1500);
      const text = await page.locator('main').innerText();
      expect(text, path).not.toMatch(/\b(Print|Share|Download image|Amount to pay|Next payment|Balance)\b/);
    }
  });
});
