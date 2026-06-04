const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());

// Stripe Webhook Endpoint (MUST be defined before express.json() to capture raw body Buffer)
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        if (!stripe) throw new Error("Stripe is not configured");
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (webhookSecret && sig) {
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } else {
            // Fallback for local development
            event = JSON.parse(req.body);
        }
    } catch (err) {
        console.error("Webhook signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'invoice.payment_succeeded') {
        const invoice = event.data.object;
        if (invoice.subscription) {
            try {
                const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
                const { userId, planType, amount } = subscription.metadata;
                
                if (userId && planType && amount) {
                    console.log(`Processing subscription renewal for user ${userId}: plan ${planType}, amount ${amount}`);
                    
                    const { createClient } = require('@supabase/supabase-js');
                    const supabaseUrl = process.env.SUPABASE_URL;
                    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
                    
                    if (supabaseUrl && supabaseServiceKey) {
                        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
                        const { data: profile, error: fetchErr } = await supabaseAdmin
                            .from('profiles')
                            .select('credits, byok_credits')
                            .eq('id', userId)
                            .single();
                            
                        if (fetchErr) throw fetchErr;
                        
                        const amt = parseInt(amount, 10);
                        let updateFields = {};
                        
                        if (planType === 'byok') {
                            const isAnnual = (amt === 10000 || amt === 25000);
                            const baseCredits = isAnnual ? 0 : (profile.byok_credits || 0);
                            updateFields = { byok_credits: baseCredits + amt };
                        } else {
                            const isAnnual = (amt === 8000 || amt === 20000);
                            const baseCredits = isAnnual ? 0 : (profile.credits || 0);
                            updateFields = { credits: baseCredits + amt };
                        }
                        
                        const { error: updateErr } = await supabaseAdmin
                            .from('profiles')
                            .update(updateFields)
                            .eq('id', userId);
                            
                        if (updateErr) throw updateErr;
                        console.log(`Successfully credited ${amt} pages to user ${userId} via webhook.`);
                    } else {
                        console.warn("Supabase Service Role Key or URL not configured on backend. Webhook renewal skipped.");
                    }
                }
            } catch (err) {
                console.error("Error processing invoice payment success webhook:", err);
            }
        }
    } else if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object;
        const { userId, planType } = subscription.metadata || {};
        
        if (userId && planType) {
            try {
                console.log(`Processing subscription termination for user ${userId}: plan ${planType}`);
                
                const { createClient } = require('@supabase/supabase-js');
                const supabaseUrl = process.env.SUPABASE_URL;
                const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
                
                if (supabaseUrl && supabaseServiceKey) {
                    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
                    let updateFields = {};
                    
                    if (planType === 'byok') {
                        updateFields = { byok_credits: 0 };
                    } else {
                        updateFields = { credits: 0 };
                    }
                    
                    const { error: updateErr } = await supabaseAdmin
                        .from('profiles')
                        .update(updateFields)
                        .eq('id', userId);
                        
                    if (updateErr) throw updateErr;
                    console.log(`Successfully reset credits to 0 for user ${userId} via webhook due to cancellation/failure.`);
                } else {
                    console.warn("Supabase Service Role Key or URL not configured on backend. Webhook reset skipped.");
                }
            } catch (err) {
                console.error("Error processing subscription deletion webhook:", err);
            }
        }
    }

    res.json({ received: true });
});

app.use(express.json({ limit: '10mb' })); // Support larger text inputs

// Serve static frontend files from current directory
app.use(express.static(__dirname));

// Route to serve public Supabase configuration parameters
app.get('/api/config', (req, res) => {
    res.json({
        supabaseUrl: process.env.SUPABASE_URL || 'https://mcfrihcnqatynfhpijkh.supabase.co',
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
    });
});


