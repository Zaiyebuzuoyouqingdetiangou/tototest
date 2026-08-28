import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(ROOT, 'src/independentApi.js'), 'utf8');
const uiSource = readFileSync(resolve(ROOT, 'src/ui.js'), 'utf8');
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'manifest.json'), 'utf8'));

function namedFunctionSource(name) {
    const markers = [`async function ${name}(`, `function ${name}(`];
    const start = markers.map(marker => source.indexOf(marker)).find(index => index >= 0) ?? -1;
    assert.ok(start >= 0, `${name} must exist`);
    const open = source.indexOf('{', start);
    assert.ok(open > start, `${name} must have a body`);
    let depth = 0;
    let quote = '';
    let escaped = false;
    let lineComment = false;
    let blockComment = false;
    for (let index = open; index < source.length; index += 1) {
        const char = source[index];
        const next = source[index + 1];
        if (lineComment) {
            if (char === '\n') lineComment = false;
            continue;
        }
        if (blockComment) {
            if (char === '*' && next === '/') { blockComment = false; index += 1; }
            continue;
        }
        if (quote) {
            if (escaped) { escaped = false; continue; }
            if (char === '\\') { escaped = true; continue; }
            if (char === quote) quote = '';
            continue;
        }
        if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
        if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
        if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
        if (char === '{') depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(start, index + 1);
        }
    }
    assert.fail(`could not find the end of ${name}`);
}

function connectionManagerAdapterHarness(serviceSendRequest, { stream = true } = {}) {
    const adapterSource = namedFunctionSource('requestIndependentConnectionProfileCompletion');
    const manager = {
        selectedProfile: 'profile-a',
        profiles: [
            { id: 'profile-a', name: '正文 A', model: 'model-a' },
            { id: 'profile-b', name: '兔子镜 B', model: 'model-b' },
        ],
    };
    const calls = [];
    const runtime = {
        id: 'profile-b',
        profile: manager.profiles[1],
        apiMap: { selected: 'openai', source: 'custom' },
        ctx: {
            extensionSettings: { connectionManager: manager },
            ConnectionManagerRequestService: {
                async sendRequest(...args) {
                    calls.push(args);
                    return serviceSendRequest(...args);
                },
            },
        },
    };
    const requestProfile = {
        name: stream ? 'chat_system_user_full' : 'chat_system_user_full_nostream',
        kind: 'chat',
        body: {
            model: 'model-b',
            messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }],
            temperature: 0.8,
            max_tokens: 15000,
            stream,
        },
    };
    const dispatchLease = { id: 'lease-b' };
    const authorizationCalls = [];
    const responseChecks = [];
    const sandbox = {
        String,
        Number,
        Object,
        Array,
        JSON,
        Error,
        Response,
        Headers,
        TextEncoder,
        TextDecoder,
        ReadableStream,
        normalizeIndependentConnectionText: value => String(value ?? '').trim(),
        authorizeRabbitMirrorIndependentServiceRequest: (...args) => {
            authorizationCalls.push(args);
            return args.find(value => value?.model === 'model-b')
                || args.find(value => value?.body?.model === 'model-b')?.body
                || args.at(-1);
        },
        assertRabbitMirrorIndependentResponseText: value => {
            responseChecks.push(typeof value === 'string' ? value : JSON.stringify(value));
            return value;
        },
        textFromContent: value => {
            if (typeof value === 'string') return value;
            if (Array.isArray(value)) return value.map(item => typeof item === 'string' ? item : item?.text ?? item?.content ?? '').join('');
            return String(value?.text ?? value?.content ?? value?.output_text ?? value?.value ?? '');
        },
        mergeIndependentStreamText: (current = '', incoming = '') => {
            const previous = String(current || '');
            const next = String(incoming || '');
            if (!previous || next.startsWith(previous)) return next || previous;
            if (!next || previous === next) return previous;
            return previous + next;
        },
        extractResponseText: payload => String(payload?.content ?? payload?.choices?.[0]?.message?.content ?? ''),
        extractMirrorInner: value => {
            const match = String(value ?? '').match(/<toto\b[^>]*>([\s\S]*<\/details>)<\/toto>/i);
            return match?.[1] || '';
        },
        globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(`${namedFunctionSource('recoverableCompletedIndependentAbort')}\n${adapterSource}\nglobalThis.adapter=requestIndependentConnectionProfileCompletion;`, sandbox);
    return { adapterSource, adapter: sandbox.globalThis.adapter, runtime, requestProfile, dispatchLease, manager, calls, authorizationCalls, responseChecks };
}

