// Browser notifications: a popup asks the first time an account opens its dashboard on a device,
// never again once answered, and the answer can be changed from the settings of each dashboard.
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { cleanupTestNursery, createTestNursery, type Person, type TestNursery } from './support/nursery';

let n: TestNursery | undefined;

const popup = (page: Page) => page.getByRole('dialog', { name: 'Enable notifications' });
const setting = (page: Page) => page.getByRole('checkbox', { name: 'Show notifications on this device' });

async function englishContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.addInitScript(() => window.localStorage.setItem('xo_i18nextLng', 'en'));
  return context;
}

/** The sign-in form by hand: the shared helper answers the popup in advance. */
async function signInByForm(page: Page, person: Person) {
  await page.goto('/login');
  await page.locator('#email').fill(person.email);
  await page.locator('#password').fill(person.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

async function reopen(page: Page, path: string) {
  await page.goto(path);
  await expect(setting(page)).toBeVisible();
}

test.describe.serial('asking about browser notifications', () => {
  test.beforeAll(async () => {
    n = await createTestNursery();
  });

  test.afterAll(async () => {
    await cleanupTestNursery(n);
  });

  test('admin: "Not Now" is remembered, and settings can turn it on later', async ({ browser }) => {
    const context = await englishContext(browser);
    const page = await context.newPage();
    await signInByForm(page, n!.admin);

    await expect(popup(page)).toContainText('class updates, messages, and attendance');
    await expect(popup(page)).toContainText('settings or profile page');
    await popup(page).getByRole('button', { name: 'Not Now' }).click();
    await expect(popup(page)).toHaveCount(0);

    await reopen(page, '/admin/settings');
    await expect(popup(page)).toHaveCount(0);
    await expect(setting(page)).not.toBeChecked();

    await context.grantPermissions(['notifications']);
    await setting(page).click();
    await expect(setting(page)).toBeChecked();

    // Open to managers too, who have no settings page.
    await reopen(page, '/admin/profile');
    await expect(setting(page)).toBeChecked();
    await expect(popup(page)).toHaveCount(0);
  });

  test('parent: "Allow" turns them on, and settings can turn them off', async ({ browser }) => {
    const context = await englishContext(browser);
    await context.grantPermissions(['notifications']);
    const page = await context.newPage();
    await signInByForm(page, n!.parent);

    await expect(popup(page)).toContainText('when your child checks in');
    await popup(page).getByRole('button', { name: 'Allow' }).click();
    await expect(popup(page)).toHaveCount(0);

    await reopen(page, '/parent/settings');
    await expect(setting(page)).toBeChecked();

    await setting(page).click();
    await expect(setting(page)).not.toBeChecked();

    await reopen(page, '/parent/settings');
    await expect(setting(page)).not.toBeChecked();
    await expect(popup(page)).toHaveCount(0);
  });

  test('teacher: closing the popup is an answer, and it holds after signing out', async ({ browser }) => {
    const context = await englishContext(browser);
    const page = await context.newPage();
    await signInByForm(page, n!.teacher);

    await expect(popup(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);

    await reopen(page, '/teacher/settings');
    await expect(setting(page)).not.toBeChecked();

    await page.getByRole('button', { name: /log ?out/i }).first().click();
    await signInByForm(page, n!.teacher);
    await reopen(page, '/teacher/settings');
    await expect(popup(page)).toHaveCount(0);

    // Another account on the same device has not answered yet.
    await page.getByRole('button', { name: /log ?out/i }).first().click();
    await signInByForm(page, n!.parent);
    await expect(popup(page)).toBeVisible();
  });

  test('blocked in the browser: no popup, and settings says where to allow them', async ({ browser }) => {
    const context = await englishContext(browser);
    await context.addInitScript(() => Object.defineProperty(Notification, 'permission', { get: () => 'denied' }));
    const page = await context.newPage();
    await signInByForm(page, n!.admin);

    await reopen(page, '/admin/settings');
    await expect(popup(page)).toHaveCount(0);
    await expect(setting(page)).toBeDisabled();
    await expect(page.getByText('Notifications are blocked in this browser.')).toBeVisible();
  });
});
