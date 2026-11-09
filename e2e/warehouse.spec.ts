// The warehouse, end to end against the real database: the admin adds a store item with where it is
// kept, its cost and pack; records a delivery in cartons from a supplier (its total shown before
// saving); issues some to a class, taken by its teacher (a class or a person is required, never more
// than is there); charges diapers to a child (on the family's extras invoice, the parents told); and
// the month's history shows what came in and what the class took, at cost.
import { expect, test } from '@playwright/test';

import { cleanupTestNursery, createTestNursery, signIn, sql, type TestNursery } from './support/nursery';

let n: TestNursery | undefined;
let childId = '';

test.describe.serial('Warehouse', () => {
  test.beforeAll(async () => {
    n = await createTestNursery();
    const [c] = await sql<{ id: string }>(`
      insert into public.children (nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date)
      values ('${n.id}', '${n.classId}', 'سلمى', 'UI Salma', '2024-09-01', 'active', '2026-01-01') returning id`);
    childId = c.id;
    n.childIds.push(childId);
    await sql(`insert into public.parent_children (parent_id, child_id, is_primary) values ('${n.parent.id}', '${childId}', true)`);
  });

  test.afterAll(async () => {
    await cleanupTestNursery(n);
  });

  test('the admin adds a store item and records a delivery from a supplier', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto('/admin/inventory');
    await expect(page.getByRole('heading', { name: 'Warehouse' })).toBeVisible();
    await page.getByRole('button', { name: 'Add item' }).first().click();
    const add = page.getByTestId('kitchen-item-dialog');
    await add.getByLabel('Item').fill('UI Crayons');
    await add.getByLabel('Category').selectOption('supplies');
    // Store items are never menu extras.
    await expect(add.getByRole('radiogroup', { name: 'On the menu as an extra' })).toHaveCount(0);
    await add.getByLabel('Unit').fill('box');
    await add.getByLabel('Kept in').fill('UI Shelf 2');
    await add.getByLabel('Per pack (box)').fill('12');
    await add.getByLabel('Pack name').fill('carton');
    await add.getByRole('button', { name: 'Save item' }).click();
    const row = page.getByRole('row').filter({ hasText: 'UI Crayons' });
    await expect(row).toContainText('UI Shelf 2');
    await expect(row).toContainText('Classroom supplies');
    await expect(row).toContainText('Out of stock');

    await row.getByRole('button', { name: 'Delivery' }).click();
    const delivery = page.getByRole('dialog', { name: /Delivery/ });
    await delivery.getByLabel('Quantity').fill('2');
    await expect(delivery.getByText('= 24 box')).toBeVisible();
    await delivery.getByLabel('Supplier').fill('UI Bookshop');
    await delivery.getByLabel('Cost per box').fill('32.555');
    await expect(delivery.locator('#movement-cost-error')).toHaveText('Write a price up to 100000, e.g. 12.50.');
    await delivery.getByLabel('Cost per box').fill('32.5');
    await expect(delivery.getByText('This delivery costs')).toBeVisible();
    await expect(delivery).toContainText('EGP 780');
    await delivery.getByRole('button', { name: 'Record' }).click();
    await expect(row).toContainText('24');
    await expect(page.getByTestId('stock-history')).toContainText('from UI Bookshop');
  });

  test('supplies are issued to a class, taken by its teacher', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto('/admin/inventory');
    const row = page.getByRole('row').filter({ hasText: 'UI Crayons' });
    await row.getByRole('button', { name: 'Take out' }).click();
    const out = page.getByTestId('stock-movement-dialog');
    await expect(out.getByRole('radio', { name: 'Issued' })).toHaveAttribute('aria-checked', 'true');
    await out.getByLabel('Quantity').fill('30');
    await expect(out.locator('#movement-quantity-error')).toHaveText('Only 24 box is in stock.');
    await out.getByLabel('Quantity').fill('4');
    await out.getByRole('button', { name: 'Record' }).click();
    await expect(out.locator('#movement-class-error')).toHaveText('Choose the class it went to or who took it.');
    await out.getByLabel('To class').selectOption({ label: 'UI Class' });
    await out.getByLabel('Taken by').selectOption({ label: n!.teacher.name_en });
    await out.getByRole('button', { name: 'Record' }).click();
    await expect(row).toContainText('20');
    await expect(page.getByTestId('stock-history')).toContainText('Issued · UI Crayons');
    await expect(page.getByTestId('stock-history')).toContainText(`to UI Class · taken by ${n!.teacher.name_en}`);

    const [m] = await sql<{ kind: string; change: string; unit_cost: string }>(`
      select mv.kind, mv.change::text, mv.unit_cost::text from public.inventory_movements mv join public.inventory i on i.id = mv.item_id
       where i.nursery_id = '${n!.id}' and i.item_name = 'UI Crayons' order by mv.created_at desc limit 1`);
    expect(m).toEqual({ kind: 'issued', change: '-4.00', unit_cost: '32.50' });
  });

  test('diapers are charged to a child and land on the family’s extras invoice', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto('/admin/inventory');
    await page.getByRole('button', { name: 'Add item' }).first().click();
    const add = page.getByTestId('kitchen-item-dialog');
    await add.getByLabel('Item').fill('UI Diapers');
    await add.getByLabel('Category').selectOption('hygiene');
    await add.getByLabel('Unit').fill('piece');
    await add.getByLabel('Price for children').fill('6');
    await add.getByRole('button', { name: 'Save item' }).click();
    const row = page.getByRole('row').filter({ hasText: 'UI Diapers' });
    await row.getByRole('button', { name: 'Delivery' }).click();
    const delivery = page.getByRole('dialog', { name: /Delivery/ });
    await delivery.getByLabel('Quantity').fill('50');
    await delivery.getByRole('button', { name: 'Record' }).click();
    await expect(row).toContainText('50');

    await row.getByRole('button', { name: 'Take UI Diapers for someone' }).click();
    const charge = page.getByTestId('charge-dialog');
    await expect(charge.getByRole('radio', { name: /Child/ })).toHaveAttribute('aria-checked', 'true');
    await expect(charge).toContainText('Charged now on the family’s monthly extras invoice; the parents are told.');
    await charge.locator('#charge-child').fill('UI Sal');
    await charge.getByRole('option').filter({ hasText: 'UI Salma' }).getByRole('button').click();
    await charge.getByLabel('Quantity (piece)').fill('5');
    await expect(charge.getByTestId('charge-preview')).toContainText('EGP 30');
    await charge.getByRole('button', { name: 'Record' }).click();
    await expect(page.getByText('Charged to the family’s extras invoice. The parents were told.')).toBeVisible();
    await expect(row).toContainText('45');

    const [invoice] = await sql<{ amount: string; item: string; told: string }>(`
      select iv.amount::text, iv.line_items_json -> 'items' -> 0 ->> 'name_en' as item,
             (select count(*)::text from public.notifications nt where nt.user_id = '${n!.parent.id}' and nt.type = 'stock_child_charged') as told
        from public.invoices iv where iv.invoice_type = 'food_extras' and iv.line_items_json ->> 'child_id' = '${childId}'`);
    expect(invoice).toEqual({ amount: '30.00', item: 'UI Diapers', told: '1' });
  });

  test('the month’s history shows what came in and what the class took', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto('/admin/inventory?tab=history');
    const panel = page.getByTestId('stock-history-panel');
    await expect(panel).toContainText('Received');
    await expect(panel).toContainText('EGP 780');
    await expect(page.getByTestId('stock-by-class')).toContainText('UI Class');
    await expect(page.getByTestId('stock-by-class')).toContainText('EGP 130');
    await page.getByLabel('What happened').selectOption('issued');
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await expect(page.getByTestId('history-row')).toContainText('UI Crayons');
  });
});
