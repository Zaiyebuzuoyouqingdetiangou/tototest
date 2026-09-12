// Advanced fields are generation-only scalars, never a second request body.
export const INDEPENDENT_ADVANCED_ERROR_CODE = 'RABBIT_MIRROR_ADVANCED_OPTIONS_REJECTED';
export const INDEPENDENT_ADVANCED_MAX_CHARS = 8192;
export const INDEPENDENT_REASONING_EFFORTS = Object.freeze(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
export const INDEPENDENT_EXCLUDABLE_PARAMS = Object.freeze(['temperature', 'top_p', 'top_k', 'min_p', 'top_a', 'typical_p', 'frequency_penalty', 'presence_penalty', 'repetition_penalty', 'seed']);

const unit = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const penalty = value => typeof value === 'number' && Number.isFinite(value) && value >= -2 && value <= 2;
const validators = Object.freeze({
    reasoning_effort: value => typeof value === 'string' && INDEPENDENT_REASONING_EFFORTS.includes(value),
    top_p: unit,
    min_p: unit,
    top_a: unit,
    typical_p: unit,
    top_k: value => Number.isSafeInteger(value) && value >= 0 && value <= 1000000,
    frequency_penalty: penalty,
    presence_penalty: penalty,
    repetition_penalty: value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 10,
    seed: value => Number.isSafeInteger(value),
    verbosity: value => typeof value === 'string' && ['low', 'medium', 'high'].includes(value),
});

export function independentAdvancedOptionsError(message = '独立 API 高级参数无效；请检查高级参数设置后重试。') {
    const error = new TypeError(message);
    error.code = INDEPENDENT_ADVANCED_ERROR_CODE;
    error.requestCount = 0;
    return error;
}

// Only this parser may produce a trusted carrier. Rechecking the private brand
// at the adapter prevents a caller from supplying a hand-built override body.
const validatedOptions = new WeakSet();
function result(enabled, body, excludedParams = []) {
    const frozenBody = Object.freeze(body);
    const excluded = Object.freeze(excludedParams);
    const parsed = Object.freeze({ enabled, body: frozenBody, serializedBody: Object.keys(body).length ? JSON.stringify(body) : '',
        excludedParams: excluded, serializedExcluded: excluded.length ? JSON.stringify(excluded) : '' });
    validatedOptions.add(parsed);
    return parsed;
}

export function parseIndependentAdvancedOptions(settings = {}) {
    if (settings?.independentAdvancedEnabled !== true) return result(false, {});
    const excludedInput = settings.independentExcludedParams === undefined ? [] : settings.independentExcludedParams;
    if (!Array.isArray(excludedInput) || excludedInput.length > INDEPENDENT_EXCLUDABLE_PARAMS.length
        || Array.from(excludedInput).some(key => typeof key !== 'string' || !INDEPENDENT_EXCLUDABLE_PARAMS.includes(key))) {
        throw independentAdvancedOptionsError('排除采样参数必须是支持名单中的字段列表；不能排除推理、模型、正文、Token 上限、流式、连接或工具字段。');
    }
    const excludedParams = [...new Set(excludedInput)].sort();
    const raw = settings.independentExtraParams ?? '';
    const effort = settings.independentReasoningEffort ?? '';
    if (typeof raw !== 'string' || typeof effort !== 'string') {
        throw independentAdvancedOptionsError('独立 API 高级参数必须是文本；推理强度请选择列表中的选项。');
    }
    if (raw.length > INDEPENDENT_ADVANCED_MAX_CHARS || new TextEncoder().encode(raw).byteLength > INDEPENDENT_ADVANCED_MAX_CHARS) {
        throw independentAdvancedOptionsError('独立 API 附加参数超过 8192 字符或 UTF-8 字节上限；本轮未发送请求。');
    }
    if (effort && !INDEPENDENT_REASONING_EFFORTS.includes(effort)) {
        throw independentAdvancedOptionsError('独立 API 推理强度不在支持的选项中；请重新选择。');
    }
    let input = {};
    try { if (raw.trim()) input = JSON.parse(raw); }
    catch { throw independentAdvancedOptionsError('独立 API 附加参数不是有效的 JSON 对象；不接受注释、代码或尾随逗号。'); }
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) {
        throw independentAdvancedOptionsError('独立 API 附加参数顶层必须是 JSON 对象，不能是数组、文字或 null。');
    }
    const keys = Object.keys(input);
    if (keys.length > 12) throw independentAdvancedOptionsError('独立 API 附加参数字段过多；最多允许 12 个生成参数。');
    const body = {};
    for (const key of keys.sort()) {
        if (!Object.prototype.hasOwnProperty.call(validators, key)) {
            throw independentAdvancedOptionsError('独立 API 附加参数含不支持或受保护的字段；请只使用帮助中列出的生成参数。');
        }
        // No nested objects/arrays are allowed. This also rejects hidden
        // prototype, prompt, credential, endpoint and tool-control payloads.
        if (!validators[key](input[key])) {
            throw independentAdvancedOptionsError('独立 API 附加参数的值类型或范围不正确；请查看支持字段说明。');
        }
        body[key] = input[key];
    }
    if (effort && Object.prototype.hasOwnProperty.call(body, 'reasoning_effort') && body.reasoning_effort !== effort) {
        throw independentAdvancedOptionsError('推理强度与附加 JSON 中的 reasoning_effort 冲突；请只保留一份，或使两者一致。');
    }
    if (effort) body.reasoning_effort = effort;
    // Validate the original JSON first. Exclusion wins only at the request
    // boundary; never rewrite or silently repair the user's saved draft.
    for (const key of excludedParams) delete body[key];
    return result(true, body, excludedParams);
}

