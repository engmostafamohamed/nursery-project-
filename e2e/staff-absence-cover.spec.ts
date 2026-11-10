// Teacher absences and class cover, end to end against the real database: the lead teacher reports
// an absence (checked under the fields); the backup teacher is told and sees the class they cover;
// the admin sees who covers each class, records an absence for the backup too (the class is then left
// with nobody), and cancels the lead's absence (the lead is back on duty); an absence row opens that
// member of staff's page on their absences, where another one is recorded for them.
import { expect, test } from '@playwright/test';

import { addTeacher, cleanupTestNursery, createTestNursery, signIn, sql, type TestNursery } from './support/nursery';

let n: TestNursery | undefined;
let backup: Awaited<ReturnType<typeof addTeacher>> | undefined;

test.describe.serial('Staff absences and class cover', () => {
  test.beforeAll(async () => {
    n = await createTestNursery();
    backup = await addTeacher(n, 'UI Backup Nour', 'نور البديلة');
    await sql(`insert into public.class_staff (class_id, user_id, role) values ('${n.classId}', '${backup.id}', 'substitute')`);
    const [c] = await sql<{ id: string }>(`
      insert into public.children (nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date)
      values ('${n.id}', '${n.classId}', 'سما', 'UI Sama', '2023-02-01', 'active', '2026-01-01') returning id`);
    n.childIds.push(c.id);
  });

  test.afterAll(async () => {
    await cleanupTestNursery(n);
  });

  test('the lead teacher reports an absence, checked under the fields', async ({ page }) => {
    await signIn(page, n!.teacher);
    await page.goto('/teacher/absences');
    await expect(page.getByRole('heading', { level: 1, name: 'My absences' })).toBeVisible();
    await page.getByTestId('report-absence').click();
    const dialog = page.getByRole('dialog', { name: 'Report an absence' });
    await dialog.getByRole('button', { name: 'Report absence' }).click();
    await expect(dialog.locator('#absence-reason-error')).toHaveText('Choose a reason.');
    await dialog.getByRole('radio', { name: 'Sick' }).click();
    await expect(dialog.getByText('This includes today: the backup teacher is told now that they cover the class.')).toBeVisible();
    await dialog.getByLabel('Note').fill('Flu, back on Monday');
    await dialog.getByRole('button', { name: 'Report absence' }).click();
    await expect(page.getByText('Your absence was reported. The admins have been told.')).toBeVisible();
    await expect(page.getByTestId('absence-item').first()).toContainText('Away today');
    await expect(page.getByTestId('absence-item').first()).toContainText('Flu, back on Monday');

    // The same day cannot be reported twice.
    await page.getByTestId('report-absence').click();
    const again = page.getByRole('dialog', { name: 'Report an absence' });
    await again.getByRole('radio', { name: 'Personal' }).click();
    await again.getByRole('button', { name: 'Report absence' }).click();
    await expect(again.locator('#absence-to-error')).toHaveText('An absence is already reported for some of these days.');
  });

  test('the backup teacher is told and sees the class they cover', async ({ page }) => {
    const [note] = await sql<{ count: number }>(`select count(*)::int as count from public.notifications where user_id = '${backup!.id}' and type = 'class_cover_today'`);
    expect(note.count).toBe(1);
    await signIn(page, backup!);
    await page.goto('/teacher');
    await expect(page.getByTestId('cover-banner')).toContainText('You cover a class today');
    await expect(page.getByTestId('cover-banner')).toContainText('UI Class');
  });

  test('the admin sees who covers each class, and both teachers away leave the class with nobody', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto('/admin/staff/absences');
    await expect(page.getByRole('heading', { level: 1, name: 'Staff absences' })).toBeVisible();
    const card = page.getByTestId('class-cover').filter({ hasText: 'UI Class' });
    await expect(card).toContainText('Backup covering');

    await page.getByTestId('record-absence').click();
    const dialog = page.getByRole('dialog', { name: 'Record an absence' });
    await dialog.getByRole('button', { name: 'Record absence' }).click();
    await expect(dialog.locator('#absence-person-error')).toHaveText('Choose who is away.');
    await dialog.getByLabel('Who is away').selectOption({ label: 'UI Backup Nour · Teacher' });
    await dialog.getByRole('radio', { name: 'Training' }).click();
    await dialog.getByRole('button', { name: 'Record absence' }).click();
    await expect(page.getByText('The absence was recorded.')).toBeVisible();
    await expect(card).toContainText('Nobody on duty');

    // The lead's absence is cancelled: the lead is back on duty.
    await page.getByTestId('absence-item').filter({ hasText: n!.teacher.name_en }).getByRole('button', { name: 'Cancel absence' }).click();
    await page.getByRole('dialog', { name: 'Cancel this absence?' }).getByRole('button', { name: 'Cancel absence' }).click();
    await expect(page.getByText('The absence was cancelled.')).toBeVisible();
    await expect(card).toContainText('Lead in');
  });

  test('an absence row opens that member of staff, on their absences', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto('/admin/staff/absences');
    await page.getByTestId('absence-item').filter({ hasText: 'UI Backup Nour' }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/staff/${backup!.id}\\?tab=absences$`));
    const panel = page.getByTestId('staff-absences');
    await expect(panel.getByTestId('absence-item')).toHaveCount(1);
    await expect(panel.getByTestId('absence-item')).toContainText('Training');
    await expect(panel).toContainText('Away');

    // Recording another one from here: the person is already chosen; a day already taken is refused.
    await panel.getByTestId('record-person-absence').click();
    const dialog = page.getByRole('dialog', { name: 'Record an absence' });
    await expect(dialog.getByLabel('Who is away')).toHaveValue(backup!.id);
    await dialog.getByRole('radio', { name: 'Personal' }).click();
    await dialog.getByRole('button', { name: 'Record absence' }).click();
    await expect(dialog.locator('#absence-to-error')).toHaveText('An absence is already reported for some of these days.');
  });
});
