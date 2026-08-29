import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(ROOT, 'src/independentApi.js'), 'utf8');

function manualRequestHarness(readApiResponse) {
    const start = source.indexOf('async function requestIndependentCompletion(st,systemPrompt,userPrompt,options={})');
    const end = source.indexOf('function wrappedIndependentMirrorHtml', start);
    assert.ok(start >= 0 && end > start, 'requestIndependentCompletion must exist');

    let fetchCalls = 0;
    const sandbox = {
        getRememberedApiProfile: () => '',
        getStagedApiProfile: () => '',
        independentRequestProfiles: () => [{ name: 'chat_system_user_full', kind: 'chat', body: { model: 'model-b', messages: [], temperature: 0.8, max_tokens: 15000, stream: true } }],
        normalizeIndependentConnectionText: value => String(value || ''),
        endpoint: () => '/chat/completions',
        nextCompatibilityProfileName: () => 'chat_system_user_full_nostream',
        stageManualNonStreamRetry: () => 'chat_system_user_full_nostream',
        stageNextApiProfile: () => {},
        forgetRememberedApiProfileIfMatches: () => {},
        normalizedConfiguredTemperature: () => 0.8,
        independentDiagnosticBase: () => 'sillytavern:profile-b',
        profileUsesStreaming: profile => !/nostream/i.test(String(profile || '')),
        profileUsesSystemMessage: () => true,
        profileTokenField: () => 'max_tokens',
        publishIndependentApiRequestDiagnostic: value => ({ ...value, ts: 1 }),
        fetchIndependentUrl: async () => { fetchCalls += 1; return { ok: true, status: 200 }; },
        headers: () => ({}),
        readApiResponse,
        extractMirrorInner: value => /<toto\b[^>]*>[\s\S]*<\/details>\s*<\/toto>/i.test(String(value || '')) ? 'complete' : '',
        responsePayloadErrorText: () => '',
        retryableParameterError: () => false,
        safeJson: value => JSON.stringify(value),
        API_PROFILE_ORDER: ['chat_system_user_full', 'chat_system_user_full_nostream'],
        console,
        JSON,
        String,
        Number,
        Object,
        Error,
        globalThis: {},
    };
    vm.createContext(sandbox);
    const abortBoundaryStart = source.indexOf('function recoverableCompletedIndependentAbort(');
    const abortBoundaryEnd = source.indexOf('function responseFinishReason', abortBoundaryStart);
    assert.ok(abortBoundaryStart >= 0 && abortBoundaryEnd > abortBoundaryStart, 'recoverable Abort boundary helper must exist');
    vm.runInContext(`${source.slice(abortBoundaryStart, abortBoundaryEnd)}\n${source.slice(start, end)}\nglobalThis.request=requestIndependentCompletion;`, sandbox);
    return { request: sandbox.globalThis.request, fetchCalls: () => fetchCalls };
}

test('an unexpected bare AbortError becomes a visible single-shot transport failure', async () => {
    const nakedAbort = Object.assign(new Error('upstream body aborted after provider accepted the request'), { name: 'AbortError' });
    const harness = manualRequestHarness(async () => { throw nakedAbort; });

    await assert.rejects(
        () => harness.request(
            { independentApiModel: 'model-b', independentConnectionProfileId: '', independentApiBaseUrl: 'https://b.example/v1' },
            'S',
            'U',
            { signal: { aborted: false } },
        ),
        error => {
            assert.notEqual(error, nakedAbort, 'a transport-origin AbortError must not be mistaken for an intentional UI cancellation');
            assert.notEqual(error?.name, 'AbortError');
            assert.match(String(error?.message || ''), /副 API 网络／响应流失败/);
            assert.match(String(error?.message || ''), /连接在响应完成前中断/);
            assert.equal(error?.rabbitMirrorRequestDiagnostic?.semanticFailure, 'transport-body');
            assert.equal(error?.rabbitMirrorRequestDiagnostic?.transportCause, 'connection-interrupted');
            assert.equal(error?.rabbitMirrorRequestDiagnostic?.requestCount, 1);
            assert.equal(error?.rabbitMirrorRequestDiagnostic?.automaticRetry, false);
            return true;
        },
    );
    assert.equal(harness.fetchCalls(), 1, 'settling a failed response body must never dispatch a second paid request');
});

