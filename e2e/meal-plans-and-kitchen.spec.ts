// F&B meal plans, kitchen stock and health alerts, end to end against the real database: the admin
// adds meal plans (checked under the fields) and gives a child one; the child's next tuition invoice
// carries the meal line and the parent sees it; the kitchen records a delivery, refuses to use more
// than there is, and flags what is low or expiring; and a health alert is marked handled.
import { expect, test } from '@playwright/test';

import { cleanupTestNursery, createTestNursery, signIn, sql, type TestNursery } from './support/nursery';

let n: TestNursery | undefined;
let childId = '';
let subscriptionId = '';

test.describe.serial('F&B: meal plans, kitchen stock and health alerts', () => {
  test.beforeAll(async () => {
    n = await createTestNursery();
    const [c] = await sql<{ id: string }>(`
      insert into public.children (nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date)
      values ('${n.id}', '${n.classId}', 'ليلى الواجهة', 'UI Laila', '2023-03-01', 'active', '2026-01-01') returning id`);
    childId = c.id;
    n.childIds.push(childId);
    await sql(`insert into public.parent_children (parent_id, child_id, is_primary) values ('${n.parent.id}', '${childId}', true)`);
    await sql(`insert into public.child_allergies (child_id, nursery_id, allergen_name, severity) values ('${childId}', '${n.id}', 'Peanuts', 'severe')`);
    const [s] = await sql<{ id: string }>(`
      insert into public.child_tuition_subscriptions
        (nursery_id, child_id, tuition_package_id, tuition_package_name_ar, tuition_package_name_en, billing_period, duration_months,
         locked_price, billed_parent_id, status, started_at, next_invoice_date)
      values ('${n.id}', '${childId}', '${n.tuitionPackageId}', 'يوم كامل', 'UI Full day', 'monthly', 1, 3000, '${n.parent.id}', 'active', current_date - 30, current_date + 30)
      returning id`);
    subscriptionId = s.id;
  });

  test.afterAll(async () => {
    await cleanupTestNursery(n);
  });

  test('the admin adds meal plans and gives the child one', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto('/admin/meal-plans');
    await expect(page.getByRole('heading', { level: 1, name: 'Meal plans' })).toBeVisible();

    await page.getByRole('button', { name: 'Add meal plan' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New meal plan' });
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.locator('#plan-name-ar-error')).toHaveText('Write the name in Arabic.');
    await expect(dialog.locator('#plan-price-error')).toHaveText('Write a price from 0 to 100000, for example 800.');
    await dialog.getByLabel('Name in Arabic').fill('غداء فقط');
    await dialog.getByLabel('Name in English').fill('UI Lunch only');
    await dialog.getByRole('button', { name: /Breakfast/ }).click();
    await dialog.getByRole('button', { name: /Snacks/ }).click();
    await dialog.getByLabel('Monthly price').fill('500');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('The meal plan was saved.')).toBeVisible();
    await expect(page.getByTestId('meal-plan-card').filter({ hasText: 'UI Lunch only' })).toContainText('EGP 500');

    // The whole row opens the child's plan (its edit button can sit under the chat button on a short list).
    await page.getByRole('row').filter({ hasText: 'UI Laila' }).getByText('UI Laila').click();
    const childDialog = page.getByRole('dialog', { name: 'UI Laila’s meal plan' });
    await childDialog.getByRole('radio', { name: /UI Lunch only/ }).click();
    await expect(childDialog.getByText('EGP 500 will be added to each monthly invoice, from the next one.')).toBeVisible();
    await childDialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('The child’s meal plan was saved.')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'UI Laila' })).toContainText('EGP 500');
    const [plan] = await sql<{ name: string; price: string; charged: boolean }>(`
      select plan_name_en as name, monthly_price::text as price, charged from public.child_meal_plans where child_id = '${childId}' and ended_on is null`);
    expect(plan).toEqual({ name: 'UI Lunch only', price: '500.00', charged: true });
  });

  test('the child’s next tuition invoice carries the meal plan, and the parent sees it', async ({ page }) => {
    await sql(`update public.child_tuition_subscriptions set next_invoice_date = current_date where id = '${subscriptionId}'`);
    const [{ id }] = await sql<{ id: string }>(`select public._generate_tuition_invoice('${subscriptionId}') as id`);
    const [invoice] = await sql<{ amount: string; kinds: string }>(`
      select amount::text, (select string_agg(it ->> 'kind', ',') from jsonb_array_elements(line_items_json -> 'items') it) as kinds
        from public.invoices where id = '${id}'`);
    expect(invoice).toEqual({ amount: '3500.00', kinds: 'tuition,meal_plan' });

    await signIn(page, n!.parent);
    await page.goto(`/parent/invoices/${id}`);
    await expect(page.getByText('UI Lunch only')).toBeVisible();
    await expect(page.locator('dl > div').filter({ hasText: 'Amount' })).toContainText('EGP 3,500');
    await page.goto('/parent/meals');
    await expect(page.getByTestId('family-meal-plans')).toContainText('UI Lunch only');
    await expect(page.getByTestId('family-meal-plans')).toContainText('EGP 500 / month');
  });

  test('the kitchen records deliveries and uses, never below zero, and flags what needs attention', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto('/admin/kitchen');
    await expect(page.getByRole('heading', { level: 1, name: 'Kitchen stock' })).toBeVisible();
    await page.getByRole('button', { name: 'Add item' }).first().click();
    const add = page.getByRole('dialog', { name: 'Add item' });
    await add.getByLabel('Item').fill('UI Milk');
    await add.getByLabel('Category').selectOption('drinks');
    await add.getByLabel('Unit').fill('liter');
    await add.getByLabel('Low at').fill('2');
    await add.getByRole('button', { name: 'Save item' }).click();
    const row = page.getByRole('row').filter({ hasText: 'UI Milk' });
    await expect(row).toContainText('Out of stock');

    const [{ soon }] = await sql<{ soon: string }>(`select ((now() at time zone 'Africa/Cairo')::date + 2)::text as soon`);
    await row.getByRole('button', { name: 'Delivery' }).click();
    const delivery = page.getByRole('dialog', { name: /Delivery/ });
    await delivery.getByLabel('Quantity').fill('5');
    await expect(delivery.getByText('This leaves 5 liter')).toBeVisible();
    await delivery.getByLabel('Expiry date').fill(soon);
    await delivery.getByRole('button', { name: 'Record' }).click();
    await expect(row).toContainText('Expiring soon');

    await row.getByRole('button', { name: 'Take out' }).click();
    const use = page.getByRole('dialog', { name: /Take out/ });
    await use.getByLabel('Quantity').fill('7');
    await expect(use.locator('#movement-quantity-error')).toHaveText('Only 5 liter is in stock.');
    await use.getByLabel('Quantity').fill('4');
    await use.getByRole('button', { name: 'Record' }).click();
    await expect(row).toContainText('Low');
    await expect(row).toContainText('1');
    await expect(page.getByTestId('stock-history')).toContainText('Used · UI Milk');
    const [item] = await sql<{ quantity: string; moves: string }>(`
      select i.quantity::text, (select count(*)::text from public.inventory_movements m where m.item_id = i.id) as moves
        from public.inventory i where i.nursery_id = '${n!.id}' and i.item_name = 'UI Milk'`);
    expect(item).toEqual({ quantity: '1.00', moves: '2' });
  });

  test('a health alert reads clearly and can be marked handled', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto('/admin/health/alerts');
    await page.getByRole('button', { name: /Serious allergies/ }).click();
    const row = page.getByRole('row').filter({ hasText: 'UI Laila' });
    await expect(row).toContainText('Severe allergy');
    await row.getByRole('button', { name: 'Mark resolved' }).click();
    await page.getByRole('dialog', { name: 'Mark this alert handled?' }).getByRole('button', { name: 'Mark resolved' }).click();
    await expect(page.getByText('The alert was marked handled.')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'UI Laila' }).filter({ hasText: 'Severe allergy' })).toHaveCount(0);
  });
});
