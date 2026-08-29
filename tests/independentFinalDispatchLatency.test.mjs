import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(ROOT, 'src/independentApi.js'), 'utf8');

function fakeClock(initialNow = 100000) {
    let now = initialNow;
    let sequence = 0;
    const timers = new Map();
    const setTimeoutFake = (fn, delay = 0) => {
        const id = ++sequence;
        timers.set(id, { at: now + Math.max(0, Number(delay) || 0), fn });
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
            timers.delete(due[0]);
            now = due[1].at;
            due[1].fn();
        }
        now = target;
    };
    return { now: () => now, setTimeoutFake, clearTimeoutFake, advance, timers };
}

// A final render after a long main-model generation must be checked in short
// paint-sized steps. Its next check must not inherit the 3.2s generation-age
// backoff used while no final render exists.
{
    const clock = fakeClock(100000);
    const ctx = { key: 'chat:long-main' };
    const owner = {
        chat: ctx.key,
        settleStartedAt: 1,
        settleTimer: 0,
        tentativeRender: { at: clock.now(), proof: 'exact-render' },
        terminalSeen: true,
        toolCapable: false,
    };
    const cutovers = new Map([[ctx.key, { activeHostGeneration: owner }]]);
    const finalizedAt = [];
    let generationAgeBackoffCalls = 0;
    const start = source.indexOf('function scheduleAutomaticHostGenerationSettlement(');
    const end = source.indexOf('\nfunction recoverDeferredAutomaticHostCompletion(', start);
    assert.ok(start >= 0 && end > start, 'host settlement scheduler must exist');
    const sandbox = {
        runtimeMode: () => 'independent',
        getContext: () => ctx,
        automaticGenerationCutovers: cutovers,
        chatKey: value => value.key,
        clearAutomaticHostGenerationSettlement: value => {
            if (value?.settleTimer) clock.clearTimeoutFake(value.settleTimer);
            if (value) value.settleTimer = 0;
        },
        externalHostGenerationActivity: () => ({ active: false }),
        automaticHostGenerationSettlementCandidate: () => ({ index: 1, proof: 'exact-render', terminalSeen: true }),
        finalizeAutomaticHostGeneration: () => { finalizedAt.push(clock.now()); return true; },
        stopAutomaticHostGenerationSettlement: () => { throw new Error('proved final render must not time out'); },
        generationWaitPollDelay: () => { generationAgeBackoffCalls += 1; return 3200; },
        FINAL_RENDER_POLL_INTERVAL_MS: 120,
        FINAL_RENDER_SOURCE_STABLE_WAIT_MS: 520,
        SOURCE_STABLE_WAIT_MS: 1400,
        HOST_FINAL_PROOF_WAIT_MS: 12000,
        ACTIVE_GENERATION_WAIT_MS: 600000,
        Date: { now: clock.now },
        setTimeout: clock.setTimeoutFake,
        clearTimeout: clock.clearTimeoutFake,
        Math,
        Number,
        String,
        globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source.slice(start, end)}
globalThis.schedule=scheduleAutomaticHostGenerationSettlement;`, sandbox);
    sandbox.globalThis.schedule(120);
    clock.advance(700);
    assert.deepEqual(finalizedAt, [100520], 'long main generation must not add a 3.2s post-render gap');
    assert.equal(generationAgeBackoffCalls, 0, 'generation-age backoff is only for periods without a rendered candidate');
}

// Once the upstream settlement already held the exact body stable for 520ms,
// the downstream generation gate needs only one 120ms hash/revision recheck.
// It must not pay a second full stability window.
{
    const clock = fakeClock(200000);
    const ctx = { key: 'chat:dispatch', chat: [{ is_user: true, mes: 'USER' }, { is_user: false, mes: 'FINAL' }] };
    const generationPolls = new Map();
    const dispatches = [];
    let live = {
        ctx,
        msg: ctx.chat[1],
        index: 1,
        key: 'key:1',
        slot: 'slot:1',
        baseSlot: 'base:1',
        sourceHash: 'hash:final',
        revision: 7,
    };
    const start = source.indexOf('function scheduleMessageGeneration(');
    const end = source.indexOf('\nfunction ensureGenerationPlaceholderForIndex(', start);
    assert.ok(start >= 0 && end > start, 'guarded message scheduler must exist');
    const sandbox = {
        getContext: () => ctx,
        chatKey: value => value.key,
        generationPolls,
        generationPollKey: index => `${ctx.key}:${index}`,
        currentRuntime: () => ({}),
        runtimeMode: () => 'independent',
        currentGenerationIdentity: () => live,
        suppressesAutomaticGeneration: () => false,
        hasExistingFollowRabbitMirror: () => false,
        cancelSupersededFlightsForBase: () => {},
        automaticDispatchAlreadyConsumed: () => false,
        hasAutomaticFailureStop: () => false,
        hostGenerationActivity: () => ({ strong: false, weak: false }),
        cancelFlightsForSlot: () => {},
        generateFor: () => { dispatches.push({ at: clock.now(), hash: live.sourceHash, revision: live.revision }); },
        renderAutomaticDispatchConsumed: () => {},
        renderGenerationGateTimeout: () => { throw new Error('exact stable source must not time out'); },
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
        Date: { now: clock.now },
        setTimeout: clock.setTimeoutFake,
        clearTimeout: clock.clearTimeoutFake,
        Math,
        Number,
        String,
        globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source.slice(start, end)}
globalThis.schedule=scheduleMessageGeneration;`, sandbox);
    sandbox.globalThis.schedule(1, 120, true, true, true);
    clock.advance(200);
    assert.deepEqual(dispatches, [{ at: 200120, hash: 'hash:final', revision: 7 }], 'upstream-stable source should dispatch after one exact 120ms recheck');
    assert.equal(clock.timers.size, 0);

    // A changed source must still lose the fast path before the paid boundary.
    dispatches.length = 0;
    sandbox.globalThis.schedule(1, 120, true, true, true);
    live = { ...live, msg: { is_user: false, mes: 'CHANGED' }, sourceHash: 'hash:changed', revision: 8 };
    sandbox.suppressesAutomaticGeneration = () => true;
    clock.advance(200);
    assert.equal(dispatches.length, 0, 'hash/revision replacement must revoke the pre-authorized fast path');
    assert.equal(clock.timers.size, 0);
}

console.log('independentFinalDispatchLatency: short final-render polling and single downstream recheck covered');
