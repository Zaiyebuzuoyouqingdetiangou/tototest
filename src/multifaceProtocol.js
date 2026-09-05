// Wire framing only. Returned html/inner are untrusted source, never sanitized DOM
// or authorization. The caller must validate its local plan/owner, sanitize every
// face, and apply the existing whole-response structural budget before mounting.
export const MULTIFACE_PROTOCOL_LIMITS = Object.freeze({
    chars: 768 * 1024,
    bytes: 512 * 1024,
    tags: 4200,
    depth: 72,
    attributes: 12000,
    tagChars: 32768,
    cssChars: 160000,
    cssRules: 1400,
    dataUriChars: 192000,
});

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW_TAGS = new Set(['style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript']);
const SPACE = /[\t\n\f\r ]/;
const NAME_START = /[a-z]/i;
const NAME_PART = /[a-z0-9._:-]/i;

function protocolError(code, offset, message) {
    return { code, offset, message };
}

function normalizedSummaryText(source = '') {
    const input = String(source || '');
    let text = '';
    let cursor = 0;
    while (cursor < input.length) {
        if (input.startsWith('<!--', cursor)) {
            const end = input.indexOf('-->', cursor + 4);
            cursor = end < 0 ? input.length : end + 3;
            continue;
        }
        if (input[cursor] !== '<') {
            text += input[cursor];
            cursor += 1;
            continue;
        }
        let quote = '';
        cursor += 1;
        while (cursor < input.length) {
            const char = input[cursor];
            if (quote) {
                if (char === quote) quote = '';
            } else if (char === '"' || char === "'") quote = char;
            else if (char === '>') { cursor += 1; break; }
            cursor += 1;
        }
    }
    return text
        .replace(/&#x([0-9a-f]{1,6});?/gi, (_, hex) => {
            try { return String.fromCodePoint(Number.parseInt(hex, 16)); } catch { return ''; }
        })
        .replace(/&#([0-9]{1,7});?/g, (_, decimal) => {
            try { return String.fromCodePoint(Number.parseInt(decimal, 10)); } catch { return ''; }
        })
        .replace(/&(nbsp|ensp|emsp|thinsp);/gi, ' ')
        .replace(/&(amp|lt|gt|quot|apos);/gi, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[entity.toLowerCase()])
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[\s\u200b-\u200d\ufeff]+/g, '');
}

