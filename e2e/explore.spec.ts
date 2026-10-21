// Temporary: walks the parent's application form from "Add child", dumping each step.
import { mkdirSync, writeFileSync } from 'node:fs';

import { test, type Page } from '@playwright/test';

import { completeStep, nextStep, stepNumber, uploadRequiredDocuments } from './support/applicationForm';
import { cleanupTestNursery, createTestNursery, signIn, type TestNursery } from './support/nursery';

const OUT = 'test-results/explore';
let n: TestNursery | undefined;

async function dump(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(1500);
  writeFileSync(`${OUT}/${name}.yml`, await page.locator('main').first().ariaSnapshot());
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

test('walk the application form', async ({ page }) => {
  try {
    n = await createTestNursery();
    await signIn(page, n.parent);
    await page.goto('/parent/children');
    await page.getByRole('button', { name: 'Add child' }).first().click();
    await page.waitForURL(/\/parent\/applications\//, { timeout: 30_000 });
    const log: string[] = [];
    for (let guard = 0; guard < 16; guard += 1) {
      const step = await stepNumber(page);
      await dump(page, `wizard-step-${String(step).padStart(2, '0')}`);
      const uploaded = await uploadRequiredDocuments(page);
      if (uploaded) log.push(`step ${step}: uploaded ${uploaded} files`);
      try {
        log.push(`step ${step}: ${JSON.stringify(await completeStep(page, n.parent.email))}`);
      } catch (error) {
        log.push(`step ${step}: ${(error as Error).message}`);
        const html = await page.locator('[data-field-invalid="true"]').evaluateAll((els) => els.map((el) => (el.parentElement as HTMLElement).outerHTML.slice(0, 3000)));
        writeFileSync(`${OUT}/failing-fields.html`, html.join('\n\n-----\n\n'));
        await dump(page, `wizard-fail-${step}`);
        break;
      }
      const next = page.getByRole('button', { name: 'Next', exact: true });
      if (!(await next.isVisible().catch(() => false)) || !(await next.isEnabled().catch(() => false))) {
        log.push(`step ${step}: no enabled Next`);
        await dump(page, `wizard-stop-${step}`);
        break;
      }
      await nextStep(page).catch((error) => log.push(`step ${step}: next failed ${(error as Error).message}`));
    }
    writeFileSync(`${OUT}/wizard-log.txt`, log.join('\n'));
  } finally {
    await cleanupTestNursery(n);
  }
});
