import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

new_grid = '''<div style="margin-bottom: 20px; text-align: center;">
                    <button class="btn btn-primary" id="toggle-monthly" style="margin-right: 10px;">Monthly Billing</button>
                    <button class="btn btn-secondary" id="toggle-annual">Annual Billing</button>
                </div>
                <div class="pricing-grid" id="hosted-grid-monthly" style="display: flex; flex-flow: row wrap; justify-content: center; gap: 30px; margin: 0 auto; width: 100%;">
                    <!-- Monthly Pack 1 -->
                    <div class="pricing-card">
                        <span class="pricing-tier">Starter Monthly</span>
                        <div class="pricing-price-box">
                            <span class="pricing-price">$49</span><span class="pricing-period">/mo</span>
                        </div>
                        <ul class="pricing-features-list">
                            <li>2 Audits / mo</li>
                            <li>1 Seat</li>
                            <li>Full Discrepancy Matrix</li>
                        </ul>
                        <button class="btn btn-secondary pricing-cta-btn" data-plan="hosted" data-amount="2" data-price="49" data-seats="1" data-pack="Starter Monthly">Get Plan</button>
                    </div>
                    <!-- Monthly Pack 2 -->
                    <div class="pricing-card">
                        <span class="pricing-tier">Pro Monthly</span>
                        <div class="pricing-price-box">
                            <span class="pricing-price">$199</span><span class="pricing-period">/mo</span>
                        </div>
                        <ul class="pricing-features-list">
                            <li>10 Audits / mo</li>
                            <li>1 Seat</li>
                            <li>Full Discrepancy Matrix</li>
                        </ul>
                        <button class="btn btn-secondary pricing-cta-btn" data-plan="hosted" data-amount="10" data-price="199" data-seats="1" data-pack="Pro Monthly">Get Plan</button>
                    </div>
                    <!-- Monthly Pack 3 -->
                    <div class="pricing-card featured-card">
                        <span class="pricing-tier" style="color: var(--color-purple);">Team Monthly</span>
                        <div class="pricing-price-box">
                            <span class="pricing-price">$499</span><span class="pricing-period">/mo</span>
                        </div>
                        <ul class="pricing-features-list">
                            <li>30 Audits / mo</li>
                            <li>2 Seats</li>
                            <li>Team Shared Balance</li>
                        </ul>
                        <button class="btn btn-primary pricing-cta-btn" data-plan="hosted" data-amount="30" data-price="499" data-seats="2" data-pack="Team Monthly">Get Plan</button>
                    </div>
                    <!-- Monthly Pack 4 -->
                    <div class="pricing-card">
                        <span class="pricing-tier">Business Monthly</span>
                        <div class="pricing-price-box">
                            <span class="pricing-price">$999</span><span class="pricing-period">/mo</span>
                        </div>
                        <ul class="pricing-features-list">
                            <li>100 Audits / mo</li>
                            <li>5 Seats</li>
                            <li>Team Shared Balance</li>
                        </ul>
                        <button class="btn btn-secondary pricing-cta-btn" data-plan="hosted" data-amount="100" data-price="999" data-seats="5" data-pack="Business Monthly">Get Plan</button>
                    </div>
                    <!-- Monthly Pack 5 -->
                    <div class="pricing-card">
                        <span class="pricing-tier">Corporate Monthly</span>
                        <div class="pricing-price-box">
                            <span class="pricing-price">$2,499</span><span class="pricing-period">/mo</span>
                        </div>
                        <ul class="pricing-features-list">
                            <li>300 Audits / mo</li>
                            <li>Unlimited Seats</li>
                            <li>Team Shared Balance</li>
                        </ul>
                        <button class="btn btn-secondary pricing-cta-btn" data-plan="hosted" data-amount="300" data-price="2499" data-seats="9999" data-pack="Corporate Monthly">Get Plan</button>
                    </div>
                    <!-- Monthly Pack 6 -->
                    <div class="pricing-card">
                        <span class="pricing-tier">Enterprise Monthly</span>
                        <div class="pricing-price-box">
                            <span class="pricing-price">$4,999</span><span class="pricing-period">/mo</span>
                        </div>
                        <ul class="pricing-features-list">
                            <li>1,000 Audits / mo</li>
                            <li>Unlimited Seats</li>
                            <li>Team Shared Balance</li>
                        </ul>
                        <button class="btn btn-secondary pricing-cta-btn" data-plan="hosted" data-amount="1000" data-price="4999" data-seats="9999" data-pack="Enterprise Monthly">Get Plan</button>
                    </div>
                </div>

                <div class="pricing-grid" id="hosted-grid-annual" style="display: none; flex-flow: row wrap; justify-content: center; gap: 30px; margin: 0 auto; width: 100%;">
                    <!-- Annual Pack 1 -->
                    <div class="pricing-card">
                        <span class="pricing-tier">Starter Annual</span>
                        <div class="pricing-price-box">
                            <span class="pricing-price">$449</span><span class="pricing-period">/yr</span>
                        </div>
                        <ul class="pricing-features-list">
                            <li>24 Audits / yr</li>
                            <li>1 Seat</li>
                            <li>Full Discrepancy Matrix</li>
                        </ul>
                        <button class="btn btn-secondary pricing-cta-btn" data-plan="hosted" data-amount="24" data-price="449" data-seats="1" data-pack="Starter Annual">Get Plan</button>
                    </div>
                    <!-- Annual Pack 2 -->
                    <div class="pricing-card">
                        <span class="pricing-tier">Pro Annual</span>
                        <div class="pricing-price-box">
                            <span class="pricing-price">$1,799</span><span class="pricing-period">/yr</span>
                        </div>
                        <ul class="pricing-features-list">
                            <li>120 Audits / yr</li>
                            <li>1 Seat</li>
                            <li>Full Discrepancy Matrix</li>
                        </ul>
                        <button class="btn btn-secondary pricing-cta-btn" data-plan="hosted" data-amount="120" data-price="1799" data-seats="1" data-pack="Pro Annual">Get Plan</button>
                    </div>
                    <!-- Annual Pack 3 -->
                    <div class="pricing-card featured-card">
                        <span class="pricing-tier" style="color: var(--color-purple);">Team Annual</span>
                        <div class="pricing-price-box">
                            <span class="pricing-price">$4,499</span><span class="pricing-period">/yr</span>
                        </div>
                        <ul class="pricing-features-list">
                            <li>360 Audits / yr</li>
                            <li>2 Seats</li>
                            <li>Team Shared Balance</li>
                        </ul>
                        <button class="btn btn-primary pricing-cta-btn" data-plan="hosted" data-amount="360" data-price="4499" data-seats="2" data-pack="Team Annual">Get Plan</button>
                    </div>
                    <!-- Annual Pack 4 -->
                    <div class="pricing-card">
                        <span class="pricing-tier">Business Annual</span>
                        <div class="pricing-price-box">
                            <span class="pricing-price">$8,999</span><span class="pricing-period">/yr</span>
                        </div>
                        <ul class="pricing-features-list">
                            <li>1,200 Audits / yr</li>
                            <li>5 Seats</li>
                            <li>Team Shared Balance</li>
                        </ul>
                        <button class="btn btn-secondary pricing-cta-btn" data-plan="hosted" data-amount="1200" data-price="8999" data-seats="5" data-pack="Business Annual">Get Plan</button>
                    </div>
                    <!-- Annual Pack 5 -->
                    <div class="pricing-card">
                        <span class="pricing-tier">Corporate Annual</span>
                        <div class="pricing-price-box">
                            <span class="pricing-price">$22,499</span><span class="pricing-period">/yr</span>
                        </div>
                        <ul class="pricing-features-list">
                            <li>3,600 Audits / yr</li>
                            <li>Unlimited Seats</li>
                            <li>Team Shared Balance</li>
                        </ul>
                        <button class="btn btn-secondary pricing-cta-btn" data-plan="hosted" data-amount="3600" data-price="22499" data-seats="9999" data-pack="Corporate Annual">Get Plan</button>
                    </div>
                    <!-- Annual Pack 6 -->
                    <div class="pricing-card">
                        <span class="pricing-tier">Enterprise Annual</span>
                        <div class="pricing-price-box">
                            <span class="pricing-price">$44,999</span><span class="pricing-period">/yr</span>
                        </div>
                        <ul class="pricing-features-list">
                            <li>12,000 Audits / yr</li>
                            <li>Unlimited Seats</li>
                            <li>Team Shared Balance</li>
                        </ul>
                        <button class="btn btn-secondary pricing-cta-btn" data-plan="hosted" data-amount="12000" data-price="44999" data-seats="9999" data-pack="Enterprise Annual">Get Plan</button>
                    </div>
                </div>
                <!-- HOSTED PLANS SCRIPT -->
                <script>
                    document.addEventListener('DOMContentLoaded', () => {
                        const btnMonthly = document.getElementById('toggle-monthly');
                        const btnAnnual = document.getElementById('toggle-annual');
                        const gridMonthly = document.getElementById('hosted-grid-monthly');
                        const gridAnnual = document.getElementById('hosted-grid-annual');
                        if(btnMonthly && btnAnnual) {
                            btnMonthly.addEventListener('click', () => {
                                btnMonthly.className = 'btn btn-primary';
                                btnAnnual.className = 'btn btn-secondary';
                                gridMonthly.style.display = 'flex';
                                gridAnnual.style.display = 'none';
                            });
                            btnAnnual.addEventListener('click', () => {
                                btnAnnual.className = 'btn btn-primary';
                                btnMonthly.className = 'btn btn-secondary';
                                gridAnnual.style.display = 'flex';
                                gridMonthly.style.display = 'none';
                            });
                        }
                    });
                </script>
'''

updated_content = re.sub(r'<div class="pricing-grid" id="hosted-grid">.*?</div>\s*</div>\s*<!-- BYOK Plans', new_grid + '\n                <!-- BYOK Plans', content, flags=re.DOTALL)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(updated_content)

print('Success')
