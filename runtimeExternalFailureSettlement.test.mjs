import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describeExternalWorldBookPreflightFailure } from '../src/externalWorldBook/errors.js';

// Real generateFor, prefetch owner guards, current identity and terminal
// diagnostic code. Only IDB awaiting and the host/DOM boundary are doubled.
const source = readFileSync(process.env.RM_FAILURE_BASELINE_ROOT
    ? resolve(process.env.RM_FAILURE_BASELINE_ROOT, 'src/independentApi.js')
    : new URL('../src/independentApi.js', import.meta.url), 'utf8');
function block(name) {
    const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source);
    assert.ok(match, `production ${name}`);
    const ends = ['\nfunction ', '\nasync function ', '\nexport function ', '\nexport async function ']
        .map(marker => source.indexOf(marker, match.index + match[0].length)).filter(index => index > match.index);
    return source.slice(match.index, Math.min(...ends));
}
const production = ['independentPromptOwnerPreflightError', 'independentExternalPromptPreflightError',
    'independentPromptBatchSignature', 'captureIndependentPromptOwner', 'assertIndependentPromptOwner',
    'independentLocalPreflightFailure', 'independentRequestDiagnosticMatchesOwner',
    'independentTerminalFailureDetails', 'republishIndependentTerminalFailure',
    'currentGenerationIdentity', 'settleCancelledIndependentFlightUi', 'generateFor'].map(block).join('\n');

function fixture() {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const message = { is_user: false, mes: 'Original completed scene.', swipe_id: 0 };
    const ctx = { chatId: 'original', chat: [message] };
    let epoch = 1, explicit = false, prepareCalls = 0, consumes = 0;
    const pending = new Map(), flights = new Map(), stops = new Map(), ui = [], diagnostics = [];
    const element = {};
    const host = { isConnected: true, dataset: {}, remove() { this.isConnected = false; } };
    const hash = msg => `hash:${msg.mes}`;
    const base = (_ctx, index, msg) => `chat:${_ctx.chatId}:${index}:${msg.swipe_id}`;
    const key = (_ctx, index, msg) => `${base(_ctx, index, msg)}:${hash(msg)}`;
    const observe = (_ctx, index, msg) => ({ slot: key(_ctx, index, msg), sourceHash: hash(msg), bodyHash: hash(msg),
        displayHash: '', reasoningHash: '', revision: msg.mes === 'Original completed scene.' ? 1 : 2 });
    const box = {
        AbortController, Map, Set, Date, generationSequence: 0, pending, console: { error() {} },
        getContext: () => ctx, getSettings: () => ({ enabled: true, autoRabbitMirrorInjection: true, generationSource: 'independent' }),
        currentRuntime: () => true, runtimeMode: () => 'independent',
        isRabbitMirrorEligibleAssistantMessage: candidate => !!candidate && !candidate.is_user,
        observeMessageSourceRevision: observe, recordKey: key, messageBaseSlotKey: base,
        messageSourceFingerprint: hash, chatKey: context => `chat:${context.chatId}`,
        hashText: text => `digest:${text}`, swipeId: msg => msg.swipe_id,
        operationEpochForBase: () => epoch, hasExplicitSourceReplacementEvidence: () => explicit,
        messageElement: () => element, suppressesAutomaticGeneration: () => false, hasExistingFollowRabbitMirror: () => false,
        automaticFailureStopFor: (slot, sourceHash) => stops.get(`${slot}\0${sourceHash}`),
        markAutomaticFailureStop(slot, sourceHash, _stage, metadata) { stops.set(`${slot}\0${sourceHash}`, { slot, sourceHash, ...metadata }); },
        clearAutomaticFailureStop() {}, renderAutomaticFailureStop(_index, identity, stop) { ui.push({ state: 'error', key: identity.key, sourceHash: identity.sourceHash, html: stop.message }); },
        readStore: () => ({}), writeStore() {}, persistedOwnerForMessage: () => null,
        lockedIndependentRecordForBase: () => null, recoverSavedRecord: () => ({ saved: null, storeChanged: false }),
        collapseDuplicateIdentityHosts: () => host, mountedIndependentReadyHostMatchesObserved: () => false,
        readyDetailsFromHost: () => null, readyRecordFromHost: () => null,
        cancelSupersededFlightsForBase() {}, cancelFlightsForSlot() {},
        flightIdentity: (slot, sourceHash) => `${slot}\0${sourceHash}`, globalFlights: () => flights,
        reserveAutomaticDispatchLease: () => ({ epoch, release() {}, consumed: () => consumes > 0, consume() { consumes += 1; return true; } }),
        createIndependentRequestDeadline: () => ({ clear() {} }),
        releasePendingComboBatch() {}, queueMessageSync() {},
        ensureExternalUi(_element, ownerKey, html, state, _source, sourceHash) {
            host.isConnected = true; Object.assign(host.dataset, { rmKey: ownerKey, rmSourceHash: sourceHash, rmState: state });
            ui.push({ key: ownerKey, html, state, sourceHash }); return host;
        },
        describeExternalWorldBookPreflightFailure,
        readLastIndependentApiRequestDiagnostic: () => diagnostics.at(-1) || null,
        publishIndependentApiRequestDiagnostic(value) { diagnostics.push(value); return value; },
    };
    vm.createContext(box);
    vm.runInContext(`${production}\nglobalThis.run=generateFor;globalThis.owner=captureIndependentPromptOwner;globalThis.assertOwner=assertIndependentPromptOwner;globalThis.wrap=independentExternalPromptPreflightError;`, box);
    box.callIndependentApi = async (context, index, msg, signal, requestOptions) => {
        prepareCalls += 1;
        const owner = box.owner(context, index, msg, signal, requestOptions, 'original-scope');
        await gate;
        owner.awaited = true;
        try {
            box.assertOwner(owner);
            throw Object.assign(new Error('fixed test IDB read failure'), { code: 'WORLD_BOOK_READ_FAILED' });
        } catch (error) { throw box.wrap(error, owner); }
    };
    return { ctx, message, stops, ui, diagnostics, release,
        run: () => box.run(0, message), liveKey: () => key(ctx, 0, ctx.chat[0]), liveHash: () => hash(ctx.chat[0]),
        setEpoch: value => { epoch = value; }, setExplicit: () => { explicit = true; },
        get prepareCalls() { return prepareCalls; }, get consumes() { return consumes; } };
}

