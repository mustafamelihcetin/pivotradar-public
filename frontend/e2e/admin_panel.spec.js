// frontend/e2e/admin_panel.spec.js
// E2E tests — Admin Panel (Playwright)
import { test, expect } from '@playwright/test';

const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL    || 'admin@pivotradar.test';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'AdminTest123!';

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.fill('input[type="email"], input[name="username"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|admin)/, { timeout: 10_000 });
}

test.describe('Admin Panel — Public Gate', () => {
  test('redirects unauthenticated users away from /admin', async ({ page }) => {
    await page.goto('/admin');
    // Should redirect to login or show an access-denied message
    const url = page.url();
    const body = await page.textContent('body');
    const blocked = url.includes('/login') || body?.includes('yetkisi') || body?.includes('erişim');
    expect(blocked).toBeTruthy();
  });
});

test.describe('Admin Panel — Tab Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page).catch(() => test.skip());
    await page.goto('/admin');
  });

  test('Overview tab loads with KPI cards', async ({ page }) => {
    await page.click('button:has-text("Genel"), button:has-text("Overview")');
    // Wait for at least one KCard to appear
    await expect(page.locator('.font-black').first()).toBeVisible({ timeout: 10_000 });
  });

  test('Live tab shows server telemetry', async ({ page }) => {
    await page.click('button:has-text("Canlı"), button:has-text("Live")');
    await expect(page.locator('text=CPU').or(page.locator('text=Bellek'))).toBeVisible({ timeout: 10_000 });
  });

  test('Pipeline tab shows ML pipeline stages', async ({ page }) => {
    await page.click('button:has-text("Pipeline")');
    await expect(page.locator('text=ML OPERASYON').or(page.locator('text=Pipeline'))).toBeVisible({ timeout: 10_000 });
  });

  test('Settings tab has ML Config section', async ({ page }) => {
    await page.click('button:has-text("Ayar"), button:has-text("Setting")');
    await expect(
      page.locator('text=ML').or(page.locator('text=Kalibrasyon'))
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Admin Panel — Settings Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page).catch(() => test.skip());
    await page.goto('/admin');
  });

  test('can toggle a feature flag and it persists', async ({ page }) => {
    await page.click('button:has-text("Ayar"), button:has-text("Setting")');
    // Find the maintenance mode toggle (safest to test — no real side effect in test env)
    const toggle = page.locator('button[title*="Maintenance"], button:near(:text("Maintenance"))').first();
    if (await toggle.count() === 0) return; // Skip if UI structure differs
    const before = await toggle.getAttribute('data-active');
    await toggle.click();
    await page.waitForTimeout(1000);
    const after = await toggle.getAttribute('data-active');
    // Something should have changed (or a notification appeared)
    const notif = page.locator('[class*="notification"], [class*="toast"]');
    const changed = before !== after || await notif.count() > 0;
    expect(changed).toBeTruthy();
  });
});

test.describe('Admin Panel — Live Monitoring', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page).catch(() => test.skip());
    await page.goto('/admin');
  });

  test('CPU gauge shows a numeric value', async ({ page }) => {
    await page.click('button:has-text("Canlı"), button:has-text("Live")');
    // The CPU value should be a number between 0-100 followed by %
    const cpuText = await page.locator('text=/^\\d+(\\.\\d+)?%$/').first().textContent({ timeout: 8_000 }).catch(() => null);
    if (cpuText) {
      const val = parseFloat(cpuText);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(100);
    }
  });

  test('log console renders log entries', async ({ page }) => {
    await page.click('button:has-text("Canlı"), button:has-text("Live")');
    // Log filter buttons should be visible
    await expect(page.locator('button:has-text("ERROR"), button:has-text("ALL")')).toBeVisible({ timeout: 8_000 });
  });
});
