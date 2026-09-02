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
assert.match(source, /noteAutomaticHostGenerationTerminal\(finishedContext/, 'END must only record a terminal hint for an observed visible owner');
assert.match(source, /noteAutomaticHostGenerationRender\(ctx,id\)/, 'an exact final render must participate in lifecycle authorization');
assert.doesNotMatch(source, /normalized>cutover\.maxIndex|cutover\.unlocked/, 'partial-chat max-index cutover must not survive');

const cutoverStart = source.indexOf('function ensureAutomaticGenerationCutover(');
const cutoverEnd = source.indexOf('\nfunction recoverDeferredIndependentGenerations(', cutoverStart);
const cutoverTokenStart = source.indexOf('function automaticCutoverVersionToken(');
assert.ok(cutoverStart >= 0 && cutoverEnd > cutoverStart, 'automatic lifecycle cutover block must exist');
assert.ok(cutoverTokenStart >= 0 && cutoverTokenStart < cutoverStart, 'deferred intent helpers must precede the lifecycle cutover block');
const lifecycleSandbox = {
    automaticGenerationCutovers: new Map(),
    INDEPENDENT_GENERATION_INTENTS_KEY: '__testIntents',
    INDEPENDENT_GENERATION_STOPS_KEY: '__testStops',
    runtimeMode: () => 'independent',
    INDEPENDENT_GENERATION_INTENT_TTL_MS: 300000,
    INDEPENDENT_GENERATION_INTENT_TYPES: new Set(['normal', 'continue', 'swipe', 'regenerate']),
    hostModule: { main_api: 'openai', streamingProcessor: null },
    chatKey: ctx => String(ctx?.key || ''),
    swipeId: message => Number(message?.swipe_id || 0),
    messageBodyFingerprint: message => String(message?.mes || ''),
    isRabbitMirrorToolResultMessage: message => message?.is_system === true
        || message?.extra?.isSmallSys === true
        || Object.prototype.hasOwnProperty.call(message?.extra || {}, 'tool_invocations'),
    isRabbitMirrorEligibleAssistantMessage: message => !!message
        && message.is_user !== true
        && message.is_system !== true
        && message?.extra?.isSmallSys !== true
        && !Object.prototype.hasOwnProperty.call(message?.extra || {}, 'tool_invocations')
        && typeof message.mes === 'string',
    lastAssistantMessage: ctx => {
        for (let index = (ctx?.chat?.length || 0) - 1; index >= 0; index -= 1) {
            const message = ctx.chat[index];
            if (lifecycleSandbox.isRabbitMirrorEligibleAssistantMessage(message)) return { i: index, m: message };
        }
        return null;
    },
    Date: { now: () => 12345 },
    clearTimeout: () => {},
    Number,
    String,
    Map,
    globalThis: {},
};
vm.createContext(lifecycleSandbox);
const classifierStart = source.indexOf('function isRabbitMirrorToolResultMessage(');
const classifierEnd = source.indexOf('function assistantMessages(', classifierStart);
assert.ok(classifierStart >= 0 && classifierEnd > classifierStart);
vm.runInContext(`${source.slice(classifierStart, classifierEnd)}
${source.slice(cutoverTokenStart, cutoverStart)}
${source.slice(cutoverStart, cutoverEnd)}
globalThis.begin = beginAutomaticHostGeneration;
globalThis.terminal = noteAutomaticHostGenerationTerminal;
globalThis.render = noteAutomaticHostGenerationRender;
globalThis.candidate = automaticHostGenerationSettlementCandidate;
globalThis.settle = settleAutomaticHostGeneration;
globalThis.suppresses = suppressesAutomaticGeneration;
globalThis.clear = clearAutomaticGenerationCutovers;
globalThis.claimDeferred = claimDeferredIndependentGenerationIntent;`, lifecycleSandbox);

const lifecycleContext = { key: 'chat:nested', chat: [{ is_user: true, mes: 'USER', swipe_id: 0 }] };
assert.equal(lifecycleSandbox.globalThis.begin(lifecycleContext, 'normal', false, false), 'new');
lifecycleContext.chat.push({ is_user: false, mes: 'INTERMEDIATE', swipe_id: 0 });
assert.equal(lifecycleSandbox.globalThis.render(lifecycleContext, 1), true);
lifecycleContext.chat.push({ is_user: false, is_system: true, mes: 'TOOL RESULT', extra: { isSmallSys: true, tool_invocations: [{}] } });
assert.equal(lifecycleSandbox.globalThis.begin(lifecycleContext, 'normal', true, false), 'nested', 'nested tool-call START must preserve the outer owner and advance its proof phase');
lifecycleContext.chat.push({ is_user: false, mes: 'FINAL', swipe_id: 0 });
assert.equal(lifecycleSandbox.globalThis.terminal(lifecycleContext, 'outer-end'), 'terminal');
assert.equal(lifecycleSandbox.globalThis.render(lifecycleContext, 3), true);
assert.equal(lifecycleSandbox.globalThis.candidate(lifecycleContext, { externalActive: false })?.index, 3);
assert.equal(lifecycleSandbox.globalThis.settle(lifecycleContext, 3), true, 'only the current phase exact render may authorize the reply');
assert.equal(lifecycleSandbox.globalThis.suppresses(lifecycleContext, 3), false);

lifecycleSandbox.globalThis.clear();
assert.equal(lifecycleSandbox.globalThis.begin(lifecycleContext, 'normal', true, false), false, 'nested START without an outer owner remains denied');
assert.equal(lifecycleSandbox.globalThis.terminal(lifecycleContext, 'orphan-end'), false);
assert.equal(lifecycleSandbox.globalThis.settle(lifecycleContext, 0), false);
assert.equal(lifecycleSandbox.globalThis.suppresses(lifecycleContext, 0), true);

lifecycleSandbox.globalThis.clear();
assert.equal(lifecycleSandbox.globalThis.begin(lifecycleContext, 'normal', false, true), false, 'dry-run START remains denied');
assert.equal(lifecycleSandbox.globalThis.terminal(lifecycleContext, 'unrelated-end'), false);
assert.equal(lifecycleSandbox.globalThis.settle(lifecycleContext, 0), false);
assert.equal(lifecycleSandbox.globalThis.suppresses(lifecycleContext, 0), true);

lifecycleSandbox.globalThis.clear();
const deferredContext = {
    key: 'chat:deferred',
    chat: [
        { is_user: true, mes: 'USER_SOURCE' },
        { is_user: false, mes: 'FINAL_ASSISTANT', swipe_id: 0 },
        { is_user: true, mes: 'SECOND_USER_SOURCE' },
        { is_user: false, mes: 'SECOND_FINAL_ASSISTANT', swipe_id: 0 },
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
    terminalAt: 12345,
    finalIndex: 1,
    finalBodyHash: 'FINAL_ASSISTANT',
    finalProof: 'exact-render',
}, {
    id: 'intent-2', chatKey: 'chat:deferred', startedAt: 12345, type: 'normal',
    tailIndex: 2, tailRole: 'user', tailBodyHash: 'SECOND_USER_SOURCE', tailSwipeId: 0,
    completedAt: 12345, terminalAt: 12345, finalIndex: 3,
    finalBodyHash: 'SECOND_FINAL_ASSISTANT', finalProof: 'exact-render',
}];
assert.equal(lifecycleSandbox.globalThis.claimDeferred(deferredContext, 1, 'exact-final-render', { requireFinalProof: true }), true, 'the exact chat + tail + final-body proof may recover a missing END event');
assert.equal(lifecycleSandbox.globalThis.suppresses(deferredContext, 1), false);
assert.equal([...lifecycleSandbox.globalThis.__testIntents].map(intent => intent.id).join(','), 'intent-2', 'claiming the first completed reply must preserve another completed intent from the same chat');
assert.equal(lifecycleSandbox.globalThis.claimDeferred(deferredContext, 3, 'second-exact-final-render', { requireFinalProof: true }), true);
assert.equal(lifecycleSandbox.globalThis.suppresses(deferredContext, 3), false);
assert.equal(lifecycleSandbox.globalThis.__testIntents.length, 0, 'completed intents must be consumed one exact target at a time');

const injectorIntentStart = injectorSource.indexOf("const INDEPENDENT_GENERATION_INTENTS_KEY =");
const injectorIntentEnd = injectorSource.indexOf('\nfunction loadPromptBuilder()', injectorIntentStart);
assert.ok(injectorIntentStart >= 0 && injectorIntentEnd > injectorIntentStart, 'lightweight intent bridge block must exist');
const liveRawChat = [{ is_user: false, mes: 'RAW_CURRENT_ASSISTANT', swipe_id: 0 }];
let rawContextReads = 0;
let hostToolCapability = true;
const injectorSandbox = {
    Date: { now: () => 777 },
    Math,
    Number,
    Object,
    String,
    Set,
    hostRuntime: { main_api: 'openai', streamingProcessor: null },
    eventSource: { on() {}, off() {} },
    event_types: {},
    getCurrentChatKey: () => 'chat:raw-proof',
    independentGenerationIntentSequence: 0,
    globalThis: { SillyTavern: { getContext: () => { rawContextReads += 1; return { chat: liveRawChat, canPerformToolCalls: () => hostToolCapability }; } } },
};
vm.createContext(injectorSandbox);
vm.runInContext(`${injectorSource.slice(injectorIntentStart, injectorIntentEnd).replace(/^export /gm, '')}
globalThis.recordIntent = recordIndependentGenerationIntent;
globalThis.markIntentCompleted = markIndependentGenerationIntentCompleted;
globalThis.markIntentTerminal = markIndependentGenerationIntentTerminal;
globalThis.intentHash = hashIndependentIntentText;
globalThis.capability = independentHostGenerationMayUseTools;`, injectorSandbox);
assert.equal(injectorSandbox.globalThis.recordIntent([{ is_user: false, mes: 'PROMPT_TRANSFORMED_ASSISTANT', swipe_id: 0 }], 'quiet'), null, 'quiet/impersonate background generations must not create recovery intents');
const rawAnchoredIntent = injectorSandbox.globalThis.recordIntent([{ is_user: false, mes: 'PROMPT_TRANSFORMED_ASSISTANT', swipe_id: 0 }], 'regenerate');
assert.equal(rawAnchoredIntent.tailBodyHash, injectorSandbox.globalThis.intentHash('RAW_CURRENT_ASSISTANT'), 'assistant-tail proof must anchor to SillyTavern raw current正文, not prompt-transformed _chat');
assert.equal(injectorSandbox.globalThis.recordIntent(liveRawChat, 'quiet'), null);
liveRawChat[0].mes = 'FINAL_RAW_ASSISTANT';
injectorSandbox.hostRuntime.streamingProcessor = { messageId: 0, isFinished: true, toolCalls: [{}] };
assert.equal(injectorSandbox.globalThis.markIntentCompleted(0, 'stream-tool-intermediate'), true);
assert.equal(injectorSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents[0].finalBodyHash, undefined, 'a live streaming tool-call render must never create final proof');
injectorSandbox.hostRuntime.streamingProcessor = null;
assert.equal(injectorSandbox.globalThis.markIntentTerminal('generation-ended'), true);
assert.equal(injectorSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents[0].terminalAt, undefined, 'the first unscoped END after an auxiliary START must be consumed as ambiguous');
assert.equal(injectorSandbox.globalThis.markIntentTerminal('outer-generation-ended'), true);
assert.equal(injectorSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents[0].finalBodyHash, undefined, 'unscoped END must never fabricate final正文 proof');
assert.equal(injectorSandbox.globalThis.markIntentCompleted(liveRawChat.length, 'invalid-generation-ended-payload'), false, 'chat.length END payload must not fall back to the assistant tail');
assert.equal(injectorSandbox.globalThis.markIntentCompleted(0, 'character-rendered'), true);
const completedIntent = injectorSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents[0];
assert.equal(completedIntent.finalIndex, 0);
assert.equal(completedIntent.finalBodyHash, injectorSandbox.globalThis.intentHash('FINAL_RAW_ASSISTANT'), 'lightweight final-render proof must bind the exact final raw正文 hash');
assert.equal(
    injectorSandbox.globalThis.markIntentCompleted(liveRawChat[0], 'character-rendered-object-payload'),
    true,
    'lightweight completion must resolve a host chat message object by the same identity semantics as chat.indexOf(payload)',
);
assert.equal(injectorSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents[0].finalIndex, 0);
liveRawChat.push({ is_user: false, is_system: true, mes: 'TOOL RESULT', extra: { isSmallSys: true, tool_invocations: [{}] } });
const nestedIntent = injectorSandbox.globalThis.recordIntent(liveRawChat, 'normal');
assert.equal(nestedIntent.tailRole, 'system');
assert.equal(injectorSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents.length, 1, 'nested START must supersede the pre-tool render proof for this chat');
assert.notEqual(injectorSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents[0].id, completedIntent.id);
liveRawChat.push({ is_user: false, mes: 'FINAL_AFTER_TOOL', swipe_id: 0 });
assert.equal(injectorSandbox.globalThis.markIntentCompleted(2, 'character-rendered'), true);
assert.equal(injectorSandbox.globalThis.markIntentTerminal('generation-ended'), true);
assert.equal(injectorSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents[0].finalIndex, 2);
injectorSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents = [];
liveRawChat.splice(0, liveRawChat.length, { is_user: true, mes: 'NO-TOOL USER' });
hostToolCapability = false;
injectorSandbox.globalThis.recordIntent(liveRawChat, 'normal');
injectorSandbox.globalThis.recordIntent(liveRawChat, 'quiet');
injectorSandbox.globalThis.markIntentTerminal('only-quiet-hide-stop-edge');
liveRawChat.push({ is_user: false, mes: 'NO-TOOL FINAL' });
injectorSandbox.globalThis.markIntentCompleted(1, 'final-without-second-end');
const noToolIntent = injectorSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents.at(-1);
assert.equal(noToolIntent.terminalAt, undefined);
assert.equal(noToolIntent.toolCapable, false);
assert.equal(noToolIntent.finalProof, 'non-tool-final', 'cold-runtime proof also recovers a no-tool final when quiet consumed the only END');
hostToolCapability = true;
injectorSandbox.globalThis.markIntentCompleted(1, 'tool-capability-enabled');
hostToolCapability = false;
injectorSandbox.globalThis.markIntentCompleted(1, 'tool-capability-later-disabled');
const upgradedNoToolIntent = injectorSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents.find(intent => intent.id === noToolIntent.id);
assert.equal(upgradedNoToolIntent.toolCapable, true, 'tool ambiguity is monotonic for an in-flight intent');
assert.equal(upgradedNoToolIntent.finalProof, 'exact-render');
assert.equal(injectorSandbox.globalThis.capability('normal', { canPerformToolCalls: () => { throw new Error('unavailable'); }, chatCompletionSettings: { function_calling: false } }), true);
const retainedFirstIntent = upgradedNoToolIntent;
liveRawChat.push({ is_user: true, mes: 'SECOND USER REQUEST' });
const secondVisibleIntent = injectorSandbox.globalThis.recordIntent(liveRawChat, 'normal');
assert.equal(
    [...injectorSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents].map(intent => intent.id).join(','),
    `${retainedFirstIntent.id},${secondVisibleIntent.id}`,
    'a second visible START must preserve the first reply completed before the deferred runtime woke',
);
liveRawChat.push({ is_user: false, mes: 'SECOND FINAL', swipe_id: 0 });
assert.equal(injectorSandbox.globalThis.markIntentCompleted(3, 'second-character-rendered'), true);
assert.equal(injectorSandbox.globalThis.markIntentTerminal('second-generation-ended'), true);
assert.equal(injectorSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents.filter(intent => Number(intent.completedAt) > 0).length, 2, 'the next delayed wake must retain both recoverable completed proofs');
injectorSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents = [];
injectorSandbox.globalThis.__rabbitMirrorIndependentStoppedHostOperations = [{ chatKey: 'chat:raw-proof', startedAt: 777 }];
liveRawChat.push({ is_user: false, is_system: true, mes: 'LATE TOOL RESULT', extra: { tool_invocations: [{}] } });
assert.equal(injectorSandbox.globalThis.recordIntent(liveRawChat, 'normal'), null, 'a cold interceptor must also reject recursive START from a stopped operation');
assert.equal(injectorSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents.length, 0);
liveRawChat.push({ is_user: true, mes: 'NEW USER REQUEST' });
assert.ok(injectorSandbox.globalThis.recordIntent(liveRawChat, 'normal'));
assert.equal(injectorSandbox.globalThis.__rabbitMirrorIndependentStoppedHostOperations.length, 0);
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
        hostRuntime: { main_api: 'openai', streamingProcessor: null },
        eventSource,
        event_types: { GENERATION_ENDED: 'END', GENERATION_STOPPED: 'STOP', CHARACTER_MESSAGE_RENDERED: 'RENDER', CHAT_CHANGED: 'CHAT' },
        getCurrentChatKey: () => 'chat:bridge',
        globalThis: { __rabbitMirrorIndependentGenerationIntentBridgeCleanup: () => { oldCleanupCalls += 1; } },
    };
    vm.createContext(bridgeSandbox);
    vm.runInContext(`${injectorSource.slice(injectorIntentStart, injectorIntentEnd).replace(/^export /gm, '')}
globalThis.initBridge=initIndependentGenerationIntentBridge;
globalThis.destroyBridge=destroyIndependentGenerationIntentBridge;`, bridgeSandbox);
    bridgeSandbox.globalThis.initBridge();
    assert.equal(oldCleanupCalls, 1, 'new cache-busted module must hand off cleanup to the previous module');
    assert.equal(activeHandlers.size, 4);
    bridgeSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents = [{ id: 'stale-chat', startedAt: 777, type: 'normal' }];
    const chatChangedHandler = [...activeHandlers.entries()].find(([, event]) => event === 'CHAT')?.[0];
    assert.equal(typeof chatChangedHandler, 'function');
    chatChangedHandler();
    assert.equal(bridgeSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents.length, 0, 'CHAT_CHANGED must revoke every ephemeral final proof');
    bridgeSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents = [{ id: 'keep-me', startedAt: 777, type: 'normal' }];
    bridgeSandbox.globalThis.initBridge();
    assert.equal(activeHandlers.size, 4, 'repeated init must replace, not stack, the four host listeners');
    assert.equal(offCount, 4);
    assert.equal(bridgeSandbox.globalThis.__rabbitMirrorIndependentGenerationIntents.length, 1, 'hot update cleanup must preserve pending intent proof');
    bridgeSandbox.globalThis.destroyBridge({ clearIntents: true });
    assert.equal(activeHandlers.size, 0);
    assert.equal(onCount, 8);
    assert.equal(offCount, 8);
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