test('Connection Manager stream factory calls profile B once, merges cumulative frames, and salvages a complete body before naked Abort', async () => {
    const complete = '<toto><details><summary>B</summary><div>READY</div></details></toto>';
    const nakedAbort = Object.assign(new Error('provider completed, relay closed with AbortError'), { name: 'AbortError' });
    const harness = connectionManagerAdapterHarness(async () => async function* streamFactory() {
        yield { text: '<toto><details><summary>B</summary><div>' };
        yield { text: complete };
        yield { text: complete };
        throw nakedAbort;
    });

    const output = await harness.adapter(harness.runtime, harness.requestProfile, { dispatchLease: harness.dispatchLease });
    assert.equal(harness.calls.length, 1, 'one RabbitMirror action must dispatch one and only one paid request');
    assert.equal(harness.calls[0][0], 'profile-b', 'the Connection Manager service must receive RabbitMirror profile B, not the active正文 profile A');
    assert.equal(harness.calls[0][4]?.model, 'model-b', 'the override payload must keep RabbitMirror model B');
    assert.equal(harness.calls[0][3]?.stream, true);
    assert.equal(harness.manager.selectedProfile, 'profile-a', 'RabbitMirror must not mutate the globally selected正文 profile');
    assert.equal(output?.response?.ok, true);
    assert.equal(output?.result?.text, complete, 'cumulative snapshots and duplicate final frames must not repeat output');
    assert.equal(output?.result?.terminatedAfterComplete, true, 'a naked transport Abort after complete markup is a recoverable terminal');
    assert.equal(harness.responseChecks.length, 3, 'the response-size guard must inspect the cumulative output after every frame');
    assert.deepEqual(harness.responseChecks, [
        '<toto><details><summary>B</summary><div>',
        complete,
        complete,
    ]);
    assert.equal(harness.authorizationCalls.length, 1, 'the Connection Manager adapter must pass through the same one-dispatch security boundary');
    assert.ok(harness.authorizationCalls[0].includes(harness.dispatchLease) || harness.authorizationCalls[0].some(value => value?.dispatchLease === harness.dispatchLease));
    assert.doesNotMatch(harness.adapterSource, /selectedProfile\s*=/, 'the adapter must never switch Connection Manager global state as a transport shortcut');
});

test('Connection Manager rejects an incomplete stream Abort without a second request', async () => {
    const partial = '<toto><details><summary>B</summary><div>TRUNCATED';
    const nakedAbort = Object.assign(new Error('relay aborted an incomplete stream'), { name: 'AbortError' });
    const harness = connectionManagerAdapterHarness(async () => async function* streamFactory() {
        yield { text: partial };
        throw nakedAbort;
    });

    await assert.rejects(
        () => harness.adapter(harness.runtime, harness.requestProfile, { dispatchLease: harness.dispatchLease }),
        error => {
            assert.equal(error, nakedAbort);
            assert.equal(error.partialResult?.text, partial);
            assert.equal(error.partialResult?.terminatedAfterComplete, false);
            return true;
        },
    );
    assert.equal(harness.calls.length, 1, 'an incomplete response must not trigger any automatic paid retry');
    assert.equal(harness.responseChecks.length, 1, 'even an incomplete frame must pass through the response-size guard');
    assert.equal(harness.manager.selectedProfile, 'profile-a');
});

test('Connection Manager never salvages complete markup after a response-size error', async () => {
    const complete = '<toto><details><summary>B</summary><div>READY</div></details></toto>';
    const sizeError = Object.assign(new Error('response exceeded 2 MiB'), {
        name: 'RabbitMirrorResponseLimitError',
        code: 'RABBIT_MIRROR_RESPONSE_TOO_LARGE',
        limitBytes: 2 * 1024 * 1024,
        observedBytes: 2 * 1024 * 1024 + 1,
    });
    const harness = connectionManagerAdapterHarness(async () => async function* streamFactory() {
        yield { text: complete };
        throw sizeError;
    });

    await assert.rejects(
        () => harness.adapter(harness.runtime, harness.requestProfile, { dispatchLease: harness.dispatchLease }),
        error => error === sizeError && error?.code === 'RABBIT_MIRROR_RESPONSE_TOO_LARGE',
        'only an un-signalled bare AbortError may convert a complete partial response to success',
    );
    assert.equal(harness.calls.length, 1, 'rejecting an oversized completed response must not dispatch a retry');
});

