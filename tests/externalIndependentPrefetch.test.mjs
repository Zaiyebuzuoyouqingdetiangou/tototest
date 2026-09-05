import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Exact production owner guards + callIndependentApi, with only prompt/store,
// host and transport seams substituted. This exercises the dispatch boundary,
// not real IndexedDB, browser DOM, model quality or a paid network request.
const source = readFileSync(new URL('../src/independentApi.js', import.meta.url), 'utf8');
const ownerStart = source.indexOf('function independentPromptOwnerPreflightError(');
const callStart = source.indexOf('async function callIndependentApi(', ownerStart);
const callEnd = source.indexOf('\nfunction externalOwnerMesid(', callStart);
assert.ok(ownerStart >= 0 && callStart > ownerStart && callEnd > callStart);
const descriptorStart = source.indexOf('function independentSelectedFormatDescriptors(');
const descriptorEnd = source.indexOf('\nfunction independentMultifacePostprocessError(', descriptorStart);
assert.ok(descriptorStart >= 0 && descriptorEnd > descriptorStart);
const ownCode = source.slice(ownerStart, callEnd);
const descriptorCode = source.slice(descriptorStart, descriptorEnd);
const localStart = source.indexOf('function independentLocalPreflightFailure(');
const localEnd = source.indexOf('function independentBatchPlanPreflightError(', localStart);
const terminalStart = source.indexOf('function independentRequestDiagnosticMatchesOwner(');
const terminalEnd = source.indexOf('function compactRemoteError(', terminalStart);
assert.ok(localStart >= 0 && localEnd > localStart && terminalStart >= 0 && terminalEnd > terminalStart);
const failureCode = `${source.slice(localStart, localEnd)}\n${source.slice(terminalStart, terminalEnd)}`;
const storageSource = readFileSync(new URL('../src/storage.js', import.meta.url), 'utf8');
function exactStorageFunction(name) {
    const start = storageSource.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `missing production storage helper ${name}`);
    const boundaries = ['\nfunction ', '\nexport function ', '\nasync function ', '\nexport async function ']
        .map(marker => storageSource.indexOf(marker, start + 1)).filter(index => index > start);
    return storageSource.slice(start, Math.min(...boundaries));
}
const releaseCode = ['normalizeBatchIdentity', 'batchMatchesExpected', 'planMatchesExpected', 'releasePendingComboBatch']
    .map(exactStorageFunction).join('\n');

function exactReleaseFixture(ownedPlan) {
    // Production release/membership logic; persistence is a small in-memory CAS
    // seam, not a claim of real browser localStorage or IndexedDB execution.
    const owned = structuredClone(ownedPlan);
    const foreignSameId = { ...structuredClone(owned), identity: { ...owned.identity, settingsKey: 'foreign-settings' } };
    const foreignBatch = { ...structuredClone(owned), batchId: 'foreign-batch' };
    let records = [owned, foreignSameId, foreignBatch].map(plan => ({ plan }));
    const sandbox = {
        ACTIVE_BATCH_REGISTRY_KEY: 'test-registry',
        readActiveBatchRegistry: () => ({ records, raw: JSON.stringify(records) }),
        writeOwnedTransaction(changes) {
            assert.equal(changes.length, 1);
            assert.equal(changes[0].key, 'test-registry');
            assert.equal(changes[0].before, JSON.stringify(records));
            records = JSON.parse(changes[0].after);
            return true;
        },
    };
    vm.runInNewContext(`${releaseCode}\nglobalThis.release=releasePendingComboBatch;`, sandbox);
    return { release: expected => sandbox.release(expected), records: () => records,
        foreign: [foreignSameId, foreignBatch] };
}
const extTheme = 'ext:LOCAL:theme:one:0';
const extFormat = 'ext:LOCAL:format:one:0';
const extFormat2 = 'ext:LOCAL:format:two:0';
const paidBoundary = new Error('TEST_PAID_BOUNDARY_REACHED');

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
    return { promise, resolve, reject };
}

