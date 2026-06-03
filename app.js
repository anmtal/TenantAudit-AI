/* ==========================================================================
   TenantAudit AI — Core Application Logic
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

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

    // --- DOM Selectors ---
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
            { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' }
        ],
        gemini: [
            { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
            { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' }
        ],
        deepseek: [
            { value: 'deepseek-chat', label: 'DeepSeek Chat (V3 / R1)' }
        ]
    };

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
        
        // Enforce a valid selected value to prevent a blank dropdown state
        const hasSelectedValue = models.some(m => m.value === selectedValue);
        if (selectedValue && hasSelectedValue) {
            settingsLlmModel.value = selectedValue;
        } else if (models.length > 0) {
            settingsLlmModel.value = models[0].value;
        }
    }

    // --- Load Saved Settings ---
    function loadSettings() {
        const savedMode = localStorage.getItem('ta_connection_mode') || 'hosted';
        const savedProvider = localStorage.getItem('ta_api_provider') || 'openai';
        const savedModel = localStorage.getItem('ta_llm_model') || 'gpt-4o-mini';
        const savedKey = localStorage.getItem('ta_api_key') || '';
        
        settingsMode.value = savedMode;
        settingsProvider.value = savedProvider;
        settingsApiKey.value = savedKey;
        
        updateModelDropdown(savedProvider, savedModel);
        updateSettingsUI(savedMode, savedKey);
    }

    function updateSettingsUI(mode, apiKey) {
        if (mode === 'hosted') {
            byokSettingsGroup.style.display = 'none';
            clearSettingsBtn.style.display = 'none';
            
            openSettingsBtn.textContent = '⚙️ Connection: Hosted SaaS';
            openSettingsBtn.style.borderColor = 'rgba(139, 92, 246, 0.4)'; // Purple violet glow
            openSettingsBtn.style.color = '#a78bfa';
        } else {
            byokSettingsGroup.style.display = 'block';
            clearSettingsBtn.style.display = apiKey ? 'inline-block' : 'none';
            
            if (apiKey) {
                openSettingsBtn.textContent = '⚙️ Connection: BYOK Active';
                openSettingsBtn.style.borderColor = 'rgba(16, 185, 129, 0.4)'; // Emerald green
                openSettingsBtn.style.color = '#34d399';
            } else {
                openSettingsBtn.textContent = '⚙️ Configure API Key';
                openSettingsBtn.style.borderColor = 'rgba(239, 68, 68, 0.4)'; // Red/Orange warning
                openSettingsBtn.style.color = '#f87171';
            }
        }
    }

    loadSettings();

    // Toggle BYOK options when changing connection mode dropdown
    if (settingsMode) {
        settingsMode.addEventListener('change', (e) => {
            const tempKey = settingsApiKey.value.trim();
            updateSettingsUI(e.target.value, tempKey);
        });
    }

    // Dynamic model loading when changing provider dropdown
    if (settingsProvider) {
        settingsProvider.addEventListener('change', (e) => {
            updateModelDropdown(e.target.value);
        });
    }

    // --- Modal Listeners ---
    if (openSettingsBtn) openSettingsBtn.addEventListener('click', () => settingsModal.classList.add('active'));
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('active'));
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) settingsModal.classList.remove('active');
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
        demoBtn.addEventListener('click', () => {
            showLoader("Processing mock lease PDF pages...");
            
            setTimeout(() => {
                showLoader("Abstracting Starbucks tenancy terms...");
                setTimeout(() => {
                    showLoader("Cross-checking lease against estoppel...");
                    setTimeout(() => {
                        hideLoader();
                        loadDemoAuditData();
                    }, 800);
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
                matchScore: 43, // 3 Match, 1 Warning, 3 Mismatch (3/7 = 43%)
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
                }
            ]
        };

        renderAuditResults();
    }

    // --- Action: Run Live AI Lease Audit ---
    if (startAuditBtn) {
        startAuditBtn.addEventListener('click', async () => {
            const connectionMode = localStorage.getItem('ta_connection_mode') || 'hosted';
            const apiProvider = localStorage.getItem('ta_api_provider') || 'openai';
            const llmModel = localStorage.getItem('ta_llm_model') || 'gpt-4o-mini';
            const apiKey = localStorage.getItem('ta_api_key');
            
            if (connectionMode === 'byok' && !apiKey) {
                alert("⚙️ Please configure your connection API Key first. Click 'Configure Connection Settings' in the header.");
                settingsModal.classList.add('active');
                return;
            }

            try {
                showLoader("Reading Lease PDF pages...");
                const leasePages = await extractTextFromPDF(filesState.lease, (curr, total) => {
                    showLoader(`Extracting Lease text: Page ${curr}/${total}`);
                });
                
                showLoader("Reading Estoppel PDF pages...");
                const estoppelPages = await extractTextFromPDF(filesState.estoppel, (curr, total) => {
                    showLoader(`Extracting Estoppel text: Page ${curr}/${total}`);
                });

                showLoader("Optimizing prompt context length...");
                const leaseSliced = sliceOptimizedPages(leasePages);
                const estoppelSliced = sliceOptimizedPages(estoppelPages);

                showLoader("Analyzing Lease terms with AI...");
                const leaseExtraction = await callOpenAIToExtract(leaseSliced, 'lease', connectionMode, apiProvider, llmModel, apiKey);
                
                showLoader("Analyzing Estoppel statements with AI...");
                const estoppelExtraction = await callOpenAIToExtract(estoppelSliced, 'estoppel', connectionMode, apiProvider, llmModel, apiKey);

                showLoader("Auditing discrepancies...");
                performAILinkedAudit(leaseExtraction, estoppelExtraction);
                hideLoader();
                
            } catch (err) {
                console.error(err);
                hideLoader();
                alert(`🚫 AI Extraction Error: ${err.message}\n\nPlease check your configuration, network, or server status.`);
            }
        });
    }

    // --- API Calls Router (Secure CORS Proxy via Backend) ---
    async function callOpenAIToExtract(text, docType, connectionMode, provider, model, apiKey) {
        // Build payload based on mode. 
        // In Hosted SaaS mode, we run OpenAI's high-tier 'gpt-4o' under our server key.
        const payload = {
            text: text,
            docType: docType,
            connectionMode: connectionMode,
            provider: connectionMode === 'hosted' ? 'openai' : provider,
            model: connectionMode === 'hosted' ? 'gpt-4o' : model,
            apiKey: connectionMode === 'hosted' ? null : apiKey
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
            { key: "premisesSf", label: "Premises Size" },
            { key: "monthlyRent", label: "Current Monthly Rent" },
            { key: "expiryDate", label: "Lease Expiration Date" },
            { key: "securityDeposit", label: "Security Deposit" },
            { key: "renewalOptions", label: "Renewal Options" },
            { key: "camShare", label: "CAM & Operating Caps" }
        ];

        let records = [];
        let redFlags = 0;
        let matchCount = 0;

        terms.forEach(t => {
            const lease = leaseJson[t.key] || { value: "Not Mentioned", quote: "No citation found." };
            const estoppel = estoppelJson[t.key] || { value: "Not Mentioned", quote: "No citation found." };
            
            let status = "match";
            
            // Normalize values for comparison
            const lVal = lease.value.toLowerCase().replace(/[^a-z0-9]/g, '');
            const eVal = estoppel.value.toLowerCase().replace(/[^a-z0-9]/g, '');

            if (lVal === 'notmentioned' || eVal === 'notmentioned') {
                status = "warning";
            } else if (lVal === eVal || lVal.includes(eVal) || eVal.includes(lVal)) {
                status = "match";
                matchCount++;
            } else {
                status = "mismatch";
                redFlags++;
            }

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

        auditData = {
            metadata: {
                tenantName: leaseJson.tenantName.value || "Unknown Tenant",
                leaseFile: filesState.lease.name,
                estoppelFile: filesState.estoppel.name,
                auditModel: "GPT-4o-mini (BYOK)"
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
                statusBadge = '<span class="status-pill match-ok">● Match</span>';
            } else if (rec.status === 'warning') {
                statusBadge = '<span class="status-pill match-warning">● Warning</span>';
            } else {
                statusBadge = '<span class="status-pill match-mismatch">❌ Mismatch</span>';
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
            link.setAttribute("download", `TenantAudit_due_diligence_report_${new Date().toISOString().substring(0, 10)}.csv`);
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
});
