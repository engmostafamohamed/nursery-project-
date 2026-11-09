// F&B end to end against the real database: the admin writes the week's menu and sees, while
// tagging a dish, the children it is not safe for; dish names are checked under the field; the menu
// file is checked when chosen and stored; publishing tells the parents, who then see the menu with
// their own child's alert; the teacher sees today's alerts for their class only, also inside the
// child's daily report; the alerts page lists the allergies the menu is not checked against; and a
// week copies into the next one.
import { expect, test, type Page } from '@playwright/test';

import { cleanupTestNursery, createTestNursery, service, signIn, sql, type TestNursery } from './support/nursery';

let n: TestNursery | undefined;
let today = '';
let weekStart = '';
const kids: Record<string, string> = {};

async function addChild(key: string, name: string, classId: string | null, allergy: string, severity: string, parentId?: string) {
  const [row] = await sql<{ id: string }>(`
    insert into public.children (nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date)
    values ('${n!.id}', ${classId ? `'${classId}'` : 'null'}, '${name}', '${name}', '2023-03-01', 'active', '2026-01-01') returning id`);
  kids[key] = row.id;
  n!.childIds.push(row.id);
  await sql(`insert into public.child_allergies (child_id, nursery_id, allergen_name, severity, reaction_type, treatment_protocol)
             values ('${row.id}', '${n!.id}', '${allergy.replace(/'/g, "''")}', '${severity}', 'Hives', 'Give the antihistamine and call the parent')`);
  if (parentId) await sql(`insert into public.parent_children (parent_id, child_id, is_primary) values ('${parentId}', '${row.id}', true)`);
}

async function openMenu(page: Page) {
  await page.goto('/admin/meals');
  await expect(page.getByRole('heading', { level: 1, name: 'Weekly menu' })).toBeVisible();
  await expect(page.getByTestId(`menu-cell-${today}-lunch`)).toBeVisible();
}

