import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(ROOT, 'src/independentApi.js'), 'utf8');

function extractFunction(sourceText, name) {
    const starts = [
        sourceText.indexOf(`function ${name}(`),
        sourceText.indexOf(`async function ${name}(`),
    ].filter(value => value >= 0).sort((a, b) => a - b);
    assert.ok(starts.length, `missing ${name}`);
    const actualStart = starts[0];
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

const helperStart = source.indexOf('const HISTORICAL_RABBIT_MIRROR_BLOCK_RE=');
const helperEnd = source.indexOf('// 1.3.91:', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'context filtering block must exist');

let currentSettings = {
    independentConnectionProfileId: 'profile-a',
    independentApiModel: 'model-b',
    independentApiTemperature: 0.8,
    independentApiMaxTokens: 15000,
    independentContextMaxLayers: 20,
    independentContextExcludedTags: ['thinking'],
};
const helperSandbox = {
    getSettings: () => currentSettings,
    isRabbitMirrorEligibleAssistantMessage: message => !!message
        && message.is_user !== true
        && message.is_system !== true
        && message?.extra?.isSmallSys !== true
        && !Object.prototype.hasOwnProperty.call(message?.extra || {}, 'tool_invocations')
        && typeof message.mes === 'string',
    normalizeIndependentContextExcludedTags: value => [...new Set((Array.isArray(value) ? value : [])
        .map(item => String(item || '').toLowerCase())
        .filter(item => /^[a-z][a-z0-9._:-]{0,63}$/.test(item)))].slice(0, 32),
    safeJson: (value, max) => JSON.stringify(value ?? null).slice(0, max),
    globalWorldInfoContextView: () => ({ block: '' }),
    independentContextChatMetadata: () => ({}),
    CONTEXT_TRANSCRIPT_BUDGET: 12000,
    CONTEXT_TOTAL_BUDGET: 20000,
    GLOBAL_WORLD_INFO_CONTEXT_BUDGET: 6000,
    INDEPENDENT_VISIBLE_TEXT_CACHE_LIMIT: 12,
    globalThis: {},
};
vm.createContext(helperSandbox);
vm.runInContext(`${source.slice(helperStart, helperEnd)}
globalThis.bundle=contextBundle;
globalThis.reader=createIndependentVisibleTextReader;`, helperSandbox);
const contextBundle = helperSandbox.globalThis.bundle;
const createReader = helperSandbox.globalThis.reader;

// Removing a selected block must reduce the actual prompt. Its original size
// still consumes the 12k transcript-selection budget, so older rows cannot
// silently replace the private content and leave the model input saturated.
{
    const chat = [
        { is_user: true, mes: 'OLDER_0_' + '甲'.repeat(1400) },
        { is_user: false, mes: 'OLDER_1_' + '乙'.repeat(1400) },
        { is_user: false, mes: 'TARGET_SOURCE' },
    ];
    const reader = (message, index) => index === 2
        ? {
            text: 'TARGET_VISIBLE_' + '丙'.repeat(850),
            filteredRabbitMirrorChars: 0,
            filteredExcludedTagChars: 11100,
            filteredExcludedTags: ['thinking'],
        }
        : {
            text: message.mes,
            filteredRabbitMirrorChars: 0,
            filteredExcludedTagChars: 0,
            filteredExcludedTags: [],
        };
    reader.renderedIndexes = [2, 1, 0];
    const result = contextBundle({ chat }, 2, null, null, 20000, reader);
    assert.equal(result.layers, 1, 'filtered characters must occupy selection budget instead of backfilling older rows');
    assert.match(result.text, /TARGET_VISIBLE_/);
    assert.doesNotMatch(result.text, /OLDER_0_|OLDER_1_/);
    assert.equal(result.filteredExcludedTagChars, 11100);
    assert.ok(result.transcriptChars < 2000, `the sent transcript should shrink after filtering, got ${result.transcriptChars}`);
    assert.ok(result.transcriptChars <= 12000 && result.text.length <= 20000);
}

// A long visible row is compacted to a bounded head + tail before dispatch.
// With no selected tag removed, only that compacted text may consume the 12k
// selection budget; the discarded middle must not evict a short useful layer.
{
    currentSettings = { ...currentSettings, independentContextExcludedTags: [] };
    const chat = [
        { is_user: true, mes: 'OLDER_USEFUL_' + '前情'.repeat(900) },
        { is_user: false, mes: 'TARGET_HEAD_' + '正文'.repeat(6500) + '_TARGET_TAIL' },
    ];
    const reader = (message) => ({
        text: message.mes,
        filteredRabbitMirrorChars: 0,
        filteredExcludedTagChars: 0,
        filteredExcludedTags: [],
    });
    reader.renderedIndexes = [1, 0];
    const result = contextBundle({ chat }, 1, null, null, 20000, reader);
    assert.equal(result.layers, 2, 'the compacted visible row must leave room for the useful older layer');
    assert.match(result.text, /OLDER_USEFUL_/);
    assert.match(result.text, /TARGET_HEAD_/);
    assert.match(result.text, /_TARGET_TAIL/);
    assert.equal(result.filteredExcludedTagChars, 0);
    assert.ok(result.transcriptChars <= 12000 && result.text.length <= 20000);
    currentSettings = { ...currentSettings, independentContextExcludedTags: ['thinking'] };
}

// Exercise the actual paid-request seam. The selected wrapper and its contents
// must be absent from the user prompt, while the source chat object stays byte-for-byte
// equivalent to its preflight value.
{
    let capturedRequest = null;
    const callSandbox = {
        getSettings: () => currentSettings,
        swipeId: message => Number(message?.swipe_id || 0),
        createIndependentVisibleTextReader: createReader,
        isRabbitMirrorEligibleAssistantMessage: helperSandbox.isRabbitMirrorEligibleAssistantMessage,
        buildRabbitMirrorPromptDetails: () => ({ prompt: 'BASE_RULES', executionLock: 'EXECUTION_LOCK', metadata: {} }),
        INDEPENDENT_BEHAVIOR_PATCH: '',
        MAX_INDEPENDENT_REQUEST_CHARS: 32000,
        globalWorldInfoSnapshotFor: () => null,
        globalWorldInfoContextView: () => ({ block: '', includedEntries: 0, totalEntries: 0, chars: 0, truncated: false }),
        contextBundle,
        recordRabbitMirrorIndependentPrompt: () => {},
        requestIndependentCompletion: async (settings, systemPrompt, userPrompt) => {
            capturedRequest = { settings, systemPrompt, userPrompt };
            return {
                response: { ok: true, status: 200 },
                result: { text: '<toto><details><summary>OK</summary><div>BODY</div></details></toto>', payload: {} },
                profile: 'chat_system_user_full',
                attempts: 1,
                requestDiagnostic: { ok: true },
                semanticError: '',
            };
        },
        compactRemoteError: () => '',
        profileUsesStreaming: () => true,
        assertIndependentMarkupComplexityWithDiagnostic: () => {},
        extractMirrorInner: raw => String(raw).replace(/^<toto>/, '').replace(/<\/toto>$/, ''),
        responseFinishReason: () => '',
        stageManualNonStreamRetry: () => '',
        republishIndependentSemanticFailure: () => {},
        independentMirrorBodyEvidence: () => true,
        independentVisualProgramIntegrity: () => ({ ok: true }),
        prepareIndependentReadyHtml: value => String(value || ''),
        wrappedIndependentMirrorHtml: value => `<toto>${String(value || '')}</toto>`,
        scanRabbitMirrorHtml: () => ({ interactionFamily: null, riskFlags: [] }),
        evaluateIndependentPostSanitizeQuality: () => ({ ok: true, code: 'ok', message: '', flags: [] }),
        rememberIndependentQualityFailure: () => {},
        clearIndependentQualityFailure: () => {},
        rememberApiProfile: () => {},
        recentIndependentVisualGuard: () => '',
        manualRetryVisualGuard: () => '',
        Date,
        Number,
        String,
        Math,
        Object,
        Array,
        Error,
        globalThis: {},
    };
    vm.createContext(callSandbox);
    vm.runInContext(`${extractFunction(source, 'callIndependentApi')}
globalThis.call=callIndependentApi;`, callSandbox);
    const ctx = {
        chat: [
            { is_user: true, mes: 'USER_VISIBLE<thinking>USER_PRIVATE</thinking>' },
            { is_user: false, mes: '<thinking data-private="yes">TARGET_PRIVATE</thinking><p>TARGET_VISIBLE</p>' },
        ],
    };
    const before = JSON.parse(JSON.stringify(ctx.chat));
    await callSandbox.globalThis.call(ctx, 1, ctx.chat[1], { aborted: false }, {});
    assert.ok(capturedRequest, 'one request must reach the paid-request boundary');
    assert.match(capturedRequest.userPrompt, /USER_VISIBLE|TARGET_VISIBLE/);
    assert.doesNotMatch(capturedRequest.userPrompt, /USER_PRIVATE|TARGET_PRIVATE|<\/?thinking\b|data-private/i);
    assert.deepEqual(ctx.chat, before, 'context filtering must not rewrite SillyTavern chat messages');
}

console.log('independentTagBudgetRegression: no-backfill budget and paid-request privacy covered');
