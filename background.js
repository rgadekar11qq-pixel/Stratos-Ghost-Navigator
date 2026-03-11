/**
 * ═══════════════════════════════════════════════════════════════
 *  STRATOS GHOST — Background Service Worker (Orchestrator)
 *  Manages the autonomous loop:
 *    Signal content script → Capture screenshot → Send to Brain →
 *    Dispatch action → Repeat until COMPLETE
 * ═══════════════════════════════════════════════════════════════
 */

// ──── State ─────────────────────────────────────────────────────
let missionState = {
    isRunning: false,
    goal: '',
    serverUrl: 'https://stratos-ghost-navigator-222549729420.europe-west1.run.app',
    maxSteps: 25,
    stepCount: 0,
    actionHistory: [],
    tabId: null,
};

// ──── Message Router ────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log(`📨 [BG] Received: ${msg.type}`, msg);

    switch (msg.type) {
        case 'START_MISSION':
            handleStartMission(msg.payload);
            sendResponse({ ok: true });
            break;

        case 'STOP_MISSION':
            handleStopMission();
            sendResponse({ ok: true });
            break;

        case 'GET_STATUS':
            sendResponse({
                isRunning: missionState.isRunning,
                stepCount: missionState.stepCount,
                goal: missionState.goal,
            });
            break;

        case 'SOM_READY':
            // Content script has drawn SoM tags and is ready for screenshot
            console.log('🏷️  [BG] SoM tags drawn, capturing screenshot...');
            handleSoMReady(sender.tab.id);
            break;

        case 'ACTION_EXECUTED':
            // Content script finished executing an action
            console.log('✅ [BG] Action executed, waiting for DOM to settle...');
            handleActionExecuted();
            break;

        default:
            break;
    }

    return true; // Keep message channel open for async
});

// ──── Start Mission ─────────────────────────────────────────────
async function handleStartMission(payload) {
    console.log('\n🚀 ══════════════════════════════════════════════════');
    console.log('🚀 [BG] MISSION START');
    console.log(`🎯 [BG] Goal: "${payload.goal}"`);
    console.log(`🌐 [BG] Brain: ${payload.serverUrl}`);
    console.log(`📊 [BG] Max Steps: ${payload.maxSteps}`);
    console.log('🚀 ══════════════════════════════════════════════════\n');

    missionState = {
        isRunning: true,
        goal: payload.goal,
        serverUrl: payload.serverUrl,
        maxSteps: payload.maxSteps,
        stepCount: 0,
        actionHistory: [],
        tabId: null,
    };

    // Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        broadcastLog('No active tab found!', 'error');
        handleStopMission();
        return;
    }

    missionState.tabId = tab.id;
    console.log(`🗂️  [BG] Target tab: ${tab.id} — ${tab.url}`);
    broadcastLog(`Target acquired: ${tab.url}`, 'system');

    // Begin the autonomous loop
    startLoopCycle();
}

// ──── Stop Mission ──────────────────────────────────────────────
function handleStopMission() {
    console.log('🛑 [BG] MISSION STOPPED');
    missionState.isRunning = false;
    broadcastToPopup({ type: 'MISSION_STOPPED' });
    
    // Hide HUD on stop
    if (missionState.tabId) {
        chrome.tabs.sendMessage(missionState.tabId, { type: 'HUD_UPDATE', state: 'HIDDEN' }).catch(() => {});
    }
}

