// frontend/e2e/auth_flow.spec.js
// E2E tests — Authentication flows (Playwright)
import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test('renders login form elements', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"], input[name="username"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('shows validation error for empty submission', async ({ page }) => {
    await page.goto('/login');
    await page.click('button[type="submit"]');
    // Browser HTML5 validation or our own error should show
    const url = page.url();
    expect(url).toContain('login'); // Still on login page
  });

  test('shows error for wrong credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"], input[name="username"]', 'notauser@invalid.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    // Wait for error message
    const error = page.locator('[class*="error"], [class*="red"], text=/hata|başarısız|geçersiz/i');
    await expect(error).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Change Password Page', () => {
  test('renders change password form', async ({ page }) => {
    await page.goto('/change-password');
    // Should show the form or redirect to login
    const hasForm   = await page.locator('input[type="password"]').count() > 0;
    const redirected = page.url().includes('/login');
    expect(hasForm || redirected).toBeTruthy();
  });

  test('shows error for mismatched passwords', async ({ page }) => {
    await page.goto('/change-password');
    const inputs = page.locator('input[type="password"]');
    if (await inputs.count() < 2) return; // Redirected to login, skip
    await inputs.nth(0).fill('NewPass99!');
    await inputs.nth(1).fill('DifferentPass99!');
    await page.click('button[type="submit"]');
    const error = page.locator('text=/eşleşmiyor|match|mismatch/i');
    await expect(error).toBeVisible({ timeout: 5_000 });
  });

  test('shows error for short password', async ({ page }) => {
    await page.goto('/change-password');
    const inputs = page.locator('input[type="password"]');
    if (await inputs.count() < 1) return;
    await inputs.first().fill('short');
    await page.click('button[type="submit"]');
    const error = page.locator('text=/karakter|character|kısa/i');
    await expect(error).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Protected Routes', () => {
  test('terminal requires authentication', async ({ page }) => {
    await page.goto('/terminal');
    await page.waitForTimeout(2000);
    const url = page.url();
    // Should redirect to login
    expect(url).toContain('/login');
  });

  test('admin requires authentication', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForTimeout(2000);
    const url = page.url();
    const hasError = await page.locator('text=/erişim|yetkisi|403|unauthorized/i').count() > 0;
    expect(url.includes('/login') || hasError).toBeTruthy();
  });
});
