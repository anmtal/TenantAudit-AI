/* ==========================================================================
   LeaseAlign AI — Core Application Logic
   ========================================================================== */

function initializeApp() {

    // --- Custom Centered Alert Override ---
    (function() {
        const overlay = document.createElement('div');
        overlay.className = 'custom-alert-overlay';
        
        const card = document.createElement('div');
        card.className = 'custom-alert-card';
        
        const logo = document.createElement('div');
        logo.className = 'custom-alert-logo';
        logo.innerHTML = '<i data-lucide="bell"></i>';
        
        const title = document.createElement('div');
        title.className = 'custom-alert-title';
        title.textContent = 'LeaseAlign AI';
        
        const message = document.createElement('div');
        message.className = 'custom-alert-message';
        
        const btn = document.createElement('button');
        btn.className = 'custom-alert-btn';
        btn.textContent = 'OK';
        
        card.appendChild(logo);
        card.appendChild(title);
        card.appendChild(message);
        card.appendChild(btn);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        
        const closeAlert = () => {
            overlay.classList.remove('active');
        };
        
        btn.addEventListener('click', closeAlert);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeAlert();
            }
        });
        
        window.alert = function(msg) {
            message.textContent = msg;
            overlay.classList.add('active');
            
            if (window.lucide) {
                lucide.createIcons();
            }
        };
    })();

    // Helper to generate or retrieve a unique session ID for single-seat login enforcement
    function getOrGenerateSessionId(forceNew = false) {
        let sid = localStorage.getItem('ta_session_id');
        if (!sid || forceNew) {
            sid = generateUUID();
            localStorage.setItem('ta_session_id', sid);
            localStorage.setItem('ta_session_timestamp', Date.now().toString());
        }
        return sid;
    }

    // Helper to generate a valid UUID v4 (fallback for non-secure contexts)
    function generateUUID() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // Helper to completely clear user state, files, and auth inputs on logout
    function resetAppSessionState() {
        console.log("[Wipe Session] Clearing all user files, inputs, and results data...");
        
        // 1. Clear auth form inputs
        if (loginEmail) loginEmail.value = '';
        if (loginPassword) loginPassword.value = '';
        if (registerFirstName) registerFirstName.value = '';
        if (registerLastName) registerLastName.value = '';
        if (registerCompany) registerCompany.value = '';
        if (loginErrorMsg) {
            loginErrorMsg.textContent = '';
            loginErrorMsg.style.display = 'none';
        }

        // 2. Wipes internal file states
        filesState.lease = null;
        filesState.estoppel = null;
        extractedText.lease = '';
        extractedText.estoppel = '';
        auditData = null;

        // 3. Reset input files elements values
        if (leaseFileInput) leaseFileInput.value = '';
        if (estoppelFileInput) estoppelFileInput.value = '';

        // 4. Reset drop zone visual containers and files descriptions
        if (leaseDropZone) {
            leaseDropZone.classList.remove('file-selected');
            if (leaseFileInfo) {
                leaseFileInfo.textContent = 'No file selected';
                leaseFileInfo.style.display = 'none';
            }
            const removeLeaseBtn = document.getElementById('remove-lease-file-btn');
            if (removeLeaseBtn) removeLeaseBtn.style.display = 'none';
        }

        if (estoppelDropZone) {
            estoppelDropZone.classList.remove('file-selected');
            if (estoppelFileInfo) {
                estoppelFileInfo.textContent = 'No file selected';
                estoppelFileInfo.style.display = 'none';
            }
            const removeEstoppelBtn = document.getElementById('remove-estoppel-file-btn');
            if (removeEstoppelBtn) removeEstoppelBtn.style.display = 'none';
        }

        // 5. Disable auditing actions
        if (startAuditBtn) startAuditBtn.disabled = true;

        // 6. Reset panels views visibility
        if (resultsPanel) resultsPanel.style.display = 'none';
        if (uploadPanel) uploadPanel.style.display = 'block';

        // 7. Clear user-specific session trackers
        localStorage.removeItem('ta_session_id');
        localStorage.removeItem('ta_session_timestamp');
        localStorage.removeItem('ta_user_email');
        localStorage.removeItem('ta_logged_in');

        // 8. Dismiss any active visual loaders
        hideLoader();
    }

    // --- State Variables ---
    let filesState = {
        lease: null,
        estoppel: null
    };

    let extractedText = {
        lease: '',
        estoppel: ''
    };

    let auditData = null;
    let currentAuditTransactionId = null;
    let isLoggedIn = false;
    let pageCredits = 0;
    let hostedCredits = 0;
    let byokCredits = 0;
    let userEmail = '';
    let supabase = null;
    let supabaseUrl = '';
    let supabaseAnonKey = '';
    let isSignUpMode = false;
    let activePlanType = 'hosted'; // 'hosted' or 'byok'

    // --- DOM Selectors ---
    const homeView = document.getElementById('home-view');
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');

    const homeLoginBtn = document.getElementById('home-login-btn');
    const heroGetStartedBtn = document.getElementById('hero-get-started-btn');
    const loginForm = document.getElementById('login-form');
    const loginEmail = document.getElementById('login-email');
    const loginPassword = document.getElementById('login-password');
    const loginErrorMsg = document.getElementById('login-error-msg');
    const loginToHomeLink = document.getElementById('login-to-home-link');
    const logoutBtn = document.getElementById('logout-btn');
    const homeLogoutBtn = document.getElementById('home-logout-btn');
    const homeCreditsDisplay = document.getElementById('home-credits-display');
    const homeCreditsCount = document.getElementById('home-credits-count');
    
    // Auth Toggle selectors
    const authToggleLink = document.getElementById('auth-toggle-link');
    const loginTitle = document.getElementById('login-title');
    const loginSubtitle = document.getElementById('login-subtitle');
    const loginSubmitBtn = document.getElementById('login-submit-btn');
    const authToggleContainer = document.getElementById('auth-toggle-container');
    const registerFirstName = document.getElementById('register-first-name');
    const registerLastName = document.getElementById('register-last-name');
    const registerCompany = document.getElementById('register-company');

    const userEmailDisplay = document.getElementById('user-email-display');
    const creditsCountDisplay = document.getElementById('credits-count-display');
    const creditsTopupTrigger = document.getElementById('credits-topup-trigger');
    const creditsModal = document.getElementById('credits-modal');
    const closeCreditsBtn = document.getElementById('close-credits-btn');
    const saveCreditsBtn = document.getElementById('save-credits-btn');
    const creditsForm = document.getElementById('credits-form');
    const creditsAmount = document.getElementById('credits-amount');
    const buyPlanHosted = document.getElementById('buy-plan-hosted');
    const buyPlanByok = document.getElementById('buy-plan-byok');
    let selectedTopupPlan = 'hosted';

    const leaseDropZone = document.getElementById('lease-drop-zone');
    const estoppelDropZone = document.getElementById('estoppel-drop-zone');
    const leaseFileInput = document.getElementById('lease-file-input');
    const estoppelFileInput = document.getElementById('estoppel-file-input');
    const leaseFileInfo = document.getElementById('lease-file-info');
    const estoppelFileInfo = document.getElementById('estoppel-file-info');
    
    const startAuditBtn = document.getElementById('start-audit-btn');
    const demoBtn = document.getElementById('demo-btn');
    const auditLoader = document.getElementById('audit-loader');
    const loaderStatusText = document.getElementById('loader-status-text');

    // Disclaimer Modal Elements
    const disclaimerModal = document.getElementById('disclaimer-modal');
    const closeDisclaimerBtn = document.getElementById('close-disclaimer-btn');
    const disclaimerAgreeCheckbox = document.getElementById('disclaimer-agree-checkbox');
    const disclaimerCancelBtn = document.getElementById('disclaimer-cancel-btn');
    const disclaimerProceedBtn = document.getElementById('disclaimer-proceed-btn');
    
    const resultsPanel = document.getElementById('results-panel');
    const uploadPanel = document.getElementById('upload-panel');
    
    // KPI Elements
    const scoreVal = document.getElementById('score-val');
    const scoreGaugeFill = document.getElementById('score-gauge-fill');
    const kpiRedFlags = document.getElementById('kpi-red-flags');
    const kpiMonthlyRent = document.getElementById('kpi-monthly-rent');
    const kpiPremisesSf = document.getElementById('kpi-premises-sf');
    const kpiExpiryDate = document.getElementById('kpi-expiry-date');
    
    const metaTenantName = document.getElementById('meta-tenant-name');
    const metaAuditModel = document.getElementById('meta-audit-model');
    const metaLeaseFile = document.getElementById('meta-lease-file');
    const metaEstoppelFile = document.getElementById('meta-estoppel-file');
    
    // Results Table & Quotes
    const auditResultsTbody = document.getElementById('audit-results-tbody');
    const verificationDrawer = document.getElementById('verification-drawer');
    const leaseQuoteBox = document.getElementById('lease-quote-box');
    const estoppelQuoteBox = document.getElementById('estoppel-quote-box');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const exportPdfBtn = document.getElementById('export-pdf-btn');
    
    // Settings Modal Selectors
    const openSettingsBtn = document.getElementById('open-settings-btn');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const settingsForm = document.getElementById('settings-form');
    const settingsMode = document.getElementById('settings-mode');
    const byokSettingsGroup = document.getElementById('byok-settings-group');
    const settingsProvider = document.getElementById('settings-provider');
    const settingsLlmModel = document.getElementById('settings-llm-model');
    const settingsApiKey = document.getElementById('settings-api-key');
    const clearSettingsBtn = document.getElementById('clear-settings-btn');

    // Supported Models by Provider
    const providerModels = {
        openai: [
            { value: 'gpt-4o-mini', label: 'GPT-4o-Mini (Fast, Cheap)' },
            { value: 'gpt-4o', label: 'GPT-4o (Deep Legal Audit)' }
        ],
        anthropic: [
            { value: 'claude-sonnet-4-6', label: 'Claude 4.6 Sonnet (Latest)' },
            { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus (Most Capable)' },
            { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Fast & Cheap)' }
        ]
    };

    // --- Session Router & Multi-View Display Control ---
    function showView(viewId) {
        homeView.style.display = 'none';
        loginView.style.display = 'none';
        dashboardView.style.display = 'none';

        if (viewId !== 'login') {
            window.pendingPurchase = null; // Clear purchase queue on navigation away from login
        }

        if (viewId === 'home') {
            homeView.style.display = 'block';
        } else if (viewId === 'login') {
            loginView.style.display = 'block';
        } else if (viewId === 'dashboard') {
            dashboardView.style.display = 'block';
        }
    }

    function updateNavUI() {
        if (homeLoginBtn) {
            homeLoginBtn.textContent = isLoggedIn ? 'Dashboard' : 'Log In';
        }
        if (heroGetStartedBtn) {
            heroGetStartedBtn.textContent = isLoggedIn ? 'Go to Dashboard' : 'Launch Platform Free';
        }
        if (homeLogoutBtn) {
            homeLogoutBtn.style.display = isLoggedIn ? 'flex' : 'none';
        }
        if (homeCreditsDisplay) {
            homeCreditsDisplay.style.display = 'none';
        }
    }

    function updateCreditsPillColor(credits) {
        if (!creditsTopupTrigger) return;
        creditsTopupTrigger.classList.remove('credits-low', 'credits-empty');
        if (credits === 0) {
            creditsTopupTrigger.classList.add('credits-empty');
        } else if (credits <= 15) {
            creditsTopupTrigger.classList.add('credits-low');
        }
    }

    function updateCreditsDisplay() {
        const mode = localStorage.getItem('ta_connection_mode') || 'hosted';

        if (mode === 'byok') {
            pageCredits = 999999; // BYOK is always Unlimited page audits on our platform
        } else {
            pageCredits = hostedCredits;
        }
        
        const displayVal = pageCredits >= 900000 ? "Unlimited" : pageCredits;
        creditsCountDisplay.textContent = displayVal;
        if (homeCreditsCount) {
            homeCreditsCount.textContent = displayVal;
        }

        // Apply color styles for credits pill depending on mode
        if (creditsTopupTrigger) {
            if (mode === 'byok') {
                creditsTopupTrigger.classList.remove('credits-low', 'credits-empty');
                creditsTopupTrigger.style.color = 'var(--color-emerald)';
                creditsTopupTrigger.style.borderColor = 'rgba(16, 185, 129, 0.25)';
                creditsTopupTrigger.style.background = 'rgba(16, 185, 129, 0.08)';
            } else {
                creditsTopupTrigger.style.color = '';
                creditsTopupTrigger.style.borderColor = '';
                creditsTopupTrigger.style.background = '';
                updateCreditsPillColor(pageCredits);
            }
        } else {
            updateCreditsPillColor(pageCredits);
        }

        // Sync header mode switcher toggle buttons
        const headerModeToggle = document.getElementById('header-mode-toggle');
        if (headerModeToggle) {
            const btns = headerModeToggle.querySelectorAll('.mode-toggle-btn');
            btns.forEach(btn => {
                const btnMode = btn.getAttribute('data-mode');
                if (btnMode === mode) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }

        // Sync Sync Top-up modal current balance display
        const topupBalanceValue = document.getElementById('topup-balance-value');
        if (topupBalanceValue) {
            if (selectedTopupPlan === 'byok') {
                topupBalanceValue.textContent = `Unlimited BYOK Pages`;
                topupBalanceValue.style.color = 'var(--color-emerald)';
            } else {
                const displayBal = hostedCredits >= 900000 ? "Unlimited" : hostedCredits;
                topupBalanceValue.textContent = `${displayBal} Hosted SaaS Audits`;
                topupBalanceValue.style.color = 'var(--color-purple)';
            }
        }
    }

    function initializeAuthFallback() {
        const storedLogin = localStorage.getItem('ta_logged_in') === 'true';
        const storedEmail = localStorage.getItem('ta_user_email') || '';
        
        let storedHosted = localStorage.getItem('ta_hosted_credits');
        if (storedHosted === null) {
            storedHosted = localStorage.getItem('ta_page_credits') || 0;
            localStorage.setItem('ta_hosted_credits', storedHosted);
        }
        hostedCredits = parseInt(storedHosted, 10) || 0;
        
        let storedByok = localStorage.getItem('ta_byok_credits');
        if (storedByok === null) {
            storedByok = 0;
            localStorage.setItem('ta_byok_credits', storedByok);
        }
        byokCredits = parseInt(storedByok, 10) || 0;

        activePlanType = localStorage.getItem('ta_user_plan_type') || 'hosted';
        applyPlanRestrictions(activePlanType);
        updateCreditsDisplay();

        if (storedLogin && storedEmail) {
            isLoggedIn = true;
            userEmail = storedEmail;
            userEmailDisplay.textContent = userEmail;
            showView('dashboard');
        } else {
            isLoggedIn = false;
            showView('home');
        }
        updateNavUI();
    }

    async function loadUserProfileAndCredits() {
        if (!supabase) {
            console.log("loadUserProfileAndCredits: Supabase client not initialized.");
            return;
        }
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                console.log("loadUserProfileAndCredits: No active session found.");
                return;
            }

            console.log("Fetching fresh user metadata from auth server for user:", session.user.email);
            
            // Fetch the latest user metadata directly from the Supabase Auth server to bypass SDK memory caching
            const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
                headers: {
                    'apikey': supabaseAnonKey,
                    'Authorization': `Bearer ${session.access_token}`
                }
            });
            
            if (!authRes.ok) {
                console.warn("Failed to fetch fresh user metadata from auth server.");
                return;
            }
            
            const user = await authRes.json();

            // Load plan type and active session ID from metadata
            const planType = user.user_metadata?.plan_type || 'hosted';
            activePlanType = planType;
            console.log("User plan type loaded from metadata:", activePlanType);
            
            let activeSessionId = user.user_metadata?.active_session_id;
            
            // Fetch credits, byok_credits (bypassing session_id table column to avoid migrations mismatch)
            let profileData = null;
            const { data, error } = await supabase
                .from('profiles')
                .select('credits, byok_credits, teams(audit_credits)')
                .eq('id', user.id)
                .single();
                
            if (error) {
                console.warn("Could not fetch profile fields. Error:", error);
            } else {
                profileData = data;
            }
            
            
            // Seat enforcement checks have been removed to support multi-seat plans.

            if (profileData) {
                const teamAuditCredits = profileData.teams && profileData.teams.audit_credits !== undefined
                    ? profileData.teams.audit_credits
                    : profileData.credits || 0;

                console.log("Fetched profile credits. Hosted:", teamAuditCredits, "BYOK:", profileData.byok_credits);
                hostedCredits = teamAuditCredits;
                byokCredits = profileData.byok_credits || 0;
            } else {
                console.log("No profile data returned for user:", user.id);
            }
            applyPlanRestrictions(activePlanType);
            updateCreditsDisplay();
        } catch (e) {
            console.error("Failed to load user profile:", e);
        }
    }

    async function loadAuditHistory() {
        if (!supabase) {
            document.getElementById('history-panel').style.display = 'none';
            return;
        }
        
        const historyLoadingMsg = document.getElementById('history-loading-msg');
        const historyEmptyMsg = document.getElementById('history-empty-msg');
        const historyListContainer = document.getElementById('history-list-container');
        
        if (historyListContainer.innerHTML.trim() === '') {
            historyLoadingMsg.style.display = 'block';
            historyEmptyMsg.style.display = 'none';
            historyListContainer.style.display = 'none';
        }
        
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Fetch history isolated strictly for the current user
            const { data, error } = await supabase
                .from('audits')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
                
            historyLoadingMsg.style.display = 'none';
            
            if (error) {
                console.error("Error loading audits:", error);
                historyEmptyMsg.textContent = "Error loading audit history. Check database console.";
                historyEmptyMsg.style.display = 'block';
                return;
            }
            
            historyListContainer.innerHTML = '';
            if (!data || data.length === 0) {
                historyEmptyMsg.innerHTML = `
                    <div style="text-align: center; padding: 30px;">
                        <h3 style="margin-bottom: 10px; color: var(--text-primary);">Welcome to LeaseAlign AI</h3>
                        <p style="color: var(--text-secondary); margin-bottom: 20px; font-size: 14px; line-height: 1.5;">You haven't run any audits yet. Get started by uploading a lease and estoppel, or view a sample audit to see how it works.</p>
                        <button id="btn-view-sample" class="primary-btn" style="width: auto; padding: 10px 20px; margin: 0 auto; display: block;">View Sample Audit</button>
                    </div>
                `;
                historyEmptyMsg.style.display = 'block';
                document.getElementById('btn-view-sample').addEventListener('click', () => {
                    loadDemoAuditData();
                    document.getElementById('history-panel').style.display = 'none';
                });
                return;
            }
            
            historyListContainer.style.display = 'grid';
            data.forEach(item => {
                const card = document.createElement('div');
                card.className = 'history-card';
                
                const score = item.match_score;
                let badgeClass = 'score-badge-high';
                if (score < 50) badgeClass = 'score-badge-low';
                else if (score < 90) badgeClass = 'score-badge-med';
                
                let discrepanciesHtml = '';
                if (item.records && Array.isArray(item.records)) {
                    const mismatches = item.records.filter(r => r.status === 'mismatch' || r.status === 'warning');
                    if (mismatches.length > 0) {
                        discrepanciesHtml = `<div class="history-detail-item" style="color: #ef4444; font-weight: 500;"><span>Discrepancies:</span> ${mismatches.map(m => escapeHtml(m.term)).join(', ')}</div>`;
                    } else {
                        discrepanciesHtml = `<div class="history-detail-item" style="color: #10b981; font-weight: 500;"><span>Discrepancies:</span> None</div>`;
                    }
                }
                
                const formattedDate = new Date(item.created_at).toLocaleString();
                
                card.innerHTML = `
                    <div class="history-card-header">
                        <div class="history-tenant" title="${escapeHtml(item.tenant_name)}">${escapeHtml(item.tenant_name)}</div>
                        <div class="history-score-badge ${badgeClass}">${score}%</div>
                    </div>
                    <div class="history-details">
                        <div class="history-detail-item"><span>Lease File:</span> ${escapeHtml(item.lease_file)}</div>
                        <div class="history-detail-item"><span>Estoppel:</span> ${escapeHtml(item.estoppel_file)}</div>
                        ${discrepanciesHtml}
                        <div class="history-detail-item"><span>Red Flags:</span> ${item.red_flags}</div>
                        <div class="history-detail-item"><span>Rent:</span> ${escapeHtml(item.monthly_rent || 'N/A')}</div>
                        <div class="history-detail-item"><span>Date:</span> ${formattedDate}</div>
                    </div>
                    <div class="history-actions">
                        <button class="btn-history-load" data-id="${item.id}">View Audit Results</button>
                    </div>
                `;
                
                card.querySelector('.btn-history-load').addEventListener('click', () => {
                    loadSavedAuditIntoUI(item);
                });
                
                historyListContainer.appendChild(card);
            });
            
        } catch (e) {
            console.error("History fetch error:", e);
            historyLoadingMsg.style.display = 'none';
            historyEmptyMsg.style.display = 'block';
        }
    }

    function loadSavedAuditIntoUI(item) {
        auditData = {
            metadata: {
                tenantName: item.tenant_name,
                leaseFile: item.lease_file,
                estoppelFile: item.estoppel_file,
                auditModel: "Stored Database Audit"
            },
            summary: {
                matchScore: item.match_score,
                redFlags: item.red_flags,
                monthlyRent: item.monthly_rent,
                premisesSf: item.premises_sf,
                expiryDate: item.expiry_date
            },
            records: item.records
        };
        
        renderAuditResults();
        alert(`📂 Loaded audit for ${item.tenant_name} (${item.match_score}% compliance).`);
    }

    // Initialize Supabase from Config
    async function initSupabase() {
        try {
            const res = await fetch('/api/config?t=' + Date.now());
            const config = await res.json();
            if (config.supabaseUrl && config.supabaseAnonKey && window.supabase) {
                supabaseUrl = config.supabaseUrl;
                supabaseAnonKey = config.supabaseAnonKey;
                supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
                console.log("Supabase Client initialized successfully.");
                
                // Set up auth state change listener
                supabase.auth.onAuthStateChange(async (event, session) => {
                    console.log("Supabase Auth Event:", event);
                    if (session && session.user) {
                        isLoggedIn = true;
                        userEmail = session.user.email;
                        userEmailDisplay.textContent = userEmail;
                        showView('dashboard');
                        updateNavUI();
                        
                        // Sync active session ID to auth user metadata for single-seat enforcement first
                        const isFreshLogin = localStorage.getItem('ta_fresh_login') === 'true';
                        const sessionId = getOrGenerateSessionId(isFreshLogin);
                        try {
                            const { error: syncErr } = await supabase.auth.updateUser({
                                data: { active_session_id: sessionId }
                            });
                            if (syncErr) {
                                console.warn("[Session Sync Warning] Failed to update active_session_id in metadata:", syncErr.message);
                            } else {
                                console.log("[Session Sync] Successfully updated active_session_id in metadata:", sessionId);
                            }
                        } catch (e) {
                            console.error("[Session Sync Error] Exception during metadata update:", e);
                        }

                        // Load credits and past history from Supabase
                        await loadUserProfileAndCredits();
                        await loadAuditHistory();
                        
                        // Check if there was a pending package selection before login
                        if (window.pendingPurchase) {
                        const { plan, amount, price, seats, packageName } = window.pendingPurchase;
                        window.pendingPurchase = null; // Clear state
                        showLoader("Connecting to payment checkout...");
                        try {
                            const { data: { user } } = await supabase.auth.getUser();
                            const { data: { session } } = await supabase.auth.getSession();
                            const response = await fetch('/api/create-checkout-session', {
                                method: 'POST',
                                headers: { 
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${session.access_token}`
                                },
                                body: JSON.stringify({
                                    amount: parseInt(amount, 10),
                                    planType: plan,
                                    userId: user.id,
                                    price: parseInt(price, 10),
                                    seatCount: parseInt(seats, 10),
                                    packageName: packageName,
                                    isSubscription: true
                                })
                            });
                            const sessionData = await response.json();
                            hideLoader();
                            if (sessionData.error) throw new Error(sessionData.error);
                            if (sessionData.url) {
                                window.location.href = sessionData.url;
                            } else {
                                throw new Error("Stripe checkout session creation failed.");
                            }
                        } catch(err) {
                            hideLoader();
                            alert("Error initiating checkout: " + err.message);
                        }
                    }

                        // --- Check for Stripe Redirect Success ---
                        const urlParams = new URLSearchParams(window.location.search);
                        if (urlParams.get('checkout_success') === 'true' && urlParams.get('session_id')) {
                            const sessionId = urlParams.get('session_id');
                            showLoader("Verifying Stripe payment...");
                            try {
                                const { data: { session } } = await supabase.auth.getSession();
                                const response = await fetch(`/api/verify-checkout-session?session_id=${sessionId}&t=` + Date.now(), {
                                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                                });
                                const data = await response.json();
                                if (data.success) {
                                    const { amount, planType } = data.metadata;
                                    const amt = parseInt(amount, 10);
                                    
                                    // Reload user profile & credits (updated server-side)
                                    await loadUserProfileAndCredits();
                                    
                                    // Clear URL parameters
                                    window.history.replaceState({}, document.title, window.location.pathname);
                                    
                                    const displayAmt = amt >= 900000 ? "Unlimited" : `+${amount}`;
                                    alert(`🎉 Payment Verified! Successfully activated your ${planType.toUpperCase()} plan with ${displayAmt} credits.`);
                                } else {
                                    alert("Stripe Checkout verification failed: " + (data.error || "Unknown error"));
                                }
                            } catch (err) {
                                console.error("Redirect verification error:", err);
                                alert("Failed to verify Stripe payment: " + err.message);
                            } finally {
                                hideLoader();
                            }
                        }

                        // --- Check for Stripe Redirect Cancel ---
                        if (urlParams.get('checkout_cancel') === 'true') {
                            window.history.replaceState({}, document.title, window.location.pathname);
                            alert("Payment canceled. No credits were added.");
                        }
                    } else {
                        isLoggedIn = false;
                        userEmail = '';
                        showView('home');
                        updateNavUI();
                        resetAppSessionState();
                    }
                });
            } else {
                console.warn("Supabase configs not loaded. Running in local fallback mode.");
                initializeAuthFallback();
            }
        } catch (e) {
            console.error("Failed to initialize Supabase:", e);
            initializeAuthFallback();
        }
    }

    // Navigation triggers
    if (homeLoginBtn) {
        homeLoginBtn.addEventListener('click', () => {
            if (isLoggedIn) {
                showView('dashboard');
            } else {
                showView('login');
            }
        });
    }
    if (heroGetStartedBtn) {
        heroGetStartedBtn.addEventListener('click', () => {
            if (isLoggedIn) {
                showView('dashboard');
            } else {
                showView('login');
            }
        });
    }
    if (loginToHomeLink) {
        loginToHomeLink.addEventListener('click', (e) => {
            e.preventDefault();
            showView('home');
        });
    }
    const dashboardHomeBtn = document.getElementById('dashboard-home-btn');
    if (dashboardHomeBtn) {
        dashboardHomeBtn.addEventListener('click', () => {
            showView('home');
        });
    }

    // Pricing Switcher Tab Toggle Logic
    const switchHostedBtn = document.getElementById('switch-hosted');
    const switchByokBtn = document.getElementById('switch-byok');
    const hostedGrid = document.getElementById('hosted-grid');
    const byokGrid = document.getElementById('byok-grid');

    if (switchHostedBtn && switchByokBtn && hostedGrid && byokGrid) {
        switchHostedBtn.addEventListener('click', () => {
            switchHostedBtn.classList.add('active');
            switchByokBtn.classList.remove('active');
            hostedGrid.style.display = 'grid';
            byokGrid.style.display = 'none';
            
            // If logged in, sync connection mode as well
            if (isLoggedIn) {
                const currentMode = localStorage.getItem('ta_connection_mode') || 'hosted';
                if (currentMode !== 'hosted') {
                    localStorage.setItem('ta_connection_mode', 'hosted');
                    if (settingsMode) settingsMode.value = 'hosted';
                    const savedKey = localStorage.getItem('ta_api_key') || '';
                    updateSettingsUI('hosted', '');
                    selectedTopupPlan = 'hosted';
                    if (buyPlanHosted) buyPlanHosted.click();
                    updateCreditsDisplay();
                }
            }
        });

        switchByokBtn.addEventListener('click', () => {
            switchByokBtn.classList.add('active');
            switchHostedBtn.classList.remove('active');
            hostedGrid.style.display = 'none';
            byokGrid.style.display = 'flex';
            
            // If logged in, sync connection mode as well
            if (isLoggedIn) {
                const currentMode = localStorage.getItem('ta_connection_mode') || 'hosted';
                if (currentMode !== 'byok') {
                    localStorage.setItem('ta_connection_mode', 'byok');
                    if (settingsMode) settingsMode.value = 'byok';
                    const savedKey = localStorage.getItem('ta_api_key') || '';
                    updateSettingsUI('byok', savedKey);
                    selectedTopupPlan = 'byok';
                    if (buyPlanByok) buyPlanByok.click();
                    updateCreditsDisplay();
                }
            }
        });
    }




    // Event delegation on authToggleContainer to prevent listeners leak
    if (authToggleContainer) {
        authToggleContainer.addEventListener('click', (e) => {
            const toggleLink = e.target.closest('#auth-toggle-link');
            if (!toggleLink) return;
            
            e.preventDefault();
            isSignUpMode = !isSignUpMode;
            
            if (isSignUpMode) {
                loginTitle.textContent = "Create an Account";
                loginSubtitle.textContent = "Sign up for LeaseAlign AI to start auditing commercial leases.";
                loginSubmitBtn.textContent = "Register Account";
                
                document.querySelectorAll('.register-only').forEach(el => el.style.display = 'block');
                if (registerFirstName) registerFirstName.required = true;
                if (registerLastName) registerLastName.required = true;
                if (registerCompany) registerCompany.required = true;
                
                authToggleContainer.innerHTML = 'Already have an account? <a href="#" id="auth-toggle-link">Sign In</a>';
            } else {
                loginTitle.textContent = "Sign In to LeaseAlign AI";
                loginSubtitle.textContent = "Enter your credentials to access your transaction dashboard";
                loginSubmitBtn.textContent = "Sign In";
                
                document.querySelectorAll('.register-only').forEach(el => el.style.display = 'none');
                if (registerFirstName) registerFirstName.required = false;
                if (registerLastName) registerLastName.required = false;
                if (registerCompany) registerCompany.required = false;
                
                authToggleContainer.innerHTML = 'Don\'t have an account? <a href="#" id="auth-toggle-link">Sign Up</a>';
            }
        });
    }

    const forgotPasswordLink = document.getElementById('forgot-password-link');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = loginEmail ? loginEmail.value.trim() : '';
            if (!email) {
                alert("Please enter your email address in the Email field first, then click 'Forgot password?'.");
                return;
            }
            if (supabase) {
                const originalText = forgotPasswordLink.textContent;
                forgotPasswordLink.textContent = "Sending...";
                try {
                    const { error } = await supabase.auth.resetPasswordForEmail(email, {
                        redirectTo: window.location.origin
                    });
                    if (error) throw error;
                    alert("Password reset email sent! Please check your inbox.");
                } catch (err) {
                    alert("Error resetting password: " + err.message);
                } finally {
                    forgotPasswordLink.textContent = originalText;
                }
            } else {
                alert("Password reset is not available in mock mode.");
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = loginEmail.value.trim();
            const password = loginPassword.value;

            if (!email || !password) return;

            loginErrorMsg.style.display = 'none';
            loginSubmitBtn.disabled = true;
            const originalText = loginSubmitBtn.textContent;
            loginSubmitBtn.textContent = isSignUpMode ? "Registering..." : "Signing In...";

            try {
                if (supabase) {
                    if (isSignUpMode) {
                        const firstName = registerFirstName ? registerFirstName.value.trim() : '';
                        const lastName = registerLastName ? registerLastName.value.trim() : '';
                        const company = registerCompany ? registerCompany.value.trim() : '';

                        localStorage.setItem('ta_fresh_login', 'true');
                        const { data, error } = await supabase.auth.signUp({
                            email: email,
                            password: password,
                            options: {
                                data: {
                                    first_name: firstName,
                                    last_name: lastName,
                                    company_name: company
                                }
                            }
                        });
                        if (error) {
                            localStorage.removeItem('ta_fresh_login');
                            throw error;
                        }
                        alert("🎉 Account created successfully! Please top up your page credits to begin auditing.");
                    } else {
                        localStorage.setItem('ta_fresh_login', 'true');
                        const { data, error } = await supabase.auth.signInWithPassword({
                            email: email,
                            password: password
                        });
                        if (error) {
                            localStorage.removeItem('ta_fresh_login');
                            throw error;
                        }
                    }
                } else {
                    localStorage.setItem('ta_logged_in', 'true');
                    localStorage.setItem('ta_user_email', email);
                    isLoggedIn = true;
                    userEmail = email;
                    userEmailDisplay.textContent = userEmail;
                    loginErrorMsg.style.display = 'none';
                    showView('dashboard');
                    updateNavUI();
                    
                    // Check if there was a pending package selection before login
                    if (window.pendingPurchase) {
                        const { plan, amount } = window.pendingPurchase;
                        window.pendingPurchase = null; // Clear state
                        
                        creditsModal.classList.add('active');
                        if (plan === 'hosted') {
                            if (buyPlanHosted) {
                                buyPlanHosted.click();
                                creditsAmount.value = amount;
                            }
                        } else if (plan === 'byok') {
                            if (buyPlanByok) {
                                buyPlanByok.click();
                                creditsAmount.value = amount;
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Auth error:", err);
                loginErrorMsg.textContent = `🚫 ${err.message || 'Authentication failed. Please check your credentials.'}`;
                loginErrorMsg.style.display = 'block';
            } finally {
                loginSubmitBtn.disabled = false;
                loginSubmitBtn.textContent = originalText;
            }
        });
    }

    const handleLogout = async () => {
        try {
            if (supabase) {
                await supabase.auth.signOut();
            }
        } catch (signOutErr) {
            console.warn("[Logout Warning] Supabase signOut threw an error, cleaning up local state instead:", signOutErr);
        } finally {
            isLoggedIn = false;
            userEmail = '';
            showView('home');
            updateNavUI();
            resetAppSessionState();
            
            // Clear any lingering session keys in localStorage just in case
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('sb-') || key.includes('auth-token') || key === 'ta_session_id')) {
                    localStorage.removeItem(key);
                }
            }
            console.log("[Logout] Local session state cleared successfully.");
        }
    };

    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    if (homeLogoutBtn) {
        homeLogoutBtn.addEventListener('click', handleLogout);
    }

    // Credits Modal Handlers
    const handleTopupClick = () => {
        showView('home');
        setTimeout(() => {
            const pricingSection = document.getElementById('pricing-section');
            if (pricingSection) {
                pricingSection.scrollIntoView({ behavior: 'smooth' });
            }
        }, 100);
    };

    if (creditsTopupTrigger) {
        creditsTopupTrigger.addEventListener('click', handleTopupClick);
    }

    if (homeCreditsDisplay) {
        homeCreditsDisplay.addEventListener('click', handleTopupClick);
    }
    
    if (closeCreditsBtn) {
        closeCreditsBtn.addEventListener('click', () => {
            creditsModal.classList.remove('active');
        });
    }
    
    if (creditsModal) {
        creditsModal.addEventListener('click', (e) => {
            if (e.target === creditsModal) creditsModal.classList.remove('active');
        });
    }

    if (buyPlanHosted && buyPlanByok && creditsAmount) {
        buyPlanHosted.addEventListener('click', () => {
            buyPlanHosted.classList.add('active');
            buyPlanByok.classList.remove('active');
            selectedTopupPlan = 'hosted';
            creditsAmount.innerHTML = `
                <option value="100" selected>Starter: 100 Pages ($49.00)</option>
                <option value="500">Strip Center: 500 Pages ($149.00)</option>
                <option value="1500">Neighborhood Center: 1500 Pages ($399.00)</option>
                <option value="8000">Annual Package: 8,000 Pages ($999.00)</option>
                <option value="20000">Enterprise Package: 20,000 Pages ($2,499.00)</option>
            `;
            updateCreditsDisplay();
        });

        buyPlanByok.addEventListener('click', () => {
            buyPlanByok.classList.add('active');
            buyPlanHosted.classList.remove('active');
            selectedTopupPlan = 'byok';
            creditsAmount.innerHTML = `
                <option value="149" selected>BYOK Monthly: Unlimited Pages ($149.00/mo)</option>
                <option value="1299">BYOK Annual: Unlimited Pages ($1,299.00/yr)</option>
            `;
            updateCreditsDisplay();
        });
    }

    if (creditsForm) {
        creditsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = parseInt(creditsAmount.value, 10);
            if (isNaN(amount) || amount <= 0) return;

            try {
                if (supabase) {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) throw new Error("No authenticated user found.");

                    // Determine price and package name based on amount and plan type
                    let price = 49.00;
                    let packageName = "Starter Package";
                    let checkoutAmount = 999999;
                    
                    if (selectedTopupPlan === 'hosted') {
                        checkoutAmount = amount;
                        if (amount === 100) { price = 49.00; packageName = "Starter Package"; }
                        else if (amount === 500) { price = 149.00; packageName = "Strip Center Package"; }
                        else if (amount === 1500) { price = 399.00; packageName = "Neighborhood Center Package"; }
                        else if (amount === 8000) { price = 999.00; packageName = "Annual Package"; }
                        else if (amount === 20000) { price = 2499.00; packageName = "Enterprise Package"; }
                    } else {
                        if (amount === 149) { price = 149.00; packageName = "BYOK Monthly Plan"; }
                        else if (amount === 1299) { price = 1299.00; packageName = "BYOK Annual Plan"; }
                    }

                    creditsModal.classList.remove('active');
                    showLoader("Connecting to payment checkout...");
                    const { data: { session } } = await supabase.auth.getSession();

                    const response = await fetch('/api/create-checkout-session', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${session.access_token}`
                        },
                        body: JSON.stringify({
                            amount: checkoutAmount,
                            planType: selectedTopupPlan,
                            userId: user.id,
                            price,
                            packageName,
                            seatCount: 1,
                            isSubscription: false
                        })
                    });

                    const sessionData = await response.json();
                    hideLoader();

                    if (sessionData.error) throw new Error(sessionData.error);

                    if (sessionData.url) {
                        // Redirect to Stripe checkout page
                        window.location.href = sessionData.url;
                    } else {
                        throw new Error("Stripe checkout session creation failed. No URL returned.");
                    }
                } else {
                    if (selectedTopupPlan === 'byok') {
                        byokCredits = 999999;
                    } else {
                        const isAnnual = (amount === 8000 || amount === 20000);
                        hostedCredits = (isAnnual ? 0 : hostedCredits) + amount;
                    }
                    localStorage.setItem('ta_hosted_credits', hostedCredits);
                    localStorage.setItem('ta_byok_credits', byokCredits);
                    localStorage.setItem('ta_user_plan_type', selectedTopupPlan);
                    
                    activePlanType = selectedTopupPlan;
                    applyPlanRestrictions(activePlanType);
                    updateCreditsDisplay();
                    
                    creditsModal.classList.remove('active');
                    const displayAmt = selectedTopupPlan === 'byok' ? "Unlimited" : `+${amount}`;
                    alert(`🎉 Offline Demo Mode: Successfully activated your ${selectedTopupPlan.toUpperCase()} plan with ${displayAmt} credits!`);
                }
            } catch (err) {
                console.error("Top up error:", err);
                alert(`🚫 Credit update failed: ${err.message}`);
            }
        });
    }

    function updateModelDropdown(provider, selectedValue) {
        if (!settingsLlmModel) return;
        settingsLlmModel.innerHTML = '';
        const models = providerModels[provider] || [];
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.value;
            opt.textContent = m.label;
            settingsLlmModel.appendChild(opt);
        });
        
        const hasSelectedValue = models.some(m => m.value === selectedValue);
        if (selectedValue && hasSelectedValue) {
            settingsLlmModel.value = selectedValue;
        } else if (models.length > 0) {
            settingsLlmModel.value = models[0].value;
        }
    }

    // --- Plan-Based Settings Restrictions Gating ---
    function applyPlanRestrictions(planType) {
        console.log(`[Plan Restrictions] Applying restrictions. Hosted credits: ${hostedCredits}, BYOK credits: ${byokCredits}`);
        const settingsModeDropdown = document.getElementById('settings-mode');
        if (!settingsModeDropdown) return;
        
        const hostedOption = settingsModeDropdown.querySelector('option[value="hosted"]');
        const byokOption = settingsModeDropdown.querySelector('option[value="byok"]');
        
        const targetMode = localStorage.getItem('ta_connection_mode') || 'hosted';
        
        if (hostedOption) hostedOption.disabled = (targetMode === 'byok');
        if (byokOption) byokOption.disabled = (targetMode === 'hosted');
        
        settingsModeDropdown.value = targetMode;
        
        const savedApiKey = localStorage.getItem('ta_api_key') || '';
        updateSettingsUI(targetMode, targetMode === 'byok' ? savedApiKey : '');
    }

    // --- Load Saved Settings ---
    function loadSettings() {
        applyPlanRestrictions(activePlanType);

        const savedMode = localStorage.getItem('ta_connection_mode') || 'hosted';
        const savedProvider = localStorage.getItem('ta_api_provider') || 'openai';
        const savedModel = localStorage.getItem('ta_llm_model') || 'gpt-4o-mini';
        const savedKey = localStorage.getItem('ta_api_key') || '';
        
        settingsMode.value = savedMode;
        settingsProvider.value = savedProvider;
        settingsApiKey.value = savedKey;
        
        updateModelDropdown(savedProvider, savedModel);
        updateSettingsUI(savedMode, savedKey);
        
        // Sync landing page pricing switcher to saved mode
        if (switchHostedBtn && switchByokBtn && hostedGrid && byokGrid) {
            if (savedMode === 'hosted') {
                switchHostedBtn.classList.add('active');
                switchByokBtn.classList.remove('active');
                hostedGrid.style.display = 'grid';
                byokGrid.style.display = 'none';
            } else {
                switchByokBtn.classList.add('active');
                switchHostedBtn.classList.remove('active');
                hostedGrid.style.display = 'none';
                byokGrid.style.display = 'flex';
            }
        }
        
        // Sync top-up plan type to match saved connection mode
        selectedTopupPlan = savedMode;
        if (savedMode === 'hosted') {
            if (buyPlanHosted) buyPlanHosted.classList.add('active');
            if (buyPlanByok) buyPlanByok.classList.remove('active');
        } else {
            if (buyPlanByok) buyPlanByok.classList.add('active');
            if (buyPlanHosted) buyPlanHosted.classList.remove('active');
        }

        updateCreditsDisplay();
    }

    function updateSettingsUI(mode, apiKey) {
        if (mode === 'hosted') {
            byokSettingsGroup.style.display = 'none';
            clearSettingsBtn.style.display = 'none';
            
            openSettingsBtn.textContent = '⚙️ Connection: Hosted SaaS';
            openSettingsBtn.style.borderColor = 'rgba(139, 92, 246, 0.4)';
            openSettingsBtn.style.color = '#a78bfa';
        } else {
            byokSettingsGroup.style.display = 'block';
            clearSettingsBtn.style.display = apiKey ? 'inline-block' : 'none';
            
            if (apiKey) {
                openSettingsBtn.textContent = '⚙️ Connection: BYOB Active';
                openSettingsBtn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                openSettingsBtn.style.color = '#34d399';
            } else {
                openSettingsBtn.textContent = '⚙️ Configure API Key';
                openSettingsBtn.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                openSettingsBtn.style.color = '#f87171';
            }
        }
    }

    loadSettings();
    initSupabase();

    // Toggle BYOK options when changing connection mode dropdown
    if (settingsMode) {
        settingsMode.addEventListener('change', (e) => {
            const tempKey = settingsApiKey.value.trim();
            updateSettingsUI(e.target.value, tempKey);
            
            // Update displayed credits count immediately when switching dropdown selection
            const selectedMode = e.target.value;
            const tempCredits = selectedMode === 'byok' ? 999999 : hostedCredits;
            const displayVal = tempCredits >= 900000 ? "Unlimited" : tempCredits;
            creditsCountDisplay.textContent = displayVal;
            if (homeCreditsCount) {
                homeCreditsCount.textContent = displayVal;
            }
            
            if (creditsTopupTrigger) {
                if (selectedMode === 'byok') {
                    creditsTopupTrigger.classList.remove('credits-low', 'credits-empty');
                    creditsTopupTrigger.style.color = 'var(--color-emerald)';
                    creditsTopupTrigger.style.borderColor = 'rgba(16, 185, 129, 0.25)';
                    creditsTopupTrigger.style.background = 'rgba(16, 185, 129, 0.08)';
                } else {
                    creditsTopupTrigger.style.color = '';
                    creditsTopupTrigger.style.borderColor = '';
                    creditsTopupTrigger.style.background = '';
                    updateCreditsPillColor(tempCredits);
                }
            }
        });
    }

    // Dynamic model loading when changing provider dropdown
    if (settingsProvider) {
        settingsProvider.addEventListener('change', (e) => {
            updateModelDropdown(e.target.value);
        });
    }

    // --- Modal Listeners ---
    if (openSettingsBtn) {
        openSettingsBtn.addEventListener('click', () => {
            applyPlanRestrictions(activePlanType);
            settingsModal.classList.add('active');
        });
    }
    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => {
            settingsModal.classList.remove('active');
            loadSettings();
        });
    }
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.classList.remove('active');
                loadSettings();
            }
        });
    }

    // Header Connection Mode Switcher Toggle Listener
    const headerModeToggle = document.getElementById('header-mode-toggle');
    if (headerModeToggle) {
        const btns = headerModeToggle.querySelectorAll('.mode-toggle-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                const selectedMode = btn.getAttribute('data-mode');
                
                // Save connection mode
                localStorage.setItem('ta_connection_mode', selectedMode);
                
                // Sync settings modal dropdown
                if (settingsMode) {
                    settingsMode.value = selectedMode;
                }
                
                // Sync settings UI and key states
                const savedKey = localStorage.getItem('ta_api_key') || '';
                updateSettingsUI(selectedMode, selectedMode === 'byok' ? savedKey : '');
                
                // Sync pricing grid display on landing page
                if (switchHostedBtn && switchByokBtn && hostedGrid && byokGrid) {
                    if (selectedMode === 'hosted') {
                        switchHostedBtn.classList.add('active');
                        switchByokBtn.classList.remove('active');
                        hostedGrid.style.display = 'grid';
                        byokGrid.style.display = 'none';
                    } else {
                        switchByokBtn.classList.add('active');
                        switchHostedBtn.classList.remove('active');
                        hostedGrid.style.display = 'none';
                        byokGrid.style.display = 'flex';
                    }
                }
                
                // Sync top-up plan type
                selectedTopupPlan = selectedMode;
                if (selectedMode === 'hosted') {
                    if (buyPlanHosted) buyPlanHosted.click();
                } else {
                    if (buyPlanByok) buyPlanByok.click();
                }

                // Update credits pill text and count display
                updateCreditsDisplay();

                // Sync disabled dropdown options
                applyPlanRestrictions(activePlanType);
            });
        });
    }

    if (settingsForm) {
        settingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            localStorage.setItem('ta_connection_mode', settingsMode.value);
            localStorage.setItem('ta_api_provider', settingsProvider.value);
            localStorage.setItem('ta_llm_model', settingsLlmModel.value);
            localStorage.setItem('ta_api_key', settingsApiKey.value.trim());
            settingsModal.classList.remove('active');
            loadSettings();
            alert('🎉 Connection configurations saved successfully.');
        });
    }

    if (clearSettingsBtn) {
        clearSettingsBtn.addEventListener('click', () => {
            localStorage.removeItem('ta_api_key');
            settingsApiKey.value = '';
            settingsModal.classList.remove('active');
            loadSettings();
            alert('API key cleared.');
        });
    }

    // --- Disclaimer Modal Event Listeners ---
    if (closeDisclaimerBtn) {
        closeDisclaimerBtn.addEventListener('click', () => {
            disclaimerModal.classList.remove('active');
        });
    }
    if (disclaimerCancelBtn) {
        disclaimerCancelBtn.addEventListener('click', () => {
            disclaimerModal.classList.remove('active');
        });
    }
    if (disclaimerModal) {
        disclaimerModal.addEventListener('click', (e) => {
            if (e.target === disclaimerModal) {
                disclaimerModal.classList.remove('active');
            }
        });
    }
    if (disclaimerAgreeCheckbox) {
        disclaimerAgreeCheckbox.addEventListener('change', (e) => {
            if (disclaimerProceedBtn) {
                disclaimerProceedBtn.disabled = !e.target.checked;
            }
        });
    }

    // --- Drag & Drop Upload Zone Configuration ---
    setupDragDropZone(leaseDropZone, leaseFileInput, 'lease');
    setupDragDropZone(estoppelDropZone, estoppelFileInput, 'estoppel');

    function setupDragDropZone(zoneEl, inputEl, fileKey) {
        if (!zoneEl || !inputEl) return;

        zoneEl.addEventListener('click', (e) => {
            if (e.target.closest('.remove-file-btn')) return;
            inputEl.click();
        });

        const removeBtn = document.getElementById(`remove-${fileKey}-file-btn`);
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                clearFileSelection(fileKey, zoneEl, inputEl);
            });
        }

        zoneEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            zoneEl.classList.add('dragover');
        });

        zoneEl.addEventListener('dragleave', () => {
            zoneEl.classList.remove('dragover');
        });

        zoneEl.addEventListener('drop', (e) => {
            e.preventDefault();
            zoneEl.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                handleFileSelection(e.dataTransfer.files[0], zoneEl, fileKey);
            }
        });

        inputEl.addEventListener('change', (e) => {
            if (inputEl.files.length > 0) {
                handleFileSelection(inputEl.files[0], zoneEl, fileKey);
            }
        });
    }

    function clearFileSelection(fileKey, zoneEl, inputEl) {
        filesState[fileKey] = null;
        inputEl.value = '';
        zoneEl.classList.remove('file-selected');
        
        const fileInfoEl = document.getElementById(`${fileKey}-file-info`);
        if (fileInfoEl) {
            fileInfoEl.textContent = 'No file selected';
            fileInfoEl.style.display = 'none';
        }
        
        const removeBtn = document.getElementById(`remove-${fileKey}-file-btn`);
        if (removeBtn) {
            removeBtn.style.display = 'none';
        }
        
        if (startAuditBtn) {
            startAuditBtn.disabled = true;
        }
    }

    function handleFileSelection(file, zoneEl, fileKey) {
        const isPdfType = file.type === 'application/pdf';
        const isPdfExtension = file.name && file.name.toLowerCase().endsWith('.pdf');
        if (!isPdfType && !isPdfExtension) {
            alert('🚫 Only text-based PDF files are supported.');
            return;
        }

        // Limit upload size to 10MB to protect memory
        const MAX_FILE_SIZE = 10 * 1024 * 1024;
        if (file.size > MAX_FILE_SIZE) {
            alert(`🚫 File size exceeds 10MB limit (${formatBytes(file.size)}). Please upload a smaller file.`);
            return;
        }

        filesState[fileKey] = file;
        zoneEl.classList.add('file-selected');
        
        const fileInfoEl = document.getElementById(`${fileKey}-file-info`);
        fileInfoEl.textContent = `${file.name} (${formatBytes(file.size)})`;
        fileInfoEl.style.display = 'block';

        const removeBtn = document.getElementById(`remove-${fileKey}-file-btn`);
        if (removeBtn) {
            removeBtn.style.display = 'inline-flex';
        }

        // Check if both files are uploaded to enable the audit button
        if (filesState.lease && filesState.estoppel) {
            startAuditBtn.disabled = false;
        }
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // --- Client-Side PDF.js Text Extraction ---
    async function extractTextFromPDF(file, onProgress) {
        const fileReader = new FileReader();
        
        return new Promise((resolve, reject) => {
            fileReader.onload = async function() {
                try {
                    const typedarray = new Uint8Array(this.result);
                    const pdf = await pdfjsLib.getDocument(typedarray).promise;
                    const numPages = pdf.numPages;
                    let fullText = [];

                    for (let i = 1; i <= numPages; i++) {
                        if (onProgress) onProgress(i, numPages);
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map(item => item.str).join(' ');
                        fullText.push({ pageNum: i, text: pageText });
                    }
                    resolve(fullText);
                } catch (e) {
                    reject(e);
                }
            };
            fileReader.onerror = () => reject(new Error("File reading failed"));
            fileReader.readAsArrayBuffer(file);
        });
    }

    // --- Client-Side Lightweight PDF Page Counting ---
    async function getPDFPageCount(file) {
        const fileReader = new FileReader();
        return new Promise((resolve, reject) => {
            fileReader.onload = async function() {
                try {
                    const typedarray = new Uint8Array(this.result);
                    const pdf = await pdfjsLib.getDocument(typedarray).promise;
                    resolve(pdf.numPages);
                } catch (e) {
                    reject(e);
                }
            };
            fileReader.onerror = () => reject(new Error("File page count reading failed"));
            fileReader.readAsArrayBuffer(file);
        });
    }

    // --- Scanned PDF (OCR) and Multi-Pass Parsing Utilities ---
    function isScannedPDF(pages) {
        if (!pages || pages.length === 0) return true;
        
        // If any page has >100 characters of text, it is likely a text PDF, not scanned.
        const hasTextPage = pages.some(p => p.text && p.text.trim().length > 100);
        if (hasTextPage) return false;
        
        const totalTextLen = pages.reduce((sum, p) => sum + (p.text ? p.text.trim().length : 0), 0);
        const avgTextLen = totalTextLen / pages.length;
        console.log(`[OCR Check] Average characters per page: ${avgTextLen.toFixed(1)}`);
        return avgTextLen < 50;
    }

    async function loadPDFDocument(file) {
        const fileReader = new FileReader();
        return new Promise((resolve, reject) => {
            fileReader.onload = async function() {
                try {
                    const typedarray = new Uint8Array(this.result);
                    const pdf = await pdfjsLib.getDocument(typedarray).promise;
                    resolve(pdf);
                } catch (e) {
                    reject(e);
                }
            };
            fileReader.onerror = () => reject(new Error("File loading failed"));
            fileReader.readAsArrayBuffer(file);
        });
    }

    async function renderPDFPageToImage(pdfDoc, pageNum) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
        
        return canvas.toDataURL('image/jpeg', 0.85);
    }

    async function extractDocumentFeatures(file, docType, connectionMode, apiProvider, llmModel, apiKey, onProgress) {
        onProgress(0, 0, `Loading ${docType} document...`);
        const pdfDoc = await loadPDFDocument(file);
        const numPages = pdfDoc.numPages;
        
        // Step 1: Extract raw text first to determine if scanned
        let pagesText = [];
        for (let i = 1; i <= numPages; i++) {
            onProgress(i, numPages, `Extracting raw text: Page ${i}/${numPages}`);
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            pagesText.push({ pageNum: i, text: pageText });
        }
        
        const isScanned = isScannedPDF(pagesText);
        console.log(`[OCR Check] ${docType} document isScanned: ${isScanned}`);
        
        if (!isScanned) {
            // Text-extractable document: Pass 1 + Pass 2
            let relevantPageNums = [];
            if (numPages <= 5) {
                // Small document, use all pages
                relevantPageNums = Array.from({ length: numPages }, (_, i) => i + 1);
            } else {
                onProgress(0, 0, `Analyzing ${docType} layout & indices...`);
                // Create lightweight snippets of all pages
                const snippets = pagesText.map(p => `[Page ${p.pageNum}]\n${p.text.slice(0, 450)}`).join('\n\n');
                const systemPromptOverride = `You are a document routing assistant. Given a list of page snippets from a commercial ${docType} document, you must identify the page numbers (1-indexed) that contain terms regarding: basic tenancy terms, rent schedules/base rent, renewal options, security deposit, guarantor, or landlord defaults.
Return ONLY a valid JSON object in this format: {"pageNumbers": [1, 2, 5, 8]}. Do not include any conversational intro or outro text.`;
                const userPromptOverride = `Here are the snippets of each page in the document:\n\n${snippets}\n\nPlease identify the relevant page numbers.`;
                
                try {
                    const routeRes = await callOpenAIToExtract("", docType, connectionMode, apiProvider, llmModel, apiKey, null, systemPromptOverride, userPromptOverride);
                    console.log(`[Pass 1 Routing] ${docType} relevant pages returned:`, routeRes);
                    if (routeRes && Array.isArray(routeRes.pageNumbers)) {
                        relevantPageNums = routeRes.pageNumbers;
                    } else if (Array.isArray(routeRes)) {
                        relevantPageNums = routeRes;
                    } else if (routeRes && typeof routeRes === 'object') {
                        const arrKey = Object.keys(routeRes).find(k => Array.isArray(routeRes[k]));
                        if (arrKey) relevantPageNums = routeRes[arrKey];
                    }
                } catch (e) {
                    console.error(`[Pass 1 Routing Error] Failed to route ${docType}:`, e);
                    const isCritical = e.message.includes('Forbidden') || 
                                       e.message.includes('Unauthorized') || 
                                       e.message.includes('session_mismatch') || 
                                       e.message.includes('credit') || 
                                       e.message.includes('subscription') || 
                                       e.message.includes('key');
                    if (isCritical) throw e;
                }
                
                // Fallback
                if (!relevantPageNums || relevantPageNums.length === 0) {
                    console.log(`[Pass 1 Fallback] Defaulting to first 5 pages for ${docType}`);
                    relevantPageNums = Array.from({ length: Math.min(5, numPages) }, (_, i) => i + 1);
                }
            }
            
            // Pass 2: Extract text from only those relevant pages
            const filtered = pagesText.filter(p => relevantPageNums.includes(p.pageNum));
            const optimizedText = filtered.map(p => `--- PAGE ${p.pageNum} ---\n${p.text}`).join('\n\n');
            return { isScanned: false, text: optimizedText, pagesUsed: relevantPageNums };
        } else {
            // Scanned document: Pass 1 + Pass 2 (Vision)
            let relevantPageNums = [];
            
            // Pass 1: Render first 3 pages and send to vision route to locate Table of Contents / relevant pages
            const numRoutingPages = Math.min(3, numPages);
            const imageList = [];
            for (let i = 1; i <= numRoutingPages; i++) {
                onProgress(i, numRoutingPages, `Rendering preview page ${i}/${numRoutingPages} for OCR routing...`);
                const base64Img = await renderPDFPageToImage(pdfDoc, i);
                imageList.push(base64Img);
            }
            
            const systemPromptOverride = `You are a document routing assistant for scanned PDF audits. Look at the images of pages 1-3. Identify if there is a Table of Contents (TOC) or Index. Based on the TOC or the content, identify the page numbers (1-indexed) in the document that likely contain: basic tenancy terms (premises size, tenant name, start/expiry date), rent schedule, renewal options, security deposit, guarantor, or landlord defaults.
Return ONLY a valid JSON object in this format: {"pageNumbers": [1, 2, 5, 8]}. Do not include any conversational intro or outro text. If no TOC is visible, return a default list of [1, 2, 3, 4, 5].`;
            const userPromptOverride = `Identify relevant page numbers based on the Table of Contents or general structure.`;
            
            try {
                const routeRes = await callOpenAIToExtract("", docType, connectionMode, apiProvider, llmModel, apiKey, imageList, systemPromptOverride, userPromptOverride);
                console.log(`[Pass 1 Vision Routing] ${docType} relevant pages returned:`, routeRes);
                if (routeRes && Array.isArray(routeRes.pageNumbers)) {
                    relevantPageNums = routeRes.pageNumbers;
                } else if (Array.isArray(routeRes)) {
                    relevantPageNums = routeRes;
                } else if (routeRes && typeof routeRes === 'object') {
                    const arrKey = Object.keys(routeRes).find(k => Array.isArray(routeRes[k]));
                    if (arrKey) relevantPageNums = routeRes[arrKey];
                }
            } catch (e) {
                console.error(`[Pass 1 Vision Routing Error] Failed to route scanned ${docType}:`, e);
                const isCritical = e.message.includes('Forbidden') || 
                                   e.message.includes('Unauthorized') || 
                                   e.message.includes('session_mismatch') || 
                                   e.message.includes('credit') || 
                                   e.message.includes('subscription') || 
                                   e.message.includes('key');
                if (isCritical) throw e;
            }
            
            if (!relevantPageNums || relevantPageNums.length === 0) {
                console.log(`[Pass 1 Vision Fallback] Defaulting to first 5 pages for scanned ${docType}`);
                relevantPageNums = Array.from({ length: Math.min(5, numPages) }, (_, i) => i + 1);
            }
            
            // Pass 2: Render selected pages to base64 images
            const finalImages = [];
            const validPageNums = relevantPageNums.filter(num => num > 0 && num <= numPages);
            // Limit to max 8 pages to protect user vision tokens limits
            const limitedPageNums = validPageNums.slice(0, 8);
            
            for (let idx = 0; idx < limitedPageNums.length; idx++) {
                const pageNum = limitedPageNums[idx];
                onProgress(idx + 1, limitedPageNums.length, `Rendering page ${pageNum} for visual OCR audit...`);
                const base64Img = await renderPDFPageToImage(pdfDoc, pageNum);
                finalImages.push(base64Img);
            }
            
            return { isScanned: true, images: finalImages, pagesUsed: limitedPageNums };
        }
    }

    // --- Smart Text Slicing keyword index filter (Mitigates Technical Risk A) ---
    function sliceOptimizedPages(pagesArray) {
        // Target audit categories keywords
        const targetKeywords = ['rent', 'escalat', 'expir', 'terminat', 'deposit', 'cam', 'option', 'premises', 'sf', 'square', 'base rent'];
        let optimizedText = '';
        let includedPages = [];

        pagesArray.forEach(page => {
            const lowerText = page.text.toLowerCase();
            const containsKeyword = targetKeywords.some(kw => lowerText.includes(kw));
            if (containsKeyword) {
                optimizedText += `--- [PAGE ${page.pageNum}] ---\n${page.text}\n\n`;
                includedPages.push(page.pageNum);
            }
        });

        console.log(`Optimized text size: Included pages ${includedPages.join(', ')} out of ${pagesArray.length}`);
        return optimizedText || pagesArray.map(p => p.text).join('\n');
    }

    // --- Mock Demo Mode Dataset (Try with Sample Data) ---
    if (demoBtn) {
        demoBtn.addEventListener('click', async () => {
            if (pageCredits < 1) {
                alert(`🚫 Insufficient audit credits! The simulation requires 1 audit credit, but you have 0 credits left. Please top up your credits.`);
                creditsModal.classList.add('active');
                return;
            }

            showLoader("Processing mock lease PDF pages...");
            
            setTimeout(() => {
                showLoader("Abstracting Starbucks tenancy terms...");
                setTimeout(() => {
                    showLoader("Cross-checking lease against estoppel...");
                    
                    async function completeDemo() {
                        hideLoader();
                        loadDemoAuditData();
                        
                        try {
                            if (supabase) {
                                const connectionMode = localStorage.getItem('ta_connection_mode') || 'hosted';
                                
                                // Only deduct credits if NOT in BYOK (BYOB) mode
                                if (connectionMode !== 'byok') {
                                    const isUnlimited = hostedCredits >= 900000;
                                    if (!isUnlimited) {
                                        const { data: { user } } = await supabase.auth.getUser();
                                        const { error: deductErr } = await supabase.rpc('deduct_user_credits', { 
                                            target_user_id: user.id,
                                            pages_to_deduct: 1,
                                            plan_mode: 'hosted'
                                        });
                                        if (deductErr) throw deductErr;
                                    }
                                }

                                // Log audit record to audits table
                                const { error: logErr } = await supabase.from('audits').insert({
                                    tenant_name: auditData.metadata.tenantName,
                                    lease_file: auditData.metadata.leaseFile,
                                    estoppel_file: auditData.metadata.estoppelFile,
                                    match_score: auditData.summary.matchScore,
                                    red_flags: auditData.summary.redFlags,
                                    monthly_rent: auditData.summary.monthlyRent,
                                    premises_sf: auditData.summary.premisesSf,
                                    expiry_date: auditData.summary.expiryDate,
                                    records: auditData.records
                                });
                                if (logErr) throw logErr;

                                await loadUserProfileAndCredits();
                                await loadAuditHistory();
                            } else {
                                const connectionMode = localStorage.getItem('ta_connection_mode') || 'hosted';
                                if (connectionMode !== 'byok') {
                                    hostedCredits -= 1;
                                    localStorage.setItem('ta_hosted_credits', hostedCredits);
                                }
                                updateCreditsDisplay();
                            }
                            
                            const connectionMode = localStorage.getItem('ta_connection_mode') || 'hosted';
                            if (connectionMode === 'byok') {
                                alert("🚀 Simulated audit completed successfully!");
                            } else {
                                alert("✅ Simulated audit completed: Deducted 1 audit credit.");
                            }
                        } catch (err) {
                            console.error("Demo logging/deduction error:", err);
                            alert(`🚫 Failed to log simulation: ${err.message}`);
                        }
                    }
                    
                    setTimeout(completeDemo, 800);
                }, 800);
            }, 600);
        });
    }

    function loadDemoAuditData() {
        auditData = {
            metadata: {
                tenantName: "Starbucks Corporation",
                leaseFile: "starbucks_lease_stg101.pdf",
                estoppelFile: "signed_estoppel_starbucks.pdf",
                auditModel: "Simulation (Deterministic Caches)"
            },
            summary: {
                matchScore: 54, // 6 Match, 2 Warning, 3 Mismatch (6/11 = 54%)
                redFlags: 3,
                monthlyRent: "$12,000.00",
                premisesSf: "2,200 SF",
                expiryDate: "11/30/2031"
            },
            records: [
                {
                    term: "Tenant Name",
                    leaseVal: "Starbucks Corporation",
                    estoppelVal: "Starbucks Corp.",
                    status: "match",
                    leaseCite: "Page 1, Preamble: 'This Lease made by and between Starbucks Corporation...'",
                    estoppelCite: "Paragraph 1: 'The undersigned tenant is Starbucks Corp.'"
                },
                {
                    term: "Suite / Unit Number",
                    leaseVal: "Suite 101-A",
                    estoppelVal: "Suite 101-A",
                    status: "match",
                    leaseCite: "Section 1.1: 'Premises is designated as Suite 101-A, as shown on Exhibit A.'",
                    estoppelCite: "Paragraph 3: 'The premises occupied is designated as Suite 101-A.'"
                },
                {
                    term: "Premises Size",
                    leaseVal: "2,200 Square Feet",
                    estoppelVal: "2,200 SF",
                    status: "match",
                    leaseCite: "Section 1.2: 'Premises comprises approximately 2,200 square feet...'",
                    estoppelCite: "Paragraph 3: 'The premises occupies 2,200 SF of retail space.'"
                },
                {
                    term: "Current Monthly Rent",
                    leaseVal: "$12,500.00 / month",
                    estoppelVal: "$12,000.00 / month",
                    status: "mismatch",
                    leaseCite: "Section 4.1: 'Base rent shall be $12,500.00 monthly during year 1.'",
                    estoppelCite: "Paragraph 4: 'Current base rent paid is $12,000.00 per month.'"
                },
                {
                    term: "Lease Expiration Date",
                    leaseVal: "October 31, 2031",
                    estoppelVal: "November 30, 2031",
                    status: "mismatch",
                    leaseCite: "Section 2.3: 'Lease expires ten (10) years from commencement, on October 31, 2031.'",
                    estoppelCite: "Paragraph 2: 'Lease term ends on November 30, 2031.'"
                },
                {
                    term: "Security Deposit",
                    leaseVal: "$25,000.00",
                    estoppelVal: "$25,000.00",
                    status: "match",
                    leaseCite: "Section 5: 'Tenant shall deposit with Landlord the sum of $25,000.00 as security.'",
                    estoppelCite: "Paragraph 7: 'Security deposit held by landlord is $25,000.00.'"
                },
                {
                    term: "Renewal Options",
                    leaseVal: "Two (2) options of 5 years each with 180 days notice",
                    estoppelVal: "One (1) option remaining with 90 days notice",
                    status: "mismatch",
                    leaseCite: "Exhibit E: 'Tenant has two (2) consecutive options to extend for five years each. Notice must be given 180 days prior.'",
                    estoppelCite: "Paragraph 6: 'Tenant has one remaining 5-year renewal option. Notice window is 90 days.'"
                },
                {
                    term: "CAM & Operating Caps",
                    leaseVal: "8.5% pro-rata share. Annual cap of 3% on increases.",
                    estoppelVal: "8.5% pro-rata share. (No mention of 3% cap)",
                    status: "warning",
                    leaseCite: "Section 6.2: 'Tenant's pro-rata share of operating costs is 8.5%. Increases shall be capped at 3% annually.'",
                    estoppelCite: "Paragraph 5: 'Tenant is responsible for 8.5% share of common area expenses.'"
                },
                {
                    term: "Lease Guarantor",
                    leaseVal: "Starbucks Corporation (Parent Guarantee)",
                    estoppelVal: "Starbucks Corporation (Parent)",
                    status: "match",
                    leaseCite: "Section 18.4: 'Guarantor of Tenant's obligations hereunder is Starbucks Corporation, a Washington corp.'",
                    estoppelCite: "Paragraph 9: 'Lease obligations are guaranteed by Starbucks Corporation.'"
                },
                {
                    term: "Prepaid Rent",
                    leaseVal: "First month's rent of $12,500.00 paid in advance.",
                    estoppelVal: "Not Mentioned",
                    status: "warning",
                    leaseCite: "Section 4.3: 'Tenant shall prepay the first full month's rent upon execution.'",
                    estoppelCite: "Paragraph 8: 'Prepaid rent: Not Mentioned.'"
                },
                {
                    term: "Landlord Default Status",
                    leaseVal: "Not Mentioned",
                    estoppelVal: "None. Landlord is in full compliance.",
                    status: "warning",
                    leaseCite: "Lease text does not reference active landlord defaults.",
                    estoppelCite: "Paragraph 10: 'To Tenant's knowledge, Landlord is not in default under any lease covenants.'"
                }
            ]
        };

        renderAuditResults();
    }

    // --- Action: Run Live AI Lease Audit ---
    async function runLiveAudit() {
        const connectionMode = localStorage.getItem('ta_connection_mode') || 'hosted';
        const apiProvider = localStorage.getItem('ta_api_provider') || 'openai';
        const llmModel = localStorage.getItem('ta_llm_model') || 'gpt-4o-mini';
        const apiKey = localStorage.getItem('ta_api_key');
        
        if (connectionMode === 'byok' && !apiKey) {
            alert("⚙️ Please configure your connection API Key first. Click 'API Settings' in the header.");
            settingsModal.classList.add('active');
            return;
        }

        try {
            currentAuditTransactionId = generateUUID();
            showLoader("Initializing audit process...");
            
            const leasePagesCount = await getPDFPageCount(filesState.lease);
            const estoppelPagesCount = await getPDFPageCount(filesState.estoppel);
            const totalPagesNeeded = leasePagesCount + estoppelPagesCount;
            
            if (connectionMode !== 'byok' && pageCredits < 1) {
                hideLoader();
                alert(`🚫 Insufficient audit credits! This audit requires 1 audit credit, but you only have ${pageCredits} credits left. Please top up your credits.`);
                creditsModal.classList.add('active');
                return;
            }

            // Step 1: Feature extract lease (determines if text or scanned, handles multi-pass OCR/routing)
            const leaseResult = await extractDocumentFeatures(
                filesState.lease,
                'lease',
                connectionMode,
                apiProvider,
                llmModel,
                apiKey,
                (curr, total, phase) => {
                    if (phase.includes('Loading')) {
                        showLoader(phase);
                    } else if (phase.includes('raw text')) {
                        showLoader(`Reading Lease PDF: Page ${curr}/${total}`);
                    } else if (phase.includes('layout')) {
                        showLoader("Routing relevant Lease pages...");
                    } else if (phase.includes('scanned')) {
                        showLoader("Routing scanned Lease layout (OCR)...");
                    } else if (phase.includes('preview')) {
                        showLoader(`Rendering Lease routing preview: Page ${curr}/${total}`);
                    } else if (phase.includes('visual OCR')) {
                        showLoader(`Rendering Lease for OCR extraction: Page ${curr}/${total}`);
                    } else {
                        showLoader(phase);
                    }
                }
            );

            // Step 2: Feature extract estoppel
            const estoppelResult = await extractDocumentFeatures(
                filesState.estoppel,
                'estoppel',
                connectionMode,
                apiProvider,
                llmModel,
                apiKey,
                (curr, total, phase) => {
                    if (phase.includes('Loading')) {
                        showLoader(phase);
                    } else if (phase.includes('raw text')) {
                        showLoader(`Reading Estoppel PDF: Page ${curr}/${total}`);
                    } else if (phase.includes('layout')) {
                        showLoader("Routing relevant Estoppel pages...");
                    } else if (phase.includes('scanned')) {
                        showLoader("Routing scanned Estoppel layout (OCR)...");
                    } else if (phase.includes('preview')) {
                        showLoader(`Rendering Estoppel routing preview: Page ${curr}/${total}`);
                    } else if (phase.includes('visual OCR')) {
                        showLoader(`Rendering Estoppel for OCR extraction: Page ${curr}/${total}`);
                    } else {
                        showLoader(phase);
                    }
                }
            );

            // Step 3: Run final analyses
            showLoader("Analyzing Lease terms with AI...");
            const leaseExtraction = await callOpenAIToExtract(
                leaseResult.text || "",
                'lease',
                connectionMode,
                apiProvider,
                llmModel,
                apiKey,
                leaseResult.images || null
            );
            
            showLoader("Analyzing Estoppel statements with AI...");
            const estoppelExtraction = await callOpenAIToExtract(
                estoppelResult.text || "",
                'estoppel',
                connectionMode,
                apiProvider,
                llmModel,
                apiKey,
                estoppelResult.images || null
            );

            showLoader("Auditing discrepancies...");
            await performAILinkedAudit(leaseExtraction, estoppelExtraction);
            
            // Log audit to Database and reload profile
            try {
                if (supabase) {
                    const { data: { user } } = await supabase.auth.getUser();
                    
                    const { error: logErr } = await supabase.from('audits').insert({
                        user_id: user ? user.id : null,
                        tenant_name: auditData.metadata.tenantName,
                        lease_file: auditData.metadata.leaseFile,
                        estoppel_file: auditData.metadata.estoppelFile,
                        match_score: auditData.summary.matchScore,
                        red_flags: auditData.summary.redFlags,
                        monthly_rent: auditData.summary.monthlyRent,
                        premises_sf: auditData.summary.premisesSf,
                        expiry_date: auditData.summary.expiryDate,
                        records: auditData.records
                    });
                    if (logErr) throw logErr;

                    await loadUserProfileAndCredits();
                    await loadAuditHistory();
                } else {
                    // Fallback mock mode
                    const connectionMode = localStorage.getItem('ta_connection_mode') || 'hosted';
                    if (connectionMode !== 'byok') {
                        if (hostedCredits < 900000) {
                            hostedCredits -= 1;
                            localStorage.setItem('ta_hosted_credits', hostedCredits);
                        }
                    }
                    updateCreditsDisplay();
                }
                
                hideLoader();
                const connectionMode = localStorage.getItem('ta_connection_mode') || 'hosted';
                if (connectionMode === 'byok') {
                    alert(`🎉 Audit completed successfully using your custom API Key!`);
                } else {
                    const isUnlimited = hostedCredits >= 900000;
                    const deductMsg = isUnlimited ? "" : ` Deducted 1 audit credit.`;
                    alert(`🎉 Audit completed successfully!${deductMsg}`);
                }
            } catch (err) {
                console.error("Deduction/Logging error:", err);
                hideLoader();
                alert(`🚫 Audit finished, but database update failed: ${err.message}`);
            }
            
        } catch (err) {
            console.error(err);
            hideLoader();
            alert(`🚫 AI Extraction Error: ${err.message}\n\nPlease check your configuration, network, or server status.`);
        }
    }

    if (startAuditBtn) {
        startAuditBtn.addEventListener('click', () => {
            const connectionMode = localStorage.getItem('ta_connection_mode') || 'hosted';
            const apiKey = localStorage.getItem('ta_api_key');
            
            if (connectionMode === 'byok' && !apiKey) {
                alert("⚙️ Please configure your connection API Key first. Click 'API Settings' in the header.");
                settingsModal.classList.add('active');
                return;
            }

            // Open disclaimer modal
            if (disclaimerAgreeCheckbox) disclaimerAgreeCheckbox.checked = false;
            if (disclaimerProceedBtn) disclaimerProceedBtn.disabled = true;
            if (disclaimerModal) disclaimerModal.classList.add('active');
        });
    }

    if (disclaimerProceedBtn) {
        disclaimerProceedBtn.addEventListener('click', () => {
            if (disclaimerModal) disclaimerModal.classList.remove('active');
            runLiveAudit();
        });
    }

    // --- API Calls Router (Secure CORS Proxy via Backend) ---
    async function callOpenAIToExtract(text, docType, connectionMode, provider, model, apiKey, images = null, systemPromptOverride = null, userPromptOverride = null) {
        // Build payload based on mode.
        // In Hosted SaaS mode, we run Claude Sonnet via server key.
        const payload = {
            text: text,
            images: images,
            docType: docType,
            connectionMode: connectionMode,
            provider: connectionMode === 'hosted' ? 'anthropic' : provider,
            model: connectionMode === 'hosted' ? 'claude-sonnet-4-6' : model,
            apiKey: connectionMode === 'hosted' ? null : apiKey,
            systemPromptOverride: systemPromptOverride,
            userPromptOverride: userPromptOverride
        };

        const headers = {
            "Content-Type": "application/json",
            "X-Session-ID": getOrGenerateSessionId(),
            "X-Transaction-ID": currentAuditTransactionId
        };

        if (supabase) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                headers["Authorization"] = `Bearer ${session.access_token}`;
            }
        }

        const response = await fetch("/api/audit", {
            method: "POST",
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server returned error status ${response.status}`);
        }

        return await response.json();
    }



    // --- Comparison Auditor Engine (Lease vs Estoppel) ---
    async function performAILinkedAudit(leaseJson, estoppelJson) {
        const terms = [
            { key: "tenantName", label: "Tenant Name" },
            { key: "suiteNumber", label: "Suite / Unit Number" },
            { key: "premisesSf", label: "Premises Size" },
            { key: "monthlyRent", label: "Current Monthly Rent" },
            { key: "expiryDate", label: "Lease Expiration Date" },
            { key: "securityDeposit", label: "Security Deposit" },
            { key: "renewalOptions", label: "Renewal Options" },
            { key: "camShare", label: "CAM & Operating Caps" },
            { key: "guarantorName", label: "Lease Guarantor" },
            { key: "prepaidRent", label: "Prepaid Rent" },
            { key: "landlordDefault", label: "Landlord Default Status" }
        ];

        let records = [];
        let redFlags = 0;
        let matchCount = 0;
        let warningCount = 0;

        terms.forEach(t => {
            const lease = leaseJson[t.key] || { value: "Not Mentioned", quote: "No citation found." };
            const estoppel = estoppelJson[t.key] || { value: "Not Mentioned", quote: "No citation found." };
            
            let status = "match";
            
            // Normalize values for comparison (handles variations, spaces, and defaults)
            function normalizeVal(val) {
                if (!val) return '';
                let norm = val.toLowerCase();
                // Strip parentheticals and brackets first, e.g. "(a Delaware corporation)"
                norm = norm.replace(/\(.*?\)/g, '');
                norm = norm.replace(/\[.*?\]/g, '');
                
                // Strip cents/decimal .00 if present, e.g. "$12,000.00" -> "$12,000"
                norm = norm.replace(/\.00\b/g, '');
                
                // Normalize square footage variations
                norm = norm.replace(/rentable\s*square\s*feet|square\s*feet|square\s*foot|sq\s*ft|sqft|\bsf\b/g, '');

                // Strip common filler words/phrases to prevent false mismatches
                const fillers = [
                    /per\s*month/g, /monthly\s*base\s*rent/g, /monthly\s*rent/g, /base\s*rent/g,
                    /rent/g, /monthly/g, /yearly/g, /annually/g, /annual/g, /per\s*annum/g,
                    /unit/g, /room/g, /rentable/g, /approximately/g, /exactly/g
                ];
                fillers.forEach(pattern => {
                    norm = norm.replace(pattern, '');
                });

                // Remove apostrophes first so "int'l" -> "intl"
                norm = norm.replace(/'/g, '');
                // Replace remaining non-alphanumeric chars with spaces to preserve word boundaries
                norm = norm.replace(/[^a-z0-9\s]/g, ' ');
                // Reduce multiple spaces to single spaces
                norm = norm.replace(/\s+/g, ' ').trim();
                
                const abbreviations = {
                    'intl': 'international',
                    'corp': 'corporation',
                    'inc': 'incorporated',
                    'co': 'company',
                    'ltd': 'limited',
                    'llc': 'limited liability company',
                    'lp': 'limited partnership',
                    'assoc': 'association',
                    'mfg': 'manufacturing',
                    'univ': 'university',
                    'dept': 'department'
                };
                
                let words = norm.split(' ');
                words = words.map(w => abbreviations[w] || w);
                return words.join(' ');
            }

            const lVal = normalizeVal(lease.value);
            const eVal = normalizeVal(estoppel.value);

            const isLMissing = lVal === 'not found' || lVal === 'not mentioned' || lVal === '';
            const isEMissing = eVal === 'not found' || eVal === 'not mentioned' || eVal === '';

            if (isLMissing || isEMissing) {
                status = "warning";
                warningCount++;
            } else if (lVal === eVal) {
                status = "match";
                matchCount++;
            } else {
                status = "mismatch";
                redFlags++;
            }

            console.log(`[Audit Comparison Baseline] term: "${t.label}" | lease: "${lease.value}" (normalized: "${lVal}") | estoppel: "${estoppel.value}" (normalized: "${eVal}") | status: "${status}"`);

            records.push({
                term: t.label,
                leaseVal: lease.value,
                estoppelVal: estoppel.value,
                status: status,
                leaseCite: lease.quote,
                estoppelCite: estoppel.quote,
                verifiedReason: "Verified using local standard rules."
            });
        });

        // Calculate baseline score awarding 50% weight for warning entries
        let score = Math.round(((matchCount + (warningCount * 0.5)) / terms.length) * 100);

        const connectionMode = localStorage.getItem('ta_connection_mode') || 'hosted';
        const apiProvider = localStorage.getItem('ta_api_provider') || 'openai';
        const llmModel = localStorage.getItem('ta_llm_model') || 'gpt-4o-mini';
        const activeModelName = connectionMode === 'hosted' ? 'Claude Sonnet (Hosted)' : `${llmModel} (${apiProvider.toUpperCase()})`;

        auditData = {
            metadata: {
                tenantName: leaseJson.tenantName.value || "Unknown Tenant",
                leaseFile: filesState.lease.name,
                estoppelFile: filesState.estoppel.name,
                auditModel: activeModelName
            },
            summary: {
                matchScore: score,
                redFlags: redFlags,
                monthlyRent: estoppelJson.monthlyRent.value || "Unknown",
                premisesSf: leaseJson.premisesSf.value || "Unknown",
                expiryDate: leaseJson.expiryDate.value || "Unknown"
            },
            records: records
        };

        // Render baseline instantly to the screen
        renderAuditResults();

        // Perform semantic AI verification if connected
        const apiKey = localStorage.getItem('ta_api_key');
        const canVerify = connectionMode === 'hosted' || (connectionMode === 'byok' && apiKey);

        if (canVerify) {
            try {
                console.log("[AI verification] Running semantic compliance comparison in background...");
                showLoader("AI is verifying compliance audit...");
                
                const payload = {
                    leaseJson,
                    estoppelJson,
                    connectionMode,
                    provider: connectionMode === 'hosted' ? 'anthropic' : apiProvider,
                    model: connectionMode === 'hosted' ? 'claude-sonnet-4-6' : llmModel,
                    apiKey: connectionMode === 'hosted' ? null : apiKey
                };
                
                const headers = {
                    "Content-Type": "application/json",
                    "X-Session-ID": getOrGenerateSessionId(),
                    "X-Transaction-ID": currentAuditTransactionId
                };

                if (supabase) {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session) {
                        headers["Authorization"] = `Bearer ${session.access_token}`;
                    }
                }

                const response = await fetch("/api/compare", {
                    method: "POST",
                    headers: headers,
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    const aiReport = await response.json();
                    console.log("[AI Verification Report]:", aiReport);
                    
                    let verifiedMatchCount = 0;
                    let verifiedRedFlags = 0;
                    let verifiedWarningCount = 0;
                    
                    // Merge verified statuses
                    auditData.records = auditData.records.map(rec => {
                        const t = terms.find(term => term.label === rec.term);
                        if (t && aiReport[t.key]) {
                            const aiField = aiReport[t.key];
                            const status = aiField.status || rec.status;
                            const reason = aiField.reason || "Verified semantically.";
                            
                            if (status === 'match') verifiedMatchCount++;
                            else if (status === 'mismatch') verifiedRedFlags++;
                            else if (status === 'warning') verifiedWarningCount++;
                            
                            return {
                                ...rec,
                                status: status,
                                verifiedReason: reason
                            };
                        } else {
                            if (rec.status === 'match') verifiedMatchCount++;
                            else if (rec.status === 'mismatch') verifiedRedFlags++;
                            else if (rec.status === 'warning') verifiedWarningCount++;
                            return rec;
                        }
                    });
                    
                    const verifiedScore = Math.round(((verifiedMatchCount + (verifiedWarningCount * 0.5)) / terms.length) * 100);
                    auditData.summary.matchScore = verifiedScore;
                    auditData.summary.redFlags = verifiedRedFlags;
                    
                    // Re-render UI with premium AI-verified badges
                    renderAuditResults();
                    console.log("[AI Verification] Compliance audit successfully verified & refined semantically.");
                } else {
                    const errData = await response.json().catch(() => ({}));
                    console.error("[AI Verification Failed] Backend returned status error:", errData.error || response.status);
                }
            } catch (e) {
                console.error("[AI Verification Error] Network or client failure:", e);
            } finally {
                hideLoader();
            }
        }
    }

    // --- Render Results UI Panel ---
    function renderAuditResults() {
        if (!auditData) return;

        // Populate KPIs
        scoreVal.textContent = `${auditData.summary.matchScore}%`;
        animateScoreDial(auditData.summary.matchScore);
        
        kpiRedFlags.textContent = auditData.summary.redFlags;
        kpiMonthlyRent.textContent = auditData.summary.monthlyRent;
        kpiPremisesSf.textContent = auditData.summary.premisesSf;
        kpiExpiryDate.textContent = auditData.summary.expiryDate;

        // Meta Info
        metaTenantName.textContent = auditData.metadata.tenantName;
        metaLeaseFile.textContent = auditData.metadata.leaseFile;
        metaEstoppelFile.textContent = auditData.metadata.estoppelFile;
        metaAuditModel.textContent = auditData.metadata.auditModel;

        // Render Table
        auditResultsTbody.innerHTML = '';
        auditData.records.forEach((rec, idx) => {
            const tr = document.createElement('tr');
            
            let statusBadge = '';
            if (rec.status === 'match') {
                statusBadge = '<span class="status-pill match-ok"><i data-lucide="check-circle"></i> Match</span>';
            } else if (rec.status === 'warning') {
                statusBadge = '<span class="status-pill match-warning"><i data-lucide="alert-triangle"></i> Warning</span>';
            } else {
                statusBadge = '<span class="status-pill match-mismatch"><i data-lucide="x-circle"></i> Mismatch</span>';
            }

            tr.innerHTML = `
                <td class="term-name-cell">${rec.term}</td>
                <td>
                    <div class="term-val-box">
                        <span class="term-val-title">${escapeHtml(rec.leaseVal)}</span>
                    </div>
                </td>
                <td>
                    <div class="term-val-box">
                        <span class="term-val-title">${escapeHtml(rec.estoppelVal)}</span>
                    </div>
                </td>
                <td>${statusBadge}</td>
                <td style="text-align: right;">
                    <button class="audit-action-btn" data-index="${idx}">Verify Quotes</button>
                </td>
            `;

            auditResultsTbody.appendChild(tr);
        });

        // Set table verification drawer triggers
        auditResultsTbody.querySelectorAll('.audit-action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = btn.getAttribute('data-index');
                const rec = auditData.records[idx];
                
                leaseQuoteBox.textContent = rec.leaseCite || "No specific paragraph cited.";
                estoppelQuoteBox.textContent = rec.estoppelCite || "No specific paragraph cited.";
                
                verificationDrawer.style.display = 'grid';
                verificationDrawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        });

        // Hide upload panel, show results panel
        resultsPanel.style.display = 'block';
        
        // Auto scroll to results panel smoothly
        resultsPanel.scrollIntoView({ behavior: 'smooth' });

        // Update Lucide SVG icons dynamically rendered in the table
        if (window.lucide) {
            lucide.createIcons();
        }
    }

    // --- Helper Score Dial Animation ---
    function animateScoreDial(score) {
        // SVG circumference = 2 * PI * r = 2 * 3.14159 * 58 = 364.42
        const c = 364.4;
        const offset = c - (score / 100) * c;
        scoreGaugeFill.style.strokeDashoffset = offset;
        
        // Color coding dial based on score
        scoreGaugeFill.className.baseVal = "gauge-fill";
        if (score >= 90) {
            scoreGaugeFill.classList.add("gauge-fill-emerald");
        } else if (score >= 70) {
            scoreGaugeFill.classList.add("gauge-fill-purple");
        } else if (score >= 50) {
            scoreGaugeFill.classList.add("gauge-fill-orange");
        } else {
            scoreGaugeFill.classList.add("gauge-fill-red");
        }
    }

    // --- Export Audit to CSV report ---
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => {
            if (!auditData) return;

            const headers = ["Audited Term", "Lease Contract Value", "Tenant Estoppel Value", "Verification Status", "Lease Reference Citation", "Estoppel Reference Citation"];
            const csvRows = [headers.join(",")];

            auditData.records.forEach(r => {
                csvRows.push([
                    `"${r.term.replace(/"/g, '""')}"`,
                    `"${r.leaseVal.replace(/"/g, '""')}"`,
                    `"${r.estoppelVal.replace(/"/g, '""')}"`,
                    `"${r.status.toUpperCase()}"`,
                    `"${(r.leaseCite || '').replace(/"/g, '""')}"`,
                    `"${(r.estoppelCite || '').replace(/"/g, '""')}"`
                ].join(","));
            });

            const csvString = csvRows.join("\n");
            const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            
            link.setAttribute("href", url);
            link.setAttribute("download", `LeaseAlign_due_diligence_report_${new Date().toISOString().substring(0, 10)}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    // --- Export Audit to PDF report ---
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', async () => {
            if (!auditData) return;
            
            showLoader("Generating PDF Report...");
            
            try {
                const { jsPDF } = window.jspdf;
                
                // Create a temporary container for rendering
                const tempDiv = document.createElement('div');
                tempDiv.style.position = 'absolute';
                tempDiv.style.left = '-9999px';
                tempDiv.style.top = '-9999px';
                tempDiv.style.width = '700px'; // fixed width for consistent scaling
                tempDiv.style.backgroundColor = '#ffffff';
                tempDiv.style.color = '#1f2937';
                tempDiv.style.padding = '30px';
                tempDiv.style.fontFamily = "'Outfit', 'Helvetica Neue', Helvetica, Arial, sans-serif";
                tempDiv.style.boxSizing = 'border-box';
                
                // Inject the HTML report content
                tempDiv.innerHTML = `
                    <div style="border-bottom: 2px solid #e5e7eb; padding-bottom: 15px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center;">
                        <div style="flex: 1;">
                            <h1 style="font-size: 22px; font-weight: 800; color: #7c3aed; margin: 0; font-family: 'Outfit', sans-serif;">LeaseAlign AI</h1>
                            <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280; margin: 2px 0 0 0;">Commercial Lease & Estoppel Due Diligence</p>
                        </div>
                        <div style="text-align: right; flex: 1;">
                            <h2 style="font-size: 16px; font-weight: 700; margin: 0; color: #111827; font-family: 'Outfit', sans-serif;">Transaction Due Diligence Report</h2>
                            <p style="font-size: 11px; color: #6b7280; margin: 4px 0 0 0;">Generated: ${new Date().toLocaleString()}</p>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 25px; background: #f9fafb; padding: 14px; border-radius: 8px; border: 1px solid #f3f4f6; font-size: 12px;">
                        <div><strong style="color: #374151;">Tenant Name:</strong> ${escapeHtml(auditData.metadata.tenantName)}</div>
                        <div><strong style="color: #374151;">Audit Model:</strong> ${escapeHtml(auditData.metadata.auditModel)}</div>
                        <div style="grid-column: span 2; margin-top: 4px;"><strong style="color: #374151;">Source Lease File:</strong> ${escapeHtml(auditData.metadata.leaseFile)}</div>
                        <div style="grid-column: span 2; margin-top: 4px;"><strong style="color: #374151;">Source Estoppel File:</strong> ${escapeHtml(auditData.metadata.estoppelFile)}</div>
                    </div>

                    <h3 style="font-size: 14px; font-weight: 700; color: #111827; margin: 0 0 12px 0; border-left: 4px solid #7c3aed; padding-left: 8px; text-transform: uppercase; letter-spacing: 0.05em; font-family: 'Outfit', sans-serif;">Executive Audit Summary</h3>
                    <div style="display: flex; gap: 10px; margin-bottom: 25px; width: 100%;">
                        <div style="border: 1px solid #d8b4fe; border-radius: 8px; padding: 12px 8px; text-align: center; background: #faf5ff; flex: 1; min-width: 0;">
                            <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; margin-bottom: 4px;">Match Score</div>
                            <div style="font-size: 16px; font-weight: 800; color: #7c3aed;">${auditData.summary.matchScore}%</div>
                        </div>
                        <div style="border: 1px solid #fca5a5; border-radius: 8px; padding: 12px 8px; text-align: center; background: #fef2f2; flex: 1; min-width: 0;">
                            <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; margin-bottom: 4px;">Red Flags</div>
                            <div style="font-size: 16px; font-weight: 800; color: #dc2626;">${auditData.summary.redFlags}</div>
                        </div>
                        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 8px; text-align: center; background: #ffffff; flex: 1; min-width: 0;">
                            <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; margin-bottom: 4px;">Monthly Rent</div>
                            <div style="font-size: 16px; font-weight: 800; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(auditData.summary.monthlyRent)}</div>
                        </div>
                        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 8px; text-align: center; background: #ffffff; flex: 1; min-width: 0;">
                            <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; margin-bottom: 4px;">Premises SF</div>
                            <div style="font-size: 16px; font-weight: 800; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(auditData.summary.premisesSf)}</div>
                        </div>
                        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 8px; text-align: center; background: #ffffff; flex: 1; min-width: 0;">
                            <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; margin-bottom: 4px;">Expiry Date</div>
                            <div style="font-size: 16px; font-weight: 800; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(auditData.summary.expiryDate)}</div>
                        </div>
                    </div>

                    <h3 style="font-size: 14px; font-weight: 700; color: #111827; margin: 25px 0 12px 0; border-left: 4px solid #7c3aed; padding-left: 8px; text-transform: uppercase; letter-spacing: 0.05em; font-family: 'Outfit', sans-serif;">Lease vs. Estoppel Comparison Matrix</h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 25px;">
                        <thead>
                            <tr style="background: #f3f4f6;">
                                <th style="width: 20%; text-align: left; padding: 8px 10px; border: 1px solid #e5e7eb; font-weight: 600; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; color: #374151;">Term Audited</th>
                                <th style="width: 33%; text-align: left; padding: 8px 10px; border: 1px solid #e5e7eb; font-weight: 600; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; color: #374151;">Lease Agreement Value & Citation</th>
                                <th style="width: 33%; text-align: left; padding: 8px 10px; border: 1px solid #e5e7eb; font-weight: 600; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; color: #374151;">Estoppel Certificate Value & Citation</th>
                                <th style="width: 14%; text-align: center; padding: 8px 10px; border: 1px solid #e5e7eb; font-weight: 600; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; color: #374151;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${auditData.records.map(r => {
                                let badgeBg = '#fee2e2';
                                let badgeColor = '#991b1b';
                                let statusText = 'Mismatch';
                                if (r.status === 'match') {
                                    badgeBg = '#d1fae5';
                                    badgeColor = '#065f46';
                                    statusText = 'Verified';
                                } else if (r.status === 'warning') {
                                    badgeBg = '#ffedd5';
                                    badgeColor = '#9a3412';
                                    statusText = 'Warning';
                                }
                                return `
                                <tr>
                                    <td style="font-weight: 600; padding: 10px; border: 1px solid #e5e7eb; vertical-align: top; color: #111827;">${escapeHtml(r.term)}</td>
                                    <td style="padding: 10px; border: 1px solid #e5e7eb; vertical-align: top;">
                                        <div style="font-weight: 600; color: #1f2937;">${escapeHtml(r.leaseVal)}</div>
                                        ${r.leaseCite ? `<div style="font-size: 9px; color: #4b5563; margin-top: 5px; padding-top: 5px; border-top: 1px dashed #e5e7eb; font-style: italic; line-height: 1.3;">Quote: "${escapeHtml(r.leaseCite)}"</div>` : ''}
                                    </td>
                                    <td style="padding: 10px; border: 1px solid #e5e7eb; vertical-align: top;">
                                        <div style="font-weight: 600; color: #1f2937;">${escapeHtml(r.estoppelVal)}</div>
                                        ${r.estoppelCite ? `<div style="font-size: 9px; color: #4b5563; margin-top: 5px; padding-top: 5px; border-top: 1px dashed #e5e7eb; font-style: italic; line-height: 1.3;">Quote: "${escapeHtml(r.estoppelCite)}"</div>` : ''}
                                    </td>
                                    <td style="text-align: center; vertical-align: middle; padding: 10px; border: 1px solid #e5e7eb;">
                                        <span style="font-size: 8px; font-weight: 700; text-transform: uppercase; padding: 3px 6px; border-radius: 4px; display: inline-block; background: ${badgeBg}; color: ${badgeColor}; font-family: sans-serif;">${statusText}</span>
                                    </td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>

                    <div style="margin-top: 30px; border-top: 1px dashed #d1d5db; padding-top: 12px; font-size: 9px; color: #6b7280; text-align: center; line-height: 1.4; font-style: italic;">
                        ⚠️ <strong>Legal Disclaimer:</strong> LeaseAlign AI is an LLM-assisted audit utility. All comparison results are for informational purposes only and must be verified by qualified legal counsel prior to closing.
                    </div>
                    <div style="text-align: center; font-size: 10px; color: #9ca3af; margin-top: 12px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
                        <p>CONFIDENTIAL — Prepared for B2B Transaction Due Diligence — Powered by LeaseAlign AI (leasealign.io)</p>
                    </div>
                `;
                
                document.body.appendChild(tempDiv);
                
                // Let jsPDF render the HTML element
                const doc = new jsPDF('p', 'pt', 'a4');
                const pdfName = `LeaseAlign_AI_Report_${auditData.metadata.tenantName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
                
                await doc.html(tempDiv, {
                    callback: function (pdf) {
                        pdf.save(pdfName);
                        document.body.removeChild(tempDiv);
                        hideLoader();
                    },
                    margin: [30, 30, 30, 30],
                    autoPaging: 'text',
                    width: 535, // A4 printable width is 595 - margins (60 pt)
                    windowWidth: 700 // element pixel width mapping
                });
            } catch (err) {
                console.error("[PDF Export Error] Failed to generate PDF via jsPDF:", err);
                alert("❌ Failed to generate PDF report. Please try again.");
                hideLoader();
            }
        });
    }

    // --- Loader Controls ---
    function showLoader(statusText) {
        auditLoader.style.display = 'flex';
        loaderStatusText.textContent = statusText;
    }

    function hideLoader() {
        auditLoader.style.display = 'none';
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Initialize Lucide icons on page load
    if (window.lucide) {
        lucide.createIcons();
    }

    // Verify seat restrictions in real-time when switching back to this browser/tab
    window.addEventListener('focus', () => {
        if (isLoggedIn && supabase) {
            console.log("[Window Focus] Verifying seat session validity...");
            loadUserProfileAndCredits();
        }
    });

    // Sync session across tabs dynamically in real-time
    window.addEventListener('storage', async (e) => {
        if (e.key === 'ta_session_id') {
            console.log("[Storage Sync] Session ID changed in another tab/window. New ID:", e.newValue);
            if (!e.newValue) {
                // Session cleared (logout)
                isLoggedIn = false;
                userEmail = '';
                resetAppSessionState();
                updateNavUI();
                showView('login');
            } else {
                // Session sync login
                isLoggedIn = true;
                userEmail = localStorage.getItem('ta_user_email') || '';
                if (userEmailDisplay) userEmailDisplay.textContent = userEmail;
                if (supabase) {
                    await loadUserProfileAndCredits();
                    await loadAuditHistory();
                } else {
                    hostedCredits = parseInt(localStorage.getItem('ta_hosted_credits') || '0', 10);
                    byokCredits = parseInt(localStorage.getItem('ta_byok_credits') || '0', 10);
                }
                updateNavUI();
                showView('dashboard');
            }
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && isLoggedIn && supabase) {
            console.log("[Visibility Change] Verifying seat session validity...");
            loadUserProfileAndCredits();
        }
    });

    // --- Pricing Toggles & Grid Logic ---
    const btnMonthly = document.getElementById('toggle-monthly');
    const btnAnnual = document.getElementById('toggle-annual');
    const btnHosted = document.getElementById('switch-hosted');
    const btnByok = document.getElementById('switch-byok');
    
    const hostedMonthly = document.getElementById('hosted-grid-monthly');
    const hostedAnnual = document.getElementById('hosted-grid-annual');
    const byokMonthly = document.getElementById('byok-grid-monthly');
    const byokAnnual = document.getElementById('byok-grid-annual');

    let currentPeriod = 'monthly';
    let currentMode = 'hosted';

    function updateGrids() {
        if (!hostedMonthly || !hostedAnnual || !byokMonthly || !byokAnnual) return;
        hostedMonthly.style.display = 'none';
        hostedAnnual.style.display = 'none';
        byokMonthly.style.display = 'none';
        byokAnnual.style.display = 'none';

        if (currentMode === 'hosted') {
            if (currentPeriod === 'monthly') hostedMonthly.style.display = 'grid';
            else hostedAnnual.style.display = 'grid';
        } else {
            if (currentPeriod === 'monthly') byokMonthly.style.display = 'grid';
            else byokAnnual.style.display = 'grid';
        }
    }

    if (btnMonthly && btnAnnual) {
        btnMonthly.addEventListener('click', () => {
            currentPeriod = 'monthly';
            btnMonthly.classList.add('btn-primary');
            btnMonthly.classList.remove('btn-secondary');
            btnAnnual.classList.add('btn-secondary');
            btnAnnual.classList.remove('btn-primary');
            updateGrids();
        });
        btnAnnual.addEventListener('click', () => {
            currentPeriod = 'annual';
            btnAnnual.classList.add('btn-primary');
            btnAnnual.classList.remove('btn-secondary');
            btnMonthly.classList.add('btn-secondary');
            btnMonthly.classList.remove('btn-primary');
            updateGrids();
        });
    }

    if (btnHosted && btnByok) {
        btnHosted.addEventListener('click', () => {
            currentMode = 'hosted';
            btnHosted.classList.add('active');
            btnByok.classList.remove('active');
            updateGrids();
        });
        btnByok.addEventListener('click', () => {
            currentMode = 'byok';
            btnByok.classList.add('active');
            btnHosted.classList.remove('active');
            updateGrids();
        });
    }

    // --- Pricing CTA Checkout Listener ---
    const pricingBtns = document.querySelectorAll('.pricing-cta-btn');
    pricingBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const plan = e.target.getAttribute('data-plan'); 
            const amount = e.target.getAttribute('data-amount');
            const price = e.target.getAttribute('data-price');
            const seats = e.target.getAttribute('data-seats');
            const pack = e.target.getAttribute('data-pack');

            const purchaseData = { plan, amount, price, seats, packageName: pack };

            if (!isLoggedIn) {
                window.pendingPurchase = purchaseData;
                showView('login');
                return;
            }

            if (!supabase) {
                alert("Cannot connect to checkout service right now.");
                return;
            }

            showLoader("Connecting to checkout...");
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error("Not authenticated");
                const { data: { session } } = await supabase.auth.getSession();

                const response = await fetch('/api/create-checkout-session', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({
                        userId: user.id,
                        userEmail: user.email,
                        planType: plan,
                        auditAmount: parseInt(amount, 10),
                        priceAmount: parseInt(price, 10),
                        seats: parseInt(seats, 10),
                        packageName: pack
                    })
                });
                
                const resData = await response.json();
                if (!response.ok) throw new Error(resData.error || 'Failed to create checkout session');
                if (resData.url) window.location.href = resData.url;
                else throw new Error('No checkout URL returned');
            } catch (err) {
                console.error("Checkout Error:", err);
                alert("Error initiating checkout: " + err.message);
            } finally {
                hideLoader();
            }
        });
    });
}

// Conditional execution wrapper to ensure app.js runs even if loaded asynchronously or after DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
