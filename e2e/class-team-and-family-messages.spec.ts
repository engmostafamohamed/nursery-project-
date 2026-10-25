// Class teams and messages to families, clicked through the real screens in a throw-away nursery:
// the admin adds an assistant to a class, the teacher sees the class, the team and the absent child
// on the dashboard, sends the family a message and opens a chat with them, and the parent reads the
// message with who sent it (name, role, class) on the dashboard; the teacher then sees it was read.
import { expect, test, type Browser, type Page } from '@playwright/test';

import { addTeacher, cleanupTestNursery, createTestNursery, ok, service, signIn, sql, type Person, type TestNursery } from './support/nursery';

let n: TestNursery | undefined;

async function as(browser: Browser, person: Pick<Person, 'email' | 'password' | 'role'>): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, person as Person);
  return page;
}

test('class team, the teacher dashboard and a message the family reads', async ({ browser }) => {
  test.setTimeout(240_000);
  try {
    n = await createTestNursery();
    const assistant = await addTeacher(n, 'UI Assistant', 'مساعدة الواجهة');

    // A child of the class, with the test parent as mother. Not checked in today: absent.
    const svc = await service();
    const child = ok(
      await svc
        .from('children')
        .insert({ nursery_id: n.id, class_id: n.classId, full_name_en: 'UI Child', full_name_ar: 'طفل الواجهة', dob: '2023-03-01', status: 'active', enrollment_date: '2026-01-01' })
        .select('id, child_id_number')
        .single(),
      'child',
    );
    n.childIds.push(child.id);
    ok(await svc.from('parent_children').insert({ parent_id: n.parent.id, child_id: child.id, relationship: 'mother', is_primary: true }), 'parent link');
    expect(child.child_id_number).toMatch(/^CH-\d{4}-\d{5,}$/);

    // ---- The admin adds the assistant to the class.
    const admin = await as(browser, n.admin);
    await admin.goto('/admin/settings/team');
    const card = admin.locator('article', { has: admin.getByRole('heading', { name: 'UI Class' }) });
    await expect(card).toBeVisible();
    await expect(card.getByRole('combobox', { name: 'Lead teacher' })).toHaveValue(n.teacher.id);
    await card.getByRole('combobox', { name: 'Add an assistant' }).selectOption(assistant.id);
    await expect(admin.getByText('Saved')).toBeVisible();
    await expect(card.getByRole('listitem').filter({ hasText: 'UI Assistant' })).toBeVisible();
    await admin.getByRole('tab', { name: /Recent changes/ }).click();
    await expect(admin.getByText('UI Assistant joined UI Class as Assistant')).toBeVisible();
    const [notice] = await sql<{ template_key: string }>(
      `select template_key from public.notifications where user_id = '${assistant.id}' and type = 'class_team'`,
    );
    expect(notice?.template_key).toBe('class_team_assigned');

    // ---- The teacher's dashboard: the class and its team, the absent child, the child's code.
    const teacher = await as(browser, n.teacher);
    await teacher.goto('/teacher');
    const classCard = teacher.locator('article', { has: teacher.getByRole('heading', { name: 'UI Class' }) });
    await expect(classCard).toContainText('UI Assistant');
    await expect(classCard).toContainText('Lead teacher');
    await expect(teacher.getByRole('button', { name: /Absent today/ })).toContainText('1');
    const row = teacher.getByRole('row', { name: /UI Child/ });
    await expect(row).toContainText(child.child_id_number as string);
    await expect(row).toContainText('UI Mother');

    // ---- A message to the child's family.
    await row.getByRole('link', { name: 'Send a message' }).click();
    await teacher.waitForURL(/\/teacher\/family-messages\?child=/);
    await expect(teacher.getByText('Children: 1 · Families: 1').first()).toBeVisible();
    await teacher.getByLabel('Your message').fill('Please bring a hat tomorrow.');
    await teacher.getByRole('button', { name: 'Send', exact: true }).click();
    await teacher.getByRole('dialog').getByRole('button', { name: 'Send', exact: true }).click();
    await expect(teacher.getByText('Sent to 1 families')).toBeVisible();
    await expect(teacher.getByText('Read by 0 of 1 families')).toBeVisible();

    // ---- A chat with the family, opened from the dashboard.
    await teacher.goto('/teacher');
    await teacher.getByRole('row', { name: /UI Child/ }).getByRole('button', { name: 'Chat with the family' }).click();
    await teacher.waitForURL(/\/teacher\/chat/);
    await expect(teacher.getByText('UI Mother').first()).toBeVisible();

    // ---- The parent reads it: who sent it, their role and class.
    const parent = await as(browser, n.parent);
    await parent.goto('/parent');
    const messages = parent.locator('section', { has: parent.getByRole('heading', { name: 'Messages from teachers & staff' }) });
    await expect(messages).toContainText('UI Teacher');
    await expect(messages).toContainText('Teacher · Lead teacher, UI Class');
    await expect(messages).toContainText('Please bring a hat tomorrow.');
    await messages.getByRole('button', { name: /UI Teacher/ }).click();
    const dialog = parent.getByRole('dialog');
    await expect(dialog).toContainText('Please bring a hat tomorrow.');
    await expect(dialog).toContainText('About: UI Child');
    await parent.keyboard.press('Escape');
    await expect.poll(async () => (await sql<{ read: number }>(
      `select count(*)::int as read from public.family_message_recipients r join public.family_messages m on m.id = r.message_id
        where m.nursery_id = '${n!.id}' and r.read_at is not null`,
    ))[0].read).toBe(1);

    // ---- The teacher sees it was read.
    await teacher.goto('/teacher/family-messages?tab=sent');
    await expect(teacher.getByText('Read by 1 of 1 families')).toBeVisible();
  } finally {
    await cleanupTestNursery(n);
  }
});