test('manual response reader never salvages complete partial markup after a response-size error', async () => {
    const complete = '<toto><details><summary>B</summary><div>READY</div></details></toto>';
    const sizeError = Object.assign(new Error('response exceeded 2 MiB after complete-looking markup'), {
        name: 'RabbitMirrorResponseLimitError',
        code: 'RABBIT_MIRROR_RESPONSE_TOO_LARGE',
        limitBytes: 2 * 1024 * 1024,
        observedBytes: 2 * 1024 * 1024 + 1,
        partialResult: { raw: complete, payload: null, text: complete, streamed: true, contentType: 'text/event-stream', terminatedAfterComplete: false },
    });
    const harness = manualRequestHarness(async () => { throw sizeError; });

    await assert.rejects(
        () => harness.request(
            { independentApiModel: 'model-b', independentConnectionProfileId: '', independentApiBaseUrl: 'https://b.example/v1' },
            'S',
            'U',
            { signal: { aborted: false } },
        ),
        error => {
            const boundary = error === sizeError ? error : error?.cause;
            assert.equal(boundary, sizeError, 'response-limit failures must remain fatal even when partialResult contains complete tags');
            assert.equal(boundary?.code, 'RABBIT_MIRROR_RESPONSE_TOO_LARGE');
            return true;
        },
    );
    assert.equal(harness.fetchCalls(), 1, 'rejecting an oversized complete partial must not dispatch another paid request');
});

test('manual response reader never salvages complete partial markup after a generic non-Abort error', async () => {
    const complete = '<toto><details><summary>B</summary><div>READY</div></details></toto>';
    const decodeError = Object.assign(new TypeError('stream decoder failed after complete-looking markup'), {
        partialResult: { raw: complete, payload: null, text: complete, streamed: true, contentType: 'text/event-stream', terminatedAfterComplete: false },
    });
    const harness = manualRequestHarness(async () => { throw decodeError; });

    await assert.rejects(
        () => harness.request(
            { independentApiModel: 'model-b', independentConnectionProfileId: '', independentApiBaseUrl: 'https://b.example/v1' },
            'S',
            'U',
            { signal: { aborted: false } },
        ),
        error => error === decodeError || error?.cause === decodeError,
        'only a bare AbortError may use the complete partial response recovery path',
    );
    assert.equal(harness.fetchCalls(), 1);
});

