// The fixes that had to land before launching V1, clicked through the real screens in a throw-away
// nursery:
//   * an extra-hours package the admin assigns is billed to the parent, who sees the invoice;
//   * the dashboard shows the nursery's money to the admin and not to a teacher;
//   * "Forgot password?" checks the address under the field and sends the link to the reset page;
//   * a staff member given a first password chooses their own at first sign-in;
//   * a newly onboarded staff member gets their own first password, not a shared one;
//   * a screen that cannot load shows the error screen instead of a blank page.
import { expect, test, type Browser, type Page } from '@playwright/test';

import { ANON_KEY, SUPABASE_URL, cleanupTestNursery, createTestNursery, ok, service, signIn, sql, type Person, type TestNursery } from './support/nursery';

let n: TestNursery | undefined;

async function as(browser: Browser, person: Person): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, person);
  return page;
}

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

test.describe.serial('launch blockers', () => {
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
    n.childIds.push(child.id);
    ok(await svc.from('parent_children').insert({ parent_id: n.parent.id, child_id: child.id, relationship: 'mother', is_primary: true }), 'parent link');
  });

  test.afterAll(async () => {
    await cleanupTestNursery(n);
  });

  test('an extra-hours package the admin assigns is billed to the parent', async ({ browser }) => {
    const admin = await as(browser, n!.admin);
    await admin.goto('/admin/packages');
    // The nursery's only hours package: the 10-hour pack.
    await admin.getByText('Hours packages', { exact: true }).click();
    await admin.getByRole('button', { name: 'Manage children' }).first().click();
    const dialog = admin.getByRole('dialog');
    await expect(dialog).toContainText('10-hour pack');
    await expect(dialog).toContainText('sends an invoice for its price');
    await dialog.getByLabel('Select a child to assign').selectOption({ label: 'UI Salma' });
    await dialog.getByRole('button', { name: 'Assign' }).click();
    await expect(admin.getByText('Child assigned. An invoice was sent to the parent who pays.')).toBeVisible();

    const [invoice] = await sql<{ amount: string; invoice_type: string; status: string; parent_id: string }>(
      `select amount::text, invoice_type, status, parent_id from public.invoices
        where nursery_id = '${n!.id}' and line_items_json ? 'child_package_id'`,
    );
    expect(invoice).toMatchObject({ amount: '500.00', invoice_type: 'other', status: 'pending', parent_id: n!.parent.id });

    const parent = await as(browser, n!.parent);
    await parent.goto('/parent/invoices');
    await expect(parent.getByText('10-hour pack').first()).toBeVisible();
  });

  test('the dashboard shows the money to the admin, not to a teacher', async ({ browser }) => {
    const admin = await as(browser, n!.admin);
    await admin.goto('/admin');
    await expect(admin.getByText('Revenue this month')).toBeVisible();

    const teacher = await as(browser, n!.teacher);
    await teacher.goto('/admin');
    await expect(teacher.getByText('Applications this month').first()).toBeVisible();
    await expect(teacher.getByText('Revenue this month')).toHaveCount(0);
    // The month on the attendance card: the extra hours stay, their money does not.
    await expect(teacher.getByText('Children with extra hours today')).toBeVisible();
    await teacher.getByRole('tablist', { name: 'Period' }).first().getByRole('tab', { name: 'Monthly' }).click();
    await expect(teacher.getByText('Children with extra hours', { exact: true })).toBeVisible();
    await expect(teacher.getByText('Extra hours billed')).toHaveCount(0);
    await expect(teacher.getByText('Outstanding', { exact: true })).toHaveCount(0);
  });

  test('"Forgot password?" checks the address under the field and sends the link', async ({ browser }) => {
    const page = await englishPage(browser);
    // The reset email itself is Supabase's: the request is answered here, so nothing is sent.
    let recoverUrl = '';
    let recoverBody = '';
    await page.route('**/auth/v1/recover**', async (route) => {
      recoverUrl = route.request().url();
      recoverBody = route.request().postData() ?? '';
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    const form = page.getByTestId('forgot-password-form');
    const email = form.getByLabel('Email');

    await email.fill('mona.ali');
    await email.blur();
    await expect(form.getByRole('alert')).toContainText('not a username');
    await email.fill('201012345678@staff.placeholder.xo');
    await expect(form.getByRole('alert')).toContainText("can't receive email");
    await email.fill('ui.mother@example.com');
    await expect(form.getByRole('alert')).toHaveCount(0);

    await form.getByRole('button', { name: 'Send the link' }).click();
    await expect(page.getByTestId('forgot-password-sent')).toContainText('ui.mother@example.com');
    expect(recoverBody).toContain('ui.mother@example.com');
    expect(decodeURIComponent(recoverUrl)).toContain('/reset-password');
  });

  test('a staff member given a first password chooses their own at first sign-in', async ({ browser }) => {
    const svc = await service();
    ok(await svc.auth.admin.updateUserById(n!.teacher.id, { user_metadata: { must_change_password: true } }), 'flag');

    const page = await englishPage(browser);
    await page.goto('/login');
    await page.locator('#email').fill(n!.teacher.email);
    await page.locator('#password').fill(n!.teacher.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/reset-password/);
    await expect(page.getByRole('heading', { name: 'Choose your own password' })).toBeVisible();

    // Anywhere else sends them back until they do.
    await page.goto('/teacher');
    await expect(page).toHaveURL(/\/reset-password/);

    const newPassword = `Own!${crypto.randomUUID().slice(0, 12)}`;
    await page.getByLabel('New password').fill('short');
    await page.getByLabel('New password').blur();
    await expect(page.getByText('Use at least 8 characters.')).toBeVisible();
    await page.getByLabel('New password').fill(newPassword);
    await page.getByLabel('Type it again').fill(`${newPassword}x`);
    await expect(page.getByText("The two passwords don't match.")).toBeVisible();
    await page.getByLabel('Type it again').fill(newPassword);
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page).toHaveURL(/\/(teacher|admin)/, { timeout: 30_000 });

    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const signedIn = await client.auth.signInWithPassword({ email: n!.teacher.email, password: newPassword });
    expect(signedIn.error).toBeNull();
    expect(signedIn.data.user?.user_metadata?.must_change_password).toBe(false);
    n!.teacher.password = newPassword;
  });

  test('a newly onboarded staff member gets their own first password', async () => {
    const mobile = `0109${String(Date.now()).slice(-7)}`;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/staff-onboarding-complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${(await n!.admin.client.auth.getSession()).data.session?.access_token}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nurseryId: n!.id,
        termsAccepted: true,
        userMode: 'new',
        newNameAr: 'مساعدة الواجهة',
        newNameEn: 'UI Assistant',
        newMobile: mobile,
        newEmail: null,
        position: 'teacher',
        employmentType: 'full_time',
        startDate: '2026-11-01',
        baseSalary: '5000',
        workingDays: [0, 1, 2, 3, 4],
        workStartTime: '08:00',
        workEndTime: '15:00',
        nationalId: '29001010101010',
        gender: 'female',
        emergencyName: 'UI Contact',
        emergencyPhone: '01000000000',
      }),
    });
    const body = (await res.json()) as { user_id?: string; sign_in?: { email: string; temp_password: string }; error?: string; error_message?: string };
    if (body.user_id) n!.extraUserIds = [...(n!.extraUserIds ?? []), body.user_id];
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.sign_in?.temp_password).toMatch(/^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/);

    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    expect((await client.auth.signInWithPassword({ email: body.sign_in!.email, password: 'Demo2026!' })).error).not.toBeNull();
    const signedIn = await client.auth.signInWithPassword({ email: body.sign_in!.email, password: body.sign_in!.temp_password });
    expect(signedIn.error).toBeNull();
    expect(signedIn.data.user?.user_metadata?.must_change_password).toBe(true);
  });

  test('a screen that cannot load shows the error screen, not a blank page', async ({ browser }) => {
    const admin = await as(browser, n!.admin);
    // As after a deploy: the screen's code file is gone.
    await admin.route('**/src/pages/admin/AdminPackagesPage.tsx*', (route) => route.abort());
    await admin.goto('/admin/packages');
    const screen = admin.getByTestId('app-error-screen');
    await expect(screen).toBeVisible();
    await expect(screen).toContainText('A new version is available');

    await admin.unroute('**/src/pages/admin/AdminPackagesPage.tsx*');
    await screen.getByRole('button', { name: 'Reload' }).click();
    await expect(admin.getByText('Package subscriptions')).toBeVisible();
    await expect(admin.getByTestId('app-error-screen')).toHaveCount(0);
  });
});
