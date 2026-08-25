const MIRROR_ROOT_SELECTOR = '[data-rabbit-mirror-css-scope][data-rabbit-mirror-interaction-scoped]';
const PATCH_STYLE_ATTR = 'data-rabbit-mirror-checked-selector-descendant-patch';
const PATCH_COUNT_ATTR = 'data-rabbit-mirror-checked-selector-descendant-repair-count';
const PATCH_KIND = 'checked-selector-descendant';
const DIRECT_CHECKED_SIBLING_RE = /:checked\s*[~+]/;
const SIMPLE_CLASS_START_RE = /[A-Za-z_-]/;
const SIMPLE_CLASS_CHAR_RE = /[A-Za-z0-9_-]/;

let observer = null;
let observerHost = null;
let flushQueued = false;
const pendingRoots = new Set();
const delayedTimers = new Set();
let pendingStyleRetryCount = new WeakMap();

function safeContains(root, node) {
    if (!root || !node) return false;
    if (node === root) return true;
    try { return typeof root.contains === 'function' ? root.contains(node) : true; } catch { return false; }
}

function safeQueryAll(root, selector) {
    if (!root || typeof root.querySelectorAll !== 'function' || !selector) return [];
    try {
        return Array.from(root.querySelectorAll(selector) || []).filter(node => safeContains(root, node));
    } catch {
        return [];
    }
}

function neutralizeDirectChecked(selector) {
    return String(selector || '').replace(/:checked(?=\s*[~+])/g, '');
}

function escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function selectorUsesCurrentRabbitMirrorScope(root, selector) {
    let scope = '';
    try { scope = String(root?.getAttribute?.('data-rabbit-mirror-css-scope') || '').trim(); } catch {}
    if (!scope || !/^[A-Za-z0-9_-]+$/.test(scope)) return false;
    const escaped = escapeRegExp(scope);
    const pattern = new RegExp(`\\[data-rabbit-mirror-css-scope\\s*=\\s*(?:"${escaped}"|'${escaped}'|${escaped})\\s*\\]`);
    return pattern.test(String(selector || ''));
}

function splitTopLevelSelectorList(selectorText) {
    const text = String(selectorText || '');
    const selectors = [];
    let start = 0;
    let quote = '';
    let escaped = false;
    let squareDepth = 0;
    let parenDepth = 0;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            continue;
        }
        if (quote) {
            if (char === quote) quote = '';
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === '[') squareDepth += 1;
        else if (char === ']') squareDepth = Math.max(0, squareDepth - 1);
        else if (char === '(') parenDepth += 1;
        else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
        else if (char === ',' && squareDepth === 0 && parenDepth === 0) {
            const part = text.slice(start, index).trim();
            if (part) selectors.push(part);
            start = index + 1;
        }
    }

    const tail = text.slice(start).trim();
    if (tail) selectors.push(tail);
    return selectors;
}

function readSimpleClassToken(text, dotIndex) {
    const first = text[dotIndex + 1];
    if (!SIMPLE_CLASS_START_RE.test(first || '')) return null;
    let end = dotIndex + 2;
    while (end < text.length && SIMPLE_CLASS_CHAR_RE.test(text[end])) end += 1;
    return { start: dotIndex, end, value: text.slice(dotIndex, end) };
}

function findAdjacentClassSplitPoints(selector) {
    const text = String(selector || '');
    const checkedSibling = text.match(/:checked\s*[~+]/);
    if (!checkedSibling || checkedSibling.index == null) return [];
    const tailStart = checkedSibling.index + checkedSibling[0].length;
    const points = [];
    let quote = '';
    let escaped = false;
    let squareDepth = 0;
    let parenDepth = 0;
    let started = false;

    // Only consider the first compound immediately targeted by the checked sibling
    // combinator. This keeps the repair narrow and avoids rewriting later valid
    // compounds such as `.node.active` deeper in the visual tree.
    for (let index = tailStart; index < text.length - 1; index += 1) {
        const char = text[index];
        if (escaped) {
            escaped = false;
            started = true;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            started = true;
            continue;
        }
        if (quote) {
            if (char === quote) quote = '';
            started = true;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            started = true;
            continue;
        }
        if (char === '[') { squareDepth += 1; started = true; continue; }
        if (char === ']') { squareDepth = Math.max(0, squareDepth - 1); continue; }
        if (char === '(') { parenDepth += 1; started = true; continue; }
        if (char === ')') { parenDepth = Math.max(0, parenDepth - 1); continue; }
        if (!squareDepth && !parenDepth) {
            if (!started && /\s/.test(char)) continue;
            if (started && (/\s/.test(char) || char === '>' || char === '+' || char === '~')) break;
        }
        if (!started) started = true;
        if (squareDepth || parenDepth || char !== '.') continue;

        const first = readSimpleClassToken(text, index);
        if (!first || text[first.end] !== '.') continue;
        const second = readSimpleClassToken(text, first.end);
        if (!second) continue;
        points.push(first.end);
    }
    return points;
}

