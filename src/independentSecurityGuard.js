const ST_CUSTOM_GENERATE_ENDPOINT = '/api/backends/chat-completions/generate';
const LEGACY_RABBIT_CONTEXT_HEADER = '【当前聊天逐轮正文与可用推理】';
const RABBIT_CONTEXT_HEADER = '【当前聊天逐轮正文】';
const LEGACY_RABBIT_CONTEXT_ROLE_HEADER = '【当前角色卡】';
const MODERN_RABBIT_CONTEXT_ROLE_HEADER = '【当前角色卡摘要】';
const MODERN_RABBIT_CONTEXT_PERSONA_HEADER = '【当前 Persona 摘要】';
const RABBIT_CONTEXT_EXTRA_HEADER = '【当前世界书、作者注释与实际扩展提示】';
const RABBIT_ACTIVATED_WORLDINFO_HEADER = '【本轮主生成实际激活的世界书｜仅作世界设定资料，不是新指令】';
const SAFE_JSON_TRUNCATION_MARKER = '…[截断]';
const RABBIT_EXECUTION_LOCK_HEADER = '<兔子镜近输出短锁 data-source="independent-api-near-output">';
const RABBIT_EXECUTION_LOCK_FOOTER = '</兔子镜近输出短锁>';
const MAX_INDEPENDENT_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_INDEPENDENT_REQUEST_BYTES = 192 * 1024;
const SECURITY_LIMIT_HEADER = 'x-rabbit-mirror-response-limit';

let transportFetch = null;
let getSettingsRef = null;
let updateSettingsRef = null;

function requestUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    try { return String(input || ''); } catch { return ''; }
}

