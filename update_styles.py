import re

with open('public/styles.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Make pricing grid 3 columns
css = re.sub(
    r'\.pricing-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5,\s*1fr\);[\s\S]*?\}',
    '.pricing-grid {\n    display: grid;\n    grid-template-columns: repeat(3, 1fr);\n    gap: 24px;\n    width: 100%;\n    max-width: 1200px;\n    margin: 0 auto;\n}',
    css
)

# Adjust the media queries for pricing grid
css = re.sub(
    r'@media \(max-width: 1400px\)\s*\{\s*\.pricing-grid\s*\{\s*grid-template-columns:\s*repeat\(3,\s*1fr\);\s*gap:\s*20px;\s*\}\s*\}',
    '',
    css
)

# adjust footer
css = re.sub(
    r'\.app-footer\s*\{[\s\S]*?\}',
    '.app-footer {\n    display: flex;\n    flex-direction: column;\n    justify-content: center;\n    align-items: center;\n    padding-top: 32px;\n    border-top: 1px solid rgba(255, 255, 255, 0.05);\n    font-size: 13px;\n    color: var(--text-muted);\n    gap: 16px;\n    text-align: center;\n}',
    css
)

with open('public/styles.css', 'w', encoding='utf-8') as f:
    f.write(css)