function harness(options = {}) {
    const counters = { build: 0, plan: 0, render: 0, hydrate: 0, raw: 0, completion: 0, consume: 0, mark: 0, release: 0, fetch: 0 };
    const events = [];
    const message = { is_user: false, mes: 'final visible body', swipe_id: 0 };
    const ctx = { chatId: 'chat:external', chat: [message] };
    let live = ctx;
    let epoch = 4;
    let registered = false;
    let published = null;
    let latestPlan = null;
    let consumed = false;
    const controller = new AbortController();
    const ids = options.ids || [extTheme, extFormat];
    const maps = [];
    const rawIds = [];
    const released = [];
    const defaultRows = () => new Map(ids.map(id => [id, { externalId: id, classification: id.includes(':format:') ? 'format' : 'theme',
        enabled: true, userConfirmed: true, libraryId: 'LOCAL', sourceKeywords: ['paper'],
        rawContent: `PRIVATE_RAW_${id}`, localTitle: 'Selected title', summary: 'Selected summary' }]));
    const st = { independentApiBaseUrl: 'https://provider.invalid/v1', independentApiModel: 'test-model',
        independentApiMaxTokens: 12000, rabbitMirrorFaceCount: options.faceCount || 1,
        externalWorldBookRandomEnabled: true, externalWorldBookMixMode: 'external-only', ...options.settings };
    const metadata = () => ({ faceCount: st.rabbitMirrorFaceCount,
        themeIds: ids.filter(id => id.includes(':theme:')), formatIds: ids.filter(id => id.includes(':format:')),
        formatDescriptors: [{ id: extFormat, title: 'Selected title', summary: 'Selected summary', tags: ['paper'] }],
        ...(st.rabbitMirrorFaceCount > 1 ? { faces: Array.from({ length: st.rabbitMirrorFaceCount }, (_, faceIndex) => ({ faceIndex })) } : {}) });
    const makeBatch = (scope, context) => st.rabbitMirrorFaceCount > 1 ? {
        kind: 'rabbit-mirror-multiface-plan', schemaVersion: 1, batchId: 'test-external-batch',
        requestedFaceCount: st.rabbitMirrorFaceCount,
        identity: { chatKey: ctx.chatId, generationScopeKey: scope, ...context.batchIdentity, settingsKey: 'settings-fixture' },
        faces: Array.from({ length: st.rabbitMirrorFaceCount }, (_, faceIndex) => ({ faceIndex,
            combo: { themeIds: [extTheme], formatIds: [faceIndex ? extFormat2 : extFormat] } })),
    } : null;
    const resultDetails = plan => ({ prompt: 'SELECTED RULES', executionLock: 'EXECUTION LOCK', metadata: metadata(),
        ...(plan?.batchPlan ? { batchPlan: structuredClone(plan.batchPlan) } : {}) });
    const state = {
        counters, events, ctx, message, maps, rawIds, released, controller,
        get plan() { return latestPlan; },
        get published() { return published; },
        set published(value) { published = value; },
        setLive(value) { live = value; },
        bumpEpoch() { epoch += 1; },
        unregister() { registered = false; },
    };
    const sandbox = {
        Date, Map, AbortController,
        INDEPENDENT_BEHAVIOR_PATCH: '', MAX_INDEPENDENT_REQUEST_CHARS: 200000,
        independentPresentationFormatById: new Map([['builtin-form', options.builtinDescriptor || { title: 'Builtin title', summary: 'Builtin summary', tags: ['builtin'] }]]),
        getSettings: () => st,
        getContext: () => live,
        swipeId: msg => Number(msg?.swipe_id || 0),
        messageSourceFingerprint: msg => `hash:${msg?.mes}`,
        chatKey: value => value.chatId,
        messageBaseSlotKey: (value, index, msg) => `${value.chatId}:${index}:${Number(msg?.swipe_id || 0)}`,
        operationEpochForBase: () => epoch,
        createIndependentVisibleTextReader: () => msg => ({ text: msg.mes }),
        isRabbitMirrorEligibleAssistantMessage: msg => msg?.is_user !== true,
        hashText: value => `hash:${value}`,
        buildRabbitMirrorPromptDetails() { counters.build += 1; events.push('build'); return resultDetails(); },
        planRabbitMirrorPromptDetails(_st, _type, _feedback, scope, context) {
            counters.plan += 1; events.push('plan');
            latestPlan = options.planFactory ? options.planFactory(_st, _type, _feedback, scope, context)
                : { selectedExternalIds: [...ids], batchPlan: makeBatch(scope, context) };
            options.onPlan?.(state);
            return latestPlan;
        },
        renderRabbitMirrorPromptPlan(plan, map) {
            counters.render += 1; events.push('render');
            assert.equal(plan, latestPlan, 'render must receive the original one-time plan, never rebuild it');
            if (ids.length) assert.deepEqual([...map.keys()], ids, 'render must receive only the selected-ID operation map');
            else assert.equal(map, null);
            const result = options.renderFactory ? options.renderFactory(plan, map) : resultDetails(plan);
            options.onRender?.(state, result);
            return result;
        },
        getExternalPoolHydrationStatus: () => ({ hydrated: options.warm !== false,
            metadataRebuildRequired: options.missingMetadata || [], enabledMetadataRebuildRequired: options.enabledMissingMetadata || [] }),
        async hydrateExternalPoolMetadata() {
            counters.hydrate += 1; events.push('hydrate');
            if (options.hydration) await options.hydration.promise;
            options.onHydrate?.(state);
        },
        async getSelectedExternalEntries(selected) {
            counters.raw += 1; events.push('raw'); rawIds.push([...selected]);
            if (options.rawError) throw options.rawError;
            const map = options.rawGate ? await options.rawGate.promise : defaultRows();
            maps.push(map);
            return map;
        },
        recentIndependentVisualGuard: () => '', manualRetryVisualGuard: () => '',
        globalWorldInfoSnapshotFor: () => null,
        globalWorldInfoContextView: () => ({ block: '', includedEntries: 0, totalEntries: 0, chars: 0, truncated: false }),
        contextBundle: () => ({ text: 'safe bounded context', targetVisibleChars: 15, layers: 1, maxLayers: 1, filteredRabbitMirrorChars: 0, filteredExcludedTagChars: 0 }),
        recordRabbitMirrorIndependentPrompt(value) { state.tokenMetadata = value.metadata; },
        readLastIndependentApiRequestDiagnostic: () => ({ chatKeyHash: `hash:${ctx.chatId}`, mesid: 0, swipe: 0,
            sourceHash: `hash:${message.mes}`, operationEpoch: 4, requestCount: 1, semanticFailure: 'transport', nextProfile: 'old_nostream' }),
        publishIndependentApiRequestDiagnostic: value => value,
        markPendingBatchAttempt() { counters.mark += 1; options.onMark?.(state); return options.markAccepted !== false; },
        releasePendingComboBatch(expected) { counters.release += 1; released.push(expected); return options.onRelease?.(expected, state) ?? true; },
        independentBatchPlanPreflightError() { const error = new Error('batch rejected'); error.code = 'RABBIT_MIRROR_BATCH_PLAN_REJECTED'; return error; },
        async requestIndependentCompletion(_st, _system, _user, requestOptions) {
            counters.completion += 1; events.push('completion');
            options.beforeConsume?.(state);
            if (!requestOptions.dispatchLease.consume()) {
                const error = new Error('original lease rejected'); error.code = 'RABBIT_MIRROR_DISPATCH_LEASE_REJECTED'; throw error;
            }
            state.requestDiagnostic = requestOptions.diagnosticContext;
            throw paidBoundary;
        },
        fetch() { counters.fetch += 1; assert.fail('no real network is permitted in prefetch tests'); },
    };
    vm.runInNewContext(`${descriptorCode}\n${failureCode}\n${ownCode}\nglobalThis.api = { callIndependentApi, independentSelectedFormatDescriptors,
republishIndependentTerminalFailure, independentLocalPreflightFailure };`, sandbox);
    state.descriptors = value => JSON.parse(JSON.stringify(sandbox.api.independentSelectedFormatDescriptors(value)));
    state.localFailure = error => sandbox.api.independentLocalPreflightFailure(error);
    state.settle = error => sandbox.api.republishIndependentTerminalFailure(ctx, 0, message,
        `hash:${message.mes}`, `${ctx.chatId}:0:0`, 4, error, { consumed: () => consumed });
    state.start = () => {
        const promise = sandbox.api.callIndependentApi(ctx, 0, message, controller.signal, {
            slot: 'fixture-slot',
            dispatchLease: { epoch: 4, consume() { counters.consume += 1; consumed = options.leaseAccepted !== false; return consumed; }, consumed: () => consumed },
            isPromptOwnerCurrent: () => registered,
            currentBatchPlan: () => published,
            onBatchPlan(plan) { published = plan; options.onPublish?.(state); },
            ...(options.resay ? { multifaceResay: options.resay } : {}),
        });
        // Match generateFor: callIndependentApi starts before pending registration.
        registered = true;
        return promise;
    };
    state.rows = defaultRows;
    return state;
}