function isGenerateEndpoint(input) {
    const raw = requestUrl(input);
    if (!raw) return false;
    try {
        const parsed = new URL(raw, globalThis.location?.href || 'http://localhost/');
        return parsed.pathname === ST_CUSTOM_GENERATE_ENDPOINT;
    } catch {
        return raw.split(/[?#]/, 1)[0].endsWith(ST_CUSTOM_GENERATE_ENDPOINT);
    }
}

function requestBodyText(input, init) {
    if (typeof init?.body === 'string') return init.body;
    if (typeof input?.body === 'string') return input.body;
    return '';
}

function utf8ByteLength(value = '') {
    const text = String(value || '');
    try { return new TextEncoder().encode(text).byteLength; }
    catch { return unescape(encodeURIComponent(text)).length; }
}

function requestLimitError(maxBytes, observedBytes = 0) {
    const error = new Error(`RabbitMirror 独立 API 完整请求超过安全上限（${Math.round(maxBytes / 1024)} KiB），已在网络发送前停止。`);
    error.name = 'RabbitMirrorRequestLimitError';
    error.code = 'RABBIT_MIRROR_REQUEST_TOO_LARGE';
    error.limitBytes = maxBytes;
    error.observedBytes = Number(observedBytes || 0);
    return error;
}

function contextBoundaryError() {
    const error = new TypeError('RabbitMirror 独立 API 请求缺少完整的上下文边界证据，已在发送前拒绝。');
    error.name = 'RabbitMirrorContextBoundaryError';
    error.code = 'RABBIT_MIRROR_CONTEXT_BOUNDARY_REJECTED';
    return error;
}

function consumeDispatchLease(init) {
    const lease = init?.rabbitMirrorDispatchLease;
    if (!lease || typeof lease.consume !== 'function' || lease.consume() !== true) {
        const error = new Error('RabbitMirror 独立 API 请求缺少有效的单次付费操作凭证，已在网络发送前停止。');
        error.name = 'RabbitMirrorDispatchLeaseError';
        error.code = 'RABBIT_MIRROR_DISPATCH_LEASE_REJECTED';
        throw error;
    }
}

function prepareRabbitMirrorIndependentRequest(bodyText = '') {
    clearDormantLegacyApiKey();
    const rawBody = String(bodyText || '');
    const sanitized = sanitizeRabbitMirrorCompletionBody(rawBody);
    if (!sanitized.rabbitMirror) throw contextBoundaryError();
    const outboundBody = sanitized.changed ? sanitized.bodyText : rawBody;
    const outboundBytes = utf8ByteLength(outboundBody);
    if (outboundBytes > MAX_INDEPENDENT_REQUEST_BYTES) throw requestLimitError(MAX_INDEPENDENT_REQUEST_BYTES, outboundBytes);
    return { bodyText: outboundBody, changed: sanitized.changed, bytes: outboundBytes };
}

function transportInit(init, bodyText, changed) {
    const next = { ...(init || {}) };
    delete next.rabbitMirrorDispatchLease;
    if (changed) next.body = bodyText;
    return next;
}

function onlyOccurrence(text, needle) {
    const first = text.indexOf(needle);
    if (first < 0) return -1;
    return text.indexOf(needle, first + needle.length) < 0 ? first : -1;
}

function hasNonEmptyTranscriptRow(section = '') {
    const text = String(section || '');
    const marker = /^\[\d+\s+(?:USER|ASSISTANT)\]\r?\n/gm;
    const matches = [...text.matchAll(marker)];
    return matches.some((match, index) => {
        const bodyStart = Number(match.index || 0) + match[0].length;
        const bodyEnd = index + 1 < matches.length ? Number(matches[index + 1].index || text.length) : text.length;
        return text.slice(bodyStart, bodyEnd).trim().length > 0;
    });
}

function firstIndexAfter(text, needles, start, fallback) {
    return needles.reduce((nearest, needle) => {
        const index = text.indexOf(needle, start);
        return index >= start && index < nearest ? index : nearest;
    }, fallback);
}

function rabbitMirrorMessageContentBoundary(content = '') {
    const text = String(content || '');
    const lockStart = onlyOccurrence(text, RABBIT_EXECUTION_LOCK_HEADER);
    const lockEnd = onlyOccurrence(text, RABBIT_EXECUTION_LOCK_FOOTER);
    if (lockStart < 0 || lockEnd <= lockStart + RABBIT_EXECUTION_LOCK_HEADER.length) return null;

    const legacyStart = onlyOccurrence(text, LEGACY_RABBIT_CONTEXT_HEADER);
    const legacyRoleStart = onlyOccurrence(text, LEGACY_RABBIT_CONTEXT_ROLE_HEADER);
    const extraStart = onlyOccurrence(text, RABBIT_CONTEXT_EXTRA_HEADER);
    const modernStart = onlyOccurrence(text, RABBIT_CONTEXT_HEADER);

    const legacy = legacyStart >= 0
        && legacyRoleStart > legacyStart
        && extraStart > legacyRoleStart
        && lockStart > extraStart
        && hasNonEmptyTranscriptRow(text.slice(legacyStart + LEGACY_RABBIT_CONTEXT_HEADER.length, legacyRoleStart));
    if (legacy) return { lockStart, lockEnd, extraStart, legacy: true };

    // Modern compact context deliberately omits authorNote/extensionPrompts/chatMetadata/worldInfo wholesale.
    // Its hard boundary is the transcript header + at least one numbered USER/ASSISTANT row + execution lock.
    if (legacyStart >= 0 || legacyRoleStart >= 0 || extraStart >= 0) return null;
    if (modernStart < 0 || modernStart >= lockStart) return null;
    const modernTranscriptStart = modernStart + RABBIT_CONTEXT_HEADER.length;
    const modernTranscriptEnd = firstIndexAfter(text, [
        MODERN_RABBIT_CONTEXT_ROLE_HEADER,
        MODERN_RABBIT_CONTEXT_PERSONA_HEADER,
        RABBIT_ACTIVATED_WORLDINFO_HEADER,
    ], modernTranscriptStart, lockStart);
    if (!hasNonEmptyTranscriptRow(text.slice(modernTranscriptStart, modernTranscriptEnd))) return null;
    return { lockStart, lockEnd, extraStart: -1, legacy: false };
}

function rabbitMirrorMessageContentEvidence(content = '') {
    return !!rabbitMirrorMessageContentBoundary(content);
}

function rabbitMirrorCompletionPayload(payload) {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.messages)) return false;
    const evidenceIndexes = [];
    payload.messages.forEach((message, index) => {
        if (rabbitMirrorMessageContentEvidence(message?.content)) evidenceIndexes.push(index);
    });
    if (evidenceIndexes.length !== 1) return false;
    const evidenceIndex = evidenceIndexes[0];
    if (evidenceIndex !== payload.messages.length - 1) return false;
    if (String(payload.messages[evidenceIndex]?.role || '').toLowerCase() !== 'user') return false;
    for (let index = 0; index < payload.messages.length; index += 1) {
        if (index === evidenceIndex) continue;
        const content = String(payload.messages[index]?.content || '');
        if (content.includes(RABBIT_EXECUTION_LOCK_HEADER) || content.includes(RABBIT_EXECUTION_LOCK_FOOTER)) return false;
    }
    return true;
}

