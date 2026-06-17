import { test, expect } from '@playwright/test';

test.describe('PivotRadar Strategy To Terminal Flow', () => {
  test('should allow user to configure strategy and navigate to terminal', async ({ page }) => {
    // Navigate to Strategy Page
    await page.goto('/strategy');
    
    // Initial state check
    await expect(page.locator('h1')).toContainText('Algoritmik Yapılandırma');
    
    // Select a profile (e.g., Scalper)
    const scalperButton = page.getByRole('button', { name: /Scalper \(M15\)/i });
    await scalperButton.click();
    
    // Verify profile is active
    await expect(scalperButton).toContainText('AKTİF');
    
    // Toggle Expert Mode
    const expertToggle = page.locator('button').filter({ hasText: 'Gelişmiş Mod' });
    await expertToggle.click();
    
    // Update Volume Threshold
    const volumeSlider = page.locator('input[type="range"]').nth(0);
    await volumeSlider.fill('1000000');
    
    // Click Save and Start (Big Button)
    const saveButton = page.getByRole('button', { name: /STRATEJİYİ KAYDET VE ANALİZİ BAŞLAT/i });
    await saveButton.click();
    
    // Verify Toast Notification
    await expect(page.locator('text=STRATEJİ AKTİFLEŞTİRİLDİ')).toBeVisible();
    
    // Wait for navigation to Terminal
    await page.waitForURL('/terminal');
    
    // Verify Dashboard state
    await expect(page.locator('h1')).toContainText('Piyasa Analiz Paneli');
    
    // Verify Sidebar navigation is correct
    const sidebarDashboard = page.locator('aside a[href="/terminal"]');
    await expect(sidebarDashboard).toHaveClass(/bg-primary/);
  });

  test('should handle responsive layout (mobile view)', async ({ page }) => {
    // Switch to mobile viewport (Handled by project config, but explicit here for clarity)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/terminal');
    
    // Sidebar should be hidden by default on mobile
    await expect(page.locator('aside')).toHaveClass(/hidden/);
    
    // Topbar menu button should be visible
    const menuButton = page.locator('header button').first();
    await expect(menuButton).toBeVisible();
    
    // Open Sidebar
    await menuButton.click();
    await expect(page.locator('aside')).toBeVisible();
    
    // Check if table is converted to cards (should not have <table> element visible/styled as mobile)
    const desktopTable = page.locator('table');
    await expect(desktopTable).not.toBeVisible();
    
    // Cards should be visible instead
    await expect(page.locator('.md\\:hidden.divide-y')).toBeVisible();
  });
});