test('Connection Manager never salvages complete markup after a generic non-Abort error', async () => {
    const complete = '<toto><details><summary>B</summary><div>READY</div></details></toto>';
    const decodeError = new TypeError('provider stream decoder failed after a complete-looking frame');
    const harness = connectionManagerAdapterHarness(async () => async function* streamFactory() {
        yield { text: complete };
        throw decodeError;
    });

    await assert.rejects(
        () => harness.adapter(harness.runtime, harness.requestProfile, { dispatchLease: harness.dispatchLease }),
        error => error === decodeError,
        'structural completeness alone must never turn a non-Abort transport failure into success',
    );
    assert.equal(harness.calls.length, 1);
});

test('Connection Manager stream response budget includes hidden reasoning, swipes and state', async () => {
    const complete = '<toto><details><summary>B</summary><div>READY</div></details></toto>';
    const firstFrame = {
        text: '<toto><details><summary>B</summary><div>',
        reasoning: 'HIDDEN_STREAM_REASONING',
    };
    const finalFrame = {
        text: complete,
        swipes: ['HIDDEN_STREAM_SWIPE'],
        state: { private: 'HIDDEN_STREAM_STATE' },
    };
    const harness = connectionManagerAdapterHarness(async () => async function* streamFactory() {
        yield firstFrame;
        yield finalFrame;
    });
    const output = await harness.adapter(harness.runtime, harness.requestProfile, { dispatchLease: harness.dispatchLease });
    assert.equal(output.result.text, complete);
    const checked = harness.responseChecks.join('\n');
    assert.match(checked, /HIDDEN_STREAM_REASONING/, 'stream response limit must count non-visible reasoning bytes');
    assert.match(checked, /HIDDEN_STREAM_SWIPE/, 'stream response limit must count alternate/swipe bytes');
    assert.match(checked, /HIDDEN_STREAM_STATE/, 'stream response limit must count provider state bytes');
    assert.ok(
        harness.responseChecks.some(value => /HIDDEN_STREAM_REASONING/.test(value) && /HIDDEN_STREAM_SWIPE/.test(value) && /HIDDEN_STREAM_STATE/.test(value)),
        'the streamed response budget must accumulate hidden fields across frames, not enforce only a per-frame limit',
    );
    assert.equal(harness.calls.length, 1);
});

test('Connection Manager non-stream response budget includes hidden reasoning, swipes and state', async () => {
    const complete = '<toto><details><summary>B</summary><div>READY</div></details></toto>';
    const response = {
        content: complete,
        reasoning: 'HIDDEN_BUFFERED_REASONING',
        swipes: ['HIDDEN_BUFFERED_SWIPE'],
        state: { private: 'HIDDEN_BUFFERED_STATE' },
    };
    const harness = connectionManagerAdapterHarness(async () => response, { stream: false });
    const output = await harness.adapter(harness.runtime, harness.requestProfile, { dispatchLease: harness.dispatchLease });
    assert.equal(output.result.text, complete);
    const checked = harness.responseChecks.join('\n');
    assert.match(checked, /HIDDEN_BUFFERED_REASONING/, 'non-stream response limit must count hidden reasoning bytes');
    assert.match(checked, /HIDDEN_BUFFERED_SWIPE/, 'non-stream response limit must count alternate/swipe bytes');
    assert.match(checked, /HIDDEN_BUFFERED_STATE/, 'non-stream response limit must count provider state bytes');
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.calls[0][3]?.stream, false);
});

