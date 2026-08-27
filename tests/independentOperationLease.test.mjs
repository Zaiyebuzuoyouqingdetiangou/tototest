import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/independentApi.js', import.meta.url), 'utf8');
const injectorSource = fs.readFileSync(new URL('../src/injector.js', import.meta.url), 'utf8');
const start = source.indexOf('function globalDispatchLeases()');
const end = source.indexOf('\nfunction currentRuntime()', start);
assert.ok(start >= 0 && end > start, 'dispatch lease helpers must exist');

let now = 10000;
const sandbox = {
    GLOBAL_DISPATCH_LEASE_KEY: '__leases',
    GLOBAL_OPERATION_EPOCH_KEY: '__epochs',
    Date: { now: () => now },
    globalThis: {},
};
vm.createContext(sandbox);
vm.runInContext(`${source.slice(start, end)}
globalThis.reserve = reserveAutomaticDispatchLease;
globalThis.advance = advanceOperationEpochForBase;
globalThis.consumed = automaticDispatchAlreadyConsumed;`, sandbox);

const first = sandbox.globalThis.reserve('chat:7:0', 'A');
assert.ok(first);
assert.equal(first.consume(), true);
assert.equal(first.consume(), false, 'one lease cannot dispatch twice');
assert.equal(first.release(), false, 'a consumed lease leaves a tombstone');
assert.equal(sandbox.globalThis.reserve('chat:7:0', 'B'), null, 'A→B rewrite in one host operation cannot reserve again');
assert.equal(sandbox.globalThis.consumed('chat:7:0'), true);

now += 2000;
const epoch = sandbox.globalThis.advance('chat:7:0', 'host-swipe', 'swipe:1:body-B');
const explicit = sandbox.globalThis.reserve('chat:7:0', 'B');
assert.ok(explicit, 'an explicit later host operation receives a new epoch');
assert.equal(explicit.consume(), true);
now += 8000;
assert.equal(sandbox.globalThis.advance('chat:7:0', 'host-regenerate', 'swipe:1:body-B'), epoch, 'duplicate host events for one exact source must coalesce regardless of delay');
assert.equal(sandbox.globalThis.reserve('chat:7:0', 'C'), null, 'coalesced events cannot open a second paid dispatch');

now += 2000;
sandbox.globalThis.advance('chat:8:0', 'host-continue', 'swipe:0:body-A');
const cancelled = sandbox.globalThis.reserve('chat:8:0', 'A');
assert.ok(cancelled);
assert.equal(cancelled.release(), true, 'pre-dispatch cancellation may release a reservation');
assert.ok(sandbox.globalThis.reserve('chat:8:0', 'A'), 'released pre-dispatch reservation may be retried without payment');

