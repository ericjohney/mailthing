import { test, expect } from '@playwright/test';

function contrast(foreground: string, background: string) {
  const luminance = (color: string) => {
    const values = color
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map((value) => {
        const channel = Number(value) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('shares accessible palettes across the inbox, reader, compose, and persisted appearance', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  const subject = 'A formatted note for the design system';
  const raw = `From: Nora Chen <nora@example.net>\r\nTo: Alex <alex@example.com>\r\nSubject: ${subject}\r\nMessage-ID: <appearance-test@example.net>\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>A readable note in every appearance.</p><a href="https://example.com">A link</a>\r\n`;
  const response = await page.request.post('/api/import', {
    data: {
      raw: Buffer.from(raw).toString('base64'),
      envelope: { from: 'nora@example.net', to: ['alex@example.com'] },
    },
  });
  expect(response.ok()).toBeTruthy();
  await expect(page.getByText(subject, { exact: true })).toBeVisible();

  await page.keyboard.press('/');
  await expect(page.getByRole('textbox', { name: 'Search mail' })).toBeFocused();
  await expect(page.locator('.search-box')).toHaveCSS('outline-style', 'solid');
  await page.getByRole('tab', { name: 'Primary', exact: true }).focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Updates', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('Home');
  await expect(page.getByText(subject, { exact: true })).toBeVisible();

  for (const theme of ['Light', 'Dark']) {
    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.getByRole('button', { name: theme, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.toLowerCase());
    await page.getByRole('button', { name: 'Close dialog' }).click();
    // Check the settled palette rather than a frame during the control transition.
    await expect
      .poll(async () => {
        const colors = await page.locator('.compose-button').evaluate((element) => ({
          foreground: getComputedStyle(element).color,
          background: getComputedStyle(element).backgroundColor,
        }));
        return contrast(colors.foreground, colors.background);
      })
      .toBeGreaterThanOrEqual(4.5);
    const muted = await page.locator('.page-heading p').evaluate((element) => ({
      foreground: getComputedStyle(element).color,
      background: getComputedStyle(document.querySelector('.mail-panel')!).backgroundColor,
    }));
    expect(contrast(muted.foreground, muted.background)).toBeGreaterThanOrEqual(4.5);
    await page.getByText(subject, { exact: true }).click();
    const email = page.frameLocator('.email-html');
    await expect(email.getByText('A readable note in every appearance.')).toBeVisible();
    await expect(page.locator('.email-html')).toHaveAttribute(
      'sandbox',
      'allow-popups allow-popups-to-escape-sandbox',
    );
    const surface = await page
      .locator('.mail-panel')
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    await expect(email.locator('body')).toHaveCSS('background-color', surface);
    await page.getByRole('button', { name: 'Reply', exact: true }).click();
    await expect(page.locator('.compose')).toHaveCSS('background-color', surface);
    await expect(page.getByLabel('To', { exact: true })).toHaveValue('nora@example.net');
    await page.getByRole('button', { name: 'Close compose and save draft' }).click();
    await page.getByRole('button', { name: 'Back to mailbox' }).click();
  }
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await expect(page.getByRole('button', { name: 'Compose', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Compose', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'New message' })).toBeVisible();
  await page.getByRole('button', { name: 'Close compose and save draft' }).click();
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByRole('button', { name: 'Compose', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'New message' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
});
