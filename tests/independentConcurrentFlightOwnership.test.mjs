import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/independentApi.js', import.meta.url), 'utf8');
const ownershipStart = source.indexOf('function currentGenerationIdentity(');
const ownershipEnd = source.indexOf('\nfunction independentHostForRoot(', ownershipStart);
const scheduleStart = source.indexOf('function scheduleMessageGeneration(');
const scheduleEnd = source.indexOf('\nfunction ensureGenerationPlaceholderForIndex(', scheduleStart);
const observerStart = source.indexOf('function installObserverIfNeeded(');
const observerEnd = source.indexOf('\nfunction resolveHostEventMessageIndex(', observerStart);

assert.ok(ownershipStart >= 0 && ownershipEnd > ownershipStart, 'independent flight ownership block must exist');
assert.ok(scheduleStart >= 0 && scheduleEnd > scheduleStart, 'message generation scheduler block must exist');
assert.ok(observerStart >= 0 && observerEnd > observerStart, 'bounded observer block must exist');
const ownershipSource = source.slice(ownershipStart, ownershipEnd);
const scheduleSource = source.slice(scheduleStart, scheduleEnd);
const observerSource = source.slice(observerStart, observerEnd);

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function hashBody(message) {
    return `body:${String(message?.mes || '')}`;
}

function makeOwner(index) {
    return {
        index,
        parentElement: {},
        contains() { return false; },
        getAttribute(name) { return name === 'mesid' ? String(index) : null; },
    };
}

function makeHost(index, key, sourceHash, ownerChat = 'chat:test') {
    const details = {
        outerHTML: '<details><summary>loading</summary></details>',
        cloneNode() { return this; },
        querySelector() { return null; },
    };
    return {
        index,
        isConnected: true,
        hidden: false,
        dataset: {
            rmKey: key,
            rmSource: 'independent',
            rmState: 'loading',
            rmSourceHash: sourceHash,
            rmOwnerMesid: String(index),
            rmExternalOwnerMessage: String(index),
            rmOwnerChat: ownerChat,
            rmOwnerSwipe: '0',
        },
        querySelector(selector) { return selector === ':scope > details' ? details : null; },
        remove() { this.isConnected = false; },
    };
}

