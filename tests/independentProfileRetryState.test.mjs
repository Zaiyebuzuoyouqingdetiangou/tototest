import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(ROOT, 'src/independentApi.js'), 'utf8');
const start = source.indexOf('function readApiProfileStore()');
const end = source.indexOf('function readOwnerLockStore()', start);
assert.ok(start >= 0 && end > start, 'API profile retry state helpers must exist');
const compatibilityStart = source.indexOf('const NON_STREAM_PROFILE_BY_STREAM_PROFILE=');
const compatibilityEnd = source.indexOf('function republishIndependentSemanticFailure', compatibilityStart);
assert.ok(compatibilityStart >= 0 && compatibilityEnd > compatibilityStart, 'exact non-stream retry helper must exist');
const requestProfilesStart = source.indexOf('function independentRequestProfiles(');
const requestProfilesEnd = source.indexOf('\nconst NON_STREAM_PROFILE_BY_STREAM_PROFILE=', requestProfilesStart);
assert.ok(requestProfilesStart >= 0 && requestProfilesEnd > requestProfilesStart, 'request profile ordering helper must exist');

function extractFunction(sourceText, name) {
    const start = sourceText.indexOf(`function ${name}(`);
    const asyncStart = sourceText.indexOf(`async function ${name}(`);
    const actualStart = [start, asyncStart].filter(value => value >= 0).sort((a, b) => a - b)[0];
    assert.ok(Number.isInteger(actualStart), `missing ${name}`);
    const bodyStart = sourceText.indexOf('){', actualStart) + 1;
    assert.ok(bodyStart > actualStart, `missing body for ${name}`);
    let depth = 0;
    for (let index = bodyStart; index < sourceText.length; index += 1) {
        if (sourceText[index] === '{') depth += 1;
        else if (sourceText[index] === '}') {
            depth -= 1;
            if (depth === 0) return sourceText.slice(actualStart, index + 1);
        }
    }
    throw new Error(`unterminated ${name}`);
}

let now = 1_000_000;
const values = new Map();
const sandbox = {
    API_PROFILE_STORE_KEY: 'profiles',
    API_PROFILE_SCHEMA: 2,
    API_PROFILE_ORDER: ['chat_system_user_full', 'chat_system_user_full_nostream'],
    DEGRADED_PROFILE_RECHECK_MS: 6 * 60 * 60 * 1000,
    STAGED_PROFILE_TTL_MS: 20 * 60 * 1000,
    RUNTIME_VERSION: 'test-runtime',
    localStorage: {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
    },
    normalizeIndependentConnectionText: value => String(value || '').trim(),
    normalizeBase: value => String(value || '').trim(),
    Date: { now: () => now },
    JSON,
    Math,
    Number,
    Object,
    String,
    globalThis: {},
};
vm.createContext(sandbox);
vm.runInContext(`${source.slice(start, end)}\n${source.slice(requestProfilesStart, requestProfilesEnd)}\n${source.slice(compatibilityStart, compatibilityEnd)}
globalThis.api={get:getStagedApiProfile,stage:stageManualNonStreamRetry,remember:rememberApiProfile,remembered:getRememberedApiProfile,profiles:independentRequestProfiles};`, sandbox);
const api = sandbox.globalThis.api;
const settings = { independentConnectionProfileId: 'profile-a', independentApiModel: 'model-b', independentApiTemperature: 0.8 };

api.remember(settings, 'chat_system_user_full');
assert.equal(api.remembered(settings), 'chat_system_user_full');
assert.equal(api.stage(settings, 'chat_system_user_full', 'transport-profile-stream-failure'), 'chat_system_user_full_nostream');
assert.equal(api.remembered(settings), 'chat_system_user_full', 'staging a diagnostic retry must preserve the last proven profile');
assert.equal(api.get(settings, true), 'chat_system_user_full_nostream', 'the next explicit resay consumes the staged twin');
assert.equal(api.get(settings, true), '', 'a failed nostream resay must not remain permanently sticky');
assert.equal(api.remembered(settings), 'chat_system_user_full');

api.stage(settings, 'chat_system_user_full', 'transport-profile-stream-failure');
now += 20 * 60 * 1000 + 1;
assert.equal(api.get(settings, true), '', 'staged compatibility retry must expire lazily without a timer');