test('same-operation host postwrite keeps a request-zero external failure on the settled source, not a forever-refresh shell', async () => {
    const state = fixture();
    const task = state.run();
    state.message.mes = 'Original completed scene. Host final formatting postwrite.';
    state.release(); await task;
    const terminal = state.ui.filter(item => item.state === 'error').at(-1);
    assert.ok(terminal, 'settled operation must expose its precise preflight failure');
    assert.equal(terminal.sourceHash, state.liveHash(), 'failure UI must not be attached to the stale prefetch source hash');
    assert.equal(terminal.key, state.liveKey());
    const stop = state.stops.get(`${state.liveKey()}\0${state.liveHash()}`);
    assert.ok(stop, 'passive reconcile must find the error at the current exact identity');
    assert.equal(stop.requestCount, 0);
    assert.equal(stop.code, 'RABBIT_MIRROR_DISPATCH_LEASE_REJECTED');
    assert.equal(stop.terminalStage, 'preflight');
    assert.equal(state.diagnostics.at(-1).sourceHash, state.liveHash());
    await state.run();
    assert.equal(state.prepareCalls, 1, 'a passive reconciliation does not restart failed material preparation');
    assert.equal(state.consumes, 0);
});

test('new Swipe, chat, epoch or explicit replacement never inherit the old external failure', async () => {
    for (const replace of [state => { state.message.swipe_id = 1; }, state => { state.ctx.chatId = 'another'; },
        state => state.setEpoch(2), state => state.setExplicit()]) {
        const state = fixture();
        const task = state.run(); replace(state); state.release(); await task;
        assert.equal(state.stops.size, 0, 'superseded flight must not stop a different owner');
        assert.equal(state.ui.filter(item => item.state === 'error').length, 0, 'superseded flight must not show its error on another reply');
        assert.equal(state.diagnostics.length, 0);
        assert.equal(state.consumes, 0);
    }
});

test('same-source host object replacement still rejects dispatch but exposes a request-zero error without passive retry', async () => {
    const state = fixture();
    const task = state.run();
    state.ctx.chat[0] = { ...state.message };
    state.release(); await task;
    const terminal = state.ui.filter(item => item.state === 'error').at(-1);
    assert.ok(terminal);
    assert.equal(terminal.sourceHash, state.liveHash());
    const stop = state.stops.get(`${state.liveKey()}\0${state.liveHash()}`);
    assert.equal(stop.code, 'RABBIT_MIRROR_DISPATCH_LEASE_REJECTED');
    assert.equal(stop.requestCount, 0);
    await state.run();
    assert.equal(state.prepareCalls, 1);
    assert.equal(state.consumes, 0);
});