test.describe.serial('F&B: the menu and its allergy alerts', () => {
  test.beforeAll(async () => {
    n = await createTestNursery();
    const [k] = await sql<{ today: string; week: string }>(`
      select (now() at time zone 'Africa/Cairo')::date::text as today,
             public.menu_week_start((now() at time zone 'Africa/Cairo')::date)::text as week`);
    today = k.today;
    weekStart = k.week;
    const [other] = await sql<{ id: string }>(`insert into public.classes (nursery_id, name_ar, name_en) values ('${n.id}', 'النحل', 'UI Bees') returning id`);
    await addChild('laila', 'UI Laila', n.classId, "Cow's milk", 'severe', n.parent.id);
    await addChild('adam', 'UI Adam', other.id, 'Peanuts', 'life_threatening');
    await addChild('sara', 'UI Sara', n.classId, 'Penicillin', 'moderate');
  });

  test.afterAll(async () => {
    if (n) {
      const svc = await service();
      const files = await sql<{ name: string }>(`select name from storage.objects where bucket_id = 'menu-files' and name like '${n.id}/%'`);
      if (files.length) await svc.storage.from('menu-files').remove(files.map((f) => f.name));
    }
    await cleanupTestNursery(n);
  });

  test('the admin writes the menu, warned about allergic children while tagging, with names checked', async ({ page }) => {
    await signIn(page, n!.admin);
    await openMenu(page);
    const lunch = page.getByTestId(`menu-cell-${today}-lunch`);
    await lunch.getByRole('button', { name: 'Add to Lunch' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a dish' });
    await dialog.getByLabel('Dish name').fill('Rice pudding');
    // The Milk tag shows how many children here react to it, and the dish then names them.
    const milk = dialog.getByRole('button', { name: /^Milk/ });
    await expect(milk).toContainText('1');
    await milk.click();
    await expect(dialog.getByTestId('dish-warning')).toContainText('Not safe for 1 child');
    await expect(dialog.getByTestId('dish-warning')).toContainText('UI Laila (Milk · Severe)');
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toHaveCount(0);
    // On the board the dish is red and names the child.
    await expect(lunch.getByTestId('dish-tile')).toContainText('Rice pudding');
    await expect(lunch.getByTestId('dish-warning')).toContainText('UI Laila · Milk');

    const snacks = page.getByTestId(`menu-cell-${today}-snacks`);
    await snacks.getByRole('button', { name: 'Add to Snacks' }).click();
    // A dish without a name is refused under its field.
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog.locator('#dish-name-error')).toHaveText('Write the dish name, or remove it.');
    await dialog.getByLabel('Dish name').fill('Peanut cookies');
    await dialog.getByRole('button', { name: /^Peanuts/ }).click();
    await dialog.getByRole('button', { name: /^Gluten/ }).click();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(snacks.getByTestId('dish-tile')).toContainText('Peanut cookies');
    await expect(page.getByText('You have changes that are not saved.')).toBeVisible();
    await page.getByRole('button', { name: 'Save menu' }).click();
    await expect(page.getByText('The menu was saved.')).toBeVisible();
    await expect(page.getByText('Everything is saved.')).toBeVisible();

    const dishes = await sql<{ name: string; allergens: string[] }>(`
      select d.name, d.allergens from public.menu_dishes d join public.menu_weeks w on w.id = d.week_id
       where w.nursery_id = '${n!.id}' and w.week_start = '${weekStart}' order by d.name`);
    expect(dishes).toEqual([
      { name: 'Peanut cookies', allergens: ['gluten', 'peanuts'] },
      { name: 'Rice pudding', allergens: ['milk'] },
    ]);
  });

  test('a parent sees nothing before it is published', async ({ page }) => {
    await signIn(page, n!.parent);
    await page.goto('/parent/meals');
    await expect(page.getByTestId('menu-empty')).toContainText('The nursery has not published the menu for this week yet.');
  });

  test('the menu file is checked when chosen, then stored', async ({ page }) => {
    await signIn(page, n!.admin);
    await openMenu(page);
    const input = page.locator('#menu-file-input');
    await input.setInputFiles({ name: 'menu.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(6 * 1024 * 1024, 'x') });
    await expect(page.locator('#menu-file-error')).toHaveText('The file is larger than 5.0 MB.');
    await input.setInputFiles({ name: 'menu.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await expect(page.locator('#menu-file-error')).toHaveText('Choose a photo (JPG, PNG, WebP) or a PDF.');
    await input.setInputFiles({ name: 'week-menu.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% UI test menu\n') });
    await expect(page.getByTestId('menu-file-name')).toContainText('week-menu.pdf');
    await expect(page.locator('#menu-file-error')).toHaveCount(0);
    const [week] = await sql<{ file_path: string; file_type: string }>(`
      select file_path, file_type from public.menu_weeks where nursery_id = '${n!.id}' and week_start = '${weekStart}'`);
    expect(week.file_type).toBe('application/pdf');
    const stored = await sql<{ name: string }>(`select name from storage.objects where bucket_id = 'menu-files' and name = '${week.file_path}'`);
    expect(stored).toHaveLength(1);
  });

  test('publishing tells the parents once', async ({ page }) => {
    await signIn(page, n!.admin);
    await openMenu(page);
    await page.getByRole('button', { name: 'Publish to families' }).click();
    await expect(page.getByText('The menu was published. Families were told.')).toBeVisible();
    const notices = await sql<{ week: string }>(`
      select template_params ->> 'week_start' as week from public.notifications where user_id = '${n!.parent.id}' and type = 'menu_published'`);
    expect(notices).toEqual([{ week: weekStart }]);
  });

  test('the parent then sees the menu with their own child marked, and no one else', async ({ page }) => {
    await signIn(page, n!.parent);
    await page.goto(`/parent/meals?week=${weekStart}`);
    const lunch = page.getByTestId(`menu-cell-${today}-lunch`);
    await expect(lunch).toContainText('Rice pudding');
    await expect(lunch.getByTestId('dish-warning')).toContainText('UI Laila is allergic (Milk)');
    await expect(page.getByTestId(`menu-cell-${today}-snacks`)).toContainText('Peanut cookies');
    // Another family's child is never named to this parent.
    await expect(page.locator('main')).not.toContainText('UI Adam');
    await expect(page.getByTestId('menu-file-name')).toContainText('week-menu.pdf');
  });

  test('the teacher sees today’s alerts for their class only, also in the child’s daily report', async ({ page }) => {
    await signIn(page, n!.teacher);
    await page.goto('/teacher/meals');
    const alerts = page.getByTestId('food-alert');
    await expect(alerts).toHaveCount(1);
    await expect(alerts.first()).toContainText('UI Laila');
    await expect(alerts.first()).toContainText('Lunch: Rice pudding — Milk');
    await expect(alerts.first()).toContainText('Give the antihistamine and call the parent');

    await page.goto(`/teacher/daily-reports/${kids.laila}/${today}`);
    await expect(page.getByTestId('child-food-alert')).toContainText('Lunch: Rice pudding — Milk');
    await page.goto(`/teacher/daily-reports/${kids.sara}/${today}`);
    await expect(page.getByRole('heading', { name: /UI Sara/ })).toBeVisible();
    await expect(page.getByTestId('child-food-alert')).toHaveCount(0);
  });

  test('the alerts page lists every child at risk, and the allergies not checked', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto('/admin/food-alerts');
    await expect(page.getByTestId('food-alert')).toHaveCount(2);
    await expect(page.getByTestId('food-alert').filter({ hasText: 'UI Adam' })).toContainText('Life-threatening');
    // Grouped by allergy; each child leads to their health record, at that allergy.
    const unmatched = page.getByTestId('unmatched-allergies');
    await expect(unmatched).toContainText('Penicillin');
    await expect(unmatched.getByRole('link', { name: 'UI Sara' })).toHaveAttribute('href', /\/admin\/children\/[0-9a-f-]+\/health\?allergy=Penicillin$/);
    await page.getByRole('tab', { name: 'Next week' }).click();
    await expect(page.getByTestId('food-alerts-none')).toBeVisible();
  });

  test('a week copies into the next one as a draft', async ({ page }) => {
    await signIn(page, n!.admin);
    const [next] = await sql<{ d: string }>(`select ('${weekStart}'::date + 7)::text as d`);
    await page.goto(`/admin/meals?week=${next.d}`);
    await page.getByRole('button', { name: 'Copy last week' }).click();
    await expect(page.getByText('Last week’s dishes were copied.')).toBeVisible();
    const copied = await sql<{ status: string; days: string }>(`
      select w.status, string_agg(distinct (d.day - w.week_start)::text, ',') as days
        from public.menu_weeks w join public.menu_dishes d on d.week_id = w.id
       where w.nursery_id = '${n!.id}' and w.week_start = '${next.d}' group by w.status`);
    const [source] = await sql<{ days: string }>(`
      select string_agg(distinct (d.day - w.week_start)::text, ',') as days
        from public.menu_weeks w join public.menu_dishes d on d.week_id = w.id
       where w.nursery_id = '${n!.id}' and w.week_start = '${weekStart}'`);
    expect(copied).toEqual([{ status: 'draft', days: source.days }]);
  });
});