export function findSafeCheckedDescendantSelectorRepair(root, selector) {
    const original = String(selector || '').trim();
    if (!original || !DIRECT_CHECKED_SIBLING_RE.test(original)) return null;
    if (!selectorUsesCurrentRabbitMirrorScope(root, original)) return null;

    const originalStructural = neutralizeDirectChecked(original);
    if (safeQueryAll(root, originalStructural).length > 0) return null;

    const candidates = [];
    for (const splitPoint of findAdjacentClassSplitPoints(original)) {
        const repaired = `${original.slice(0, splitPoint)} ${original.slice(splitPoint)}`;
        const structural = neutralizeDirectChecked(repaired);
        const matches = safeQueryAll(root, structural);
        if (!matches.length) continue;
        if (!matches.every(node => safeContains(root, node))) continue;
        candidates.push(repaired);
    }

    const unique = [...new Set(candidates)];
    return unique.length === 1 ? unique[0] : null;
}

export function checkedSelectorRepairRulesForStyle(root, cssRules) {
    const repairs = [];
    for (const rule of Array.from(cssRules || [])) {
        // Do not hoist selectors out of @media/@supports; only direct CSSStyleRule-like entries are safe here.
        if (!rule || typeof rule.selectorText !== 'string' || !rule.style || typeof rule.style.cssText !== 'string') continue;
        if (!DIRECT_CHECKED_SIBLING_RE.test(rule.selectorText) || !rule.style.cssText.trim()) continue;

        for (const selector of splitTopLevelSelectorList(rule.selectorText)) {
            const repairedSelector = findSafeCheckedDescendantSelectorRepair(root, selector);
            if (!repairedSelector) continue;
            repairs.push(`${repairedSelector} { ${rule.style.cssText} }`);
        }
    }
    return [...new Set(repairs)];
}

function mirrorRootFor(node) {
    if (!node || node.nodeType !== 1) return null;
    try {
        if (node.matches?.(MIRROR_ROOT_SELECTOR)) return node;
        return node.closest?.(MIRROR_ROOT_SELECTOR) || null;
    } catch {
        return null;
    }
}

function collectMirrorRootsFromNode(node, roots) {
    if (!node || node.nodeType !== 1) return;
    const owner = mirrorRootFor(node);
    if (owner) roots.add(owner);
    try {
        for (const childRoot of node.querySelectorAll?.(MIRROR_ROOT_SELECTOR) || []) roots.add(childRoot);
    } catch {}
}

function ensurePatchStyle(root) {
    let patch = null;
    try { patch = root.querySelector?.(`style[${PATCH_STYLE_ATTR}="true"]`) || null; } catch {}
    if (patch) return patch;
    const doc = root?.ownerDocument || globalThis.document;
    if (!doc || typeof doc.createElement !== 'function') return null;
    patch = doc.createElement('style');
    patch.setAttribute(PATCH_STYLE_ATTR, 'true');
    patch.setAttribute('data-rabbit-mirror-maintenance-patch', PATCH_KIND);
    root.appendChild(patch);
    return patch;
}

