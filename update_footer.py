import re

html_footer = '''<footer id="contact-footer" class="app-footer" style="margin-top: 64px; width: 100%; display: flex; flex-direction: column; gap: 1.5rem; align-items: center; border-top: 1px solid var(--border-color); padding-top: 2rem; padding-bottom: 2rem;">
    <div style="width: 100%; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; max-width: 1200px; margin: 0 auto;">
        
        <!-- LEFT: Workspace Status -->
        <div class="footer-left" style="flex: 1; min-width: 250px; text-align: left;">
            <span class="status-indicator-footer" style="display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary);"><span class="dot bg-emerald" style="width: 8px; height: 8px; border-radius: 50%; display: inline-block;"></span> B2B Transaction Due Diligence Workspace</span>
        </div>
        
        <!-- MIDDLE: Copyright -->
        <div class="footer-middle" style="flex: 1; min-width: 250px; text-align: center;">
            <p style="margin: 0; color: var(--text-secondary); font-size: 14px;">&copy; 2026 LeaseAlign AI Inc. All rights reserved.</p>
        </div>

        <!-- RIGHT: Contact Links -->
        <div class="footer-right" style="flex: 1; min-width: 250px; display: flex; justify-content: flex-end; align-items: center; gap: 20px;">
            <a href="mailto:contact@leasealign.io" class="footer-contact-item" style="display: inline-flex; align-items: center; gap: 6px; text-decoration: none; color: var(--text-secondary); font-size: 14px; transition: color 0.2s;" onmouseover="this.style.color='var(--color-purple)'" onmouseout="this.style.color='var(--text-secondary)'">
                <i data-lucide="mail" style="width: 16px; height: 16px;"></i> contact@leasealign.io
            </a>
            <a href="https://calendly.com/contact-leasealign/30min" target="_blank" rel="noopener noreferrer" class="footer-contact-item" style="display: inline-flex; align-items: center; gap: 6px; text-decoration: none; color: var(--text-secondary); font-size: 14px; transition: color 0.2s;" onmouseover="this.style.color='var(--color-purple)'" onmouseout="this.style.color='var(--text-secondary)'">
                <i data-lucide="calendar" style="width: 16px; height: 16px;"></i> Book a Demo
            </a>
        </div>

    </div>
    
    <div style="width: 100%; max-width: 1200px; text-align: center; font-size: 0.75rem; color: var(--text-muted); line-height: 1.4; border-top: 1px dashed var(--border-color); padding-top: 1rem; margin-top: 0.5rem;">
        ?? <strong>Legal Disclaimer:</strong> LeaseAlign AI is an LLM-assisted audit utility. All comparison results are for informational purposes only and must be verified by qualified legal counsel prior to closing.
    </div>
</footer>'''

with open('public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the footer
content = re.sub(r'<footer id="contact-footer".*?</footer>', html_footer, content, flags=re.DOTALL)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated footer!")
