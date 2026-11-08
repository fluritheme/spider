import { expect, test } from '@playwright/test';

test('private dashboard handles sign-in, refresh, export and sign-out on every viewport', async ({
  page,
}) => {
  let authenticated = false;
  let requests = 0;
  const today = new Date().toISOString().slice(0, 10);
  const timestamp = new Date().toISOString();
  await page.route('**/api/dashboard/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/login')) {
      const data = route.request().postDataJSON() as { password: string };
      authenticated = data.password === 'test-operator-key';
      await route.fulfill({
        status: authenticated ? 200 : 401,
        json: authenticated ? { ok: true } : { error: 'Invalid dashboard access key.' },
      });
      return;
    }
    if (path.endsWith('/logout')) {
      authenticated = false;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (!authenticated) {
      await route.fulfill({ status: 401, json: { error: 'Sign in.' } });
      return;
    }
    requests++;
    await route.fulfill({
      json: {
        updatedAt: timestamp,
        website: {
          start: today,
          end: today,
          startedAt: timestamp,
          lastReceivedAt: timestamp,
          viewsToday: 7,
          views7d: 7,
          views30d: 7,
          daily: [{ date: today, views: 7 }],
          pages: [{ path: '/', views: 7 }],
          referrers: [{ source: 'GitHub', views: 7 }],
        },
        packages: [
          {
            package: '@fluritheme/spider',
            status: 'pending',
            checkedAt: timestamp,
            start: null,
            end: null,
            downloads30d: null,
            downloads7d: null,
            latestDay: null,
            daily: [],
          },
        ],
      },
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/dashboard/');
  await expect(page.getByRole('heading', { name: 'Behind the web.' })).toBeVisible();
  await page.getByLabel('Dashboard access key', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Open dashboard' }).click();
  await expect(page.getByRole('status')).toContainText('Invalid dashboard access key.');
  await page.getByLabel('Dashboard access key', { exact: true }).fill('test-operator-key');
  await page.getByRole('button', { name: 'Open dashboard' }).click();
  await expect(
    page.getByRole('heading', { name: 'A little spider. A growing web.' }),
  ).toBeVisible();
  await expect(page.getByText('Stats pending', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Export JSON' })).toHaveAttribute(
    'href',
    '/api/dashboard/export',
  );
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => requests).toBe(2);
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  await page.getByRole('link', { name: 'Open GitHub traffic report' }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Behind the web.' })).toBeVisible();
  await expect(page.locator('#growth')).toBeEmpty();
  expect(errors).toEqual([]);
});
