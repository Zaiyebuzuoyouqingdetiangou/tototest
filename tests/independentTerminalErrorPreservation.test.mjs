import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/independentApi.js', import.meta.url), 'utf8');

function functionBlock(name) {
    const marker = `function ${name}(`;
    let start = source.indexOf(marker);
    assert.ok(start >= 0, `${name} must exist`);
    if (source.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
    const openParen = source.indexOf('(', start);
    assert.ok(openParen > start, `${name} parameter list must exist`);
    let parenDepth = 0;
    let parameterQuote = '';
    let parameterEscaped = false;
    let closeParen = -1;
    for (let i = openParen; i < source.length; i += 1) {
        const ch = source[i];
        if (parameterQuote) {
            if (parameterEscaped) parameterEscaped = false;
            else if (ch === '\\') parameterEscaped = true;
            else if (ch === parameterQuote) parameterQuote = '';
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { parameterQuote = ch; continue; }
        if (ch === '(') parenDepth += 1;
        else if (ch === ')') {
            parenDepth -= 1;
            if (parenDepth === 0) { closeParen = i; break; }
        }
    }
    assert.ok(closeParen > openParen, `${name} parameter list must be balanced`);
    const brace = source.indexOf('{', closeParen);
    assert.ok(brace > closeParen, `${name} body must exist`);
    let depth = 0;
    let quote = '';
    let escaped = false;
    for (let i = brace; i < source.length; i += 1) {
        const ch = source[i];
        if (quote) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === quote) quote = '';
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
        if (ch === '{') depth += 1;
        else if (ch === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error(`${name} body is not balanced`);
}

const runtimeBlocks = [
    // Keep the real owner parser and epoch registry in this VM. These fixtures
    // model state/UI collaborators only; they must not stub the stale-epoch guard.
    ...['GLOBAL_OPERATION_EPOCH_KEY', 'GLOBAL_DISPATCH_LEASE_KEY'].map(name => {
        const declaration = source.match(new RegExp(`^const ${name} = ['\"][^'\"]+['\"];`, 'm'));
        assert.ok(declaration, `${name} must exist`);
        return declaration[0];
    }),
    functionBlock('parseMessageIndexFromOwnerKey'),
    functionBlock('baseSlotOf'),
    functionBlock('globalOperationEpochs'),
    functionBlock('globalDispatchLeases'),
    functionBlock('pruneDispatchLeaseState'),
    functionBlock('operationEpochForBase'),
    functionBlock('advanceOperationEpochForBase'),
    functionBlock('automaticFailureKey'),
    functionBlock('automaticFailureStopFor'),
    functionBlock('hasAutomaticFailureStop'),
    functionBlock('markAutomaticFailureStop'),
    functionBlock('clearAutomaticFailureStop'),
    functionBlock('mountedIndependentErrorHostMatchesObserved'),
    functionBlock('exactIndependentErrorForIdentity'),
    functionBlock('restoreExactIndependentErrorForIdentity'),
    functionBlock('renderAutomaticFailureStop'),
    functionBlock('renderAutomaticDispatchConsumed'),
    functionBlock('scheduleMessageGeneration'),
].join('\n');

function createHost(live, text, { state = 'error', swipe = String(live.msg?.swipe_id ?? 0), key = live.key, sourceHash = live.sourceHash } = {}) {
    const details = { marker: 'details' };
    return {
        isConnected: true,
        hidden: false,
        dataset: {
            rmSource: 'independent',
            rmState: state,
            rmOwnerChat: 'chat:test',
            rmOwnerMesid: '59',
            rmExternalOwnerMessage: '59',
            rmOwnerSwipe: String(swipe),
            rmKey: key,
            rmSourceHash: sourceHash,
        },
        querySelector(selector) {
            return selector === ':scope > details' ? details : null;
        },
        errorText: text,
    };
}

function createRuntimeHarness({
    existingError = true,
    existingReady = false,
    replacement = false,
    consumed = true,
    liveSwipe = 0,
    hostSwipe = liveSwipe,
    hostSourceHash = 'hashfinal',
} = {}) {
    const ctx = { chat: [{ is_user: false, mes: 'FINAL', swipe_id: liveSwipe }] };
    const live = {
        ctx,
        msg: ctx.chat[0],
        index: 59,
        key: `chat:test:59:${liveSwipe}:hashfinal`,
        slot: `chat:test:59:${liveSwipe}:hashfinal`,
        baseSlot: `chat:test:59:${liveSwipe}`,
        sourceHash: 'hashfinal',
        revision: 1,
    };
    const owner = {};
    const errorHost = existingError ? createHost(
        live,
        '⚠️ 第 4 面：净化后的兔子镜退化为通用三按钮／标签切页与单向文字流；本次结果不会保存。',
        { swipe: hostSwipe, sourceHash: hostSourceHash },
    ) : null;
    const readyHost = existingReady ? createHost(
        live,
        '<details>READY MIRROR</details>',
        { state: 'ready', swipe: hostSwipe, sourceHash: hostSourceHash },
    ) : null;
    const host = errorHost || readyHost;
    const hosts = host ? [host] : [];
    const timers = [];
    const uiCalls = [];
    let placeCalls = 0;
    let readyRestoreCalls = 0;
    let generated = 0;
    let now = 100000;

    const sandbox = {
        automaticFailureStops: new Map(),
        AUTOMATIC_FAILURE_STOP_LIMIT: 320,
        generationPolls: new Map(),
        Date: { now: () => now },
        Math,
        Number,
        String,
        Object,
        Array,
        Map,
        Set,
        console,
        flightIdentity: (slot, hash) => `${slot}\u0000${hash}`,
        chatKey: () => 'chat:test',
        swipeId: msg => Number(msg?.swipe_id || 0),
        recordKey: () => live.key,
        getContext: () => ctx,
        messageElement: () => owner,
        externalHosts: () => hosts,
        currentGenerationIdentity: () => live,
        exactIndependentReadyForIdentity: () => readyHost ? { kind: 'mounted', host: readyHost, record: null } : null,
        restoreExactIndependentReadyForIdentity: (_index, _live, result) => {
            readyRestoreCalls += 1;
            return result?.host || null;
        },
        placeExternalHost: () => { placeCalls += 1; return true; },
        clearExternalHostFreshSourceState: () => {},
        ensureExternalTools: () => {},
        ensureExternalUi(_el, key, message, state, sourceName, sourceHash) {
            uiCalls.push({ key, message, state, sourceName, sourceHash });
            const created = createHost(live, message);
            hosts.splice(0, hosts.length, created);
            return created;
        },
        hasExplicitSourceReplacementEvidence: () => replacement,
        suppressesAutomaticGeneration: () => false,
        hasExistingFollowRabbitMirror: () => false,
        generationPollKey: index => `chat:test:${index}`,
        currentRuntime: () => true,
        runtimeMode: () => 'independent',
        cancelSupersededFlightsForBase: () => {},
        activeIndependentFlightForBase: () => null,
        automaticFlightStillOwnsBaseOperation: () => false,
        automaticDispatchAlreadyConsumed: () => consumed,
        hostGenerationActivity: () => ({ strong: false, weak: false }),
        cancelFlightsForSlot: () => {},
        generateFor: () => { generated += 1; },
        renderGenerationGateTimeout: () => {},
        generationWaitPollDelay: () => 3200,
        OWNER_REATTACH_WAIT_MS: 60000,
        ACTIVE_GENERATION_WAIT_MS: 600000,
        WEAK_GENERATION_FLAG_GRACE_MS: 30000,
        FINAL_RENDER_CONFIRMATION_TTL_MS: 5000,
        FINAL_RENDER_SOURCE_STABLE_WAIT_MS: 520,
        WEAK_GENERATION_SOURCE_STABLE_WAIT_MS: 4500,
        SOURCE_STABLE_WAIT_MS: 1400,
        FINAL_RENDER_POLL_INTERVAL_MS: 120,
        GENERATION_PLACEHOLDER_POLL_INTERVAL_MS: 760,
        setTimeout(fn, ms = 0) {
            timers.push(() => {
                now += Math.max(0, Number(ms) || 0);
                fn();
            });
            return timers.length;
        },
        clearTimeout() {},
        globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(`${runtimeBlocks}\nglobalThis.api={markAutomaticFailureStop,scheduleMessageGeneration,renderAutomaticDispatchConsumed,automaticFailureStopFor,operationEpochForBase,advanceOperationEpochForBase};`, sandbox);

    return {
        live,
        host,
        hosts,
        uiCalls,
        placeCalls: () => placeCalls,
        readyRestoreCalls: () => readyRestoreCalls,
        generated: () => generated,
        mark(message) {
            return sandbox.globalThis.api.markAutomaticFailureStop(live.slot, live.sourceHash, 'generation-failed', {
                message,
                code: 'multiface-quality',
                semanticFailure: 'multiface-quality',
                terminalStage: 'multiface-postprocess',
            });
        },
        schedule() {
            sandbox.globalThis.api.scheduleMessageGeneration(59, 0, true);
            while (timers.length) timers.shift()();
        },
        renderConsumed() {
            return sandbox.globalThis.api.renderAutomaticDispatchConsumed(59, live.sourceHash);
        },
        failureFor(slot = live.slot, sourceHash = live.sourceHash) {
            return sandbox.globalThis.api.automaticFailureStopFor(slot, sourceHash);
        },
        epochFor(baseSlot = live.baseSlot) {
            return sandbox.globalThis.api.operationEpochForBase(baseSlot);
        },
        advanceEpoch(token, baseSlot = live.baseSlot) {
            return sandbox.globalThis.api.advanceOperationEpochForBase(baseSlot, 'test-explicit-operation', token);
        },
    };
}

test('passive reconciliation preserves an exact mounted terminal error after the paid lease was consumed', () => {
    const harness = createRuntimeHarness({ existingError: true, consumed: true });
    const precise = harness.host.errorText;
    harness.mark(precise);
    harness.schedule();

    assert.equal(harness.host.errorText, precise, 'the original multiface error wording must remain mounted');
    assert.equal(harness.uiCalls.length, 0, 'a generic consumed shell must not replace an exact error host');
    assert.equal(harness.placeCalls(), 1, 'the exact error may be safely re-anchored to its current owner');
    assert.equal(harness.generated(), 0, 'passive recovery must never send another generation request');
});

test('an exact terminal failure is recreated after owner DOM replacement without a second request', () => {
    const harness = createRuntimeHarness({ existingError: false, consumed: true });
    const precise = '副 API 返回了空的流式响应。本轮只发送了 1 次生成请求，不会自动切换参数再次请求。';
    harness.mark(precise);
    harness.schedule();

    assert.equal(harness.uiCalls.length, 1);
    assert.equal(harness.uiCalls[0].state, 'error');
    assert.equal(harness.uiCalls[0].message, precise, 'the recreated shell must use the stored precise terminal message');
    assert.equal(harness.generated(), 0);
});


test('renderAutomaticDispatchConsumed directly prefers the exact in-memory terminal failure when no error host is mounted', () => {
    const harness = createRuntimeHarness({ existingError: false, consumed: true });
    const precise = '⚠️ 第 4 面：净化后的兔子镜退化为通用三按钮／标签切页与单向文字流；本次结果不会保存。';
    harness.mark(precise);
    const restored = harness.renderConsumed();

    assert.ok(restored, 'the precise terminal failure must be restored into a visible error host');
    assert.equal(harness.uiCalls.length, 1);
    assert.equal(harness.uiCalls[0].state, 'error');
    assert.equal(harness.uiCalls[0].message, precise, 'generic consumed text must never outrank the exact in-memory failure');
    assert.doesNotMatch(harness.uiCalls[0].message, /没有形成可恢复的完整成品|正文随后又发生了变化/);
    assert.equal(harness.generated(), 0, 'restoring a terminal error must not dispatch another request');
});

test('an exact mounted terminal error is restored even when the in-memory failure record is unavailable', () => {
    const harness = createRuntimeHarness({ existingError: true, consumed: true });
    const exactHost = harness.host;
    const result = harness.renderConsumed();

    assert.equal(result, exactHost, 'the exact current error host must remain the terminal UI result');
    assert.equal(harness.placeCalls(), 1, 'the exact current error host may be safely re-anchored');
    assert.equal(harness.uiCalls.length, 0, 'a generic consumed shell must not replace the exact mounted error');
    assert.equal(harness.generated(), 0);
});

test('an error host from another Swipe is not restored for the current message identity', () => {
    const harness = createRuntimeHarness({ existingError: true, consumed: true, liveSwipe: 1, hostSwipe: 0 });
    const staleHost = harness.host;
    const result = harness.renderConsumed();

    assert.notEqual(result, staleHost, 'a previous-Swipe error host must not be accepted as the current terminal result');
    assert.equal(harness.placeCalls(), 0, 'the previous-Swipe error host must not be re-anchored');
    assert.equal(harness.uiCalls.length, 1, 'the current identity may receive only its own truthful generic fallback');
    assert.match(harness.uiCalls[0].message, /没有形成可恢复的完整成品/);
    assert.equal(harness.generated(), 0);
});

test('an error host from another sourceHash is not restored for the current message identity', () => {
    const harness = createRuntimeHarness({ existingError: true, consumed: true, hostSourceHash: 'hashold' });
    const staleHost = harness.host;
    const result = harness.renderConsumed();

    assert.notEqual(result, staleHost, 'an old-body error host must not be accepted for the current sourceHash');
    assert.equal(harness.placeCalls(), 0, 'the old-body error host must not be re-anchored');
    assert.equal(harness.uiCalls.length, 1);
    assert.match(harness.uiCalls[0].message, /没有形成可恢复的完整成品/);
    assert.equal(harness.generated(), 0);
});

test('the same source and Swipe terminal record is not returned or recreated in a later operation epoch', () => {
    const harness = createRuntimeHarness({ existingError: false, consumed: true });
    const preciseA = 'Epoch A: 第 4 面原始终止错误';
    const epochA = harness.epochFor();
    const recordA = harness.mark(preciseA);
    assert.equal(recordA.baseSlot, harness.live.baseSlot, 'production baseSlotOf must strip the valid source hash');
    assert.equal(recordA.operationEpoch, epochA);
    assert.equal(harness.failureFor(), recordA, 'the current epoch must retrieve its precise record');

    const originalSlot = harness.live.slot;
    const originalHash = harness.live.sourceHash;
    const originalSwipe = harness.live.msg.swipe_id;
    const epochB = harness.advanceEpoch('explicit-operation-b');
    assert.ok(epochB > epochA, 'a distinct explicit operation must advance the real epoch registry');
    assert.equal(harness.live.slot, originalSlot);
    assert.equal(harness.live.sourceHash, originalHash);
    assert.equal(harness.live.msg.swipe_id, originalSwipe);
    assert.equal(harness.failureFor(), null, 'identical source/Swipe does not authorize reusing an earlier epoch error');

    harness.renderConsumed();
    assert.equal(harness.uiCalls.length, 1);
    assert.doesNotMatch(harness.uiCalls[0].message, /Epoch A|第 4 面原始终止错误/);
    assert.match(harness.uiCalls[0].message, /没有形成可恢复的完整成品/);
    assert.equal(harness.generated(), 0, 'stale-error rejection must not cause a paid retry');

    const preciseB = 'Epoch B: 当前操作的终止错误';
    const recordB = harness.mark(preciseB);
    assert.equal(recordB.operationEpoch, epochB);
    assert.equal(harness.failureFor(), recordB);
    assert.equal(harness.failureFor().message, preciseB, 'a new current-epoch failure remains retrievable');
});

test('a precise failure remains restorable inside the same operation epoch including duplicate operation notifications', () => {
    const harness = createRuntimeHarness({ existingError: false, consumed: true });
    const epoch = harness.advanceEpoch('same-operation-token');
    const precise = '同一操作：副 API 空流式响应，未自动补发';
    const record = harness.mark(precise);
    assert.equal(harness.advanceEpoch('same-operation-token'), epoch, 'duplicate explicit operation token is idempotent');
    assert.equal(harness.epochFor(), epoch);
    assert.equal(harness.failureFor(), record);

    harness.renderConsumed();
    assert.equal(harness.uiCalls.length, 1);
    assert.equal(harness.uiCalls[0].message, precise);
    assert.equal(harness.uiCalls[0].state, 'error');
    assert.equal(harness.generated(), 0);
});

test('automatic failure lookup isolates other source hashes, Swipes, chats, and other base-slot epochs', () => {
    const harness = createRuntimeHarness({ existingError: false, consumed: true, liveSwipe: 2 });
    const record = harness.mark('仅属于 chat:test / message 59 / Swipe 2 / hashfinal');
    const epoch = harness.epochFor();
    assert.equal(record.baseSlot, 'chat:test:59:2');
    assert.equal(harness.failureFor(), record);
    assert.equal(harness.failureFor(harness.live.slot, 'hashother'), null);
    assert.equal(harness.failureFor('chat:test:59:2:hashother', 'hashother'), null);
    assert.equal(harness.failureFor('chat:test:59:3:hashfinal', 'hashfinal'), null);
    assert.equal(harness.failureFor('chat:other:59:2:hashfinal', 'hashfinal'), null);

    harness.advanceEpoch('other-swipe-operation', 'chat:test:59:3');
    harness.advanceEpoch('other-chat-operation', 'chat:other:59:2');
    assert.equal(harness.epochFor(), epoch, 'another base owner must not advance this owner epoch');
    assert.equal(harness.failureFor(), record, 'other owners must not hide or consume this exact failure');
    assert.equal(harness.uiCalls.length, 0);
    assert.equal(harness.generated(), 0);
});

test('a current exact ready result always outranks consumed-dispatch error rendering', () => {
    const harness = createRuntimeHarness({ existingError: false, existingReady: true, consumed: true });
    const readyHost = harness.host;
    const result = harness.renderConsumed();

    assert.equal(result, readyHost, 'the current ready mirror must remain the terminal UI result');
    assert.equal(readyHost.dataset.rmState, 'ready');
    assert.equal(harness.readyRestoreCalls(), 1, 'the current ready host may be safely restored/re-anchored');
    assert.equal(harness.uiCalls.length, 0, 'a generic error shell must not overwrite a ready mirror');
    assert.equal(harness.generated(), 0);
});

test('a consumed operation without a precise result never falls through to generateFor', () => {
    const harness = createRuntimeHarness({ existingError: false, consumed: true });
    harness.schedule();

    assert.equal(harness.generated(), 0, 'passive scheduling after a consumed lease must not dispatch again');
    assert.equal(harness.uiCalls.length, 1, 'the consumed operation should terminate in a local non-paid fallback');
    assert.match(harness.uiCalls[0].message, /没有形成可恢复的完整成品/);
});

test('a consumed dispatch without replacement evidence uses an honest generic fallback', () => {
    const harness = createRuntimeHarness({ existingError: false, replacement: false, consumed: true });
    harness.renderConsumed();

    assert.equal(harness.uiCalls.length, 1);
    assert.match(harness.uiCalls[0].message, /没有形成可恢复的完整成品/);
    assert.doesNotMatch(harness.uiCalls[0].message, /正文随后又发生了变化/);
    assert.equal(harness.generated(), 0);
});

test('the changed-body explanation is reserved for explicit source replacement evidence', () => {
    const harness = createRuntimeHarness({ existingError: false, replacement: true, consumed: true });
    harness.renderConsumed();

    assert.equal(harness.uiCalls.length, 1);
    assert.match(harness.uiCalls[0].message, /正文随后又发生了变化/);
    assert.equal(harness.generated(), 0);
});

test('terminal diagnostics bind a postprocess failure to the current mesid, Swipe and source hash', () => {
    const ctx = { chat: [{ is_user: false, mes: 'FINAL', swipe_id: 0 }] };
    const published = [];
    const matching = {
        ok: true,
        status: 200,
        requestCount: 1,
        chatKeyHash: 'chat-hash',
        mesid: 59,
        swipe: 0,
        sourceHash: 'hash-final',
        semanticFailure: 'multiface-quality',
        operationEpoch: 7,
        faceCount: 5,
    };
    const sandbox = {
        Date,
        Math,
        Number,
        String,
        Object,
        chatKey: () => 'chat:test',
        hashText: value => value === 'chat:test' ? 'chat-hash' : `h:${value}`,
        swipeId: msg => Number(msg?.swipe_id || 0),
        messageBaseSlotKey: () => 'chat:test:59:0',
        operationEpochForBase: () => 7,
        readLastIndependentApiRequestDiagnostic: () => matching,
        publishIndependentApiRequestDiagnostic(value) { published.push(value); return value; },
        globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext([
        functionBlock('independentRequestDiagnosticMatchesOwner'),
        functionBlock('independentTerminalFailureDetails'),
        functionBlock('republishIndependentTerminalFailure'),
        'globalThis.run=republishIndependentTerminalFailure;',
    ].join('\n'), sandbox);

    const error = new Error('⚠️ 第 4 面：未达到成品质量门槛。 本轮只发送了 1 次请求，不会自动补发。');
    const result = sandbox.globalThis.run(ctx, 59, ctx.chat[0], 'hash-final', 'chat:test:59:0', 7, error, { consumed: () => true });

    assert.equal(result.ok, false, 'HTTP success must not remain the final diagnostic after postprocessing fails');
    assert.equal(result.status, 200);
    assert.equal(result.requestCount, 1);
    assert.equal(result.mesid, 59);
    assert.equal(result.swipe, 0);
    assert.equal(result.sourceHash, 'hash-final');
    assert.equal(result.operationEpoch, 7);
    assert.equal(result.terminalStage, 'multiface-postprocess');
    assert.equal(result.terminalErrorCode, 'multiface-quality');
    assert.equal(result.terminalFace, 4);
    assert.equal(published.length, 1);
});


test('request diagnostics from another Swipe are not accepted for the current operation', () => {
    const ctx = { chat: [{ is_user: false, mes: 'FINAL', swipe_id: 1 }] };
    const diagnostic = {
        chatKeyHash: 'chat-hash',
        mesid: 59,
        swipe: 0,
        sourceHash: 'hash-final',
        operationEpoch: 7,
    };
    const sandbox = {
        Number,
        String,
        chatKey: () => 'chat:test',
        hashText: value => value === 'chat:test' ? 'chat-hash' : `h:${value}`,
        swipeId: msg => Number(msg?.swipe_id || 0),
        globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(`${functionBlock('independentRequestDiagnosticMatchesOwner')}
globalThis.matches=independentRequestDiagnosticMatchesOwner;`, sandbox);

    assert.equal(
        sandbox.globalThis.matches(diagnostic, ctx, 59, ctx.chat[0], 'hash-final', 7),
        false,
        'a diagnostic from Swipe 0 must not be reused for the current Swipe 1 operation',
    );
});


test('a stale request diagnostic from the same body but an older operation is not reused', () => {
    const ctx = { chat: [{ is_user: false, mes: 'FINAL', swipe_id: 0 }] };
    const published = [];
    const stale = {
        ok: true,
        status: 200,
        requestCount: 1,
        chatKeyHash: 'chat-hash',
        mesid: 59,
        swipe: 0,
        sourceHash: 'hash-final',
        operationEpoch: 6,
        profile: 'stale-profile',
    };
    const sandbox = {
        Date,
        Math,
        Number,
        String,
        Object,
        chatKey: () => 'chat:test',
        hashText: value => value === 'chat:test' ? 'chat-hash' : `h:${value}`,
        swipeId: msg => Number(msg?.swipe_id || 0),
        messageBaseSlotKey: () => 'chat:test:59:0',
        operationEpochForBase: () => 7,
        readLastIndependentApiRequestDiagnostic: () => stale,
        publishIndependentApiRequestDiagnostic(value) { published.push(value); return value; },
        globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext([
        functionBlock('independentRequestDiagnosticMatchesOwner'),
        functionBlock('independentTerminalFailureDetails'),
        functionBlock('republishIndependentTerminalFailure'),
        'globalThis.run=republishIndependentTerminalFailure;',
    ].join('\n'), sandbox);

    const error = new Error('当前正文在可见性检查和标签过滤后为空；本次未发送副 API 请求。');
    const result = sandbox.globalThis.run(ctx, 59, ctx.chat[0], 'hash-final', 'chat:test:59:0', 7, error, { consumed: () => false });

    assert.equal(result.requestCount, 0, 'an old HTTP 200 must not make the new preflight failure look paid');
    assert.equal(result.status, undefined, 'stale transport status must not leak into the new operation');
    assert.equal(result.profile, undefined, 'stale profile metadata must not be inherited');
    assert.equal(result.operationEpoch, 7);
    assert.equal(published.length, 1);
});


test('the production generateFor catch stores the exact terminal message before passive reconciliation', () => {
    const start = source.indexOf('async function generateFor(index,msg,force=false,sourceAware=true,multifaceResay=null)');
    const end = source.indexOf('function independentHostForRoot', start);
    const block = source.slice(start, end);
    const catchStart = block.indexOf('}).catch(err=>{');
    const republish = block.indexOf('republishIndependentTerminalFailure(', catchStart);
    const mark = block.indexOf('markAutomaticFailureStop(', republish);
    const render = block.indexOf("ensureExternalUi(liveEl,key,failureMessage,'error'", mark);
    assert.ok(catchStart >= 0 && republish > catchStart && mark > republish && render > mark,
        'generateFor must bind diagnostics, store the precise message, then render that same terminal error');
    assert.match(block.slice(mark, render), /message:failureMessage/,
        'the failure stop must retain the exact user-visible error rather than a generic reason');
    assert.doesNotMatch(block.slice(catchStart, render), /callIndependentApi\s*\(/,
        'terminal settlement must not dispatch another paid request');
});

console.log('independentTerminalErrorPreservation: exact terminal UI, truthful fallback and owner-bound diagnostics covered');
