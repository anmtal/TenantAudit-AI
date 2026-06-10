import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Fix grid inline styles to rely on CSS grid
html = re.sub(r'<div class="pricing-grid" id="hosted-grid-monthly".*?>', '<div class="pricing-grid" id="hosted-grid-monthly" style="display: grid; max-width: 1200px; margin: 0 auto; width: 100%;">', html)
html = re.sub(r'<div class="pricing-grid" id="hosted-grid-annual".*?>', '<div class="pricing-grid" id="hosted-grid-annual" style="display: none; max-width: 1200px; margin: 0 auto; width: 100%;">', html)

# Fix script where we show grid-annual to use 'grid' instead of 'flex'
html = html.replace("gridMonthly.style.display = 'flex';", "gridMonthly.style.display = 'grid';")
html = html.replace("gridAnnual.style.display = 'flex';", "gridAnnual.style.display = 'grid';")

# Fix footer layout for copyright
html = html.replace('<div class="footer-left">', '<div class="footer-left" style="display: flex; flex-direction: column; align-items: center; width: 100%;">')
html = html.replace('<p>&copy; 2026 LeaseAlign AI Inc. All rights reserved.</p>', '<p style="text-align: center;">&copy; 2026 LeaseAlign AI Inc. All rights reserved.</p>')

# Just to ensure footer contact stays fine
html = html.replace('<div class="footer-contact">', '<div class="footer-contact" style="justify-content: center; margin-top: 8px;">')

# Ensure the status indicator is centered or something
html = html.replace('<div class="footer-links">', '<div class="footer-links" style="width: 100%; text-align: center; margin-top: 16px;">')

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