// Route to handle dynamic LLM provider extraction proxy
app.post('/api/audit', async (req, res) => {
    try {
        const { text, images, docType, connectionMode, provider, model, apiKey: userKey, systemPromptOverride, userPromptOverride } = req.body;
        
        if ((!text && !images) || !docType) {
            return res.status(400).json({ error: "Missing required fields: text or images, and docType" });
        }

        // Determine which API key to use
        let activeKey;
        let activeProvider = provider || 'openai';
        let activeModel = model || 'gpt-4o-mini';

        if (connectionMode === 'hosted') {
            // Hosted SaaS Mode uses the server's private key and runs GPT-4o
            activeKey = process.env.OPENAI_API_KEY;
            activeProvider = 'openai';
            activeModel = 'gpt-4o'; // Server is configured to run gpt-4o as default
            
            if (!activeKey) {
                return res.status(500).json({ 
                    error: "SaaS OpenAI API Key is not configured on the backend server. Please switch to BYOK Mode in settings." 
                });
            }
        } else {
            // BYOK Mode uses the client's provided key
            activeKey = userKey;
            if (!activeKey) {
                return res.status(400).json({ error: "BYOK key is missing in request." });
            }
        }

        // System prompt for all LLM providers
        const systemPrompt = systemPromptOverride || `You are an expert commercial real estate due-diligence legal auditor.
Your job is to read the raw text or images of a commercial ${docType} contract and extract key terms with 100% precision.
You must output a JSON object containing the exact fields and the verbatim quote proving the value.

CRITICAL: You must output ONLY a valid JSON object. Do not include any conversational intro or outro text. If any extracted value or verbatim quote contains double quotes (") or newlines, you MUST escape them as \\" and \\n respectively so that the output remains a syntactically valid JSON string.

Return JSON in this EXACT structure:
{
  "tenantName": { "value": "Extracted string or 'Not Mentioned'", "quote": "Verbatim quote from text showing this" },
  "suiteNumber": { "value": "Extracted string or 'Not Mentioned'", "quote": "Verbatim quote from text showing this" },
  "premisesSf": { "value": "Extracted string (e.g. 5,000 SF) or 'Not Mentioned'", "quote": "Verbatim quote showing this" },
  "monthlyRent": { "value": "Extracted string (e.g. $10,000) or 'Not Mentioned'", "quote": "Verbatim quote showing this" },
  "expiryDate": { "value": "Extracted date or 'Not Mentioned'", "quote": "Verbatim quote showing this" },
  "securityDeposit": { "value": "Extracted string or 'Not Mentioned'", "quote": "Verbatim quote showing this" },
  "renewalOptions": { "value": "Extracted renewal options terms or 'Not Mentioned'", "quote": "Verbatim quote showing this" },
  "camShare": { "value": "Extracted CAM share and cost caps or 'Not Mentioned'", "quote": "Verbatim quote showing this" },
  "guarantorName": { "value": "Extracted corporate guarantor or 'Not Mentioned'", "quote": "Verbatim quote showing this" },
  "prepaidRent": { "value": "Extracted prepaid rent amount or 'Not Mentioned'", "quote": "Verbatim quote showing this" },
  "landlordDefault": { "value": "Extracted landlord defaults/breaches or 'Not Mentioned'", "quote": "Verbatim quote showing this" }
}`;

        let userPrompt;
        const hasImages = images && Array.isArray(images) && images.length > 0;
        
        if (userPromptOverride) {
            userPrompt = userPromptOverride;
        } else if (hasImages) {
            userPrompt = `Here are the rendered image pages from the commercial ${docType} document. Please visually run OCR/transcribe on these pages and extract the required fields to return the JSON. Make sure to find verbatim text snippets as quotes.`;
        } else {
            userPrompt = `Here is the raw text extracted from the commercial ${docType} document:
======================================================================
${text}
======================================================================
Please extract the required fields and return the JSON.`;
        }

        console.log(`[Audit Proxy] Running ${docType} audit via connection: ${connectionMode}, provider: ${activeProvider}, model: ${activeModel}, inputMode: ${hasImages ? "VISION" : "TEXT"}`);

        // Route calls to corresponding LLM provider
        if (activeProvider === 'openai') {
            let messagesContent;
            if (hasImages) {
                messagesContent = [
                    { type: "text", text: userPrompt }
                ];
                for (const img of images) {
                    messagesContent.push({
                        type: "image_url",
                        image_url: {
                            url: img
                        }
                    });
                }
            } else {
                messagesContent = userPrompt;
            }

            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${activeKey}`
                },
                body: JSON.stringify({
                    model: activeModel,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: messagesContent }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.1
                })
            });

            if (!response.ok) {
                const errJson = await response.json().catch(() => ({}));
                return res.status(response.status).json({ error: errJson.error?.message || `OpenAI returned status ${response.status}` });
            }

            const data = await response.json();
            const extractedData = JSON.parse(data.choices[0].message.content);
            return res.json(extractedData);
        } 
        
        else if (activeProvider === 'anthropic') {
            let messagesContent;
            if (hasImages) {
                messagesContent = [
                    { type: "text", text: userPrompt }
                ];
                for (const img of images) {
                    const match = img.match(/^data:(image\/\w+);base64,(.+)$/);
                    if (match) {
                        const mediaType = match[1];
                        const base64Data = match[2];
                        messagesContent.push({
                            type: "image",
                            source: {
                                type: "base64",
                                media_type: mediaType,
                                data: base64Data
                            }
                        });
                    }
                }
            } else {
                messagesContent = [{ type: "text", text: userPrompt }];
            }

            // Anthropic Claude Messages API
            const response = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": activeKey,
                    "anthropic-version": "2023-06-01"
                },
                body: JSON.stringify({
                    model: activeModel,
                    max_tokens: 4000,
                    system: systemPrompt,
                    messages: [
                        { role: "user", content: messagesContent }
                    ],
                    temperature: 0.1
                })
            });

            if (!response.ok) {
                const errJson = await response.json().catch(() => ({}));
                return res.status(response.status).json({ error: errJson.error?.message || `Anthropic returned status ${response.status}` });
            }

            const data = await response.json();
            const rawContent = data.content[0].text;
            
            // Extract the JSON object substring between the first '{' and last '}'
            const jsonStart = rawContent.indexOf('{');
            const jsonEnd = rawContent.lastIndexOf('}');
            
            if (jsonStart === -1 || jsonEnd === -1) {
                return res.status(500).json({ 
                    error: `LLM response did not contain a valid JSON block. Raw output: ${rawContent.slice(0, 200)}...` 
                });
            }
            
            const cleanContent = rawContent.slice(jsonStart, jsonEnd + 1).trim();
            
            let extractedData;
            try {
                extractedData = JSON.parse(cleanContent);
            } catch (err) {
                console.error("[JSON Parse Error] Raw text:", cleanContent);
                // Attempt simple automatic JSON fix-ups:
                try {
                    // Try to escape any unescaped double quotes inside quote fields:
                    const rescuedContent = cleanContent
                        .replace(/(?<![:{\[,])"(?![:}\],])/g, '\\"');
                    extractedData = JSON.parse(rescuedContent);
                    console.log("[JSON Parse Rescued] Successfully parsed after escape correction.");
                } catch (retryErr) {
                    return res.status(500).json({ 
                        error: `Claude output could not be parsed as valid JSON: ${err.message}. Raw output: ${cleanContent.slice(0, 300)}...` 
                    });
                }
            }
            
            return res.json(extractedData);
        } 
        
        else if (activeProvider === 'gemini') {
            let parts = [{ text: userPrompt }];
            if (hasImages) {
                for (const img of images) {
                    const match = img.match(/^data:(image\/\w+);base64,(.+)$/);
                    if (match) {
                        const mimeType = match[1];
                        const base64Data = match[2];
                        parts.push({
                            inlineData: {
                                mimeType: mimeType,
                                data: base64Data
                            }
                        });
                    }
                }
            }

            // Google Gemini generateContent API (supports json output mime type)
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${activeKey}`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    contents: [
                        { parts: parts }
                    ],
                    systemInstruction: {
                        parts: [{ text: systemPrompt }]
                    },
                    generationConfig: {
                        responseMimeType: "application/json",
                        temperature: 0.1
                    }
                })
            });

            if (!response.ok) {
                const errJson = await response.json().catch(() => ({}));
                return res.status(response.status).json({ error: errJson.error?.message || `Gemini returned status ${response.status}` });
            }

            const data = await response.json();
            const rawText = data.candidates[0].content.parts[0].text;
            const extractedData = JSON.parse(rawText);
            return res.json(extractedData);
        } 
        
        else if (activeProvider === 'deepseek') {
            if (hasImages) {
                return res.status(400).json({ error: "DeepSeek does not support vision/OCR audits. Please select OpenAI, Anthropic, or Gemini in settings." });
            }
            // DeepSeek OpenAI-compatible API proxy
            const response = await fetch("https://api.deepseek.com/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${activeKey}`
                },
                body: JSON.stringify({
                    model: activeModel,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.1
                })
            });

            if (!response.ok) {
                const errJson = await response.json().catch(() => ({}));
                return res.status(response.status).json({ error: errJson.error?.message || `DeepSeek returned status ${response.status}` });
            }

            const data = await response.json();
            const extractedData = JSON.parse(data.choices[0].message.content);
            return res.json(extractedData);
        } 
        
        else {
            return res.status(400).json({ error: `Unsupported AI provider: ${activeProvider}` });
        }

    } catch (error) {
        console.error(`[Server Error]`, error);
        res.status(500).json({ error: error.message || "Internal server error" });
    }
});

