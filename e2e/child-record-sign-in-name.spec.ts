// A parent who forgets how they sign in asks the nursery: the child's record shows the admin the name
// they type, on every tab.
import { expect, test, type Browser, type Page } from '@playwright/test';

import { cleanupTestNursery, createTestNursery, ok, service, signIn, type TestNursery } from './support/nursery';

let n: TestNursery | undefined;
let childId = '';

async function openChildRecord(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, n!.admin);
  await page.goto(`/admin/children/${childId}`);
  return page;
}

const signInName = (page: Page) => page.getByText('Parent sign-in name', { exact: true }).locator('..');

test.describe.serial('the parent sign-in name on the child record', () => {
  test.beforeAll(async () => {
    n = await createTestNursery();
    const svc = await service();
    const child = ok(
      await svc
        .from('children')
        .insert({ nursery_id: n.id, class_id: n.classId, full_name_en: 'UI Salma', full_name_ar: 'سلمى الواجهة', dob: '2023-03-01', status: 'active', enrollment_date: '2026-01-01' })
        .select('id')
        .single(),
      'child',
    );
    childId = child.id;
    n.childIds.push(childId);
    ok(await svc.from('parent_children').insert({ parent_id: n.parent.id, child_id: childId, relationship: 'mother', is_primary: true }), 'parent link');
  });

  test.afterAll(async () => {
    await cleanupTestNursery(n);
  });

  test('a parent with a username: it shows at the top, on every tab', async ({ browser }) => {
    const username = `${n!.run}-family`;
    ok(await (await service()).from('users').update({ username }).eq('id', n!.parent.id), 'username');

    const page = await openChildRecord(browser);
    await expect(signInName(page)).toContainText(username);

    await page.getByRole('button', { name: /^Parents/ }).click();
    await expect(signInName(page)).toContainText(username);
  });

  test('a parent from before usernames: it shows the email they sign in with', async ({ browser }) => {
    ok(await (await service()).from('users').update({ username: null }).eq('id', n!.parent.id), 'no username');

    const page = await openChildRecord(browser);
    await expect(signInName(page)).toContainText(n!.parent.email);
  });
});
