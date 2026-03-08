/**
 * ═══════════════════════════════════════════════════════════════
 *  STRATOS GHOST — Popup Controller
 *  Handles user input, starts/stops the autonomous loop,
 *  and displays real-time telemetry from the background script.
 * ═══════════════════════════════════════════════════════════════
 */

// ──── DOM Elements ──────────────────────────────────────────────
const goalInput = document.getElementById('goalInput');
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const logContainer = document.getElementById('logContainer');
const statusIndicator = document.getElementById('statusIndicator');
const connectionBar = document.getElementById('connectionBar');
const serverUrlInput = document.getElementById('serverUrl');
const maxStepsInput = document.getElementById('maxSteps');
const stepCount = document.getElementById('stepCount');
const btnClearLog = document.getElementById('btnClearLog');

let isRunning = false;
let currentStepCount = 0;

// ──── Initialization ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    console.log('👻 [POPUP] Stratos Ghost popup initialized');

    // Load saved settings
    const stored = await chrome.storage.local.get(['serverUrl', 'maxSteps', 'lastGoal']);
    if (stored.serverUrl) serverUrlInput.value = stored.serverUrl;
    if (stored.maxSteps) maxStepsInput.value = stored.maxSteps;
    if (stored.lastGoal) goalInput.value = stored.lastGoal;

    // Check Brain connection
    checkBrainConnection();

    // Check if already running
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    if (state && state.isRunning) {
        setRunningState(true);
        currentStepCount = state.stepCount || 0;
        updateStepDisplay();
    }
});

// ──── Brain Connection Check ────────────────────────────────────
async function checkBrainConnection() {
    const connText = connectionBar.querySelector('.conn-text');
    try {
        const url = serverUrlInput.value.trim();
        const resp = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(3000) });
        const data = await resp.json();
        if (data.status === 'ok') {
            connectionBar.className = 'connection-bar connected';
            connText.textContent = `Brain online • ${data.engine}`;
            addLog('Brain connection established', 'success');
        } else {
            throw new Error('Bad response');
        }
    } catch (err) {
        connectionBar.className = 'connection-bar disconnected';
        connText.textContent = 'Brain offline — start the server first';
        addLog('Brain connection failed — is the server running?', 'error');
    }
}

// ──── Start Mission ─────────────────────────────────────────────
btnStart.addEventListener('click', async () => {
    const goal = goalInput.value.trim();
    if (!goal) {
        addLog('No objective specified. Enter a mission goal.', 'error');
        goalInput.focus();
        return;
    }

    const serverUrl = serverUrlInput.value.trim();
    const maxSteps = parseInt(maxStepsInput.value) || 25;

    // Save settings
    await chrome.storage.local.set({ serverUrl, maxSteps, lastGoal: goal });

    console.log(`🚀 [POPUP] Deploying Ghost — Goal: "${goal}"`);
    addLog(`Mission deployed: "${goal}"`, 'action');

    currentStepCount = 0;
    updateStepDisplay();
    setRunningState(true);

    // Send to background script
    chrome.runtime.sendMessage({
        type: 'START_MISSION',
        payload: { goal, serverUrl, maxSteps }
    });
});

// ──── Stop Mission ──────────────────────────────────────────────
btnStop.addEventListener('click', () => {
    console.log('🛑 [POPUP] Aborting mission');
    addLog('Mission ABORTED by operator', 'error');
    setRunningState(false);

    chrome.runtime.sendMessage({ type: 'STOP_MISSION' });
});

// ──── Clear Log ─────────────────────────────────────────────────
btnClearLog.addEventListener('click', () => {
    logContainer.innerHTML = '';
    addLog('Log cleared', 'system');
});

// ──── Listen for Background Messages ────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log('📨 [POPUP] Received message:', msg.type, msg);

    switch (msg.type) {
        case 'LOG':
            addLog(msg.payload.message, msg.payload.level || 'system');
            break;

        case 'STEP_UPDATE':
            currentStepCount = msg.payload.step;
            updateStepDisplay();
            if (msg.payload.action) {
                let detail = `Step ${msg.payload.step}: ${msg.payload.action}`;
                if (msg.payload.tagNumber !== null && msg.payload.tagNumber !== undefined) {
                    detail += ` → tag #${msg.payload.tagNumber}`;
                }
                if (msg.payload.value) detail += ` → "${msg.payload.value}"`;
                addLog(detail, 'action');
            }
            if (msg.payload.reasoning) {
                addLog(`🧠 ${msg.payload.reasoning}`, 'brain');
            }
            break;

        case 'MISSION_COMPLETE':
            addLog('✅ Mission COMPLETE!', 'success');
            if (msg.payload?.extractedData) {
                addLog(`📦 Data: ${JSON.stringify(msg.payload.extractedData)}`, 'success');
            }
            setRunningState(false);
            setStatus('COMPLETE', 'complete');
            break;

        case 'MISSION_ERROR':
            addLog(`🔥 Error: ${msg.payload.error}`, 'error');
            setRunningState(false);
            setStatus('ERROR', 'error');
            break;

        case 'MISSION_STOPPED':
            setRunningState(false);
            setStatus('IDLE', '');
            break;
    }
});

// ──── UI Helpers ────────────────────────────────────────────────
function setRunningState(running) {
    isRunning = running;
    btnStart.disabled = running;
    btnStop.disabled = !running;
    goalInput.disabled = running;

    if (running) {
        setStatus('RUNNING', 'active');
    } else {
        setStatus('IDLE', '');
    }
}

function setStatus(text, className) {
    const statusText = statusIndicator.querySelector('.status-text');
    statusText.textContent = text;
    statusIndicator.className = 'status-indicator' + (className ? ` ${className}` : '');
}

function updateStepDisplay() {
    const max = parseInt(maxStepsInput.value) || 25;
    stepCount.textContent = `${currentStepCount} / ${max}`;
}

function addLog(message, level = 'system') {
    const now = new Date();
    const ts = now.toLocaleTimeString('en-US', { hour12: false });

    const entry = document.createElement('div');
    entry.className = `log-entry log-${level}`;
    entry.innerHTML = `<span class="log-ts">${ts}</span><span class="log-msg">${escapeHtml(message)}</span>`;

    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;

    // Keep log at a reasonable size
    while (logContainer.children.length > 200) {
        logContainer.removeChild(logContainer.firstChild);
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ──── Settings auto-reconnect on URL change ─────────────────────
serverUrlInput.addEventListener('change', () => {
    checkBrainConnection();
});
