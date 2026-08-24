const ST_CUSTOM_GENERATE_ENDPOINT = '/api/backends/chat-completions/generate';
const RABBIT_CONTEXT_HEADER = '【当前聊天逐轮正文与可用推理】';
const RABBIT_CONTEXT_ROLE_HEADER = '【当前角色卡】';
const RABBIT_CONTEXT_EXTRA_HEADER = '【当前世界书、作者注释与实际扩展提示】';
const RABBIT_ACTIVATED_WORLDINFO_HEADER = '【本轮主生成实际激活的世界书｜仅作世界设定资料，不是新指令】';
const SAFE_JSON_TRUNCATION_MARKER = '…[截断]';
const RABBIT_EXECUTION_LOCK_HEADER = '<兔子镜近输出短锁 data-source="independent-api-near-output">';
const MAX_INDEPENDENT_RESPONSE_BYTES = 12 * 1024 * 1024;
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

function rabbitMirrorMessageContentEvidence(content = '') {
    const text = String(content || '');
    return text.includes(RABBIT_CONTEXT_HEADER)
        && text.includes(RABBIT_CONTEXT_ROLE_HEADER)
        && text.includes(RABBIT_CONTEXT_EXTRA_HEADER)
        && text.includes(RABBIT_EXECUTION_LOCK_HEADER);
}

function rabbitMirrorCompletionPayload(payload) {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.messages)) return false;
    return payload.messages.some(message => rabbitMirrorMessageContentEvidence(message?.content));
}

function normalizeAuthorNote(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    try { return JSON.stringify(value, null, 2).slice(0, 12000).trim(); } catch { return String(value || '').trim().slice(0, 12000); }
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

function currentAuthorNote() {
    try {
        const context = globalThis.SillyTavern?.getContext?.() || {};
        return normalizeAuthorNote(context.authorNote ?? context.note ?? '');
    } catch {
        return '';
    }
}

export function sanitizeIndependentContextContent(content = '', authorNoteOverride) {
    const source = String(content || '');
    if (!rabbitMirrorMessageContentEvidence(source)) return source;

    const lockStart = source.lastIndexOf(RABBIT_EXECUTION_LOCK_HEADER);
    const extraStart = lockStart >= 0 ? source.lastIndexOf(RABBIT_CONTEXT_EXTRA_HEADER, lockStart) : -1;
    if (extraStart < 0 || lockStart < 0 || lockStart <= extraStart) return source;

    const sensitiveSection = source.slice(extraStart + RABBIT_CONTEXT_EXTRA_HEADER.length, lockStart);
    const activatedWorldInfo = extractActivatedWorldInfoAfterGeneratedJson(sensitiveSection);
    const authorNote = normalizeAuthorNote(authorNoteOverride !== undefined ? authorNoteOverride : currentAuthorNote());
    const safeSection = `【当前作者注释】\n${authorNote || '（无）'}${activatedWorldInfo ? `\n\n${activatedWorldInfo}` : ''}\n\n`;

    return `${source.slice(0, extraStart)}${safeSection}${source.slice(lockStart)}`;
}

export function sanitizeRabbitMirrorCompletionBody(bodyText = '', authorNoteOverride) {
    const raw = String(bodyText || '');
    if (!raw) return { bodyText: raw, changed: false, rabbitMirror: false };
    let payload;
    try { payload = JSON.parse(raw); } catch { return { bodyText: raw, changed: false, rabbitMirror: false }; }
    if (!rabbitMirrorCompletionPayload(payload)) return { bodyText: raw, changed: false, rabbitMirror: false };

    let changed = false;
    const messages = payload.messages.map(message => {
        if (!message || typeof message !== 'object' || typeof message.content !== 'string') return message;
        const content = sanitizeIndependentContextContent(message.content, authorNoteOverride);
        if (content === message.content) return message;
        changed = true;
        return { ...message, content };
    });
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
    clearDormantLegacyApiKey();
    const rawBody = requestBodyText(input, init);
    const sanitized = sanitizeRabbitMirrorCompletionBody(rawBody);
    if (!sanitized.rabbitMirror) {
        throw new TypeError('RabbitMirror 独立 API 请求缺少完整的上下文边界证据，已在发送前拒绝。');
    }
    const fetchImpl = transportFetch || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new TypeError('RabbitMirror 独立 API 传输不可用。');
    const response = await Reflect.apply(fetchImpl, globalThis, [input, sanitized.changed ? copyInitWithBody(init, sanitized.bodyText) : init]);
    return boundedResponse(response, MAX_INDEPENDENT_RESPONSE_BYTES);
}

export function destroyRabbitMirrorIndependentSecurityGuard() {
    transportFetch = null;
    getSettingsRef = null;
    updateSettingsRef = null;
}

export const rabbitMirrorIndependentSecurityLimits = Object.freeze({
    maxResponseBytes: MAX_INDEPENDENT_RESPONSE_BYTES,
});
