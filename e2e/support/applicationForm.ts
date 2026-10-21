// Fills the parent's application form the way a parent does, step by step, with the form's own help:
// each step reports "N required field(s) left on this step" and its "Show me" link marks every missing
// field. The filler fills exactly those fields by kind (text, phone, e-mail, national ID, date, list,
// yes/no), so it follows the form when fields change instead of hard-coding them.
import { expect, type Locator, type Page } from '@playwright/test';

import { PNG } from './nursery';

const MISSING = /required field\(s\) left on this step/;

/** A plausible value for a text field, from its label and input type. */
function valueFor(label: string, type: string | null, email: string): string {
  const l = label.toLowerCase();
  if (type === 'email' || l.includes('email')) return email;
  if (type === 'tel' || /mobile|phone|whatsapp/.test(l)) return `010${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;
  if (/national id|national number|id number/.test(l)) return '29001011234567';
  if (type === 'date' || /date|birth/.test(l)) return '2023-05-10';
  if (type === 'time' || /time/.test(l)) return '08:00';
  if (type === 'number' || /age|count|number of|hours|weight|height/.test(l)) return '1';
  if (/name/.test(l)) return 'UI Test Person';
  return 'UI test answer';
}

/** Fills one field container (label + control + its error line). */
async function fillField(page: Page, field: Locator, email: string): Promise<string> {
  const label = ((await field.locator('label').first().textContent().catch(() => '')) ?? '').trim();

  // The form marks the control it is missing (aria-invalid); start there.
  const marked = field.locator('[aria-invalid="true"]').first();
  const markedTag = (await marked.count()) ? await marked.evaluate((el) => `${el.tagName}|${el.getAttribute('aria-haspopup') ?? ''}`) : '';

  const listButton = markedTag === 'BUTTON|listbox' ? marked : field.locator('button[aria-haspopup="listbox"]').first();
  const textInput = field.locator('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea').first();
  const useList = markedTag === 'BUTTON|listbox' || (!(await textInput.count()) && (await listButton.count()) > 0);
  if (useList) {
    await listButton.click();
    // The form's lists open inside the field; other pickers open in a layer at the end of the page.
    const inField = field.getByRole('listbox');
    const options = ((await inField.count()) ? inField : page.getByRole('listbox').filter({ visible: true }).last()).getByRole('option');
    await expect(options.first()).toBeVisible();
    const n = await options.count();
    // The first option is often the empty "choose" one.
    await options.nth(n > 1 ? 1 : 0).click();
    return `${label}: chose an option`;
  }

  const select = field.locator('select').first();
  if (!(await textInput.count()) && (await select.count())) {
    const values = await select.locator('option').evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
    if (values.length) await select.selectOption(values[0]);
    return `${label}: selected`;
  }

  const input = ['INPUT|', 'TEXTAREA|'].includes(markedTag) ? marked : textInput;
  if (await input.count()) {
    const type = await input.getAttribute('type');
    const value = valueFor(label, type, email);
    await input.fill(value);
    // Leave the field as a parent would (the form checks a field when it is left).
    await page.keyboard.press('Tab');
    return `${label}: "${value}"`;
  }

  const pressed = field.locator('button[aria-pressed], [role="radio"]').first();
  if (await pressed.count()) {
    await pressed.click();
    return `${label}: picked the first choice`;
  }

  const checkbox = field.locator('input[type="checkbox"], [role="checkbox"]').first();
  if (await checkbox.count()) {
    await checkbox.check({ force: true });
    return `${label}: checked`;
  }
  return `${label}: (no control found)`;
}

/** Completes the current step's required fields; returns what was filled. */
export async function completeStep(page: Page, email: string): Promise<string[]> {
  const filled: string[] = [];
  for (let round = 0; round < 8; round += 1) {
    const missing = page.getByText(MISSING).first();
    if (!(await missing.isVisible().catch(() => false))) return filled;
    await page.getByRole('button', { name: 'Show me' }).click();
    await page.waitForTimeout(300);
    const fields = await page.locator('[data-field-invalid="true"]').evaluateAll((els) =>
      els.map((el) => {
        const field = el.parentElement as HTMLElement;
        if (!field.dataset.e2eField) field.dataset.e2eField = String(Math.random()).slice(2);
        return field.dataset.e2eField;
      }),
    );
    for (const id of fields) {
      filled.push(await fillField(page, page.locator(`[data-e2e-field="${id}"]`), email));
    }
    await page.waitForTimeout(300);
  }
  const left = await page.getByText(MISSING).first().textContent().catch(() => '');
  throw new Error(`step still incomplete after filling: ${left} — filled ${JSON.stringify(filled)}`);
}

const DOCUMENTS_LEFT = /(\d+) required document\(s\) left to upload/;

/**
 * The documents step: clicks each "Upload file" and picks an image in the file dialog, as a parent
 * does, until the step reports no required document left.
 */
export async function uploadRequiredDocuments(page: Page): Promise<number> {
  let uploaded = 0;
  for (let guard = 0; guard < 8; guard += 1) {
    const left = page.getByText(DOCUMENTS_LEFT).first();
    if (!(await left.isVisible().catch(() => false))) return uploaded;
    const before = Number(((await left.textContent()) ?? '').match(DOCUMENTS_LEFT)?.[1] ?? 0);
    const button = page.getByRole('button', { name: 'Upload file' }).first();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), button.click()]);
    await chooser.setFiles({ name: `document-${uploaded + 1}.png`, mimeType: 'image/png', buffer: PNG });
    uploaded += 1;
    await expect
      .poll(async () => {
        const text = (await page.getByText(DOCUMENTS_LEFT).first().textContent().catch(() => null)) ?? '';
        return text ? Number(text.match(DOCUMENTS_LEFT)?.[1] ?? 0) : 0;
      }, { timeout: 30_000 })
      .toBeLessThan(before);
  }
  throw new Error('required documents still missing');
}

/** Clicks Next and waits for the step number to change. */
export async function nextStep(page: Page) {
  const before = await stepNumber(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect.poll(() => stepNumber(page), { timeout: 20_000 }).not.toBe(before);
}

/** "Step 3 of 13" → 3. */
export async function stepNumber(page: Page): Promise<number> {
  const text = (await page.getByText(/Step \d+ of \d+/).first().textContent().catch(() => '')) ?? '';
  return Number(text.match(/Step (\d+)/)?.[1] ?? 0);
}
