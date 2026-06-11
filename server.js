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

// SECURITY: Crash on startup if Supabase is not configured in production
if (process.env.NODE_ENV === 'production' && !supabaseAdmin) {
    console.error('FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured in production. Refusing to start with auth bypass enabled.');
    process.exit(1);
}

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

const allowedOrigins = [
    'https://leasealign.io',
    'https://www.leasealign.io',
    'https://leasealign-ai.vercel.app',
    'https://leasealign.vercel.app'
];

function getCorsOptions() {
    return {
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);
            const isLocalhost = origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
            if (allowedOrigins.indexOf(origin) !== -1 || isLocalhost) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        }
    };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 90000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error(`Gateway timeout: Upstream AI provider took longer than ${timeoutMs / 1000} seconds to respond.`);
        }
        throw error;
    }
}

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors(getCorsOptions()));

// Disable caching for all responses to ensure frontend/API are never cached
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});


// Auth Middleware to authenticate user and check seat limits
async function requireAuth(req, res, next) {
    if (!supabaseAdmin) {
        console.warn("[Security Bypass] Supabase Admin client not configured. Proceeding without auth validation.");
        req.user = { id: 'mock-user-id', email: 'mock@example.com', user_metadata: {} };
        return next();
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Unauthorized: Missing or invalid session token." });
    }
    const token = authHeader.substring(7).trim();
    if (!token) {
        return res.status(401).json({ error: "Unauthorized: Empty session token." });
    }

    try {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            console.error("[Auth Failure] Token verification failed:", authError?.message || "No user returned");
            return res.status(401).json({ error: "Unauthorized: Invalid or expired session token." });
        }

        // Session validation has been relaxed to support multi-seat plans.
        // We no longer block based on strict active_session_id matches.

        req.user = user;
        next();
    } catch (err) {
        console.error("[Auth Failure] Exception during token check:", err);
        return res.status(500).json({ error: "Internal Server Error during auth check." });
    }
}

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
    const firstBrace = cleanText.indexOf('{');
    const firstBracket = cleanText.indexOf('[');
    let startIdx = -1;
    let endIdx = -1;
    
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        startIdx = firstBrace;
        endIdx = cleanText.lastIndexOf('}');
    } else if (firstBracket !== -1) {
        startIdx = firstBracket;
        endIdx = cleanText.lastIndexOf(']');
    }
    
    if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
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


app.post('/api/refund-credit', requireAuth, async (req, res) => {
    try {
        const { transactionId, planMode } = req.body;
        if (!transactionId) return res.status(400).json({ error: 'Missing transactionId' });
        
        // Ensure this transaction exists for the user's team
        const { data: teamData } = await supabaseAdmin.from('profiles').select('team_id').eq('id', req.user.id).single();
        if (!teamData || !teamData.team_id) return res.status(400).json({ error: 'User has no team' });
        
        const { data: transExists } = await supabaseAdmin.from('audit_transactions').select('id').eq('transaction_id', transactionId).eq('team_id', teamData.team_id).single();
        if (!transExists) return res.status(404).json({ error: 'Transaction not found or not owned by user' });
        
        // Trigger the refund
        const { error } = await supabaseAdmin.rpc('refund_user_credits', {
            target_user_id: req.user.id,
            pages_to_refund: 1,
            plan_mode: planMode || 'hosted'
        });
        
        if (error) throw error;
        
        // Optionally delete the transaction record so it can't be refunded again (prevent double refunds)
        await supabaseAdmin.from('audit_transactions').delete().eq('transaction_id', transactionId);
        
        return res.json({ success: true, message: "Credit refunded successfully" });
    } catch (e) {
        console.error("Refund error:", e);
        return res.status(500).json({ error: e.message });
    }
});