// ──── Autonomous Loop: Step 1 — Draw SoM Tags ──────────────────
function startLoopCycle() {
    if (!missionState.isRunning) {
        console.log('⏸️  [BG] Mission not running, halting cycle');
        return;
    }

    if (missionState.stepCount >= missionState.maxSteps) {
        console.log('🔴 [BG] Max steps reached, aborting mission');
        broadcastLog(`Max steps (${missionState.maxSteps}) reached — mission auto-aborted`, 'error');
        broadcastToPopup({ type: 'MISSION_ERROR', payload: { error: 'Maximum steps reached' } });
        
        // Hide HUD
        chrome.tabs.sendMessage(missionState.tabId, { type: 'HUD_UPDATE', state: 'HIDDEN' }).catch(() => {});
        
        missionState.isRunning = false;
        relayFailure('Max steps reached. Agent aborted.');
        return;
    }

    console.log(`\n🔄 [BG] ── Loop Cycle ${missionState.stepCount + 1} ──────────────────────`);
    broadcastLog(`Cycle ${missionState.stepCount + 1}: Drawing SoM tags...`, 'system');

    // Tell content script to draw SoM tags
    chrome.tabs.sendMessage(missionState.tabId, { type: 'DRAW_SOM_TAGS' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('❌ [BG] Failed to message content script:', chrome.runtime.lastError.message);
            broadcastLog('Failed to communicate with page — try refreshing', 'error');
            broadcastToPopup({ type: 'MISSION_ERROR', payload: { error: 'Content script not responding' } });
            missionState.isRunning = false;
        }
    });
}

// ──── Autonomous Loop: Step 2 — Capture Screenshot ──────────────
async function handleSoMReady(tabId) {
    if (!missionState.isRunning) return;

    try {
        // Small delay to ensure tags are rendered
        await sleep(300);

        console.log('📸 [BG] Capturing screenshot with SoM tags visible...');
        const screenshotDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        const originalSizeKB = (screenshotDataUrl.length / 1024).toFixed(1);
        console.log(`📸 [BG] Original screenshot: ${originalSizeKB} KB`);

        // Tell content script to hide SoM tags immediately
        chrome.tabs.sendMessage(missionState.tabId, { type: 'HIDE_SOM_TAGS' });
        console.log('🏷️  [BG] SoM tags hidden');

        // ── Compress & downscale before sending to Brain ──
        const compressedDataUrl = await compressScreenshot(screenshotDataUrl, 1024, 0.5);
        const compressedSizeKB = (compressedDataUrl.length / 1024).toFixed(1);
        const savings = (100 - (compressedDataUrl.length / screenshotDataUrl.length) * 100).toFixed(0);
        console.log(`🗜️  [BG] Compressed screenshot: ${compressedSizeKB} KB (${savings}% reduction)`);
        broadcastLog(`Screenshot compressed: ${originalSizeKB} KB → ${compressedSizeKB} KB (−${savings}%)`, 'system');

        // Get the current URL
        const tab = await chrome.tabs.get(missionState.tabId);
        const currentUrl = tab.url;

        // Send HUD thinking state
        chrome.tabs.sendMessage(missionState.tabId, { type: 'HUD_UPDATE', state: 'THINKING' });

        // Send compressed version to Brain for analysis
        await sendToBrain(compressedDataUrl, currentUrl);

    } catch (err) {
        console.error('🔥 [BG] Screenshot/analysis error:', err);
        broadcastLog(`Error: ${err.message}`, 'error');
        broadcastToPopup({ type: 'MISSION_ERROR', payload: { error: err.message } });
        
        // Hide HUD on error
        chrome.tabs.sendMessage(missionState.tabId, { type: 'HUD_UPDATE', state: 'HIDDEN' }).catch(() => {});
        
        missionState.isRunning = false;
        relayFailure(err.message);
    }
}

// ──── Screenshot Compression (OffscreenCanvas) ──────────────────
/**
 * Downscales a Data URL image to maxWidth (maintaining aspect ratio)
 * and re-encodes as JPEG at the given quality (0–1).
 * Uses OffscreenCanvas + createImageBitmap (available in Service Workers).
 */
async function compressScreenshot(dataUrl, maxWidth = 1024, quality = 0.5) {
    // Decode the base64 Data URL into raw bytes
    const base64 = dataUrl.split(',')[1];
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'image/png' });

    // Decode into ImageBitmap (works in Service Workers)
    const bitmap = await createImageBitmap(blob);
    let { width, height } = bitmap;

    // Downscale if wider than maxWidth, maintaining aspect ratio
    if (width > maxWidth) {
        const scale = maxWidth / width;
        width = maxWidth;
        height = Math.round(height * scale);
    }

    // Draw onto an OffscreenCanvas at the target size
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // Encode as JPEG at the requested quality
    const jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality });

    // Convert back to a Data URL for the existing pipeline
    const buffer = await jpegBlob.arrayBuffer();
    const jpegBytes = new Uint8Array(buffer);
    let binaryOut = '';
    for (let i = 0; i < jpegBytes.length; i++) {
        binaryOut += String.fromCharCode(jpegBytes[i]);
    }
    return 'data:image/jpeg;base64,' + btoa(binaryOut);
}

