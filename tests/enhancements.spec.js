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

  test('should verify live demo redirect directly to dashboard in sandbox mode, auto-loading demo audit, and credit display as Guest Sandbox', async ({ page }) => {
    // 1. Mock config
    await page.route('**/api/config**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ supabaseUrl: 'https://mock.supabase.co', supabaseAnonKey: 'mock-key' }),
      });
    });

    await page.goto('/');
    await page.waitForSelector('body[data-initialized="true"]', { timeout: 15000 });

    // Click Try Live Demo when not logged in
    await page.click('#hero-view-demo-btn');
    
    // Verify it takes us to dashboard directly (guest sandbox mode) and shows the demo audit results
    await expect(page.locator('#dashboard-view')).toBeVisible();
    await expect(page.locator('#meta-tenant-name')).toHaveText('Starbucks Corporation');

    // Verify credits pill is visible and shows Guest Sandbox text
    await expect(page.locator('#credits-topup-trigger')).toBeVisible();
    await expect(page.locator('#credits-count-display')).toHaveText('Guest');
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

});