test('Connection Manager nested 401 cause gives Profile/Secret repair guidance without staging non-stream', async () => {
    const start = source.indexOf('async function requestIndependentCompletion(st,systemPrompt,userPrompt,options={})');
    const end = source.indexOf('function wrappedIndependentMirrorHtml', start);
    assert.ok(start >= 0 && end > start, 'requestIndependentCompletion must exist');
    let serviceCalls = 0;
    let stagedNonStream = 0;
    const authCause = Object.assign(new Error('Incorrect API key'), { status: 401 });
    const outer = new Error('API request failed', { cause: authCause });
    const sandbox = {
        getRememberedApiProfile: () => '',
        getStagedApiProfile: () => '',
        independentRequestProfiles: () => [{ name: 'chat_system_user_full', kind: 'chat', body: { model: 'model-b', messages: [], temperature: 0.8, max_tokens: 15000, stream: true } }],
        normalizeIndependentConnectionText: value => String(value || ''),
        endpoint: () => '/chat/completions',
        nextCompatibilityProfileName: () => 'chat_system_user_full_nostream',
        stageManualNonStreamRetry: () => { stagedNonStream += 1; return 'chat_system_user_full_nostream'; },
        stageNextApiProfile: () => {},
        forgetRememberedApiProfileIfMatches: () => {},
        normalizedConfiguredTemperature: () => 0.8,
        independentDiagnosticBase: () => 'sillytavern:profile-b',
        profileUsesStreaming: () => true,
        profileUsesSystemMessage: () => true,
        profileTokenField: () => 'max_tokens',
        publishIndependentApiRequestDiagnostic: value => ({ ...value, ts: 1 }),
        validatedIndependentConnectionProfile: () => ({ id: 'profile-b', ctx: {}, profile: {}, apiMap: { selected: 'openai', source: 'custom' } }),
        requestIndependentConnectionProfileCompletion: async () => { serviceCalls += 1; throw outer; },
        recoverableCompletedIndependentAbort: () => false,
        responsePayloadErrorText: () => '',
        retryableParameterError: () => false,
        safeJson: value => JSON.stringify(value),
        API_PROFILE_ORDER: ['chat_system_user_full', 'chat_system_user_full_nostream'],
        console,
        JSON,
        String,
        Number,
        Object,
        Error,
        globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source.slice(start, end)}\nglobalThis.request=requestIndependentCompletion;`, sandbox);

    await assert.rejects(
        () => sandbox.globalThis.request(
            { independentApiModel: 'model-b', independentConnectionProfileId: 'profile-b' },
            'S',
            'U',
            { signal: { aborted: false } },
        ),
        error => {
            assert.match(String(error?.message || ''), /Connection Manager[\s\S]*重新保存[\s\S]*Profile[\s\S]*Secret/i);
            assert.equal(error?.rabbitMirrorRequestDiagnostic?.nextProfile, '');
            assert.equal(error?.rabbitMirrorRequestDiagnostic?.requestCount, 1);
            assert.equal(error?.rabbitMirrorRequestDiagnostic?.automaticRetry, false);
            assert.equal(error?.cause, outer);
            return true;
        },
    );
    assert.equal(serviceCalls, 1, 'a nested 401 must never trigger a second paid Connection Manager request');
    assert.equal(stagedNonStream, 0, 'authentication/Secret failures are not stream compatibility failures');
});

test('Connection Manager Error with nested AbortError stages one exact manual non-stream retry', async () => {
    const start = source.indexOf('async function requestIndependentCompletion(st,systemPrompt,userPrompt,options={})');
    const end = source.indexOf('function wrappedIndependentMirrorHtml', start);
    let serviceCalls = 0;
    let stageCalls = 0;
    const abortCause = Object.assign(new Error('The operation was aborted.'), { name: 'AbortError', type: 'aborted' });
    const outer = new Error('API request failed', { cause: abortCause });
    const sandbox = {
        getRememberedApiProfile: () => '',
        getStagedApiProfile: () => '',
        independentRequestProfiles: () => [{ name: 'chat_system_user_full', kind: 'chat', body: { model: 'model-b', messages: [], temperature: 0.8, max_tokens: 15000, stream: true } }],
        normalizeIndependentConnectionText: value => String(value || ''),
        endpoint: () => '/chat/completions',
        nextCompatibilityProfileName: () => 'chat_system_user_full_nostream',
        stageManualNonStreamRetry: (_settings, current, reason) => {
            stageCalls += 1;
            assert.equal(current, 'chat_system_user_full');
            assert.equal(reason, 'transport-profile-stream-failure');
            return 'chat_system_user_full_nostream';
        },
        stageNextApiProfile: () => {},
        forgetRememberedApiProfileIfMatches: () => {},
        normalizedConfiguredTemperature: () => 0.8,
        independentDiagnosticBase: () => 'sillytavern:profile-b',
        profileUsesStreaming: profile => !/nostream/i.test(String(profile || '')),
        profileUsesSystemMessage: () => true,
        profileTokenField: () => 'max_tokens',
        publishIndependentApiRequestDiagnostic: value => ({ ...value, ts: 1 }),
        validatedIndependentConnectionProfile: () => ({ id: 'profile-b', ctx: {}, profile: {} }),
        requestIndependentConnectionProfileCompletion: async () => { serviceCalls += 1; throw outer; },
        recoverableCompletedIndependentAbort: () => false,
        responsePayloadErrorText: () => '',
        retryableParameterError: () => false,
        safeJson: value => JSON.stringify(value),
        API_PROFILE_ORDER: ['chat_system_user_full', 'chat_system_user_full_nostream'],
        console, JSON, String, Number, Object, Error, globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source.slice(start, end)}\nglobalThis.request=requestIndependentCompletion;`, sandbox);

    await assert.rejects(
        () => sandbox.globalThis.request(
            { independentApiModel: 'model-b', independentConnectionProfileId: 'profile-b' },
            'S',
            'U',
            { signal: { aborted: false } },
        ),
        error => {
            assert.match(String(error?.message || ''), /连接在响应完成前中断/);
            assert.equal(error?.rabbitMirrorRequestDiagnostic?.semanticFailure, 'transport-profile');
            assert.equal(error?.rabbitMirrorRequestDiagnostic?.transportCause, 'connection-interrupted');
            assert.equal(error?.rabbitMirrorRequestDiagnostic?.nextProfile, 'chat_system_user_full_nostream');
            assert.equal(error?.rabbitMirrorRequestDiagnostic?.requestCount, 1);
            assert.equal(error?.rabbitMirrorRequestDiagnostic?.automaticRetry, false);
            assert.equal(error?.cause, outer);
            return true;
        },
    );
    assert.equal(serviceCalls, 1, 'nested AbortError must remain one paid Connection Manager request');
    assert.equal(stageCalls, 1, 'only the next explicit resay receives the exact non-stream twin');
});