// ──── Autonomous Loop: Step 3 — Consult the Brain ───────────────
async function sendToBrain(screenshotDataUrl, currentUrl) {
    if (!missionState.isRunning) return;

    console.log('🧠 [BG] Sending to Brain for analysis...');
    broadcastLog('Consulting the Brain...', 'brain');

    try {
        const response = await fetch(`${missionState.serverUrl}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                screenshot: screenshotDataUrl,
                goal: missionState.goal,
                actionHistory: missionState.actionHistory,
                currentUrl: currentUrl,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Brain returned ${response.status}: ${errorBody}`);
        }

        const result = await response.json();
        const decision = result.decision;

        console.log('🧠 [BG] Brain decision:', JSON.stringify(decision, null, 2));
        console.log(`⏱️  [BG] Brain processing time: ${result.processingTime}ms`);

        // Process the decision
        await processDecision(decision);

    } catch (err) {
        console.error('🔥 [BG] Brain communication error:', err);
        broadcastLog(`Brain error: ${err.message}`, 'error');
        broadcastToPopup({ type: 'MISSION_ERROR', payload: { error: err.message } });
        
        // Hide HUD on error
        chrome.tabs.sendMessage(missionState.tabId, { type: 'HUD_UPDATE', state: 'HIDDEN' }).catch(() => {});
        
        missionState.isRunning = false;
        relayFailure(err.message);
    }
}

// ──── Autonomous Loop: Step 4 — Process Decision ────────────────
async function processDecision(decision) {
    if (!missionState.isRunning) return;

    missionState.stepCount++;

    // Send HUD action state immediately (so typewriter starts while execution is pending)
    if (decision.reasoning) {
        chrome.tabs.sendMessage(missionState.tabId, { 
            type: 'HUD_UPDATE', 
            state: 'ACTION', 
            text: decision.reasoning 
        });
        chrome.tabs.sendMessage(missionState.tabId, { 
            type: 'SPEAK', 
            text: decision.reasoning 
        }).catch(() => {});
    }

    // Record in action history
    missionState.actionHistory.push({
        action: decision.action,
        tagNumber: decision.tagNumber,
        value: decision.value,
        reasoning: decision.reasoning,
        elementName: decision.elementName || null,
    });

    // Update popup
    broadcastToPopup({
        type: 'STEP_UPDATE',
        payload: {
            step: missionState.stepCount,
            action: decision.action,
            tagNumber: decision.tagNumber,
            value: decision.value,
            reasoning: decision.reasoning,
            elementName: decision.elementName || null,
        },
    });

    switch (decision.action) {
        case 'CLICK':
            console.log(`🖱️  [BG] Dispatching CLICK on tag #${decision.tagNumber}`);
            broadcastLog(`Clicking tag #${decision.tagNumber}`, 'action');
            chrome.tabs.sendMessage(missionState.tabId, {
                type: 'EXECUTE_ACTION',
                payload: { action: 'CLICK', tagNumber: decision.tagNumber },
            });
            break;

        case 'TYPE':
            console.log(`⌨️  [BG] Dispatching TYPE "${decision.value}" on tag #${decision.tagNumber}`);
            broadcastLog(`Typing "${decision.value}" into tag #${decision.tagNumber}`, 'action');
            chrome.tabs.sendMessage(missionState.tabId, {
                type: 'EXECUTE_ACTION',
                payload: { action: 'TYPE', tagNumber: decision.tagNumber, value: decision.value },
            });
            break;

        case 'SCROLL':
            console.log(`📜 [BG] Dispatching SCROLL ${decision.value}`);
            broadcastLog(`Scrolling ${decision.value}`, 'action');
            chrome.tabs.sendMessage(missionState.tabId, {
                type: 'EXECUTE_ACTION',
                payload: { action: 'SCROLL', value: decision.value },
            });
            break;

        case 'WAIT':
            console.log('⏳ [BG] WAIT action — pausing before next cycle');
            broadcastLog('Waiting for page to settle...', 'system');
            await sleep(2000);
            startLoopCycle();
            break;

        case 'COMPLETE':
            console.log('🏁 [BG] MISSION COMPLETE!');
            console.log('📦 [BG] Extracted data:', JSON.stringify(decision.extractedData));
            broadcastLog('Mission COMPLETE!', 'success');
            
            // Hide HUD on complete
            chrome.tabs.sendMessage(missionState.tabId, { type: 'HUD_UPDATE', state: 'HIDDEN' }).catch(() => {});
            
            
            // Announce completion
            chrome.tabs.sendMessage(missionState.tabId, { type: 'SPEAK', text: 'Mission complete.' }).catch(() => {});
            
            missionState.isRunning = false;

            broadcastToPopup({
                type: 'MISSION_COMPLETE',
                payload: { extractedData: decision.extractedData },
            });

            // Relay to Make.com webhook if configured
            if (decision.extractedData) {
                relayToWebhook({ extractedData: decision.extractedData });
            }
            break;

        default:
            console.error(`❌ [BG] Unknown action: ${decision.action}`);
            broadcastLog(`Unknown action: ${decision.action}`, 'error');
            break;
    }
}