// Stripe Webhook Endpoint (MUST be defined before express.json() to capture raw body Buffer)
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        if (!stripe) throw new Error("Stripe is not configured");
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (webhookSecret && sig) {
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } else if (process.env.NODE_ENV === 'production') {
            // SECURITY: Never accept unverified webhooks in production
            console.error('[Webhook] STRIPE_WEBHOOK_SECRET is not set in production. Rejecting unverified payload.');
            return res.status(400).json({ error: 'Webhook secret not configured. Cannot verify payload.' });
        } else {
            // Local development fallback only
            console.warn('[Webhook] Accepting unverified payload (dev mode only)');
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
                const { userId, planType, amount, seatCount } = subscription.metadata || {};
                
                if (userId && planType && amount) {
                    console.log(`Processing subscription renewal for user ${userId}: plan ${planType}, amount ${amount}, seats ${seatCount}`);
                    
                    if (supabaseAdmin) {
                        // Idempotency: log webhook transaction
                        const { error: insertErr } = await supabaseAdmin
                            .from('processed_payments')
                            .insert({
                                session_id: invoice.id || invoice.payment_intent || subscription.id,
                                user_id: userId,
                                amount: parseInt(amount, 10)
                            });
                        if (insertErr) {
                            if (insertErr.code === '23505') {
                                console.log(`[Stripe Webhook] Replay detected: event already processed.`);
                                return res.json({ received: true });
                            }
                            throw insertErr;
                        }

                        const amt = parseInt(amount, 10);
                        const seats = parseInt(seatCount || '1', 10);
                        
                        if (planType === 'byok') {
                            const { error: updateErr } = await supabaseAdmin
                                .from('profiles')
                                .update({ byok_credits: 999999 })
                                .eq('id', userId);
                            if (updateErr) throw updateErr;
                        } else if (planType === 'hosted') {
                            // Find the user's team and update it, or create if missing? 
                            // The user should already have a team created on signup, just update it based on owner_id.
                            const { data: team, error: teamFetchErr } = await supabaseAdmin
                                .from('teams')
                                .select('id')
                                .eq('owner_id', userId)
                                .single();
                                
                            if (teamFetchErr && teamFetchErr.code !== 'PGRST116') {
                                throw teamFetchErr;
                            }
                            
                            if (team) {
                                // Update existing team
                                const { error: updateTeamErr } = await supabaseAdmin
                                    .from('teams')
                                    .update({ 
                                        audit_credits: amt,
                                        seat_limit: seats,
                                        stripe_subscription_id: subscription.id,
                                        plan_tier: `hosted_${amt}`
                                    })
                                    .eq('id', team.id);
                                if (updateTeamErr) throw updateTeamErr;
                            } else {
                                // Fallback: Team doesn't exist, create it (should be handled by signup trigger normally)
                                const { data: newTeam, error: createTeamErr } = await supabaseAdmin
                                    .from('teams')
                                    .insert({
                                        name: `Premium Team`,
                                        owner_id: userId,
                                        audit_credits: amt,
                                        seat_limit: seats,
                                        stripe_subscription_id: subscription.id,
                                        plan_tier: `hosted_${amt}`
                                    })
                                    .select('id')
                                    .single();
                                if (createTeamErr) throw createTeamErr;
                                
                                await supabaseAdmin.from('profiles').update({ team_id: newTeam.id }).eq('id', userId);
                            }
                        }  console.log(`Successfully credited ${amt} pages to user ${userId} via webhook.`);
                    } else {
                        console.warn("Supabase Admin not configured. Webhook renewal skipped.");
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
                
                if (supabaseAdmin) {
                    if (planType === 'byok') {
                        const { error: updateErr } = await supabaseAdmin
                            .from('profiles')
                            .update({ byok_credits: 0 })
                            .eq('id', userId);
                        if (updateErr) throw updateErr;
                    } else {
                        // Look up the user's team
                        const { data: profile } = await supabaseAdmin
                            .from('profiles')
                            .select('team_id')
                            .eq('id', userId)
                            .single();
                            
                        if (profile && profile.team_id) {
                            const { error: updateErr } = await supabaseAdmin
                                .from('teams')
                                .update({ audit_credits: 0 })
                                .eq('id', profile.team_id);
                            if (updateErr) throw updateErr;
                        }
                    }
                    console.log(`Successfully reset credits to 0 for user ${userId} via webhook.`);
                } else {
                    console.warn("Supabase Admin not configured. Webhook reset skipped.");
                }
            } catch (err) {
                console.error("Error processing subscription deletion webhook:", err);
            }
        }
    }

    res.json({ received: true });
});