const reachesPaidBoundary = state => assert.rejects(state.start(), error => error === paidBoundary);
const ownerRejected = promise => assert.rejects(promise, error => error?.code === 'RABBIT_MIRROR_DISPATCH_LEASE_REJECTED'
    && error.requestCount === 0 && !String(error.message).includes('PRIVATE_RAW'));

test('builtin-disabled and builtin-only settings preserve one synchronous build with zero external work', async () => {
    for (const settings of [{ externalWorldBookRandomEnabled: false }, { externalWorldBookMixMode: 'builtin-only' }]) {
        const state = harness({ settings, warm: false });
        await reachesPaidBoundary(state);
        assert.deepEqual(state.events, ['build', 'completion']);
        assert.equal(state.counters.build, 1);
        assert.equal(state.counters.plan + state.counters.render + state.counters.hydrate + state.counters.raw, 0);
        assert.equal(state.counters.consume, 1);
        assert.equal(state.counters.fetch, 0);
    }
});

test('warm external path plans once, reads selected IDs once, renders once and clears raw before dispatch', async () => {
    const state = harness({ faceCount: 2, ids: [extTheme, extFormat, extFormat2],
        beforeConsume(current) { assert.equal(current.maps[0].size, 0, 'raw map must be cleared before the paid seam'); } });
    await reachesPaidBoundary(state);
    assert.deepEqual(state.events, ['plan', 'raw', 'render', 'completion']);
    assert.deepEqual(state.rawIds, [[extTheme, extFormat, extFormat2]]);
    assert.equal(state.counters.plan, 1);
    assert.equal(state.counters.mark, 1);
    assert.equal(state.counters.consume, 1);
    assert.equal(state.counters.fetch, 0);
    assert.equal(state.maps[0].size, 0);
    assert.equal(state.tokenMetadata.formatDescriptors[0].id, extFormat);
});

