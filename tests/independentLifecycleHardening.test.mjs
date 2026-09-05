import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(ROOT, 'src/independentApi.js'), 'utf8');
const classifierStart = source.indexOf('function isRabbitMirrorToolResultMessage(');
const classifierEnd = source.indexOf('function assistantMessages(', classifierStart);
assert.ok(classifierStart >= 0 && classifierEnd > classifierStart);
const classifiers = source.slice(classifierStart, classifierEnd);

// SillyTavern's GENERATION_ENDED event has no type/owner payload. A quiet or
// impersonate Generate() can therefore finish while an outer visible reply is
// still streaming. The auxiliary END must not authorize a partial tail. A real
// host END is a hideStopButton edge, however, so a no-tool outer generation may
// finish after quiet without emitting a second END at all.
{
    const cutoverStart = source.indexOf('function ensureAutomaticGenerationCutover(');
    const cutoverEnd = source.indexOf('\nfunction recoverDeferredIndependentGenerations(', cutoverStart);
    assert.ok(cutoverStart >= 0 && cutoverEnd > cutoverStart, 'automatic lifecycle cutover block must exist');
    const sandbox = {
        automaticGenerationCutovers: new Map(),
        INDEPENDENT_GENERATION_INTENTS_KEY: '__testIntents',
        INDEPENDENT_GENERATION_STOPS_KEY: '__testStops',
        INDEPENDENT_GENERATION_INTENT_TYPES: new Set(['normal', 'continue', 'swipe', 'regenerate']),
        runtimeMode: () => 'independent',
        hostModule: { main_api: 'openai', streamingProcessor: null },
        chatKey: ctx => String(ctx?.key || ''),
        automaticCutoverVersionToken: message => String(message?.mes || ''),
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
                if (sandbox.isRabbitMirrorEligibleAssistantMessage(message)) return { i: index, m: message };
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
    vm.createContext(sandbox);
    vm.runInContext(`${classifiers}\n${source.slice(cutoverStart, cutoverEnd)}
globalThis.begin=beginAutomaticHostGeneration;
globalThis.terminal=noteAutomaticHostGenerationTerminal;
globalThis.render=noteAutomaticHostGenerationRender;
globalThis.candidate=automaticHostGenerationSettlementCandidate;
globalThis.settle=settleAutomaticHostGeneration;
globalThis.suppresses=suppressesAutomaticGeneration;
globalThis.toolTail=automaticHostToolResultTail;
globalThis.capability=automaticHostGenerationMayUseTools;`, sandbox);

    for (const message of [
        { is_user: false, is_system: true, mes: 'SYSTEM' },
        { is_user: false, mes: 'SMALL SYSTEM', extra: { isSmallSys: true } },
        { is_user: false, mes: 'TOOL', extra: { tool_invocations: [{}] } },
        { is_user: false, mes: 'EMPTY TOOL MARKER', extra: { tool_invocations: [] } },
    ]) assert.equal(sandbox.isRabbitMirrorEligibleAssistantMessage(message), false, 'production classifier must exclude every system/tool marker');
    assert.equal(sandbox.isRabbitMirrorEligibleAssistantMessage({ is_user: false, mes: 'NORMAL ASSISTANT' }), true);
    assert.equal(sandbox.globalThis.capability('normal', { canPerformToolCalls: () => false }), false);
    assert.equal(sandbox.globalThis.capability('normal', { ToolManager: { canPerformToolCalls: () => false } }), false);
    assert.equal(sandbox.globalThis.capability('normal', { chatCompletionSettings: { function_calling: false } }), false);
    assert.equal(sandbox.globalThis.capability('normal', {}), true, 'missing capability interfaces remain unknown');
    assert.equal(sandbox.globalThis.capability('normal', { canPerformToolCalls: () => undefined }), true);
    assert.equal(sandbox.globalThis.capability('normal', { canPerformToolCalls: () => { throw new Error('unavailable'); }, chatCompletionSettings: { function_calling: false } }), true);
    assert.equal(sandbox.globalThis.capability('continue', {}), false, 'the official host never runs tools for continue');

    const ctx = { key: 'chat:auxiliary', chat: [{ is_user: true, mes: 'USER' }] };
    assert.equal(sandbox.globalThis.begin(ctx, 'normal', false, false), 'new');
    ctx.chat.push({ is_user: false, mes: 'INTERMEDIATE TOOL CALL' });
    assert.equal(sandbox.globalThis.render(ctx, 1), true);
    assert.equal(sandbox.globalThis.begin(ctx, 'quiet', false, false), 'auxiliary');
    assert.equal(sandbox.globalThis.terminal(ctx, 'quiet-end'), 'auxiliary');
    assert.equal(sandbox.globalThis.candidate(ctx, { externalActive: true }), null, 'auxiliary END cannot settle while the outer host is active');
    assert.equal(sandbox.globalThis.candidate(ctx, { externalActive: false }), null, 'auxiliary END plus a pre-tool render must remain fail-closed even if host flags drop');
    assert.equal(sandbox.globalThis.suppresses(ctx, 1), true, 'partial正文 must remain default-denied');
    ctx.chat.push({ is_user: false, is_system: true, mes: 'TOOL RESULT', extra: { isSmallSys: true, tool_invocations: [{}] } });
    assert.equal(sandbox.globalThis.toolTail(ctx), true);
    assert.equal(sandbox.globalThis.begin(ctx, 'normal', true, false), 'nested');
    assert.equal(sandbox.globalThis.candidate(ctx, { externalActive: false }), null, 'nested START must revoke the pre-tool phase render');
    ctx.chat.push({ is_user: false, mes: 'FINAL AFTER TOOL' });
    assert.equal(sandbox.globalThis.render(ctx, 3), true);
    assert.equal(sandbox.globalThis.terminal(ctx, 'outer-end'), 'terminal');
    const finalCandidate = sandbox.globalThis.candidate(ctx, { externalActive: false });
    assert.equal(finalCandidate?.index, 3);
    assert.equal(sandbox.globalThis.settle(ctx, 3), true, 'only exact final render plus inactive host may settle the owner');
    assert.equal(sandbox.globalThis.suppresses(ctx, 3), false);

    const toolCtx = { key: 'chat:tool-recursion', chat: [{ is_user: true, mes: 'USER' }] };
    assert.equal(sandbox.globalThis.begin(toolCtx, 'normal', false, false), 'new');
    toolCtx.chat.push({ is_user: false, mes: 'INTERMEDIATE TOOL CALL' });
    sandbox.hostModule.streamingProcessor = { messageId: 1, isFinished: true, toolCalls: [{}] };
    assert.equal(sandbox.globalThis.render(toolCtx, 1), false, 'streamingProcessor tool calls synchronously reject the intermediate render');
    assert.equal(sandbox.globalThis.candidate(toolCtx, { externalActive: true }), null);
    toolCtx.chat.push({ is_user: false, is_system: true, mes: 'TOOL RESULT', extra: { isSmallSys: true, tool_invocations: [{}] } });
    assert.equal(sandbox.globalThis.begin(toolCtx, 'normal', true, false), 'nested');
    assert.equal(sandbox.globalThis.candidate(toolCtx, { externalActive: false }), null, 'nested START must revoke the previous phase render');
    toolCtx.chat.push({ is_user: false, mes: 'FINAL AFTER TOOL' });
    sandbox.hostModule.streamingProcessor = { messageId: 3, isFinished: true, toolCalls: [] };
    assert.equal(sandbox.globalThis.render(toolCtx, 3), true);
    assert.equal(sandbox.globalThis.candidate(toolCtx, { externalActive: false })?.index, 3, 'a synchronously proven stream final may recover a missing END');
    assert.equal(sandbox.globalThis.settle(toolCtx, 3), true);
    sandbox.hostModule.streamingProcessor = null;

    const dryCtx = { key: 'chat:dry-run', chat: [{ is_user: false, mes: 'OLD' }] };
    assert.equal(sandbox.globalThis.begin(dryCtx, 'normal', false, false), 'new');
    assert.equal(sandbox.globalThis.begin(dryCtx, 'normal', false, true), false);
    // Official ST dry runs return after prompt assembly and emit no END. Their
    // START must therefore neither create a pending completion nor consume the
    // later real END.
    dryCtx.chat[0].mes = 'FINAL';
    assert.equal(sandbox.globalThis.terminal(dryCtx, 'outer-end'), 'terminal');
    assert.equal(sandbox.globalThis.render(dryCtx, 0), true);
    assert.equal(sandbox.globalThis.settle(dryCtx, 0), true);

    const noToolsCtx = {
        key: 'chat:quiet-only-end',
        chat: [{ is_user: true, mes: 'USER' }],
        canPerformToolCalls: () => false,
    };
    assert.equal(sandbox.globalThis.begin(noToolsCtx, 'normal', false, false), 'new');
    assert.equal(sandbox.globalThis.begin(noToolsCtx, 'quiet', false, false), 'auxiliary');
    // ST 1.18.0: quiet's unblock hides the shared stop button. The later outer
    // unblock is a no-op and does not emit an additional END.
    assert.equal(sandbox.globalThis.terminal(noToolsCtx, 'only-hide-stop-edge'), 'auxiliary');
    noToolsCtx.chat.push({ is_user: false, mes: 'COMPLETE FINAL ASSISTANT' });
    assert.equal(sandbox.globalThis.render(noToolsCtx, 1), true);
    assert.equal(sandbox.globalThis.candidate(noToolsCtx, { externalActive: false })?.index, 1,
        'a host-proven no-tool generation must recover its exact final render without inventing a second END');

    noToolsCtx.chat.push({ is_user: false, is_system: true, mes: 'SYSTEM NOTICE', extra: {} });
    assert.equal(sandbox.globalThis.toolTail(noToolsCtx), false, 'ordinary system messages are not proof of tool recursion');
    noToolsCtx.chat.at(-1).extra.tool_invocations = [];
    assert.equal(sandbox.globalThis.toolTail(noToolsCtx), false, 'an empty tool marker is not a performed invocation');
    noToolsCtx.chat.at(-1).extra.tool_invocations.push({ name: 'actual-tool' });
    assert.equal(sandbox.globalThis.toolTail(noToolsCtx), true);

    let toolsEnabled = true;
    const changingToolsCtx = {
        key: 'chat:tool-setting-changes-in-flight',
        chat: [{ is_user: true, mes: 'USER' }],
        canPerformToolCalls: () => toolsEnabled,
    };
    sandbox.globalThis.begin(changingToolsCtx, 'normal', false, false);
    toolsEnabled = false;
    changingToolsCtx.chat.push({ is_user: false, mes: 'MAY BE A TOOL INTERMEDIATE' });
    sandbox.globalThis.render(changingToolsCtx, 1);
    assert.equal(sandbox.globalThis.candidate(changingToolsCtx, { externalActive: false }), null,
        'disabling tools after dispatch must not retroactively certify an in-flight tool-capable response');

    const bridgeCtx = { key: 'chat:interceptor-tool-snapshot', canPerformToolCalls: () => false, chat: [{ is_user: true, mes: 'USER' }] };
    sandbox.globalThis.begin(bridgeCtx, 'normal', false, false);
    sandbox.globalThis.__testIntents = [{ chatKey: bridgeCtx.key, startedAt: 12345, toolCapable: true }];
    bridgeCtx.chat.push({ is_user: false, mes: 'POSSIBLE TOOL RESPONSE' });
    sandbox.globalThis.render(bridgeCtx, 1);
    assert.equal(sandbox.globalThis.candidate(bridgeCtx, { externalActive: false }), null,
        'the later interceptor snapshot can upgrade but never downgrade owner tool capability');
}

// Ambiguous non-stream tool completion must end in a visible, retryable safety
// diagnosis rather than silently waiting ten minutes or sending a guessed body.
{
    const cutoverStart = source.indexOf('function ensureAutomaticGenerationCutover(');
    const cutoverEnd = source.indexOf('\nfunction recoverDeferredIndependentGenerations(', cutoverStart);
    let now = 10000;
    let timerId = 0;
    const timers = new Map();
    const errors = [];
    let activeMode = 'independent';
    const ctx = { key: 'chat:ambiguous', canPerformToolCalls: () => true, chat: [{ is_user: true, mes: 'USER' }] };
    const sandbox = {
        automaticGenerationCutovers: new Map(),
        INDEPENDENT_GENERATION_INTENTS_KEY: '__testIntents',
        INDEPENDENT_GENERATION_STOPS_KEY: '__testStops',
        INDEPENDENT_GENERATION_INTENT_TYPES: new Set(['normal', 'continue', 'swipe', 'regenerate']),
        FINAL_RENDER_POLL_INTERVAL_MS: 180,
        FINAL_RENDER_SOURCE_STABLE_WAIT_MS: 520,
        SOURCE_STABLE_WAIT_MS: 1400,
        HOST_FINAL_PROOF_WAIT_MS: 12000,
        ACTIVE_GENERATION_WAIT_MS: 600000,
        hostModule: { main_api: 'openai', streamingProcessor: null },
        hostGenerationInProgress: true,
        hostGenerationHintStartedAt: now,
        activeGlobalWorldInfoCapture: { chat: ctx.key },
        runtimeMode: () => activeMode,
        getContext: () => ctx,
        chatKey: value => value.key,
        automaticCutoverVersionToken: message => message?.mes || '',
        lastAssistantMessage: value => {
            for (let index = value.chat.length - 1; index >= 0; index -= 1) {
                if (sandbox.isRabbitMirrorEligibleAssistantMessage(value.chat[index])) return { i: index, m: value.chat[index] };
            }
            return null;
        },
        Date: { now: () => now },
        setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; },
        clearTimeout: id => timers.delete(id),
        generationWaitPollDelay: () => 1000,
        externalHostGenerationActivity: () => ({ active: false }),
        clearGenerationPlaceholderPoll: () => {},
        currentGenerationIdentity: index => ({ ctx, msg: ctx.chat[index], index, key: 'key:1', slot: 'slot:1', sourceHash: ctx.chat[index]?.mes }),
        messageElement: () => ({}),
        hasGenerationWorkFor: () => false,
        hasExistingFollowRabbitMirror: () => false,
        markAutomaticFailureStop: () => {},
        publishIndependentApiRequestDiagnostic: value => value,
        hashText: value => `hash:${String(value || '')}`,
        swipeId: message => Number(message?.swipe_id || 0),
        operationEpochForBase: () => 1,
        collapseDuplicateIdentityHosts: () => null,
        readyDetailsFromHost: () => null,
        mountedIndependentReadyHostMatchesObserved: () => false,
        ensureExternalUi: (...args) => { errors.push(args); return null; },
        globalThis: { __testIntents: [{ chatKey: ctx.key, startedAt: now, toolCapable: true }, { chatKey: 'other-chat', startedAt: now }] },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${classifiers}\n${source.slice(cutoverStart, cutoverEnd)}
globalThis.begin=beginAutomaticHostGeneration;
globalThis.terminal=noteAutomaticHostGenerationTerminal;
globalThis.render=noteAutomaticHostGenerationRender;
globalThis.schedule=scheduleAutomaticHostGenerationSettlement;`, sandbox);
    sandbox.globalThis.begin(ctx, 'normal', false, false);
    sandbox.globalThis.begin(ctx, 'quiet', false, false);
    sandbox.globalThis.terminal(ctx, 'only-quiet-end');
    ctx.chat.push({ is_user: false, mes: 'UNPROVEN NONSTREAM BODY' });
    sandbox.globalThis.render(ctx, 1);
    sandbox.globalThis.schedule(0);
    const target = now + 12000;
    while (true) {
        const due = [...timers.entries()].filter(([, value]) => value.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
    }
    now = target;
    assert.equal(errors.length, 1, 'ambiguous tool-capable completion must display one explicit safety error at the bounded deadline');
    assert.match(errors[0][2], /⚠️.*未能确认.*最终正文/);
    assert.match(errors[0][2], /未发送副 API 请求/);
    assert.match(errors[0][2], /重新生成兔子镜/);
    assert.equal(errors[0][3], 'error');
    assert.equal(timers.size, 0, 'a stopped owner must not leave any repeating settlement timer');
    assert.equal(sandbox.automaticGenerationCutovers.get(ctx.key).activeHostGeneration, null);
    assert.equal(sandbox.hostGenerationInProgress, false);
    assert.equal(sandbox.activeGlobalWorldInfoCapture, null);
    assert.equal(sandbox.globalThis.__testIntents.length, 1, 'only this chat operation proof is revoked');
    assert.equal(sandbox.globalThis.__testIntents[0].chatKey, 'other-chat');
    assert.equal(sandbox.globalThis.terminal(ctx, 'late-end'), false, 'late unscoped events cannot resurrect a stopped owner');
    assert.equal(sandbox.globalThis.render(ctx, 1), false);
    ctx.chat.push({ is_user: false, is_system: true, mes: 'LATE TOOL RESULT', extra: { tool_invocations: [{}] } });
    assert.equal(sandbox.globalThis.begin(ctx, 'normal', false, false), false, 'late recursive START cannot resurrect an explicitly stopped host operation');
    ctx.chat.push({ is_user: false, mes: 'LATE TOOL FINAL' });
    assert.equal(sandbox.globalThis.render(ctx, 3), false);
    assert.equal(sandbox.globalThis.terminal(ctx, 'late-recursive-end'), false);
    assert.equal(sandbox.globalThis.schedule(0), false);
    assert.equal(errors.length, 1);
    assert.equal(timers.size, 0);
    assert.equal(sandbox.globalThis.__testStops.length, 1);
    ctx.chat.push({ is_user: true, mes: 'NEW USER REQUEST' });
    assert.equal(sandbox.globalThis.begin(ctx, 'normal', false, false), 'new', 'a genuinely new user generation releases the stopped-operation marker');
    assert.equal(sandbox.globalThis.__testStops.length, 0);
    activeMode = 'follow-external';
    const followContext = { key: 'chat:follow', chat: [{ is_user: true, mes: 'USER' }], canPerformToolCalls: () => true };
    assert.equal(sandbox.globalThis.begin(followContext, 'normal', false, false), false, 'follow-current mode must not create an independent operation owner');
    assert.equal(sandbox.globalThis.schedule(0), false, 'follow-current mode must not start independent settlement timers');
    assert.equal(errors.length, 1, 'follow-current mode must not gain an independent failure shell');
}

// A host auxiliary generation (quiet/dry-run/tooling) is not proof that the
// visible assistant正文 changed. It must not abort an already paid RabbitMirror
// request or create a second orphan loading placeholder.
{
    const start = source.indexOf('for(const event of new Set(generationStartedEvents))');
    const end = source.indexOf('for(const event of new Set(worldInfoEntriesLoadedEvents))', start);
    assert.ok(start >= 0 && end > start, 'GENERATION_STARTED handler must exist');
    const block = source.slice(start, end);
    assert.doesNotMatch(block, /cancelFlightsForMessage\(/, 'GENERATION_STARTED alone must never abort an active paid request');
    assert.match(block, /ownerStartKind/, 'placeholder scheduling must be gated by a visible owner classification');
    assert.match(block, /if\(ownerStartKind==='new'\)/, 'quiet/dry-run starts must not rebuild an orphan loading shell');
    assert.match(block, /if\(ownerStartKind==='new'\)\{[\s\S]*hostGenerationInProgress=true/, 'auxiliary START must not alter the visible host activity flag');
}

{
    const start = source.indexOf('async function generateFor(index,msg,force=false,sourceAware=true,multifaceResay=null)');
    const end = source.indexOf('function independentHostForRoot', start);
    const block = source.slice(start, end);
    assert.match(block, /createIndependentRequestDeadline\(/);
    assert.match(block, /onProgress:\(\)=>flight\.deadline\?\.progress/);
    assert.doesNotMatch(block, /INDEPENDENT_REQUEST_TIMEOUT_MS|timeoutTimer/, 'the old absolute five-minute kill switch must be gone');
}

// Exercise the request deadline with deterministic fake timers. A healthy
// stream may run longer than five wall-clock minutes as long as it keeps making
// progress; a silent request still terminates, and an absolute cap remains.
{
    const start = source.indexOf('function createIndependentRequestDeadline(');
    const end = source.indexOf('function globalFlights()', start);
    assert.ok(start >= 0 && end > start, 'progress-aware independent request deadline helper must exist');

    let now = 0;
    let sequence = 0;
    const timers = new Map();
    const setTimeoutFake = (fn, delay) => {
        const id = ++sequence;
        timers.set(id, { at: now + Number(delay || 0), fn });
        return id;
    };
    const clearTimeoutFake = id => timers.delete(id);
    const advance = milliseconds => {
        const target = now + milliseconds;
        while (true) {
            const due = [...timers.entries()]
                .filter(([, timer]) => timer.at <= target)
                .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
            if (!due) break;
            now = due[1].at;
            timers.delete(due[0]);
            due[1].fn();
        }
        now = target;
    };
    const sandbox = {
        INDEPENDENT_REQUEST_IDLE_TIMEOUT_MS: 5 * 60 * 1000,
        INDEPENDENT_REQUEST_ABSOLUTE_TIMEOUT_MS: 20 * 60 * 1000,
        Date: { now: () => now },
        setTimeout: setTimeoutFake,
        clearTimeout: clearTimeoutFake,
        Error,
        Math,
        Number,
        String,
        globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source.slice(start, end)}\nglobalThis.createDeadline=createIndependentRequestDeadline;`, sandbox);
    const createDeadline = sandbox.globalThis.createDeadline;

    let aborts = 0;
    const failures = [];
    const deadline = createDeadline({ abort: () => { aborts += 1; } }, error => failures.push(error));
    advance(4 * 60 * 1000);
    deadline.progress('frame-1');
    advance(4 * 60 * 1000);
    assert.equal(aborts, 0, 'progress must renew the idle deadline beyond the old five-minute wall clock');
    deadline.progress('frame-2');
    advance(4 * 60 * 1000);
    assert.equal(aborts, 0);
    advance(60 * 1000);
    assert.equal(aborts, 1, 'five minutes without new progress must stop the request once');
    assert.equal(failures.length, 1);
    assert.match(String(failures[0]?.message || ''), /5 分钟未收到新响应/);
    deadline.clear();

    now = 0;
    timers.clear();
    aborts = 0;
    failures.length = 0;
    const absolute = createDeadline({ abort: () => { aborts += 1; } }, error => failures.push(error));
    for (let minute = 0; minute < 19; minute += 1) {
        advance(60 * 1000);
        absolute.progress(`minute-${minute}`);
    }
    advance(60 * 1000);
    assert.equal(aborts, 1, 'continuous progress must still respect the bounded absolute cap');
    assert.match(String(failures[0]?.message || ''), /20 分钟总等待上限/);
}

console.log('independentLifecycleHardening: auxiliary START isolation and progress-aware deadlines covered');