function createFixture(initialMessages, { ownerChat = 'chat:test' } = {}) {
    const context = { chat: [...initialMessages] };
    const owners = new Map();
    const hosts = new Map();
    const requests = new Map();
    const requestLog = [];
    const requestSignals = new Map();
    const postCounts = new Map();
    const abortCounts = new Map();
    const persistedWrites = [];
    const readyWrites = [];
    const queuedSyncs = [];
    const flights = new Map();
    const pending = new Map();
    const generationPolls = new Map();
    const epochs = new Map();
    const consumedAutomaticBases = new Set();
    const consumedErrors = [];
    const store = {};
    let hostGenerationActive = false;
    let observedMutation = null;

    for (let index = 0; index < context.chat.length; index += 1) {
        if (context.chat[index]?.is_user !== true) owners.set(index, makeOwner(index));
    }

    const baseFor = (index, message) => `${ownerChat}:${Number(index)}:${Number(message?.swipe_id || 0)}`;
    const slotFor = (index, message) => `${baseFor(index, message)}:${hashBody(message)}`;
    const observe = (_ctx, index, message) => ({
        slot: slotFor(index, message),
        sourceHash: hashBody(message),
        bodyHash: hashBody(message),
        displayHash: '',
        reasoningHash: '',
        legacySlots: [],
        revision: 1,
    });

    const sandbox = {
        RUNTIME_VERSION: '1.5-test',
        INDEPENDENT_RECORD_BUDGET_BYTES: 2_000_000,
        pending,
        generationPolls,
        generationSequence: 0,
        observer: null,
        AbortController,
        Date,
        Number,
        String,
        Map,
        Set,
        Object,
        Array,
        setTimeout,
        clearTimeout,
        console,
        toastr: { error() {} },

        getContext: () => context,
        getSettings: () => ({
            enabled: true,
            autoRabbitMirrorInjection: true,
            generationSource: 'independent',
            independentApiModel: 'test-model',
        }),
        currentRuntime: () => true,
        runtimeMode: () => 'independent',
        isRabbitMirrorEligibleAssistantMessage: message => !!message && message.is_user !== true && typeof message.mes === 'string',
        observeMessageSourceRevision: observe,
        recordKey: (_ctx, index, message) => slotFor(index, message),
        messageBaseSlotKey: (_ctx, index, message) => baseFor(index, message),
        messageSourceFingerprint: hashBody,
        messageBodyFingerprint: hashBody,
        messageDisplayFingerprint: () => '',
        messageReasoningFingerprint: () => '',
        chatKey: () => ownerChat,
        legacyChatKey: () => ownerChat,
        swipeId: message => Number(message?.swipe_id || 0),
        automaticCutoverVersionToken: message => `${Number(message?.swipe_id || 0)}:${hashBody(message)}`,
        operationEpochForBase: base => Number(epochs.get(String(base)) || 1),
        advanceOperationEpochForBase(base) {
            const next = Number(epochs.get(String(base)) || 1) + 1;
            epochs.set(String(base), next);
            return next;
        },
        globalOperationEpochs: () => epochs,
        hasExplicitSourceReplacementEvidence: () => false,
        messageElement: index => owners.get(Number(index)) || null,
        suppressesAutomaticGeneration: () => false,
        hasExistingFollowRabbitMirror: () => false,
        hasAutomaticFailureStop: () => false,
        clearAutomaticFailureStop() {},
        markAutomaticFailureStop() {},

        readStore: () => store,
        writeStore() {},
        persistedOwnerForMessage: () => null,
        independentStoredHtmlRestorable: html => String(html || '').includes('<details'),
        chatPersistenceSlot: () => '',
        saveRecordForSlot(target, slot, record) { target[slot] = record; },
        setOwnerLockForBase() {},
        lockedIndependentRecordForBase: () => null,
        recoverSavedRecord: () => ({ saved: null, storeChanged: false }),
        collapseDuplicateIdentityHosts: element => hosts.get(Number(element?.index)) || null,
        readyDetailsFromHost: () => null,
        mountedIndependentReadyHostMatchesObserved: () => false,
        readyRecordFromHost: () => null,
        usableReadyDetails: () => false,
        stripIndependentTransientLayoutArtifacts() {},
        appendHistoryEntry() {},
        writePersistedOwner(_ctx, index, _message, record) { persistedWrites.push({ index, record }); },
        rebuildCollapsedReadyHost() {},

        flightIdentity: (slot, hash) => `${slot}\u0000${hash}`,
        baseSlotOf: slot => String(slot || ''),
        parseMessageIndexFromOwnerKey(key = '') {
            const parts = String(key || '').split(':').filter(Boolean);
            if (parts.length < 2) return null;
            const numeric = value => /^\d+$/.test(String(value || ''));
            if (numeric(parts.at(-2)) && numeric(parts.at(-1))) {
                return { index: Number(parts.at(-2)), swipe: Number(parts.at(-1)), sourceHash: '' };
            }
            return null;
        },
        globalFlights: () => flights,
        queueMessageSync(indices) { queuedSyncs.push([...indices]); },
        createManualDispatchLease: () => ({ epoch: 1, release() {}, consume() { return true; } }),
        reserveAutomaticDispatchLease(baseSlot) {
            const epoch = Number(epochs.get(String(baseSlot)) || 1);
            return {
                epoch,
                release() {},
                consume() {
                    consumedAutomaticBases.add(String(baseSlot));
                    return true;
                },
            };
        },
        automaticDispatchAlreadyConsumed: baseSlot => consumedAutomaticBases.has(String(baseSlot)),
        renderAutomaticDispatchConsumed(index, sourceHash) { consumedErrors.push({ index, sourceHash }); },
        generationPollKey: index => `chat:test:${Number(index)}`,
        exactIndependentReadyForIdentity: () => null,
        restoreExactIndependentReadyForIdentity: () => null,
        createIndependentRequestDeadline: () => ({ progress() {}, clear() {} }),

        callIndependentApi(_ctx, index, _message, signal, options = {}) {
            const normalized = Number(index);
            const request = deferred();
            requests.set(normalized, request);
            requestLog.push({ index: normalized, request, signal });
            requestSignals.set(normalized, signal);
            postCounts.set(normalized, Number(postCounts.get(normalized) || 0) + 1);
            options.dispatchLease?.consume?.();
            signal.addEventListener('abort', () => abortCounts.set(normalized, Number(abortCounts.get(normalized) || 0) + 1), { once: true });
            return request.promise;
        },
        ensureExternalUi(element, key, html, state, _source, sourceHash) {
            const index = Number(element?.index);
            let host = hosts.get(index);
            if (!host || !host.isConnected) {
                host = makeHost(index, key, sourceHash, ownerChat);
                hosts.set(index, host);
            }
            host.dataset.rmKey = key;
            host.dataset.rmSourceHash = String(sourceHash || '');
            host.dataset.rmState = state;
            if (state === 'ready') {
                host.readyHtml = html;
                readyWrites.push({ index, key, sourceHash, html });
            }
            return host;
        },
        commitIndependentVisualResult: () => null,
        getActiveFeedbackForCurrentChat: () => null,
        markFeedbackCatInjected() {},
        consumeInjectedFeedbackForSuccessfulIndependentRabbitMirror() {},
        wrappedIndependentMirrorHtml: html => html,
        scrubIndependentInteractionState: html => html,
        independentRecordWithinBudget: () => true,
        byteLength: value => String(value || '').length,
        recordRabbitMirrorRecipe() {},

        disconnectObserver() {},
        allExternalHosts: () => [...hosts.values()].filter(host => host.isConnected),
        currentChatHasRestorableIndependentRecord: () => false,
        MutationObserver: class {
            constructor(callback) { observedMutation = callback; }
            observe() {}
            disconnect() {}
        },
        document: { querySelector: selector => selector === '#chat' ? {} : null },
        hostGenerationLooksActive: () => hostGenerationActive,
        removedMutationIndices: () => new Set([0]),
        relevantMutationIndices: () => new Set(),
        markExternalHostsAwaitingOwner() {},
        globalThis: { __rabbitMirrorPerfDiag: null },
    };

    vm.createContext(sandbox);
    vm.runInContext(`${scheduleSource}
${ownershipSource}
${observerSource}
globalThis.runGenerate = generateFor;
globalThis.scheduleGeneration = scheduleMessageGeneration;
globalThis.syncBase = cancelSupersededFlightsForBase;
globalThis.cancelMessage = cancelFlightsForMessage;
globalThis.installObserver = installObserverIfNeeded;`, sandbox);

    return {
        context,
        owners,
        hosts,
        requests,
        requestLog,
        requestSignals,
        postCounts,
        abortCounts,
        persistedWrites,
        readyWrites,
        queuedSyncs,
        flights,
        pending,
        generationPolls,
        consumedErrors,
        epochs,
        baseFor,
        slotFor,
        runGenerate: (index, message = context.chat[index]) => sandbox.globalThis.runGenerate(index, message, false, true),
        runManual: (index, message = context.chat[index]) => sandbox.globalThis.runGenerate(index, message, true, true),
        scheduleGeneration: (index, delay = 0) => sandbox.globalThis.scheduleGeneration(index, delay, true),
        syncBase: (base, hash) => sandbox.globalThis.syncBase(base, hash),
        cancelMessage: (index, reason = 'message-source-changed', preserveBase = '') => sandbox.globalThis.cancelMessage(index, reason, preserveBase),
        append(message) {
            const index = context.chat.push(message) - 1;
            if (message?.is_user !== true) owners.set(index, makeOwner(index));
            return index;
        },
        resolve(index, label = index) {
            requests.get(Number(index))?.resolve({
                html: `<details><summary>READY ${label}</summary><div>content</div></details>`,
                requestDiagnostic: { requestCount: 1, automaticRetry: false },
            });
        },
        removeOwner(index) {
            owners.delete(Number(index));
            const host = hosts.get(Number(index));
            if (host) host.isConnected = false;
        },
        replaceOwnerInPlace(index) {
            const normalized = Number(index);
            const host = hosts.get(normalized);
            if (host) host.isConnected = false;
            owners.set(normalized, makeOwner(normalized));
        },
        setHostGenerationActive(value) { hostGenerationActive = value === true; },
        installObserver() { sandbox.globalThis.installObserver(); },
        fireRemovalMutation() {
            assert.equal(typeof observedMutation, 'function', 'observer callback must be installed');
            observedMutation([{ removedNodes: [{}], addedNodes: [], target: {} }]);
        },
    };
}