test('cold metadata is awaited before the only draw and owner registration is checked only after yielding', async () => {
    const hydration = deferred();
    const state = harness({ warm: false, hydration });
    const promise = state.start();
    assert.deepEqual(state.events, ['hydrate']);
    hydration.resolve();
    await assert.rejects(promise, error => error === paidBoundary);
    assert.deepEqual(state.events, ['hydrate', 'plan', 'raw', 'render', 'completion']);
    assert.equal(state.counters.consume, 1);
});

test('mixed selection with no external IDs skips raw and explicit external re-say is never rebuilt as builtin', async () => {
    const mixed = harness({ ids: [], settings: { externalWorldBookMixMode: 'balanced' } });
    await reachesPaidBoundary(mixed);
    assert.deepEqual(mixed.events, ['plan', 'render', 'completion']);
    const resay = harness({ settings: { externalWorldBookRandomEnabled: false, externalWorldBookMixMode: 'builtin-only' },
        resay: { faceIndex: 0, faces: [{ themeIds: [extTheme], formatIds: [extFormat] }] } });
    await reachesPaidBoundary(resay);
    assert.deepEqual(resay.events, ['plan', 'raw', 'render', 'completion']);
});

test('selected-raw read failure cannot render, redraw, fall back or consume a lease', async () => {
    const failure = Object.assign(new Error('selected entry missing'), { code: 'WORLD_BOOK_NOT_FOUND' });
    const state = harness({ rawError: failure });
    await assert.rejects(state.start(), error => error?.cause === failure && error.code === failure.code && error.requestCount === 0);
    assert.deepEqual(state.events, ['plan', 'raw']);
    assert.equal(state.counters.build + state.counters.render + state.counters.completion + state.counters.consume, 0);
});

