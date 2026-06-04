const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Fix for Supabase Realtime in Node.js < 22 where WebSocket is not globally available
global.WebSocket = require('ws');

const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null;

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());

// Disable caching for all responses to ensure frontend/API are never cached
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

// Helper function to safely extract and parse JSON from LLM responses (handling code blocks & markdown fences)
function extractAndParseJSON(rawText) {
    if (typeof rawText !== 'string') {
        return rawText;
    }
    
    let cleanText = rawText.trim();
    
    // Remove markdown code block fences if present (e.g. ```json ... ``` or ``` ... ```)
    cleanText = cleanText.replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/g, '$1').trim();
    
    // If it still has backticks, let's try a regex match to pull out block content
    if (cleanText.includes('```')) {
        const match = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(cleanText);
        if (match && match[1]) {
            cleanText = match[1].trim();
        }
    }
    
    // Find the bounds of the JSON object
    const startIdx = cleanText.indexOf('{');
    const endIdx = cleanText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
        cleanText = cleanText.substring(startIdx, endIdx + 1).trim();
    }
    
    try {
        return JSON.parse(cleanText);
    } catch (err) {
        console.error("[JSON Parse Error] Initial parse failed. Text:", cleanText);
        // Attempt simple automatic JSON fix-ups (e.g. escape unescaped double quotes inside quote fields):
        try {
            const rescuedContent = cleanText.replace(/(?<![:{\[,])"(?![:}\],])/g, '\\"');
            return JSON.parse(rescuedContent);
        } catch (retryErr) {
            throw new Error(`Failed to parse response as JSON: ${err.message}. Content: ${cleanText.slice(0, 300)}...`);
        }
    }
}

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
                            updateFields = { byok_credits: amt };
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
            // Validate that the request comes from an authenticated session with positive credit balance
            if (supabaseAdmin) {
                const authHeader = req.headers['authorization'];
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return res.status(401).json({ error: "Unauthorized: Missing or invalid session token." });
                }
                const token = authHeader.substring(7).trim();
                if (!token) {
                    return res.status(401).json({ error: "Unauthorized: Empty session token." });
                }
                
                // Retrieve user details using token
                const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
                if (authError || !user) {
                    console.error("[Auth Failure] Token verification failed:", authError?.message || "No user returned");
                    return res.status(401).json({ error: "Unauthorized: Invalid or expired session token." });
                }
                
                // Query user's credit balance
                const { data: profile, error: profileErr } = await supabaseAdmin
                    .from('profiles')
                    .select('credits')
                    .eq('id', user.id)
                    .single();
                    
                if (profileErr) {
                    console.error("[DB Failure] Failed to query profile credits:", profileErr.message);
                    return res.status(500).json({ error: "Internal Server Error: Failed to retrieve page credits balance." });
                }
                
                if (!profile || typeof profile.credits === 'undefined' || profile.credits <= 0) {
                    console.warn(`[Blocked] User ${user.email} attempted hosted audit with insufficient credits: ${profile ? profile.credits : 'No profile'}`);
                    return res.status(403).json({ error: "Forbidden: Insufficient page credits. Please top up your account." });
                }
                
                console.log(`[Authorized] Hosted audit request by ${user.email} (${profile.credits} credits remaining)`);
            } else {
                console.warn("[Security Bypass] Supabase Admin client not configured. Proceeding without auth validation.");
            }

            // Hosted SaaS Mode uses the server's private key and runs Claude Sonnet
            activeKey = process.env.ANTHROPIC_API_KEY;
            activeProvider = 'anthropic';
            activeModel = 'claude-sonnet-4-5-20250929'; // Server is configured to run Claude Sonnet as default
            
            if (!activeKey) {
                return res.status(500).json({ 
                    error: "SaaS Anthropic API Key is not configured on the backend server. Please switch to BYOK Mode in settings." 
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
            const extractedData = extractAndParseJSON(data.choices[0].message.content);
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
            const extractedData = extractAndParseJSON(rawContent);
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
            const extractedData = extractAndParseJSON(rawText);
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
            const extractedData = extractAndParseJSON(data.choices[0].message.content);
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

// Route to handle AI-assisted compliance comparison of lease vs estoppel
app.post('/api/compare', async (req, res) => {
    try {
        const { leaseJson, estoppelJson, connectionMode, provider, model, apiKey: userKey } = req.body;
        
        if (!leaseJson || !estoppelJson) {
            return res.status(400).json({ error: "Missing required fields: leaseJson and estoppelJson" });
        }

        // Validate that the request comes from an authenticated session with positive credit balance
        if (connectionMode === 'hosted') {
            if (supabaseAdmin) {
                const authHeader = req.headers['authorization'];
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return res.status(401).json({ error: "Unauthorized: Missing or invalid session token." });
                }
                const token = authHeader.substring(7).trim();
                if (!token) {
                    return res.status(401).json({ error: "Unauthorized: Empty session token." });
                }
                
                // Retrieve user details using token
                const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
                if (authError || !user) {
                    console.error("[Auth Failure] Token verification failed on comparison:", authError?.message || "No user returned");
                    return res.status(401).json({ error: "Unauthorized: Invalid or expired session token." });
                }
                
                // Query user's credit balance
                const { data: profile, error: profileErr } = await supabaseAdmin
                    .from('profiles')
                    .select('credits')
                    .eq('id', user.id)
                    .single();
                    
                if (profileErr) {
                    console.error("[DB Failure] Failed to query profile credits on comparison:", profileErr.message);
                    return res.status(500).json({ error: "Internal Server Error: Failed to retrieve page credits balance." });
                }
                
                if (!profile || typeof profile.credits === 'undefined' || profile.credits <= 0) {
                    console.warn(`[Blocked] User ${user.email} attempted hosted comparison with insufficient credits: ${profile ? profile.credits : 'No profile'}`);
                    return res.status(403).json({ error: "Forbidden: Insufficient page credits. Please top up your account." });
                }
                
                console.log(`[Authorized] Hosted comparison request by ${user.email}`);
            } else {
                console.warn("[Security Bypass] Supabase Admin client not configured. Proceeding without auth validation.");
            }
        }

        // Determine which API key to use
        let activeKey;
        let activeProvider = provider || 'openai';
        let activeModel = model || 'gpt-4o-mini';

        if (connectionMode === 'hosted') {
            // Hosted SaaS Mode uses the server's private key and runs Claude Sonnet as default
            activeKey = process.env.ANTHROPIC_API_KEY;
            activeProvider = 'anthropic';
            activeModel = 'claude-sonnet-4-5-20250929';
            
            if (!activeKey) {
                return res.status(500).json({ 
                    error: "SaaS Anthropic API Key is not configured on the backend server. Please switch to BYOK Mode in settings." 
                });
            }
        } else {
            // BYOK Mode uses the client's provided key
            activeKey = userKey;
            if (!activeKey) {
                return res.status(400).json({ error: "BYOK key is missing in request." });
            }
        }

        // System prompt for structured JSON compliance comparison
        const systemPrompt = `You are an expert commercial real estate due-diligence legal auditor.
Your job is to compare extracted Lease terms and Estoppel terms for compliance.
For each of the 11 terms, determine if the values represent a 'match', a 'warning', or a 'mismatch':
- 'match': The values are semantically identical or fully compliant (e.g. "14,500 rentable square feet" and "14,500 SF" match; "$12,000" and "$12,000.00 / month" match; "Starbucks Corporation" and "Starbucks Corp." match).
- 'warning': A value is missing in one document (e.g. "Not Mentioned" or "Not Found"), or there is a minor omission but not a direct contradiction.
- 'mismatch': There is a clear contradiction or discrepancy (e.g. different rent amounts, different dates, different renewal terms).

For each term, you must return a status ('match', 'warning', 'mismatch') and a concise reason.
Return ONLY a valid JSON object in this exact format:
{
  "tenantName": { "status": "match|warning|mismatch", "reason": "Explanation" },
  "suiteNumber": { "status": "match|warning|mismatch", "reason": "Explanation" },
  "premisesSf": { "status": "match|warning|mismatch", "reason": "Explanation" },
  "monthlyRent": { "status": "match|warning|mismatch", "reason": "Explanation" },
  "expiryDate": { "status": "match|warning|mismatch", "reason": "Explanation" },
  "securityDeposit": { "status": "match|warning|mismatch", "reason": "Explanation" },
  "renewalOptions": { "status": "match|warning|mismatch", "reason": "Explanation" },
  "camShare": { "status": "match|warning|mismatch", "reason": "Explanation" },
  "guarantorName": { "status": "match|warning|mismatch", "reason": "Explanation" },
  "prepaidRent": { "status": "match|warning|mismatch", "reason": "Explanation" },
  "landlordDefault": { "status": "match|warning|mismatch", "reason": "Explanation" }
}`;

        const userPrompt = `Compare these two term extractions for discrepancies:
======================================================================
Lease Extracted:
${JSON.stringify(leaseJson, null, 2)}

Estoppel Extracted:
${JSON.stringify(estoppelJson, null, 2)}
======================================================================
Please compare all fields and return the structured JSON report.`;

        console.log(`[Audit Proxy] Running semantic comparison via connection: ${connectionMode}, provider: ${activeProvider}, model: ${activeModel}`);

        // Route calls to corresponding LLM provider
        if (activeProvider === 'openai') {
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
                        { role: "user", content: userPrompt }
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
            const resultData = extractAndParseJSON(data.choices[0].message.content);
            return res.json(resultData);
        } 
        
        else if (activeProvider === 'anthropic') {
            const response = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": activeKey,
                    "anthropic-version": "2023-06-01"
                },
                body: JSON.stringify({
                    model: activeModel,
                    max_tokens: 2000,
                    system: systemPrompt,
                    messages: [
                        { role: "user", content: [{ type: "text", text: userPrompt }] }
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
            const resultData = extractAndParseJSON(rawContent);
            return res.json(resultData);
        } 
        
        else if (activeProvider === 'gemini') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${activeKey}`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: userPrompt }] }],
                    systemInstruction: { parts: [{ text: systemPrompt }] },
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
            const resultData = extractAndParseJSON(rawText);
            return res.json(resultData);
        } 
        
        else if (activeProvider === 'deepseek') {
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
            const resultData = extractAndParseJSON(data.choices[0].message.content);
            return res.json(resultData);
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
        
        const isSubscription = (planType === 'byok') || (price === 999.00 || price === 2499.00);
        const subscriptionInterval = (planType === 'byok' && price === 149.00) ? 'month' : 'year';
        const displayAmount = (parseInt(amount, 10) >= 900000) ? 'Unlimited' : amount;
        
        const sessionParams = {
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: `${packageName} - LeaseAlign AI`,
                        description: displayAmount === 'Unlimited' ? 'Unlimited pages subscription for BYOB connection mode' : `Purchase of ${amount} page credits for Hosted SaaS connection mode`,
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
            sessionParams.line_items[0].price_data.recurring = { interval: subscriptionInterval };
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
            const { userId, planType, amount } = session.metadata || {};
            
            if (userId && planType && amount) {
                console.log(`[Stripe Verification] Processing purchase for user ${userId}: plan ${planType}, amount ${amount}`);
                
                if (supabaseAdmin) {
                    // Fetch user's current profile credits
                    const { data: profile, error: selectErr } = await supabaseAdmin
                        .from('profiles')
                        .select('credits, byok_credits')
                        .eq('id', userId)
                        .single();
                        
                    if (selectErr) {
                        console.error("[Stripe Verification DB Select Error]:", selectErr.message);
                        throw selectErr;
                    }
                    
                    const amt = parseInt(amount, 10);
                    let updateFields = {};
                    
                    if (planType === 'byok') {
                        updateFields = { byok_credits: amt };
                    } else {
                        const isAnnual = (amt === 8000 || amt === 20000);
                        const baseCredits = isAnnual ? 0 : (profile.credits || 0);
                        updateFields = { credits: baseCredits + amt };
                    }
                    
                    // Update user's profile credits
                    const { error: updateErr } = await supabaseAdmin
                        .from('profiles')
                        .update(updateFields)
                        .eq('id', userId);
                        
                    if (updateErr) {
                        console.error("[Stripe Verification DB Update Error]:", updateErr.message);
                        throw updateErr;
                    }
                    
                    // Update plan type in auth user metadata
                    const { error: metadataErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
                        user_metadata: { plan_type: planType }
                    });
                    
                    if (metadataErr) {
                        console.warn("[Stripe Verification User Metadata Warning]:", metadataErr.message);
                        // Do not throw on metadata update failure, as credit balance is already saved successfully
                    }
                    
                    console.log(`[Stripe Verification] Successfully credited user ${userId} with ${amount} pages for plan ${planType}`);
                } else {
                    console.warn("[Stripe Verification Bypass] Supabase Admin client not configured. Skip database write.");
                }
            }
            
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
