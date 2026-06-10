import json
import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

byok_monthly = re.search(r'<div class="pricing-grid" id="byok-grid-monthly".*?>(.*?)</div>\s*<!-- Byok Grid Annual -->', html, re.DOTALL)
if byok_monthly:
    print("BYOK Monthly Found")