test('only enabled legacy libraries needing metadata rebuild stop preflight; disabled legacy libraries do not', async () => {
    const enabled = harness({ missingMetadata: ['enabled-old', 'disabled-old'], enabledMissingMetadata: ['enabled-old'] });
    await assert.rejects(enabled.start(), error => error?.code === 'WORLD_BOOK_ENTRY_STATE_CONFLICT'
        && error.requestCount === 0 && /重建索引/.test(error.message));
    assert.equal(enabled.counters.plan + enabled.counters.raw + enabled.counters.completion + enabled.counters.consume, 0);
    const disabled = harness({ missingMetadata: ['disabled-old'], enabledMissingMetadata: [] });
    await reachesPaidBoundary(disabled);
    assert.equal(disabled.counters.consume, 1);
});

test('real terminal settlement preserves external preflight code and requestCount zero over a previous same-owner paid failure', async () => {
    for (const code of ['WORLD_BOOK_NOT_FOUND', 'WORLD_BOOK_ENTRY_STATE_CONFLICT', 'WORLD_BOOK_ENTRY_CONTENT_INVALID',
        'WORLD_BOOK_READ_FAILED', 'WORLD_BOOK_STORAGE_UNAVAILABLE', 'RABBIT_MIRROR_EXTERNAL_MATERIAL_MISSING',
        'RABBIT_MIRROR_EXTERNAL_MATERIAL_INVALID', 'MULTIFACE_PLAN_UNAVAILABLE']) {
        const original = Object.assign(new Error('PRIVATE_RAW_PROVIDER_DETAILS'), { code });
        const state = harness({ rawError: original });
        let failure;
        await assert.rejects(state.start(), error => { failure = error; return error.code === code && error.cause === original; });
        assert.equal(state.localFailure(failure).code, code, 'the real transport classifier must recognize this as local preflight');
        const terminal = state.settle(failure);
        assert.equal(terminal.requestCount, 0, 'previous same-owner requestCount=1 must not overwrite fresh preflight evidence');
        assert.equal(terminal.terminalStage, 'preflight');
        assert.equal(terminal.terminalErrorCode, code);
        assert.equal(terminal.semanticFailure, 'local-preflight');
        assert.equal(terminal.nextProfile, '');
        assert.equal(terminal.automaticRetry, false);
        assert.doesNotMatch(JSON.stringify(terminal), /PRIVATE_RAW/);
        assert.equal(state.counters.completion + state.counters.consume, 0);
    }
});

test('an unknown external read or render exception is safely wrapped as requestCount zero without leaking its text', async () => {
    const state = harness({ onRender() { throw new Error('PRIVATE_RAW_UNEXPECTED_RENDER_ERROR'); } });
    await assert.rejects(state.start(), error => error.code === 'RABBIT_MIRROR_EXTERNAL_PREFLIGHT_REJECTED'
        && error.requestCount === 0 && !/PRIVATE_RAW/.test(error.message));
    assert.equal(state.maps[0].size, 0);
    assert.equal(state.counters.completion + state.counters.consume, 0);
});

const changes = {
    'chat key': state => { state.ctx.chatId = 'different-chat'; },
    'chat array identity': state => { state.ctx.chat = [...state.ctx.chat]; },
    'message object identity': state => { state.ctx.chat[0] = { ...state.message }; },
    'message index': state => { state.ctx.chat.unshift({ is_user: true, mes: 'new slot' }); },
    swipe: state => { state.message.swipe_id = 1; },
    source: state => { state.message.mes += ' changed'; },
    epoch: state => state.bumpEpoch(),
    abort: state => state.controller.abort(),
    registration: state => state.unregister(),
};

test('every exact owner dimension is rechecked after selected raw awaits and resolved maps are cleared', async () => {
    for (const [label, change] of Object.entries(changes)) {
        const rawGate = deferred();
        const state = harness({ rawGate });
        const promise = state.start();
        change(state);
        const map = state.rows();
        rawGate.resolve(map);
        await ownerRejected(promise);
        assert.equal(map.size, 0, `${label}: resolved raw cannot survive the rejected operation`);
        assert.equal(state.counters.render + state.counters.completion + state.counters.consume, 0, label);
    }
});

test('every exact owner dimension is rechecked after metadata hydration before any draw or raw read', async () => {
    for (const [label, change] of Object.entries(changes)) {
        const hydration = deferred();
        const state = harness({ warm: false, hydration });
        const promise = state.start();
        change(state);
        hydration.resolve();
        await ownerRejected(promise);
        assert.equal(state.counters.plan + state.counters.raw + state.counters.render + state.counters.consume, 0, label);
    }
});