// ──── Autonomous Loop: Step 5 — Action Executed, Continue ───────
function handleActionExecuted() {
    if (!missionState.isRunning) return;

    console.log('🔄 [BG] DOM settled after action. Starting next cycle...');
    broadcastLog('DOM settled. Starting next cycle...', 'system');

    // Small delay before next cycle to let animations/transitions complete
    setTimeout(() => {
        startLoopCycle();
    }, 800);
}

// ──── Dead Man's Switch — Failure Telemetry ─────────────────────
async function relayFailure(errorMessage) {
    try {
        console.log('💀 [BG] Dead Man\'s Switch triggered — relaying failure...');
        broadcastLog('Relaying failure notification to webhook...', 'error');

        await fetch(`${missionState.serverUrl}/api/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: {
                    status: 'FAILED',
                    command: missionState.goal,
                    error: errorMessage || 'Unknown fatal error. Agent aborted.',
                    stepsCompleted: missionState.stepCount,
                    maxSteps: missionState.maxSteps,
                    timestamp: new Date().toISOString(),
                },
                goal: missionState.goal,
            }),
        });

        console.log('💀 [BG] Failure notification relayed');
        broadcastLog('Failure notification sent to webhook', 'system');
    } catch (relayErr) {
        console.error('❌ [BG] Failed to relay failure notification:', relayErr.message);
    }
}

// ──── Webhook Relay (Success) ───────────────────────────────────
async function relayToWebhook(data) {
    try {
        console.log('🪝 [BG] Relaying extracted data to webhook...');
        broadcastLog('Relaying data to webhook...', 'system');

        const response = await fetch(`${missionState.serverUrl}/api/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goal: missionState.goal, extractedText: String(data.extractedData) }),
        });

        const result = await response.json();
        console.log('🪝 [BG] Webhook relay result:', result);

        if (result.relayed) {
            broadcastLog('Data successfully relayed to webhook', 'success');
        } else {
            broadcastLog(`Webhook skipped: ${result.reason || 'unknown'}`, 'system');
        }
    } catch (err) {
        console.error('❌ [BG] Webhook relay failed:', err);
        broadcastLog(`Webhook relay failed: ${err.message}`, 'error');
    }
}

// ──── Communication Helpers ─────────────────────────────────────
function broadcastLog(message, level = 'system') {
    broadcastToPopup({ type: 'LOG', payload: { message, level } });
}

function broadcastToPopup(msg) {
    chrome.runtime.sendMessage(msg).catch(() => {
        // Popup might be closed — that's fine
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('👻 [BG] Stratos Ghost background service worker loaded');
