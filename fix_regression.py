import re

# 1. Fix app.js
with open('public/app.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Replace the duplicate definition.
# Current buggy code:
#     let hostedCredits = 0;
#     let hostedCredits = 0;
js = js.replace('let hostedCredits = 0;\n    let hostedCredits = 0;', 'let hostedCredits = 0;')

with open('public/app.js', 'w', encoding='utf-8') as f:
    f.write(js)

# 2. Fix index.html
with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Remove the leftover form chunk
leftover_regex = r'\s*<div class="form-group">\s*<label for="credits-amount">Select Page Package.*?</form>\s*</div>\s*</div>'
html = re.sub(leftover_regex, '', html, flags=re.DOTALL)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
