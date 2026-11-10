// Creating, changing and deleting a class, end to end against the real database: problems show under
// the fields as they are typed; a new class gets its lead teacher and first children in one go; the
// edit page saves its details with the bar, adds children from those without a class, moves one to
// another class and takes one out (the parents told of a move); a class with children is deleted only
// once they move; the classes list shows how many there are.
import { expect, test } from '@playwright/test';

import { cleanupTestNursery, createTestNursery, signIn, sql, type TestNursery } from './support/nursery';

let n: TestNursery | undefined;
const kids: Record<string, string> = {};

test.describe.serial('class editor', () => {
  test.beforeAll(async () => {
    n = await createTestNursery();
    for (const [en, ar] of [['UI Rana', 'رنا'], ['UI Omar', 'عمر'], ['UI Hana', 'هنا']]) {
      const [c] = await sql<{ id: string }>(`
        insert into public.children (nursery_id, class_id, full_name_ar, full_name_en, dob, gender, status, enrollment_date)
        values ('${n.id}', null, '${ar}', '${en}', '2023-05-01', 'female', 'active', '2026-01-01') returning id`);
      kids[en] = c.id;
      n.childIds.push(c.id);
    }
    await sql(`insert into public.parent_children (parent_id, child_id, is_primary) values ('${n.parent.id}', '${kids['UI Omar']}', true)`);
  });

  test.afterAll(async () => {
    await cleanupTestNursery(n);
  });

  test('a new class gets its details checked, its lead teacher and first children', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto('/admin/classes/new');
    await page.getByTestId('class-save').click();
    await expect(page.locator('#class-nameAr-error')).toHaveText('Enter the class’s name in Arabic or English.');
    await page.locator('#class-nameEn').fill('ui class');
    await expect(page.locator('#class-nameEn-error')).toHaveText('Another class already has this name.');
    await page.locator('#class-nameEn').fill('UI Stars');
    await page.locator('#class-nameAr').fill('النجوم');
    await page.locator('#class-capacity').fill('150');
    await page.locator('#class-capacity').blur();
    await expect(page.locator('#class-capacity-error')).toHaveText('Enter a number of places from 1 to 100.');
    await page.locator('#class-capacity').fill('2');
    await page.locator('#new-lead').selectOption({ label: n!.teacher.name_en });

    const picker = page.getByTestId('child-picker');
    await picker.getByTestId('picker-row').filter({ hasText: 'UI Rana' }).click();
    await picker.getByTestId('picker-row').filter({ hasText: 'UI Hana' }).click();
    await page.getByTestId('class-save').click();
    await expect(page.getByText('The class was created with 2 children.')).toBeVisible();
    await expect(page.getByTestId('class-profile')).toContainText('UI Stars');
    const [row] = await sql<{ kids: string; lead: string }>(`
      select (select count(*)::text from public.children c join public.classes k on k.id = c.class_id where k.name_en = 'UI Stars' and k.nursery_id = '${n!.id}') as kids,
             (select cs.role::text from public.class_staff cs join public.classes k on k.id = cs.class_id where k.name_en = 'UI Stars' and k.nursery_id = '${n!.id}' and cs.user_id = '${n!.teacher.id}') as lead`);
    expect(row).toEqual({ kids: '2', lead: 'lead' });
  });

  test('the edit page saves its details, adds, moves and takes children out', async ({ page }) => {
    await signIn(page, n!.admin);
    const [{ id }] = await sql<{ id: string }>(`select id from public.classes where nursery_id = '${n!.id}' and name_en = 'UI Stars'`);
    await page.goto(`/admin/classes/${id}/edit`);
    await expect(page.getByTestId('class-save-bar')).toHaveCount(0);
    await page.locator('#class-roomNumber').fill('B12');
    await expect(page.getByTestId('class-save-bar')).toContainText('You have changes that aren’t saved.');
    await page.getByTestId('class-save').click();
    await expect(page.getByText('The class was saved.')).toBeVisible();
    await expect(page.getByTestId('class-save-bar')).toHaveCount(0);

    // Adding a third child goes over its 2 places: only when meant.
    await page.getByTestId('add-children').click();
    const add = page.getByTestId('add-children-dialog');
    await add.getByTestId('picker-row').filter({ hasText: 'UI Omar' }).click();
    await expect(add.getByTestId('over-capacity')).toContainText('This puts the class 1 child over its places.');
    await expect(add.getByTestId('add-children-confirm')).toBeDisabled();
    await add.getByTestId('over-capacity').getByRole('checkbox').click();
    await add.getByTestId('add-children-confirm').click();
    await expect(page.getByText('1 child added to UI Stars.')).toBeVisible();
    await expect(page.getByTestId('roster-row')).toHaveCount(3);

    // Omar moves to UI Class; his parent is told.
    await page.getByTestId('roster-row').filter({ hasText: 'UI Omar' }).getByRole('button', { name: 'Move UI Omar' }).click();
    const move = page.getByTestId('move-children-dialog');
    await move.getByTestId('move-children-confirm').click();
    await expect(move.locator('#move-target-error')).toHaveText('Choose a class.');
    await move.locator('#move-target').selectOption({ index: 1 });
    await move.getByTestId('move-children-confirm').click();
    await expect(page.getByTestId('roster-row')).toHaveCount(2);
    // Told twice: placed in UI Stars, then moved to UI Class.
    const told = await sql<{ cls: string }>(`
      select template_params->'class'->>'en' as cls from public.notifications
       where user_id = '${n!.parent.id}' and type = 'child_class_changed' order by created_at`);
    expect(told.map((r) => r.cls)).toEqual(['UI Stars', 'UI Class']);

    // Hana is taken out of the class.
    await page.getByTestId('roster-row').filter({ hasText: 'UI Hana' }).getByRole('button', { name: 'Take UI Hana out of the class' }).click();
    await page.getByRole('dialog', { name: /Take UI Hana out of UI Stars/ }).getByRole('button', { name: 'Take out' }).click();
    await expect(page.getByTestId('roster-row')).toHaveCount(1);
    const [hana] = await sql<{ class_id: string | null }>(`select class_id from public.children where id = '${kids['UI Hana']}'`);
    expect(hana.class_id).toBeNull();
  });

  test('a class with children is deleted once they move, and the list says how many classes there are', async ({ page }) => {
    await signIn(page, n!.admin);
    const [{ id }] = await sql<{ id: string }>(`select id from public.classes where nursery_id = '${n!.id}' and name_en = 'UI Stars'`);
    await page.goto(`/admin/classes/${id}/edit`);
    await page.getByTestId('delete-class').click();
    const dialog = page.getByTestId('delete-class-dialog');
    await expect(dialog).toContainText('Its child moves to another class first.');
    await dialog.getByTestId('delete-class-confirm').click();
    await expect(dialog.locator('#delete-target-error')).toHaveText('Choose a class.');
    await dialog.locator('#delete-target').selectOption({ index: 1 });
    await dialog.getByTestId('delete-class-confirm').click();
    await expect(page).toHaveURL(/\/admin\/classes$/);
    await expect(page.getByTestId('class-row')).toHaveCount(1);
    await expect(page.getByText('Showing 1–1 of 1')).toBeVisible();
    const [rana] = await sql<{ name: string }>(`select k.name_en as name from public.children c join public.classes k on k.id = c.class_id where c.id = '${kids['UI Rana']}'`);
    expect(rana.name).toBe('UI Class');
  });
});
