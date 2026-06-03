const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
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
        const { text, docType, connectionMode, provider, model, apiKey: userKey } = req.body;
        
        if (!text || !docType) {
            return res.status(400).json({ error: "Missing required fields: text, docType" });
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
        const systemPrompt = `You are an expert commercial real estate due-diligence legal auditor.
Your job is to read the raw text of a commercial ${docType} contract and extract key terms with 100% precision.
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

        const userPrompt = `Here is the raw text extracted from the commercial ${docType} document:
======================================================================
${text}
======================================================================
Please extract the required fields and return the JSON.`;

        console.log(`[Audit Proxy] Running ${docType} audit via connection: ${connectionMode}, provider: ${activeProvider}, model: ${activeModel}`);

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
            const extractedData = JSON.parse(data.choices[0].message.content);
            return res.json(extractedData);
        } 
        
        else if (activeProvider === 'anthropic') {
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
                        { role: "user", content: userPrompt }
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
                    // Looks for quotes not preceded by backslash, colon, comma, curly brace or square bracket
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
            // Google Gemini generateContent API (supports json output mime type)
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${activeKey}`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    contents: [
                        { parts: [{ text: userPrompt }] }
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

// Start Server
app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(`🚀 TenantAudit AI is running in dual connection mode!`);
    console.log(`👉 Local URL: http://localhost:${PORT}`);
    console.log(`🔑 Server API Key: ${process.env.OPENAI_API_KEY ? "CONFIGURED (SaaS Mode Active)" : "NOT SET (Only BYOK & Simulation Active)"}`);
    console.log(`================================================================`);
});
