import re

with open('public/app.js', 'r', encoding='utf-8') as f:
    js = f.read()

refund_logic = """
            // Auto Refund logic for hosted users if it failed
            if (connectionMode === 'hosted' && currentAuditTransactionId) {
                console.log("[Refund] Attempting to auto-refund credit for failed transaction:", currentAuditTransactionId);
                const tokenResponse = supabase.auth.session()?.access_token || '';
                fetch('/api/refund-credit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenResponse}` },
                    body: JSON.stringify({ transactionId: currentAuditTransactionId, planMode: 'hosted' })
                }).then(res => res.json()).then(data => {
                    if (data.success) {
                        showToast("Your audit credit has been auto-refunded due to the failure.", "info");
                        loadUserProfileAndCredits();
                    }
                }).catch(e => console.error("Refund failed:", e));
            }
"""

broken_perform_audit_end = """            } catch (e) {
                console.error("[AI Verification Error] Network or client failure:", e);
    
            
            // Auto Refund logic for hosted users if it failed
            if (connectionMode === 'hosted' && currentAuditTransactionId) {
                console.log("[Refund] Attempting to auto-refund credit for failed transaction:", currentAuditTransactionId);
                const tokenResponse = supabase.auth.session()?.access_token || '';
                fetch('/api/refund-credit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenResponse}` },
                    body: JSON.stringify({ transactionId: currentAuditTransactionId, planMode: 'hosted' })
                }).then(res => res.json()).then(data => {
                    if (data.success) {
                        showToast("Your audit credit has been auto-refunded due to the failure.", "info");
                        loadUserProfileAndCredits();
                    }
                }).catch(e => console.error("Refund failed:", e));
            }
        }
        } finally {
                hideLoader();
            }
        }
    }"""

fixed_perform_audit_end = """            } catch (e) {
                console.error("[AI Verification Error] Network or client failure:", e);
            } finally {
                hideLoader();
            }
        }
    }"""

js = js.replace(broken_perform_audit_end, fixed_perform_audit_end)


# Now inject the refund logic into the end of `runLiveAudit` where it actually belongs.
run_live_audit_end = """        if (!success) {
            const err = lastError;
            console.error(err);
            hideLoader();
            showToast(`Error: ${err.message}`, 'error');
        }
    }"""

fixed_run_live_audit_end = """        if (!success) {
            const err = lastError;
            console.error(err);
            hideLoader();
            showToast(`Error: ${err.message}`, 'error');
""" + refund_logic + """
        }
    }"""

js = js.replace(run_live_audit_end, fixed_run_live_audit_end)

with open('public/app.js', 'w', encoding='utf-8') as f:
    f.write(js)
