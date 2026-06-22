const { test, expect } = require('@playwright/test');

test.describe('LeaseAlign AI UX Enhancements & Hardening', () => {

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      console.log(`[Browser ${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
      console.error(`[PageError] ${err.message}`);
    });

    // Mock REST endpoints to keep tests fully offline/local
    await page.route('**/rest/v1/team_invitations**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/rest/v1/audits**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
  });

  test('should verify removal of Company field and password strength validations', async ({ page }) => {
    // Mock config
    await page.route('**/api/config**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ supabaseUrl: 'https://mock.supabase.co', supabaseAnonKey: 'mock-key' }),
      });
    });

    await page.goto('/');
    await page.waitForSelector('body[data-initialized="true"]', { timeout: 15000 });

    // Go to login view
    await page.click('#home-login-btn');
    await expect(page.locator('#login-view')).toBeVisible();

    // Toggle to Sign Up mode
    await page.click('#auth-toggle-link');
    await expect(page.locator('#login-title')).toHaveText('Create an Account');

    // 1. Verify Company field is NOT visible or present
    await expect(page.locator('#register-company')).not.toBeAttached();
    await expect(page.locator('label:has-text("Company")')).not.toBeVisible();

    // 2. Verify password strength meter displays on input in sign-up mode
    const passwordInput = page.locator('#login-password');
    const strengthContainer = page.locator('#password-strength-container');
    const strengthBar = page.locator('#password-strength-bar');
    const strengthLabel = page.locator('#password-strength-label');

    await expect(strengthContainer).not.toBeVisible();
    await passwordInput.fill('123');
    await expect(strengthContainer).toBeVisible();
    await expect(strengthLabel).toHaveText('Weak Password');
    
    // Wait for transition to settle
    await page.waitForTimeout(400);
    const weakBgColor = await strengthBar.evaluate(el => window.getComputedStyle(el).backgroundColor);
    console.log("WEAK BG COLOR:", weakBgColor);
    expect(weakBgColor).toBe('rgb(255, 77, 77)'); // #ff4d4d

    // Fill a strong password
    await passwordInput.fill('Abc1234!');
    await expect(strengthLabel).toHaveText('Strong Password');
    
    // Wait for transition to settle
    await page.waitForTimeout(400);
    const strongBgColor = await strengthBar.evaluate(el => window.getComputedStyle(el).backgroundColor);
    console.log("STRONG BG COLOR:", strongBgColor);
    
    // 3. Verify that registering with weak password fails client-side validation
    await passwordInput.fill('weakpass');
    await page.fill('#register-first-name', 'John');
    await page.fill('#register-last-name', 'Doe');
    await page.fill('#register-phone', '+1234567890');
    await page.fill('#login-email', 'john.doe@example.com');
    await page.check('#register-tos-checkbox');

    // We can monitor toast creation
    await page.click('#login-submit-btn');
    // Toast container should show weak password error
    const toast = page.locator('.toast.error');
    await expect(toast).toBeVisible({ timeout: 5000 });
    await expect(toast.locator('.toast-message')).toContainText('Password must be at least 8 characters long and contain lowercase, uppercase, numbers, and symbols.');
  });

  test('should verify payment warning banner when subscription is past due', async ({ page }) => {
    // 1. Mock config
    await page.route('**/api/config**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ supabaseUrl: 'https://mock.supabase.co', supabaseAnonKey: 'mock-key' }),
      });
    });

    // 2. Mock GET **/auth/v1/user
    await page.route('**/auth/v1/user**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-user-id',
          email: 'pastdue@example.com',
          user_metadata: { plan_type: 'hosted' }
        })
      });
    });

    // 3. Mock POST **/auth/v1/token
    await page.route('**/auth/v1/token**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user: {
            id: 'mock-user-id',
            email: 'pastdue@example.com',
            user_metadata: { plan_type: 'hosted' }
          }
        })
      });
    });

    // 4. Mock GET **/rest/v1/profiles
    await page.route('**/rest/v1/profiles**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          credits: 10,
          byok_credits: 0,
          plan_tier: null,
          phone: '+14155552671',
          teams: {
            audit_credits: 10,
            plan_tier: 'past_due'
          }
        })
      });
    });

    // 5. Mock POST **/rest/v1/rpc/register_active_session
    await page.route('**/rest/v1/rpc/register_active_session**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(true)
      });
    });

    // Go to landing and login
    await page.goto('/');
    await page.waitForSelector('body[data-initialized="true"]', { timeout: 15000 });

    await page.click('#home-login-btn');
    await page.fill('#login-email', 'pastdue@example.com');
    await page.fill('#login-password', 'password');
    await page.click('#login-submit-btn');
    await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 10000 });

    // Verify payment warning banner is visible
    const warningBanner = page.locator('#payment-warning-banner');
    await expect(warningBanner).toBeVisible();

    // Verify clicking billing trigger redirects to pricing section
    await page.click('#warning-banner-billing-btn');
    await expect(page.locator('#pricing-section')).toBeInViewport();
  });

  test('should verify live demo redirect directly to dashboard in sandbox mode, loading sample audit manually, and credit display as Guest Sandbox', async ({ page }) => {
    // 1. Mock config
    await page.route('**/api/config**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ supabaseUrl: 'https://mock.supabase.co', supabaseAnonKey: 'mock-key' }),
      });
    });

    // Mock /api/audit calls — returns the mock lease and estoppel data for samples
    await page.route('**/api/audit', async route => {
      const request = route.request();
      let postData;
      try {
        postData = JSON.parse(request.postData());
      } catch {
        postData = {};
      }

      if (postData.docType === 'lease') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'completed',
            data: {
              tenantName: { value: "APEX COWORKING SOLUTIONS INTERNATIONAL INC.", quote: "LEASE AGREEMENT..." },
              suiteNumber: { value: "Suite 4200, 42nd Floor", quote: "Suite 4200..." },
              premisesSf: { value: "14,500 rentable square feet", quote: "14,500 SF..." },
              monthlyRent: { value: "$35,000.00 (Months 1–12), escalating at 3.50% per annum to $47,701.41 (Months 109–120)", quote: "Base Rent shall be..." },
              expiryDate: { value: "August 31, 2031", quote: "expiration date..." },
              securityDeposit: { value: "$105,000.00 (three months of initial Base Rent)", quote: "Security Deposit..." },
              renewalOptions: { value: "Two (2) renewal options...", quote: "Renewal options..." },
              camShare: { value: "4.85% pro-rata share...", quote: "CAM share..." },
              guarantorName: { value: "APEX GLOBAL ENTERPRISES HOLDINGS LLC", quote: "Guarantor..." },
              prepaidRent: { value: "$35,000.00...", quote: "Prepaid rent..." },
              landlordDefault: { value: "Landlord obligated...", quote: "Landlord shall maintain..." },
              tiAllowance: { value: "Not Mentioned", quote: "No citation found." },
              coTenancy: { value: "Not Mentioned", quote: "No citation found." },
              terminationRight: { value: "Not Mentioned", quote: "No citation found." },
              sndaStatus: { value: "Not Mentioned", quote: "No citation found." },
              permittedUse: { value: "Not Mentioned", quote: "No citation found." }
            }
          })
        });
      } else if (postData.docType === 'estoppel') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'completed',
            data: {
              tenantName: { value: "Apex Coworking Solutions Int'l, Inc.", quote: "Tenant name is..." },
              suiteNumber: { value: "Suite 4200", quote: "occupying Suite..." },
              premisesSf: { value: "14,500 SF", quote: "premises measuring..." },
              monthlyRent: { value: "$41,569.02 per month", quote: "Current monthly rent..." },
              expiryDate: { value: "September 30, 2031", quote: "Lease expiration..." },
              securityDeposit: { value: "$70,000.00, no portion applied", quote: "Security deposit..." },
              renewalOptions: { value: "One (1) renewal option...", quote: "Tenant has..." },
              camShare: { value: "4.85% pro-rata share...", quote: "CAM share..." },
              guarantorName: { value: "Apex Global Enterprises Holdings LLC", quote: "Guarantor..." },
              prepaidRent: { value: "No base rent prepaid...", quote: "No prepaid rent..." },
              landlordDefault: { value: "Landlord is currently in default...", quote: "Landlord is in default..." },
              tiAllowance: { value: "Not Mentioned", quote: "No citation found." },
              coTenancy: { value: "Not Mentioned", quote: "No citation found." },
              terminationRight: { value: "Not Mentioned", quote: "No citation found." },
              sndaStatus: { value: "Not Mentioned", quote: "No citation found." },
              permittedUse: { value: "Not Mentioned", quote: "No citation found." }
            }
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

    // Mock /api/compare
    await page.route('**/api/compare', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'completed',
          data: {
            tenantName: { status: "match", reason: "Tenant names match." },
            suiteNumber: { status: "match", reason: "Suite numbers align." },
            premisesSf: { status: "match", reason: "Premises sizes are identical." },
            monthlyRent: { status: "warning", reason: "The Estoppel monthly rent matches a scheduled rent progression step." },
            expiryDate: { status: "mismatch", reason: "Discrepancy: Expiration dates." },
            securityDeposit: { status: "mismatch", reason: "Discrepancy: Security deposit." },
            renewalOptions: { status: "mismatch", reason: "Discrepancy: Renewal options." },
            camShare: { status: "mismatch", reason: "Discrepancy: CAM cap." },
            guarantorName: { status: "match", reason: "Guarantor names match." },
            prepaidRent: { status: "mismatch", reason: "Discrepancy: Prepaid rent." },
            landlordDefault: { status: "mismatch", reason: "Discrepancy: Landlord default." },
            tiAllowance: { status: "warning", reason: "Not mentioned." },
            coTenancy: { status: "warning", reason: "Not mentioned." },
            terminationRight: { status: "warning", reason: "Not mentioned." },
            sndaStatus: { status: "warning", reason: "Not mentioned." },
            permittedUse: { status: "warning", reason: "Not mentioned." }
          }
        })
      });
    });

    await page.goto('/');
    await page.waitForSelector('body[data-initialized="true"]', { timeout: 15000 });

    // Click Try Live Demo when not logged in
    await page.click('#hero-view-demo-btn');
    
    // Verify it takes us to dashboard directly (guest sandbox mode)
    await expect(page.locator('#dashboard-view')).toBeVisible();

    // Verify credits pill is visible and shows Guest Sandbox text
    await expect(page.locator('#credits-topup-trigger')).toBeVisible();
    await expect(page.locator('#credits-count-display')).toHaveText('Guest');

    // Click load samples button
    await page.click('#load-samples-btn');
    
    // Wait for the files state to reflect selection
    await page.waitForSelector('#lease-file-info:has-text("sample_lease.pdf")');
    await page.waitForSelector('#estoppel-file-info:has-text("sample_estoppel.pdf")');

    // Click start audit button
    await page.click('#start-audit-btn');

    // Accept disclaimer
    await expect(page.locator('#disclaimer-modal')).toHaveClass(/active/, { timeout: 3000 });
    await page.click('#disclaimer-agree-checkbox');
    await page.click('#disclaimer-proceed-btn');

    // Wait for results panel and check text
    await expect(page.locator('#results-panel')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#meta-tenant-name')).toHaveText('APEX COWORKING SOLUTIONS INTERNATIONAL INC.');
  });

  test('should require a valid x-transaction-id header on /api/audit and /api/compare', async ({ request }) => {
    // 1. /api/audit (when not a routing request) should return 400 Bad Request if x-transaction-id is missing
    const auditResNoTx = await request.post('/api/audit', {
      data: {
        text: 'Lease details...',
        docType: 'lease',
        isRoutingRequest: false
      }
    });
    expect(auditResNoTx.status()).toBe(400);
    const auditNoTxJson = await auditResNoTx.json();
    expect(auditNoTxJson.error).toContain('Missing or invalid transaction ID');

    // 2. /api/audit (when not a routing request) should return 400 Bad Request if x-transaction-id is invalid UUID
    const auditResInvalidTx = await request.post('/api/audit', {
      headers: {
        'x-transaction-id': 'invalid-uuid-123'
      },
      data: {
        text: 'Lease details...',
        docType: 'lease',
        isRoutingRequest: false
      }
    });
    expect(auditResInvalidTx.status()).toBe(400);

    // 3. /api/compare should return 400 Bad Request if x-transaction-id is missing
    const compareResNoTx = await request.post('/api/compare', {
      data: {
        leaseJson: {},
        estoppelJson: {}
      }
    });
    expect(compareResNoTx.status()).toBe(400);
    const compareNoTxJson = await compareResNoTx.json();
    expect(compareNoTxJson.error).toContain('Missing or invalid transaction ID');
  });

  test('should verify guest isSampleAudit bypass security boundary', async ({ request }) => {
    // 1. A request claiming to be sample audit but containing non-sample text should be rejected as Unauthorized (401)
    const bypassRes = await request.post('/api/audit', {
      data: {
        isSampleAudit: true,
        text: 'This is a completely real non-sample lease document text for ACME Corp.',
        docType: 'lease',
        isRoutingRequest: false
      }
    });
    expect(bypassRes.status()).toBe(401);
    const bypassJson = await bypassRes.json();
    expect(bypassJson.error).toContain('Unauthorized');

    // 2. A valid sample audit routing request should bypass and succeed (200)
    const validSampleRes = await request.post('/api/audit', {
      data: {
        isSampleAudit: true,
        isRoutingRequest: true,
        docType: 'lease'
      }
    });
    expect(validSampleRes.status()).toBe(200);
    const sampleJson = await validSampleRes.json();
    expect(sampleJson.pageNumbers).toBeDefined();
  });

  test('should complete E2E checkouts for subscription, annual, and one-time plans', async ({ request }) => {
    const userId = '88888888-4444-4444-4444-121212121212';
    
    // 1. E2E Checkout for Starter Monthly (Subscription)
    const createSubRes = await request.post('/api/create-checkout-session', {
      data: {
        planType: 'hosted',
        packageName: 'Starter Monthly',
        userId: userId
      }
    });
    expect(createSubRes.status()).toBe(200);
    const subJson = await createSubRes.json();
    expect(subJson.id).toBeDefined();
    expect(subJson.url).toContain('checkout_success=true');

    const verifySubRes = await request.get(`/api/verify-checkout-session?session_id=${subJson.id}`);
    expect(verifySubRes.status()).toBe(200);
    const verifySubJson = await verifySubRes.json();
    expect(verifySubJson.success).toBe(true);

    // 2. E2E Checkout for Starter Annual (Annual subscription)
    const createAnnualRes = await request.post('/api/create-checkout-session', {
      data: {
        planType: 'hosted',
        packageName: 'Starter Annual',
        userId: userId
      }
    });
    expect(createAnnualRes.status()).toBe(200);
    const annualJson = await createAnnualRes.json();
    expect(annualJson.id).toBeDefined();
    expect(annualJson.url).toContain('checkout_success=true');

    const verifyAnnualRes = await request.get(`/api/verify-checkout-session?session_id=${annualJson.id}`);
    expect(verifyAnnualRes.status()).toBe(200);
    const verifyAnnualJson = await verifyAnnualRes.json();
    expect(verifyAnnualJson.success).toBe(true);

    // 3. E2E Checkout for 10 Audits Pack (One-time pack)
    const createOneTimeRes = await request.post('/api/create-checkout-session', {
      data: {
        planType: 'hosted',
        packageName: '10 Audits Pack',
        userId: userId
      }
    });
    expect(createOneTimeRes.status()).toBe(200);
    const oneTimeJson = await createOneTimeRes.json();
    expect(oneTimeJson.id).toBeDefined();
    expect(oneTimeJson.url).toContain('checkout_success=true');

    const verifyOneTimeRes = await request.get(`/api/verify-checkout-session?session_id=${oneTimeJson.id}`);
    expect(verifyOneTimeRes.status()).toBe(200);
    const verifyOneTimeJson = await verifyOneTimeRes.json();
    expect(verifyOneTimeJson.success).toBe(true);
  });

  test('should enforce that a phone number can only be used on one email (no reuse)', async ({ request }) => {
    const testPhone = '+19999999999';

    // 1. Mark phone number as already registered in server mock
    const mockRes = await request.post('/api/test/mock-phone', {
      data: {
        phoneNumber: testPhone,
        registered: true
      }
    });
    expect(mockRes.status()).toBe(200);

    // 2. Try to send OTP to the registered phone number, should fail with 400 Bad Request
    const sendOtpRes = await request.post('/api/send-otp', {
      data: {
        phoneNumber: testPhone
      }
    });
    expect(sendOtpRes.status()).toBe(400);
    const sendOtpJson = await sendOtpRes.json();
    expect(sendOtpJson.error).toBe('This phone number is already associated with another account.');

    // 3. Try to verify OTP for the registered phone number, should fail with 400 Bad Request
    const verifyOtpRes = await request.post('/api/verify-otp', {
      data: {
        phoneNumber: testPhone,
        code: '123456'
      }
    });
    expect(verifyOtpRes.status()).toBe(400);
    const verifyOtpJson = await verifyOtpRes.json();
    expect(verifyOtpJson.error).toBe('This phone number is already associated with another account.');

    // 4. Unregister/clear the phone number in server mock
    const clearRes = await request.post('/api/test/mock-phone', {
      data: {
        phoneNumber: testPhone,
        registered: false
      }
    });
    expect(clearRes.status()).toBe(200);

    // 5. Try to send OTP again, should succeed now
    const sendOtpRetryRes = await request.post('/api/send-otp', {
      data: {
        phoneNumber: testPhone
      }
    });
    expect(sendOtpRetryRes.status()).toBe(200);
  });

  test('should enforce that a phone number cannot be reused even after being cleared (historical reuse prevention)', async ({ request }) => {
    const testPhone = '+19999999999';

    // 1. Mark phone number as historically registered under a different user
    const mockRes = await request.post('/api/test/mock-phone', {
      data: {
        phoneNumber: testPhone,
        registered: false,
        historicalUser: 'other-user-uuid'
      }
    });
    expect(mockRes.status()).toBe(200);

    // 2. Try to send OTP to this phone number as an unauthenticated user, should fail with 400 Bad Request
    const sendOtpRes = await request.post('/api/send-otp', {
      data: {
        phoneNumber: testPhone
      }
    });
    expect(sendOtpRes.status()).toBe(400);
    const sendOtpJson = await sendOtpRes.json();
    expect(sendOtpJson.error).toBe('This phone number has already been used on another account.');

    // 3. Try to verify OTP, should fail with 400 Bad Request
    const verifyOtpRes = await request.post('/api/verify-otp', {
      data: {
        phoneNumber: testPhone,
        code: '123456'
      }
    });
    expect(verifyOtpRes.status()).toBe(400);
    const verifyOtpJson = await verifyOtpRes.json();
    expect(verifyOtpJson.error).toBe('This phone number has already been used on another account.');

    // 4. Clean up mock history
    await request.post('/api/test/mock-phone', {
      data: {
        phoneNumber: testPhone,
        registered: false,
        historicalUser: null
      }
    });
  });

  test('should require correct x-worker-secret header on background worker run-audit endpoint', async ({ request }) => {
    const resNoSecret = await request.post('/api/worker/run-audit', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-user-token'
      },
      data: {
        jobId: 'some-job-id',
        leasePayload: {},
        estoppelPayload: {},
        transactionId: 'some-tx-id'
      }
    });
    expect(resNoSecret.status()).toBe(401);
    const jsonNoSecret = await resNoSecret.json();
    expect(jsonNoSecret.error).toBe('Unauthorized: Worker access only.');

    const resWrongSecret = await request.post('/api/worker/run-audit', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-user-token',
        'X-Worker-Secret': 'wrong-secret-key-xyz'
      },
      data: {
        jobId: 'some-job-id',
        leasePayload: {},
        estoppelPayload: {},
        transactionId: 'some-tx-id'
      }
    });
    expect(resWrongSecret.status()).toBe(401);
  });

  test('should verify no account found error and password clearing on toggle', async ({ page }) => {
    // Mock config to force offline mode (empty Supabase keys)
    await page.route('**/api/config**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ supabaseUrl: 'https://mock.supabase.co', supabaseAnonKey: 'mock-key' }),
      });
    });

    // Mock POST **/auth/v1/token to return Invalid login credentials for a fake email
    await page.route('**/auth/v1/token**', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials" })
      });
    });

    await page.goto('/');
    await page.waitForSelector('body[data-initialized="true"]', { timeout: 15000 });

    // Go to login view
    await page.click('#home-login-btn');
    await expect(page.locator('#login-view')).toBeVisible();

    // Fill in a non-existent email and password
    const emailInput = page.locator('#login-email');
    const passwordInput = page.locator('#login-password');
    const errorBox = page.locator('#login-error-msg');

    await emailInput.fill('nonexistent@example.com');
    await passwordInput.fill('SomePassword123!');

    // Click submit
    await page.click('#login-submit-btn');

    // Verify it displays the generic invalid credentials error message
    await expect(errorBox).toBeVisible({ timeout: 5000 });
    await expect(errorBox).toContainText('Invalid login credentials');

    // Switch to Sign Up mode
    await page.click('#auth-toggle-link');

    // Verify email is preserved but password is cleared
    await expect(emailInput).toHaveValue('nonexistent@example.com');
    await expect(passwordInput).toHaveValue('');
  });

  test('should verify email verification polling and redirect to login', async ({ page }) => {
    let checkVerifiedCallsCount = 0;
    
    // Intercept check-email-verified API
    await page.route('**/api/check-email-verified', async route => {
      checkVerifiedCallsCount++;
      if (checkVerifiedCallsCount < 2) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ verified: false }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ verified: true }),
        });
      }
    });

    await page.goto('/');
    await page.waitForSelector('body[data-initialized="true"]', { timeout: 15000 });

    // Set verification email in session storage
    await page.evaluate(() => {
      sessionStorage.setItem('ta_verification_email', 'polltest@example.com');
      window.location.hash = '#signup-confirm';
    });

    // Verify it routes to confirmation screen
    await expect(page.locator('#signup-confirm-card')).toBeVisible();

    // Verify it automatically redirects to login screen when verified becomes true
    await expect(page.locator('#login-view')).toBeVisible({ timeout: 15000 });
    
    // Verify it shows the "Email verified successfully!" toast
    const toast = page.locator('.toast');
    await expect(toast).toBeVisible({ timeout: 15000 });
    await expect(toast).toContainText('Email verified successfully!');
  });

  test('should verify mandatory phone setup and OTP verification flow for logged-in users', async ({ page }) => {
    // 1. Mock config
    await page.route('**/api/config**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ supabaseUrl: 'https://mock.supabase.co', supabaseAnonKey: 'mock-key' }),
      });
    });

    // 2. Mock GET **/auth/v1/user - initially has NO phone number in metadata
    await page.route('**/auth/v1/user**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-user-id',
          email: 'nophone@example.com',
          user_metadata: { plan_type: 'hosted' }
        })
      });
    });

    // 3. Mock POST **/auth/v1/token
    await page.route('**/auth/v1/token**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user: {
            id: 'mock-user-id',
            email: 'nophone@example.com',
            user_metadata: { plan_type: 'hosted' }
          }
        })
      });
    });

    // 4. Mock GET **/rest/v1/profiles - initially has NO phone number
    let profileHasPhone = false;
    await page.route('**/rest/v1/profiles**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          credits: 0,
          byok_credits: 0,
          plan_tier: null,
          phone: profileHasPhone ? '+14155552671' : null,
          teams: {
            audit_credits: 0,
            plan_tier: 'free'
          }
        })
      });
    });

    // 5. Mock POST **/rest/v1/rpc/register_active_session
    await page.route('**/rest/v1/rpc/register_active_session**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(true)
      });
    });

    // 6. Mock POST **/api/send-otp
    await page.route('**/api/send-otp', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    // 7. Mock POST **/api/verify-otp
    await page.route('**/api/verify-otp', async route => {
      const request = route.request();
      const postData = JSON.parse(request.postData() || '{}');
      if (postData.code === '123456') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      } else {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: "Invalid code" })
        });
      }
    });

    // 8. Mock profiles update
    await page.route('**/rest/v1/profiles?id=eq.mock-user-id', async route => {
      profileHasPhone = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    // 9. Mock auth updateUser
    await page.route('**/auth/v1/user?**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    // 10. Mock /api/grant-welcome-credit
    await page.route('**/api/grant-welcome-credit', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, granted: true })
      });
    });

    // Go to landing and login
    await page.goto('/');
    await page.waitForSelector('body[data-initialized="true"]', { timeout: 15000 });

    await page.click('#home-login-btn');
    await page.fill('#login-email', 'nophone@example.com');
    await page.fill('#login-password', 'password');
    await page.click('#login-submit-btn');

    // Setup phone overlay modal should be displayed automatically because user profile has no phone
    const setupModal = page.locator('#phone-setup-modal');
    await expect(setupModal).toHaveClass(/active/);

    // Try submitting empty/invalid phone number
    await page.click('#btn-setup-phone-submit');
    const setupError = page.locator('#setup-phone-error-msg');
    await expect(setupError).toBeVisible();
    await expect(setupError).toContainText('Please enter a valid phone number');

    // Fill valid phone number and submit
    await page.fill('#setup-phone-input', '+14155552671');
    await page.click('#btn-setup-phone-submit');

    // OTP modal should show up
    const otpModal = page.locator('#phone-otp-modal');
    await expect(otpModal).toHaveClass(/active/);
    await expect(setupModal).not.toHaveClass(/active/);

    // Verify canceling OTP modal goes back to Setup phone modal
    await page.click('#btn-otp-cancel');
    await expect(otpModal).not.toHaveClass(/active/);
    await expect(setupModal).toHaveClass(/active/);

    // Re-submit setup
    await page.click('#btn-setup-phone-submit');
    await expect(otpModal).toHaveClass(/active/);

    // Try verifying wrong code
    await page.fill('#phone-otp-input', '000000');
    await page.click('#btn-otp-verify');
    const otpError = page.locator('#otp-error-msg');
    await expect(otpError).toBeVisible();
    await expect(otpError).toContainText('Invalid code');

    // Verify correct code
    await page.fill('#phone-otp-input', '123456');
    await page.click('#btn-otp-verify');

    // Both modals should close, and toast shows success
    await expect(otpModal).not.toHaveClass(/active/);
    await expect(setupModal).not.toHaveClass(/active/);

    const successToast = page.locator('.toast', { hasText: 'Phone setup completed successfully!' });
    await expect(successToast).toBeVisible();
  });

});