test('plan, render and onBatchPlan callbacks cannot cross to a changed owner unnoticed', async () => {
    for (const phase of ['onPlan', 'onRender', 'onPublish']) {
        const state = harness({ [phase]: current => { current.message.mes += ' changed'; } });
        await ownerRejected(state.start());
        assert.equal(state.counters.completion + state.counters.consume, 0, phase);
        for (const map of state.maps) assert.equal(map.size, 0);
    }
});

test('dispatch consumption rechecks owner, epoch and exact published batch after all prefetch work', async () => {
    for (const change of [changes.source, changes.epoch, state => { state.published = structuredClone(state.published); }]) {
        const state = harness({ faceCount: 2, beforeConsume: change });
        await ownerRejected(state.start());
        assert.equal(state.counters.completion, 1, 'adapter entry is not a paid dispatch');
        assert.equal(state.counters.consume, 0, 'the original lease must remain unconsumed');
        assert.equal(state.counters.fetch, 0);
    }
});

test('batch identity and exact selected face IDs cannot change during the selected raw await', async () => {
    for (const mutate of [
        plan => { plan.batchPlan.batchId = 'other-batch'; },
        plan => { plan.batchPlan.identity.sourceHash = 'other-source'; },
        plan => { plan.batchPlan.faces[0].combo.formatIds = [extFormat2]; },
    ]) {
        const rawGate = deferred();
        const state = harness({ faceCount: 2, rawGate });
        const promise = state.start();
        mutate(state.plan);
        const map = state.rows();
        rawGate.resolve(map);
        await ownerRejected(promise);
        assert.equal(map.size, 0);
        assert.equal(state.counters.render + state.counters.consume, 0);
    }
});

test('render cannot add or drop a batch and attempt marking cannot hide a last-moment source change', async () => {
    const dropped = harness({ faceCount: 2, onRender(_state, details) { delete details.batchPlan; } });
    await ownerRejected(dropped.start());
    assert.equal(dropped.counters.completion, 0);
    const marked = harness({ faceCount: 2, onMark: changes.source });
    await ownerRejected(marked.start());
    assert.equal(marked.counters.mark, 1);
    assert.equal(marked.counters.consume, 0);
});

test('the original dispatch lease is still authoritative and no rejected batch is retried', async () => {
    const state = harness({ faceCount: 2, leaseAccepted: false });
    await assert.rejects(state.start(), error => error?.code === 'RABBIT_MIRROR_DISPATCH_LEASE_REJECTED');
    assert.equal(state.counters.consume, 1);
    assert.equal(state.counters.completion, 1);
    assert.equal(state.counters.release, 1);
    assert.equal(state.counters.plan, 1);
    assert.equal(state.counters.raw, 1);
    assert.equal(state.counters.fetch, 0);
});

test('raw maps are operation-local and are neither reused nor retained by a later invocation', async () => {
    const first = harness();
    const second = harness();
    await reachesPaidBoundary(first);
    await reachesPaidBoundary(second);
    assert.notEqual(first.maps[0], second.maps[0]);
    assert.equal(first.maps[0].size + second.maps[0].size, 0);
    assert.equal(first.counters.raw + second.counters.raw, 2);
});

test('missing or stale prefetch releases only the original frozen batch before onBatchPlan, not foreign reservations', async () => {
    for (const reason of ['missing', 'stale']) {
        const rawGate = deferred();
        let registry;
        const state = harness({ faceCount: 2,
            ...(reason === 'missing' ? { rawError: Object.assign(new Error('missing selected row'), { code: 'WORLD_BOOK_NOT_FOUND' }) } : { rawGate }),
            onPlan(current) { registry = exactReleaseFixture(current.plan.batchPlan); },
            onRelease(expected) { return registry.release(expected); },
        });
        const promise = state.start();
        if (reason === 'stale') {
            state.message.mes += ' changed';
            // A mutated asynchronous plan must not redirect cleanup at a foreign
            // in-flight operation with another valid batch ID.
            state.plan.batchPlan.batchId = 'foreign-batch';
            rawGate.resolve(state.rows());
        }
        await assert.rejects(promise, error => error.requestCount === 0);
        assert.equal(state.published, null, 'the outer flight has not received onBatchPlan');
        assert.equal(state.counters.release, 1, 'local prefetch cleanup must release immediately rather than depend on TTL');
        assert.equal(state.released[0].batchId, 'test-external-batch');
        assert.equal(Object.isFrozen(state.released[0]), true);
        assert.equal(Object.isFrozen(state.released[0].identity), true);
        assert.deepEqual(registry.records().map(record => record.plan), registry.foreign,
            'both a same-ID other identity and an unrelated batch must remain intact');
        assert.equal(state.counters.completion + state.counters.consume, 0);
    }
});

