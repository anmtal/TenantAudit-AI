import re

with open('public/app.js', 'r', encoding='utf-8') as f:
    js = f.read()

# 1. showToast XSS Fix
old_toast = """toast.innerHTML = `
            ${iconHtml}
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close"><i data-lucide="x" style="width: 14px; height: 14px;"></i></button>
        `;"""
new_toast = """toast.innerHTML = `
            ${iconHtml}
            <div class="toast-content">
                <div class="toast-title"></div>
                <div class="toast-message"></div>
            </div>
            <button class="toast-close"><i data-lucide="x" style="width: 14px; height: 14px;"></i></button>
        `;
        toast.querySelector('.toast-title').textContent = title;
        toast.querySelector('.toast-message').textContent = message;"""
js = js.replace(old_toast, new_toast)

# 2. Add Password Recovery Modal DOM Variables
dom_vars = """    const passwordRecoveryModal = document.getElementById('password-recovery-modal');
    const closeRecoveryBtn = document.getElementById('close-recovery-btn');
    const saveRecoveryBtn = document.getElementById('save-recovery-btn');
    const recoveryPassword = document.getElementById('recovery-password');
    const recoveryPasswordConfirm = document.getElementById('recovery-password-confirm');"""
js = js.replace("const authModal = document.getElementById('auth-modal');", "const authModal = document.getElementById('auth-modal');\n" + dom_vars)

# 3. Add Password Recovery Event Listeners
recovery_listeners = """    if (closeRecoveryBtn) {
        closeRecoveryBtn.addEventListener('click', () => {
            passwordRecoveryModal.classList.remove('active');
        });
    }

    if (saveRecoveryBtn) {
        saveRecoveryBtn.addEventListener('click', async () => {
            const pwd = recoveryPassword.value;
            const pwdConfirm = recoveryPasswordConfirm.value;
            if (pwd.length < 6) {
                showToast("Password must be at least 6 characters.", "error");
                return;
            }
            if (pwd !== pwdConfirm) {
                showToast("Passwords do not match.", "error");
                return;
            }

            const originalText = saveRecoveryBtn.textContent;
            saveRecoveryBtn.textContent = "Updating...";
            saveRecoveryBtn.disabled = true;

            try {
                const { error } = await supabase.auth.updateUser({ password: pwd });
                if (error) throw error;
                
                showToast("Password updated successfully!", "success");
                passwordRecoveryModal.classList.remove('active');
                recoveryPassword.value = '';
                recoveryPasswordConfirm.value = '';
            } catch (err) {
                showToast("Error updating password: " + err.message, "error");
            } finally {
                saveRecoveryBtn.textContent = originalText;
                saveRecoveryBtn.disabled = false;
            }
        });
    }"""
js = js.replace("if (authForm) {", recovery_listeners + "\n\n    if (authForm) {")

# 4. Handle PASSWORD_RECOVERY event in onAuthStateChange
auth_event = """if (event === 'PASSWORD_RECOVERY') {
                        passwordRecoveryModal.classList.add('active');
                    }"""
js = js.replace("if (session && session.user) {", auth_event + "\n                    if (session && session.user) {")

# 5. Remove creditsModal variable definitions and buyPlan Hosted/Byok definitions
js = re.sub(r'const creditsModal = document\.getElementById\(\'credits-modal\'\);\n\s*const closeCreditsBtn.*?\n\s*const saveCreditsBtn.*?\n\s*const creditsForm.*?\n\s*const creditsAmount.*?\n\s*const buyPlanHosted.*?\n\s*const buyPlanByok.*?\n', '', js)

# 6. Change topup trigger click to scroll to pricing
topup_replace_old = """    function handleTopupClick() {
        if (creditsModal) {
            creditsModal.classList.add('active');
        }
    }"""
topup_replace_new = """    function handleTopupClick() {
        const pricingSection = document.getElementById('pricing-section');
        if (pricingSection) {
            pricingSection.scrollIntoView({ behavior: 'smooth' });
        }
    }"""
js = js.replace(topup_replace_old, topup_replace_new)

# 7. Remove all the buyPlanHosted/saveCreditsBtn logic
js = re.sub(r'if \(closeCreditsBtn\) \{.*?\}\n\s*if \(creditsModal\) \{.*?\}\n\s*if \(buyPlanHosted && buyPlanByok && creditsAmount\) \{.*?\}\n\s*if \(saveCreditsBtn\) \{.*?\n\s*\}\n\s*\}\n\s*\}\)\;\n\s*\}', '', js, flags=re.DOTALL)

# 8. Fix window.pendingPurchase behavior to scroll instead of opening modal
js = js.replace("creditsModal.classList.add('active');", "handleTopupClick();")

# 9. Change "creditsModal.classList.add('active');" inside runLiveAudit to handleTopupClick()
js = js.replace("creditsModal.classList.add('active');", "handleTopupClick();")

with open('public/app.js', 'w', encoding='utf-8') as f:
    f.write(js)

# --- SERVER.JS ---
with open('server.js', 'r', encoding='utf-8') as f:
    svr = f.read()

old_interval = """if (planType === 'byok') {
            if (amtVal === 1299 || price === 1349 || price === 4499 || price === 7199 || price === 13499) {
                subscriptionInterval = 'year';
            }
        } else if (planType === 'hosted') {
            if (price === 449 || price === 1799 || price === 4499 || price === 8999 || price === 22499 || price === 44999) {
                subscriptionInterval = 'year';
            }
        }"""
new_interval = """if (planType === 'byok') {
            if (price === 1068 || price === 1908 || price === 4788) {
                subscriptionInterval = 'year';
            }
        } else if (planType === 'hosted') {
            if (price === 1188 || price === 2868 || price === 4788 || price === 9588) {
                subscriptionInterval = 'year';
            }
        }"""
svr = svr.replace(old_interval, new_interval)

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(svr)
