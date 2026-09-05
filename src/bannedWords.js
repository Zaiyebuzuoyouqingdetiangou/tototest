const SKIP_TEXT_PARENT_TAGS = new Set(['STYLE', 'SCRIPT', 'TEMPLATE', 'NOSCRIPT']);

function escapeRegExpLiteral(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildRabbitMirrorBannedWordsMatcher(words = []) {
    const normalized = [...new Set((Array.isArray(words) ? words : [])
        .map(value => String(value ?? '').trim())
        .filter(Boolean))]
        .sort((a, b) => b.length - a.length || a.localeCompare(b));
    if (!normalized.length) return null;
    return new RegExp(normalized.map(escapeRegExpLiteral).join('|'), 'giu');
}

export function filterRabbitMirrorVisibleTextValue(value, words = []) {
    const text = String(value ?? '');
    const matcher = buildRabbitMirrorBannedWordsMatcher(words);
    if (!matcher || !text) return { text, hits: 0 };
    let hits = 0;
    const filtered = text.replace(matcher, () => {
        hits += 1;
        return '';
    });
    return { text: filtered, hits };
}

export function applyRabbitMirrorBannedWordsToDom(root, words = []) {
    const matcher = buildRabbitMirrorBannedWordsMatcher(words);
    if (!matcher || !root) return 0;

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
            matcher.lastIndex = 0;
            let localHits = 0;
            const after = before.replace(matcher, () => {
                localHits += 1;
                return '';
            });
            if (localHits) {
                if ('nodeValue' in node) node.nodeValue = after;
                else node.textContent = after;
                hits += localHits;
            }
            continue;
        }
        if (node.nodeType === 1 && SKIP_TEXT_PARENT_TAGS.has(String(node.tagName || '').toUpperCase())) continue;
        const nodeChildren = node?.childNodes ? [...node.childNodes] : [];
        for (let index = nodeChildren.length - 1; index >= 0; index -= 1) stack.push(nodeChildren[index]);
    }
    return hits;
}
