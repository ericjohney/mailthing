import { test, expect } from '@playwright/test';

test('manages labels from the mobile drawer, persists edits, and keeps mail when deleting', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  const drawer = page.getByRole('complementary', { name: 'Mailboxes' });
  await expect(drawer.getByRole('button', { name: 'Manage labels' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'New label', exact: true })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Drafts', exact: true })).not.toBeVisible();
  await drawer.getByRole('button', { name: 'New label', exact: true }).click();
  const manager = page.getByRole('dialog', { name: 'Labels', exact: true });
  await manager.getByRole('textbox', { name: 'Name', exact: true }).fill('Mobile projects');
  await manager
    .getByRole('textbox', { name: 'Sorting guidance' })
    .fill('Project notes and team discussions');
  await manager.getByRole('button', { name: 'Create label', exact: true }).click();
  await expect(manager.getByRole('button', { name: 'Edit Mobile projects' })).toBeVisible();
  const labels = await (await page.request.get('/api/labels')).json();
  const label = labels.find((item: { name: string }) => item.name === 'Mobile projects');
  expect(label.pinned).toBe(true);
  await page.request.post('/api/import', {
    data: {
      raw: Buffer.from(
        'From: Julian Park <julian@example.com>\r\nTo: Alex <alex@example.com>\r\nSubject: Mobile project notes\r\nMessage-ID: <mobile-label-management@example.com>\r\n\r\nPlans for the team.',
      ).toString('base64'),
      labels: ['Mobile projects'],
    },
  });
  await manager.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByText('Mobile project notes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await expect(drawer.getByRole('button', { name: 'Mobile projects', exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Manage labels' }).click();
  await manager.getByRole('button', { name: 'Edit Mobile projects' }).click();
  await expect(manager.getByRole('textbox', { name: 'Sorting guidance' })).toHaveValue(
    'Project notes and team discussions',
  );
  await manager.getByRole('textbox', { name: 'Name', exact: true }).fill('Team projects');
  await manager.getByRole('checkbox', { name: 'Pin to mailboxes' }).uncheck();
  await manager.getByRole('button', { name: 'Save label' }).click();
  await expect(manager.getByRole('button', { name: 'Edit Team projects' })).toBeVisible();
  await manager.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await expect(
    drawer.getByRole('button', { name: 'Team projects', exact: true }),
  ).not.toBeVisible();
  await drawer.getByRole('button', { name: 'All labels' }).click();
  await manager.getByRole('searchbox', { name: 'Search labels' }).fill('Team projects');
  await manager.getByRole('button', { name: /Team projects.*1 conversation/ }).click();
  await expect(page.getByRole('heading', { name: 'Team projects', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await drawer.getByRole('button', { name: 'Manage labels' }).click();
  await manager.getByRole('button', { name: 'Edit Team projects' }).click();
  await manager.getByRole('button', { name: 'Delete label', exact: true }).click();
  const confirmation = manager.getByRole('group', { name: 'Delete label confirmation' });
  await expect(confirmation).toContainText('Your messages will be kept');
  await confirmation.getByRole('button', { name: 'Delete label', exact: true }).click();
  await expect(manager.getByRole('button', { name: 'Edit Team projects' })).not.toBeVisible();
  await manager.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  await expect(page.getByText('Mobile project notes', { exact: true })).toBeVisible();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await drawer.getByRole('button', { name: 'Manage labels' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await manager.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await manager.getByRole('button', { name: 'Close dialog' }).click();
  }
  expect(errors).toEqual([]);
});
