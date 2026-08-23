export const STYLELESS_CHOICE_CONTROL_LIMIT = 8;

function boundedPositiveInteger(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(1, Math.min(10000, Math.trunc(numeric)));
}

// Walk lazily instead of materializing querySelectorAll('*'). The returned collection is
// deliberately empty after overflow so callers cannot accidentally process a partial mirror.
export function collectBoundedElementDescendants(root, limit = 320) {
    const budget = boundedPositiveInteger(limit, 320);
    const elements = [];
    let current = root?.firstElementChild || null;
    while (current) {
        if (elements.length >= budget) {
            return Object.freeze({ exceeded: true, visited: elements.length + 1, elements: Object.freeze([]) });
        }
        elements.push(current);
        if (current.firstElementChild) {
            current = current.firstElementChild;
            continue;
        }
        while (current && current !== root && !current.nextElementSibling) current = current.parentElement;
        if (!current || current === root) break;
        current = current.nextElementSibling;
    }
    return Object.freeze({ exceeded: false, visited: elements.length, elements: Object.freeze(elements) });
}

function normalizedControlKind(control = {}) {
    const tag = String(control.tag || control.tagName || '').trim().toLowerCase();
    const type = String(control.type || '').trim().toLowerCase();
    return { tag, type };
}

export function analyzeStylelessControlKinds(controls = []) {
    const kinds = [...(controls || [])].map(normalizedControlKind);
    const choiceCount = kinds.filter(({ tag, type }) => tag === 'input' && (type === 'radio' || type === 'checkbox')).length;
    const nonChoiceCount = kinds.length - choiceCount;
    return Object.freeze({
        total: kinds.length,
        choiceCount,
        nonChoiceCount,
        safeChoiceOnly: nonChoiceCount === 0 && choiceCount <= STYLELESS_CHOICE_CONTROL_LIMIT,
    });
}

export function countMeaningfulStateVisualRules(cssText = '') {
    let count = 0;
    const rules = String(cssText || '').matchAll(/([^{}]+)\{([^{}]*)\}/g);
    for (const match of rules) {
        const selector = String(match[1] || '').toLowerCase();
        const declarations = String(match[2] || '').toLowerCase();
        if (!/:(?:checked|target|focus-within|focus-visible|focus|active|hover)\b/.test(selector)) continue;
        if (!/(?:^|;)\s*(?:display|visibility|opacity|height|max-height|min-height|width|max-width|min-width|transform|translate|scale|rotate|background(?:-color|-image)?|color|border(?:-[\w-]+)?|box-shadow|filter|clip-path|mask|content|grid-template|grid-area|flex|order)\s*:/.test(declarations)) continue;
        count += 1;
    }
    return count;
}

function countMatches(pattern, value) {
    return (String(value || '').match(pattern) || []).length;
}

export function detectMissingVisualProgram(html = '', plainText = '') {
    const text = String(html || '');
    const bodyTextLength = String(plainText || '').length;
    const elementCount = countMatches(/<(?:div|section|article|main|figure|header|footer|aside|p|blockquote|ul|ol|li|label|input|button|span|h[1-6])\b/gi, text);
    const mediaCount = countMatches(/<(?:svg|canvas|img|video|picture|table)\b/gi, text);
    const visualSignals = countMatches(/(?:background(?:-color|-image)?|border(?:-[\w-]+)?|box-shadow|clip-path|mask(?:-image)?|filter|display|grid-template|grid-area|flex(?:-[\w-]+)?|position|transform|aspect-ratio|gap|padding(?:-[\w-]+)?|margin(?:-[\w-]+)?|font-size|font-weight|line-height|letter-spacing|text-align|writing-mode|column-count)\s*:/gi, text);
    const stateVisualSignals = countMatches(/:(?:checked|target|focus-within|focus-visible)\b[^{]*\{[^{}]*(?:display|visibility|opacity|transform|background|color|border|max-height|content)\s*:/gi, text);
    return bodyTextLength >= 180
        && elementCount >= 8
        && mediaCount === 0
        && visualSignals < 4
        && stateVisualSignals === 0;
}

export function semanticEnsembleScalePlan({
    naturalWidth = 0,
    availableWidth = 0,
    unitCount = 0,
    totalTextLength = 0,
    hasComplexControls = false,
} = {}) {
    const natural = Math.max(0, Number(naturalWidth) || 0);
    const available = Math.max(0, Number(availableWidth) || 0);
    const units = Math.max(0, Number(unitCount) || 0);
    const text = Math.max(0, Number(totalTextLength) || 0);
    const rawScale = natural > 0 ? Math.min(1, (available - 4) / natural) : 0;
    const minimumScale = text <= 80 ? 0.55 : 0.68;
    const candidate = !hasComplexControls
        && units >= 3
        && units <= 8
        && text <= 180
        && available >= 180
        && natural > available + 8
        && rawScale >= minimumScale
        && rawScale < 0.99;
    return Object.freeze({
        candidate,
        naturalWidth: natural,
        availableWidth: available,
        unitCount: units,
        totalTextLength: text,
        scale: candidate ? Math.max(minimumScale, Math.min(0.98, rawScale)) : 1,
    });
}
