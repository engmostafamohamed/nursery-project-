// After sign-in the app goes back to the page that sent the person to sign in, unless their account
// may not open it: that page can be left over from whoever used this browser before.
import { expect, test, type Browser, type Page } from '@playwright/test';

import { cleanupTestNursery, createTestNursery, signIn, type Person, type TestNursery } from './support/nursery';

let n: TestNursery | undefined;

/** Opens a page with nobody signed in, then signs in on the sign-in page it leads to. */
async function signInFrom(browser: Browser, path: string, person: Person): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(path);
  await expect(page).toHaveURL(/\/login$/);
  await page.locator('#email').fill(person.email);
  await page.locator('#password').fill(person.password);
  await page.locator('button[type="submit"]').click();
  return page;
}

test.describe.serial('going back to a page after sign-in', () => {
  test.beforeAll(async () => {
    n = await createTestNursery();
  });

  test.afterAll(async () => {
    await cleanupTestNursery(n);
  });

  test('a page the account may not open leads to its own home', async ({ browser }) => {
    const cases: [string, Person, RegExp][] = [
      ['/teacher', n!.admin, /\/admin$/],
      ['/parent', n!.admin, /\/admin$/],
      ['/xo-admin', n!.admin, /\/admin$/],
      ['/admin', n!.parent, /\/parent$/],
      ['/parent', n!.teacher, /\/teacher$/],
    ];
    for (const [path, person, home] of cases) {
      const page = await signInFrom(browser, path, person);
      await expect(page, `${person.role} from ${path}`).toHaveURL(home);
      await page.context().close();
    }
  });

  test('a page the account may open is where it lands', async ({ browser }) => {
    const page = await signInFrom(browser, '/admin/settings', n!.admin);
    await expect(page).toHaveURL(/\/admin\/settings$/);
  });

  test('opening such a page once signed in still says no access', async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await signIn(page, n!.admin);
    await page.goto('/parent');
    await expect(page).toHaveURL(/\/unauthorized$/);
    await expect(page.getByText('You do not have access to this area.')).toBeVisible();

    await page.getByRole('link', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });
});