// Stripe Checkout Session Creation
app.post('/api/create-checkout-session', async (req, res) => {
    const { amount, planType, userId, price, packageName } = req.body;
    
    if (!amount || !planType || !userId || !price || !packageName) {
        return res.status(400).json({ error: "Missing required fields for checkout session" });
    }
    
    const priceInCents = Math.round(price * 100);
    
    try {
        if (!stripe) {
            return res.status(400).json({ error: "Stripe is not configured on the server. Please add STRIPE_SECRET_KEY to your .env file." });
        }
        
        // Dynamically compute absolute URL based on request headers (Vercel-safe)
        const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
        
        const isSubscription = (price === 999.00 || price === 2499.00);
        
        const sessionParams = {
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: `${packageName} - LeaseAlign AI`,
                        description: `Purchase of ${amount} page credits for ${planType === 'hosted' ? 'Hosted SaaS Plan' : 'BYOB Plan'}`,
                    },
                    unit_amount: priceInCents,
                },
                quantity: 1,
            }],
            mode: isSubscription ? 'subscription' : 'payment',
            metadata: {
                userId: userId,
                planType: planType,
                amount: amount.toString()
            },
            success_url: `${origin}/?checkout_success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/?checkout_cancel=true`,
        };

        if (isSubscription) {
            sessionParams.line_items[0].price_data.recurring = { interval: 'year' };
            sessionParams.subscription_data = {
                metadata: {
                    userId: userId,
                    planType: planType,
                    amount: amount.toString()
                }
            };
        }

        const session = await stripe.checkout.sessions.create(sessionParams);
        
        res.json({ id: session.id, url: session.url, mode: 'stripe' });
    } catch (err) {
        console.error("Error creating checkout session:", err);
        res.status(500).json({ error: err.message });
    }
});

// Stripe Session Verification
app.get('/api/verify-checkout-session', async (req, res) => {
    const { session_id } = req.query;
    if (!session_id) {
        return res.status(400).json({ error: "Missing session_id query parameter" });
    }
    
    try {
        if (!stripe) {
            return res.status(400).json({ error: "Stripe is not configured on this server." });
        }
        
        const session = await stripe.checkout.sessions.retrieve(session_id);
        if (session.payment_status === 'paid') {
            res.json({ success: true, metadata: session.metadata });
        } else {
            res.json({ success: false, error: "Payment not completed" });
        }
    } catch (err) {
        console.error("Error verifying checkout session:", err);
        res.status(500).json({ error: err.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(`🚀 LeaseAlign AI is running in dual connection mode!`);
    console.log(`👉 Local URL: http://localhost:${PORT}`);
    console.log(`🔑 Server API Key: ${process.env.OPENAI_API_KEY ? "CONFIGURED (SaaS Mode Active)" : "NOT SET (Only BYOK & Simulation Active)"}`);
    console.log(`================================================================`);
});
