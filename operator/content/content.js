/**
 * ═══════════════════════════════════════════════════════════════
 *  STRATOS GHOST — Content Script
 *  The Eyes & Hands of the AI
 *
 *  - Set-of-Mark (SoM): Tags every interactive element with
 *    numbered yellow bounding boxes
 *  - Click Simulation: Full native event chain + visual radar ping
 *  - Type Simulation: React/Vue-compatible input injection
 *  - DOM Settle Detection: MutationObserver-based wait
 * ═══════════════════════════════════════════════════════════════
 */

(() => {
    'use strict';

    // ──── State ─────────────────────────────────────────────────
    let tagMap = {};       // tagNumber → DOM element
    let tagOverlays = [];  // Array of injected overlay elements
    let isTagsVisible = false;

    console.log('👻 [CONTENT] Stratos Ghost content script injected');

    // ──── Message Handler ───────────────────────────────────────
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        console.log(`📨 [CONTENT] Received: ${msg.type}`, msg);

        switch (msg.type) {
            case 'DRAW_SOM_TAGS':
                drawSoMTags();
                sendResponse({ ok: true });
                break;

            case 'HIDE_SOM_TAGS':
                hideSoMTags();
                sendResponse({ ok: true });
                break;

            case 'EXECUTE_ACTION':
                executeAction(msg.payload);
                sendResponse({ ok: true });
                break;

            // ── Cinematic HUD Messages ──────────────────────────
            case 'SHOW_HUD':
                createHUD(msg.payload?.goal, msg.payload?.maxSteps);
                sendResponse({ ok: true });
                break;

            case 'STEP_UPDATE':
                updateHUD(msg.payload);
                sendResponse({ ok: true });
                break;

            case 'MISSION_COMPLETE':
                handleMissionComplete(msg.payload);
                sendResponse({ ok: true });
                break;

            case 'MISSION_ERROR':
                handleMissionError(msg.payload);
                sendResponse({ ok: true });
                break;

            case 'MISSION_STOPPED':
                destroyHUD();
                sendResponse({ ok: true });
                break;

            case 'HUD_UPDATE':
                if (msg.payload?.state === 'THINKING') {
                    // Pulse the orb for thinking state
                    if (hudElement) {
                        const orbEl = hudElement.querySelector('#stratos-hud-orb');
                        if (orbEl) orbEl.classList.add('active');
                        hudStateMemory.orbActive = true;
                    }
                } else if (msg.payload?.state === 'ACTION' && msg.payload?.text) {
                    // Update reasoning text
                    if (hudElement) {
                        const reasoningEl = hudElement.querySelector('#stratos-hud-reasoning');
                        if (reasoningEl) {
                            hudStateMemory.reasoningText = msg.payload.text;
                            hudTypewriterEffect(msg.payload.text, reasoningEl);
                        }
                    }
                }
                sendResponse({ ok: true });
                break;

            case 'SPEAK':
                speak(msg.text || msg.payload?.text || '');
                sendResponse({ ok: true });
                break;

            default:
                break;
        }

        return true;
    });

    // ══════════════════════════════════════════════════════════════
    //  SET-OF-MARK (SoM) — THE EYES
    // ══════════════════════════════════════════════════════════════

    /**
     * Discovers all interactive elements visible in the current viewport,
     * then injects numbered yellow bounding boxes over each one.
     */
    function drawSoMTags() {
        console.log('🏷️  [CONTENT] Drawing SoM tags...');

        // Clean any previous tags
        removeSoMTags();

        // Discover interactive elements
        const interactiveSelectors = [
            'a[href]',
            'button',
            'input:not([type="hidden"])',
            'textarea',
            'select',
            '[role="button"]',
            '[role="link"]',
            '[role="menuitem"]',
            '[role="tab"]',
            '[role="checkbox"]',
            '[role="radio"]',
            '[role="switch"]',
            '[role="combobox"]',
            '[role="searchbox"]',
            '[role="option"]',
            '[onclick]',
            '[tabindex]:not([tabindex="-1"])',
            'summary',
            'label[for]',
            '[contenteditable="true"]',
        ];

        const selector = interactiveSelectors.join(', ');
        const allElements = document.querySelectorAll(selector);
        console.log(`🔍 [CONTENT] Found ${allElements.length} potential interactive elements`);

        let tagNumber = 1;
        tagMap = {};
        tagOverlays = [];

        for (const el of allElements) {
            // Skip hidden, invisible, or off-screen elements
            if (!isElementVisible(el)) continue;

            const rect = el.getBoundingClientRect();

            // Skip elements that are too small to be meaningful
            if (rect.width < 8 || rect.height < 8) continue;

            // Skip elements fully outside viewport
            if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
            if (rect.right < 0 || rect.left > window.innerWidth) continue;

            // Create the SoM overlay
            const overlay = document.createElement('div');
            overlay.className = 'stratos-som-tag';
            overlay.setAttribute('data-stratos-tag', tagNumber);
            overlay.style.cssText = `
        position: fixed;
        left: ${rect.left}px;
        top: ${rect.top}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        pointer-events: none !important;
        z-index: 999999;
      `;

            // Create the number badge
            const badge = document.createElement('span');
            badge.className = 'stratos-som-badge';
            badge.textContent = tagNumber;
            badge.style.cssText = `
        position: absolute;
        top: -2px;
        left: -2px;
        background: #FFD600;
        color: #000;
        font-family: 'Arial', sans-serif;
        font-size: 10px;
        font-weight: 800;
        line-height: 1;
        padding: 2px 4px;
        border-radius: 3px;
        pointer-events: none !important;
        z-index: 999999;
        box-shadow: 0 1px 3px rgba(0,0,0,0.5);
        min-width: 14px;
        text-align: center;
      `;

            overlay.appendChild(badge);
            document.body.appendChild(overlay);

            tagMap[tagNumber] = el;
            el.setAttribute('data-stratos-tag', tagNumber);  // For DOM fallback lookup
            tagOverlays.push(overlay);
            tagNumber++;
        }

        isTagsVisible = true;
        const tagCount = tagNumber - 1;
        console.log(`🏷️  [CONTENT] Drew ${tagCount} SoM tags`);

        // Notify background that SoM is ready for screenshot
        chrome.runtime.sendMessage({ type: 'SOM_READY', payload: { tagCount } });
    }

    /**
     * Check if element is truly visible (not display:none, not zero opacity, etc.)
     */
    function isElementVisible(el) {
        if (!el) return false;

        const style = window.getComputedStyle(el);
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden') return false;
        if (parseFloat(style.opacity) === 0) return false;

        // Check if element has any dimensions
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;

        return true;
    }

    /**
     * Hide all SoM tags (called after screenshot is taken)
     */
    function hideSoMTags() {
        console.log('🏷️  [CONTENT] Hiding SoM tags');
        for (const overlay of tagOverlays) {
            overlay.style.display = 'none';
        }
        isTagsVisible = false;
    }

    /**
     * Completely remove all SoM tags from DOM
     */
    function removeSoMTags() {
        for (const overlay of tagOverlays) {
            overlay.remove();
        }
        tagOverlays = [];
        tagMap = {};
        isTagsVisible = false;
    }

    // ══════════════════════════════════════════════════════════════
    //  ACTION EXECUTION — THE HANDS
    // ══════════════════════════════════════════════════════════════

    async function executeAction(payload) {
        console.log(`🤖 [CONTENT] Executing action:`, payload);

        // Safety timeout — NEVER let an action hang the loop
        const actionTimeout = setTimeout(() => {
            console.error('⏰ [CONTENT] Action timed out after 15s — forcing continuation');
            chrome.runtime.sendMessage({ type: 'ACTION_EXECUTED' });
        }, 15000);

        try {
            // CRITICAL: Save the element reference BEFORE cleaning up SoM tags.
            // removeSoMTags() resets tagMap = {}, so we must grab the element first.
            let targetEl = null;
            if (payload.tagNumber !== null && payload.tagNumber !== undefined) {
                const tagId = Number(payload.tagNumber);
                targetEl = tagMap[tagId];

                // Fallback: if tagMap miss, try DOM querySelector
                if (!targetEl) {
                    console.warn(`⚠️ [CONTENT] Tag #${tagId} not in tagMap, trying DOM fallback...`);
                    targetEl = document.querySelector(`[data-stratos-tag="${tagId}"]`);
                    if (targetEl) {
                        console.log(`🔄 [CONTENT] Found element via DOM fallback for tag #${tagId}`);
                    }
                }

                if (!targetEl) {
                    console.error(`❌ [CONTENT] Tag #${tagId} not found anywhere (tagMap keys: ${Object.keys(tagMap).join(',')})`);
                } else {
                    console.log(`🎯 [CONTENT] Element for tag #${tagId}: <${targetEl.tagName.toLowerCase()}>`);
                }
            }

            // Now safe to clean SoM overlays
            removeSoMTags();

            // Track last interacted element for highlight fallback on COMPLETE
            if (targetEl) _lastInteractedElement = targetEl;

            // Verify element is still connected to DOM
            if (targetEl && !document.body.contains(targetEl)) {
                console.warn('⚠️ [CONTENT] Target element was removed from DOM after SoM cleanup');
                targetEl = null;
            }

            switch (payload.action) {
                case 'CLICK':
                    if (targetEl) {
                        await executeClick(targetEl, payload.tagNumber);
                    } else {
                        console.error(`❌ [CONTENT] Cannot click — no element for tag #${payload.tagNumber}`);
                    }
                    break;
                case 'TYPE':
                    if (targetEl) {
                        await executeType(targetEl, payload.value, payload.tagNumber);
                    } else {
                        console.error(`❌ [CONTENT] Cannot type — no element for tag #${payload.tagNumber}`);
                    }
                    break;
                case 'SCROLL':
                    await executeScroll(payload.value);
                    break;
                default:
                    console.error(`❌ [CONTENT] Unknown action: ${payload.action}`);
            }

            // Wait for DOM to settle, then signal background
            await waitForDomSettle();

        } catch (err) {
            console.error('🔥 [CONTENT] Action execution error:', err);
        } finally {
            clearTimeout(actionTimeout);
            console.log('✅ [CONTENT] Action complete, signaling background');
            chrome.runtime.sendMessage({ type: 'ACTION_EXECUTED' });
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  CLICK SIMULATION ENGINE v3 — Stable + React 19 Compatible
    //
    //  Phase 1: Trusted .click() on tagged element (works on all HTML)
    //  Phase 2: Walk ancestors with .click() (SVGs, nested spans)
    //  Phase 3: React Fiber direct invoke (React 19 apps)
    //  Final:   Full pointer/mouse event chain as last resort
    // ══════════════════════════════════════════════════════════════

    async function executeClick(el, tagNumber) {
        const tagId = Number(tagNumber);
        if (!el) {
            console.error(`❌ [CONTENT] executeClick called with null element for tag #${tagId}`);
            return;
        }

        console.log(`🖱️  [CONTENT] ── Click Engine v3 ── tag #${tagId}`);
        console.log(`🖱️  [CONTENT] Element: <${el.tagName.toLowerCase()}> class="${(el.className?.toString?.() || '').substring(0, 60)}"`);

        // Scroll into view FIRST so getBoundingClientRect gives viewport-relative coords
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        await sleep(150);

        // Recalculate position from fresh getBoundingClientRect
        // Note: getBoundingClientRect returns viewport-relative coords (clientX/Y).
        // No need to add scrollX/Y for click dispatch — clientX/Y is what we need.
        const rect = el.getBoundingClientRect();
        const x = Math.round(rect.left + rect.width / 2);
        const y = Math.round(rect.top + rect.height / 2);

        console.log(`🖱️  [CONTENT] Viewport coords: (${x}, ${y}) | Scroll: (${window.scrollX}, ${window.scrollY})`);

        // Show visual radar ping
        showRadarPing(x, y);

        // ── PHASE 1: Direct trusted .click() on the tagged element ──
        // This is the simplest and most reliable path. HTMLElement.click()
        // produces isTrusted:true in Chromium. Works on Wikipedia, Google, etc.
        console.log(`🔷 [CONTENT] Phase 1: Trusted .click() on tagged element`);
        try {
            if (typeof el.focus === 'function') {
                el.focus({ preventScroll: true });
            }
            await sleep(30);
            el.click();
            console.log(`✅ [CONTENT] Phase 1: .click() dispatched on <${el.tagName.toLowerCase()}>`);
            // Don't do DOM-change gating here — .click() on a standard <a> tag
            // navigates the page, which we can't detect synchronously.
            // Let the autonomous loop handle it.
            return;
        } catch (e) {
            console.warn(`⚠️  [CONTENT] Phase 1 error:`, e.message);
        }

        // ── PHASE 2: Ancestor cascade (for SVG icons / nested spans) ──
        console.log(`🔷 [CONTENT] Phase 2: Ancestor cascade .click()`);
        try {
            let ancestor = el.parentElement;
            let depth = 0;
            while (ancestor && ancestor !== document.body && depth < 6) {
                const tag = ancestor.tagName;
                const role = ancestor.getAttribute('role');
                // Only click semantically interactive ancestors
                if (tag === 'BUTTON' || tag === 'A' || tag === 'LABEL' || tag === 'SUMMARY' ||
                    role === 'button' || role === 'link' || role === 'menuitem' ||
                    role === 'tab' || role === 'option' || ancestor.onclick) {
                    console.log(`   ↑ [CONTENT] Clicking ancestor [${depth}]: <${tag.toLowerCase()}> role=${role}`);
                    ancestor.focus({ preventScroll: true });
                    ancestor.click();
                    console.log(`✅ [CONTENT] Phase 2: Ancestor click dispatched`);
                    return;
                }
                ancestor = ancestor.parentElement;
                depth++;
            }
            console.log(`⚪ [CONTENT] Phase 2: No interactive ancestor found`);
        } catch (e) {
            console.warn(`⚠️  [CONTENT] Phase 2 error:`, e.message);
        }

        // ── PHASE 3: React Fiber direct invocation ──
        console.log(`🔷 [CONTENT] Phase 3: React Fiber onClick`);
        try {
            if (invokeReactFiberClick(el)) {
                console.log(`✅ [CONTENT] Phase 3: React fiber handler invoked`);
                return;
            }
            console.log(`⚪ [CONTENT] Phase 3: No React fiber found`);
        } catch (e) {
            console.warn(`⚠️  [CONTENT] Phase 3 error:`, e.message);
        }

        // ── FINAL FALLBACK: Full event chain + .click() ──
        console.log(`🟡 [CONTENT] Fallback: Full pointer/mouse event chain`);
        await dispatchFullEventChain(el, x, y);

        console.log(`🏁 [CONTENT] ── Click Engine Complete ── tag #${tagId}`);
    }

    // ── React Fiber Walking ───────────────────────────────────
    function invokeReactFiberClick(startElement) {
        let node = startElement;
        let depth = 0;
        const maxDepth = 10;

        while (node && node !== document.body && depth < maxDepth) {
            const fiber = getReactFiber(node);
            if (fiber) {
                let fiberNode = fiber;
                let fiberDepth = 0;
                while (fiberNode && fiberDepth < 12) {
                    const props = fiberNode.memoizedProps || fiberNode.pendingProps;
                    if (props) {
                        for (const h of ['onClick', 'onClickCapture', 'onMouseDown', 'onPointerDown']) {
                            if (typeof props[h] === 'function') {
                                console.log(`🔬 [CONTENT] Found React ${h} at DOM depth ${depth}, fiber depth ${fiberDepth}`);
                                try {
                                    props[h](createSyntheticReactEvent(startElement, h));
                                    return true;
                                } catch (e) {
                                    console.warn(`⚠️  [CONTENT] ${h} threw:`, e.message);
                                }
                            }
                        }
                    }
                    fiberNode = fiberNode.return;
                    fiberDepth++;
                }
            }
            node = node.parentElement;
            depth++;
        }
        return false;
    }

    function getReactFiber(element) {
        if (!element) return null;
        const keys = Object.keys(element);
        for (const key of keys) {
            if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
                return element[key];
            }
        }
        return null;
    }

    function createSyntheticReactEvent(target, type) {
        const rect = target.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        return {
            target, currentTarget: target,
            type: type.replace(/^on/, '').toLowerCase(),
            bubbles: true, cancelable: true, defaultPrevented: false,
            isTrusted: true, timeStamp: Date.now(),
            clientX: cx, clientY: cy,
            pageX: cx + window.scrollX, pageY: cy + window.scrollY,
            screenX: cx, screenY: cy, button: 0, buttons: 1,
            nativeEvent: new MouseEvent('click', {
                bubbles: true, cancelable: true, view: window,
                clientX: cx, clientY: cy, button: 0,
            }),
            isDefaultPrevented: () => false,
            isPropagationStopped: () => false,
            persist: () => { },
            preventDefault() { this.defaultPrevented = true; },
            stopPropagation() { },
        };
    }

    // ── Full Event Chain (final fallback) ─────────────────────
    async function dispatchFullEventChain(el, x, y) {
        const o = {
            bubbles: true, cancelable: true, composed: true, view: window,
            clientX: x, clientY: y,
            screenX: window.screenX + x, screenY: window.screenY + y,
            pageX: x + window.scrollX, pageY: y + window.scrollY,
            button: 0, buttons: 1,
            pointerId: 1, pointerType: 'mouse',
            width: 1, height: 1, pressure: 0.5, isPrimary: true,
        };

        el.dispatchEvent(new PointerEvent('pointerover', o));
        el.dispatchEvent(new PointerEvent('pointerenter', { ...o, bubbles: false }));
        el.dispatchEvent(new MouseEvent('mouseover', o));
        el.dispatchEvent(new MouseEvent('mouseenter', { ...o, bubbles: false }));
        await sleep(16);
        el.dispatchEvent(new PointerEvent('pointerdown', { ...o, pressure: 0.5 }));
        el.dispatchEvent(new MouseEvent('mousedown', o));
        if (typeof el.focus === 'function') el.focus({ preventScroll: true });
        await sleep(40);
        el.dispatchEvent(new PointerEvent('pointerup', { ...o, pressure: 0, buttons: 0 }));
        el.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }));
        el.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0 }));

        // Absolute final fallback — trusted .click()
        el.click();
    }

    // ══════════════════════════════════════════════════════════════
    //  TYPE SIMULATION ENGINE v3 — Freeze-Proof, Rich Text Ready
    //
    //  Fixes over v2:
    //  - No target.click() (caused GitHub tab switches / freezes)
    //  - No innerHTML='' (destroyed React state bindings)
    //  - Full try/catch so ACTION_EXECUTED always fires
    //  - 8s safety timeout prevents infinite hangs
    //  - Walks UP ancestors to find contenteditable parents
    // ══════════════════════════════════════════════════════════════

    async function executeType(el, value, tagNumber) {
        if (!el || !value) {
            console.error(`❌ [CONTENT] executeType: missing element or value`);
            return;
        }

        console.log(`⌨️  [CONTENT] ── Type Engine v3 ── tag #${tagNumber}`);
        console.log(`⌨️  [CONTENT] Tagged element: <${el.tagName.toLowerCase()}>`);
        console.log(`⌨️  [CONTENT] Text: "${value}"`);

        // Safety timeout — never let typing freeze the loop
        const typePromise = _executeTypeInner(el, value, tagNumber);
        const timeoutPromise = new Promise(resolve => {
            setTimeout(() => {
                console.warn(`⏰ [CONTENT] Type Engine v3 safety timeout (8s) — forcing completion`);
                resolve();
            }, 8000);
        });

        await Promise.race([typePromise, timeoutPromise]);
    }

    async function _executeTypeInner(el, value, tagNumber) {
        try {
            // ── Step 1: Resolve the real typable element ──
            const target = resolveTypableTarget(el);
            console.log(`🎯 [CONTENT] Resolved: <${target.tagName.toLowerCase()}> isContentEditable=${target.isContentEditable}`);

            // Scroll into view
            target.scrollIntoView({ behavior: 'instant', block: 'center' });
            await sleep(100);

            // Show radar ping
            const rect = target.getBoundingClientRect();
            showRadarPing(rect.left + rect.width / 2, rect.top + rect.height / 2);

            // ── Step 2: Focus (NO .click() — that causes freezes) ──
            target.focus({ preventScroll: true });
            target.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
            target.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
            await sleep(50);

            // ── Step 3: Route to the correct typing strategy ──
            const tag = target.tagName.toLowerCase();
            if (target.isContentEditable && tag !== 'input' && tag !== 'textarea') {
                await _typeContentEditable(target, value);
            } else {
                await _typeStandardInput(target, value);
            }

            console.log(`✅ [CONTENT] ── Type Engine v3 Complete ── tag #${tagNumber}`);

        } catch (err) {
            console.error(`🔥 [CONTENT] Type Engine v3 error (non-fatal):`, err.message);
            // Non-fatal — the loop will continue via ACTION_EXECUTED
        }
    }

    /**
     * Find the real element that can receive text.
     * Searches: self → children → ancestors (for cases where SoM tags a
     * child span inside a contenteditable parent).
     */
    function resolveTypableTarget(el) {
        // 1. Element itself is typable
        if (_isTypable(el)) return el;

        // 2. Search INSIDE for nested typables (wrapper divs)
        //    Priority order: textarea (GitHub), input, contenteditable
        const selectors = [
            'textarea',
            'input[type="text"], input[type="search"], input[type="email"], input[type="url"], input:not([type])',
            '[contenteditable="true"]',
        ];
        for (const sel of selectors) {
            const found = el.querySelector(sel);
            if (found) {
                console.log(`🔍 [CONTENT] Found nested <${found.tagName.toLowerCase()}> inside wrapper`);
                return found;
            }
        }

        // 3. Walk UP ancestors (SoM might tag a span inside a contenteditable)
        let parent = el.parentElement;
        let depth = 0;
        while (parent && parent !== document.body && depth < 5) {
            if (parent.isContentEditable || parent.getAttribute('contenteditable') === 'true') {
                console.log(`🔍 [CONTENT] Found contenteditable ancestor at depth ${depth}`);
                return parent;
            }
            // Check if parent contains a textarea/input sibling
            const sibling = parent.querySelector('textarea') ||
                parent.querySelector('input[type="text"], input[type="search"], input:not([type])');
            if (sibling && sibling !== el) {
                console.log(`🔍 [CONTENT] Found sibling <${sibling.tagName.toLowerCase()}> via ancestor`);
                return sibling;
            }
            parent = parent.parentElement;
            depth++;
        }

        // 4. Fallback: use the element itself
        console.warn(`⚠️  [CONTENT] No typable target resolved, using original element`);
        return el;
    }

    function _isTypable(el) {
        const tag = el.tagName.toLowerCase();
        if (tag === 'textarea') return true;
        if (tag === 'input') {
            const t = (el.type || 'text').toLowerCase();
            return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(t);
        }
        if (el.isContentEditable) return true;
        if (el.getAttribute('contenteditable') === 'true') return true;
        const role = el.getAttribute('role');
        return role === 'textbox' || role === 'searchbox';
    }

    /**
     * Standard <input> / <textarea> path.
     * Uses native prototype setters to bypass React's synthetic wrappers.
     */
    async function _typeStandardInput(target, value) {
        console.log(`⌨️  [CONTENT] Standard path: <${target.tagName.toLowerCase()}>`);

        // Get the correct native setter for this element type
        const tag = target.tagName.toLowerCase();
        const proto = tag === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

        // Clear
        if (nativeSetter) {
            nativeSetter.call(target, '');
        } else {
            target.value = '';
        }
        target.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(30);

        // Type character by character
        for (let i = 0; i < value.length; i++) {
            const char = value[i];
            const partial = value.substring(0, i + 1);

            // keydown + keypress
            _fireKey(target, char, 'keydown');
            _fireKey(target, char, 'keypress');

            // Set value via native setter
            if (nativeSetter) {
                nativeSetter.call(target, partial);
            } else {
                target.value = partial;
            }

            // input event (React listens to this)
            target.dispatchEvent(new InputEvent('input', {
                bubbles: true, cancelable: true,
                inputType: 'insertText', data: char,
            }));

            // keyup
            _fireKey(target, char, 'keyup');

            if (i < value.length - 1) await sleep(10);
        }

        // Final events
        target.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`✅ [CONTENT] Standard type complete: "${value}"`);
    }

    /**
     * ContentEditable path (GitHub Issues, YouTube Comments, Slack, Notion).
     * Strategy: select all → delete → insertText via execCommand.
     * NEVER set innerHTML='' — that destroys React/framework bindings.
     */
    async function _typeContentEditable(target, value) {
        console.log(`⌨️  [CONTENT] ContentEditable path: <${target.tagName.toLowerCase()}>`);

        // Ensure focus
        target.focus({ preventScroll: true });
        await sleep(30);

        // Select all existing content and delete it (safe — doesn't nuke bindings)
        try {
            document.execCommand('selectAll', false, null);
            await sleep(20);
            document.execCommand('delete', false, null);
            await sleep(20);
        } catch (e) {
            console.warn(`⚠️  [CONTENT] selectAll/delete failed:`, e.message);
            // Manual fallback: use Selection API
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(target);
            sel.removeAllRanges();
            sel.addRange(range);
            sel.deleteFromDocument();
            await sleep(20);
        }

        // Re-focus after clearing
        target.focus({ preventScroll: true });
        await sleep(30);

        // Strategy 1: execCommand('insertText') — fires native input events
        let inserted = false;
        try {
            inserted = document.execCommand('insertText', false, value);
        } catch (e) {
            console.warn(`⚠️  [CONTENT] execCommand insertText threw:`, e.message);
        }

        if (inserted) {
            console.log(`✅ [CONTENT] execCommand('insertText') succeeded`);
        } else {
            // Strategy 2: DataTransfer paste simulation
            console.log(`⌨️  [CONTENT] Trying paste simulation...`);
            try {
                const dt = new DataTransfer();
                dt.setData('text/plain', value);
                const pasteEvent = new ClipboardEvent('paste', {
                    bubbles: true, cancelable: true, clipboardData: dt,
                });
                const accepted = target.dispatchEvent(pasteEvent);
                if (accepted) {
                    // Some editors handle paste themselves
                    // Check if content was actually inserted
                    await sleep(50);
                    if (target.textContent.includes(value.substring(0, 5))) {
                        console.log(`✅ [CONTENT] Paste simulation worked`);
                        inserted = true;
                    }
                }
            } catch (e) {
                console.warn(`⚠️  [CONTENT] Paste simulation failed:`, e.message);
            }
        }

        if (!inserted) {
            // Strategy 3: Direct textContent (last resort — may not trigger listeners)
            console.log(`⌨️  [CONTENT] Final fallback: direct textContent`);
            target.textContent = value;
        }

        // Fire synthetic events to wake up framework listeners
        // Keyboard events (first 3 chars is enough to trigger change detection)
        for (let i = 0; i < Math.min(value.length, 3); i++) {
            _fireKey(target, value[i], 'keydown');
            _fireKey(target, value[i], 'keypress');
            target.dispatchEvent(new InputEvent('input', {
                bubbles: true, inputType: 'insertText', data: value[i],
            }));
            _fireKey(target, value[i], 'keyup');
        }

        // Change + blur/focus cycle to activate submit button validation
        target.dispatchEvent(new Event('change', { bubbles: true }));
        target.dispatchEvent(new Event('blur', { bubbles: true }));
        await sleep(30);
        target.focus({ preventScroll: true });

        console.log(`✅ [CONTENT] ContentEditable type complete: "${value}"`);
    }

    /**
     * Fire a single keyboard event (keydown, keypress, or keyup).
     */
    function _fireKey(target, char, eventType) {
        target.dispatchEvent(new KeyboardEvent(eventType, {
            key: char, code: `Key${char.toUpperCase()}`,
            charCode: char.charCodeAt(0), keyCode: char.charCodeAt(0),
            which: char.charCodeAt(0), bubbles: true, cancelable: true,
        }));
    }

    // ── SCROLL SIMULATION ──────────────────────────────────────
    async function executeScroll(direction) {
        const dir = (direction || 'down').toLowerCase();
        const amount = dir === 'up' ? -500 : 500;
        console.log(`📜 [CONTENT] Scrolling ${dir} by ${Math.abs(amount)}px`);

        // Check if we're at the boundary before scrolling
        const beforeScroll = window.scrollY;
        window.scrollBy({ top: amount, behavior: 'smooth' });
        await sleep(600);

        const afterScroll = window.scrollY;
        if (Math.abs(afterScroll - beforeScroll) < 5) {
            console.log(`⚠️  [CONTENT] Scroll had no effect — likely at ${dir === 'down' ? 'bottom' : 'top'} of page`);
        } else {
            console.log(`✅ [CONTENT] Scrolled from ${beforeScroll.toFixed(0)} to ${afterScroll.toFixed(0)}`);
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  VISUAL FEEDBACK
    // ══════════════════════════════════════════════════════════════

    /**
     * Shows a red radar ping animation at the given coordinates
     */
    function showRadarPing(x, y) {
        console.log(`🔴 [CONTENT] Radar ping at (${x.toFixed(0)}, ${y.toFixed(0)})`);

        const ping = document.createElement('div');
        ping.className = 'stratos-radar-ping';
        ping.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: 0;
      height: 0;
      pointer-events: none !important;
      z-index: 999999;
    `;

        // Inner dot
        const dot = document.createElement('div');
        dot.className = 'stratos-radar-dot';
        ping.appendChild(dot);

        // Ring 1
        const ring1 = document.createElement('div');
        ring1.className = 'stratos-radar-ring stratos-radar-ring-1';
        ping.appendChild(ring1);

        // Ring 2
        const ring2 = document.createElement('div');
        ring2.className = 'stratos-radar-ring stratos-radar-ring-2';
        ping.appendChild(ring2);

        document.body.appendChild(ping);

        // Remove after animation
        setTimeout(() => {
            ping.remove();
        }, 1200);
    }

    // ══════════════════════════════════════════════════════════════
    //  DOM SETTLE DETECTION
    // ══════════════════════════════════════════════════════════════

    /**
     * Waits for the DOM to "settle" after an action by watching for
     * mutations to stop. Falls back to a timeout.
     */
    function waitForDomSettle(timeout = 3000, quietPeriod = 500) {
        return new Promise((resolve) => {
            let timer = null;
            let overallTimer = null;

            const observer = new MutationObserver(() => {
                // Reset the quiet period timer on each mutation
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => {
                    observer.disconnect();
                    if (overallTimer) clearTimeout(overallTimer);
                    console.log('🧘 [CONTENT] DOM settled (quiet period elapsed)');
                    resolve();
                }, quietPeriod);
            });

            // Start observing
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                characterData: true,
            });

            // Start the quiet period timer immediately (in case there are no mutations)
            timer = setTimeout(() => {
                observer.disconnect();
                if (overallTimer) clearTimeout(overallTimer);
                console.log('🧘 [CONTENT] DOM settled (no mutations detected)');
                resolve();
            }, quietPeriod);

            // Overall timeout — don't wait forever
            overallTimer = setTimeout(() => {
                observer.disconnect();
                if (timer) clearTimeout(timer);
                console.log('⏰ [CONTENT] DOM settle timeout reached');
                resolve();
            }, timeout);
        });
    }

    // ──── Utilities ─────────────────────────────────────────────
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ══════════════════════════════════════════════════════════════
    //  CINEMATIC MODE — FLOATING HUD + TTS ENGINE
    //  Runs in the page DOM so closing the popup doesn't kill audio
    // ══════════════════════════════════════════════════════════════

    // ── Speech Synthesis (The Mouth) ─────────────────────────────
    let preferredVoice = null;

    function loadVoice() {
        const voices = window.speechSynthesis.getVoices();
        preferredVoice =
            voices.find(v => v.lang === 'en-US' && v.name.includes('Google')) ||
            voices.find(v => v.lang === 'en-GB' && v.name.includes('Google')) ||
            voices.find(v => v.lang === 'en-US') ||
            voices.find(v => v.lang.startsWith('en')) ||
            null;
        if (preferredVoice) {
            console.log(`🔊 [CONTENT] Voice loaded: ${preferredVoice.name}`);
        }
    }

    if (window.speechSynthesis) {
        loadVoice();
        window.speechSynthesis.onvoiceschanged = loadVoice;
    }

    function speak(text) {
        if (!window.speechSynthesis || !text) return;
        try {
            // Cancel any in-flight utterance to prevent overlap
            if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
                console.log('🔊 [CONTENT] Cancelling previous speech');
            }
            window.speechSynthesis.cancel();

            // Always create a fresh utterance; previous ones may be dead from DOM wipes
            const utterance = new SpeechSynthesisUtterance(text);
            if (preferredVoice) utterance.voice = preferredVoice;
            utterance.rate = 1.1;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            console.log(`🔊 [CONTENT] Speaking: "${text}"`);
            window.speechSynthesis.speak(utterance);
        } catch (e) {
            // DOM wipe may kill speechSynthesis state — log and move on
            console.warn('🔊 [CONTENT] speak() failed after DOM wipe, will retry on next call:', e.message);
        }
    }

    // ── Floating HUD ─────────────────────────────────────────────
    let hudElement = null;
    let hudTypewriter = null;
    let hudMaxSteps = 25;
    let hudObserver = null;
    let _lastSpokenAction = null;  // For deduplicating consecutive WAIT narrations
    let _lastInteractedElement = null;  // For highlight fallback on COMPLETE

    // ── State Memory: survives SPA DOM wipes ─────────────────────
    let hudStateMemory = {
        goalText: '',
        reasoningText: 'Initializing agent...',
        stepText: 'STEP 0 / 25',
        statusText: '● ACTIVE',
        statusColor: '',
        orbActive: true,
        alive: false,
        collapsed: false,
    };

    function createHUD(goalText, maxSteps) {
        destroyHUD(true); // instant remove if exists
        hudMaxSteps = maxSteps || 25;

        // Persist state
        hudStateMemory.goalText = goalText || 'Mission in progress...';
        hudStateMemory.reasoningText = 'Initializing agent...';
        hudStateMemory.stepText = `STEP 0 / ${hudMaxSteps}`;
        hudStateMemory.statusText = '● ACTIVE';
        hudStateMemory.statusColor = '';
        hudStateMemory.orbActive = true;
        hudStateMemory.alive = true;

        _buildAndMountHUD();
        _startHUDObserver();
        console.log('🖥️  [CONTENT] HUD injected (attached to documentElement)');
    }

    /** Build the HUD DOM element and mount it on documentElement */
    function _buildAndMountHUD() {
        const stale = document.getElementById('stratos-ghost-hud');
        if (stale) stale.remove();

        const hud = document.createElement('div');
        hud.id = 'stratos-ghost-hud';
        hud.className = `stratos-hud${hudStateMemory.collapsed ? ' stratos-hud-collapsed' : ''}`;
        hud.innerHTML = `
            <div class="stratos-hud-header">
                <span class="stratos-hud-icon">👻</span>
                <span class="stratos-hud-title">STRATOS GHOST</span>
                <span class="stratos-hud-status" id="stratos-hud-status">${escapeHtmlHud(hudStateMemory.statusText)}</span>
                <button class="stratos-hud-toggle" id="stratos-hud-toggle" title="Collapse / Expand">${hudStateMemory.collapsed ? '▴' : '▾'}</button>
            </div>
            <div class="stratos-hud-body" id="stratos-hud-body">
                <div class="stratos-hud-goal" id="stratos-hud-goal">${escapeHtmlHud(hudStateMemory.goalText)}</div>
                <div class="stratos-hud-reasoning-row">
                    <div class="stratos-hud-orb${hudStateMemory.orbActive ? ' active' : ''}" id="stratos-hud-orb"></div>
                    <span class="stratos-hud-reasoning" id="stratos-hud-reasoning">${escapeHtmlHud(hudStateMemory.reasoningText)}</span>
                </div>
                <div class="stratos-hud-step" id="stratos-hud-step">${escapeHtmlHud(hudStateMemory.stepText)}</div>
            </div>
        `;

        if (hudStateMemory.statusColor) {
            hud.querySelector('#stratos-hud-status').style.color = hudStateMemory.statusColor;
        }

        // Append to documentElement so body replacements don't nuke it
        document.documentElement.appendChild(hud);
        hudElement = hud;

        // Wire collapse toggle
        const toggleBtn = hud.querySelector('#stratos-hud-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                hudStateMemory.collapsed = !hudStateMemory.collapsed;
                hud.classList.toggle('stratos-hud-collapsed', hudStateMemory.collapsed);
                toggleBtn.textContent = hudStateMemory.collapsed ? '▴' : '▾';
            });
        }

        setTimeout(() => {
            if (hudElement === hud) hud.classList.add('stratos-hud-visible');
        }, 50);
    }

    /** MutationObserver shield: re-inject HUD if SPA routing removes it */
    let _hudRebuildPending = false;
    function _startHUDObserver() {
        if (hudObserver) hudObserver.disconnect();

        hudObserver = new MutationObserver(() => {
            if (!hudStateMemory.alive) return;
            if (_hudRebuildPending) return;
            // Check if our HUD was removed from the DOM
            if (!document.getElementById('stratos-ghost-hud')) {
                _hudRebuildPending = true;
                console.warn('🛡️ [CONTENT] HUD removed by SPA router — re-building from state memory');
                // Debounce: wait for DOM storm to settle before re-injecting
                setTimeout(() => {
                    _hudRebuildPending = false;
                    if (hudStateMemory.alive && !document.getElementById('stratos-ghost-hud')) {
                        _buildAndMountHUD();
                    }
                }, 100);
            }
        });

        hudObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });
    }

    function updateHUD(payload) {
        if (!payload) return;
        // Lazy-init HUD if it doesn't exist yet
        if (!hudElement) createHUD(null, payload.maxSteps);

        const reasoningEl = hudElement.querySelector('#stratos-hud-reasoning');
        const stepEl = hudElement.querySelector('#stratos-hud-step');
        const orbEl = hudElement.querySelector('#stratos-hud-orb');

        if (stepEl && payload.step != null) {
            const stepStr = `STEP ${payload.step} / ${hudMaxSteps}`;
            stepEl.textContent = stepStr;
            hudStateMemory.stepText = stepStr;
        }

        // Pulse orb
        if (orbEl) orbEl.classList.add('active');
        hudStateMemory.orbActive = true;

        // Typewriter the reasoning + persist
        if (reasoningEl && payload.reasoning) {
            hudStateMemory.reasoningText = payload.reasoning;
            hudTypewriterEffect(payload.reasoning, reasoningEl);
        }

        // Build narration from action + deduplicate consecutive WAITs
        if (payload.action) {
            let narration = '';
            const act = payload.action;
            const elName = payload.elementName || null;

            if (act === 'CLICK') narration = elName ? `Clicking ${elName}` : 'Clicking';
            else if (act === 'TYPE') {
                narration = elName ? `Typing into ${elName}` : 'Typing';
                if (payload.value) narration += `, ${payload.value}`;
            }
            else if (act === 'SCROLL') narration = `Scrolling ${payload.value || 'down'}`;
            else if (act === 'WAIT') narration = 'Recalibrating...';
            else if (act === 'COMPLETE') narration = 'Mission complete';
            else narration = `Executing ${act.toLowerCase()}`;

            // Only speak if this isn't a duplicate WAIT
            if (act === 'WAIT' && _lastSpokenAction === 'WAIT') {
                console.log('🔊 [CONTENT] Skipping duplicate WAIT narration');
            } else {
                speak(narration);
            }
            _lastSpokenAction = act;
        }
    }

    function handleMissionComplete(payload) {
        hudStateMemory.statusText = '✅ COMPLETE';
        hudStateMemory.statusColor = '#22c55e';
        hudStateMemory.orbActive = false;
        hudStateMemory.reasoningText = 'Mission accomplished.';

        if (hudElement) {
            const statusEl = hudElement.querySelector('#stratos-hud-status');
            const orbEl = hudElement.querySelector('#stratos-hud-orb');
            const reasoningEl = hudElement.querySelector('#stratos-hud-reasoning');
            if (statusEl) { statusEl.textContent = '✅ COMPLETE'; statusEl.style.color = '#22c55e'; }
            if (orbEl) orbEl.classList.remove('active');
            if (reasoningEl) reasoningEl.textContent = 'Mission accomplished.';
        }

        // Highlight extracted data element
        if (payload?.extractedData) {
            highlightExtractedElement(payload.extractedData);
        }

        speak('Mission complete.');

        // Fade HUD after highlight finishes (highlight is 6s, so wait 8s)
        setTimeout(() => destroyHUD(), 6000);
    }

    function handleMissionError(payload) {
        if (hudElement) {
            const statusEl = hudElement.querySelector('#stratos-hud-status');
            const orbEl = hudElement.querySelector('#stratos-hud-orb');
            const reasoningEl = hudElement.querySelector('#stratos-hud-reasoning');
            if (statusEl) { statusEl.textContent = '❌ ERROR'; statusEl.style.color = '#ef4444'; }
            if (orbEl) orbEl.classList.remove('active');
            if (reasoningEl) reasoningEl.textContent = payload?.error || 'Agent encountered an error.';
        }
        speak('Mission error.');
        setTimeout(() => destroyHUD(), 3000);
    }

    function destroyHUD(instant) {
        hudStateMemory.alive = false;  // Tell observer to stop resurrecting
        if (hudObserver) { hudObserver.disconnect(); hudObserver = null; }
        if (!hudElement) return;
        const el = hudElement;
        hudElement = null;
        if (instant) {
            el.remove();
        } else {
            el.classList.add('stratos-hud-fadeout');
            el.classList.remove('stratos-hud-visible');
            setTimeout(() => el.remove(), 1200);
        }
    }

    // ── HUD Typewriter ───────────────────────────────────────────
    function hudTypewriterEffect(text, element, speed = 20) {
        if (hudTypewriter) {
            hudTypewriter.cancel();
            hudTypewriter = null;
        }
        let index = 0;
        let cancelled = false;
        element.textContent = '';

        const handle = {
            cancel() { cancelled = true; element.textContent = text; }
        };
        hudTypewriter = handle;

        function tick() {
            if (cancelled || index >= text.length) {
                if (!cancelled) element.textContent = text;
                if (hudTypewriter === handle) hudTypewriter = null;
                return;
            }
            element.textContent += text[index];
            index++;
            setTimeout(tick, speed);
        }
        requestAnimationFrame(tick);
    }

    function escapeHtmlHud(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    // ── Visual Extraction Highlight ──────────────────────────────
    function highlightExtractedElement(extractedData) {
        if (!extractedData) return;
        const searchText = String(extractedData).trim();
        if (!searchText) return;

        console.log(`🔦 [CONTENT] Searching DOM for: "${searchText}"`);

        let bestMatch = _findTextInDOM(searchText)
            || _findTextInDOM(searchText.toLowerCase(), true)  // case-insensitive
            || (searchText.length > 20 ? _findTextInDOM(searchText.substring(0, 20)) : null); // partial

        // Last resort: highlight the last element the agent interacted with
        if (!bestMatch && _lastInteractedElement && document.body.contains(_lastInteractedElement)) {
            bestMatch = _lastInteractedElement;
            console.log('🔦 [CONTENT] Using last interacted element as highlight target');
        }

        if (bestMatch) {
            console.log(`🔦 [CONTENT] Highlighting: <${bestMatch.tagName.toLowerCase()}>`);
            bestMatch.style.setProperty('background-color', '#FEF08A', 'important');
            bestMatch.style.setProperty('color', '#000', 'important');
            bestMatch.classList.add('stratos-highlight-extracted');
            bestMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });

            setTimeout(() => {
                bestMatch.style.removeProperty('background-color');
                bestMatch.style.removeProperty('color');
                bestMatch.classList.remove('stratos-highlight-extracted');
            }, 4000);
        } else {
            console.log('⚠️  [CONTENT] Could not locate extracted data in DOM');
        }
    }

    function _findTextInDOM(text, caseInsensitive) {
        const walker = document.createTreeWalker(
            document.body, NodeFilter.SHOW_TEXT, null, false
        );
        let node;
        while (node = walker.nextNode()) {
            const content = caseInsensitive ? node.textContent.toLowerCase() : node.textContent;
            if (content.includes(text)) {
                const parent = node.parentElement;
                if (parent && isElementVisible(parent) && !parent.closest('#stratos-ghost-hud')) {
                    return parent;
                }
            }
        }
        return null;
    }

})();