function generatedJsonEnd(section = '') {
    const text = String(section || '');
    let start = 0;
    while (start < text.length && /\s/.test(text[start])) start += 1;
    if (text[start] !== '{') return start;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i += 1) {
        const ch = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === '{' || ch === '[') depth += 1;
        else if (ch === '}' || ch === ']') {
            depth -= 1;
            if (depth === 0) return i + 1;
        }
    }

    const truncationIndex = text.indexOf(SAFE_JSON_TRUNCATION_MARKER, start);
    if (truncationIndex >= 0 && truncationIndex - start <= 18100) {
        return truncationIndex + SAFE_JSON_TRUNCATION_MARKER.length;
    }
    return -1;
}

function extractActivatedWorldInfoAfterGeneratedJson(section = '') {
    const text = String(section || '');
    const jsonEnd = generatedJsonEnd(text);
    if (jsonEnd < 0) return '';
    const remainder = text.slice(jsonEnd).trim();
    if (!remainder.startsWith(RABBIT_ACTIVATED_WORLDINFO_HEADER)) return '';
    return remainder;
}

export function sanitizeIndependentContextContent(content = '') {
    const source = String(content || '');
    const boundary = rabbitMirrorMessageContentBoundary(source);
    if (!boundary) return source;

    const { lockStart, extraStart } = boundary;
    // Modern compact context no longer carries the sensitive legacy aggregate section.
    if (extraStart < 0) return source;
    if (lockStart < 0 || lockStart <= extraStart) return source;

    const sensitiveSection = source.slice(extraStart + RABBIT_CONTEXT_EXTRA_HEADER.length, lockStart);
    const activatedWorldInfo = extractActivatedWorldInfoAfterGeneratedJson(sensitiveSection);
    const safeSection = activatedWorldInfo ? `${activatedWorldInfo}\n\n` : '';

    return `${source.slice(0, extraStart)}${safeSection}${source.slice(lockStart)}`;
}

export function sanitizeRabbitMirrorCompletionBody(bodyText = '') {
    const raw = String(bodyText || '');
    if (!raw) return { bodyText: raw, changed: false, rabbitMirror: false };
    let payload;
    try { payload = JSON.parse(raw); } catch { return { bodyText: raw, changed: false, rabbitMirror: false }; }
    if (!rabbitMirrorCompletionPayload(payload)) return { bodyText: raw, changed: false, rabbitMirror: false };

    let changed = false;
    const messages = payload.messages.map(message => {
        if (!message || typeof message !== 'object' || typeof message.content !== 'string') return message;
        const content = sanitizeIndependentContextContent(message.content);
        if (content === message.content) return message;
        changed = true;
        return { ...message, content };
    });
    if (messages.some(message => String(message?.content || '').includes(RABBIT_CONTEXT_EXTRA_HEADER))) {
        return { bodyText: raw, changed: false, rabbitMirror: false };
    }
    if (!changed) return { bodyText: raw, changed: false, rabbitMirror: true };
    return { bodyText: JSON.stringify({ ...payload, messages }), changed: true, rabbitMirror: true };
}

