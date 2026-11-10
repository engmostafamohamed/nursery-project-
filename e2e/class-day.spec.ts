// A class's day, end to end against the real database: the admin adds a nanny to the class team; the
// teacher clocks in from their home page and out again; the class page shows who works with the
// class today (the teacher in and gone home, the nanny not in yet), a child who has not come yet as
// "not arrived yet" while the nursery is open, and the admin records the nanny's day by hand (the
// times checked under the fields); a team row opens the member of staff's page (their day, their
// classes), and their classes lead back to the class's team.
import { expect, test } from '@playwright/test';

import { addTeacher, cleanupTestNursery, createTestNursery, signIn, sql, type TestNursery } from './support/nursery';

let n: TestNursery | undefined;
let nanny: Awaited<ReturnType<typeof addTeacher>> | undefined;

test.describe.serial('a class’s day', () => {
  test.beforeAll(async () => {
    n = await createTestNursery();
    // Open all day, every day, so "not arrived yet" holds whenever the test runs.
    await sql(`update public.nurseries set opens_at = '00:00', closes_at = '23:59', working_days = '["sun", "mon", "tue", "wed", "thu", "fri", "sat"]' where id = '${n.id}'`);
    const [c] = await sql<{ id: string }>(`
      insert into public.children (nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date)
      values ('${n.id}', '${n.classId}', 'يوسف', 'UI Youssef', '2023-03-01', 'active', '2026-01-01') returning id`);
    n.childIds.push(c.id);
    nanny = await addTeacher(n, 'UI Nanny Samia', 'سامية المربية');
  });

  test.afterAll(async () => {
    await cleanupTestNursery(n);
  });

  test('the admin adds a nanny to the class team from the Teams tab of Classes', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto('/admin/classes');
    await page.getByTestId('section-tabs').getByRole('link', { name: 'Teams' }).click();
    await expect(page).toHaveURL(/\/admin\/classes\/teams$/);
    const row = page.getByTestId('team-row').filter({ hasText: 'UI Class' });
    // A lead and nothing else: the team is incomplete, and says what it misses.
    await expect(row).toContainText('Incomplete');
    await expect(row).toContainText('Missing: backup, assistant, and nanny');
    await row.getByRole('button', { name: 'Change the team of UI Class' }).click();
    const dialog = page.getByTestId('team-dialog');
    await expect(dialog.getByTestId('team-substitute')).toContainText('No backup: if the lead teacher is away, nobody covers the class.');
    const nannies = dialog.getByTestId('team-nannys');
    await expect(nannies).toContainText('No nanny yet.');
    await nannies.getByLabel('Add a nanny').selectOption({ label: nanny!.name_en });
    await expect(nannies).toContainText(nanny!.name_en);
    await dialog.getByTestId('team-dialog-done').click();
    await expect(row).toContainText('Missing: backup and assistant');
    const [saved] = await sql<{ role: string }>(`select role::text from public.class_staff where class_id = '${n!.classId}' and user_id = '${nanny!.id}'`);
    expect(saved.role).toBe('nanny');
    // The old address still lands on the Teams tab.
    await page.goto('/admin/settings/team');
    await expect(page).toHaveURL(/\/admin\/classes\/teams$/);
  });

  test('the teacher clocks in and out from their home page', async ({ page }) => {
    await signIn(page, n!.teacher);
    await page.goto('/teacher');
    const card = page.getByTestId('staff-clock');
    await expect(card).toContainText('You haven’t clocked in today');
    await card.getByTestId('clock-in').click();
    await expect(card).toContainText('Clocked in at');
    await card.getByTestId('clock-out').click();
    await page.getByRole('dialog', { name: 'Clock out now?' }).getByRole('button', { name: 'Clock out' }).click();
    await expect(card).toContainText('You’ve clocked out for today');
    const [day] = await sql<{ source: string; out: boolean }>(`
      select source, check_out_at is not null as out from public.staff_attendance where user_id = '${n!.teacher.id}' and work_date = public.nursery_today('${n!.id}')`);
    expect(day).toEqual({ source: 'self', out: true });
  });

  test('the class page shows its team and children, and the admin records the nanny’s day', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto(`/admin/classes/${n!.classId}`);
    await expect(page.getByTestId('class-today-tiles')).toContainText('Not arrived yet');
    await expect(page.getByTestId('class-team-today')).toHaveCount(0);

    await page.getByRole('tab', { name: /^Team/ }).click();
    await expect(page.getByTestId('class-team-member').filter({ hasText: n!.teacher.name_en })).toContainText('Lead teacher');
    const card = page.getByTestId('class-team-member').filter({ hasText: nanny!.name_en });
    await expect(card).toContainText('Nanny');
    await expect(card.getByTestId('member-clock')).toContainText('Not clocked in yet');
    // The team tab's button opens this class's team on the Teams tab.
    await expect(page.getByRole('link', { name: 'Teams' })).toHaveAttribute('href', `/admin/classes/teams?edit=${n!.classId}`);
    await card.getByRole('button', { name: `Record ${nanny!.name_en}’s time` }).click();
    const dialog = page.getByTestId('record-staff-time');
    await dialog.getByLabel('Arrived').fill('00:10');
    await dialog.getByLabel('Left').fill('00:05');
    await expect(dialog.locator('#staff-time-out-error')).toHaveText('Leaving must be after arriving.');
    await dialog.getByLabel('Left').fill('');
    await dialog.getByLabel('Note').fill('Forgot her phone');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(`${nanny!.name_en}’s day was saved.`)).toBeVisible();
    await expect(card.getByTestId('member-clock')).toContainText('recorded by the admin');
    const [day] = await sql<{ source: string; note: string }>(`
      select source, notes as note from public.staff_attendance where user_id = '${nanny!.id}' and work_date = public.nursery_today('${n!.id}')`);
    expect(day).toEqual({ source: 'admin', note: 'Forgot her phone' });
  });

  test('a team row opens that member of staff, whose page shows their day and classes and leads back', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto(`/admin/classes/${n!.classId}?tab=team`);
    await page.getByTestId('class-team-member').filter({ hasText: nanny!.name_en }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/staff/${nanny!.id}$`));
    // The header: active, in since the time the admin recorded, and her class.
    const hero = page.getByTestId('staff-hero');
    await expect(hero).toContainText('Active');
    await expect(hero).toContainText('In since');
    await expect(hero.getByTestId('staff-hero-class')).toHaveText(/UI Class · Nanny/);
    // Her classes, and the way back to the class's team.
    await page.getByRole('tab', { name: /Classes/ }).click();
    await expect(page).toHaveURL(/\?tab=classes$/);
    const row = page.getByTestId('staff-class-row').filter({ hasText: 'UI Class' });
    await expect(row).toContainText('Nanny');
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/admin/classes/${n!.classId}\\?tab=team$`));
    await expect(page.getByTestId('class-team-member')).toHaveCount(2);
    // Her attendance: the day the admin recorded, marked so.
    await page.goto(`/admin/staff/${nanny!.id}?tab=attendance`);
    await expect(page.getByTestId('staff-day-row').first()).toContainText('recorded by the admin');
  });
});
