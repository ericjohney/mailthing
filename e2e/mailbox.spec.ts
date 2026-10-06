import { test, expect } from '@playwright/test';

test('receives mail through the pipeline, supports mailbox actions, and works on mobile', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  const raw =
    'From: Sam Rivera <sam@example.net>\r\nTo: Alex Morgan <alex@example.com>\r\nSubject: A note for the weekend\r\nMessage-ID: <browser-test@example.net>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nCoffee by the river on Saturday?\r\n';
  const response = await page.request.post('/api/import', {
    data: {
      raw: Buffer.from(raw).toString('base64'),
      envelope: { from: 'sam@example.net', to: ['alex@example.com'] },
    },
  });
  expect(response.ok()).toBeTruthy();
  await expect(page.getByText('A note for the weekend', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Star A note for the weekend', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Unstar A note for the weekend', exact: true }),
  ).toBeVisible();
  await page.getByText('A note for the weekend', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A note for the weekend' })).toBeVisible();
  await expect(page.getByText('Coffee by the river on Saturday?', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(page.getByLabel('To', { exact: true })).toHaveValue('sam@example.net');
  await page.getByLabel('Message body').fill('Absolutely. See you there!');
  await page.getByRole('button', { name: 'Close compose and save draft' }).click();
  await page.getByRole('button', { name: 'Back to mailbox' }).click();
  await page.getByRole('checkbox', { name: 'Select A note for the weekend' }).check();
  await page.getByRole('button', { name: 'Archive selected' }).click();
  await expect(page.getByText('A note for the weekend', { exact: true })).not.toBeVisible();
  await page.getByRole('textbox', { name: 'Search mail' }).fill('from:sam@example.net');
  await expect(page.getByText('A note for the weekend', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('checkbox', { name: 'Select A note for the weekend' }).check();
  expect(
    await page
      .locator('.mail-toolbar')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBeTruthy();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Clear search' }).click();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByLabel('Display name').fill('Jamie Morgan');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toHaveText('Mailbox settings saved');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByRole('button', { name: 'Drafts', exact: true }).click();
  await expect(page.getByText('Re: A note for the weekend', { exact: true })).toBeVisible();
  await page.getByText('Re: A note for the weekend', { exact: true }).click();
  await expect(page.getByLabel('Message body')).toHaveValue('Absolutely. See you there!');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
