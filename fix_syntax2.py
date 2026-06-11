import re

with open('public/app.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Instead of exact matching the string with invisible characters, let's use a regex that matches from `if (!success) {` to the end of the function `}`.
pattern = r'(if \(!success\) \{\s*const err = lastError;).*?(        \} catch \(err\) \{\s*console\.error\(err\);\s*hideLoader\(\);\s*showToast\(`.*?`, \'error\'\);\s*\}\s*\})'

def repl(m):
    return m.group(1) + "\n            console.error(err);\n            hideLoader();\n            showToast(`Error: ${err.message}`, 'error');\n        }\n    }"

js = re.sub(pattern, repl, js, flags=re.DOTALL)

with open('public/app.js', 'w', encoding='utf-8') as f:
    f.write(js)
