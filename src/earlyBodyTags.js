// This parser does not enable early generation. Callers must require the explicit
// default-off setting, own the message/swipe/operation, and permit one dispatch.
// It reads plain strings only: no DOM, network, storage, eval or HTML execution.
export const EARLY_BODY_MAX_SOURCE_CHARS = 256 * 1024;
const MAX_DEPTH = 128;
const MAX_TAGS = 65536;
const RESERVED = new Set([
    'think', 'thinking', 'reasoning', 'analysis', 'cot', 'chain-of-thought',
    'toto', 'rabbitmirror', 'rabbit-mirror',
    'script', 'style', 'template', 'noscript', 'iframe', 'object', 'embed',
    'svg', 'math', 'textarea', 'title', 'pre', 'code',
]);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const isSpace = char => char === ' ' || char === '\t' || char === '\r' || char === '\n' || char === '\f';
const isFirstNameChar = char => !!char && ((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z'));
const isNameChar = char => isFirstNameChar(char) || (!!char && char >= '0' && char <= '9') || char === '_' || char === '-' || char === ':';

/** Invalid configurations return [] as a whole, never a silently reduced set. */
export function normalizeEarlyBodyTags(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 8) return [];
    const result = [];
    for (const item of value) {
        if (typeof item !== 'string') return [];
        const name = item.trim().toLowerCase();
        if (!/^[a-z][a-z0-9_:-]{0,63}$/.test(name) || RESERVED.has(name)) return [];
        if (!result.includes(name)) result.push(name);
    }
    return result;
}

function readTag(text, start) {
    let cursor = start + 1;
    const closing = text[cursor] === '/';
    if (closing) cursor++;
    if (!isFirstNameChar(text[cursor])) return null;
    const nameStart = cursor;
    while (cursor < text.length && isNameChar(text[cursor])) cursor++;
    const name = text.slice(nameStart, cursor).toLowerCase();
    if (cursor === text.length) return { incomplete: true, name, closing };
    if (!isSpace(text[cursor]) && text[cursor] !== '>' && text[cursor] !== '/') return null;
    const attributesStart = cursor;
    let quote = '';
    while (cursor < text.length) {
        const char = text[cursor];
        if (quote) {
            if (char === quote) quote = '';
        } else if (char === '"' || char === "'") quote = char;
        else if (char === '>') {
            let last = cursor - 1;
            while (last >= attributesStart && isSpace(text[last])) last--;
            const selfClosing = text[last] === '/';
            const invalidClosing = closing && text.slice(attributesStart, cursor).trim() !== '';
            return { name, closing, selfClosing, invalidClosing, start, end: cursor + 1 };
        }
        cursor++;
    }
    return { incomplete: true, name, closing };
}

function fenceAt(text, start) {
    let cursor = start;
    while (cursor - start < 3 && text[cursor] === ' ') cursor++;
    const char = text[cursor];
    if (char !== '`' && char !== '~') return null;
    const begin = cursor;
    while (text[cursor] === char) cursor++;
    if (cursor - begin < 3) return null;
    return { char, count: cursor - begin, rest: cursor };
}

function rawTextClosingEnd(text, start, name) {
    // Match only an ASCII end-tag token followed by whitespace and >. A generic
    // attribute parser would repeatedly scan overlapping malformed quote tails.
    // Never lowercase the whole source: Unicode folding can change its length.
    let cursor = start;
    while ((cursor = text.indexOf('<', cursor)) >= 0) {
        if (text[cursor + 1] !== '/') { cursor++; continue; }
        let end = cursor + 2, index = 0;
        while (index < name.length && (text.charCodeAt(end + index) | 32) === name.charCodeAt(index)) index++;
        if (index !== name.length) { cursor += 2; continue; }
        end += name.length;
        while (isSpace(text[end])) end++;
        if (text[end] === '>') return end + 1;
        cursor = end;
    }
    return text.length;
}

/**
 * Return null until every selected tag occurs exactly once and closes cleanly.
 * Outer selected bodies are concatenated; nested selected bodies are not copied
 * twice. Exact signatures cover each selected raw range plus its original offset.
 * Ordinary tail appends keep the signature; changed/repeated body tags do not.
 * A null result after dispatch is NOT permission to dispatch again. Callers must
 * keep their existing once-per-operation latch and revalidate before committing.
 */
export function extractClosedBodySnapshot(text, tags) {
    const tagNames = normalizeEarlyBodyTags(tags);
    if (typeof text !== 'string' || !text.length || text.length > EARLY_BODY_MAX_SOURCE_CHARS || !tagNames.length) return null;
    const wanted = new Set(tagNames);
    const seen = new Set();
    const closed = new Set();
    const stack = [];
    const segments = [];
    let selectedDepth = 0;
    let blockedDepth = 0;
    let tagCount = 0;
    let fence = null;
    let cursor = 0;
    while (cursor < text.length) {
        const lineStart = cursor === 0 || text[cursor - 1] === '\n';
        if (lineStart) {
            const marker = fenceAt(text, cursor);
            const lineEnd = text.indexOf('\n', cursor);
            if (fence) {
                if (marker?.char === fence.char && marker.count >= fence.count &&
                    text.slice(marker.rest, lineEnd < 0 ? text.length : lineEnd).trim() === '') fence = null;
                cursor = lineEnd < 0 ? text.length : lineEnd + 1;
                continue;
            }
            if (marker) {
                fence = marker;
                cursor = lineEnd < 0 ? text.length : lineEnd + 1;
                continue;
            }
        }
        const char = text[cursor];
        if (char === '\\') { cursor += Math.min(2, text.length - cursor); continue; }
        if (char === '`') {
            let endRun = cursor + 1;
            while (text[endRun] === '`') endRun++;
            const token = text.slice(cursor, endRun);
            let end = text.indexOf(token, endRun);
            while (end >= 0 && (text[end - 1] === '`' || text[end + token.length] === '`')) end = text.indexOf(token, end + token.length);
            cursor = end < 0 ? text.length : end + token.length;
            continue;
        }
        if (char !== '<') {
            // Walk each run once. Repeated indexOf calls for absent delimiters
            // would rescan the entire tail for every <p>x</p> and become quadratic.
            cursor++;
            if (char !== '\n') while (cursor < text.length) {
                const next = text[cursor];
                if (next === '<' || next === '\n' || next === '`' || next === '\\') break;
                cursor++;
            }
            continue;
        }
        if (text.startsWith('<!--', cursor)) {
            const end = text.indexOf('-->', cursor + 4);
            cursor = end < 0 ? text.length : end + 3;
            continue;
        }
        if (text.startsWith('<![CDATA[', cursor)) {
            const end = text.indexOf(']]>', cursor + 9);
            cursor = end < 0 ? text.length : end + 3;
            continue;
        }
        if (text[cursor + 1] === '!' || text[cursor + 1] === '?') {
            // Declarations/processing instructions can themselves contain quoted
            // tag examples. Treat the entire declaration as non-body markup.
            let quote = '';
            cursor += 2;
            while (cursor < text.length) {
                const next = text[cursor++];
                if (quote) { if (next === quote) quote = ''; }
                else if (next === '"' || next === "'") quote = next;
                else if (next === '>') break;
            }
            continue;
        }
        const tag = readTag(text, cursor);
        if (!tag) { cursor++; continue; }
        if (++tagCount > MAX_TAGS) return null;
        if (tag.incomplete) {
            // An unfinished ordinary status/footer tag does not undo an already
            // closed body. A selected-name prefix could reopen it: stay closed.
            if (selectedDepth || tagNames.some(name => name.startsWith(tag.name))) return null;
            break;
        }
        cursor = tag.end;
        if (tag.invalidClosing) return null;
        if (tag.closing) {
            const top = stack[stack.length - 1];
            if (!top || top.name !== tag.name) return null;
            stack.pop();
            if (top.blocked) blockedDepth--;
            if (top.selected) {
                selectedDepth--;
                closed.add(tag.name);
                if (top.outer) segments.push({ tagName: tag.name, start: top.start, end: tag.end, bodyStart: top.bodyStart, bodyEnd: tag.start });
            }
            continue;
        }
        if (RAW_TEXT.has(tag.name)) {
            // HTML raw-text semantics: text resembling tags inside these elements
            // is not another body. A trailing slash does not close a non-void
            // raw-text element. No script/style content is interpreted.
            cursor = rawTextClosingEnd(text, cursor, tag.name);
            continue;
        }
        const selected = blockedDepth === 0 && wanted.has(tag.name);
        if (selected && (seen.has(tag.name) || tag.selfClosing || VOID.has(tag.name))) return null;
        if (tag.selfClosing || VOID.has(tag.name)) continue;
        const blocked = RESERVED.has(tag.name);
        if (selected) seen.add(tag.name);
        stack.push({ name: tag.name, blocked, selected, outer: selected && selectedDepth === 0, start: tag.start, bodyStart: tag.end });
        if (stack.length > MAX_DEPTH) return null;
        if (blocked) blockedDepth++;
        if (selected) selectedDepth++;
    }
    if (selectedDepth || seen.size !== tagNames.length || closed.size !== tagNames.length || !segments.length) return null;
    segments.sort((a, b) => a.start - b.start);
    const body = segments.map(segment => text.slice(segment.bodyStart, segment.bodyEnd)).join('\n\n');
    if (!body.trim()) return null;
    return {
        body,
        signature: JSON.stringify([tagNames, segments.map(segment => [segment.start, text.slice(segment.start, segment.end)])]),
        sourceEnd: segments[segments.length - 1].end,
        segments,
        tagNames,
    };
}
