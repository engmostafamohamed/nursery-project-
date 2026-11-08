// The XO platform home page: the whole platform's numbers and charts for the super admin, every
// nursery in one sortable table, and a row opens that nursery's own dashboard.
import { expect, test } from '@playwright/test';

import { cleanupTestNursery, createTestNursery, ok, service, type TestNursery } from './support/nursery';

let n: TestNursery | undefined;
let xo: { id: string; email: string; password: string } | undefined;

test.describe.serial('the XO platform dashboard', () => {
  test.beforeAll(async () => {
    n = await createTestNursery();
    // A throw-away platform super admin, removed with the nursery.
    const svc = await service();
    const email = `${n.run}-xo@xo-platform.local`;
    const password = `Ui!${crypto.randomUUID()}`;
    const created = await svc.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(`xo admin: ${created.error?.message}`);
    const id = created.data.user.id;
    n.extraUserIds = [...(n.extraUserIds ?? []), id];
    ok(
      await svc.from('users').upsert(
        { id, email, role: 'xo_super_admin', name_ar: 'مدير المنصة', name_en: 'Platform admin', status: 'active', language_pref: 'en', onboarding_completed: true },
        { onConflict: 'id' },
      ),
      'xo admin profile',
    );
    xo = { id, email, password };
  });

  test.afterAll(async () => {
    await cleanupTestNursery(n);
  });

  test('shows the platform and opens a nursery from its table', async ({ page }) => {
    await page.addInitScript((userId) => {
      window.localStorage.setItem('xo_i18nextLng', 'en');
      window.localStorage.setItem(`xo_push_choice:${userId}`, 'off');
    }, xo!.id);
    await page.goto('/login');
    await page.locator('#email').fill(xo!.email);
    await page.locator('#password').fill(xo!.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/xo-admin$/, { timeout: 30_000 });

    await expect(page.getByRole('heading', { level: 1, name: 'XO admin dashboard' })).toBeVisible();
    for (const section of ['Money', 'Children and attendance', 'Nurseries and users']) {
      await expect(page.getByRole('heading', { level: 2, name: section })).toBeVisible();
    }
    for (const card of ['Billed and collected, 12 months', 'Invoices by status', 'Daily attendance, last 30 days', 'Nurseries at a glance']) {
      await expect(page.getByRole('heading', { name: card })).toBeVisible();
    }

    // The new nursery has no children yet, so it sorts to the end: show every row, then open it.
    const showAll = page.getByRole('button', { name: /^Show all/ });
    if (await showAll.isVisible()) await showAll.click();
    // The charts carry hidden tables for screen readers too: this is the visible one, with a Nursery column.
    const table = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'Nursery' }) });
    const row = table.getByRole('row').filter({ hasText: `UI Nursery ${n!.run}` });
    await expect(row).toBeVisible();
    await expect(row.getByRole('cell').nth(1)).toHaveText('0');

    // Sorting by children the other way puts the nurseries without children first.
    await table.getByRole('button', { name: 'Children', exact: true }).click();
    await expect(table.getByRole('columnheader', { name: 'Children', exact: true })).toHaveAttribute('aria-sort', 'ascending');
    await expect(table.getByRole('row').nth(1).getByRole('cell').nth(1)).toHaveText('0');

    await row.click();
    await expect(page).toHaveURL(/\/xo-admin\/nursery$/);
  });
});
