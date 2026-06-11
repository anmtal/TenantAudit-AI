import re

with open('public/app.js', 'r', encoding='utf-8') as f:
    js = f.read()

# I need to fix the end of `runLiveAudit`.
# It looks like there's an orphaned `} catch (err) {` with no matching try.
broken_code = """        if (!success) {
            const err = lastError;

                console.error("Deduction/Logging error:", err);
                hideLoader();
                showToast(`dYs Audit finished, but database update failed: ${err.message}`, 'error');
            }
            
        } catch (err) {
            console.error(err);
            hideLoader();
            showToast(`dYs AI Extraction Error: ${err.message}\\n\\nPlease check your configuration, network, or server status.`, 'error');
        }"""

fixed_code = """        if (!success) {
            const err = lastError;
            console.error(err);
            hideLoader();
            showToast(`dYs AI Extraction Error: ${err.message}\\n\\nPlease check your configuration, network, or server status.`, 'error');
        }"""

js = js.replace(broken_code, fixed_code)

with open('public/app.js', 'w', encoding='utf-8') as f:
    f.write(js)
