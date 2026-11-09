// The medicine round, end to end against the real database: the admin gives a child's medicine its
// dose times (checked under the fields); the teacher sees one dose due and one overdue, records one
// given and the other not given with a reason, then undoes a dose recorded by mistake; the parents are
// told each time; and the parent and the admin see today's doses.
import { expect, test } from '@playwright/test';

import { cleanupTestNursery, createTestNursery, signIn, sql, type TestNursery } from './support/nursery';

let n: TestNursery | undefined;
let childId = '';
let dueAt = '';
let lateAt = '';

test.describe.serial('Medicine round', () => {
  test.beforeAll(async () => {
    n = await createTestNursery();
    const [c] = await sql<{ id: string }>(`
      insert into public.children (nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date)
      values ('${n.id}', '${n.classId}', 'ملك', 'UI Malak', '2023-06-01', 'active', '2026-01-01') returning id`);
    childId = c.id;
    n.childIds.push(childId);
    await sql(`insert into public.parent_children (parent_id, child_id, is_primary) values ('${n.parent.id}', '${childId}', true)`);
    await sql(`insert into public.attendance_records (child_id, attendance_date, check_in) values ('${childId}', public.nursery_today('${n.id}'), now() - interval '3 hours')`);
    const [times] = await sql<{ due: string; late: string }>(`
      select to_char(x.t, 'HH24:MI') as due, to_char(x.t - interval '40 minutes', 'HH24:MI') as late
        from (select (now() at time zone coalesce((select timezone from public.nursery_settings where nursery_id = '${n.id}'), 'Africa/Cairo'))::time as t) x`);
    dueAt = times.due;
    lateAt = times.late;
  });

  test.afterAll(async () => {
    await cleanupTestNursery(n);
  });

  test('the admin gives the medicine its dose times', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto(`/admin/children/${childId}/health`);
    await page.getByTestId('add-medication').click();
    const dialog = page.getByTestId('medication-dialog');
    await dialog.getByLabel('Medication name').fill('UI Ventolin');
    await dialog.getByLabel('Dosage').fill('2 puffs');
    await dialog.getByTestId('add-dose-time').click();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog.locator('#med-times-error')).toHaveText('Fill in each time, or remove it.');
    await dialog.getByLabel('Dose time 1').fill(dueAt);
    await dialog.getByTestId('add-dose-time').click();
    await dialog.getByLabel('Dose time 2').fill(lateAt);
    await dialog.getByRole('radio', { name: 'Parents agreed' }).click();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('The medicine was saved.')).toBeVisible();
    const card = page.getByTestId('medication-item').filter({ hasText: 'UI Ventolin' });
    await expect(card.getByTestId('dose-schedule')).toContainText(`Given at ${[lateAt, dueAt].sort().join(' · ')}`);
    await expect(card.getByTestId('dose-schedule')).toContainText('not given yet');
  });

  test('the teacher records one dose given and one not given, and undoes a mistake', async ({ page }) => {
    await signIn(page, n!.teacher);
    await page.goto('/teacher');
    await expect(page.getByTestId('medicine-due-banner')).toContainText('2 medicines to give now');
    await page.getByTestId('medicine-due-banner').click();
    await expect(page).toHaveURL(/\/teacher\/medicines$/);

    const due = page.getByTestId('round-slot').filter({ hasText: dueAt });
    const late = page.getByTestId('round-slot').filter({ hasText: lateAt });
    await expect(due).toContainText('Due now');
    await expect(late).toContainText('Overdue');

    await due.getByTestId('dose-given').click();
    await page.getByTestId('record-dose-dialog').getByRole('button', { name: 'Yes, it was given' }).click();
    await expect(page.getByText('UI Ventolin recorded as given to UI Malak. The parents were told.')).toBeVisible();

    await page.getByRole('tab', { name: 'All' }).click();
    await late.getByTestId('dose-skipped').click();
    const skip = page.getByTestId('record-dose-dialog');
    await skip.getByRole('button', { name: 'Record as not given' }).click();
    await expect(skip.locator('#dose-reason-error')).toHaveText('Choose a reason.');
    await skip.getByRole('radio', { name: 'Child refused' }).click();
    await skip.getByRole('button', { name: 'Record as not given' }).click();
    await expect(page.getByText('UI Ventolin recorded as not given to UI Malak. The parents were told why.')).toBeVisible();
    await expect(late).toContainText('Not given');
    await expect(due).toContainText('Given');

    await late.getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('dialog', { name: 'Undo this dose?' }).getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('The dose was undone.')).toBeVisible();
    await expect(late).toContainText('Overdue');

    const [told] = await sql<{ types: string }>(`
      select string_agg(type, ',' order by type) as types from public.notifications
       where user_id = '${n!.parent.id}' and type like 'medication_%'`);
    expect(told.types).toBe('medication_dose_undone,medication_given,medication_skipped');
  });

  test('the parent sees today’s dose on the health page', async ({ page }) => {
    await signIn(page, n!.parent);
    await page.goto(`/parent/children/${childId}/health`);
    const schedule = page.getByTestId('medication-item').filter({ hasText: 'UI Ventolin' }).getByTestId('dose-schedule');
    await expect(schedule).toContainText('given');
    await expect(schedule).toContainText(n!.teacher.name_en);
  });

  test('the admin sees the nursery’s round', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto('/admin/health/medicines');
    await expect(page.getByRole('heading', { level: 1, name: 'Medicines today' })).toBeVisible();
    await page.getByRole('tab', { name: 'All' }).click();
    await expect(page.getByTestId('round-slot').filter({ hasText: 'UI Malak' })).toHaveCount(2);
  });
});
