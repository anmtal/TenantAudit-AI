const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test.describe('LeaseAlign AI Real Audit Report Scraper', () => {

  test('should run a real audit using local server and print results', async ({ page }) => {
    test.setTimeout(180_000); // 3 minutes

    // Pre-seed localStorage to force hosted mode with mock credits
    await page.addInitScript(() => {
      localStorage.setItem('ta_hosted_credits', '100');
      localStorage.setItem('ta_byok_credits', '0');
      localStorage.setItem('ta_connection_mode', 'hosted');
      localStorage.setItem('ta_user_plan_type', 'hosted');
    });

    // Mock /api/config to return empty keys to force local/offline fallback mode
    await page.route('**/api/config**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ supabaseUrl: '', supabaseAnonKey: '', sentryDsn: '' }),
      });
    });

    // Go to the app
    await page.goto('/');
    await page.waitForSelector('body[data-initialized="true"]', { timeout: 15000 });

    // Login
    await page.click('#home-login-btn');
    await expect(page.locator('#login-view')).toBeVisible({ timeout: 5000 });
    await page.fill('#login-email', 'test@example.com');
    await page.fill('#login-password', 'password');
    await page.click('#login-submit-btn');
    await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 5000 });

    // Upload files
    const leaseInput = page.locator('#lease-file-input');
    const estoppelInput = page.locator('#estoppel-file-input');

    const leasePath = path.resolve(__dirname, '../complex_lease_agreement.pdf');
    const estoppelPath = path.resolve(__dirname, '../complex_estoppel_certificate.pdf');

    await leaseInput.setInputFiles(leasePath);
    await estoppelInput.setInputFiles(estoppelPath);

    await expect(page.locator('#lease-file-info')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#estoppel-file-info')).toBeVisible({ timeout: 5000 });

    // Run audit
    const startAuditBtn = page.locator('#start-audit-btn');
    await expect(startAuditBtn).toBeEnabled({ timeout: 5000 });
    await startAuditBtn.click();

    // Accept disclaimer
    await expect(page.locator('#disclaimer-modal')).toHaveClass(/active/, { timeout: 5000 });
    await page.click('#disclaimer-agree-checkbox');
    await page.click('#disclaimer-proceed-btn');

    // Wait for results
    await expect(page.locator('#results-panel')).toBeVisible({ timeout: 120000 });

    // Dismiss any alert modal
    const alertOverlay = page.locator('.custom-alert-overlay.active');
    if (await alertOverlay.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.click('.custom-alert-btn');
      await page.waitForSelector('.custom-alert-overlay.active', { state: 'detached', timeout: 5000 }).catch(() => {});
    }

    // Scrape the score
    const scoreVal = page.locator('#score-val');
    const scoreText = await scoreVal.textContent();
    const redFlagsVal = page.locator('#kpi-red-flags');
    const redFlagsText = await redFlagsVal.textContent();

    console.log(`\n=== REAL AUDIT SCORES ===`);
    console.log(`Match Score: ${scoreText}`);
    console.log(`Red Flags: ${redFlagsText}`);

    // Scrape table rows
    const rows = await page.locator('#audit-results-tbody tr').all();
    const results = [];
    for (const row of rows) {
      const cells = await row.locator('td').all();
      const field = await cells[0].textContent();
      const leaseVal = await cells[1].textContent();
      const estoppelVal = await cells[2].textContent();
      const comparison = await cells[3].textContent();
      results.push({
        field: field.trim(),
        leaseVal: leaseVal.trim(),
        estoppelVal: estoppelVal.trim(),
        comparison: comparison.trim()
      });
    }

    console.log(`\n=== COMPARISON TABLE ===`);
    console.table(results);

    // Save to a text file
    fs.writeFileSync(
      path.resolve(__dirname, '../real_audit_output.json'),
      JSON.stringify({ score: scoreText, redFlags: redFlagsText, results }, null, 2)
    );
    console.log(`Saved report to real_audit_output.json`);
  });

});
