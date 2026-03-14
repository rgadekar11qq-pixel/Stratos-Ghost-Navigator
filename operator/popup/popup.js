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
const btnMic = document.getElementById('btnMic');
const thinkingOrb = document.getElementById('thinkingOrb');

let isRunning = false;
let currentStepCount = 0;
let activeTypewriter = null;

// ──── Thinking Orb Helpers ──────────────────────────────────────
function showThinkingOrb() {
    if (thinkingOrb) thinkingOrb.classList.add('active');
}

function hideThinkingOrb() {
    if (thinkingOrb) thinkingOrb.classList.remove('active');
}

// ──── Typewriter Effect ─────────────────────────────────────────
function typewriterEffect(text, element, speed = 15) {
    // Cancel any in-progress typewriter
    if (activeTypewriter) {
        activeTypewriter.cancel();
        activeTypewriter = null;
    }

    let index = 0;
    let cancelled = false;
    element.textContent = '';

    const handle = {
        cancel() {
            cancelled = true;
            element.textContent = text; // snap to final state
        }
    };
    activeTypewriter = handle;

    return new Promise((resolve) => {
        function tick() {
            if (cancelled || index >= text.length) {
                if (!cancelled) element.textContent = text;
                if (activeTypewriter === handle) activeTypewriter = null;
                resolve();
                return;
            }
            element.textContent += text[index];
            index++;
            // Auto-scroll the log container
            logContainer.scrollTop = logContainer.scrollHeight;
            setTimeout(tick, speed);
        }
        requestAnimationFrame(tick);
    });
}

// ──── Speech Recognition (The Ears) ─────────────────────────────
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-IN';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        console.log('🎙️ [POPUP] Listening...');
        isListening = true;
        btnMic.classList.add('listening');
        addLog('🎙️ Listening... speak your command', 'action');
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log(`🎙️ [POPUP] Transcript: "${transcript}"`);
        goalInput.value = transcript;
        addLog(`🎙️ Heard: "${transcript}" — review and click Deploy`, 'success');
        // Do NOT auto-deploy — let the user review the transcription first
        goalInput.focus();
    };

    recognition.onerror = (event) => {
        console.error('🎙️ [POPUP] Recognition error:', event.error);
        if (event.error !== 'aborted') {
            addLog(`🎙️ Mic error: ${event.error}`, 'error');
        }
    };

    recognition.onend = () => {
        console.log('🎙️ [POPUP] Recognition ended');
        isListening = false;
        btnMic.classList.remove('listening');
    };
} else {
    console.warn('🎙️ [POPUP] SpeechRecognition not supported');
    btnMic.title = 'Speech recognition not supported in this browser';
    btnMic.style.opacity = '0.3';
    btnMic.style.cursor = 'not-allowed';
}

// Mic button click handler
btnMic.addEventListener('click', () => {
    if (!recognition) return;

    if (isListening) {
        recognition.abort();
    } else {
        recognition.start();
    }
});

// ──── Speech Synthesis — Moved to content.js Cinematic HUD ──────
// TTS now runs from the webpage's DOM so closing the popup
// doesn't kill the audio. speak() is a no-op stub here.
function speak() { }

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
    showThinkingOrb();

    // Send to background script
    chrome.runtime.sendMessage({
        type: 'START_MISSION',
        payload: { goal, serverUrl, maxSteps }
    });

    // ── Cinematic Mode: Deploy HUD on page, then hide popup ──
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        chrome.tabs.sendMessage(tab.id, {
            type: 'SHOW_HUD',
            payload: { goal, maxSteps }
        });
    }
    window.close();
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
            hideThinkingOrb();
            currentStepCount = msg.payload.step;
            updateStepDisplay();
            if (msg.payload.action) {
                let detail = `Step ${msg.payload.step}: ${msg.payload.action}`;
                // Build semantic narration — NEVER read raw tag IDs aloud
                const elName = msg.payload.elementName || 'the target element';
                let narration = '';
                const act = msg.payload.action;
                if (act === 'CLICK') {
                    narration = `Clicking ${elName}`;
                } else if (act === 'TYPE') {
                    narration = `Typing into ${elName}`;
                    if (msg.payload.value) narration += `, ${msg.payload.value}`;
                } else if (act === 'SCROLL') {
                    narration = `Scrolling ${msg.payload.value || 'down'}`;
                } else if (act === 'WAIT') {
                    narration = 'Waiting for the page to load';
                } else if (act === 'COMPLETE') {
                    narration = 'Mission complete';
                } else {
                    narration = `Executing ${act.toLowerCase()}`;
                }
                // Visual log keeps tag ID for debugging (never spoken)
                if (msg.payload.tagNumber !== null && msg.payload.tagNumber !== undefined) {
                    detail += ` → tag #${msg.payload.tagNumber}`;
                }
                if (msg.payload.elementName) {
                    detail += ` (${msg.payload.elementName})`;
                }
                if (msg.payload.value) {
                    detail += ` → "${msg.payload.value}"`;
                }
                addLog(detail, 'action');
                speak(narration);
                // Re-show orb for next Brain consultation
                showThinkingOrb();
            }
            if (msg.payload.reasoning) {
                // Typewriter effect: print character-by-character
                const reasoningText = `🧠 ${msg.payload.reasoning}`;
                const entry = document.createElement('div');
                entry.className = 'log-entry log-brain';
                const now = new Date();
                const ts = now.toLocaleTimeString('en-US', { hour12: false });
                const tsSpan = document.createElement('span');
                tsSpan.className = 'log-ts';
                tsSpan.textContent = ts;
                const msgSpan = document.createElement('span');
                msgSpan.className = 'log-msg';
                entry.appendChild(tsSpan);
                entry.appendChild(msgSpan);
                logContainer.appendChild(entry);
                logContainer.scrollTop = logContainer.scrollHeight;
                typewriterEffect(reasoningText, msgSpan);
            }
            break;

        case 'MISSION_COMPLETE':
            hideThinkingOrb();
            addLog('✅ Mission COMPLETE!', 'success');
            if (msg.payload?.extractedData) {
                addLog(`📦 Data: ${JSON.stringify(msg.payload.extractedData)}`, 'success');
            }
            setRunningState(false);
            setStatus('COMPLETE', 'complete');
            speak('Mission complete.');
            break;

        case 'MISSION_ERROR':
            hideThinkingOrb();
            addLog(`🔥 Error: ${msg.payload.error}`, 'error');
            setRunningState(false);
            setStatus('ERROR', 'error');
            speak('Mission error.');
            break;

        case 'MISSION_STOPPED':
            hideThinkingOrb();
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
