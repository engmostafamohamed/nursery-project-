// The sign-in page, against the real project: an empty form says what is missing under each field;
// a wrong password says so plainly above the button (not Supabase's raw message); the password can
// be shown; a sign-in link needs a real email, never creates an account and reads the same whether
// the address has one; and the right details sign in.
import { expect, test, type Browser, type Page } from '@playwright/test';

import { cleanupTestNursery, createTestNursery, type TestNursery } from './support/nursery';

let n: TestNursery | undefined;

async function englishPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('xo_i18nextLng', 'en');
    } catch {
      /* private mode */
    }
  });
  return page;
}

test.describe.serial('the sign-in page', () => {
  test.beforeAll(async () => {
    n = await createTestNursery();
  });

  test.afterAll(async () => {
    await cleanupTestNursery(n);
  });

  test('says what is missing under each field, and what went wrong above the button', async ({ browser }) => {
    const page = await englishPage(browser);
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('#email-error')).toHaveText('Enter your username or email.');
    await expect(page.locator('#password-error')).toHaveText('Enter your password.');

    await page.locator('#email').fill(n!.teacher.email);
    await expect(page.locator('#email-error')).toHaveCount(0);
    await page.locator('#password').fill('short');
    await expect(page.locator('#password-error')).toHaveText('Passwords are at least 8 characters.');

    await page.locator('#password').fill('not-the-password');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(page.locator('#password')).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(page.locator('#password')).toHaveAttribute('type', 'password');

    await page.locator('button[type="submit"]').click();
    await expect(page.getByRole('alert').filter({ hasText: 'The username, email or password is not right.' })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    await page.locator('#password').fill(n!.teacher.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/(teacher|admin)/, { timeout: 30_000 });
  });

  test('a sign-in link goes only to an email, never creates an account and reads the same either way', async ({ browser }) => {
    const page = await englishPage(browser);
    // Supabase's mail itself is not sent: the request is answered here, as it is for an unknown address.
    let otpBody = '';
    await page.route('**/auth/v1/otp**', async (route) => {
      otpBody = route.request().postData() ?? '';
      await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ code: 'otp_disabled', error_code: 'otp_disabled', msg: 'Signups not allowed for otp' }) });
    });
    await page.goto('/login');
    await page.locator('#email').fill('mona.ali');
    await page.getByTestId('send-sign-in-link').click();
    await expect(page.locator('#email-error')).toContainText('Sign-in links go to an email address');
    expect(otpBody).toBe('');

    await page.locator('#email').fill('nobody.here@example.com');
    await page.getByTestId('send-sign-in-link').click();
    await expect(page.getByTestId('sign-in-link-sent')).toContainText('nobody.here@example.com');
    expect(JSON.parse(otpBody)).toMatchObject({ email: 'nobody.here@example.com', create_user: false });

    await page.getByRole('button', { name: 'Back to sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });
});
