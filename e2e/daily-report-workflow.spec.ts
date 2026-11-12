// The daily report, clicked through the real screens in a throw-away nursery: two children come in,
// the teacher sees the alarm on the dashboard, fills one report bit by bit (each change is saved and
// survives a reload), starts the other, selects all ready reports and sends them — only the complete
// one goes. The family reads it, the teacher is reminded of the one left, and the admin sees the
// send rate by teacher and the missing report.
import { expect, test, type Browser, type Page } from '@playwright/test';

import { cleanupTestNursery, createTestNursery, ok, service, signIn, sql, type Person, type TestNursery } from './support/nursery';

let n: TestNursery | undefined;

async function as(browser: Browser, person: Person): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, person);
  return page;
}

const localDay = (timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const localTimeIn = (timeZone: string, minutes: number) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(Date.now() + minutes * 60_000));

test('the daily report: filled through the day, sent when complete, read by the family, counted for the admin', async ({ browser }) => {
  test.setTimeout(300_000);
  try {
    n = await createTestNursery();
    const svc = await service();
    const day = localDay(n.timezone);

    // Two children of the class came in this morning; the first is the test parent's daughter.
    const [rana, yousef] = ok(
      await svc
        .from('children')
        .insert([
          { nursery_id: n.id, class_id: n.classId, full_name_en: 'UI Rana', full_name_ar: 'رنا الواجهة', dob: '2023-02-01', status: 'active', enrollment_date: '2026-01-01' },
          { nursery_id: n.id, class_id: n.classId, full_name_en: 'UI Yousef', full_name_ar: 'يوسف الواجهة', dob: '2023-04-01', status: 'active', enrollment_date: '2026-01-01' },
        ])
        .select('id, full_name_en')
        .order('full_name_en'),
      'children',
    );
    n.childIds.push(rana.id, yousef.id);
    ok(await svc.from('parent_children').insert({ parent_id: n.parent.id, child_id: rana.id, relationship: 'mother', is_primary: true }), 'parent link');
    const checkIn = new Date(Date.now() - 3 * 3_600_000).toISOString();
    ok(
      await svc.from('attendance_records').insert([
        { child_id: rana.id, attendance_date: day, check_in: checkIn, check_in_method: 'manual' },
        { child_id: yousef.id, attendance_date: day, check_in: checkIn, check_in_method: 'manual' },
      ]),
      'check-ins',
    );
    // Reports are due in 30 minutes: inside the hour before, when the alarm sounds.
    ok(await svc.from('nursery_settings').update({ end_of_day_checklist_time: localTimeIn(n.timezone, 30) }).eq('nursery_id', n.id), 'due time');

    // ---- The dashboard's alarm.
    const teacher = await as(browser, n.teacher);
    await teacher.goto('/teacher');
    const alarm = teacher.getByRole('alert').filter({ hasText: 'Reports due in' });
    await expect(alarm).toContainText('still to send: 2');
    await alarm.getByRole('link', { name: 'Open daily reports' }).click();
    await teacher.waitForURL(/\/teacher\/daily-reports$/);

    // ---- The list: both came, neither started; nothing can be sent yet.
    await expect(teacher.getByRole('button', { name: /Came today/ })).toContainText('2');
    await expect(teacher.getByRole('button', { name: /Not started/ })).toContainText('2');
    await expect(teacher.getByRole('checkbox', { name: 'Select all reports ready to send' })).toBeDisabled();

    // ---- Rana's report, a bit at a time: each change is saved and survives a reload.
    await teacher.getByRole('row', { name: /UI Rana/ }).getByRole('link', { name: 'Fill in' }).click();
    await teacher.waitForURL(new RegExp(`/teacher/daily-reports/${rana.id}/${day}`));
    await teacher.getByRole('radiogroup', { name: 'Breakfast' }).getByRole('radio', { name: 'All' }).click();
    await expect(teacher.getByText(/Saved at/)).toBeVisible();
    await expect(teacher.getByRole('button', { name: 'Send to the family' })).toBeDisabled();
    await expect(teacher.getByText('Still to answer:')).toBeVisible();
    await teacher.reload();
    await expect(teacher.getByRole('radiogroup', { name: 'Breakfast' }).getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');

    await teacher.getByRole('radiogroup', { name: 'Lunch' }).getByRole('radio', { name: 'Half' }).click();
    await teacher.getByRole('radiogroup', { name: 'Snack' }).getByRole('radio', { name: 'None' }).click();
    await teacher.getByRole('radiogroup', { name: 'Did they nap?' }).getByRole('radio', { name: 'Yes, they napped' }).click();
    await expect(teacher.getByText('Enter how many minutes they slept.')).toBeVisible();
    await teacher.getByLabel('How long (minutes)').fill('50');
    await teacher.getByRole('radiogroup', { name: 'Nap quality' }).getByRole('radio', { name: 'Good' }).click();
    await expect(teacher.getByText('Enter how many minutes they slept.')).toBeHidden();
    await teacher.getByRole('radiogroup', { name: 'Mood' }).getByRole('radio', { name: /Happy/ }).click();
    // Toilet: each visit counts once its type (urine or stool) is chosen.
    await teacher.getByRole('button', { name: 'Add a visit' }).click();
    await expect(teacher.getByText('Choose urine or stool for each visit.')).toBeVisible();
    await teacher.getByLabel('Visit 1: urine or stool').selectOption('urine');
    await expect(teacher.getByText('Choose urine or stool for each visit.')).toBeHidden();
    await teacher.getByRole('group', { name: 'Activities' }).getByRole('button', { name: 'Art' }).click();
    await expect(teacher.getByText('7 of 7')).toBeVisible();
    await teacher.getByRole('button', { name: 'Save changes' }).click();
    await expect(teacher.getByText(/Saved at/)).toBeVisible();
    await expect(teacher.getByRole('button', { name: 'Send to the family' })).toBeEnabled();

    // ---- Yousef's report, only started.
    await teacher.getByRole('button', { name: 'Next child' }).first().click();
    await teacher.waitForURL(new RegExp(`/teacher/daily-reports/${yousef.id}/${day}`));
    // His editor, not Rana's still on screen for a moment: a click there would change her report.
    await expect(teacher.getByRole('heading', { level: 1, name: /UI Yousef/ })).toBeVisible();
    await expect(teacher.getByRole('radiogroup', { name: 'Mood' }).getByRole('radio', { name: /Happy/ })).toHaveAttribute('aria-checked', 'false');
    await teacher.getByRole('radiogroup', { name: 'Mood' }).getByRole('radio', { name: /Content/ }).click();
    await expect(teacher.getByText(/Saved at/)).toBeVisible();

    // ---- Select all ready, send: only the complete report goes.
    await teacher.getByRole('link', { name: 'Back to list' }).click();
    await teacher.waitForURL(/\/teacher\/daily-reports$/);
    const ranaRow = teacher.getByRole('row', { name: /UI Rana/ });
    const yousefRow = teacher.getByRole('row', { name: /UI Yousef/ });
    await expect(ranaRow).toContainText('Ready to send');
    await expect(ranaRow).toContainText('100%');
    await expect(yousefRow).toContainText('In progress');
    await expect(yousefRow).toContainText('14%');
    await expect(yousefRow.getByRole('checkbox')).toBeDisabled();
    await teacher.getByRole('checkbox', { name: 'Select all reports ready to send' }).click();
    await teacher.getByRole('button', { name: 'Send selected (1)' }).click();
    await teacher.getByRole('dialog').getByRole('button', { name: 'Send (1)' }).click();
    await expect(teacher.getByText('Sent to families: 1', { exact: true })).toBeVisible();
    await expect(ranaRow).toContainText('Sent');
    await expect(teacher.getByRole('button', { name: /Sent to families/ })).toContainText('1');

    const [sent] = await sql<{ status: string; submitted_by: string; notice: string | null }>(`
      select dr.status, dr.submitted_by::text,
             (select n2.template_key from public.notifications n2 where n2.user_id = '${n.parent.id}' and n2.type = 'daily_report' limit 1) as notice
        from public.daily_reports dr where dr.child_id = '${rana.id}' and dr.report_date = '${day}'`);
    // The family's notice names who sent it.
    expect(sent).toEqual({ status: 'published', submitted_by: n.teacher.id, notice: 'daily_report_sent_by' });

    // ---- A sent report can only be read.
    await ranaRow.getByRole('link', { name: 'View' }).click();
    await expect(teacher.getByText('This report was sent to the family and can no longer be changed.')).toBeVisible();
    await expect(teacher.getByRole('button', { name: 'Send to the family' })).toHaveCount(0);

    // ---- The family reads it.
    const parent = await as(browser, n.parent);
    await parent.goto(`/parent/daily-reports?child=${rana.id}&date=${day}`);
    await expect(parent.getByText('UI Rana').first()).toBeVisible();
    await expect(parent.getByText('Happy').first()).toBeVisible();

    // ---- The reminder: one report is still to send, so the teacher is told once.
    await sql('select public.run_daily_report_reminders()');
    const [reminder] = await sql<{ n: number; count: string | null }>(`
      select count(*)::int as n, max(template_params->>'count') as count from public.notifications
       where user_id = '${n.teacher.id}' and type = 'daily_report_reminder'`);
    expect(reminder).toEqual({ n: 1, count: '1' });

    // ---- The admin: the send rate today, by teacher, and the missing report.
    const admin = await as(browser, n.admin);
    await admin.goto('/admin');
    const card = admin.getByRole('heading', { name: 'Daily reports today' }).locator('xpath=ancestor::section[1]');
    await expect(card).toContainText('50%');
    await expect(card).toContainText('Sent 1 of 2');
    await card.getByRole('link', { name: 'Details' }).click();
    await admin.waitForURL(/\/admin\/daily-reports$/);
    await expect(admin.getByRole('button', { name: /Missing/ })).toContainText('1');
    const teacherRow = admin.getByRole('row', { name: /UI Teacher/ });
    await expect(teacherRow).toContainText('50%');
    await admin.getByRole('tab', { name: /Missing reports/ }).click();
    await expect(admin.getByRole('row', { name: /UI Yousef/ })).toContainText('Started · 1 of 7');
  } finally {
    await cleanupTestNursery(n);
  }
});
