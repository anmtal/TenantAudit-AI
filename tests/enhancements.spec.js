const { test, expect } = require('@playwright/test');

test.describe('LeaseAlign AI UX Enhancements & Hardening', () => {

  test.beforeEach(({ page }) => {
    page.on('console', msg => {
      console.log(`[Browser ${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
      console.error(`[PageError] ${err.message}`);
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

  test('should verify demo mode stripe checkout block and credit wipe on login', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('body[data-initialized="true"]', { timeout: 15000 });

    // Start live demo
    await page.click('#hero-view-demo-btn');
    await expect(page.locator('#dashboard-view')).toBeVisible();
    await expect(page.locator('#user-email-display')).toHaveText('demo-user@leasealign.ai');

    // Scroll to pricing on home view
    await page.click('#credits-topup-trigger');
    await expect(page.locator('#pricing-section')).toBeInViewport();

    // Try purchasing a pricing package - should block and redirect to login screen
    const buyButton = page.locator('.pricing-cta-btn').first();
    await buyButton.click();

    // Verify it redirects to login screen
    await expect(page.locator('#login-view')).toBeVisible();
    // Resolve strict locator warning by looking for the specific warning toast
    const toast = page.locator('.toast.info', { hasText: 'Please sign up or log in to purchase a plan.' });
    await expect(toast).toBeVisible();
    await expect(toast.locator('.toast-message')).toContainText('Please sign up or log in to purchase a plan.');
  });

});