now += 1;
api.stage(settings, 'chat_system_user_full', 'transport-profile-stream-failure');
assert.equal(api.get({ ...settings, independentApiModel: 'model-c' }, true), '', 'staged mode must be isolated by model');
assert.equal(api.get(settings, true), 'chat_system_user_full_nostream');

{
    let rememberCalls = 0;
    let requestCalls = 0;
    let visualOk = true;
    const callSandbox = {
        getSettings: () => settings,
        swipeId: message => Number(message?.swipe_id || 0),
        messageSourceFingerprint: () => 'source-hash',
        createIndependentVisibleTextReader: () => Object.assign(() => ({ text: 'VISIBLE FINAL', filteredRabbitMirrorChars: 0, filteredExcludedTagChars: 0, filteredExcludedTags: [] }), { renderedIndexes: [1] }),
        isRabbitMirrorEligibleAssistantMessage: message => !!message && !message.is_user && !message.is_system,
        buildRabbitMirrorPromptDetails: () => ({ prompt: 'BASE', executionLock: 'LOCK', metadata: {} }),
        INDEPENDENT_BEHAVIOR_PATCH: '',
        MAX_INDEPENDENT_REQUEST_CHARS: 32000,
        globalWorldInfoSnapshotFor: () => null,
        globalWorldInfoContextView: () => ({ block: '', includedEntries: 0, totalEntries: 0, chars: 0, truncated: false }),
        contextBundle: () => ({ text: 'CONTEXT', layers: 1, maxLayers: 20, filteredRabbitMirrorChars: 0, filteredExcludedTagChars: 0, targetVisibleChars: 13 }),
        recordRabbitMirrorIndependentPrompt: () => {},
        requestIndependentCompletion: async () => {
            requestCalls += 1;
            return {
                response: { ok: true, status: 200 },
                result: { text: '<toto><details><summary>OK</summary><div>BODY</div></details></toto>', payload: {} },
                profile: 'chat_system_user_full_nostream', attempts: 1, requestDiagnostic: { ok: true }, semanticError: '',
            };
        },
        compactRemoteError: () => '',
        profileUsesStreaming: profile => !/nostream/i.test(String(profile || '')),
        assertIndependentMarkupComplexityWithDiagnostic: () => {},
        extractMirrorInner: raw => String(raw).replace(/^<toto>/, '').replace(/<\/toto>$/, ''),
        responseFinishReason: () => '',
        stageManualNonStreamRetry: () => '',
        republishIndependentSemanticFailure: () => {},
        independentMirrorBodyEvidence: () => true,
        independentVisualProgramIntegrity: () => visualOk ? { ok: true } : { ok: false, reason: 'state-css-missing' },
        prepareIndependentReadyHtml: value => String(value || ''),
        wrappedIndependentMirrorHtml: value => `<toto>${String(value || '')}</toto>`,
        scanRabbitMirrorHtml: () => ({ interactionFamily: null, riskFlags: [] }),
        evaluateIndependentPostSanitizeQuality: () => ({ ok: true, code: 'ok', message: '', flags: [] }),
        rememberIndependentQualityFailure: () => {},
        clearIndependentQualityFailure: () => {},
        rememberApiProfile: (st, profile) => { rememberCalls += 1; api.remember(st, profile); },
        recentIndependentVisualGuard: () => '',
        manualRetryVisualGuard: () => '',
        Date, Number, String, Math, Object, Array, Error, globalThis: {},
    };
    vm.createContext(callSandbox);
    vm.runInContext(`${extractFunction(source, 'callIndependentApi')}\nglobalThis.call=callIndependentApi;`, callSandbox);
    const ctx = { chat: [{ is_user: true, mes: 'U' }, { is_user: false, mes: 'VISIBLE FINAL' }] };
    await callSandbox.globalThis.call(ctx, 1, ctx.chat[1], { aborted: false }, { manualRetry: true });
    assert.equal(requestCalls, 1);
    assert.equal(rememberCalls, 1, 'only a production semantic success may remember the nostream profile');
    assert.equal(api.remembered(settings), 'chat_system_user_full_nostream');
    assert.equal(api.profiles(settings, 'S', 'U')[0].name, 'chat_system_user_full_nostream', 'the next automatic request must prefer the proven nostream profile');
    now += 6 * 60 * 60 * 1000;
    assert.equal(api.profiles(settings, 'S', 'U')[0].name, 'chat_system_user_full_nostream', 'the degraded profile remains proven at exactly six hours');
    now += 1;
    assert.equal(api.profiles(settings, 'S', 'U')[0].name, 'chat_system_user_full', 'six hours plus one millisecond must re-probe streaming');

    visualOk = false;
    await assert.rejects(
        callSandbox.globalThis.call(ctx, 1, ctx.chat[1], { aborted: false }, { manualRetry: true }),
        /视觉样式程序缺失/,
    );
    assert.equal(requestCalls, 2);
    assert.equal(rememberCalls, 1, 'a semantic failure after HTTP 200 must never refresh profile memory');
}