test('builtin descriptor title, summary, tags and legacy label fallback retain their original bytes and cardinality', () => {
    const builtin = { title: `  ${'t'.repeat(200)}  `, summary: `\n${'s'.repeat(400)}\n`,
        tags: ['  spaced tag  ', ...Array(6).fill('g'.repeat(100))] };
    const state = harness({ builtinDescriptor: builtin });
    const ids = Array(10).fill('builtin-form');
    const result = state.descriptors({ formatIds: [...ids, 'legacy-missing'], formatLabels: [...Array(10).fill('unused'), '  old label  '],
        formatDescriptors: [{ id: 'builtin-form', title: 'must not override builtin' }] });
    assert.equal(result.length, 11, 'the external eight-entry limit must not apply to native selections');
    for (const descriptor of result.slice(0, 10)) assert.deepEqual(descriptor, { id: 'builtin-form', ...builtin });
    assert.deepEqual(result[10], { id: 'legacy-missing', title: '  old label  ', summary: '', tags: [] });
});

test('quality descriptors use bounded exact-ID external metadata without accepting unrelated raw fields', () => {
    const state = harness();
    const result = state.descriptors({ formatIds: [extFormat, 'builtin-form'], formatLabels: ['label fallback'], formatDescriptors: [
        { id: 'unselected', title: 'WRONG', summary: 'WRONG' },
        { id: extFormat, title: 't'.repeat(200), summary: 's'.repeat(300), tags: Array(6).fill('g'.repeat(100)), rawContent: 'PRIVATE_RAW' },
        { id: 'builtin-form', title: 'SPOOFED_BUILTIN', summary: 'SPOOFED_BUILTIN' },
    ] });
    assert.equal(result[0].title.length, 160);
    assert.equal(result[0].summary.length, 210);
    assert.deepEqual(result[0].tags.map(tag => tag.length), [64, 64, 64, 64]);
    assert.equal(result[1].title, 'Builtin title');
    assert.doesNotMatch(JSON.stringify(result), /WRONG|PRIVATE_RAW|SPOOFED_BUILTIN/);
    assert.deepEqual(state.descriptors({ formatIds: [extFormat], formatLabels: [' fallback '],
        formatDescriptors: [{ id: extFormat, summary: { raw: 'PRIVATE_RAW' }, tags: [{ raw: 'PRIVATE_RAW' }] }] }),
    [{ id: extFormat, title: 'fallback', summary: '', tags: [] }]);
    const ids = Array.from({ length: 12 }, (_, index) => `ext:LOCAL:format:${index}:0`);
    assert.equal(state.descriptors({ formatIds: ids }).length, 8);
});

let nativeModules;
async function realResayModules() {
    if (nativeModules) return nativeModules;
    const values = new Map();
    globalThis.localStorage = {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
    };
    globalThis.sessionStorage = globalThis.localStorage;
    globalThis.fetch = () => assert.fail('real resay modules must not access network');
    const importFor = (text, owner, fileName) => {
        const path = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1])
            .find(value => value.split('?')[0].endsWith(`/${fileName}`));
        assert.ok(path, `missing production import ${fileName}`);
        return new URL(path, owner);
    };
    const apiUrl = new URL('../src/independentApi.js', import.meta.url);
    const promptUrl = importFor(source, apiUrl, 'promptBuilder.js');
    const pickerUrl = importFor(readFileSync(promptUrl, 'utf8'), promptUrl, 'picker.js');
    const poolUrl = importFor(readFileSync(pickerUrl, 'utf8'), pickerUrl, 'externalPool.js');
    nativeModules = {
        prompt: await import(promptUrl.href),
        pool: await import(poolUrl.href),
        defaults: (await import(importFor(source, apiUrl, 'settings.js').href)).defaultSettings,
    };
    return nativeModules;
}