test('a second floor and passive same-owner hash drift preserve the unresolved first flight and its single POST', async () => {
    const fixture = createFixture([{ is_user: false, mes: 'A FINAL', swipe_id: 0 }]);
    const first = fixture.runGenerate(0);
    const firstBase = fixture.baseFor(0, fixture.context.chat[0]);

    fixture.append({ is_user: true, mes: 'USER TWO' });
    const secondIndex = fixture.append({ is_user: false, mes: 'B FINAL', swipe_id: 0 });
    const second = fixture.runGenerate(secondIndex);

    assert.equal(fixture.pending.size, 2, 'two distinct mesids must own two unresolved pending flights');
    assert.equal(fixture.flights.size, 2, 'two distinct mesids must coexist in the shared flight registry');

    fixture.context.chat[0].mes = 'A FINAL WITH PASSIVE HOST POSTWRITE';
    fixture.syncBase(firstBase, hashBody(fixture.context.chat[0]));

    const firstAbortedAfterPassiveSync = fixture.requestSignals.get(0)?.aborted === true;
    const firstLoadingConnectedAfterPassiveSync = fixture.hosts.get(0)?.isConnected === true;
    const flightsAfterPassiveSync = fixture.flights.size;
    const pendingAfterPassiveSync = fixture.pending.size;

    fixture.resolve(0, 'A');
    fixture.resolve(secondIndex, 'B');
    await Promise.all([first, second]);

    assert.equal(firstAbortedAfterPassiveSync, false, 'a passive same-mesid/swipe body rewrite is not a new host operation');
    assert.equal(firstLoadingConnectedAfterPassiveSync, true, 'the paid first flight must keep its loading shell mounted');
    assert.equal(flightsAfterPassiveSync, 2, 'passive drift must not delete either floor from the flight registry');
    assert.equal(pendingAfterPassiveSync, 2, 'passive drift must not delete either floor from pending');
    assert.equal(fixture.hosts.get(0)?.dataset.rmState, 'ready', 'the late first result must still settle on its exact mesid');
    assert.equal(fixture.hosts.get(secondIndex)?.dataset.rmState, 'ready', 'the second floor settles independently');
    assert.equal(fixture.postCounts.get(0), 1, 'reconciliation/remount must never issue a second POST for floor A');
    assert.equal(fixture.postCounts.get(secondIndex), 1, 'floor B also owns exactly one POST');
});