export function applyIndependentAdvancedExclusions(body, parsed) {
    if (!validatedOptions.has(parsed)) throw independentAdvancedOptionsError('独立 API 高级参数未通过本轮校验；本轮未发送请求。');
    if (!parsed.excludedParams.length) return body;
    const output = { ...body };
    for (const key of parsed.excludedParams) delete output[key];
    return output;
}

export function buildIndependentAdvancedCarrier(parsed, { source = '', apiFormat = '' } = {}) {
    if (!validatedOptions.has(parsed)) throw independentAdvancedOptionsError('独立 API 高级参数未通过本轮校验；本轮未发送请求。');
    if (!parsed.serializedBody && !parsed.serializedExcluded) return {};
    if (source !== 'custom' || !['', 'openai_compat'].includes(String(apiFormat ?? '').trim())) {
        throw independentAdvancedOptionsError('非空高级参数目前仅支持手动 OpenAI 兼容连接，或自定义 Chat Completions Profile；其它来源或 Responses 等协议不会静默忽略参数，请关闭高级参数或选择兼容连接。');
    }
    // Both ST and TT merge this internally generated JSON at the CUSTOM
    // backend. Do not also send top-level reasoning_effort: ST may remap it.
    return { ...(parsed.serializedBody ? { custom_include_body: parsed.serializedBody } : {}),
        ...(parsed.serializedExcluded ? { custom_exclude_body: parsed.serializedExcluded } : {}) };
}

let previousKeyInput = null;
let previousKey = '';
export function independentAdvancedOptionsSignature(settings = {}) {
    if (settings?.independentAdvancedEnabled !== true) return '';
    const effort = typeof settings.independentReasoningEffort === 'string' ? settings.independentReasoningEffort : '!invalid-type';
    const raw = typeof settings.independentExtraParams === 'string' ? settings.independentExtraParams : settings.independentExtraParams == null ? '' : '!invalid-type';
    const excluded = settings.independentExcludedParams;
    // Bound corrupt persisted settings too; this signature must not throw or
    // perform unbounded work before request-time validation can report them.
    const excludedKey = excluded === undefined || (Array.isArray(excluded) && excluded.length === 0) ? ''
        : Array.isArray(excluded) ? JSON.stringify([...new Set(excluded.slice(0, 11).map(value => typeof value === 'string' ? value.slice(0, 64) : `!${typeof value}`))].sort()) + (excluded.length > 10 ? `!length:${excluded.length}` : '')
            : '!invalid-exclusions';
    if (!effort && !excludedKey && raw.length <= 8192 && (!raw.trim() || /^\{\s*\}$/.test(raw))) return '';
    if (previousKeyInput?.effort === effort && previousKeyInput?.raw === raw && previousKeyInput?.excludedKey === excludedKey) return previousKey;
    // This bounded digest only namespaces compatibility/cache invalidation.
    // Exact raw field equality is separately checked before paid dispatch.
    const text = JSON.stringify([effort.slice(0,64), raw.slice(0,8193), raw.length, ...(excludedKey ? [excludedKey] : [])]);
    let first = 2166136261; let second = 5381;
    for (let i = 0; i < text.length; i += 1) { first = Math.imul(first ^ text.charCodeAt(i), 16777619); second = Math.imul(second, 33) ^ text.charCodeAt(i); }
    previousKey = `${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
    // Do not keep an unbounded corrupted setting alive in this small cache.
    previousKeyInput = raw.length <= 8192 && effort.length <= 64 ? { effort, raw, excludedKey } : null;
    return previousKey;
}