{
    const requestStart = source.indexOf('async function requestIndependentCompletion(st,systemPrompt,userPrompt,options={})');
    const requestEnd = source.indexOf('function wrappedIndependentMirrorHtml', requestStart);
    let stagedAvailable = true;
    const calls = [];
    const systemUser = [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }];
    const requestSandbox = {
        getRememberedApiProfile: () => 'chat_system_user_full',
        getStagedApiProfile: (_settings, consume) => {
            assert.equal(consume, true, 'manual resay must consume the staged profile before dispatch');
            if (!stagedAvailable) return '';
            stagedAvailable = false;
            return 'chat_system_user_full_nostream';
        },
        independentRequestProfiles: () => [
            { name: 'chat_system_user_full', kind: 'chat', body: { model: 'model-b', messages: systemUser, temperature: 0.8, max_tokens: 15000, stream: true } },
            { name: 'chat_system_user_full_nostream', kind: 'chat', body: { model: 'model-b', messages: systemUser, temperature: 0.8, max_tokens: 15000, stream: false } },
        ],
        normalizeIndependentConnectionText: value => String(value || ''),
        endpoint: () => '/chat/completions',
        nextCompatibilityProfileName: () => '',
        stageManualNonStreamRetry: () => '',
        stageNextApiProfile: () => {},
        forgetRememberedApiProfileIfMatches: () => {},
        normalizedConfiguredTemperature: () => 0.8,
        independentDiagnosticBase: () => 'sillytavern:profile-a',
        profileUsesStreaming: profile => !/nostream/i.test(String(profile || '')),
        profileUsesSystemMessage: () => true,
        profileTokenField: () => 'max_tokens',
        publishIndependentApiRequestDiagnostic: value => ({ ...value, ts: 1 }),
        validatedIndependentConnectionProfile: () => ({ id: 'profile-a', ctx: {}, profile: {} }),
        requestIndependentConnectionProfileCompletion: async (_runtime, profile) => {
            calls.push(profile);
            return { response: { ok: true, status: 200 }, result: { raw: '<toto>OK</toto>', text: '<toto>OK</toto>', payload: null, streamed: false } };
        },
        recoverableCompletedIndependentAbort: () => false,
        responsePayloadErrorText: () => '',
        retryableParameterError: () => false,
        safeJson: value => JSON.stringify(value),
        API_PROFILE_ORDER: ['chat_system_user_full', 'chat_system_user_full_nostream'],
        JSON,
        Math,
        Number,
        Object,
        String,
        Error,
        console,
        globalThis: {},
    };
    vm.createContext(requestSandbox);
    vm.runInContext(`${source.slice(requestStart, requestEnd)}\nglobalThis.request=requestIndependentCompletion;`, requestSandbox);
    const result = await requestSandbox.globalThis.request(
        { independentConnectionProfileId: 'profile-a', independentApiModel: 'model-b', independentApiTemperature: 0.8 },
        'S',
        'U',
        { manualRetry: true, signal: { aborted: false } },
    );
    assert.equal(calls.length, 1, 'one explicit resay must still dispatch exactly one paid request');
    assert.equal(result.profile, 'chat_system_user_full_nostream');
    assert.equal(calls[0].body.model, 'model-b');
    assert.deepEqual(calls[0].body.messages, systemUser);
    assert.equal(calls[0].body.temperature, 0.8);
    assert.equal(calls[0].body.max_tokens, 15000);
    assert.equal(calls[0].body.stream, false, 'the staged retry changes only stream');
}

console.log('independentProfileRetryState: one-shot staged retry, TTL, model isolation and success memory covered');