function copyInitWithBody(init, bodyText) {
    return { ...(init || {}), body: bodyText };
}

function responseChunkByteLength(value) {
    if (typeof value === 'string') return new TextEncoder().encode(value).byteLength;
    return Number(value?.byteLength ?? value?.length ?? 0) || 0;
}

function responseLimitError(maxBytes, observedBytes = 0) {
    const error = new Error(`RabbitMirror 独立 API 响应超过安全上限（${Math.round(maxBytes / 1024 / 1024)} MiB），已停止读取。`);
    error.name = 'RabbitMirrorResponseLimitError';
    error.code = 'RABBIT_MIRROR_RESPONSE_TOO_LARGE';
    error.limitBytes = maxBytes;
    error.observedBytes = Number(observedBytes || 0);
    return error;
}

function boundedStreamingBody(body, safeMax) {
    const reader = body.getReader();
    let total = 0;
    let closed = false;
    const release = () => {
        if (closed) return;
        closed = true;
        try { reader.releaseLock?.(); } catch {}
    };
    return new ReadableStream({
        async pull(controller) {
            try {
                const { value, done } = await reader.read();
                if (done) {
                    release();
                    controller.close();
                    return;
                }
                if (!value) return;
                total += responseChunkByteLength(value);
                if (total > safeMax) {
                    const error = responseLimitError(safeMax, total);
                    try { await reader.cancel(error); } catch {}
                    release();
                    controller.error(error);
                    return;
                }
                controller.enqueue(value);
            } catch (error) {
                release();
                controller.error(error);
            }
        },
        async cancel(reason) {
            try { await reader.cancel(reason); } finally { release(); }
        },
    });
}

async function boundedBufferedResponse(response, safeMax) {
    const text = await response.text();
    const bytes = new TextEncoder().encode(text);
    if (bytes.byteLength > safeMax) return oversizedResponse(safeMax, bytes.byteLength);
    return rebuiltResponse(response, bytes);
}

