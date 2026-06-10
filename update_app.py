import re

with open('public/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the pendingPurchase logic in checkSession and login form
def replace_pending(match):
    return '''if (window.pendingPurchase) {
                        const { plan, amount, price, seats, packageName } = window.pendingPurchase;
                        window.pendingPurchase = null; // Clear state
                        showLoader("Connecting to payment checkout...");
                        try {
                            const { data: { user } } = await supabase.auth.getUser();
                            const response = await fetch('/api/create-checkout-session', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    amount: parseInt(amount, 10),
                                    planType: plan,
                                    userId: user.id,
                                    price: parseInt(price, 10),
                                    seatCount: parseInt(seats, 10),
                                    packageName: packageName
                                })
                            });
                            const sessionData = await response.json();
                            hideLoader();
                            if (sessionData.error) throw new Error(sessionData.error);
                            if (sessionData.url) {
                                window.location.href = sessionData.url;
                            } else {
                                throw new Error("Stripe checkout session creation failed.");
                            }
                        } catch(err) {
                            hideLoader();
                            alert("Error initiating checkout: " + err.message);
                        }
                    }'''

# Replace in checkSession
content = re.sub(r'if\s*\(window\.pendingPurchase\)\s*\{[\s\S]*?(?=\s*// --- Check for Stripe)', replace_pending, content)
# Replace in login
content = re.sub(r'if\s*\(window\.pendingPurchase\)\s*\{[\s\S]*?(?=\s*\}\s*\}\s*\} catch \(err\))', replace_pending, content)


# Replace pricing cta
def replace_pricing(match):
    return '''const pricingCtaBtns = document.querySelectorAll('.pricing-cta-btn');
    pricingCtaBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const plan = btn.getAttribute('data-plan');
            const amount = btn.getAttribute('data-amount');
            const price = btn.getAttribute('data-price');
            const seats = btn.getAttribute('data-seats');
            const packageName = btn.getAttribute('data-pack');
            
            if (!isLoggedIn) {
                window.pendingPurchase = { plan, amount, price, seats, packageName };
                showView('login');
            } else {
                try {
                    showLoader("Connecting to payment checkout...");
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) throw new Error("No authenticated user found.");
                    
                    const response = await fetch('/api/create-checkout-session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            amount: parseInt(amount, 10),
                            planType: plan,
                            userId: user.id,
                            price: parseInt(price, 10),
                            seatCount: parseInt(seats, 10),
                            packageName: packageName
                        })
                    });

                    const sessionData = await response.json();
                    hideLoader();

                    if (sessionData.error) throw new Error(sessionData.error);

                    if (sessionData.url) {
                        window.location.href = sessionData.url;
                    } else {
                        throw new Error("Stripe checkout session creation failed. No URL returned.");
                    }
                } catch (err) {
                    hideLoader();
                    console.error("Checkout error:", err);
                    alert("Error initiating checkout: " + err.message);
                }
            }
        });
    });'''

content = re.sub(r'const pricingCtaBtns = document\.querySelectorAll\(\'\.pricing-cta-btn\'\);[\s\S]*?(?=\s*// Event delegation on authToggleContainer)', replace_pricing, content)

with open('public/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated app.js")