test('profile B status payload never inherits active profile A custom headers', () => {
    const sandbox = { String, Object, Array, JSON, Error, globalThis: {} };
    vm.createContext(sandbox);
    vm.runInContext(`${namedFunctionSource('normalizeIndependentConnectionText')}
${namedFunctionSource('independentConnectionPayload')}
globalThis.payloadFor=independentConnectionPayload;`, sandbox);
    const payload = sandbox.globalThis.payloadFor({
        id: 'profile-b',
        profile: { id: 'profile-b', 'secret-id': 'secret-b', 'api-url': 'https://b.example/v1', proxy: 'B Proxy' },
        apiMap: { selected: 'openai', source: 'custom' },
        ctx: { chatCompletionSettings: { custom_include_headers: 'Authorization: Bearer API_A_SECRET' } },
    }, [{ name: 'B Proxy', url: 'https://proxy-b.example/v1', password: 'proxy-b-password' }]);
    assert.equal(payload.chat_completion_source, 'custom');
    assert.equal(payload.secret_id, 'secret-b');
    assert.equal(payload.custom_url, 'https://b.example/v1');
    assert.equal(payload.reverse_proxy, 'https://proxy-b.example/v1');
    assert.equal(payload.proxy_password, 'proxy-b-password');
    assert.equal(payload.custom_include_headers, '', 'Connection Profile does not save custom headers; never borrow them from正文 A');
    assert.doesNotMatch(JSON.stringify(payload), /API_A_SECRET/, 'profile B request must not inherit custom header state from正文 profile A');
});

