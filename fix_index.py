import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Remove credits-modal
html = re.sub(r'<!-- 5\. CREDITS TOP UP MODAL OVERLAY -->.*?</div>\s*</div>', '<!-- 5. PASSWORD RECOVERY MODAL -->\n      <div class="modal-overlay" id="password-recovery-modal">\n          <div class="modal-card">\n              <button class="modal-close-btn" id="close-recovery-btn">&times;</button>\n              <div class="modal-title-wrapper">\n                  <h3>Set New Password</h3>\n                  <p>Please enter your new password below.</p>\n              </div>\n              <form id="password-recovery-form" onsubmit="return false;">\n                  <div class="form-group">\n                      <label for="recovery-password">New Password</label>\n                      <input type="password" id="recovery-password" placeholder="At least 6 characters" required>\n                  </div>\n                  <div class="form-group">\n                      <label for="recovery-password-confirm">Confirm Password</label>\n                      <input type="password" id="recovery-password-confirm" placeholder="At least 6 characters" required>\n                  </div>\n                  <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 15px;">\n                      <button type="submit" class="btn btn-emerald" id="save-recovery-btn">Update Password</button>\n                  </div>\n              </form>\n          </div>\n      </div>', html, flags=re.DOTALL)

# 2. Add SRI Hashes
replacements = {
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js': 'integrity="sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e" crossorigin="anonymous"',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2': 'integrity="sha384-UQ9Ztz63gzT2JZCuDRkNXV8RP/gXxdPUuM9LKlz2BzqGx9xFYNAK8yAEgbfZHs7P" crossorigin="anonymous"',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js': 'integrity="sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk" crossorigin="anonymous"',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js': 'integrity="sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H" crossorigin="anonymous"',
    'https://unpkg.com/lucide@latest': 'integrity="sha384-bdZtphetAEBgkGZvhZXOFDWc55tHGLqaSo1f4qZtgvEiolEBqlJ9u6FTk+CoLfj0" crossorigin="anonymous"'
}

for url, integrity in replacements.items():
    html = html.replace(f'src="{url}"', f'src="{url}" {integrity}')

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
