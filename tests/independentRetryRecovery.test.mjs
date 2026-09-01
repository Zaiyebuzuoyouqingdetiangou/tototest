import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(ROOT, 'src/independentApi.js'), 'utf8');

// 1) Outer </toto> loss is recoverable only when a complete <details> body exists.
{
    const start = source.indexOf('function extractMirrorInner(raw)');
    const end = source.indexOf('function responseFinishReason', start);
    assert.ok(start >= 0 && end > start, 'extractMirrorInner helper must exist');
    const sandbox = {
        cleanRabbitMirrorOutput: value => String(value || '').trim(),
        globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source.slice(start, end)}\nglobalThis.extractMirrorInner=extractMirrorInner;`, sandbox);
    const extract = sandbox.globalThis.extractMirrorInner;
    assert.equal(extract('<toto data-rabbit-mirror="true"><details><summary>X</summary><div>BODY</div></details></toto>'), '<details><summary>X</summary><div>BODY</div></details>');
    assert.equal(extract('<toto data-rabbit-mirror="true"><details><summary>X</summary><div>BODY</div></details>'), '<details><summary>X</summary><div>BODY</div></details>', 'complete details may survive a lost outer </toto>');
    assert.equal(extract('<toto data-rabbit-mirror="true"><details><summary>X</summary><div>BODY'), '', 'truncated details body must never be auto-accepted');
    assert.equal(extract('<details><summary>ordinary</summary><div>BODY</div></details>'), '', 'unmarked unrelated details must not be claimed');
}

// 2) Execute the real requestIndependentCompletion() body against a fake 524.
// It must stage only the exact non-stream twin and must make exactly one fetch.
{
    const start = source.indexOf('async function requestIndependentCompletion(st,systemPrompt,userPrompt,options={})');
    const end = source.indexOf('function wrappedIndependentMirrorHtml', start);
    assert.ok(start >= 0 && end > start, 'requestIndependentCompletion must exist');

    let fetchCalls = 0;
    let staged = null;
    let forgotten = null;
    const sandbox = {
        getRememberedApiProfile: () => '',
        getStagedApiProfile: () => '',
        independentRequestProfiles: () => [{ name: 'chat_system_user_full', kind: 'chat', body: { model: 'm', messages: [], temperature: 0.8, max_tokens: 30000, stream: true } }],
        normalizeIndependentConnectionText: value => String(value || ''),
        endpoint: () => '/chat/completions',
        nextCompatibilityProfileName: (current, preferNonStreaming) => preferNonStreaming && current === 'chat_system_user_full' ? 'chat_system_user_full_nostream' : '',
        stageManualNonStreamRetry: (_st, current, reason) => {
            assert.equal(current, 'chat_system_user_full');
            assert.equal(reason, 'http-524-gateway-timeout');
            staged = 'chat_system_user_full_nostream';
            forgotten = current;
            return staged;
        },
        stageNextApiProfile: () => { throw new Error('generic parameter stage should not run for 524 exact non-stream path'); },
        forgetRememberedApiProfileIfMatches: () => {},
        normalizedConfiguredTemperature: () => 0.8,
        independentDiagnosticBase: () => 'profile:test',
        profileUsesStreaming: profile => !/nostream/i.test(String(profile || '')),
        profileUsesSystemMessage: profile => !/user_only/i.test(String(profile || '')),
        profileTokenField: profile => /full/i.test(String(profile || '')) ? 'max_tokens' : 'max_completion_tokens',
        publishIndependentApiRequestDiagnostic: value => ({ ...value, ts: 1 }),
        fetchIndependentUrl: async () => { fetchCalls += 1; return { ok: false, status: 524 }; },
        headers: () => ({}),
        readApiResponse: async () => ({ raw: 'A timeout occurred 524', payload: null, text: '', streamed: false }),
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
    vm.runInContext(`${source.slice(start, end)}\nglobalThis.requestIndependentCompletion=requestIndependentCompletion;`, sandbox);
    // This case exercises the legacy/manual OpenAI-compatible transport's HTTP
    // 524 semantics. Connection Manager Profile mode has its own official
    // sendRequest(B) adapter coverage in independentModelList.test.mjs.
    const result = await sandbox.globalThis.requestIndependentCompletion({ independentApiModel: 'm', independentConnectionProfileId: '', independentApiBaseUrl: 'https://manual.example/v1' }, 'S', 'U', {});
    assert.equal(fetchCalls, 1, '524 must never trigger an automatic second paid request');
    assert.equal(staged, 'chat_system_user_full_nostream');
    assert.equal(forgotten, 'chat_system_user_full');
    assert.equal(result.requestDiagnostic.ok, false);
    assert.equal(result.requestDiagnostic.semanticFailure, 'gateway-timeout');
    assert.equal(result.requestDiagnostic.nextProfile, 'chat_system_user_full_nostream');
    assert.equal(result.requestDiagnostic.requestCount, 1);
    assert.equal(result.requestDiagnostic.automaticRetry, false);
}

// 3) Static contract at the semantic boundary: HTTP 200 incomplete mirrors stage
// a same-parameter non-stream manual retry, but token-limit truncation does not.
assert.match(source, /stageManualNonStreamRetry\(st,profile,'http-200-incomplete-mirror'\)/);
assert.match(source, /republishIndependentSemanticFailure\(requestDiagnostic,'incomplete-mirror',next/);
assert.match(source, /republishIndependentSemanticFailure\(requestDiagnostic,'truncated-output',''/);
assert.match(source, /本轮不会自动重发。点击“重新生成兔子镜”时将仅把 stream 改为 false/);

// 4) Resay is transactional: do not delete the last persisted owner before the
// replacement succeeds, and keep a previous ready mirror visible while waiting.
const generateStart = source.indexOf('async function generateFor(index,msg,force=false,sourceAware=true,multifaceResay=null)');
const generateEnd = source.indexOf('function independentHostForRoot', generateStart);
const generateBlock = source.slice(generateStart, generateEnd);
assert.ok(generateBlock.length > 0);
assert.doesNotMatch(generateBlock, /suppressPersistedOwnerForResay\(ctx,index,msg\)/, 'manual resay must not delete the previous persisted owner before success');
assert.doesNotMatch(generateBlock, /if\(!\(force && previousReadyRecord\?\.html\)\)/, 'manual resay must not bypass the shared loading renderer');
assert.match(generateBlock, /collapseDuplicateIdentityHosts[\s\S]*ensureExternalUi\(el,key,'正在读取当前上下文并生成兔子镜……','loading'/, 'manual resay must enter the shared loading renderer that retains ready details and shows status');
assert.match(generateBlock, /if\(force && previousReadyRecord\?\.html\)[\s\S]*ensureExternalUi\(liveEl,key,previousReadyRecord\.html,'ready'/, 'failed resay must restore the known-good mirror');

console.log('independentRetryRecovery: 524 single-shot fallback, incomplete-200 recovery, outer-wrapper rescue and transactional resay passed');