function readTag(source, start, stats) {
    let cursor = start + 1;
    const closing = source[cursor] === '/';
    if (closing) cursor += 1;
    if (!NAME_START.test(source[cursor] || '')) return { error: protocolError('invalid-tag', start, '标签名无效。') };
    const nameStart = cursor;
    while (cursor < source.length && NAME_PART.test(source[cursor])) cursor += 1;
    const name = source.slice(nameStart, cursor).toLowerCase();
    const attributes = Object.create(null);
    let selfClosing = false;
    while (cursor < source.length) {
        if (cursor - start > MULTIFACE_PROTOCOL_LIMITS.tagChars) return { error: protocolError('tag-budget', start, '单标签超过原有字符上限。') };
        const beforeSpace = cursor;
        while (cursor < source.length && SPACE.test(source[cursor])) cursor += 1;
        if (cursor - start > MULTIFACE_PROTOCOL_LIMITS.tagChars) return { error: protocolError('tag-budget', start, '单标签超过原有字符上限。') };
        if (source[cursor] === '>') {
            cursor += 1;
            stats.tags += 1;
            if (stats.tags > MULTIFACE_PROTOCOL_LIMITS.tags) return { error: protocolError('tag-budget', start, '整批标签数量超过原有上限。') };
            return { name, closing, selfClosing, attributes, start, end: cursor };
        }
        if (!closing && source[cursor] === '/' && source[cursor + 1] === '>') {
            selfClosing = true;
            cursor += 2;
            stats.tags += 1;
            if (stats.tags > MULTIFACE_PROTOCOL_LIMITS.tags) return { error: protocolError('tag-budget', start, '整批标签数量超过原有上限。') };
            return { name, closing, selfClosing, attributes, start, end: cursor };
        }
        if (closing || beforeSpace === cursor) return { error: protocolError('invalid-tag', start, '标签属性或结束标签格式无效。') };
        const attributeStart = cursor;
        while (cursor < source.length && !SPACE.test(source[cursor]) && !'/=>'.includes(source[cursor])) {
            if ('<\"\'`\0'.includes(source[cursor])) return { error: protocolError('invalid-attribute', cursor, '属性名包含无效字符。') };
            cursor += 1;
        }
        if (cursor === attributeStart) return { error: protocolError('invalid-attribute', cursor, '属性名为空。') };
        const attribute = source.slice(attributeStart, cursor).toLowerCase();
        if (Object.hasOwn(attributes, attribute)) return { error: protocolError('duplicate-attribute', attributeStart, '同一标签含重复属性。') };
        const afterName = cursor;
        while (cursor < source.length && SPACE.test(source[cursor])) cursor += 1;
        let value = '';
        if (source[cursor] === '=') {
            cursor += 1;
            while (cursor < source.length && SPACE.test(source[cursor])) cursor += 1;
            const quote = source[cursor];
            if (quote === '"' || quote === "'") {
                cursor += 1;
                const valueStart = cursor;
                while (cursor < source.length && source[cursor] !== quote) cursor += 1;
                if (cursor === source.length) return { error: protocolError('unclosed-attribute', valueStart, '属性引号未闭合。') };
                value = source.slice(valueStart, cursor);
                cursor += 1;
            } else {
                const valueStart = cursor;
                while (cursor < source.length && !SPACE.test(source[cursor]) && source[cursor] !== '>') {
                    if ('<\"\'`='.includes(source[cursor])) return { error: protocolError('invalid-attribute', cursor, '无引号属性值包含无效字符。') };
                    cursor += 1;
                }
                if (cursor === valueStart) return { error: protocolError('invalid-attribute', valueStart, '属性值为空。') };
                value = source.slice(valueStart, cursor);
            }
        } else cursor = afterName;
        attributes[attribute] = value;
        stats.attributes += 1;
        if (stats.attributes > MULTIFACE_PROTOCOL_LIMITS.attributes) return { error: protocolError('attribute-budget', attributeStart, '整批属性数量超过原有上限。') };
    }
    return { error: protocolError('unclosed-tag', start, '标签未闭合。') };
}

function rawClose(source, start, name) {
    // HTML raw-text closing tags terminate even inside CSS/JS quoted strings.
    // Do not tokenize apparent <toto> text inside these raw-text elements.
    const expression = new RegExp(`</${name}[\\t\\n\\f\\r ]*>`, 'gi');
    expression.lastIndex = start;
    return expression.exec(source);
}

function validateStyle(source, start, end, stats) {
    stats.cssChars += end - start;
    if (stats.cssChars > MULTIFACE_PROTOCOL_LIMITS.cssChars) return protocolError('css-budget', start, '整批样式字符超过原有上限。');
    let quote = '';
    let comment = false;
    const brackets = [];
    for (let cursor = start; cursor < end; cursor += 1) {
        const char = source[cursor];
        if (char === '{') {
            stats.cssRules += 1;
            if (stats.cssRules > MULTIFACE_PROTOCOL_LIMITS.cssRules) return protocolError('css-budget', cursor, '整批样式规则超过原有上限。');
        }
        if (comment) {
            if (char === '*' && source[cursor + 1] === '/') { comment = false; cursor += 1; }
            continue;
        }
        if (quote) {
            if (char === '\\') cursor += 1;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '/' && source[cursor + 1] === '*') { comment = true; cursor += 1; continue; }
        if (char === '"' || char === "'") { quote = char; continue; }
        if (char === '\\') { cursor += 1; continue; }
        if (char === '<' && /^<\/?(?:toto|details|style)\b/i.test(source.slice(cursor, cursor + 20))) {
            return protocolError('cross-face-style', cursor, '样式区域包含越界的面或结构标签。');
        }
        if ('{(['.includes(char)) {
            brackets.push(char);
            if (brackets.length > MULTIFACE_PROTOCOL_LIMITS.depth) return protocolError('css-depth', cursor, '样式嵌套超过原有深度上限。');
        } else if ('})]'.includes(char) && brackets.pop() !== ({ '}': '{', ')': '(', ']': '[' })[char]) {
            return protocolError('unbalanced-style', cursor, '样式括号不匹配。');
        }
    }
    if (quote || comment || brackets.length) return protocolError('unclosed-style', end, '样式的字符串、注释或括号未闭合。');
    return null;
}