test('Android-style owner replacement plus passive postwrite keeps one paid request and mounts its success', async () => {
    const fixture = createFixture([{ is_user: false, mes: 'ANDROID H0', swipe_id: 0 }]);
    const automatic = fixture.runGenerate(0);
    const base = fixture.baseFor(0, fixture.context.chat[0]);

    // SillyTavern/Android WebView may replace the message DOM and normalize the
    // same mesid+Swipe body while the already-paid request is still running.
    // This is passive host work, not a Swipe, resay, continue, or new operation.
    fixture.replaceOwnerInPlace(0);
    fixture.context.chat[0].mes = 'ANDROID H1 AFTER PASSIVE HOST POSTWRITE';
    fixture.syncBase(base, hashBody(fixture.context.chat[0]));

    assert.equal(fixture.requestSignals.get(0)?.aborted, false, 'passive Android owner/body replacement must not cancel the paid request');
    fixture.resolve(0, 'ANDROID READY');
    await automatic;

    assert.equal(fixture.postCounts.get(0), 1, 'owner replacement must never dispatch a second paid request');
    assert.equal(fixture.hosts.get(0)?.dataset.rmState, 'ready', 'the successful result must mount on the replacement owner');
    assert.match(fixture.hosts.get(0)?.readyHtml || '', /ANDROID READY/, 'the ready mirror must not disappear at settlement');
    assert.equal(fixture.persistedWrites.length, 1, 'the completed owner must be persisted exactly once');
    assert.equal(fixture.persistedWrites[0]?.record?.sourceHash, hashBody(fixture.context.chat[0]), 'persistence must bind to the settled H1 body');
    assert.equal(fixture.queuedSyncs.some(indices => indices.length === 1 && indices[0] === 0), true, 'settlement must queue only an exact mesid remount');
});

