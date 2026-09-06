const SKIP_TEXT_PARENT_TAGS = new Set(['STYLE', 'SCRIPT', 'TEMPLATE', 'NOSCRIPT']);
const filteredNodes = new WeakMap();
let replacementCacheKey = '';
let replacementCache = [];

function ruleFind(rule) { return String((rule && typeof rule === 'object' ? rule.find : rule) ?? '').trim(); }

function replacementFor(words) {
    // RegExp /iu also folds a few Unicode characters beyond toLowerCase().
    const key = JSON.stringify(words);
    if (key !== replacementCacheKey) {
        replacementCacheKey = key;
        replacementCache = words.filter(ruleFind).map(rule => ({
            matcher: new RegExp(`^(?:${escapeRegExpLiteral(ruleFind(rule))})$`, 'iu'),
            replacement: rule && typeof rule === 'object' ? String(rule.replace ?? '') : '',
        }));
    }
    const compiled = replacementCache;
    return match => compiled.find(item => item.matcher.test(match))?.replacement ?? '';
}

export function parseRabbitMirrorReplacementLines(value) {
    return String(value ?? '').replace(/\r\n?/g, '\n').split('\n').map(line => {
        // Ambiguous legacy literals use a quoted JSON string; a pair preserves
        // a find term containing => or intentional replacement edge spaces.
        if (/^\s*["\[]/.test(line)) {
            try {
                const quoted = JSON.parse(line);
                if (typeof quoted === 'string') return quoted;
                if (Array.isArray(quoted) && quoted.length === 2 && quoted.every(value => typeof value === 'string')) return { find: quoted[0], replace: quoted[1] };
            } catch {} // An ordinary literal which resembles JSON stays literal.
        }
        const separator = line.indexOf('=>');
        return separator < 0 ? line : { find: line.slice(0, separator).trim(), replace: line.slice(separator + 2).trim() };
    });
}

export function formatRabbitMirrorReplacementLines(rules = []) {
    return rules.map(rule => {
        if (typeof rule === 'string') return rule.includes('=>') || /^["\[]/.test(rule) ? JSON.stringify(rule) : rule;
        const find = String(rule.find ?? '');
        const replace = String(rule.replace ?? '');
        return find.includes('=>') || /^["\[]/.test(find) || replace.trim() !== replace
            ? JSON.stringify([find, replace]) : `${find} => ${replace}`;
    }).join('\n');
}

// Call only immediately after local preparation has filtered these exact bytes
// under these rules. A reparsed DOM has new nodes, so cloning alone cannot carry
// its receipts. Never derive this provenance from a generated HTML attribute.
export function rememberRabbitMirrorFilteredDom(root, words = []) {
    if (!root || !Array.isArray(words) || !words.length) return;
    const fingerprint = JSON.stringify(words);
    const stack = [...(root.childNodes || [])];
    while (stack.length) {
        const node = stack.pop();
        if (node.nodeType === 3) {
            const parentTag = String(node.parentElement?.tagName || node.parentNode?.tagName || '').toUpperCase();
            if (!SKIP_TEXT_PARENT_TAGS.has(parentTag)) filteredNodes.set(node, { fingerprint, after: String(node.nodeValue ?? '') });
        } else if (!SKIP_TEXT_PARENT_TAGS.has(String(node.tagName || '').toUpperCase())) {
            stack.push(...(node.childNodes || []));
        }
    }
}

// Only local DOM cloning carries this WeakMap receipt. No model attribute can
// claim that replacement has happened; a changed value/config is filtered again.
export function cloneRabbitMirrorFilteredNode(source) {
    const clone = source.cloneNode(true);
    const stack = [[source, clone]];
    while (stack.length) {
        const [before, after] = stack.pop();
        if (before.nodeType === 3) {
            const receipt = filteredNodes.get(before);
            if (receipt && receipt.after === before.nodeValue) filteredNodes.set(after, receipt);
        }
        const children = before.childNodes || [];
        for (let i = 0; i < children.length; i += 1) stack.push([children[i], after.childNodes[i]]);
    }
    return clone;
}

function escapeRegExpLiteral(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildRabbitMirrorBannedWordsMatcher(words = []) {
    const normalized = [...new Set((Array.isArray(words) ? words : [])
        .map(ruleFind)
        .filter(Boolean))]
        .sort((a, b) => b.length - a.length || a.localeCompare(b));
    if (!normalized.length) return null;
    return new RegExp(normalized.map(escapeRegExpLiteral).join('|'), 'giu');
}

export function filterRabbitMirrorVisibleTextValue(value, words = []) {
    const text = String(value ?? '');
    const matcher = buildRabbitMirrorBannedWordsMatcher(words);
    if (!matcher || !text) return { text, hits: 0 };
    const replacement = replacementFor(words);
    let hits = 0;
    const filtered = text.replace(matcher, match => {
        hits += 1;
        return replacement(match);
    });
    return { text: filtered, hits };
}

export function applyRabbitMirrorBannedWordsToDom(root, words = []) {
    const matcher = buildRabbitMirrorBannedWordsMatcher(words);
    if (!matcher || !root) return 0;
    const fingerprint = JSON.stringify(words);
    const replacement = replacementFor(words);

    let hits = 0;
    const stack = [];
    const children = root?.childNodes ? [...root.childNodes] : [];
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);

    while (stack.length) {
        const node = stack.pop();
        if (!node) continue;
        if (node.nodeType === 3) {
            const parentTag = String(node.parentElement?.tagName || node.parentNode?.tagName || '').toUpperCase();
            if (SKIP_TEXT_PARENT_TAGS.has(parentTag)) continue;
            const before = String(node.nodeValue ?? node.textContent ?? '');
            if (!before) continue;
            const previous = filteredNodes.get(node);
            if (previous?.fingerprint === fingerprint && previous.after === before) continue;
            matcher.lastIndex = 0;
            let localHits = 0;
            const after = before.replace(matcher, match => {
                localHits += 1;
                return replacement(match);
            });
            if (localHits) {
                if ('nodeValue' in node) node.nodeValue = after;
                else node.textContent = after;
                hits += localHits;
            }
            filteredNodes.set(node, { fingerprint, after });
            continue;
        }
        if (node.nodeType === 1 && SKIP_TEXT_PARENT_TAGS.has(String(node.tagName || '').toUpperCase())) continue;
        const nodeChildren = node?.childNodes ? [...node.childNodes] : [];
        for (let index = nodeChildren.length - 1; index >= 0; index -= 1) stack.push(nodeChildren[index]);
    }
    return hits;
}