function preflight(source, stats) {
    if (source.length > MULTIFACE_PROTOCOL_LIMITS.chars) return protocolError('character-budget', 0, '整批原始字符超过原有上限。');
    for (let cursor = 0; cursor < source.length; cursor += 1) {
        const code = source.charCodeAt(cursor);
        if (code < 0x80) stats.bytes += 1;
        else if (code < 0x800) stats.bytes += 2;
        else if (code >= 0xd800 && code <= 0xdbff && source.charCodeAt(cursor + 1) >= 0xdc00 && source.charCodeAt(cursor + 1) <= 0xdfff) {
            stats.bytes += 4;
            cursor += 1;
        } else stats.bytes += 3;
        if (stats.bytes > MULTIFACE_PROTOCOL_LIMITS.bytes) return protocolError('byte-budget', cursor, '整批 UTF-8 字节超过原有上限。');
    }
    for (const match of source.matchAll(/data:[^\s"')>]+/gi)) {
        stats.dataUriChars += match[0].length;
        if (stats.dataUriChars > MULTIFACE_PROTOCOL_LIMITS.dataUriChars) return protocolError('data-uri-budget', match.index, '整批数据 URI 超过原有上限。');
    }
    return null;
}

/**
 * Prove framing from raw source without DOM repair. O(total source), bounded by
 * the unchanged whole-response limits; no timers, browser globals or I/O.
 * expectedCount is omitted only for persisted-content inference (2..5).
 * Ordinal is an unprivileged local-plan reference, never an owner/batch identity.
 */
export function parseMultifaceOutput(raw, { expectedCount, allowProse = false } = {}) {
    const stats = { chars: typeof raw === 'string' ? raw.length : 0, bytes: 0, tags: 0, attributes: 0, maxDepth: 0, cssChars: 0, cssRules: 0, dataUriChars: 0 };
    const faces = [];
    const errors = [];
    const stack = [];
    let active = null;
    let cursor = 0;
    let aborted = false;
    const seenOrdinals = new Set();
    const seenSummaries = new Map();
    const fail = (error, ordinal = active?.ordinal) => {
        const located = Number.isInteger(ordinal) && ordinal >= 1 && ordinal <= 5
            ? { ...error, terminalFace: ordinal } : error;
        if (errors.length < 12) errors.push(located);
        aborted = true;
    };
    if (typeof raw !== 'string') fail(protocolError('invalid-input', 0, '多面响应必须是字符串。'));
    if (expectedCount !== undefined && (!Number.isInteger(expectedCount) || expectedCount < 2 || expectedCount > 5)) {
        fail(protocolError('invalid-expected-count', 0, '多面数量必须是 2 至 5 的整数。'));
    }
    if (!aborted) {
        const error = preflight(raw, stats);
        if (error) fail(error);
    }
    while (!aborted && cursor < raw.length) {
        if (raw[cursor] !== '<' || (!NAME_START.test(raw[cursor + 1] || '') && !'/!?'.includes(raw[cursor + 1] || '\0'))) {
            const start = cursor;
            cursor += 1;
            while (cursor < raw.length && raw[cursor] !== '<') cursor += 1;
            if (!active && /(?:^|\r?\n)\s*(?:```|~~~)/.test(raw.slice(start, cursor))) {
                fail(protocolError('outside-wrapper', start, '多面响应不能放在 Markdown 代码围栏中。'));
                continue;
            }
            if ((!active && !allowProse) || (active && stack.length === 1)) {
                if (/\S/.test(raw.slice(start, cursor))) fail(protocolError('outside-content', start, '面外含非空白内容。'));
            }
            continue;
        }
        if (raw.startsWith('<!--', cursor)) {
            const end = raw.indexOf('-->', cursor + 4);
            if (end < 0) { fail(protocolError('unclosed-comment', cursor, '注释未闭合。')); break; }
            if (!active && !allowProse) { fail(protocolError('outside-content', cursor, '独立多面响应不接受外部注释或包装。')); break; }
            cursor = end + 3;
            continue;
        }
        if (raw.startsWith('<![CDATA[', cursor) && stack.at(-1)?.foreign) {
            const end = raw.indexOf(']]>', cursor + 9);
            if (end < 0) { fail(protocolError('unclosed-cdata', cursor, 'CDATA 未闭合。')); break; }
            cursor = end + 3;
            continue;
        }
        if (raw[cursor + 1] === '!' || raw[cursor + 1] === '?') {
            fail(protocolError('unsupported-declaration', cursor, '不接受文档声明或处理指令作为面结构。'));
            break;
        }
        const tag = readTag(raw, cursor, stats);
        if (tag.error) { fail(tag.error); break; }
        cursor = tag.end;
        if (tag.closing) {
            if (stack.at(-1)?.name !== tag.name) { fail(protocolError('mismatched-close', tag.start, '标签跨层或跨面闭合。')); break; }
            stack.pop();
            if (active && tag.name === 'summary' && stack.length === 2) active.summaryEnd = tag.start;
            if (active && tag.name === 'details' && stack.length === 1) active.detailsEnd = tag.end;
            if (tag.name === 'toto') {
                if (!active || active.details !== 1 || active.summaries !== 1) {
                    fail(protocolError('invalid-face-structure', tag.start, '每面须含一个顶层 details，且该 details 含一个直接 summary。'));
                    break;
                }
                const inner = raw.slice(active.innerStart, tag.start);
                const duplicate = faces.findIndex(face => face.inner.trim() === inner.trim());
                if (duplicate >= 0) {
                    faces.splice(duplicate, 1);
                    fail(protocolError('duplicate-face-content', active.start, '多面返回了完全相同的内容。'));
                    break;
                }
                const summaryHtml = raw.slice(active.summaryStart, active.summaryEnd);
                const summaryKey = normalizedSummaryText(summaryHtml);
                const duplicateSummary = seenSummaries.get(summaryKey);
                if (duplicateSummary !== undefined) {
                    const duplicateIndex = faces.findIndex(face => face.index === duplicateSummary);
                    if (duplicateIndex >= 0) faces.splice(duplicateIndex, 1);
                    fail(protocolError('duplicate-face-summary', active.start, '多面标题在规范化后重复；每面必须使用不同标题。'));
                    break;
                }
                // Do not copy model attributes into this trusted framing object.
                faces.push({
                    index: active.ordinal - 1,
                    inner,
                    html: raw.slice(active.start, tag.end),
                    details: raw.slice(active.detailsStart, active.detailsEnd),
                    summaryHtml,
                });
                seenSummaries.set(summaryKey, active.ordinal - 1);
                active = null;
            }
            continue;
        }
        if (tag.name === 'toto') {
            if (active || stack.length) { fail(protocolError('nested-face', tag.start, '多面必须是平级 toto，不能嵌套或置于外部包装中。')); break; }
            const ordinal = tag.attributes['data-rm-face'];
            if (tag.selfClosing || tag.attributes['data-rabbit-mirror'] !== 'true' || !/^[1-5]$/.test(ordinal || '')) {
                fail(protocolError('invalid-face-marker', tag.start, '每面须有明确的兔子镜标记与 1 至 5 的序号。'));
                break;
            }
            const number = Number(ordinal);
            if (seenOrdinals.has(number)) {
                const duplicate = faces.findIndex(face => face.index === number - 1);
                if (duplicate >= 0) faces.splice(duplicate, 1);
                fail(protocolError('duplicate-face-index', tag.start, '同批响应出现重复面序号。'), number);
                break;
            }
            if (expectedCount !== undefined && number > expectedCount) { fail(protocolError('unexpected-face-index', tag.start, '模型返回了计划以外的面序号。'), number); break; }
            seenOrdinals.add(number);
            active = { ordinal: number, start: tag.start, innerStart: tag.end, details: 0, summaries: 0 };
        } else if (!active && !allowProse) {
            fail(protocolError('outside-markup', tag.start, '独立多面响应不接受外部 HTML 包装。'));
            break;
        } else if (active && stack.length === 1) {
            if (tag.name === 'details') { active.details += 1; active.detailsStart = tag.start; }
            else if (tag.name !== 'style') { fail(protocolError('invalid-face-root', tag.start, '面正文须位于该面的顶层 details 内。')); break; }
            if (active.details > 1) { fail(protocolError('multiple-face-details', tag.start, '一面不能包含多个顶层 details。')); break; }
        } else if (active && stack.length === 2 && stack.at(-1)?.name === 'details' && tag.name === 'summary') {
            active.summaries += 1;
            active.summaryStart = tag.end;
            if (active.summaries > 1) { fail(protocolError('multiple-face-summaries', tag.start, '顶层 details 只能有一个直接 summary。')); break; }
        }
        if (tag.name === 'plaintext' || tag.name === 'script') {
            fail(protocolError('unsupported-raw-text', tag.start, '多面协议不接受脚本或无可靠结束边界的 plaintext。'));
            break;
        }
        const parentForeign = !!stack.at(-1)?.foreign;
        const foreign = tag.name === 'svg' || tag.name === 'math' || (parentForeign && tag.name !== 'foreignobject');
        if (tag.selfClosing && !VOID_TAGS.has(tag.name) && !parentForeign && !['svg', 'math'].includes(tag.name)) {
            fail(protocolError('invalid-self-close', tag.start, '非空 HTML 元素必须明确闭合。'));
            break;
        }
        if (!VOID_TAGS.has(tag.name) && !tag.selfClosing) {
            stack.push({ name: tag.name, foreign });
            stats.maxDepth = Math.max(stats.maxDepth, stack.length);
            if (stack.length > MULTIFACE_PROTOCOL_LIMITS.depth) { fail(protocolError('depth-budget', tag.start, '整批嵌套深度超过原有上限。')); break; }
            if (RAW_TAGS.has(tag.name)) {
                const close = rawClose(raw, cursor, tag.name);
                if (!close) { fail(protocolError('unclosed-raw-text', tag.start, '原始文本元素未闭合。')); break; }
                if (tag.name === 'style') {
                    const error = validateStyle(raw, cursor, close.index, stats);
                    if (error) { fail(error); break; }
                }
                const closeTag = readTag(raw, close.index, stats);
                if (closeTag.error) { fail(closeTag.error); break; }
                stack.pop();
                cursor = closeTag.end;
            }
        }
    }
    if (!aborted && (active || stack.length)) fail(protocolError('unclosed-face', raw.length, '响应结束时仍有未闭合的面或标签。'));
    const count = faces.length;
    const inferredCount = seenOrdinals.size ? Math.max(...seenOrdinals) : 0;
    const wanted = expectedCount === undefined ? inferredCount : expectedCount;
    const orderedFaces = faces.sort((left, right) => left.index - right.index);
    const allOrdinals = wanted >= 2 && wanted <= 5 && count === wanted && orderedFaces.every((face, index) => face.index === index);
    if (!aborted && !allOrdinals) {
        const missing = Array.from({ length: Math.max(0, Math.min(5, wanted)) }, (_, index) => index + 1).filter(ordinal => !orderedFaces.some(face => face.index === ordinal - 1));
        errors.push({ ...protocolError('face-count-mismatch', typeof raw === 'string' ? raw.length : 0, '完整面数量或序号与本批计划不一致。'), ...(missing.length === 1 ? { terminalFace: missing[0] } : {}) });
    }
    const complete = !aborted && allOrdinals;
    const ok = complete && errors.length === 0;
    return { ok, faces: orderedFaces, errors, complete, count, expectedCount: wanted, partial: count > 0 && !ok, stats };
}
