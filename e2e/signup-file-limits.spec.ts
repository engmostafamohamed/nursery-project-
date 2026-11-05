// The public sign-up form checks a file the moment it is chosen and says what is wrong under that
// field, instead of refusing all of them at the last step. Nothing here is submitted.
import { expect, test, type Page } from '@playwright/test';

const MB = 1024 * 1024;

const fileInput = (page: Page) => page.locator('input[type="file"]').first();

async function openForm(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem('xo_i18nextLng', 'en'));
  await page.goto('/signup');
  await expect(fileInput(page)).toBeAttached();
}

const pdf = (bytes: number, name = 'scan.pdf') => ({ name, mimeType: 'application/pdf', buffer: Buffer.alloc(bytes, 'x') });

/** A photo of noise, the hardest kind to shrink, made by the browser so it is a real image. */
async function noisePhoto(page: Page, width: number, height: number) {
  const base64 = await page.evaluate(
    async ([w, h]) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d')!;
      const image = context.createImageData(w, h);
      for (let i = 0; i < image.data.length; i += 4) {
        image.data[i] = Math.random() * 255;
        image.data[i + 1] = Math.random() * 255;
        image.data[i + 2] = Math.random() * 255;
        image.data[i + 3] = 255;
      }
      context.putImageData(image, 0, 0);
      return canvas.toDataURL('image/png').split(',')[1];
    },
    [width, height],
  );
  return { name: 'camera.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

test.describe('choosing a file on the sign-up form', () => {
  test('a PDF over the limit is refused under the field, at once', async ({ page }) => {
    await openForm(page);
    await fileInput(page).setInputFiles(pdf(4 * MB));

    await expect(page.getByRole('alert')).toContainText('This file is 4.0 MB. The limit is 3.0 MB.');
    await expect(page.getByRole('button', { name: 'Remove file' })).toHaveCount(0);
  });

  test('a type it cannot take is refused under the field', async ({ page }) => {
    await openForm(page);
    await fileInput(page).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });

    await expect(page.getByRole('alert')).toContainText('Unsupported file type');
  });

  test('a PDF within the limit is taken, and clears an earlier error', async ({ page }) => {
    await openForm(page);
    await fileInput(page).setInputFiles(pdf(4 * MB));
    await expect(page.getByRole('alert')).toBeVisible();

    await fileInput(page).setInputFiles(pdf(2 * MB));
    await expect(page.getByText('scan.pdf')).toBeVisible();
    await expect(page.getByText('2.0 MB', { exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);

    await page.getByRole('button', { name: 'Remove file' }).click();
    await expect(page.getByText('scan.pdf')).toHaveCount(0);
  });

  test('a large photo is shrunk when chosen, and its new size is shown', async ({ page }) => {
    await openForm(page);
    const photo = await noisePhoto(page, 1500, 1200);
    expect(photo.buffer.length).toBeGreaterThan(3 * MB);

    await fileInput(page).setInputFiles(photo);

    await expect(page.getByText('camera.jpg')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('alert')).toHaveCount(0);
    const shown = (await page.locator('p', { hasText: /^\d+(\.\d+)? KB$/ }).first().innerText()).trim();
    expect(parseFloat(shown)).toBeLessThanOrEqual(310);
  });
});
