import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const independentSource = readFileSync(new URL('../src/independentApi.js', import.meta.url), 'utf8');
const startupSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const followSource = [
    readFileSync(new URL('../src/injector.js', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/feedbackCat.js', import.meta.url), 'utf8'),
].join('\n');

// This test covers the paid-generation seam only. It deliberately does not claim
// that startup has zero module GETs or that a real browser/provider uses zero
// bandwidth; those require HAR/server measurements on the target host.
// Startup and follow mode may prepare/inject rules, but neither surface owns the
// independent paid-generation seam.
for (const [label, value] of [['startup', startupSource], ['follow', followSource]]) {
    assert.doesNotMatch(value, /\brequestIndependentCompletion\s*\(/, `${label} must not dispatch an independent generation`);
    assert.doesNotMatch(value, /\bcallIndependentApi\s*\(/, `${label} must not enter the independent generation pipeline`);
}

const callStart = independentSource.indexOf('async function callIndependentApi(');
const callEnd = independentSource.indexOf('\nfunction externalOwnerMesid(', callStart);
assert.ok(callStart >= 0 && callEnd > callStart, 'independent paid-request seam must remain extractable');
const callSource = independentSource.slice(callStart, callEnd);
assert.equal((callSource.match(/await requestIndependentCompletion\s*\(/g) || []).length, 1, 'all face counts must share one paid completion call');

function createHarness(faceCount, responseOk) {
    let fetchCalls = 0;
    let leaseConsumes = 0;
    const faces = Array.from({ length: faceCount }, (_, faceIndex) => ({ faceIndex, formatIds: [`F.${faceIndex + 1}`] }));
    const batchPlan = faceCount > 1 ? {
        kind: 'rabbit-mirror-multiface-plan',
        batchId: `batch-${faceCount}`,
        requestedFaceCount: faceCount,
        faces,
    } : null;
    const raw = faceCount > 1
        ? faces.map((_, index) => `<toto data-rm-face="${index + 1}"><details><summary>F${index + 1}</summary><p>BODY</p></details></toto>`).join('')
        : '<toto><details><summary>F1</summary><p>BODY</p></details></toto>';
    const fakeFetch = async (_url, init) => {
        fetchCalls += 1;
        assert.equal(init.method, 'POST');
        return { ok: responseOk, status: responseOk ? 200 : 503 };
    };
    const sandbox = {
        Date,
        Math,
        Number,
        String,
        Array,
        Object,
        INDEPENDENT_BEHAVIOR_PATCH: '',
        MAX_INDEPENDENT_REQUEST_CHARS: 200_000,
        getSettings: () => ({
            independentApiBaseUrl: 'https://provider.invalid/v1',
            independentApiModel: 'fixture-model',
            independentApiMaxTokens: 12_000,
            independentReadGlobalWorldInfo: false,
            rabbitMirrorFaceCount: faceCount,
        }),
        swipeId: () => 0,
        createIndependentVisibleTextReader: () => () => ({ text: 'visible body' }),
        isRabbitMirrorEligibleAssistantMessage: message => message?.is_user !== true,
        buildRabbitMirrorPromptDetails: () => ({
            prompt: 'RULES',
            executionLock: 'LOCK',
            metadata: { faceCount, faces, samplingMode: 'classic', themeIds: [], formatIds: [], themeLabels: [], formatLabels: [] },
            batchPlan,
        }),
        messageSourceFingerprint: () => 'source',
        chatKey: () => 'chat:test',
        hashText: value => `hash:${String(value || '')}`,
        messageBaseSlotKey: (_ctx, index, msg) => `chat:test:${index}:${Number(msg?.swipe_id || 0)}`,
        operationEpochForBase: () => 1,
        recentIndependentVisualGuard: () => '',
        manualRetryVisualGuard: () => '',
        globalWorldInfoSnapshotFor: () => null,
        globalWorldInfoContextView: () => ({ block: '', includedEntries: 0, totalEntries: 0, chars: 0, truncated: false }),
        contextBundle: () => ({ text: 'bounded context', targetVisibleChars: 15, layers: 1, maxLayers: 1, filteredRabbitMirrorChars: 0, filteredExcludedTagChars: 0 }),
        recordRabbitMirrorIndependentPrompt() {},
        markPendingBatchAttempt: () => true,
        releasePendingComboBatch() {},
        async requestIndependentCompletion(_settings, _system, _user, options) {
            assert.equal(options.dispatchLease.consume(), true);
            const response = await fakeFetch('https://provider.invalid/v1/chat/completions', { method: 'POST' });
            return {
                response,
                result: { text: response.ok ? raw : '', raw: response.ok ? raw : 'unavailable', payload: {} },
                profile: 'fixture-profile',
                attempts: 1,
                requestDiagnostic: { ok: response.ok, requestCount: 1, automaticRetry: false },
                semanticError: '',
            };
        },
        compactRemoteError: () => '',
        profileUsesStreaming: () => false,
        assertIndependentMarkupComplexityWithDiagnostic() {},
        prepareIndependentMultifaceResult: value => ({ html: value, faceScans: [] }),
        republishIndependentSemanticFailure() {},
        clearIndependentQualityFailure() {},
        rememberApiProfile() {},
        extractMirrorInner: value => value,
        responseFinishReason: () => '',
        independentMirrorBodyEvidence: () => true,
        independentVisualProgramIntegrity: () => ({ ok: true }),
        prepareIndependentReadyHtml: value => value,
        scanRabbitMirrorHtml: () => ({}),
        wrappedIndependentMirrorHtml: value => value,
        independentSelectedFormatDescriptors: metadata => (Array.isArray(metadata?.formatIds) ? metadata.formatIds : []).map(id => ({ id: String(id), title: String(id), summary: '', tags: [] })),
        evaluateIndependentPostSanitizeQuality: () => ({ ok: true }),
        rememberIndependentQualityFailure() {},
        stageManualNonStreamRetry: () => '',
        globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(`${callSource.replace('async function callIndependentApi', 'async function run')}\nglobalThis.run = run;`, sandbox);
    const request = sandbox.globalThis.run(
        { chat: [{ is_user: false, mes: 'visible body' }] },
        0,
        { is_user: false, mes: 'visible body' },
        null,
        { dispatchLease: { consume() { leaseConsumes += 1; return true; } } },
    );
    return { request, counts: () => ({ fetchCalls, leaseConsumes }) };
}

for (let faceCount = 1; faceCount <= 5; faceCount += 1) {
    const success = createHarness(faceCount, true);
    await success.request;
    assert.deepEqual(success.counts(), { fetchCalls: 1, leaseConsumes: 1 }, `${faceCount} face success must use one request`);

    const failure = createHarness(faceCount, false);
    await assert.rejects(failure.request, /HTTP 503/);
    assert.deepEqual(failure.counts(), { fetchCalls: 1, leaseConsumes: 1 }, `${faceCount} face failure must not auto-retry`);
}

console.log('independent paid-seam cardinality tests passed');