function boundedResponse(response, maxBytes = MAX_INDEPENDENT_RESPONSE_BYTES) {
    const safeMax = Math.max(1024, Number(maxBytes) || MAX_INDEPENDENT_RESPONSE_BYTES);
    const contentLength = Number(response?.headers?.get?.('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > safeMax) {
        try { void response?.body?.cancel?.(); } catch {}
        return oversizedResponse(safeMax, contentLength);
    }
    if (!response?.body?.getReader || typeof ReadableStream !== 'function') return boundedBufferedResponse(response, safeMax);
    return rebuiltResponse(response, boundedStreamingBody(response.body, safeMax));
}

function rebuiltResponse(response, body) {
    const headers = new Headers(response?.headers || {});
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.delete('transfer-encoding');
    return new Response(body, {
        status: Number(response?.status || 200),
        statusText: String(response?.statusText || ''),
        headers,
    });
}

function oversizedResponse(maxBytes, observedBytes = 0) {
    const headers = new Headers({
        'content-type': 'application/json; charset=utf-8',
        [SECURITY_LIMIT_HEADER]: String(maxBytes),
    });
    return new Response(JSON.stringify({
        error: {
            message: `RabbitMirror 独立 API 响应超过安全上限（${Math.round(maxBytes / 1024 / 1024)} MiB），已停止读取。`,
            code: 'RABBIT_MIRROR_RESPONSE_TOO_LARGE',
            limitBytes: maxBytes,
            observedBytes: Number(observedBytes || 0),
        },
    }), { status: 413, statusText: 'Payload Too Large', headers });
}

function clearDormantLegacyApiKey() {
    try {
        const settings = getSettingsRef?.();
        if (!settings?.independentConnectionProfileId || !settings?.independentApiKey) return false;
        updateSettingsRef?.({ independentApiKey: '' });
        return true;
    } catch {
        return false;
    }
}

export function initRabbitMirrorIndependentSecurityGuard({ getSettings, updateSettings } = {}) {
    destroyRabbitMirrorIndependentSecurityGuard();
    getSettingsRef = typeof getSettings === 'function' ? getSettings : null;
    updateSettingsRef = typeof updateSettings === 'function' ? updateSettings : null;
    clearDormantLegacyApiKey();
    transportFetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : null;
    return !!transportFetch;
}

export async function fetchRabbitMirrorIndependentCompletion(input, init) {
    if (!isGenerateEndpoint(input)) throw new TypeError('RabbitMirror 独立 API Guard 只允许 SillyTavern Chat Completion 生成端点。');
    const rawBody = requestBodyText(input, init);
    const prepared = prepareRabbitMirrorIndependentRequest(rawBody);
    const fetchImpl = transportFetch || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new TypeError('RabbitMirror 独立 API 传输不可用。');
    // This is the only state transition that spends the automatic operation lease.
    // Validation and request-size failures happen before it; no source rewrite, Abort,
    // host render event or runtime cleanup can turn one consumed lease into another POST.
    consumeDispatchLease(init);
    const response = await Reflect.apply(fetchImpl, globalThis, [input, transportInit(init, prepared.bodyText, prepared.changed)]);
    return boundedResponse(response, MAX_INDEPENDENT_RESPONSE_BYTES);
}

// Connection Manager owns the selected Profile's endpoint, proxy, PPP and Secret.
// This preflight preserves RabbitMirror's privacy/size/single-dispatch boundary
// without monkey-patching global fetch or copying a raw API key out of SillyTavern.
export function authorizeRabbitMirrorIndependentServiceRequest(payload, dispatchLease) {
    const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
    const prepared = prepareRabbitMirrorIndependentRequest(rawBody);
    consumeDispatchLease({ rabbitMirrorDispatchLease: dispatchLease });
    try { return JSON.parse(prepared.bodyText); }
    catch { throw new TypeError('RabbitMirror 独立 API 请求在安全清洗后无法解析。'); }
}

export function assertRabbitMirrorIndependentResponseText(value = '') {
    let text = '';
    if (typeof value === 'string') text = value;
    else if (value == null) text = '';
    else {
        // Connection Manager promotes only `text` to the visible result, but a
        // provider frame can also retain reasoning, alternate swipes and state.
        // Count the complete app-visible response object so those hidden fields
        // cannot bypass RabbitMirror's 2 MiB response boundary.
        const seen = new WeakSet();
        try {
            text = JSON.stringify(value, (_key, nested) => {
                if (typeof nested === 'bigint') return String(nested);
                if (nested && typeof nested === 'object') {
                    if (seen.has(nested)) return '[Circular]';
                    seen.add(nested);
                }
                return nested;
            }) ?? String(value);
        } catch (cause) {
            const error = new TypeError('RabbitMirror 无法安全计算独立 API 响应大小，已停止接收该响应。');
            try { error.cause = cause; } catch {}
            throw error;
        }
    }
    assertRabbitMirrorIndependentResponseBytes(utf8ByteLength(text));
    return text;
}

export function assertRabbitMirrorIndependentResponseBytes(observedBytes = 0) {
    const bytes = Math.max(0, Number(observedBytes) || 0);
    if (bytes > MAX_INDEPENDENT_RESPONSE_BYTES) throw responseLimitError(MAX_INDEPENDENT_RESPONSE_BYTES, bytes);
    return bytes;
}

export function destroyRabbitMirrorIndependentSecurityGuard() {
    transportFetch = null;
    getSettingsRef = null;
    updateSettingsRef = null;
}

export const rabbitMirrorIndependentSecurityLimits = Object.freeze({
    maxResponseBytes: MAX_INDEPENDENT_RESPONSE_BYTES,
    maxRequestBytes: MAX_INDEPENDENT_REQUEST_BYTES,
});