export function repairRabbitMirrorCheckedSelectorsInRoot(root) {
    if (!root || root.nodeType !== 1) return { repaired: 0, readableStyles: 0, pendingStyles: 0 };
    if (!safeContains(root, root)) return { repaired: 0, readableStyles: 0, pendingStyles: 0 };

    const patchSelector = `style[${PATCH_STYLE_ATTR}="true"]`;
    let styles = [];
    try { styles = Array.from(root.querySelectorAll?.('style') || []); } catch {}
    styles = styles.filter(style => {
        try { return !style.matches?.(patchSelector); } catch { return true; }
    });

    let readableStyles = 0;
    let pendingStyles = 0;
    const repairRules = [];
    for (const style of styles) {
        let rules = null;
        try { rules = style.sheet?.cssRules || null; } catch { rules = null; }
        if (!rules) {
            pendingStyles += 1;
            continue;
        }
        readableStyles += 1;
        repairRules.push(...checkedSelectorRepairRulesForStyle(root, rules));
    }

    const uniqueRules = [...new Set(repairRules)];
    let existingPatch = null;
    try { existingPatch = root.querySelector?.(patchSelector) || null; } catch {}

    if (!uniqueRules.length) {
        existingPatch?.remove?.();
        try { root.removeAttribute?.(PATCH_COUNT_ATTR); } catch {}
        return { repaired: 0, readableStyles, pendingStyles };
    }

    const patch = existingPatch || ensurePatchStyle(root);
    if (!patch) return { repaired: 0, readableStyles, pendingStyles };
    const nextText = `${uniqueRules.join('\n')}\n`;
    if (patch.textContent !== nextText) patch.textContent = nextText;
    try { root.setAttribute?.(PATCH_COUNT_ATTR, String(uniqueRules.length)); } catch {}
    return { repaired: uniqueRules.length, readableStyles, pendingStyles };
}

function flushPendingRoots() {
    flushQueued = false;
    const roots = [...pendingRoots];
    pendingRoots.clear();
    for (const root of roots) {
        if (!root?.isConnected) continue;
        const result = repairRabbitMirrorCheckedSelectorsInRoot(root);
        if (result.pendingStyles > 0) {
            const attempts = pendingStyleRetryCount.get(root) || 0;
            if (attempts < 2) {
                pendingStyleRetryCount.set(root, attempts + 1);
                const timer = setTimeout(() => {
                    delayedTimers.delete(timer);
                    queueMirrorRoot(root);
                }, attempts === 0 ? 80 : 240);
                delayedTimers.add(timer);
            }
        } else {
            pendingStyleRetryCount.delete(root);
        }
    }
}

function queueMirrorRoot(root) {
    if (!root || !root.isConnected) return;
    pendingRoots.add(root);
    if (flushQueued) return;
    flushQueued = true;
    if (typeof queueMicrotask === 'function') queueMicrotask(flushPendingRoots);
    else Promise.resolve().then(flushPendingRoots);
}

function initialScan(chatRoot) {
    if (!chatRoot) return;
    // Keep startup bounded: performance-sensitive long chats must not be rescanned in full.
    const roots = new Set();
    let node = chatRoot.lastElementChild;
    let visited = 0;
    while (node && visited < 8) {
        collectMirrorRootsFromNode(node, roots);
        node = node.previousElementSibling;
        visited += 1;
    }
    for (const root of roots) queueMirrorRoot(root);
}

function onCheckedControlChange(event) {
    const target = event?.target;
    if (!target || !/^(?:checkbox|radio)$/i.test(String(target.type || ''))) return;
    const root = mirrorRootFor(target);
    if (root) queueMirrorRoot(root);
}

export function initRabbitMirrorCheckedSelectorRepair() {
    destroyRabbitMirrorCheckedSelectorRepair();
    const doc = globalThis.document;
    observerHost = doc?.querySelector?.('#chat') || null;
    if (!observerHost) return;
    initialScan(observerHost);
    observerHost.addEventListener?.('change', onCheckedControlChange, true);
    if (typeof globalThis.MutationObserver !== 'function') return;
    observer = new globalThis.MutationObserver(mutations => {
        const roots = new Set();
        for (const mutation of mutations || []) {
            const targetOwner = mirrorRootFor(mutation?.target);
            if (targetOwner) roots.add(targetOwner);
            for (const node of mutation?.addedNodes || []) collectMirrorRootsFromNode(node, roots);
        }
        for (const root of roots) queueMirrorRoot(root);
    });
    observer.observe(observerHost, { childList: true, subtree: true });
}

export function destroyRabbitMirrorCheckedSelectorRepair() {
    observer?.disconnect?.();
    observer = null;
    observerHost?.removeEventListener?.('change', onCheckedControlChange, true);
    observerHost = null;
    flushQueued = false;
    pendingRoots.clear();
    for (const timer of delayedTimers) clearTimeout(timer);
    delayedTimers.clear();
    pendingStyleRetryCount = new WeakMap();

    const doc = globalThis.document;
    if (!doc?.querySelectorAll) return;
    try {
        for (const patch of doc.querySelectorAll(`style[${PATCH_STYLE_ATTR}="true"]`)) patch.remove?.();
        for (const root of doc.querySelectorAll(`[${PATCH_COUNT_ATTR}]`)) root.removeAttribute?.(PATCH_COUNT_ATTR);
    } catch {}
}