test('generation catch does not silently swallow a naked AbortError', () => {
    const start = source.indexOf('async function generateFor(index,msg,force=false,sourceAware=true)');
    const end = source.indexOf('function independentHostForRoot', start);
    const block = source.slice(start, end);
    assert.ok(block.length > 0, 'generateFor block must exist');
    const catchStart = block.indexOf('}).catch(err=>{');
    const failureStart = block.indexOf('markAutomaticFailureStop', catchStart);
    const silentBranch = block.slice(catchStart, failureStart);
    assert.doesNotMatch(silentBranch, /err\?\.name===['"]AbortError['"]/, 'only an explicitly aborted local signal/stale owner may return silently');
    assert.match(silentBranch, /controller\.signal\.aborted|!stillCurrent\(\)/, 'intentional cancellation/stale ownership may remain silent');
});

test('existing and shared flights adopt a remounted loading host for later abort settlement', () => {
    const start = source.indexOf('async function generateFor(index,msg,force=false,sourceAware=true)');
    const end = source.indexOf('function independentHostForRoot', start);
    const block = source.slice(start, end);
    const existingStart = block.indexOf('const existing=pending.get(slot);');
    const sharedStart = block.indexOf('const flightKey=flightIdentity(slot,sourceHash);', existingStart);
    const previousStart = block.indexOf('const previousReadyRecord=', sharedStart);
    assert.ok(existingStart >= 0 && sharedStart > existingStart && previousStart > sharedStart, 'existing/shared in-flight branches must exist');
    const existingBranch = block.slice(existingStart, sharedStart);
    const sharedBranch = block.slice(sharedStart, previousStart);
    assert.match(existingBranch, /ensureExternalUi\([\s\S]*['"]loading['"]/);
    assert.match(existingBranch, /existing\.loadingHost\s*=/, 'pending flight must adopt the newly mounted loading host');
    assert.match(sharedBranch, /ensureExternalUi\([\s\S]*['"]loading['"]/);
    assert.match(sharedBranch, /shared\.loadingHost\s*=/, 'global shared flight must adopt the newly mounted loading host');
    assert.match(source, /const host=flight\.loadingHost;/, 'abort settlement must resolve the current host through flight.loadingHost');
});

test('runtime-driven cancellation converts every mounted loading placeholder to a terminal state', () => {
    const settleStart = source.indexOf('function settleMountedIndependentPlaceholders(indices,reason)');
    const settleEnd = source.indexOf('function captureMountedIndependentRecords', settleStart);
    assert.ok(settleStart >= 0 && settleEnd > settleStart, 'settleMountedIndependentPlaceholders must exist beside mounted placeholder capture');
    const settle = source.slice(settleStart, settleEnd);
    assert.match(settle, /ensureExternalUi/);
    assert.match(settle, /['"]error['"]/, 'active cancellation must render a terminal error/cancelled state rather than leave loading mounted');
    assert.doesNotMatch(settle, /callIndependentApi|generateFor\(/, 'settlement must not start another paid request');

    const reconfigureStart = source.indexOf('async function reconfigureRuntime({coldStart=false}={})');
    const reconfigureEnd = source.indexOf('export function refreshRabbitMirrorGenerationMode', reconfigureStart);
    const reconfigure = source.slice(reconfigureStart, reconfigureEnd);
    assert.match(reconfigure, /captureMountedIndependentPlaceholderIndices\(\)/, 'reconfigure must capture loading owners before it clears flight maps');
    for (const reason of ['api-settings-changed', 'generation-source-changed', 'mode-disabled']) {
        const quoted = reason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        assert.match(
            reconfigure,
            new RegExp(`cancelAllIndependentFlights\\(['"]${quoted}['"]\\)[\\s\\S]{0,260}settleMountedIndependentPlaceholders\\([^;]+['"]${quoted}['"]\\)`),
            `${reason} cancellation must settle the placeholders captured before cancellation`,
        );
    }
});

console.log('independentGenerationSettlement: naked Abort visibility and runtime-cancel terminal UI contracts covered');
