import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('displays a forwarded inline logo while remote images stay blocked', async ({ page }) => {
  let remoteRequests = 0;
  await page.route('https://images.example/**', async (route) => {
    remoteRequests++;
    await route.abort();
  });
  const raw = readFileSync('server/tests/fixtures/inline-logo.eml', 'utf8').replace(
    '</p>',
    '</p><img src="https://images.example/tracker.png" alt="Remote tracker">',
  );
  const response = await page.request.post('/api/import', {
    data: { raw: Buffer.from(raw).toString('base64') },
  });
  expect(response.ok()).toBeTruthy();
  let threadId = '';
  await expect
    .poll(async () => {
      const { threads } = await (
        await page.request.get(
          '/api/threads?q=subject:%22Forwarded%20home%20performance%20inspection%22',
        )
      ).json();
      threadId = threads[0]?.id ?? '';
      return threads.length;
    })
    .toBe(1);
  await page.goto(`/#label=INBOX&thread=${threadId}`);
  const email = page.frameLocator('.email-html');
  await expect(email.getByAltText('Company logo')).toBeVisible();
  await expect
    .poll(() =>
      email.getByAltText('Company logo').evaluate((e) => (e as HTMLImageElement).naturalWidth),
    )
    .toBe(1);
  expect(
    await email
      .getByAltText('Remote tracker')
      .evaluate((e) => (e as HTMLImageElement).naturalWidth),
  ).toBe(0);
  expect(remoteRequests).toBe(0);
});

test('keeps offer formatting, fits narrow screens, expands height, and loads images only on request', async ({
  page,
}) => {
  let images = 0;
  await page.route('https://images.example/**', async (route) => {
    images++;
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><rect width="140" height="140" fill="red"/></svg>',
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const raw = `From: Offers <offers@example.net>\r\nTo: alex@example.com\r\nSubject: A styled product offer\r\nMessage-ID: <html-rendering@example.net>\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<style>.offer { color:rgb(255,0,0); font-size:24px }</style><div style="display:none">hidden preview padding</div><table width="600" cellpadding="0" cellspacing="0" style="width:600px;background:#fff;color:#000"><tr><td><h1>Almost yours</h1><img src="https://images.example/product.svg" width="140" height="140" alt="Product"><p class="offer">$55.29</p><div style="height:1800px">Long offer details</div><a href="https://example.com/shop">Shop now</a></td></tr></table><script>window.emailScriptExecuted = true</script><iframe src="https://evil.example"></iframe><form action="https://evil.example"><input></form>`;
  const response = await page.request.post('/api/import', {
    data: { raw: Buffer.from(raw).toString('base64') },
  });
  expect(response.ok()).toBeTruthy();
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get('/api/threads?q=subject:%22A%20styled%20product%20offer%22')
          ).json()
        ).threads.length,
    )
    .toBe(1);
  const { threads } = await (
    await page.request.get('/api/threads?q=subject:%22A%20styled%20product%20offer%22')
  ).json();
  const thread_id = threads[0].id;
  await page.goto(`/#label=INBOX&thread=${thread_id}`);
  const email = page.frameLocator('.email-html');
  await expect(email.getByText('Almost yours')).toBeVisible();
  await expect(email.getByText('hidden preview padding')).toBeHidden();
  await expect(email.locator('.offer')).toHaveCSS('color', 'rgb(255, 0, 0)');
  await expect(email.locator('table')).toHaveAttribute('width', '600');
  await expect(email.locator('script, iframe, form, input')).toHaveCount(0);
  await expect
    .poll(async () => Number(await page.locator('.email-html').evaluate((e) => e.clientHeight)))
    .toBeGreaterThan(800);
  expect(
    await email.locator('html').evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
  ).toBeTruthy();
  expect(
    await email
      .locator('img')
      .evaluate((e) => (e as HTMLImageElement).naturalWidth)
      .catch(() => -1),
  ).toBe(0);
  expect(images).toBe(0);
  await page.getByRole('button', { name: 'Show images', exact: true }).click();
  await expect
    .poll(async () =>
      email
        .locator('img')
        .evaluate((e) => (e as HTMLImageElement).naturalWidth)
        .catch(() => -1),
    )
    .toBe(140);
  expect(images).toBe(1);
  await expect(email.getByText('Shop now')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect
    .poll(async () => Number(await page.locator('.email-html').evaluate((e) => e.clientHeight)))
    .toBeGreaterThan(1800);
  expect(
    await email.locator('html').evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Hide images', exact: true }).click();
  await expect
    .poll(async () =>
      email
        .locator('img')
        .evaluate((e) => (e as HTMLImageElement).naturalWidth)
        .catch(() => -1),
    )
    .toBe(0);
  expect(images).toBe(1);
});
