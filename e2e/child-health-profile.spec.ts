// The child health profile, end to end against the real database: from the food alerts a child opens
// at the allergy the menu is not checked against, it is tied to a menu food and leaves that list, and
// "back" returns to the alerts; the profile shows what enrollment recorded (blood type, emergency
// contacts, what the parents wrote); the admin fills the doctor, the insurance and a vaccination with
// the problems shown under the fields; and the parent sees the same profile, read only, and asks for
// an update.
import { expect, test } from '@playwright/test';

import { cleanupTestNursery, createTestNursery, signIn, sql, type TestNursery } from './support/nursery';

let n: TestNursery | undefined;
let childId = '';

test.describe.serial('Child health profile', () => {
  test.beforeAll(async () => {
    n = await createTestNursery();
    const [c] = await sql<{ id: string }>(`
      insert into public.children (nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date, blood_type, emergency_contacts, daily_care_preferences)
      values ('${n.id}', '${n.classId}', 'جنى الواجهة', 'UI Jana', '2023-11-24', 'active', '2026-01-01', 'B+',
              '[{"name": "UI Mariam", "phone": "+201033376233", "relationship": "mother"}]',
              '{"food_allergies": "Strawberries", "emergency_medications": ["cetal"]}')
      returning id`);
    childId = c.id;
    n.childIds.push(childId);
    await sql(`insert into public.parent_children (parent_id, child_id, is_primary, relationship) values ('${n.parent.id}', '${childId}', true, 'mother')`);
    await sql(`insert into public.child_allergies (child_id, nursery_id, allergen_name, severity, reaction_type) values ('${childId}', '${n.id}', 'Cocoa', 'moderate', 'Hives')`);
  });

  test.afterAll(async () => {
    await cleanupTestNursery(n);
  });

  test('from the food alerts, the child opens at the allergy, which is tied to a menu food', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto('/admin/food-alerts');
    await page.getByTestId('unmatched-allergies').getByRole('link', { name: 'UI Jana' }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/children/${childId}/health\\?allergy=Cocoa$`));

    // What enrollment recorded is shown, not empty fields.
    await expect(page.getByTestId('health-hero').getByRole('heading', { level: 1 })).toHaveText('UI Jana');
    await expect(page.getByTestId('health-fact-blood')).toContainText('B+');
    await expect(page.getByTestId('care-contacts')).toContainText('UI Mariam');
    await expect(page.getByTestId('care-contacts')).toContainText('+201033376233');
    await expect(page.getByTestId('enrollment-notes')).toContainText('Strawberries');
    await expect(page.getByTestId('enrollment-notes')).toContainText('Cetal');
    await expect(page.getByTestId('health-attention')).toContainText('No pediatrician recorded.');

    const prompt = page.getByTestId('allergy-foods-prompt');
    await expect(prompt).toContainText('Is “Cocoa” a food?');
    await prompt.getByRole('button', { name: 'Choose menu foods' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit allergy' });
    await dialog.getByTestId('allergy-foods').getByRole('button', { name: 'Milk', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('The allergy was saved.')).toBeVisible();

    const item = page.getByTestId('allergy-item').filter({ hasText: 'Cocoa' });
    await expect(item).toContainText('Checked against the menu:');
    await expect(item).toContainText('Milk');
    await expect(prompt).toHaveCount(0);
    const [allergy] = await sql<{ foods: string }>(`select array_to_string(food_allergens, ',') as foods from public.child_allergies where child_id = '${childId}'`);
    expect(allergy.foods).toBe('milk');

    await page.getByTestId('health-hero').getByRole('link', { name: 'Food allergy alerts' }).click();
    await expect(page).toHaveURL(/\/admin\/food-alerts$/);
    await expect(page.getByTestId('unmatched-allergies').getByRole('link', { name: 'UI Jana' })).toHaveCount(0);
  });

  test('the admin fills the doctor, insurance and a vaccination, with problems under the fields', async ({ page }) => {
    await signIn(page, n!.admin);
    await page.goto(`/admin/children/${childId}/health`);
    await page.getByTestId('edit-overview').click();
    const dialog = page.getByRole('dialog', { name: 'Blood type, doctor and insurance' });
    await dialog.getByRole('radio', { name: 'O+', exact: true }).click();
    await dialog.getByLabel('Pediatrician name').fill('Dr. UI Hany');
    await dialog.getByLabel('Pediatrician phone').fill('0100');
    await dialog.getByLabel('Pediatrician phone').blur();
    await expect(dialog.locator('#ped-phone-error')).toHaveText('Write the full number, for example 01012345678 or +971501234567.');
    await dialog.getByLabel('Pediatrician phone').fill('01012345678');
    await expect(dialog.locator('#ped-phone-error')).toHaveCount(0);
    await dialog.getByLabel('Emergency contact name').fill('UI Uncle Ali');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog.locator('#em-phone-error')).toHaveText('Add a phone number for this contact.');
    await dialog.getByLabel('Emergency contact phone').fill('01000000008');
    await dialog.getByLabel('Insurance provider').fill('UI AXA');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('The health details were saved.')).toBeVisible();

    await expect(page.getByTestId('health-fact-blood')).toContainText('O+');
    await expect(page.getByTestId('doctor-insurance')).toContainText('Dr. UI Hany');
    await expect(page.getByTestId('doctor-insurance')).toContainText('UI AXA');
    await expect(page.getByTestId('care-contacts')).toContainText('UI Uncle Ali');
    // Nothing is left to deal with, so the list is gone.
    await expect(page.getByTestId('health-attention')).toHaveCount(0);
    const [saved] = await sql<{ blood: string; phone: string; contact: string }>(`
      select c.blood_type as blood, r.pediatrician_phone as phone, r.emergency_contact_phone as contact
        from public.children c join public.child_health_records r on r.child_id = c.id where c.id = '${childId}'`);
    expect(saved).toEqual({ blood: 'O+', phone: '+201012345678', contact: '+201000000008' });

    const [{ given, before, due }] = await sql<{ given: string; before: string; due: string }>(`
      select (current_date - 60)::text as given, (current_date - 70)::text as before, (current_date - 5)::text as due`);
    await page.getByTestId('add-vaccination').click();
    const vac = page.getByRole('dialog', { name: 'Add vaccination' });
    await vac.getByLabel('Vaccine', { exact: true }).selectOption('mmr');
    await vac.getByLabel('Dose number').fill('2');
    await vac.getByLabel('Date administered').fill(given);
    await vac.getByLabel('Next due date').fill(before);
    await vac.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(vac.locator('#vac-next-error')).toHaveText('The next dose must come after the one given.');
    await vac.getByLabel('Next due date').fill(due);
    await vac.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('The vaccination was saved.')).toBeVisible();
    await expect(page.getByTestId('vaccination-item').filter({ hasText: 'MMR' })).toContainText('Overdue');
    await expect(page.getByTestId('health-fact-vaccinations')).toContainText('1 overdue');
    await expect(page.getByTestId('health-attention')).toContainText('MMR was due on');
  });

  test('the parent sees the same profile, read only, and asks for an update', async ({ page }) => {
    await signIn(page, n!.parent);
    await page.goto('/parent/children');
    await page.getByRole('button', { name: 'Actions' }).filter({ visible: true }).first().click();
    await page.getByRole('menuitem', { name: 'Health & safety' }).click();
    await expect(page).toHaveURL(new RegExp(`/parent/children/${childId}/health$`));

    await expect(page.getByTestId('health-fact-blood')).toContainText('O+');
    await expect(page.getByTestId('allergy-item').filter({ hasText: 'Cocoa' })).toContainText('Milk');
    await expect(page.getByTestId('doctor-insurance')).toContainText('Dr. UI Hany');
    await expect(page.getByTestId('add-allergy')).toHaveCount(0);
    await expect(page.getByTestId('edit-overview')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit Cocoa' })).toHaveCount(0);

    const request = page.getByTestId('health-request');
    await request.getByRole('button', { name: 'Send request' }).click();
    await expect(request.locator('#request-notes-error')).toHaveText('Write what should change.');
    await request.getByLabel('What should the nursery update?').fill('UI Jana now takes vitamin D every morning.');
    await request.getByRole('button', { name: 'Send request' }).click();
    await expect(request.getByRole('status')).toContainText('Request sent to the nursery team.');
    const [{ count }] = await sql<{ count: number }>(`select count(*)::int as count from public.child_health_update_requests where child_id = '${childId}'`);
    expect(count).toBe(1);
  });
});
