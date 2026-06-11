const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('LeaseAlign AI E2E Audit Workflow', () => {

  test('should log in locally, upload complex lease & estoppel PDFs, run mock audit, and export reports', async ({ page }) => {
    // Increase overall test timeout for the multi-step flow
    test.setTimeout(90_000);

    // === PRE-SEED localStorage BEFORE page scripts run ===
    // This ensures `initializeAuthFallback()` reads non-zero credits into the in-memory variables
    // before any UI rendering. Without this, hostedCredits=0 in-memory blocks the audit.
    await page.addInitScript(() => {
      localStorage.setItem('ta_hosted_credits', '100');
      localStorage.setItem('ta_byok_credits', '0');
      localStorage.setItem('ta_connection_mode', 'hosted');
      localStorage.setItem('ta_user_plan_type', 'hosted');
    });

    // 1. Mock the public config endpoint to return empty Supabase keys (forces local/offline fallback mode)
    await page.route('**/api/config**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ supabaseUrl: '', supabaseAnonKey: '' }),
      });
    });

    // 2. Mock /api/audit calls — the app sends lease and estoppel documents to this endpoint separately
    await page.route('**/api/audit', async route => {
      const request = route.request();
      let postData;
      try {
        postData = JSON.parse(request.postData());
      } catch {
        postData = {};
      }

      // The app calls /api/audit multiple times:
      //   - Pass 1 routing calls (for documents >5 pages) with systemPromptOverride
      //   - Pass 2 extraction calls for lease and estoppel
      if (postData.systemPromptOverride && postData.systemPromptOverride.includes('routing')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ pageNumbers: [1, 2, 3] })
        });
      } else if (postData.docType === 'lease') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tenantName: { value: "Starbucks Corporation", quote: "Tenant: Starbucks Corporation" },
            suiteNumber: { value: "Suite 100", quote: "Suite 100 at the Mall" },
            premisesSf: { value: "2,200 SF", quote: "premises measuring approximately 2,200 square feet" },
            monthlyRent: { value: "$12,500.00", quote: "monthly base rent of $12,500.00" },
            expiryDate: { value: "11/30/2031", quote: "expiry date of November 30, 2031" },
            securityDeposit: { value: "$25,000.00", quote: "Security deposit of $25,000" },
            renewalOptions: { value: "Two 5-year options", quote: "Tenant shall have two options to renew for 5 years each" },
            camShare: { value: "$3.50/SF", quote: "CAM charges at $3.50 per square foot" },
            guarantorName: { value: "Not Mentioned", quote: "No citation found." },
            prepaidRent: { value: "Not Mentioned", quote: "No citation found." },
            landlordDefault: { value: "No default", quote: "No landlord default noted." },
            tiAllowance: { value: "$50.00/SF", quote: "Landlord shall provide a TI Allowance of $50.00 per SF" },
            coTenancy: { value: "Required 80% occupancy", quote: "Co-tenancy requires 80% occupancy of the shopping center" },
            terminationRight: { value: "One-time option at Year 5", quote: "Tenant may terminate at end of Lease Year 5" },
            sndaStatus: { value: "Required within 30 days", quote: "SNDA must be executed within 30 days of lease execution" },
            permittedUse: { value: "Retail coffee shop", quote: "Permitted use is retail coffee shop" }
          })
        });
      } else if (postData.docType === 'estoppel') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tenantName: { value: "Starbucks Corporation", quote: "Starbucks Corp. hereby certifies..." },
            suiteNumber: { value: "Suite 100", quote: "Suite 100" },
            premisesSf: { value: "2,200 SF", quote: "Premises size: 2,200 SF" },
            monthlyRent: { value: "$12,000.00", quote: "Current monthly rent is $12,000.00" },
            expiryDate: { value: "11/30/2031", quote: "Lease expires on November 30, 2031" },
            securityDeposit: { value: "$25,000.00", quote: "Security deposit held: $25,000" },
            renewalOptions: { value: "Two 5-year options", quote: "Two renewal options remain" },
            camShare: { value: "$3.50/SF", quote: "CAM at $3.50/SF" },
            guarantorName: { value: "Not Mentioned", quote: "No citation found." },
            prepaidRent: { value: "Not Mentioned", quote: "No citation found." },
            landlordDefault: { value: "No default", quote: "No landlord defaults." },
            tiAllowance: { value: "$50.00/SF", quote: "TI Allowance of $50.00/SF has been paid in full" },
            coTenancy: { value: "Required 80% occupancy", quote: "Co-tenancy active" },
            terminationRight: { value: "One-time option at Year 5", quote: "One termination option exists" },
            sndaStatus: { value: "Required within 30 days", quote: "SNDA active" },
            permittedUse: { value: "Retail coffee shop", quote: "Coffee shop permitted" }
          })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ pageNumbers: [1, 2, 3] })
        });
      }
    });

    // 3. Mock /api/compare — semantic AI verification overlay
    await page.route('**/api/compare', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tenantName: { status: "match", reason: "Names match exactly." },
          suiteNumber: { status: "match", reason: "Suite numbers match." },
          premisesSf: { status: "match", reason: "Square footage matches." },
          monthlyRent: { status: "mismatch", reason: "Lease states $12,500/mo but estoppel confirms $12,000/mo." },
          expiryDate: { status: "match", reason: "Dates match." },
          securityDeposit: { status: "match", reason: "Deposit amounts match." },
          renewalOptions: { status: "match", reason: "Renewal options match." },
          camShare: { status: "match", reason: "CAM charges match." },
          guarantorName: { status: "warning", reason: "Neither document mentions a guarantor." },
          prepaidRent: { status: "warning", reason: "Neither document mentions prepaid rent." },
          landlordDefault: { status: "match", reason: "No defaults in either document." },
          tiAllowance: { status: "match", reason: "TI allowance terms match." },
          coTenancy: { status: "match", reason: "Co-tenancy clauses match." },
          terminationRight: { status: "match", reason: "Termination options match." },
          sndaStatus: { status: "match", reason: "SNDA status matches." },
          permittedUse: { status: "match", reason: "Permitted use matches." }
        })
      });
    });

    // Helper: dismiss custom alert modal if visible
    // The app overrides window.alert with a custom DOM overlay (.custom-alert-overlay.active)
    // containing an OK button (.custom-alert-btn). This blocks UI interaction until dismissed.
    async function dismissCustomAlert() {
      const alertOverlay = page.locator('.custom-alert-overlay.active');
      if (await alertOverlay.isVisible({ timeout: 2000 }).catch(() => false)) {
        await page.click('.custom-alert-btn');
        // Wait for overlay to close
        await page.waitForSelector('.custom-alert-overlay.active', { state: 'detached', timeout: 3000 }).catch(() => {});
        // Small delay to let UI settle
        await page.waitForTimeout(300);
      }
    }

    // Capture console for debugging
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`[Browser ${msg.type()}] ${msg.text()}`);
      }
    });
    page.on('pageerror', err => console.log(`[PageError] ${err.message}`));

    // ============================
    //  STEP 1: Load Home Page
    // ============================
    await page.goto('/');
    await page.waitForSelector('body[data-initialized="true"]', { timeout: 15000 });
    await expect(page.locator('h1').first()).toContainText('LeaseAlign');

    // ============================
    //  STEP 2: Login
    // ============================
    await page.click('#home-login-btn');
    await expect(page.locator('#login-view')).toBeVisible({ timeout: 5000 });

    await page.fill('#login-email', 'test@example.com');
    await page.fill('#login-password', 'password');
    await page.click('#login-submit-btn');

    await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 5000 });

    // ============================
    //  STEP 3: Upload Documents
    // ============================
    const leaseInput = page.locator('#lease-file-input');
    const estoppelInput = page.locator('#estoppel-file-input');

    const leasePath = path.resolve(__dirname, '../complex_lease_agreement.pdf');
    const estoppelPath = path.resolve(__dirname, '../complex_estoppel_certificate.pdf');

    await leaseInput.setInputFiles(leasePath);
    await estoppelInput.setInputFiles(estoppelPath);

    await expect(page.locator('#lease-file-info')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#estoppel-file-info')).toBeVisible({ timeout: 3000 });

    // ============================
    //  STEP 4: Run Audit
    // ============================
    const startAuditBtn = page.locator('#start-audit-btn');
    await expect(startAuditBtn).toBeEnabled({ timeout: 3000 });
    await startAuditBtn.click();

    // Accept disclaimer
    await expect(page.locator('#disclaimer-modal')).toHaveClass(/active/, { timeout: 3000 });
    await page.click('#disclaimer-agree-checkbox');
    await page.click('#disclaimer-proceed-btn');

    // Wait for results panel to become visible
    await expect(page.locator('#results-panel')).toBeVisible({ timeout: 45000 });

    // Dismiss any custom alert modals that appear after audit completion
    // (e.g. "🎉 Audit completed successfully! Deducted 3 audit credits.")
    await dismissCustomAlert();

    // ============================
    //  STEP 5: Verify KPI Display
    // ============================
    const scoreVal = page.locator('#score-val');
    await expect(scoreVal).toBeVisible({ timeout: 5000 });
    const scoreText = await scoreVal.textContent();
    expect(scoreText).toMatch(/\d+%/);

    const redFlagsVal = page.locator('#kpi-red-flags');
    await expect(redFlagsVal).toBeVisible();
    const redFlagsText = await redFlagsVal.textContent();
    expect(parseInt(redFlagsText, 10)).toBeGreaterThanOrEqual(0);

    // ============================
    //  STEP 6: Verify Comparison Matrix
    // ============================
    const tableRows = page.locator('#audit-results-tbody tr');
    await expect(tableRows).toHaveCount(16, { timeout: 5000 });

    // Monthly Rent should be a mismatch (Lease=$12,500 vs Estoppel=$12,000)
    const rentRow = page.locator('#audit-results-tbody tr', { hasText: 'Monthly Rent' });
    await expect(rentRow).toBeVisible();
    await expect(rentRow.locator('.status-pill')).toContainText('Mismatch');

    // ============================
    //  STEP 7: Verify PDF Download (jsPDF)
    // ============================
    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.click('#export-pdf-btn')
    ]);
    // Dismiss any loader/alert that appears during PDF generation
    await dismissCustomAlert();
    expect(pdfDownload.suggestedFilename()).toContain('LeaseAlign_AI_Report');

    // ============================
    //  STEP 8: Verify CSV Download
    // ============================
    const [csvDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.click('#export-csv-btn')
    ]);
    expect(csvDownload.suggestedFilename()).toContain('LeaseAlign_due_diligence');

    console.log('[TEST PASSED] Full E2E audit workflow completed successfully.');
  });

});
