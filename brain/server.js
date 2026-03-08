/**
 * ═══════════════════════════════════════════════════════════════
 *  STRATOS GHOST — THE BRAIN
 *  AI Decision Engine powered by Gemini 2.5 Flash
 * ═══════════════════════════════════════════════════════════════
 *  Receives annotated screenshots from the Operator (Chrome Ext),
 *  sends them to Gemini for vision-based UI reasoning, and returns
 *  a strict JSON action directive.
 * ═══════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

// ──── Config ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';

if (!GEMINI_API_KEY) {
    console.error('❌ [BRAIN] FATAL: GEMINI_API_KEY is not set in .env');
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const app = express();

// ──── Middleware ─────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ──── System Prompt ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are STRATOS GHOST, an autonomous UI navigator. You see a screenshot with yellow numbered tags on interactive elements.

Decide the SINGLE next action toward the user's goal.

RULES:
1. ONLY interact with yellow-tagged elements.
2. ONE action per turn.
3. If the UI is animating, loading, or elements are not yet visible, return action "WAIT".
4. If the goal is done, use COMPLETE and extract requested data.
5. To type: CLICK the input first, then TYPE next turn.
6. To see content below, use SCROLL.
7. Keep "reasoning" strictly under 20 words to save tokens.

Respond with ONLY this JSON (no markdown, no fences):
{"action":"CLICK|TYPE|SCROLL|WAIT|COMPLETE","tagNumber":number|null,"value":string|null,"reasoning":string,"extractedData":object|null}

ACTIONS:
- CLICK: click tagNumber element.
- TYPE: type value into tagNumber element (must be focused first).
- SCROLL: value="up" or "down", tagNumber=null.
- WAIT: page loading, tagNumber=null, value=null.
- COMPLETE: goal done, extractedData has results, tagNumber=null, value=null.

RAW JSON ONLY.`;

// ──── Health Check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    console.log('💚 [BRAIN] Health check pinged');
    res.json({ status: 'ok', engine: 'Gemini 2.5 Flash', timestamp: new Date().toISOString() });
});

// ──── Core Analyze Endpoint ─────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
    const startTime = Date.now();
    console.log('\n══════════════════════════════════════════════════════');
    console.log('🧠 [BRAIN] Incoming analysis request');

    try {
        const { screenshot, goal, actionHistory = [], currentUrl = '' } = req.body;

        if (!screenshot || !goal) {
            console.error('❌ [BRAIN] Missing required fields: screenshot and/or goal');
            return res.status(400).json({ error: 'Missing required fields: screenshot, goal' });
        }

        console.log(`🎯 [BRAIN] Goal: "${goal}"`);
        console.log(`🌐 [BRAIN] Current URL: ${currentUrl}`);
        console.log(`📜 [BRAIN] Action history length: ${actionHistory.length}`);
        console.log(`📸 [BRAIN] Screenshot size: ${(screenshot.length / 1024).toFixed(1)} KB`);

        // Build the action history context
        let historyContext = '';
        if (actionHistory.length > 0) {
            historyContext = '\n\nACTION HISTORY (what has already been done):\n';
            actionHistory.forEach((entry, i) => {
                historyContext += `${i + 1}. ${entry.action}`;
                if (entry.tagNumber !== null && entry.tagNumber !== undefined) historyContext += ` tag #${entry.tagNumber}`;
                if (entry.value) historyContext += ` value="${entry.value}"`;
                historyContext += ` — ${entry.reasoning}\n`;
            });
        }

        const userMessage = `GOAL: ${goal}\nCURRENT URL: ${currentUrl}${historyContext}\n\nAnalyze the screenshot and decide the next action.`;

        console.log('📤 [BRAIN] Sending to Gemini 2.5 Flash...');

        // Strip data URI prefix if present
        const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: SYSTEM_PROMPT + '\n\n' + userMessage },
                        {
                            inlineData: {
                                mimeType: 'image/png',
                                data: base64Data
                            }
                        }
                    ]
                }
            ],
            config: {
                temperature: 0.1,
                maxOutputTokens: 1024, // Hard cap — prevents JSON truncation
            }
        });

        // Safely extract response text — response.text can be undefined
        // if Gemini returns no candidates (safety block, timeout, empty response)
        let rawText;
        try {
            rawText = response.text;
        } catch (e) {
            // .text getter can throw if candidates are empty
            console.warn('⚠️  [BRAIN] response.text threw:', e.message);
        }

        if (!rawText && response.candidates && response.candidates.length > 0) {
            const parts = response.candidates[0]?.content?.parts;
            if (parts && parts.length > 0) {
                rawText = parts[0].text;
            }
        }

        if (!rawText) {
            console.error('❌ [BRAIN] Gemini returned empty/blocked response');
            console.error('❌ [BRAIN] Full response:', JSON.stringify(response).substring(0, 500));
            // Return a safe WAIT action so the loop doesn't crash
            return res.json({
                decision: { action: 'WAIT', tagNumber: null, value: null, reasoning: 'Gemini returned empty response, retrying', extractedData: null },
                processingTime: Date.now() - startTime
            });
        }

        rawText = rawText.trim();
        console.log('📥 [BRAIN] Raw Gemini response:', rawText);

        // Parse the JSON — strip markdown fences and rescue truncated JSON
        let cleanedText = rawText;
        if (cleanedText.startsWith('```')) {
            cleanedText = cleanedText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
        }

        let decision;
        try {
            decision = JSON.parse(cleanedText);
        } catch (parseErr) {
            console.warn('⚠️  [BRAIN] Initial JSON parse failed, attempting rescue...');

            // Rescue strategy: try closing truncated JSON
            let rescued = cleanedText.trim();
            // Strip trailing incomplete string values
            rescued = rescued.replace(/,\s*"[^"]*$/s, '');
            // Count unclosed braces and close them
            const openBraces = (rescued.match(/{/g) || []).length;
            const closeBraces = (rescued.match(/}/g) || []).length;
            for (let i = 0; i < openBraces - closeBraces; i++) {
                rescued += '}';
            }
            try {
                decision = JSON.parse(rescued);
                console.log('🩹 [BRAIN] JSON rescue successful');
            } catch (rescueErr) {
                console.error('❌ [BRAIN] JSON rescue also failed:', rescueErr.message);
                console.error('❌ [BRAIN] Raw text was:', rawText);
                return res.status(500).json({
                    error: 'Gemini returned invalid JSON',
                    rawResponse: rawText
                });
            }
        }

        // Validate schema
        const validActions = ['CLICK', 'TYPE', 'SCROLL', 'WAIT', 'COMPLETE'];
        if (!decision.action || !validActions.includes(decision.action)) {
            console.error('❌ [BRAIN] Invalid action:', decision.action);
            return res.status(500).json({ error: `Invalid action: ${decision.action}` });
        }

        const elapsed = Date.now() - startTime;
        console.log('══════════════════════════════════════════════════════');
        console.log(`✅ [BRAIN] Decision: ${decision.action}${decision.tagNumber !== null ? ` → tag #${decision.tagNumber}` : ''}${decision.value ? ` → "${decision.value}"` : ''}`);
        console.log(`💬 [BRAIN] Reasoning: ${decision.reasoning}`);
        console.log(`⏱️  [BRAIN] Total processing time: ${elapsed}ms`);
        console.log('══════════════════════════════════════════════════════\n');

        res.json({ decision, processingTime: elapsed });

    } catch (err) {
        console.error('🔥 [BRAIN] Unhandled error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

// ──── Webhook Relay (called by extension on COMPLETE) ───────────
app.post('/api/webhook', async (req, res) => {
    console.log('🪝 [BRAIN] Webhook relay triggered');
    const { data, goal } = req.body;

    if (!WEBHOOK_URL) {
        console.warn('⚠️  [BRAIN] No WEBHOOK_URL configured — skipping relay');
        return res.json({ relayed: false, reason: 'No webhook URL configured' });
    }

    try {
        console.log(`📡 [BRAIN] Relaying data to Make.com: ${WEBHOOK_URL}`);
        const webhookRes = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goal, data, timestamp: new Date().toISOString(), source: 'stratos-ghost' })
        });

        const status = webhookRes.status;
        console.log(`✅ [BRAIN] Webhook response status: ${status}`);
        res.json({ relayed: true, webhookStatus: status });

    } catch (err) {
        console.error('❌ [BRAIN] Webhook relay failed:', err.message);
        res.status(500).json({ relayed: false, error: err.message });
    }
});

// ──── Start Server ──────────────────────────────────────────────
app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║        STRATOS GHOST — THE BRAIN                ║');
    console.log('║        AI Decision Engine Online                 ║');
    console.log(`║        Port: ${PORT}                               ║`);
    console.log('║        Engine: Gemini 2.5 Flash                  ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
    console.log(`🧠 [BRAIN] Server listening on http://localhost:${PORT}`);
    console.log(`🪝 [BRAIN] Webhook URL: ${WEBHOOK_URL || '(not configured)'}`);
    console.log('');
});
