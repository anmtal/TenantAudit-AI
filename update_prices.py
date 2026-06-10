import re

html_template = '''<div class="pricing-grid" id="hosted-grid-monthly" style="display: grid; max-width: 1200px; margin: 0 auto; width: 100%;">
{hosted_monthly_cards}
</div>

<!-- HOSTED ANNUAL -->
<div class="pricing-grid" id="hosted-grid-annual" style="display: none; max-width: 1200px; margin: 0 auto; width: 100%;">
{hosted_annual_cards}
</div>

<!-- BYOK MONTHLY -->
<div class="pricing-grid" id="byok-grid-monthly" style="display: none; max-width: 1200px; margin: 0 auto; width: 100%;">
{byok_monthly_cards}
</div>

<!-- BYOK ANNUAL -->
<div class="pricing-grid" id="byok-grid-annual" style="display: none; max-width: 1200px; margin: 0 auto; width: 100%;">
{byok_annual_cards}
</div>
'''

card_template = '''
    <div class="pricing-card" {extra_style}>
        {popular_badge}
        <span class="pricing-tier">{tier_name}</span>
        <div class="pricing-price-box">
            <span class="pricing-price"></span><span class="pricing-period">/{period}</span>
        </div>
        <ul class="pricing-features-list">
            {features}
        </ul>
        <button class="btn {btn_class} pricing-cta-btn" data-plan="{plan}" data-amount="{amount}" data-price="{price_raw}" data-seats="{seats}" data-pack="{pack_name}">Get Plan</button>
    </div>
'''

def build_features(feat_list):
    return '\n            '.join(f'<li><i data-lucide="check" class="inline-icon" style="color: var(--color-emerald); width: 14px; height: 14px;"></i> {f}</li>' for f in feat_list)

hosted_tiers = [
    {"name": "Starter", "seats": 1, "mo_price": 49, "mo_audits": 2, "yr_price": 449, "yr_audits": 24},
    {"name": "Pro", "seats": 2, "mo_price": 199, "mo_audits": 10, "yr_price": 1799, "yr_audits": 120},
    {"name": "Team", "seats": 5, "mo_price": 499, "mo_audits": 30, "yr_price": 4499, "yr_audits": 360, "popular": True},
    {"name": "Business", "seats": 10, "mo_price": 999, "mo_audits": 100, "yr_price": 8999, "yr_audits": 1200},
    {"name": "Corporate", "seats": 9999, "mo_price": 2499, "mo_audits": 300, "yr_price": 22499, "yr_audits": 3600, "seats_label": "Unlimited Seats"},
    {"name": "Enterprise", "seats": 9999, "mo_price": 4999, "mo_audits": 1000, "yr_price": 44999, "yr_audits": 12000, "seats_label": "Unlimited Seats"}
]

byok_tiers = [
    {"name": "Starter", "seats": 1, "mo_price": 149, "yr_price": 1349},
    {"name": "Team", "seats": 5, "mo_price": 499, "yr_price": 4499},
    {"name": "Business", "seats": 10, "mo_price": 799, "yr_price": 7199, "popular": True},
    {"name": "Enterprise", "seats": 9999, "mo_price": 1499, "yr_price": 13499, "seats_label": "Unlimited Seats"}
]

def make_hosted_cards(is_annual):
    cards = []
    for t in hosted_tiers:
        price = t['yr_price'] if is_annual else t['mo_price']
        audits = t['yr_audits'] if is_annual else t['mo_audits']
        period = "yr" if is_annual else "mo"
        pack_name = f"{t['name']} {'Annual' if is_annual else 'Monthly'}"
        
        feats = [
            f"{audits:,} Audits / {period}",
            t.get('seats_label', str(t['seats']) + ' Seat' + ('s' if t['seats'] > 1 else ''))
        ]
        if t['seats'] > 1:
            feats.append("Team Shared Balance")
        feats.append("Full Discrepancy Matrix")
        feats.append("Export to PDF & Excel")
        feats.append("Priority Email Support" if t['mo_price'] >= 499 else "Standard Support")
        if t['mo_price'] >= 2499:
            feats.append("Dedicated Account Manager")

        card = card_template.replace('{price}', f"{price:,}").format(
            extra_style='style="border-color: var(--color-purple); box-shadow: 0 0 20px rgba(168,85,247,0.1);"' if t.get('popular') else '',
            popular_badge='<div class="popular-badge">Popular</div>' if t.get('popular') else '',
            tier_name=pack_name.upper(),
            period=period,
            features=build_features(feats),
            btn_class='btn-primary' if t.get('popular') else 'btn-secondary',
            plan='hosted',
            amount=audits,
            price_raw=price,
            seats=t['seats'],
            pack_name=pack_name
        )
        cards.append(card)
    return "".join(cards)

def make_byok_cards(is_annual):
    cards = []
    for t in byok_tiers:
        price = t['yr_price'] if is_annual else t['mo_price']
        period = "yr" if is_annual else "mo"
        pack_name = f"BYOK {t['name']} {'Annual' if is_annual else 'Monthly'}"
        
        feats = [
            t.get('seats_label', str(t['seats']) + ' Seat' + ('s' if t['seats'] > 1 else '')),
            "Unlimited Audits"
        ]
        if t['seats'] > 1:
            feats.append("Team Shared Balance")
        feats.append("Full Discrepancy Matrix")
        feats.append("Export to PDF & Excel")
        feats.append("Bring Your Own API Key")
        if t['mo_price'] >= 799:
            feats.append("Priority Support")

        card = card_template.replace('{price}', f"{price:,}").format(
            extra_style='style="border-color: var(--color-purple); box-shadow: 0 0 20px rgba(168,85,247,0.1);"' if t.get('popular') else '',
            popular_badge='<div class="popular-badge">Popular</div>' if t.get('popular') else '',
            tier_name=pack_name.upper(),
            period=period,
            features=build_features(feats),
            btn_class='btn-primary' if t.get('popular') else 'btn-secondary',
            plan='byok',
            amount=999999,
            price_raw=price,
            seats=t['seats'],
            pack_name=pack_name
        )
        cards.append(card)
    return "".join(cards)

with open('public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

new_grids = html_template.format(
    hosted_monthly_cards=make_hosted_cards(False),
    hosted_annual_cards=make_hosted_cards(True),
    byok_monthly_cards=make_byok_cards(False),
    byok_annual_cards=make_byok_cards(True)
)

start_tag = '<div class="pricing-grid" id="hosted-grid-monthly"'
end_tag = '<!-- Security Focus Section -->'

start_idx = content.find(start_tag)
end_idx = content.find(end_tag)

if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + new_grids + "\n            " + content[end_idx:]
    with open('public/index.html', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Updated index.html successfully")
else:
    print("Tags not found!")
