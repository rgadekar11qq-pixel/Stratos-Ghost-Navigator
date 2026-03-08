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

        // CRITICAL: Save the element reference BEFORE cleaning up SoM tags.
        // removeSoMTags() resets tagMap = {}, so we must grab the element first.
        let targetEl = null;
        if (payload.tagNumber !== null && payload.tagNumber !== undefined) {
            const tagId = Number(payload.tagNumber);
            targetEl = tagMap[tagId];
            if (!targetEl) {
                console.error(`❌ [CONTENT] Tag #${tagId} not found in tagMap (keys: ${Object.keys(tagMap).join(',')})`);
            } else {
                console.log(`🎯 [CONTENT] Saved element ref for tag #${tagId}: <${targetEl.tagName.toLowerCase()}>`);
            }
        }

        // Now safe to clean SoM overlays
        removeSoMTags();

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

        console.log('✅ [CONTENT] Action complete, DOM settled');
        chrome.runtime.sendMessage({ type: 'ACTION_EXECUTED' });
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

    async function executeType(el, value, tagNumber) {
        if (!el) {
            console.error(`❌ [CONTENT] executeType called with null element for tag #${tagNumber}`);
            return;
        }

        console.log(`⌨️  [CONTENT] Typing "${value}" into tag #${tagNumber}`);
        console.log(`⌨️  [CONTENT] Element:`, el.tagName, el.type, el.name || el.id);

        // Focus the element
        el.focus();
        el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
        el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        await sleep(50);

        // Clear existing value
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        )?.set || Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
        )?.set;

        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(el, '');
        } else {
            el.value = '';
        }

        // Show radar ping at element location
        const rect = el.getBoundingClientRect();
        showRadarPing(rect.left + rect.width / 2, rect.top + rect.height / 2);

        // Type character by character for maximum framework compatibility
        for (let i = 0; i < value.length; i++) {
            const char = value[i];

            // Dispatch keydown
            el.dispatchEvent(new KeyboardEvent('keydown', {
                key: char, code: `Key${char.toUpperCase()}`,
                charCode: char.charCodeAt(0), keyCode: char.charCodeAt(0),
                bubbles: true, cancelable: true,
            }));

            // Dispatch keypress
            el.dispatchEvent(new KeyboardEvent('keypress', {
                key: char, code: `Key${char.toUpperCase()}`,
                charCode: char.charCodeAt(0), keyCode: char.charCodeAt(0),
                bubbles: true, cancelable: true,
            }));

            // Set value progressively using native setter (React-compatible)
            const currentValue = value.substring(0, i + 1);
            if (nativeInputValueSetter) {
                nativeInputValueSetter.call(el, currentValue);
            } else {
                el.value = currentValue;
            }

            // Dispatch input event (critical for React)
            el.dispatchEvent(new InputEvent('input', {
                bubbles: true, cancelable: true,
                inputType: 'insertText', data: char,
            }));

            // Dispatch keyup
            el.dispatchEvent(new KeyboardEvent('keyup', {
                key: char, code: `Key${char.toUpperCase()}`,
                charCode: char.charCodeAt(0), keyCode: char.charCodeAt(0),
                bubbles: true, cancelable: true,
            }));

            // Tiny delay between keystrokes
            if (i < value.length - 1) {
                await sleep(15);
            }
        }

        // Final change event for frameworks that listen to it
        el.dispatchEvent(new Event('change', { bubbles: true }));

        console.log(`✅ [CONTENT] Typed "${value}" into tag #${tagNumber}`);
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

})();
