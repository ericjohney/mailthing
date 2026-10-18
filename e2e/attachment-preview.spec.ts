import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('previews images and PDFs, keeps downloads, and recovers from errors on mobile', async ({
  page,
}) => {
  const image = readFileSync('e2e/fixtures/attachment-preview.png').toString('base64');
  const pdf = readFileSync('e2e/fixtures/attachment-preview.pdf').toString('base64');
  const parts = [
    ['photo.png', 'image/png', image],
    ['document.pdf', 'application/octet-stream', pdf],
    ['note.txt', 'text/plain', Buffer.from('Keep this file downloadable.').toString('base64')],
    ['damaged.pdf', 'application/pdf', Buffer.from('This is not a PDF.').toString('base64')],
  ];
  const raw =
    'From: Files <files@example.net>\r\nTo: alex@example.com\r\nSubject: Attachment preview test\r\nContent-Type: multipart/mixed; boundary=files\r\n\r\n--files\r\nContent-Type: text/plain\r\n\r\nYour documents and photos.\r\n' +
    parts
      .map(
        ([name, mime, data]) =>
          `--files\r\nContent-Type: ${mime}\r\nContent-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${data}\r\n`,
      )
      .join('') +
    '--files--\r\n';
  expect(
    (
      await page.request.post('/api/import', { data: { raw: Buffer.from(raw).toString('base64') } })
    ).ok(),
  ).toBeTruthy();
  let threadId = '';
  await expect
    .poll(async () => {
      const { threads } = await (
        await page.request.get('/api/threads?q=subject:%22Attachment%20preview%20test%22')
      ).json();
      threadId = threads[0]?.id ?? '';
      return threads.length;
    })
    .toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#label=INBOX&thread=${threadId}`);

  await page.getByRole('button', { name: 'Preview photo.png', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'photo.png', exact: true });
  const imagePreview = dialog.getByRole('img', { name: 'photo.png' });
  await expect(imagePreview).toBeVisible();
  await expect
    .poll(() => imagePreview.evaluate((e) => (e as HTMLImageElement).naturalWidth))
    .toBe(640);
  const initialWidth = await imagePreview.evaluate((e) => e.getBoundingClientRect().width);
  await dialog.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect
    .poll(() => imagePreview.evaluate((e) => e.getBoundingClientRect().width))
    .toBeGreaterThan(initialWidth);
  await dialog.getByRole('button', { name: 'Fit to width' }).click();
  await expect
    .poll(() => imagePreview.evaluate((e) => e.getBoundingClientRect().width))
    .toBe(initialWidth);
  expect(await dialog.evaluate((e) => e.getBoundingClientRect().right <= innerWidth)).toBeTruthy();
  const downloadEvent = page.waitForEvent('download');
  await dialog.getByRole('link', { name: 'Download', exact: true }).click();
  expect((await downloadEvent).suggestedFilename()).toBe('photo.png');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Preview photo.png', exact: true })).toBeFocused();

  await page.getByRole('button', { name: 'Preview document.pdf', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'document.pdf', exact: true });
  await expect(dialog.getByText('Page 1 of 2')).toBeVisible();
  const firstPage = dialog.getByRole('img', { name: 'PDF page 1', exact: true });
  await expect(firstPage).toBeVisible();
  // The real PDF worker must paint document content, not just a blank canvas.
  expect(
    await firstPage.evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let dark = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 100 && pixels[i + 3] > 0) dark++;
      return dark;
    }),
  ).toBeGreaterThan(50);
  await expect(dialog.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Next page' }).click();
  await expect(dialog.getByText('Page 2 of 2')).toBeVisible();
  await expect(dialog.getByRole('img', { name: 'PDF page 2', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Next page' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Fit to width' })).toHaveText('125%');
  await dialog.getByRole('button', { name: 'Close dialog' }).click();

  await expect(page.getByRole('button', { name: 'Preview note.txt' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Download note.txt' })).toBeVisible();
  await page.getByRole('button', { name: 'Preview damaged.pdf', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'damaged.pdf', exact: true });
  await expect(dialog.getByRole('alert')).toContainText('can’t be previewed');
  await expect(dialog.getByRole('link', { name: 'Download', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();

  let fail = true;
  await page.route('**/api/attachments/**', async (route) => {
    if (fail) {
      fail = false;
      await route.fulfill({ status: 503 });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Preview photo.png', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'photo.png', exact: true });
  await expect(dialog.getByRole('alert')).toContainText('Couldn’t load');
  await dialog.getByRole('button', { name: 'Retry' }).click();
  await expect(dialog.getByRole('img', { name: 'photo.png' })).toBeVisible();
});