app.use(express.json({ limit: '10mb' })); // Support larger text inputs

// Serve static frontend files from /public directory only
// SECURITY: Prevents .env, server.js, and other sensitive files from being downloadable
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

// Route to serve public Supabase configuration parameters
app.get('/api/config', (req, res) => {
    if (!process.env.SUPABASE_URL) {
        console.warn("[Config Warning] SUPABASE_URL environment variable is missing on server.");
    }
    res.json({
        supabaseUrl: process.env.SUPABASE_URL || '',
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
    });
});


// Route to handle dynamic LLM provider extraction proxy
app.post('/api/audit', requireAuth, async (req, res) => {
    try {
        let { text, images, docType, connectionMode, provider, model, apiKey: userKey, systemPromptOverride, userPromptOverride } = req.body;
        
        // Security Fix: Strip overrides in hosted mode
        if (connectionMode === 'hosted') {
            systemPromptOverride = null;
            userPromptOverride = null;
        }
        
        if ((!text && !images) || !docType) {
            return res.status(400).json({ error: "Missing required fields: text or images, and docType" });
        }

        // Calculate page count on the server side to prevent client-side bypass/cheating
        let pageCount = 1;
        if (images && Array.isArray(images) && images.length > 0) {
            pageCount = images.length;
        } else if (text && typeof text === 'string') {
            const matches = text.match(/---\s*(?:\[PAGE\s*\d+\]|PAGE\s*\d+)\s*---/gi);
            if (matches && matches.length > 0) {
                pageCount = matches.length;
            } else {
                pageCount = Math.max(1, Math.ceil(text.length / 3000));
            }
        }

        // Determine which API key and models to use
        let activeKey;
        let activeProvider = provider || 'openai';
        let activeModel = model || 'gpt-4o-mini';
        let currentCredits = 0;
        let extractedData;

        if (connectionMode === 'hosted') {
            if (supabaseAdmin) {
                const transactionId = req.headers['x-transaction-id'] || null;
                // Atomic pre-deduction of 1 audit credit via RPC (idempotent per transaction)
                const { data: success, error: deductErr } = await supabaseAdmin
                    .rpc('deduct_user_credits', { 
                        target_user_id: req.user.id, 
                        pages_to_deduct: 1, 
                        plan_mode: 'hosted',
                        p_transaction_id: transactionId
                    });

                if (deductErr || !success) {
                    console.warn(`[Blocked] User ${req.user.email} attempted hosted audit with insufficient team audit credits. ${deductErr?.message || ''}`);
                    return res.status(403).json({ error: "Forbidden: Insufficient audit credits. This audit requires 1 audit credit from your team balance." });
                }
                console.log(`[Authorized & Deducted] Hosted audit request by ${req.user.email} (needs 1 audit credit)`);
            }

            // Hosted SaaS Mode uses the server's private key and runs Claude Sonnet
            activeKey = process.env.ANTHROPIC_API_KEY;
            activeProvider = 'anthropic';
            activeModel = 'claude-sonnet-4-6';
            
            if (!activeKey) {
                return res.status(500).json({ 
                    error: "SaaS Anthropic API Key is not configured on the backend server. Please switch to BYOK Mode in settings." 
                });
            }
        } else {
            // BYOK Mode: check active BYOK subscription (credits > 0)
            if (supabaseAdmin) {
                const { data: profile, error: profileErr } = await supabaseAdmin
                    .from('profiles')
                    .select('byok_credits')
                    .eq('id', req.user.id)
                    .single();
                     
                if (profileErr) {
                    console.error("[DB Failure] Failed to query profile BYOK credits:", profileErr.message);
                    return res.status(500).json({ error: "Internal Server Error: Failed to retrieve subscription status." });
                }
                
                const byokCredits = profile ? (profile.byok_credits || 0) : 0;
                if (byokCredits <= 0) {
                    console.warn(`[Blocked] User ${req.user.email} attempted BYOK audit without active BYOK subscription.`);
                    return res.status(403).json({ error: "Forbidden: No active BYOK subscription. Please subscribe to the BYOK Plan in settings to use your own API keys." });
                }
                console.log(`[Authorized] BYOK audit request by ${req.user.email} (BYOK Credits: ${byokCredits})`);
            }

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

            const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
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
                let errMsg = `OpenAI returned status ${response.status}`;
                try {
                    const errJson = await response.json();
                    errMsg = errJson.error?.message || errMsg;
                } catch(e) {}
                return res.status(response.status).json({ error: errMsg });
            }

            const data = await response.json();
            extractedData = extractAndParseJSON(data.choices[0].message.content);
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
            const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
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
                let errMsg = `Anthropic returned status ${response.status}`;
                try {
                    const errJson = await response.json();
                    errMsg = errJson.error?.message || errJson.message || errMsg;
                } catch(e) {}
                return res.status(response.status).json({ error: errMsg });
            }

            const data = await response.json();
            const rawContent = data.content[0].text;
            extractedData = extractAndParseJSON(rawContent);
        } else {
            return res.status(400).json({ error: `Unsupported AI provider: ${activeProvider}` });
        }



        if (extractedData) {
            // Asynchronously run 30-day purge for the user
            if (supabaseAdmin && req.user && req.user.id) {
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - 30);
                supabaseAdmin
                    .from('audits')
                    .delete()
                    .eq('user_id', req.user.id)
                    .lt('created_at', cutoffDate.toISOString())
                    .then(({ error }) => {
                        if (error) console.error(`[Purge] Failed to clean up old audits for ${req.user.email}:`, error);
                        else console.log(`[Purge] Cleaned up old audits for ${req.user.email}`);
                    });
            }

            return res.json(extractedData);
        } else {
            return res.status(500).json({ error: "Audit proxy failed: no data extracted." });
        }

    } catch (error) {
        console.error(`[Server Error]`, error);
        // Refund deducted page credits on failure
        if (connectionMode === 'hosted' && supabaseAdmin) {
            try {
                // Refund the single audit credit atomically via RPC
                await supabaseAdmin.rpc('refund_user_credits', { 
                    target_user_id: req.user.id, 
                    pages_to_refund: 1, 
                    plan_mode: 'hosted' 
                });
                console.log(`[Refund] Successfully refunded ${pageCount} credits to user ${req.user.email} due to error.`);
            } catch (refundErr) {
                console.error("[Refund Failure] Failed to refund user credits:", refundErr);
            }
        }
        res.status(500).json({ error: error.message || "Internal server error" });
    }
});

