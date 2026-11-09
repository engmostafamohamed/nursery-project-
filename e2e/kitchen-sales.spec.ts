// Kitchen sales and children's extras, end to end against the real database: the admin prices an
// item (checked under the fields), restocks it in cartons, adds a staff discount and takes the item
// for a teacher (priced with the discount, open until the next payslip); the teacher asks to give a
// child an extra, the parent approves it and orders one more, the teacher serves it and it lands on
// the family's monthly food invoice; the teacher sees their own food account; and a charge made by
// mistake is cancelled with a reason, its stock put back.
import { expect, test } from '@playwright/test';

import { cleanupTestNursery, createTestNursery, signIn, sql, type TestNursery } from './support/nursery';

let n: TestNursery | undefined;
let childId = '';

test.describe.serial('Kitchen sales and extras', () => {
  test.beforeAll(async () => {
    n = await createTestNursery();
    await sql(`update public.nurseries set working_days = '["sun", "mon", "tue", "wed", "thu", "fri", "sat"]' where id = '${n.id}'`);
    const [c] = await sql<{ id: string }>(`
      insert into public.children (nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date, daily_care_preferences)
      values ('${n.id}', '${n.classId}', 'ريم', 'UI Reem', '2023-04-01', 'active', '2026-01-01', '{"accepts_extra_snacks": false}') returning id`);
    childId = c.id;
    n.childIds.push(childId);
    await sql(`insert into public.parent_children (parent_id, child_id, is_primary) values ('${n.parent.id}', '${childId}', true)`);
  });

  test.afterAll(async () => {
    await cleanupTestNursery(n);
  });

  test('the admin prices an item, restocks it in cartons and adds a staff discount', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto('/admin/kitchen');
    await page.getByRole('button', { name: 'Add item' }).first().click();
    const add = page.getByTestId('kitchen-item-dialog');
    await add.getByLabel('Item').fill('UI Juice');
    await add.getByLabel('Category').selectOption('drinks');
    await add.getByLabel('Unit').fill('box');
    await add.getByRole('radio', { name: 'Extra drink' }).click();
    await add.getByRole('button', { name: 'Save item' }).click();
    await expect(add.locator('#kitchen-extra-error')).toHaveText('An extra needs a price for children.');
    await add.getByLabel('Price for children').fill('10');
    await add.getByLabel('Price for staff').fill('8');
    await add.getByLabel('Per pack (box)').fill('24');
    await add.getByLabel('Pack name').fill('carton');
    await add.getByRole('button', { name: 'Save item' }).click();
    const row = page.getByRole('row').filter({ hasText: 'UI Juice' });
    await expect(row).toContainText('EGP 10');

    await row.getByRole('button', { name: 'Delivery' }).click();
    const delivery = page.getByRole('dialog', { name: /Delivery/ });
    await delivery.getByLabel('Quantity').fill('2');
    await expect(delivery.getByText('= 48 box')).toBeVisible();
    await delivery.getByRole('button', { name: 'Record' }).click();
    await expect(row).toContainText('48');

    await page.getByRole('tab', { name: 'Discounts' }).click();
    await page.getByTestId('add-discount').click();
    const discount = page.getByTestId('discount-dialog');
    await discount.getByLabel('Name in Arabic').fill('خصم الموظفين');
    await discount.getByLabel('Name in English').fill('UI Staff discount');
    await discount.getByLabel('Discount').fill('50');
    await discount.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('discount-list')).toContainText('UI Staff discount');
    await expect(page.getByTestId('discount-list')).toContainText('−50%');
  });

  test('the admin takes juice for a teacher at the staff price less the discount', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto('/admin/kitchen');
    await page.getByRole('row').filter({ hasText: 'UI Juice' }).getByRole('button', { name: 'Take UI Juice for someone' }).click();
    const dialog = page.getByTestId('charge-dialog');
    await dialog.getByLabel('Member of staff', { exact: true }).selectOption({ label: n!.teacher.name_en });
    await dialog.getByLabel('Quantity (box)').fill('2');
    await expect(dialog.getByTestId('charge-preview')).toContainText('UI Staff discount (50%)');
    await expect(dialog.getByTestId('charge-preview')).toContainText('EGP 8');
    await dialog.getByRole('button', { name: 'Record' }).click();
    await expect(page.getByText('Recorded on the staff member’s account.')).toBeVisible();

    await page.getByRole('tab', { name: 'Sales' }).click();
    const sale = page.getByRole('row').filter({ hasText: n!.teacher.name_en });
    await expect(sale).toContainText('Open · next payslip');
    await expect(page.getByTestId('staff-open')).toContainText('EGP 8');
  });

  test('a teacher asks to give a child an extra, the parent approves and orders, the teacher serves', async ({ browser }) => {
    const teacherPage = await browser.newPage();
    await signIn(teacherPage, n!.teacher);
    await teacherPage.goto('/teacher/meals');
    const child = teacherPage.getByTestId('teacher-extra-child').filter({ hasText: 'UI Reem' });
    await child.getByRole('button', { name: 'Give extra' }).click();
    const give = teacherPage.getByTestId('give-extra-dialog');
    await give.getByRole('radio', { name: /UI Juice/ }).click();
    await expect(give.getByText('The parent is asked first (EGP 10). It is served only if they agree.')).toBeVisible();
    await give.getByRole('button', { name: 'Ask the parent' }).click();
    await expect(teacherPage.getByText('The parent of UI Reem was asked about UI Juice.')).toBeVisible();
    await expect(child).toContainText('Waiting for parent');

    const parentPage = await browser.newPage();
    await signIn(parentPage, n!.parent);
    await parentPage.goto('/parent/meals?view=extras');
    const waiting = parentPage.getByTestId('waiting-extra');
    await expect(waiting).toContainText('UI Juice');
    await waiting.getByRole('button', { name: 'Yes, give it' }).click();
    await expect(parentPage.getByText('Approved. The teacher can now give it.')).toBeVisible();
    await parentPage.getByTestId('family-extras').getByRole('button', { name: 'Order' }).first().click();
    const order = parentPage.getByTestId('order-extra-dialog');
    await expect(order.getByTestId('order-days').getByRole('button', { name: /Today/ })).toHaveAttribute('aria-pressed', 'true');
    await order.getByRole('button', { name: 'Order' }).click();
    await expect(parentPage.getByText('UI Juice ordered for UI Reem for 1 day.')).toBeVisible();

    await teacherPage.reload();
    await expect(child.getByTestId('serve-extra')).toHaveCount(2);
    await child.getByTestId('serve-extra').first().click();
    await expect(teacherPage.getByText('UI Juice served to UI Reem and added to the food invoice.')).toBeVisible();
    const [invoice] = await sql<{ amount: string; lines: number }>(`
      select amount::text, jsonb_array_length(line_items_json -> 'items') as lines from public.invoices
       where invoice_type = 'food_extras' and line_items_json ->> 'child_id' = '${childId}'`);
    expect(invoice).toEqual({ amount: '10.00', lines: 1 });

    // The teacher's own account shows the juice taken for them.
    await expect(teacherPage.getByTestId('my-open-total')).toHaveText('EGP 8');
    await teacherPage.close();
    await parentPage.close();
  });

  test('a charge made by mistake is cancelled with a reason, its stock put back', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto('/admin/kitchen?tab=sales');
    const sale = page.getByRole('row').filter({ hasText: 'UI Reem' });
    await sale.getByRole('button', { name: 'Cancel UI Juice' }).click();
    const dialog = page.getByTestId('cancel-charge-dialog');
    await dialog.getByRole('button', { name: 'Cancel charge' }).click();
    await expect(dialog.locator('#cancel-reason-error')).toHaveText('Write why (at least 3 letters).');
    await dialog.getByLabel('Why').fill('Given to the wrong child');
    await dialog.getByRole('button', { name: 'Cancel charge' }).click();
    await expect(page.getByText('The charge was cancelled and the stock put back.')).toBeVisible();
    await expect(sale).toContainText('Cancelled');
    const [stock] = await sql<{ quantity: string }>(`select quantity::text from public.inventory where nursery_id = '${n!.id}' and item_name = 'UI Juice'`);
    expect(stock.quantity).toBe('46.00');
  });
});