test('an explicit operation epoch change cancels only the superseded same-base flight', async () => {
    const fixture = createFixture([{ is_user: false, mes: 'A ORIGINAL', swipe_id: 0 }]);
    const first = fixture.runGenerate(0);
    const firstBase = fixture.baseFor(0, fixture.context.chat[0]);
    const originalEpoch = Number(fixture.epochs.get(firstBase) || 1);

    fixture.context.chat[0].mes = 'A EXPLICIT REGENERATE';
    fixture.epochs.set(firstBase, originalEpoch + 1);
    fixture.syncBase(firstBase, hashBody(fixture.context.chat[0]));

    const aborted = fixture.requestSignals.get(0)?.aborted === true;
    const loadingConnected = fixture.hosts.get(0)?.isConnected === true;
    fixture.resolve(0, 'STALE A');
    await first;

    assert.equal(aborted, true, 'a newer explicit operation epoch must cancel the old paid flight');
    assert.equal(loadingConnected, false, 'the superseded loading shell must not remain beside the regenerated body');
    assert.equal(fixture.readyWrites.some(write => write.index === 0), false, 'a cancelled late response must never overwrite the new operation');
    assert.equal(fixture.postCounts.get(0), 1, 'cancellation must not automatically retry or issue a replacement POST');
});

test('owner DOM removal during an active host generation schedules one exact passive remount after settlement', async () => {
    const fixture = createFixture([{ is_user: false, mes: 'A FINAL', swipe_id: 0 }]);
    const first = fixture.runGenerate(0);

    fixture.setHostGenerationActive(true);
    fixture.installObserver();
    fixture.removeOwner(0);
    fixture.fireRemovalMutation();
    fixture.resolve(0, 'A WITHOUT OWNER DOM');
    await first;

    assert.equal(
        fixture.queuedSyncs.some(indices => indices.length === 1 && indices[0] === 0),
        true,
        'the removed owner must receive an exact mesid-only remount sync even while another host generation is active',
    );
    assert.equal(fixture.queuedSyncs.some(indices => indices.some(index => index !== 0)), false, 'recovery must not scan or sync unrelated chat floors');
    assert.equal(fixture.postCounts.get(0), 1, 'the remount schedule is passive and must not dispatch another POST');
});

test('manual resay cancels a passive-drift automatic flight so its late result cannot overwrite the resay', async () => {
    const fixture = createFixture([{ is_user: false, mes: 'A ORIGINAL', swipe_id: 0 }]);
    const automatic = fixture.runGenerate(0);
    const base = fixture.baseFor(0, fixture.context.chat[0]);

    fixture.context.chat[0].mes = 'A PASSIVE HOST POSTWRITE';
    fixture.syncBase(base, hashBody(fixture.context.chat[0]));
    const manual = fixture.runManual(0);

    assert.equal(fixture.requestLog.length, 2, 'the explicit resay may dispatch once after the existing automatic request');
    fixture.requestLog[1].request.resolve({
        html: '<details><summary>MANUAL RESAY</summary><div>manual</div></details>',
        requestDiagnostic: { requestCount: 1, automaticRetry: false },
    });
    await manual;
    fixture.requestLog[0].request.resolve({
        html: '<details><summary>OLD AUTOMATIC</summary><div>stale</div></details>',
        requestDiagnostic: { requestCount: 1, automaticRetry: false },
    });
    await automatic;

    assert.match(fixture.hosts.get(0)?.readyHtml || '', /MANUAL RESAY/, 'a late automatic result from before the resay must never replace the explicit resay result');
    assert.equal(fixture.abortCounts.get(0), 1, 'starting the resay must abort the superseded automatic flight for the same base owner');
});

test('resume scheduling keeps an active consumed flight loading instead of painting a transient failure', async () => {
    const fixture = createFixture([{ is_user: false, mes: 'A FINAL', swipe_id: 0 }]);
    const automatic = fixture.runGenerate(0);

    fixture.scheduleGeneration(0, 0);
    await new Promise(resolve => setTimeout(resolve, 20));
    fixture.resolve(0, 'A');
    await automatic;

    assert.deepEqual(fixture.consumedErrors, [], 'a consumed lease with a live same-base flight is pending, not a failed already-dispatched operation');
    assert.equal(fixture.postCounts.get(0), 1, 'resume reconciliation must not issue another paid request');
    assert.equal(fixture.hosts.get(0)?.dataset.rmState, 'ready', 'the original active request still settles normally');
});