assert.match(source, /const cutover=\{authorized:new Map\(\),activeHostGeneration:null/, 'automatic generation must default to an empty authorization map');
assert.match(source, /if\(!cutover\) return true;/, 'missing cutover authorization must fail closed');
assert.match(source, /finishAutomaticHostGeneration\(finishedContext,last\?\.i \?\? -1\)/, 'only an observed START→END operation may authorize completion');
assert.doesNotMatch(source, /normalized>cutover\.maxIndex|cutover\.unlocked/, 'partial-chat max-index cutover must not survive');

const cutoverStart = source.indexOf('function ensureAutomaticGenerationCutover(');
const cutoverEnd = source.indexOf('\nfunction recoverDeferredIndependentGenerations(', cutoverStart);
const cutoverTokenStart = source.indexOf('function automaticCutoverVersionToken(');
assert.ok(cutoverStart >= 0 && cutoverEnd > cutoverStart, 'automatic lifecycle cutover block must exist');
assert.ok(cutoverTokenStart >= 0 && cutoverTokenStart < cutoverStart, 'deferred intent helpers must precede the lifecycle cutover block');
const lifecycleSandbox = {
    automaticGenerationCutovers: new Map(),
    INDEPENDENT_GENERATION_INTENTS_KEY: '__testIntents',
    INDEPENDENT_GENERATION_INTENT_TTL_MS: 300000,
    INDEPENDENT_GENERATION_INTENT_TYPES: new Set(['normal', 'continue', 'swipe', 'regenerate']),
    chatKey: ctx => String(ctx?.key || ''),
    swipeId: message => Number(message?.swipe_id || 0),
    messageBodyFingerprint: message => String(message?.mes || ''),
    Date: { now: () => 12345 },
    Number,
    String,
    Map,
    globalThis: {},
};
vm.createContext(lifecycleSandbox);
vm.runInContext(`${source.slice(cutoverTokenStart, cutoverStart)}
${source.slice(cutoverStart, cutoverEnd)}
globalThis.begin = beginAutomaticHostGeneration;
globalThis.finish = finishAutomaticHostGeneration;
globalThis.suppresses = suppressesAutomaticGeneration;
globalThis.clear = clearAutomaticGenerationCutovers;
globalThis.claimDeferred = claimDeferredIndependentGenerationIntent;`, lifecycleSandbox);

const lifecycleContext = { key: 'chat:nested', chat: [{ is_user: false, mes: 'FINAL', swipe_id: 0 }] };
assert.equal(lifecycleSandbox.globalThis.begin(lifecycleContext, 'normal', false, false), true);
assert.equal(lifecycleSandbox.globalThis.begin(lifecycleContext, 'normal', true, false), true, 'nested tool-call START must preserve the outer owner');
assert.equal(lifecycleSandbox.globalThis.finish(lifecycleContext, 0), true, 'outer START followed by nested START and END must authorize the exact reply');
assert.equal(lifecycleSandbox.globalThis.suppresses(lifecycleContext, 0), false);

lifecycleSandbox.globalThis.clear();
assert.equal(lifecycleSandbox.globalThis.begin(lifecycleContext, 'normal', true, false), false, 'nested START without an outer owner remains denied');
assert.equal(lifecycleSandbox.globalThis.finish(lifecycleContext, 0), false);
assert.equal(lifecycleSandbox.globalThis.suppresses(lifecycleContext, 0), true);

lifecycleSandbox.globalThis.clear();
assert.equal(lifecycleSandbox.globalThis.begin(lifecycleContext, 'normal', false, true), false, 'dry-run START remains denied');
assert.equal(lifecycleSandbox.globalThis.finish(lifecycleContext, 0), false);
assert.equal(lifecycleSandbox.globalThis.suppresses(lifecycleContext, 0), true);

lifecycleSandbox.globalThis.clear();
const deferredContext = {
    key: 'chat:deferred',
    chat: [
        { is_user: true, mes: 'USER_SOURCE' },
        { is_user: false, mes: 'FINAL_ASSISTANT', swipe_id: 0 },
    ],
};
lifecycleSandbox.globalThis.__testIntents = [{
    id: 'intent-1',
    chatKey: 'chat:deferred',
    startedAt: 12345,
    type: 'normal',
    tailIndex: 0,
    tailRole: 'user',
    tailBodyHash: 'USER_SOURCE',
    tailSwipeId: 0,
}];
assert.equal(lifecycleSandbox.globalThis.claimDeferred(deferredContext, 0, 'wrong-history-render'), false, 'a historical render cannot consume a current generation intent');
assert.equal(lifecycleSandbox.globalThis.suppresses(deferredContext, 0), true);
assert.equal(lifecycleSandbox.globalThis.claimDeferred(deferredContext, 1, 'cold-partial', { requireFinalProof: true }), false, 'cold recovery must not consume the first nonempty streaming fragment');
assert.equal(lifecycleSandbox.globalThis.__testIntents.length, 1);
lifecycleSandbox.globalThis.__testIntents = [{
    ...lifecycleSandbox.globalThis.__testIntents[0],
    completedAt: 12345,
    finalIndex: 1,
    finalBodyHash: 'FINAL_ASSISTANT',
}];
assert.equal(lifecycleSandbox.globalThis.claimDeferred(deferredContext, 1, 'exact-final-render', { requireFinalProof: true }), true, 'the exact chat + tail + final-body proof may recover a missing END event');
assert.equal(lifecycleSandbox.globalThis.suppresses(deferredContext, 1), false);
assert.equal(lifecycleSandbox.globalThis.__testIntents.length, 0, 'a recovered intent must be consumed exactly once');

const injectorIntentStart = injectorSource.indexOf("const INDEPENDENT_GENERATION_INTENTS_KEY =");
const injectorIntentEnd = injectorSource.indexOf('\nfunction loadPromptBuilder()', injectorIntentStart);
assert.ok(injectorIntentStart >= 0 && injectorIntentEnd > injectorIntentStart, 'lightweight intent bridge block must exist');
const liveRawChat = [{ is_user: false, mes: 'RAW_CURRENT_ASSISTANT', swipe_id: 0 }];
let rawContextReads = 0;
const injectorSandbox = {
    Date: { now: () => 777 },
    Math,
    Number,
    Object,
    String,
    Set,
    eventSource: { on() {}, off() {} },
    event_types: {},
    getCurrentChatKey: () => 'chat:raw-proof',
    independentGenerationIntentSequence: 0,
    globalThis: { SillyTavern: { getContext: () => { rawContextReads += 1; return { chat: liveRawChat }; } } },
};
vm.createContext(injectorSandbox);
vm.runInContext(`${injectorSource.slice(injectorIntentStart, injectorIntentEnd).replace(/^export /gm, '')}
globalThis.recordIntent = recordIndependentGenerationIntent;
globalThis.markIntentCompleted = markIndependentGenerationIntentCompleted;
globalThis.intentHash = hashIndependentIntentText;`, injectorSandbox);
assert.equal(injectorSandbox.globalThis.recordIntent([{ is_user: false, mes: 'PROMPT_TRANSFORMED_ASSISTANT', swipe_id: 0 }], 'quiet'), null, 'quiet/impersonate background generations must not create recovery intents');
const rawAnchoredIntent = injectorSandbox.globalThis.recordIntent([{ is_user: false, mes: 'PROMPT_TRANSFORMED_ASSISTANT', swipe_id: 0 }], 'regenerate');
assert.equal(rawAnchoredIntent.tailBodyHash, injectorSandbox.globalThis.intentHash('RAW_CURRENT_ASSISTANT'), 'assistant-tail proof must anchor to SillyTavern raw current正文, not prompt-transformed _chat');
liveRawChat[0].mes = 'FINAL_RAW_ASSISTANT';
assert.equal(injectorSandbox.globalThis.markIntentCompleted(0, 'character-rendered'), true);
const completedIntent = injectorSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents[0];
assert.equal(completedIntent.finalIndex, 0);
assert.equal(completedIntent.finalBodyHash, injectorSandbox.globalThis.intentHash('FINAL_RAW_ASSISTANT'), 'lightweight final-render proof must bind the exact final raw正文 hash');
injectorSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents = [];
const readsAfterCompletion = rawContextReads;
assert.equal(injectorSandbox.globalThis.markIntentCompleted(0, 'no-intent'), false);
assert.equal(rawContextReads, readsAfterCompletion, 'host completion events with no pending intent must not read or scan the current chat');

function extractFunction(sourceText, name) {
    const start = sourceText.indexOf(`function ${name}(`);
    const asyncStart = sourceText.indexOf(`async function ${name}(`);
    const exportAsyncStart = sourceText.indexOf(`export async function ${name}(`);
    const actualStart = [start, asyncStart, exportAsyncStart].filter(value => value >= 0).sort((a, b) => a - b)[0];
    assert.ok(Number.isInteger(actualStart), `missing ${name}`);
    const bodyStart = sourceText.indexOf('{', actualStart);
    let depth = 0;
    for (let index = bodyStart; index < sourceText.length; index += 1) {
        if (sourceText[index] === '{') depth += 1;
        else if (sourceText[index] === '}') {
            depth -= 1;
            if (depth === 0) return sourceText.slice(actualStart, index + 1).replace(/^export\s+/, '');
        }
    }
    throw new Error(`unterminated ${name}`);
}

{
    const activeHandlers = new Map();
    let onCount = 0;
    let offCount = 0;
    let oldCleanupCalls = 0;
    const eventSource = {
        on(event, handler) { onCount += 1; activeHandlers.set(handler, event); },
        off(_event, handler) { offCount += 1; activeHandlers.delete(handler); },
    };
    const bridgeSandbox = {
        Date: { now: () => 777 }, Math, Number, Object, String, Set,
        eventSource,
        event_types: { GENERATION_ENDED: 'END', GENERATION_STOPPED: 'STOP', CHARACTER_MESSAGE_RENDERED: 'RENDER' },
        getCurrentChatKey: () => 'chat:bridge',
        globalThis: { __rabbitMirrorIndependentGenerationIntentBridgeCleanup: () => { oldCleanupCalls += 1; } },
    };
    vm.createContext(bridgeSandbox);
    vm.runInContext(`${injectorSource.slice(injectorIntentStart, injectorIntentEnd).replace(/^export /gm, '')}
globalThis.initBridge=initIndependentGenerationIntentBridge;
globalThis.destroyBridge=destroyIndependentGenerationIntentBridge;`, bridgeSandbox);
    bridgeSandbox.globalThis.initBridge();
    assert.equal(oldCleanupCalls, 1, 'new cache-busted module must hand off cleanup to the previous module');
    assert.equal(activeHandlers.size, 3);
    bridgeSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents = [{ id: 'keep-me', startedAt: 777, type: 'normal' }];
    bridgeSandbox.globalThis.initBridge();
    assert.equal(activeHandlers.size, 3, 'repeated init must replace, not stack, the three host listeners');
    assert.equal(offCount, 3);
    assert.equal(bridgeSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents.length, 1, 'hot update cleanup must preserve pending intent proof');
    bridgeSandbox.globalThis.destroyBridge({ clearIntents: true });
    assert.equal(activeHandlers.size, 0);
    assert.equal(onCount, 6);
    assert.equal(offCount, 6);
    assert.equal(bridgeSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents, undefined);
}

{
    let settings = { generationSource: 'independent', enabled: false, autoRabbitMirrorInjection: true, mode: 'random' };
    let recordCount = 0;
    let clearCount = 0;
    const interceptorSandbox = {
        globalThis: {},
        getSettings: () => settings,
        recordIndependentGenerationIntent: () => { recordCount += 1; },
        clearRabbitMirrorPrompt: () => { clearCount += 1; },
    };
    vm.createContext(interceptorSandbox);
    vm.runInContext(`${extractFunction(injectorSource, 'rabbitMirrorGenerateInterceptor')}
globalThis.intercept=rabbitMirrorGenerateInterceptor;`, interceptorSandbox);
    for (const patch of [
        { enabled: false, autoRabbitMirrorInjection: true, mode: 'random' },
        { enabled: true, autoRabbitMirrorInjection: false, mode: 'random' },
        { enabled: true, autoRabbitMirrorInjection: true, mode: 'off' },
    ]) {
        settings = { generationSource: 'independent', ...patch };
        await interceptorSandbox.globalThis.intercept([], 0, null, 'normal');
    }
    assert.equal(recordCount, 0, 'disabled independent generation must not wake the deferred runtime');
    assert.equal(clearCount, 3, 'disabled independent generation must still clear any stale main prompt');
    settings = { generationSource: 'independent', enabled: true, autoRabbitMirrorInjection: true, mode: 'random' };
    await interceptorSandbox.globalThis.intercept([], 0, null, 'normal');
    assert.equal(recordCount, 1);
    assert.equal(clearCount, 4);
}

console.log('independent operation lease: one paid dispatch per host-operation epoch passed');
