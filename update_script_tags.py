import re

html_script = '''
<script>
    document.addEventListener('DOMContentLoaded', () => {
        const btnMonthly = document.getElementById('toggle-monthly');
        const btnAnnual = document.getElementById('toggle-annual');
        const switchHosted = document.getElementById('switch-hosted');
        const switchByok = document.getElementById('switch-byok');

        const hostedGridMonthly = document.getElementById('hosted-grid-monthly');
        const hostedGridAnnual = document.getElementById('hosted-grid-annual');
        const byokGridMonthly = document.getElementById('byok-grid-monthly');
        const byokGridAnnual = document.getElementById('byok-grid-annual');

        let currentMode = 'hosted'; // 'hosted' or 'byok'
        let currentBilling = 'monthly'; // 'monthly' or 'annual'

        function updateGrids() {
            if (hostedGridMonthly) hostedGridMonthly.style.display = 'none';
            if (hostedGridAnnual) hostedGridAnnual.style.display = 'none';
            if (byokGridMonthly) byokGridMonthly.style.display = 'none';
            if (byokGridAnnual) byokGridAnnual.style.display = 'none';

            if (currentMode === 'hosted') {
                if (currentBilling === 'monthly' && hostedGridMonthly) hostedGridMonthly.style.display = 'grid';
                if (currentBilling === 'annual' && hostedGridAnnual) hostedGridAnnual.style.display = 'grid';
            } else {
                if (currentBilling === 'monthly' && byokGridMonthly) byokGridMonthly.style.display = 'grid';
                if (currentBilling === 'annual' && byokGridAnnual) byokGridAnnual.style.display = 'grid';
            }
        }

        if (btnMonthly && btnAnnual) {
            btnMonthly.addEventListener('click', () => {
                currentBilling = 'monthly';
                btnMonthly.className = 'btn btn-primary';
                btnAnnual.className = 'btn btn-secondary';
                updateGrids();
            });
            btnAnnual.addEventListener('click', () => {
                currentBilling = 'annual';
                btnAnnual.className = 'btn btn-primary';
                btnMonthly.className = 'btn btn-secondary';
                updateGrids();
            });
        }

        if (switchHosted && switchByok) {
            switchHosted.addEventListener('click', () => {
                currentMode = 'hosted';
                switchHosted.classList.add('active');
                switchByok.classList.remove('active');
                updateGrids();
            });
            switchByok.addEventListener('click', () => {
                currentMode = 'byok';
                switchByok.classList.add('active');
                switchHosted.classList.remove('active');
                updateGrids();
            });
        }
    });
</script>
'''

with open('public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Append script just before closing body tag or right after byok-grid-annual
content = re.sub(r'(<!-- BYOK ANNUAL -->[\s\S]*?</div>)', r'\1\n' + html_script, content)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
