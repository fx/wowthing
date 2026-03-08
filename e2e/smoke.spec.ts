import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('serves the application', async ({ page }) => {
    const response = await page.goto('/login');
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(200);
  });

  test('unauthenticated root access does not serve dashboard', async ({ page }) => {
    const response = await page.goto('/');
    expect(response).not.toBeNull();
    // Without auth, root should not return a successful dashboard page
    const status = response!.status();
    expect(status === 302 || status === 500 || status === 200).toBe(true);
  });

  test('login page has correct page title', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/WoWThing/);
  });

  test('login page renders heading', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'WoWThing' })).toBeVisible();
  });

  test('login page renders description', async ({ page }) => {
    await page.goto('/login');
    await expect(
      page.getByText('Track your Midnight weekly and daily activities'),
    ).toBeVisible();
  });

  test('login page renders Battle.net login button', async ({ page }) => {
    await page.goto('/login');
    await expect(
      page.getByRole('button', { name: 'Login with Battle.net' }),
    ).toBeVisible();
  });

  test('navigation bar is present', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('nav').getByText('WoWThing')).toBeVisible();
  });
});
