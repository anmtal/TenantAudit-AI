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

// Route to handle OpenAI extraction proxy
app.post('/api/audit', async (req, res) => {
    try {
        const { text, docType, model } = req.body;
        
        if (!text || !docType) {
            return res.status(400).json({ error: "Missing required fields: text, docType" });
        }
        
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ 
                error: "OpenAI API Key is not configured on the backend server. Please contact the administrator or switch to BYOK Mode in settings." 
            });
        }
        
        const systemPrompt = `You are an expert commercial real estate due-diligence legal auditor.
Your job is to read the raw text of a commercial ${docType} contract and extract key terms with 100% precision.
You must output a JSON object containing the exact fields and the verbatim quote proving the value.

Return JSON in this EXACT structure:
{
  "tenantName": { "value": "Extracted string or 'Not Mentioned'", "quote": "Verbatim quote from text showing this" },
  "premisesSf": { "value": "Extracted string (e.g. 5,000 SF) or 'Not Mentioned'", "quote": "Verbatim quote showing this" },
  "monthlyRent": { "value": "Extracted string (e.g. $10,000) or 'Not Mentioned'", "quote": "Verbatim quote showing this" },
  "expiryDate": { "value": "Extracted date or 'Not Mentioned'", "quote": "Verbatim quote showing this" },
  "securityDeposit": { "value": "Extracted string or 'Not Mentioned'", "quote": "Verbatim quote showing this" },
  "renewalOptions": { "value": "Extracted renewal options terms or 'Not Mentioned'", "quote": "Verbatim quote showing this" },
  "camShare": { "value": "Extracted CAM share and cost caps or 'Not Mentioned'", "quote": "Verbatim quote showing this" }
}`;

        const userPrompt = `Here is the raw text extracted from the commercial ${docType} document:
======================================================================
${text}
======================================================================
Please extract the required fields and return the JSON.`;

        const targetModel = model || "gpt-4o-mini";
        
        console.log(`[Audit Request] Processing ${docType} using model ${targetModel}...`);

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: targetModel,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                response_format: { type: "json_object" },
                temperature: 0.1
            })
        });

        if (!response.ok) {
            const errorDetails = await response.json().catch(() => ({}));
            const errMsg = errorDetails.error?.message || `OpenAI returned status ${response.status}`;
            console.error(`[OpenAI Error] ${errMsg}`);
            return res.status(response.status).json({ error: errMsg });
        }

        const data = await response.json();
        const extractedData = JSON.parse(data.choices[0].message.content);
        
        console.log(`[Audit Success] Extraction complete for ${docType}.`);
        res.json(extractedData);

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