test('cold explicit external re-say uses real prompt/picker/pool after lightweight hydration even when random sampling is OFF', async () => {
    const native = await realResayModules();
    for (const randomEnabled of [false, true]) {
        native.pool.clearExternalPoolSnapshot();
        const hydration = deferred();
        const state = harness({ warm: false, hydration,
            settings: { ...structuredClone(native.defaults), enabled: true, autoRabbitMirrorInjection: true, mode: 'all',
                rabbitMirrorFaceCount: 1, independentApiBaseUrl: 'https://provider.invalid/v1', independentApiModel: 'test-model',
                externalWorldBookRandomEnabled: randomEnabled, externalWorldBookMixMode: randomEnabled ? 'external-only' : 'builtin-only' },
            resay: { faceIndex: 0, faces: [{ themeIds: [extTheme], formatIds: [extFormat], samplingMode: 'classic' }] },
            missingMetadata: ['UNRELATED_OLD_LIBRARY'], enabledMissingMetadata: ['UNRELATED_OLD_LIBRARY'],
            planFactory: native.prompt.planRabbitMirrorPromptDetails,
            renderFactory: native.prompt.renderRabbitMirrorPromptPlan,
            // IDB completion is the only substituted stage here: use the real
            // metadata snapshot API, then real membership / exact re-say / render.
            onHydrate() {
                native.pool.setExternalPoolMetadataSnapshot([
                    { libraryId: 'LOCAL', enabled: true }, { libraryId: 'UNRELATED_OLD_LIBRARY', enabled: true },
                ], [{ libraryId: 'LOCAL', enabled: true, schemaVersion: native.pool.EXTERNAL_POOL_METADATA_VERSION,
                    themeIds: [extTheme], formatIds: [extFormat] }]);
            },
        });
        globalThis.SillyTavern = { getContext: () => state.ctx };
        const promise = state.start();
        assert.deepEqual(state.events, ['hydrate']);
        assert.equal(native.pool.getExternalPoolSnapshot().formatCount, 0, 'the pre-hydration real eligible pool is empty');
        hydration.resolve();
        await assert.rejects(promise, error => error === paidBoundary);
        assert.deepEqual(state.events, ['hydrate', 'plan', 'raw', 'render', 'completion']);
        assert.deepEqual(state.tokenMetadata.themeIds, [extTheme]);
        assert.deepEqual(state.tokenMetadata.formatIds, [extFormat]);
        assert.equal(state.counters.consume, 1);
        assert.equal(state.counters.build, 0);
        assert.equal(state.maps[0].size, 0);
    }
});

test('cold OFF re-say still fails closed when its exact external form is absent after real metadata hydration', async () => {
    const native = await realResayModules();
    native.pool.clearExternalPoolSnapshot();
    const state = harness({ warm: false,
        settings: { ...structuredClone(native.defaults), enabled: true, autoRabbitMirrorInjection: true, mode: 'all',
            rabbitMirrorFaceCount: 1, externalWorldBookRandomEnabled: false, externalWorldBookMixMode: 'builtin-only' },
        resay: { faceIndex: 0, faces: [{ themeIds: [extTheme], formatIds: [extFormat], samplingMode: 'classic' }] },
        planFactory: native.prompt.planRabbitMirrorPromptDetails,
        renderFactory: native.prompt.renderRabbitMirrorPromptPlan,
        onHydrate() { native.pool.setExternalPoolMetadataSnapshot([{ libraryId: 'LOCAL', enabled: true }], [
            { libraryId: 'LOCAL', enabled: true, schemaVersion: native.pool.EXTERNAL_POOL_METADATA_VERSION,
                themeIds: [extTheme], formatIds: [] },
        ]); },
    });
    globalThis.SillyTavern = { getContext: () => state.ctx };
    await assert.rejects(state.start(), error => error.code === 'MULTIFACE_PLAN_UNAVAILABLE' && error.requestCount === 0);
    assert.deepEqual(state.events, ['hydrate', 'plan']);
    assert.equal(state.counters.raw + state.counters.render + state.counters.completion + state.counters.consume, 0);
});