test('Profile B model fetch posts a B-only status payload and does not switch正文 A', async () => {
    const manager = {
        selectedProfile: 'profile-a',
        profiles: [
            { id: 'profile-a', 'secret-id': 'secret-a', 'api-url': 'https://a.example/v1', proxy: 'A Proxy' },
            { id: 'profile-b', 'secret-id': 'secret-b', 'api-url': 'https://b.example/v1', proxy: 'B Proxy' },
        ],
    };
    const requests = [];
    const runtime = {
        id: 'profile-b',
        profile: manager.profiles[1],
        apiMap: { selected: 'openai', source: 'custom' },
        ctx: { extensionSettings: { connectionManager: manager } },
    };
    const sandbox = {
        String, Object, Array, JSON, Error, Response,
        getSettings: () => ({ independentConnectionProfileId: 'profile-b' }),
        normalizeIndependentConnectionText: value => String(value ?? '').trim(),
        validatedIndependentConnectionProfile: async id => {
            assert.equal(id, 'profile-b');
            return runtime;
        },
        independentConnectionProxyPresets: async () => [
            { name: 'A Proxy', url: 'https://proxy-a.example/v1', password: 'proxy-a-password' },
            { name: 'B Proxy', url: 'https://proxy-b.example/v1', password: 'proxy-b-password' },
        ],
        customApiBaseFromUrl: value => value,
        serverRequestHeaders: async () => ({ 'Content-Type': 'application/json' }),
        customHeaderYaml: () => '{}',
        fetchRabbitMirrorIndependentCompletion: async () => { throw new Error('generation transport must not run during model fetch'); },
        fetch: async (url, options) => {
            requests.push({ url, options });
            return new Response(JSON.stringify({ data: [{ id: 'b-model' }] }), { status: 200 });
        },
        globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(`
const ST_CUSTOM_STATUS_ENDPOINT='/api/backends/chat-completions/status';
const ST_CUSTOM_GENERATE_ENDPOINT='/api/backends/chat-completions/generate';
${namedFunctionSource('independentModelListError')}
${namedFunctionSource('independentConnectionPayload')}
${source.slice(source.indexOf('async function fetchIndependentUrl('), source.indexOf('function independentModelListError('))}
globalThis.fetchModelsUrl=fetchIndependentUrl;`, sandbox);
    const response = await sandbox.globalThis.fetchModelsUrl('/models', { method: 'GET' });
    assert.equal(response.ok, true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/api/backends/chat-completions/status');
    const body = JSON.parse(requests[0].options.body);
    assert.deepEqual({
        source: body.chat_completion_source,
        secret: body.secret_id,
        url: body.custom_url,
        proxy: body.reverse_proxy,
        proxyPassword: body.proxy_password,
    }, {
        source: 'custom',
        secret: 'secret-b',
        url: 'https://b.example/v1',
        proxy: 'https://proxy-b.example/v1',
        proxyPassword: 'proxy-b-password',
    });
    assert.doesNotMatch(JSON.stringify(body), /secret-a|a\.example|proxy-a/, 'status request must contain no正文 A transport data');
    assert.equal(manager.selectedProfile, 'profile-a');
});

test('model pull returns B remote models and falls back only to B saved models on failure', async () => {
    const run = async ({ fail = false } = {}) => {
        const diagnostics = [];
        const sandbox = {
            String, Number, Object, Array, JSON, Error, Set, Response, AbortController,
            setTimeout, clearTimeout,
            getSettings: () => ({ independentConnectionProfileId: 'profile-b', independentApiBaseUrl: '', independentApiKey: '' }),
            getContext: () => ({}),
            normalizeIndependentConnectionText: value => String(value ?? '').trim(),
            savedIndependentModelsForProfile: () => ['b-saved'],
            validatedIndependentConnectionProfile: async id => ({ id }),
            endpoint: () => '',
            headers: () => ({}),
            fetchIndependentUrl: async () => {
                if (fail) return new Response(JSON.stringify({ error: { message: 'B upstream unavailable' } }), { status: 502 });
                return new Response(JSON.stringify({ data: [{ id: 'b-remote-2' }, { id: 'b-remote-1' }] }), { status: 200 });
            },
            publishIndependentModelListDiagnostic: value => { diagnostics.push(value); return value; },
            globalThis: {},
        };
        vm.createContext(sandbox);
        vm.runInContext(`
const INDEPENDENT_MODEL_LIST_TIMEOUT_MS=12000;
${namedFunctionSource('independentModelListError')}
${namedFunctionSource('compactIndependentPayloadError')}
${namedFunctionSource('independentPayloadHasError')}
${namedFunctionSource('independentModelId')}
${namedFunctionSource('extractIndependentModelList')}
${namedFunctionSource('readIndependentResponsePayload')}
${namedFunctionSource('fetchIndependentModels')}
globalThis.pull=fetchIndependentModels;`, sandbox);
        return { models: Array.from(await sandbox.globalThis.pull()), diagnostics };
    };
    const remote = await run();
    assert.deepEqual(remote.models, ['b-remote-1', 'b-remote-2']);
    assert.equal(remote.diagnostics.at(-1)?.mode, 'remote');
    const fallback = await run({ fail: true });
    assert.deepEqual(fallback.models, ['b-saved']);
    assert.equal(fallback.diagnostics.at(-1)?.mode, 'saved-fallback');
    assert.match(fallback.diagnostics.at(-1)?.error || '', /HTTP 502|B upstream unavailable/);
});

test('manual OpenAI-compatible model pull remains available without the Profile version gate', async () => {
    let profileValidationCalls = 0;
    const sandbox = {
        String, Number, Object, Array, JSON, Error, Set, Response, AbortController,
        setTimeout, clearTimeout,
        getSettings: () => ({ independentConnectionProfileId: '', independentApiBaseUrl: 'https://manual.example/v1', independentApiKey: 'manual-key' }),
        getContext: () => ({}),
        normalizeIndependentConnectionText: value => String(value ?? '').trim(),
        savedIndependentModelsForProfile: () => [],
        validatedIndependentConnectionProfile: async () => { profileValidationCalls += 1; throw new Error('Profile gate must not run'); },
        endpoint: () => 'https://manual.example/v1/models',
        headers: () => ({ Authorization: 'Bearer manual-key' }),
        fetchIndependentUrl: async (url, options) => {
            assert.equal(url, 'https://manual.example/v1/models');
            assert.equal(options.headers.Authorization, 'Bearer manual-key');
            return new Response(JSON.stringify({ data: [{ id: 'manual-model' }] }), { status: 200 });
        },
        publishIndependentModelListDiagnostic: value => value,
        globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(`
const INDEPENDENT_MODEL_LIST_TIMEOUT_MS=12000;
${namedFunctionSource('independentModelListError')}
${namedFunctionSource('compactIndependentPayloadError')}
${namedFunctionSource('independentPayloadHasError')}
${namedFunctionSource('independentModelId')}
${namedFunctionSource('extractIndependentModelList')}
${namedFunctionSource('readIndependentResponsePayload')}
${namedFunctionSource('fetchIndependentModels')}
globalThis.pull=fetchIndependentModels;`, sandbox);
    assert.deepEqual(Array.from(await sandbox.globalThis.pull()), ['manual-model']);
    assert.equal(profileValidationCalls, 0);
});

test('saved-model fallback is scoped to profile B transport and never mixes profile A', () => {
    const manager = {
        selectedProfile: 'profile-a',
        profiles: [
            { id: 'profile-a', mode: 'cc', api: 'custom', 'api-url': 'https://a.example/v1', proxy: '', 'secret-id': 'secret-a', model: 'model-a' },
            { id: 'profile-b', mode: 'cc', api: 'custom', 'api-url': 'https://b.example/v1', proxy: '', 'secret-id': 'secret-b', model: 'model-b' },
            { id: 'profile-b-alt', mode: 'cc', api: 'custom', 'api-url': 'https://b.example/v1', proxy: '', 'secret-id': 'secret-b', model: 'model-b-alt' },
        ],
    };
    const sandbox = { String, Array, JSON, Set, Error, globalThis: {} };
    vm.createContext(sandbox);
    vm.runInContext(`${namedFunctionSource('normalizeIndependentConnectionText')}
${namedFunctionSource('independentConnectionManagerSettings')}
${namedFunctionSource('independentConnectionTransportFingerprint')}
${namedFunctionSource('savedIndependentModelsForProfile')}
globalThis.saved=savedIndependentModelsForProfile;`, sandbox);
    const models = Array.from(sandbox.globalThis.saved('profile-b', { extensionSettings: { connectionManager: manager } }));
    assert.deepEqual(models, ['model-b', 'model-b-alt']);
    assert.doesNotMatch(models.join('|'), /model-a/);
    assert.equal(manager.selectedProfile, 'profile-a', 'reading B fallback models must not alter the active正文 profile');
});

test('one-click Profile support rejects 1.17 before writing settings', async () => {
    let writes = 0;
    const ctx = {
        extensionSettings: { connectionManager: { selectedProfile: 'profile-a', profiles: [{ id: 'profile-a' }] } },
        ConnectionManagerRequestService: { validateProfile() {}, sendRequest() {} },
    };
    const sandbox = {
        String, Error,
        getContext: () => ctx,
        independentConnectionManagerSettings: value => value.extensionSettings.connectionManager,
        assertIndependentConnectionProfileSupport: async () => { throw new Error('仅支持 SillyTavern 1.18.0 及以上版本'); },
        updateSettings: () => { writes += 1; },
        globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(`${namedFunctionSource('importCurrentSillyTavernConnection')}
globalThis.importCurrent=importCurrentSillyTavernConnection;`, sandbox);
    await assert.rejects(() => sandbox.globalThis.importCurrent(), /1\.18\.0/);
    assert.equal(writes, 0, 'old hosts must fail before RabbitMirror saves a Profile reference');
});

test('version and capability gates distinguish pre-1.18 service from secret-id capable service', () => {
    const sandbox = { String, Number, Array, Function, Error, globalThis: {} };
    vm.createContext(sandbox);
    vm.runInContext(`${source.slice(source.indexOf('function independentSemver('), source.indexOf('async function readIndependentSillyTavernVersion('))}
globalThis.gates={independentSemverAtLeast,independentConnectionManagerHasProfileSecrets};`, sandbox);
    assert.equal(sandbox.globalThis.gates.independentSemverAtLeast('SillyTavern 1.17.0'), false);
    assert.equal(sandbox.globalThis.gates.independentSemverAtLeast('SillyTavern:1.18.0:release'), true);
    assert.equal(sandbox.globalThis.gates.independentSemverAtLeast('1.19.2'), true);
    const oldService = { sendRequest() { return { model: 'b' }; } };
    const newService = { sendRequest() { return { secret_id: profile['secret-id'] }; } };
    assert.equal(sandbox.globalThis.gates.independentConnectionManagerHasProfileSecrets(oldService), false);
    assert.equal(sandbox.globalThis.gates.independentConnectionManagerHasProfileSecrets(newService), true);
});

const models = source.slice(source.indexOf('export async function fetchIndependentModels(){'), source.indexOf('export async function testIndependentConnection(){'));
assert.match(models, /savedIndependentModelsForProfile/);
assert.match(models, /mode:'saved-fallback'/);
assert.match(models, /return savedModels/);
assert.match(models, /const url=connectionId\?'\/models'/, 'Profile mode must reach the real status-backed model-list path');
assert.doesNotMatch(models, /mode:'profile-saved'/, 'Profile mode must not pretend local saved models are a remote pull');
assert.match(source, /export function getLastIndependentModelListDiagnostic/);
assert.equal(manifest.minimum_client_version, '1.13.0', '1.18 must gate only Connection Profile reuse, not the whole extension');
assert.match(uiSource, /仅支持 SillyTavern 1\.18\.0 及以上版本；旧版请使用下方“手动 OpenAI 兼容接口”/);
assert.match(uiSource, />拉取模型<\/button>/);

console.log('independentModelList: Profile B remote pull, A isolation, old-host manual fallback and single-dispatch contract covered');
