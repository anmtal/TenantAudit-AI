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
    let isLoggedIn = false;
    let pageCredits = 0;
    let hostedCredits = 0;
    let byokCredits = 0;
    let userEmail = '';
    let supabase = null;
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
    const loginHintBox = document.getElementById('login-hint-box');
    const authToggleContainer = document.getElementById('auth-toggle-container');

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
            { value: 'claude-sonnet-4-5-20250929', label: 'Claude 4.5 Sonnet' },
            { value: 'claude-haiku-4-5-20251001', label: 'Claude 4.5 Haiku (Fast & Cheap)' },
            { value: 'claude-opus-4-6', label: 'Claude 4.6 Opus' }
        ],
        gemini: [
            { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
            { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' }
        ],
        deepseek: [
            { value: 'deepseek-chat', label: 'DeepSeek Chat (V3 / R1)' }
        ]
    };

    // --- Session Router & Multi-View Display Control ---
    function showView(viewId) {
        homeView.style.display = 'none';
        loginView.style.display = 'none';
        dashboardView.style.display = 'none';

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
            homeCreditsDisplay.style.display = isLoggedIn ? 'flex' : 'none';
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
            pageCredits = byokCredits;
        } else {
            pageCredits = hostedCredits;
        }
        creditsCountDisplay.textContent = pageCredits;
        if (homeCreditsCount) {
            homeCreditsCount.textContent = pageCredits;
        }
        updateCreditsPillColor(pageCredits);

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

        // Sync Top-up modal current balance display
        const topupBalanceValue = document.getElementById('topup-balance-value');
        if (topupBalanceValue) {
            if (selectedTopupPlan === 'byok') {
                topupBalanceValue.textContent = `${byokCredits} BYOB Pages`;
                topupBalanceValue.style.color = 'var(--color-emerald)';
            } else {
                topupBalanceValue.textContent = `${hostedCredits} Hosted SaaS Pages`;
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
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                console.log("loadUserProfileAndCredits: No user session found.");
                return;
            }
            console.log("Fetching credits for user ID:", user.id, "email:", user.email);

            // Load plan type from metadata
            const planType = user.user_metadata?.plan_type || 'hosted';
            activePlanType = planType;
            console.log("User plan type loaded from metadata:", activePlanType);
            
            // Fetch credits and byok_credits (with fallback for backward compatibility)
            let profileData = null;
            const { data, error } = await supabase
                .from('profiles')
                .select('credits, byok_credits')
                .eq('id', user.id)
                .single();
                
            if (error) {
                console.warn("Could not fetch byok_credits, trying fallback select for credits only. Error:", error);
                const { data: fallbackData, error: fallbackError } = await supabase
                    .from('profiles')
                    .select('credits')
                    .eq('id', user.id)
                    .single();
                if (fallbackError) {
                    console.error("Error loading profile credits fallback:", fallbackError);
                    return;
                }
                profileData = { ...fallbackData, byok_credits: 0 };
            } else {
                profileData = data;
            }
            
            if (profileData) {
                console.log("Fetched profile credits. Hosted:", profileData.credits, "BYOK:", profileData.byok_credits);
                hostedCredits = profileData.credits || 0;
                byokCredits = profileData.byok_credits || 0;
                applyPlanRestrictions(activePlanType);
                updateCreditsDisplay();
            } else {
                console.log("No profile data returned for user:", user.id);
            }
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
        
        historyLoadingMsg.style.display = 'block';
        historyEmptyMsg.style.display = 'none';
        historyListContainer.style.display = 'none';
        historyListContainer.innerHTML = '';
        
        try {
            const { data, error } = await supabase
                .from('audits')
                .select('*')
                .order('created_at', { ascending: false });
                
            historyLoadingMsg.style.display = 'none';
            
            if (error) {
                console.error("Error loading audits:", error);
                historyEmptyMsg.textContent = "Error loading audit history. Check database console.";
                historyEmptyMsg.style.display = 'block';
                return;
            }
            
            if (!data || data.length === 0) {
                historyEmptyMsg.style.display = 'block';
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
                
                const formattedDate = new Date(item.created_at).toLocaleString();
                
                card.innerHTML = `
                    <div class="history-card-header">
                        <div class="history-tenant" title="${escapeHtml(item.tenant_name)}">${escapeHtml(item.tenant_name)}</div>
                        <div class="history-score-badge ${badgeClass}">${score}%</div>
                    </div>
                    <div class="history-details">
                        <div class="history-detail-item"><span>Lease File:</span> ${escapeHtml(item.lease_file)}</div>
                        <div class="history-detail-item"><span>Estoppel:</span> ${escapeHtml(item.estoppel_file)}</div>
                        <div class="history-detail-item"><span>Red Flags:</span> ${item.red_flags}</div>
                        <div class="history-detail-item"><span>Rent:</span> ${escapeHtml(item.monthly_rent || 'N/A')}</div>
                        <div class="history-detail-item"><span>Premises:</span> ${escapeHtml(item.premises_sf || 'N/A')}</div>
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
                supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
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
                        
                        // Load credits and past history from Supabase
                        await loadUserProfileAndCredits();
                        await loadAuditHistory();
                        
                        // Check if there was a pending package selection before login
                        if (window.pendingPurchase) {
                            const { plan, amount } = window.pendingPurchase;
                            window.pendingPurchase = null; // Clear state
                            
                            // Show credits modal
                            creditsModal.classList.add('active');
                            
                            // Select plan and amount
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

                        // --- Check for Stripe Redirect Success ---
                        const urlParams = new URLSearchParams(window.location.search);
                        if (urlParams.get('checkout_success') === 'true' && urlParams.get('session_id')) {
                            const sessionId = urlParams.get('session_id');
                            showLoader("Verifying Stripe payment...");
                            try {
                                const response = await fetch(`/api/verify-checkout-session?session_id=${sessionId}&t=` + Date.now());
                                const data = await response.json();
                                if (data.success) {
                                    const { amount, planType } = data.metadata;
                                    
                                    // Fetch current credits to avoid overwrite conflicts
                                    const { data: profile, error: selectErr } = await supabase
                                        .from('profiles')
                                        .select('credits, byok_credits')
                                        .eq('id', session.user.id)
                                        .single();
                                    
                                    if (selectErr) throw selectErr;
                                    
                                    let updateFields = {};
                                    const amt = parseInt(amount, 10);
                                    if (planType === 'byok') {
                                        const isAnnual = (amt === 10000 || amt === 25000);
                                        const baseCredits = isAnnual ? 0 : (profile.byok_credits || 0);
                                        const newByokCredits = baseCredits + amt;
                                        updateFields = { byok_credits: newByokCredits };
                                        byokCredits = newByokCredits;
                                    } else {
                                        const isAnnual = (amt === 8000 || amt === 20000);
                                        const baseCredits = isAnnual ? 0 : (profile.credits || 0);
                                        const newHostedCredits = baseCredits + amt;
                                        updateFields = { credits: newHostedCredits };
                                        hostedCredits = newHostedCredits;
                                    }
                                    
                                    // Update credits in DB
                                    const { error: updateErr } = await supabase
                                        .from('profiles')
                                        .update(updateFields)
                                        .eq('id', session.user.id);
                                        
                                    if (updateErr) throw updateErr;
                                    
                                    // Update plan type in auth user metadata
                                    const { error: metadataErr } = await supabase.auth.updateUser({
                                        data: { plan_type: planType }
                                    });
                                    if (metadataErr) throw metadataErr;
                                    
                                    activePlanType = planType;
                                    
                                    // Apply plan connections gating UI lock
                                    if (typeof applyPlanRestrictions === 'function') {
                                        applyPlanRestrictions(planType);
                                    }
                                    updateCreditsDisplay();
                                    
                                    // Clear URL parameters
                                    window.history.replaceState({}, document.title, window.location.pathname);
                                    
                                    alert(`🎉 Payment Verified! Successfully added +${amount} credits to your account. Active plan set to ${planType.toUpperCase()}.`);
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
            byokGrid.style.display = 'grid';
            
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

    // Dynamic Pricing CTA Button Listeners
    const pricingCtaBtns = document.querySelectorAll('.pricing-cta-btn');
    pricingCtaBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const plan = btn.getAttribute('data-plan');
            const amount = btn.getAttribute('data-amount');
            
            if (!isLoggedIn) {
                window.pendingPurchase = { plan, amount };
                showView('login');
            } else {
                // Show credits modal
                creditsModal.classList.add('active');
                
                // Trigger plan switch and dropdown option selection
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
        });
    });


    // Helper toggle binding function for login/signup link switcher
    function setupAuthToggleListener() {
        const toggleBtn = document.getElementById('auth-toggle-link');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                isSignUpMode = !isSignUpMode;
                if (isSignUpMode) {
                    loginTitle.textContent = "Create an Account";
                    loginSubtitle.textContent = "Sign up for LeaseAlign AI to start auditing commercial leases.";
                    loginSubmitBtn.textContent = "Register Account";
                    loginHintBox.style.display = 'none';
                    authToggleContainer.innerHTML = 'Already have an account? <a href="#" id="auth-toggle-link">Sign In</a>';
                } else {
                    loginTitle.textContent = "Sign In to LeaseAlign AI";
                    loginSubtitle.textContent = "Enter your credentials to access your transaction dashboard";
                    loginSubmitBtn.textContent = "Sign In";
                    loginHintBox.style.display = 'block';
                    authToggleContainer.innerHTML = 'Don\'t have an account? <a href="#" id="auth-toggle-link">Sign Up</a>';
                }
                setupAuthToggleListener(); // Recursively re-bind click listener on the new link
            });
        }
    }
    
    // Call initial binding
    setupAuthToggleListener();

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
                        const { data, error } = await supabase.auth.signUp({
                            email: email,
                            password: password
                        });
                        if (error) throw error;
                        alert("🎉 Account created successfully! Please top up your page credits to begin auditing.");
                    } else {
                        const { data, error } = await supabase.auth.signInWithPassword({
                            email: email,
                            password: password
                        });
                        if (error) throw error;
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
        if (supabase) {
            await supabase.auth.signOut();
        } else {
            localStorage.setItem('ta_logged_in', 'false');
            localStorage.removeItem('ta_user_email');
            isLoggedIn = false;
            userEmail = '';
            showView('home');
            updateNavUI();
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
        creditsModal.classList.add('active');
        // Sync with user's current plan type
        if (activePlanType === 'hosted') {
            if (buyPlanHosted) buyPlanHosted.click();
        } else {
            if (buyPlanByok) buyPlanByok.click();
        }
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
                <option value="125" selected>Starter: 125 Pages ($49.00)</option>
                <option value="625">Strip Center: 625 Pages ($149.00)</option>
                <option value="1875">Neighborhood Center: 1875 Pages ($399.00)</option>
                <option value="10000">Annual Package: 10,000 Pages ($999.00)</option>
                <option value="25000">Enterprise Package: 25,000 Pages ($2,499.00)</option>
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
                    
                    if (selectedTopupPlan === 'hosted') {
                        if (amount === 100) { price = 49.00; packageName = "Starter Package"; }
                        else if (amount === 500) { price = 149.00; packageName = "Strip Center Package"; }
                        else if (amount === 1500) { price = 399.00; packageName = "Neighborhood Center Package"; }
                        else if (amount === 8000) { price = 999.00; packageName = "Annual Package"; }
                        else if (amount === 20000) { price = 2499.00; packageName = "Enterprise Package"; }
                    } else {
                        if (amount === 125) { price = 49.00; packageName = "Starter Package"; }
                        else if (amount === 625) { price = 149.00; packageName = "Strip Center Package"; }
                        else if (amount === 1875) { price = 399.00; packageName = "Neighborhood Center Package"; }
                        else if (amount === 10000) { price = 999.00; packageName = "Annual Package"; }
                        else if (amount === 25000) { price = 2499.00; packageName = "Enterprise Package"; }
                    }

                    creditsModal.classList.remove('active');
                    showLoader("Connecting to payment checkout...");

                    const response = await fetch('/api/create-checkout-session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            amount,
                            planType: selectedTopupPlan,
                            userId: user.id,
                            price,
                            packageName
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
                        const isAnnual = (amount === 10000 || amount === 25000);
                        byokCredits = (isAnnual ? 0 : byokCredits) + amount;
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
                    alert(`🎉 Offline Demo Mode: Successfully added +${amount} page credits and activated your ${selectedTopupPlan.toUpperCase()} Package!`);
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
                byokGrid.style.display = 'grid';
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
            const tempCredits = selectedMode === 'byok' ? byokCredits : hostedCredits;
            creditsCountDisplay.textContent = tempCredits;
            updateCreditsPillColor(tempCredits);
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
                        byokGrid.style.display = 'grid';
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

        zoneEl.addEventListener('click', () => inputEl.click());

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

    function handleFileSelection(file, zoneEl, fileKey) {
        if (file.type !== 'application/pdf') {
            alert('🚫 Only text-based PDF files are supported.');
            return;
        }

        filesState[fileKey] = file;
        zoneEl.classList.add('file-selected');
        
        const fileInfoEl = document.getElementById(`${fileKey}-file-info`);
        fileInfoEl.textContent = `${file.name} (${formatBytes(file.size)})`;
        fileInfoEl.style.display = 'block';

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
            const pagesNeeded = 5;
            if (pageCredits < pagesNeeded) {
                alert(`🚫 Insufficient page credits! The simulation requires 5 pages, but you only have ${pageCredits} pages left. Please top up your credits.`);
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
                                // Call RPC to deduct credits
                                const connectionMode = localStorage.getItem('ta_connection_mode') || 'hosted';
                                const { error: deductErr } = await supabase.rpc('deduct_credits', { 
                                    pages_to_deduct: pagesNeeded,
                                    plan_mode: connectionMode 
                                });
                                if (deductErr) throw deductErr;

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
                                if (connectionMode === 'byok') {
                                    byokCredits -= pagesNeeded;
                                    localStorage.setItem('ta_byok_credits', byokCredits);
                                } else {
                                    hostedCredits -= pagesNeeded;
                                    localStorage.setItem('ta_hosted_credits', hostedCredits);
                                }
                                updateCreditsDisplay();
                            }
                            alert("🚀 Simulated audit completed: Deducted 5 page credits.");
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
            showLoader("Assessing page count credits...");
            
            const leasePagesCount = await getPDFPageCount(filesState.lease);
            const estoppelPagesCount = await getPDFPageCount(filesState.estoppel);
            const totalPagesNeeded = leasePagesCount + estoppelPagesCount;
            
            if (pageCredits < totalPagesNeeded) {
                hideLoader();
                alert(`🚫 Insufficient page credits! This audit requires ${totalPagesNeeded} pages, but you only have ${pageCredits} pages left. Please top up your credits.`);
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
            performAILinkedAudit(leaseExtraction, estoppelExtraction);
            
            // Deduct credits and log audit to Database
            try {
                if (supabase) {
                    const connectionMode = localStorage.getItem('ta_connection_mode') || 'hosted';
                    const { error: deductErr } = await supabase.rpc('deduct_credits', { 
                        pages_to_deduct: totalPagesNeeded,
                        plan_mode: connectionMode 
                    });
                    if (deductErr) throw deductErr;

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
                    // Fallback mock mode
                    const connectionMode = localStorage.getItem('ta_connection_mode') || 'hosted';
                    if (connectionMode === 'byok') {
                        byokCredits -= totalPagesNeeded;
                        localStorage.setItem('ta_byok_credits', byokCredits);
                    } else {
                        hostedCredits -= totalPagesNeeded;
                        localStorage.setItem('ta_hosted_credits', hostedCredits);
                    }
                    updateCreditsDisplay();
                }
                
                hideLoader();
                if (connectionMode === 'byok') {
                    alert(`🎉 Audit completed successfully using your custom API Key! Deducted ${totalPagesNeeded} page credits.`);
                } else {
                    alert(`🎉 Audit completed successfully! Deducted ${totalPagesNeeded} page credits.`);
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
        // In Hosted SaaS mode, we run OpenAI's high-tier 'gpt-4o' under our server key.
        const payload = {
            text: text,
            images: images,
            docType: docType,
            connectionMode: connectionMode,
            provider: connectionMode === 'hosted' ? 'openai' : provider,
            model: connectionMode === 'hosted' ? 'gpt-4o' : model,
            apiKey: connectionMode === 'hosted' ? null : apiKey,
            systemPromptOverride: systemPromptOverride,
            userPromptOverride: userPromptOverride
        };

        const response = await fetch("/api/audit", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server returned error status ${response.status}`);
        }

        return await response.json();
    }



    // --- Comparison Auditor Engine (Lease vs Estoppel) ---
    function performAILinkedAudit(leaseJson, estoppelJson) {
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
                return words.join('');
            }

            const lVal = normalizeVal(lease.value);
            const eVal = normalizeVal(estoppel.value);

            const isLMissing = lVal === 'notfound' || lVal === 'notmentioned' || lVal === '';
            const isEMissing = eVal === 'notfound' || eVal === 'notmentioned' || eVal === '';

            if (isLMissing || isEMissing) {
                status = "warning"; // Warning status if not found in one of the files
            } else if (lVal === eVal || lVal.includes(eVal) || eVal.includes(lVal)) {
                status = "match";
                matchCount++;
            } else {
                status = "mismatch";
                redFlags++;
            }

            console.log(`[Audit Comparison] term: "${t.label}" | lease: "${lease.value}" (normalized: "${lVal}") | estoppel: "${estoppel.value}" (normalized: "${eVal}") | status: "${status}"`);

            records.push({
                term: t.label,
                leaseVal: lease.value,
                estoppelVal: estoppel.value,
                status: status,
                leaseCite: lease.quote,
                estoppelCite: estoppel.quote
            });
        });

        // Calculate score
        const score = Math.round((matchCount / terms.length) * 100);

        const connectionMode = localStorage.getItem('ta_connection_mode') || 'hosted';
        const apiProvider = localStorage.getItem('ta_api_provider') || 'openai';
        const llmModel = localStorage.getItem('ta_llm_model') || 'gpt-4o-mini';
        const activeModelName = connectionMode === 'hosted' ? 'GPT-4o (Hosted)' : `${llmModel} (${apiProvider.toUpperCase()})`;

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

        renderAuditResults();
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
}

// Conditional execution wrapper to ensure app.js runs even if loaded asynchronously or after DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