test('Swipe cancels the unresolved flight from the previous swipe identity', async () => {
    const fixture = createFixture([{ is_user: false, mes: 'SWIPE ZERO', swipe_id: 0 }]);
    const automatic = fixture.runGenerate(0);

    fixture.context.chat[0].swipe_id = 1;
    fixture.context.chat[0].mes = 'SWIPE ONE';
    fixture.cancelMessage(0, 'swipe-changed', fixture.baseFor(0, fixture.context.chat[0]));
    const abortedAtSwipe = fixture.requestSignals.get(0)?.aborted === true;
    const pendingAtSwipe = fixture.pending.size;
    fixture.resolve(0, 'STALE SWIPE ZERO');
    await automatic;

    assert.equal(abortedAtSwipe, true, 'MESSAGE_SWIPED must abort every older swipe flight for the same chat and mesid');
    assert.equal(pendingAtSwipe, 0, 'the previous swipe must leave no unresolved pending owner');
    assert.equal(fixture.readyWrites.length, 0, 'a late old-swipe response must never render under the new swipe');
});

test('a late MESSAGE_SWIPED preserves the already-started current swipe while cancelling only the old swipe', async () => {
    const fixture = createFixture([{ is_user: false, mes: 'SWIPE ZERO', swipe_id: 0 }]);
    const oldSwipe = fixture.runGenerate(0);

    fixture.context.chat[0].swipe_id = 1;
    fixture.context.chat[0].mes = 'SWIPE ONE';
    const currentSwipe = fixture.runGenerate(0);
    const currentBase = fixture.baseFor(0, fixture.context.chat[0]);
    fixture.cancelMessage(0, 'swipe-changed', currentBase);

    assert.equal(fixture.requestLog.length, 2, 'the two swipe operations each dispatch at most once');
    assert.equal(fixture.requestLog[0].signal.aborted, true, 'the previous swipe request is cancelled');
    assert.equal(fixture.requestLog[1].signal.aborted, false, 'a delayed Swipe event must preserve the exact current swipe request');
    assert.equal(fixture.pending.size, 1, 'only the current swipe remains pending');
    assert.equal(fixture.flights.size, 1, 'only the current swipe remains in the shared flight registry');
    assert.match(source, /cancelFlightsForMessage\(id,'swipe-changed',currentBase\)/, 'the host Swipe handler must pass the current base as its preservation boundary');

    fixture.requestLog[1].request.resolve({
        html: '<details><summary>CURRENT SWIPE</summary><div>current</div></details>',
        requestDiagnostic: { requestCount: 1, automaticRetry: false },
    });
    await currentSwipe;
    fixture.requestLog[0].request.resolve({
        html: '<details><summary>OLD SWIPE</summary><div>stale</div></details>',
        requestDiagnostic: { requestCount: 1, automaticRetry: false },
    });
    await oldSwipe;

    assert.match(fixture.hosts.get(0)?.readyHtml || '', /CURRENT SWIPE/, 'the late old swipe must not replace the current result');
    assert.equal(fixture.postCounts.get(0), 2, 'Swipe reconciliation does not dispatch a third paid request');
});

test('message-wide cancellation supports numeric chat keys and does not abort another message', async () => {
    const fixture = createFixture([
        { is_user: false, mes: 'FIRST', swipe_id: 0 },
        { is_user: true, mes: 'USER' },
        { is_user: false, mes: 'THIRD', swipe_id: 0 },
    ], { ownerChat: 'chat:123' });
    const first = fixture.runGenerate(0);
    const third = fixture.runGenerate(2);

    fixture.cancelMessage(0, 'manual-resay');
    assert.equal(fixture.requestLog[0].signal.aborted, true, 'numeric chat ids must still match and cancel the requested message');
    assert.equal(fixture.requestLog[1].signal.aborted, false, 'cancelling message 0 must not cancel another mesid in the same chat');
    assert.equal(fixture.pending.size, 1);
    assert.equal(fixture.flights.size, 1);

    fixture.requestLog[0].request.resolve({ html: '<details><summary>STALE FIRST</summary></details>' });
    fixture.requestLog[1].request.resolve({ html: '<details><summary>READY THIRD</summary></details>' });
    await Promise.all([first, third]);
    assert.equal(fixture.readyWrites.some(write => write.index === 0), false, 'the cancelled numeric-key message cannot render late');
    assert.equal(fixture.readyWrites.some(write => write.index === 2), true, 'the unrelated message still settles normally');
});