// Route to handle AI-assisted compliance comparison of lease vs estoppel
app.post('/api/compare', requireAuth, async (req, res) => {
    try {
        const { leaseJson, estoppelJson, connectionMode, provider, model, apiKey: userKey } = req.body;
        
        if (!leaseJson || !estoppelJson) {
            return res.status(400).json({ error: "Missing required fields: leaseJson and estoppelJson" });
        }

        if (connectionMode === 'hosted') {
            if (supabaseAdmin) {
                const transactionId = req.headers['x-transaction-id'] || null;
                // Atomic pre-deduction of 1 audit credit via RPC (idempotent per transaction)
                const { data: success, error: deductErr } = await supabaseAdmin
                    .rpc('deduct_user_credits', { 
                        target_user_id: req.user.id, 
                        pages_to_deduct: 1, 
                        plan_mode: 'hosted',
                        p_transaction_id: transactionId
                    });

                if (deductErr || !success) {
                    console.warn(`[Blocked] User ${req.user.email} attempted hosted comparison with insufficient credits.`);
                    return res.status(403).json({ error: "Forbidden: Insufficient audit credits. This comparison requires 1 audit credit." });
                }
                console.log(`[Authorized & Deducted] Hosted comparison request by ${req.user.email} (needs 1 credit)`);
            }
        } else {
            // BYOK Mode: check active BYOK subscription
            if (supabaseAdmin) {
                const { data: profile, error: profileErr } = await supabaseAdmin
                    .from('profiles')
                    .select('byok_credits')
                    .eq('id', req.user.id)
                    .single();
                     
                if (profileErr) {
                    console.error("[DB Failure] Failed to query profile BYOK credits on comparison:", profileErr.message);
                    return res.status(500).json({ error: "Internal Server Error: Failed to retrieve subscription status." });
                }
                
                const byokCredits = profile ? (profile.byok_credits || 0) : 0;
                if (byokCredits <= 0) {
                    console.warn(`[Blocked] User ${req.user.email} attempted BYOK comparison without active BYOK subscription.`);
                    return res.status(403).json({ error: "Forbidden: No active BYOK subscription. Please subscribe to the BYOK Plan in settings to use your own API keys." });
                }
                console.log(`[Authorized] BYOK comparison request by ${req.user.email} (BYOK Credits: ${byokCredits})`);
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
            activeModel = 'claude-sonnet-4-6';
            
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

CRITICAL GUIDELINES FOR SPECIFIC FIELDS:
- Rent Escalation Schedules: If the Lease specifies a starting rent with an escalation schedule or a range of monthly rent steps over time (e.g. "$35,000 escalating 3.5% annually" or "$35,000 in Year 1 to $47,701.41 in Year 10"), and the Estoppel specifies a rent that matches one of the subsequent years/steps (e.g. "$41,569.02"), this represents a scheduled rent progression. You MUST classify this as a 'warning' (requiring verification of the current lease year/anniversary) rather than a 'mismatch' (direct contradiction).

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
            const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
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
            const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
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
        
        else {
            return res.status(400).json({ error: `Unsupported AI provider: ${activeProvider}` });
        }

    } catch (error) {
        console.error(`[Server Error]`, error);
        // Refund deducted page credits on failure
        if (connectionMode === 'hosted' && supabaseAdmin) {
            try {
                await supabaseAdmin.rpc('refund_user_credits', {
                    target_user_id: req.user.id,
                    pages_to_refund: 1,
                    plan_mode: 'hosted'
                });
                console.log(`[Refund] Successfully refunded 1 credit to user ${req.user.email} due to error.`);
            } catch (refundErr) {
                console.error("[Refund Failure] Failed to refund user credits:", refundErr);
            }
        }
        res.status(500).json({ error: error.message || "Internal server error" });
    }
});


// Stripe Checkout Session Creation
app.post('/api/create-checkout-session', requireAuth, async (req, res) => {
    const { amount, planType, userId, price, packageName, seatCount, isSubscription } = req.body;
    
    if (!amount || !planType || !userId || !price || !packageName) {
        return res.status(400).json({ error: "Missing required fields for checkout session" });
    }

    // Secure verification: client userId must match authentic authenticated userId
    if (supabaseAdmin && userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden: Authenticated user ID mismatch." });
    }
    
    const priceInCents = Math.round(price * 100);
    
    try {
        if (!stripe) {
            return res.status(400).json({ error: "Stripe is not configured on the server. Please add STRIPE_SECRET_KEY to your .env file." });
        }
        
        // Dynamically compute absolute URL based on request headers (Vercel-safe)
        const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
        
        const amtVal = parseInt(amount, 10);
        const stripeIsSubscription = isSubscription === undefined ? true : isSubscription;
        let subscriptionInterval = 'month';

        if (planType === 'byok') {
            if (price === 1068 || price === 1908 || price === 4788) {
                subscriptionInterval = 'year';
            }
        } else if (planType === 'hosted') {
            if (price === 1188 || price === 2868 || price === 4788 || price === 9588) {
                subscriptionInterval = 'year';
            }
        }

        const displayAmount = (parseInt(amount, 10) >= 900000) ? 'Unlimited' : amount;
        
        const priceData = {
            currency: 'usd',
            product_data: {
                name: `${packageName} - LeaseAlign AI`,
                description: planType === 'hosted' ? `Includes ${displayAmount} audits and ${seatCount || 1} seats` : 'Unlimited audits for BYOK connection mode',
            },
            unit_amount: priceInCents,
        };

        if (stripeIsSubscription) {
            priceData.recurring = { interval: subscriptionInterval };
        }

        const sessionParams = {
            payment_method_types: ['card'],
            line_items: [{
                price_data: priceData,
                quantity: 1,
            }],
            mode: stripeIsSubscription ? 'subscription' : 'payment',
            metadata: {
                userId: userId,
                planType: planType,
                amount: amount.toString(),
                seatCount: (seatCount || 1).toString()
            },
            success_url: `${origin}/?checkout_success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/?checkout_cancel=true`,
        };

        if (stripeIsSubscription) {
            sessionParams.subscription_data = {
                metadata: {
                    userId: userId,
                    planType: planType,
                    amount: amount.toString(),
                    seatCount: (seatCount || 1).toString()
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
app.get('/api/verify-checkout-session', requireAuth, async (req, res) => {
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
            
            // SECURITY: Verify the authenticated user matches the session's userId
            if (userId && req.user && req.user.id !== userId) {
                console.warn(`[Stripe Verification] User ${req.user.id} attempted to verify session belonging to ${userId}`);
                return res.status(403).json({ error: 'Forbidden: Session does not belong to authenticated user.' });
            }
            
            if (userId && planType && amount) {
                console.log(`[Stripe Verification] Processing purchase for user ${userId}: plan ${planType}, amount ${amount}`);
                
                if (supabaseAdmin) {
                    // Idempotency: log webhook transaction
                    const { error: insertErr } = await supabaseAdmin
                        .from('processed_payments')
                        .insert({
                            session_id: session.id,
                            user_id: userId,
                            amount: parseInt(amount, 10)
                        });
                    if (insertErr) {
                        if (insertErr.code === '23505') {
                            console.log(`[Stripe Verification] Replay detected: Session ${session.id} already processed.`);
                            return res.json({ success: true, metadata: session.metadata, already_processed: true });
                        }
                        throw insertErr;
                    }

                    // Fetch user's current profile and team
                    const { data: profile, error: selectErr } = await supabaseAdmin
                        .from('profiles')
                        .select('credits, byok_credits, team_id, teams(audit_credits)')
                        .eq('id', userId)
                        .single();
                        
                    if (selectErr) {
                        console.error("[Stripe Verification DB Select Error]:", selectErr.message);
                        throw selectErr;
                    }
                    
                    const amt = parseInt(amount, 10);
                    
                    if (planType === 'byok') {
                        const { error: updateErr } = await supabaseAdmin
                            .from('profiles')
                            .update({ byok_credits: 999999 })
                            .eq('id', userId);
                        if (updateErr) throw updateErr;
                    } else {
                        if (profile.team_id) {
                            const baseCredits = profile.teams?.audit_credits || 0;
                            const { error: updateErr } = await supabaseAdmin
                                .from('teams')
                                .update({ audit_credits: baseCredits + amt })
                                .eq('id', profile.team_id);
                            if (updateErr) throw updateErr;
                        } else {
                            console.warn(`[Stripe Verification] User ${userId} has no team assigned, cannot credit hosted account`);
                        }
                    }
                    
                    // Update plan type in auth user metadata
                    const { error: metadataErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
                        user_metadata: { plan_type: planType }
                    });
                    
                    if (metadataErr) {
                        console.warn("[Stripe Verification User Metadata Warning]:", metadataErr.message);
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
    console.log(`📡 Server API Key: ${process.env.ANTHROPIC_API_KEY ? "CONFIGURED (SaaS Mode Active)" : "NOT SET (Only BYOK & Simulation Active)"}`);
    console.log(`================================================================`);
});
