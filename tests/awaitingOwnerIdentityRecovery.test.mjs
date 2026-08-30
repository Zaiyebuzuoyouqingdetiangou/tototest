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
    const brace = source.indexOf('{', start);
    assert.ok(brace > start, `${name} body must exist`);
    let depth = 0;
    for (let i = brace; i < source.length; i += 1) {
        if (source[i] === '{') depth += 1;
        else if (source[i] === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error(`${name} body is not balanced`);
}


function makeDetails(content) {
    return {
        content,
        classList: { contains: () => false },
        cloneNode() {
            return {
                outerHTML: content,
                querySelector() { return { remove() {} }; },
                removeAttribute() {},
            };
        },
    };
}

function createHost({ mesid, sourceHash, swipe = 0, content, chat = 'chat:test' }) {
    const details = makeDetails(content);
    const parent = {
        insertBefore(node) { node.parentElement = parent; },
        hasAttribute() { return false; },
        querySelector() { return null; },
    };
    return {
        hidden: false,
        isConnected: true,
        parentElement: parent,
        dataset: {
            rmOwnerMesid: String(mesid),
            rmExternalOwnerMessage: String(mesid),
            rmOwnerChat: chat,
            rmOwnerSwipe: String(swipe),
            rmSource: 'independent',
            rmState: 'ready',
            rmKey: `${chat}:${mesid}:${swipe}:${sourceHash}`,
            rmSourceHash: sourceHash,
            rmPlacement: 'external',
            rmExternalPlacementEstablished: 'true',
        },
        querySelector(selector) {
            if (selector === ':scope > details') return details;
            return null;
        },
        hasAttribute() { return true; },
        remove() { this.isConnected = false; },
        __content: content,
    };
}

function createOwner(mesid, parent) {
    return {
        parentElement: parent,
        contains() { return false; },
        getAttribute(name) { return name === 'mesid' ? String(mesid) : null; },
    };
}

function explicitReplacementEvidence({ active = false, authorizationTs = 0, readyTs = 0 } = {}) {
    const ctx = { chat: [{ is_user: false, mes: 'new body', swipe_id: 0 }] };
    const cutover = {
        activeHostGeneration: active ? {
            chat: 'chat:test',
            type: 'regenerate',
            startTailRole: 'assistant',
            startTailIndex: 0,
        } : null,
        authorized: new Map(authorizationTs ? [[0, { token: 'current-token', ts: authorizationTs }]] : []),
    };
    const sandbox = {
        automaticGenerationCutovers: new Map([['chat:test', cutover]]),
        chatKey: () => 'chat:test',
        messageBaseSlotKey: () => 'chat:test:0:0',
        ownerLockForBase: () => readyTs ? { slot: 'old-key', sourceHash: 'old-hash', ts: readyTs } : null,
        persistedOwnerForMessage: () => null,
        automaticCutoverVersionToken: () => 'current-token',
        messageSourceFingerprint: () => 'new-hash',
        Number,
        String,
        Math,
    };
    vm.createContext(sandbox);
    vm.runInContext(`${functionBlock('hasExplicitSourceReplacementEvidence')}\n`+
        'globalThis.run=hasExplicitSourceReplacementEvidence;', sandbox);
    return sandbox.run(ctx, 0, ctx.chat[0], { dataset: { rmKey: 'old-key', rmSourceHash: 'old-hash' } });
}

function createSyncFixture({ messages, hosts, persistedOwner = null, lockedRecord = null, explicitSourceReplacement = false } = {}) {
    let nextTimerId = 1;
    const timers = new Map();
    const timerOrder = [];
    const timerDelays = [];
    const ownersPresent = new Set();
    const paidRequests = { count: 0 };
    const renderedReady = [];
    const store = {};
    const ownerLocks = [];

    const context = { chat: messages };
    const owners = new Map(hosts
        .filter(host => host.dataset.rmOwnerChat === 'chat:test')
        .map(host => [
            Number(host.dataset.rmOwnerMesid),
            createOwner(Number(host.dataset.rmOwnerMesid), host.parentElement),
        ]));

    const currentHash = index => String(messages[index]?.__sourceHash || `hash-${index}`);
    const currentSwipe = index => Number(messages[index]?.swipe_id || 0);
    const currentKey = index => `chat:test:${index}:${currentSwipe(index)}:${currentHash(index)}`;

    const sandbox = {
        orphanExternalHostTimers: new Map(),
        queuedIndices: new Set(),
        syncTimer: null,
        syncRunning: false,
        pending: new Map(),
        INLINE_ANCHOR_ATTR: 'data-rm-inline-anchor',
        FOLLOW_EXTERNAL_ANCHOR_ATTR: 'data-rm-follow-external-anchor',
        SOURCE_ATTR: 'data-rm-source',
        RUNTIME_VERSION: '1.5',
        DEFERRED_INTERACTION_RESCUE_ATTR: 'data-rm-deferred-interaction-rescue',

        setTimeout(callback, delay) {
            const id = nextTimerId++;
            timers.set(id, { callback, delay });
            timerOrder.push(id);
            timerDelays.push(delay);
            return id;
        },
        clearTimeout(id) { timers.delete(id); },

        messageElement(index) {
            return ownersPresent.has(Number(index)) ? owners.get(Number(index)) || null : null;
        },
        externalHostsOwnedByMesid(id) {
            return hosts.filter(host => host.isConnected
                && host.dataset.rmOwnerChat === 'chat:test'
                && host.dataset.rmOwnerMesid === String(id));
        },
        externalHosts(el) {
            const id = Number(el?.getAttribute?.('mesid'));
            return hosts.filter(host => host.isConnected
                && host.dataset.rmOwnerChat === 'chat:test'
                && Number(host.dataset.rmOwnerMesid) === id);
        },
        externalHostAppearsBeforeOwner: () => false,
        externalOwnerMesid: el => String(el?.getAttribute?.('mesid') ?? ''),

        currentRuntime: () => true,
        runtimeMode: () => 'independent',
        getContext: () => context,
        getSettings: () => ({ independentApiModel: 'test-model' }),
        readStore: () => store,
        chatKey: () => 'chat:test',
        swipeId: message => Number(message?.swipe_id || 0),
        isRabbitMirrorEligibleAssistantMessage: candidate => !!candidate
            && candidate.is_user !== true
            && typeof candidate.mes === 'string',
        assistantMessages: () => messages.map((m, i) => ({ m, i })),
        hostGenerationLooksActive: () => false,
        consumeIndependentDisplayModeChange: () => false,
        synchronizeIndependentChatPersistence: () => ({ storeChanged: false }),

        observeMessageSourceRevision: (_ctx, index) => ({
            slot: currentKey(index),
            sourceHash: currentHash(index),
            bodyHash: currentHash(index),
            displayHash: '',
            reasoningHash: '',
            revision: 1,
        }),
        recordKey: (_ctx, index) => currentKey(index),
        messageBaseSlotKey: (_ctx, index) => `chat:test:${index}:${currentSwipe(index)}`,
        messageSourceFingerprint: message => String(message?.__sourceHash || ''),

        persistedOwnerForMessage: () => persistedOwner,
        clearOwnerLockForBase() {},
        cancelSupersededFlightsForBase() {},
        cancelFlightsForSlot() {},
        independentStoredHtmlRestorable: () => true,
        chatPersistenceSlot: () => '',
        saveRecordForSlot(target, slot, record) { target[slot] = record; },
        setOwnerLockForBase(base, slot, hash) { ownerLocks.push({ base, slot, hash }); },
        lockedIndependentRecordForBase: () => lockedRecord ? { record: lockedRecord, lock: { slot: 'locked-slot' } } : null,
        recoverSavedRecord: () => ({ saved: null, storeChanged: false }),
        collapseDuplicateIdentityHosts(el) {
            return sandbox.externalHosts(el).find(host => host.dataset.rmSource === 'independent') || null;
        },
        usableReadyDetails: details => !!details,
        appendHistoryEntry() {},
        writePersistedOwner() {},
        writeStore() {},

        restoreFollowMirrorFromMessageSource() {},
        restoreFollowInline() {},
        clearExternalHostFreshSourceState(host) {
            delete host.dataset.rmAwaitingFreshSource;
            delete host.dataset.rmFreshSourceStatus;
        },
        ensureExternalUi(_el, key, html, state, _source, sourceHash) {
            renderedReady.push({ key, html, state, sourceHash });
            const index = Number(String(key).split(':')[2]);
            const host = hosts.find(item => Number(item.dataset.rmOwnerMesid) === index && item.isConnected);
            if (!host) return null;
            host.hidden = false;
            host.dataset.rmKey = key;
            host.dataset.rmSourceHash = String(sourceHash || '');
            host.dataset.rmState = state;
            delete host.dataset.rmAwaitingOwner;
            delete host.dataset.rmAwaitingFreshSource;
            delete host.dataset.rmFreshSourceStatus;
            return host;
        },
        rebuildCollapsedReadyHost() {},
        refreshExistingExternalDetails() {},
        hasExplicitSourceReplacementEvidence: () => explicitSourceReplacement,
        suppressesAutomaticGeneration: () => false,
        hasExistingFollowRabbitMirror: () => false,
        ensureReplyGenerationPlaceholder() { throw new Error('no generation placeholder expected'); },
        removeIndependentInlineDuplicates() {},
        settleIndependentHostsForInactiveSource() {},
        restoreIndependentMirrorPassively: () => false,
        externalizeFollowMirror() {},
        removeExternalDuplicatesPreferInline() {},
        removeEmptyInlineAnchors() {},
        removeEmptyFollowExternalAnchors() {},

        stampExternalHostOwnership() {},
        independentPlacementForState: () => 'external',
        restoreExternalHostRendering() {},
        restoreIndependentExternalAutoRootWidth() {},
        clearExternalShellIntegration() {},
        registerExternalHostInSyncIndex() {},
        historicalLightHost: () => true,
        ensureExternalHostGeometryCycle() { throw new Error('historical-light restore must not measure geometry'); },
        scheduleExternalHostGeometry() { throw new Error('historical-light restore must not schedule geometry'); },

        stripIndependentTransientLayoutArtifacts() {},
        withOwnerLockStoreBatch: callback => callback(),
        withRestorableHtmlCacheBatch: callback => callback(),
        fetch() { paidRequests.count += 1; throw new Error('paid request must not run'); },
        fetchRabbitMirrorIndependentCompletion() { paidRequests.count += 1; throw new Error('paid request must not run'); },
        Date,
        Number,
        String,
        Set,
        Map,
        Object,
        Array,
        console,
    };

    sandbox.clearOrphanExternalHostTimer = mesid => {
        const id = String(mesid || '');
        const timer = sandbox.orphanExternalHostTimers.get(id);
        if (timer) sandbox.clearTimeout(timer);
        sandbox.orphanExternalHostTimers.delete(id);
    };

    vm.createContext(sandbox);
    const blocks = [
        functionBlock('savedRecordMatchesObserved'),
        functionBlock('readyDetailsFromHost'),
        functionBlock('mountedIndependentReadyHostMatchesObserved'),
        functionBlock('mountedIndependentReadyHostSharesStableOwner'),
        functionBlock('readyRecordFromHost'),
        functionBlock('placeExternalHost'),
        functionBlock('markExternalHostsAwaitingOwner'),
        functionBlock('syncMessages'),
        functionBlock('reconcileVisibleMirrorDuplicates'),
        functionBlock('queueMessageSync'),
        'globalThis.markAwaiting = markExternalHostsAwaitingOwner;',
        'globalThis.queueSync = queueMessageSync;',
    ];
    vm.runInContext(blocks.join('\n'), sandbox);

    function runTimerByDelay(delay) {
        const id = timerOrder.find(candidate => timers.get(candidate)?.delay === delay);
        assert.ok(id, `expected a ${delay}ms production timer`);
        const entry = timers.get(id);
        timers.delete(id);
        entry.callback();
    }

    return {
        hosts,
        messages,
        timerDelays,
        paidRequests,
        renderedReady,
        store,
        ownerLocks,
        ownerLeaves(index) { ownersPresent.delete(Number(index)); },
        ownerReturns(index) { ownersPresent.add(Number(index)); },
        markAwaiting(index) { sandbox.markAwaiting(String(index)); },
        queueSync(index) { sandbox.queueSync([Number(index)]); },
        runOrphanTimer() { runTimerByDelay(1800); },
        runSyncTimer() { runTimerByDelay(120); },
        pendingTimers: () => [...timers.values()].map(entry => entry.delay),
    };
}

function createGenerationFixture({ currentSwipe, currentHash, hostSwipe, hostHash, persistedOwner = null, lockedRecord = null }) {
    const oldHtml = '<details><summary>OLD MIRROR</summary><div>OLD CONTENT</div></details>';
    const newHtml = '<details><summary>NEW MIRROR</summary><div>NEW CONTENT</div></details>';
    const message = { is_user: false, mes: 'current body', swipe_id: currentSwipe, __sourceHash: currentHash };
    const context = { chat: [message] };
    const host = createHost({ mesid: 0, swipe: hostSwipe, sourceHash: hostHash, content: oldHtml });
    const owner = createOwner(0, host.parentElement);
    const store = {};
    const paidRequests = { count: 0 };
    const uiCalls = [];
    const persistedWrites = [];
    const flights = new Map();
    const pending = new Map();
    let generationSequence = 0;

    const currentKey = `chat:test:0:${currentSwipe}:${currentHash}`;
    const observed = {
        slot: currentKey,
        sourceHash: currentHash,
        bodyHash: currentHash,
        displayHash: '',
        reasoningHash: '',
        revision: 1,
    };

    const sandbox = {
        RUNTIME_VERSION: '1.5',
        DEFERRED_INTERACTION_RESCUE_ATTR: 'data-rm-deferred-interaction-rescue',
        INDEPENDENT_RECORD_BUDGET_BYTES: 2_000_000,
        pending,
        generationSequence,
        AbortController,
        Date,
        Number,
        String,
        Map,
        Set,
        Object,
        Array,
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
        isRabbitMirrorEligibleAssistantMessage: candidate => !!candidate && candidate.is_user !== true && typeof candidate.mes === 'string',
        observeMessageSourceRevision: () => observed,
        recordKey: () => currentKey,
        messageBaseSlotKey: () => `chat:test:0:${currentSwipe}`,
        chatKey: () => 'chat:test',
        swipeId: candidate => Number(candidate?.swipe_id || 0),
        messageElement: () => owner,
        suppressesAutomaticGeneration: () => false,
        hasExistingFollowRabbitMirror: () => false,
        hasAutomaticFailureStop: () => false,
        clearAutomaticFailureStop() {},
        markAutomaticFailureStop() {},

        readStore: () => store,
        writeStore() {},
        persistedOwnerForMessage: () => persistedOwner,
        independentStoredHtmlRestorable: () => true,
        chatPersistenceSlot: () => '',
        saveRecordForSlot(target, slot, record) { target[slot] = record; },
        setOwnerLockForBase() {},
        lockedIndependentRecordForBase: () => lockedRecord ? { record: lockedRecord, lock: { slot: 'locked-slot' } } : null,
        recoverSavedRecord: () => ({ saved: null, storeChanged: false }),
        collapseDuplicateIdentityHosts: () => host,
        usableReadyDetails: details => !!details,
        stripIndependentTransientLayoutArtifacts() {},
        appendHistoryEntry() {},
        writePersistedOwner(_ctx, _index, _message, record) { persistedWrites.push(record); },
        rebuildCollapsedReadyHost() {},

        cancelSupersededFlightsForBase() {},
        cancelFlightsForSlot() {},
        flightIdentity: (slot, hash) => `${slot}\u0000${hash}`,
        globalFlights: () => flights,
        queueMessageSync() {},
        createManualDispatchLease: () => ({ release() {}, consume() { return true; } }),
        reserveAutomaticDispatchLease: () => ({ release() {}, consume() { return true; } }),
        automaticDispatchAlreadyConsumed: () => false,
        renderAutomaticDispatchConsumed() {},
        currentGenerationIdentity: () => ({
            slot: currentKey,
            key: currentKey,
            sourceHash: currentHash,
            revision: 1,
        }),
        createIndependentRequestDeadline: () => ({ progress() {}, clear() {} }),
        settleCancelledIndependentFlightUi() {},

        callIndependentApi: async () => {
            paidRequests.count += 1;
            return { html: newHtml, requestDiagnostic: { transport: 'test' } };
        },
        ensureExternalUi(_el, key, html, state, _source, sourceHash) {
            uiCalls.push({ key, html, state, sourceHash });
            host.dataset.rmKey = key;
            host.dataset.rmSourceHash = String(sourceHash || '');
            host.dataset.rmOwnerSwipe = String(currentSwipe);
            host.dataset.rmState = state;
            if (state === 'ready') host.__content = html;
            return host;
        },
        commitIndependentVisualResult: () => '',
        getActiveFeedbackForCurrentChat: () => null,
        markFeedbackCatInjected() {},
        consumeInjectedFeedbackForSuccessfulIndependentRabbitMirror() {},
        wrappedIndependentMirrorHtml: html => html,
        scrubIndependentInteractionState: html => html,
        independentRecordWithinBudget: () => true,
        byteLength: value => String(value || '').length,
        recordRabbitMirrorRecipe() {},
    };

    vm.createContext(sandbox);
    vm.runInContext([
        functionBlock('savedRecordMatchesObserved'),
        functionBlock('readyDetailsFromHost'),
        functionBlock('mountedIndependentReadyHostMatchesObserved'),
        functionBlock('readyRecordFromHost'),
        functionBlock('generateFor'),
        'globalThis.runGenerate = generateFor;',
    ].join('\n'), sandbox);

    return {
        oldHtml,
        newHtml,
        host,
        paidRequests,
        uiCalls,
        persistedWrites,
        run: () => sandbox.runGenerate(0, message, false, true),
    };
}


function runCancelledFlightSettlement({ sameOwner }) {
    const uiCalls = [];
    const loadingHost = {
        isConnected: true,
        dataset: { rmState: 'loading' },
        remove() { this.isConnected = false; },
    };
    const liveElement = {};
    const flight = {
        index: 0,
        key: 'chat:test:0:0:old-hash',
        sourceHash: 'old-hash',
        manual: true,
        previousReadyRecord: { html: '<details>OLD READY</details>' },
        loadingHost,
        uiSettled: false,
    };
    const sandbox = {
        messageElement: () => liveElement,
        currentGenerationIdentity: () => sameOwner
            ? { key: flight.key, sourceHash: flight.sourceHash }
            : { key: 'chat:test:0:1:new-hash', sourceHash: 'new-hash' },
        ensureExternalUi(...args) { uiCalls.push(args); return loadingHost; },
        Number,
        String,
    };
    vm.createContext(sandbox);
    vm.runInContext(`${functionBlock('settleCancelledIndependentFlightUi')}\nglobalThis.run = settleCancelledIndependentFlightUi;`, sandbox);
    return { result: sandbox.run(flight, 'source-version-replaced'), flight, loadingHost, uiCalls };
}

function runPassiveRestore({ hostSwipe, currentSwipe, sourceHash = 'same-hash' }) {
    const content = '<details><summary>READY</summary><div>CONTENT</div></details>';
    const host = createHost({ mesid: 0, swipe: hostSwipe, sourceHash, content });
    const msg = { is_user: false, mes: 'body', swipe_id: currentSwipe };
    const ctx = { chat: [msg] };
    const observed = {
        slot: `chat:test:0:${currentSwipe}:${sourceHash}`,
        sourceHash,
        bodyHash: sourceHash,
        displayHash: '',
        reasoningHash: '',
        legacySlots: [],
    };
    const key = observed.slot;
    const placeCalls = [];
    const sandbox = {
        passiveObservedIdentity: () => observed,
        recordKey: () => key,
        collapseDuplicateIdentityHosts: () => host,
        usableReadyDetails: details => !!details,
        persistedOwnerForMessage: () => null,
        independentStoredHtmlRestorable: () => true,
        savedRecordMatchesObserved: null,
        recoverSavedRecord: () => ({ saved: null, storeChanged: false }),
        chatPersistenceSlot: () => '',
        saveRecordForSlot() {},
        setOwnerLockForBase() {},
        messageBaseSlotKey: () => `chat:test:0:${currentSwipe}`,
        ensureExternalUi() { throw new Error('no saved record should be restored'); },
        rebuildCollapsedReadyHost() {},
        placeExternalHost(_el, mounted, mountedKey, source) { placeCalls.push({ mounted, mountedKey, source }); },
        clearExternalHostFreshSourceState() {},
        refreshExistingExternalDetails() {},
        chatKey: () => 'chat:test',
        swipeId: candidate => Number(candidate?.swipe_id || 0),
        Number,
        String,
    };
    vm.createContext(sandbox);
    vm.runInContext([
        functionBlock('savedRecordMatchesObserved'),
        functionBlock('readyDetailsFromHost'),
        functionBlock('mountedIndependentReadyHostMatchesObserved'),
        functionBlock('restoreIndependentMirrorPassively'),
        'globalThis.run = restoreIndependentMirrorPassively;',
    ].join('\n'), sandbox);
    sandbox.run(ctx, {}, {}, 0, msg);
    return { host, placeCalls };
}

function runAutomaticTimeoutSettlement({ hostSwipe, currentSwipe, sourceHash = 'same-hash' }) {
    const content = '<details><summary>READY</summary><div>CONTENT</div></details>';
    const host = createHost({ mesid: 0, swipe: hostSwipe, sourceHash, content });
    const msg = { is_user: false, mes: 'body', swipe_id: currentSwipe };
    const ctx = { chat: [msg] };
    const key = `chat:test:0:${currentSwipe}:${sourceHash}`;
    const live = {
        ctx,
        msg,
        slot: key,
        key,
        sourceHash,
        bodyHash: sourceHash,
        displayHash: '',
        reasoningHash: '',
        revision: 1,
    };
    const owner = {
        chat: 'chat:test',
        phase: 1,
        tentativeRender: { index: 0, token: `${currentSwipe}:${sourceHash}` },
    };
    const cutover = { activeHostGeneration: owner, authorized: new Set([0]) };
    const uiCalls = [];
    const warnings = [];
    const sandbox = {
        automaticGenerationCutovers: new Map([['chat:test', cutover]]),
        hostGenerationInProgress: true,
        hostGenerationHintStartedAt: 1,
        activeGlobalWorldInfoCapture: null,
        INDEPENDENT_GENERATION_INTENTS_KEY: '__testIntents',
        INDEPENDENT_GENERATION_STOPS_KEY: '__testStops',
        runtimeMode: () => 'independent',
        chatKey: () => 'chat:test',
        clearAutomaticHostGenerationSettlement() {},
        clearGenerationPlaceholderPoll() {},
        automaticHostGenerationRenderMatches: () => true,
        automaticCutoverVersionToken: () => `${currentSwipe}:${sourceHash}`,
        currentGenerationIdentity: () => live,
        messageElement: () => ({}),
        hasExistingFollowRabbitMirror: () => false,
        hasGenerationWorkFor: () => false,
        markAutomaticFailureStop() {},
        collapseDuplicateIdentityHosts: () => host,
        usableReadyDetails: details => !!details,
        clearIndependentResayStatus() {},
        ensureExternalUi(_el, uiKey, html, state, source, uiSourceHash) {
            uiCalls.push({ uiKey, html, state, source, uiSourceHash });
            return { querySelector: () => ({}) };
        },
        setPlaceholderSummary() {},
        chatKey: () => 'chat:test',
        swipeId: candidate => Number(candidate?.swipe_id || 0),
        recordKey: () => key,
        toastr: { warning(message) { warnings.push(message); } },
        Date,
        Number,
        String,
        Set,
        Map,
        Array,
    };
    vm.createContext(sandbox);
    vm.runInContext([
        functionBlock('readyDetailsFromHost'),
        functionBlock('mountedIndependentReadyHostMatchesObserved'),
        functionBlock('stopAutomaticHostGenerationSettlement'),
        'globalThis.run = stopAutomaticHostGenerationSettlement;',
    ].join('\n'), sandbox);
    const result = sandbox.run(ctx, owner, 'host-completion-timeout');
    return { result, host, uiCalls, warnings, cutover };
}

test('same identity: missed added/render event recovers through the production queue without a paid request', () => {
    const content = '<details><summary>RabbitMirror</summary><div>COMPLETE CONTENT</div></details>';
    const host = createHost({ mesid: 0, sourceHash: 'hash-0', content });
    const fixture = createSyncFixture({
        messages: [{ is_user: false, mes: 'final body', swipe_id: 0, __sourceHash: 'hash-0' }],
        hosts: [host],
    });

    fixture.ownerLeaves(0);
    fixture.markAwaiting(0);
    assert.equal(host.hidden, true);
    assert.equal(host.dataset.rmAwaitingOwner, 'true');

    fixture.ownerReturns(0);
    fixture.runOrphanTimer();
    fixture.runSyncTimer();

    assert.equal(host.isConnected, true);
    assert.equal(host.hidden, false);
    assert.equal(host.dataset.rmAwaitingOwner, undefined);
    assert.equal(host.__content, content, 'completed mirror content must remain intact');
    assert.equal(fixture.paidRequests.count, 0, 'owner recovery must not start a paid request');
    assert.deepEqual(fixture.pendingTimers(), []);
});

test('explicit source replacement evidence distinguishes a new host operation from later passive rewrites', () => {
    assert.equal(explicitReplacementEvidence({ active: true }), true,
        'an active regenerate of this assistant owner must stale the old mirror immediately');
    assert.equal(explicitReplacementEvidence({ authorizationTs: 200, readyTs: 100 }), true,
        'a final authorization newer than the ready owner proves an explicit replacement');
    assert.equal(explicitReplacementEvidence({ authorizationTs: 100, readyTs: 200 }), false,
        'an older authorization must not turn a later post-processing rewrite into a new generation');
});

test('changed Swipe with the same mesid/body: the old host is not rebound to the new Swipe', () => {
    const oldHtml = '<details><summary>OLD SWIPE</summary><div>OLD CONTENT</div></details>';
    const host = createHost({ mesid: 0, sourceHash: 'same-hash', swipe: 0, content: oldHtml });
    const fixture = createSyncFixture({
        messages: [{ is_user: false, mes: 'same text in another swipe', swipe_id: 1, __sourceHash: 'same-hash' }],
        hosts: [host],
    });

    // Simulate the host already hidden by the owner-removal path, then exercise the
    // production single-message sync directly. This isolates the stale-identity
    // regression from the separate missing-orphan-queue defect.
    host.hidden = true;
    host.dataset.rmAwaitingOwner = 'true';
    fixture.ownerReturns(0);
    fixture.queueSync(0);
    fixture.runSyncTimer();

    const staleReplay = fixture.renderedReady.find(call => call.html === oldHtml && call.sourceHash === 'same-hash');
    assert.equal(staleReplay, undefined, 'an old Swipe must not be promoted under the new Swipe key');
    assert.equal(host.dataset.rmAwaitingFreshSource, 'true', 'the stale host must remain under stale-source protection');
    assert.equal(fixture.paidRequests.count, 0);
});

test('passive same-Swipe source rewrite keeps the completed mirror visible without rebinding it', () => {
    const oldHtml = '<details><summary>READY MIRROR</summary><div>READY CONTENT</div></details>';
    const host = createHost({ mesid: 0, sourceHash: 'old-hash', swipe: 0, content: oldHtml });
    const fixture = createSyncFixture({
        messages: [{ is_user: false, mes: 'post-processed body', swipe_id: 0, __sourceHash: 'new-hash' }],
        hosts: [host],
        explicitSourceReplacement: false,
    });

    fixture.ownerLeaves(0);
    fixture.markAwaiting(0);
    fixture.ownerReturns(0);
    fixture.runOrphanTimer();
    fixture.runSyncTimer();

    assert.equal(host.isConnected, true);
    assert.equal(host.hidden, false, 'a passive post-render rewrite must not hide an already completed mirror');
    assert.equal(host.dataset.rmState, 'ready');
    assert.equal(host.dataset.rmAwaitingOwner, undefined);
    assert.equal(host.dataset.rmAwaitingFreshSource, undefined);
    assert.equal(host.dataset.rmFreshSourceStatus, undefined);
    assert.equal(host.__content, oldHtml);
    assert.equal(fixture.ownerLocks.length, 0, 'passive preservation must not bind old HTML to the new source hash');
    assert.equal(fixture.renderedReady.some(call => call.sourceHash === 'new-hash'), false,
        'passive preservation must not persist or repaint the old mirror as the new source');
    assert.equal(fixture.paidRequests.count, 0);
});

test('changed sourceHash with the same mesid/Swipe: old ready HTML never becomes the new owner or flashes', () => {
    const oldHtml = '<details><summary>OLD MIRROR</summary><div>OLD CONTENT</div></details>';
    const staleRecord = { html: oldHtml, sourceHash: 'old-hash', bodyHash: 'old-hash' };
    const host = createHost({ mesid: 0, sourceHash: 'old-hash', swipe: 0, content: oldHtml });
    const fixture = createSyncFixture({
        messages: [{ is_user: false, mes: 'new body', swipe_id: 0, __sourceHash: 'new-hash' }],
        hosts: [host],
        persistedOwner: staleRecord,
        lockedRecord: staleRecord,
        explicitSourceReplacement: true,
    });

    host.hidden = true;
    host.dataset.rmAwaitingOwner = 'true';
    fixture.ownerReturns(0);
    fixture.queueSync(0);
    fixture.runSyncTimer();

    const staleReplay = fixture.renderedReady.find(call => call.html === oldHtml && call.sourceHash === 'new-hash');
    assert.equal(staleReplay, undefined,
        'persisted, locked, and mounted old HTML must all fail exact source identity validation');
    assert.equal(host.dataset.rmAwaitingFreshSource, 'true',
        'old details stay protected by the stale-source shell until a matching result exists');
    assert.equal(fixture.ownerLocks.length, 0, 'a stale mounted/persisted record must not acquire the new owner lock');
    assert.equal(fixture.paidRequests.count, 0);
});

test('owner absent after 1.8s removes only the matching orphan host', () => {
    const target = createHost({ mesid: 0, sourceHash: 'hash-0', content: '<details>TARGET</details>' });
    const otherMessage = createHost({ mesid: 1, sourceHash: 'hash-1', content: '<details>OTHER MESSAGE</details>' });
    const foreignChat = createHost({ mesid: 0, sourceHash: 'hash-x', content: '<details>OTHER CHAT</details>', chat: 'chat:foreign' });
    const fixture = createSyncFixture({
        messages: [
            { is_user: false, mes: 'body 0', swipe_id: 0, __sourceHash: 'hash-0' },
            { is_user: false, mes: 'body 1', swipe_id: 0, __sourceHash: 'hash-1' },
        ],
        hosts: [target, otherMessage, foreignChat],
    });

    fixture.ownerLeaves(0);
    fixture.markAwaiting(0);
    fixture.runOrphanTimer();

    assert.equal(target.isConnected, false, 'matching orphan must be removed');
    assert.equal(otherMessage.isConnected, true, 'another mesid must not be removed');
    assert.equal(foreignChat.isConnected, true, 'same mesid in another chat must not be removed');
    assert.equal(fixture.paidRequests.count, 0);
    assert.deepEqual(fixture.pendingTimers(), []);
});

test('three distinct mesids keep independent hosts; later rounds never reuse an earlier hidden host', () => {
    const hosts = [0, 1, 2].map(index => createHost({
        mesid: index,
        sourceHash: `hash-${index}`,
        content: `<details><summary>ROUND ${index + 1}</summary></details>`,
    }));
    const fixture = createSyncFixture({
        messages: [0, 1, 2].map(index => ({
            is_user: false,
            mes: `body ${index}`,
            swipe_id: 0,
            __sourceHash: `hash-${index}`,
        })),
        hosts,
    });

    for (let index = 0; index < 3; index += 1) {
        fixture.ownerLeaves(index);
        fixture.markAwaiting(index);
        fixture.ownerReturns(index);
        fixture.runOrphanTimer();
        fixture.runSyncTimer();

        assert.equal(hosts[index].hidden, false, `round ${index + 1} host must be visible`);
        assert.equal(hosts[index].dataset.rmAwaitingOwner, undefined, `round ${index + 1} marker must clear`);
        assert.equal(Number(hosts[index].dataset.rmOwnerMesid), index, `round ${index + 1} must keep its own mesid`);
        for (let previous = 0; previous < index; previous += 1) {
            assert.notEqual(hosts[index], hosts[previous], 'new mesid must own a distinct host object');
            assert.equal(hosts[previous].hidden, false, 'an earlier visible host must not be re-hidden or reused');
        }
    }

    assert.equal(hosts.filter(host => host.hidden && host.dataset.rmAwaitingOwner === 'true').length, 0);
    assert.equal(fixture.paidRequests.count, 0, 'recovery adds no paid requests; generation request budgets remain unchanged');
    assert.deepEqual(fixture.pendingTimers(), []);
});

test('1.1.18-style in-place owner path remains visible and exact-identity sync stays passive', () => {
    const content = '<details><summary>EXACT OWNER</summary><div>READY</div></details>';
    const host = createHost({ mesid: 0, sourceHash: 'hash-0', swipe: 0, content });
    const fixture = createSyncFixture({
        messages: [{ is_user: false, mes: 'same body', swipe_id: 0, __sourceHash: 'hash-0' }],
        hosts: [host],
    });

    fixture.ownerReturns(0);
    fixture.markAwaiting(0);
    assert.equal(host.hidden, false, 'an owner that was never removed must not be hidden');
    assert.deepEqual(fixture.pendingTimers(), [], 'the in-place path must not create the 1.8s orphan timer');

    fixture.queueSync(0);
    fixture.runSyncTimer();
    assert.equal(host.hidden, false);
    assert.equal(host.dataset.rmAwaitingFreshSource, undefined);
    assert.equal(fixture.paidRequests.count, 0);
});

test('generation path keeps an exact mounted result passive, but rejects stale mounted/persisted/locked results', async () => {
    const exact = createGenerationFixture({
        currentSwipe: 0,
        currentHash: 'exact-hash',
        hostSwipe: 0,
        hostHash: 'exact-hash',
    });
    const exactResult = await exact.run();
    assert.equal(exact.paidRequests.count, 0, 'exact mounted owner remains passive on the in-place path');
    assert.equal(exactResult?.html, exact.oldHtml);

    const oldHtml = '<details><summary>OLD MIRROR</summary><div>OLD CONTENT</div></details>';
    const staleRecord = { html: oldHtml, sourceHash: 'old-hash', bodyHash: 'old-hash' };
    const stale = createGenerationFixture({
        currentSwipe: 1,
        currentHash: 'new-hash',
        hostSwipe: 0,
        hostHash: 'old-hash',
        persistedOwner: staleRecord,
        lockedRecord: staleRecord,
    });
    await stale.run();

    assert.equal(stale.paidRequests.count, 1, 'the new identity gets at most one fresh paid request');
    assert.equal(stale.host.__content, stale.newHtml, 'the new result, not old persisted HTML, owns the new identity');
    assert.equal(
        stale.uiCalls.some(call => call.state === 'ready' && call.html === stale.oldHtml && call.sourceHash === 'new-hash'),
        false,
        'old HTML must never be rendered ready under the new key/sourceHash',
    );
    assert.equal(
        stale.uiCalls.filter(call => call.state === 'ready' && call.html === stale.newHtml).length,
        1,
        'the fresh response is committed once',
    );
});

test('cancelled manual resay restores the previous mirror only for the exact still-current owner', () => {
    const exact = runCancelledFlightSettlement({ sameOwner: true });
    assert.equal(exact.result, true);
    assert.equal(exact.uiCalls.length, 1, 'same identity may roll back to the known-good mirror');
    assert.equal(exact.uiCalls[0][2], '<details>OLD READY</details>');
    assert.equal(exact.loadingHost.isConnected, true);
    assert.equal(exact.flight.uiSettled, true);

    const stale = runCancelledFlightSettlement({ sameOwner: false });
    assert.equal(stale.result, true);
    assert.equal(stale.uiCalls.length, 0, 'a cancelled old flight must not paint its old mirror beside a new Swipe/body');
    assert.equal(stale.loadingHost.isConnected, false, 'the stale loading shell is removed instead of rebound');
    assert.equal(stale.flight.uiSettled, true);
});

test('passive follow-mode restore keeps an exact 1.1.18-style host, but hides an old Swipe even when body hash is unchanged', () => {
    const exact = runPassiveRestore({ hostSwipe: 0, currentSwipe: 0 });
    assert.equal(exact.host.hidden, false);
    assert.equal(exact.placeCalls.length, 1, 'exact mounted owner remains passively visible');

    const stale = runPassiveRestore({ hostSwipe: 0, currentSwipe: 1 });
    assert.equal(stale.host.hidden, true, 'old Swipe must not be exposed beside the current message');
    assert.equal(stale.placeCalls.length, 0, 'stale host must not be re-stamped as the new owner');
});

test('automatic final-proof timeout reuses only an exact ready host and replaces an old Swipe with the bounded error shell', () => {
    const exact = runAutomaticTimeoutSettlement({ hostSwipe: 0, currentSwipe: 0 });
    assert.equal(exact.result, true);
    assert.equal(exact.uiCalls.length, 0, 'exact ready mirror stays in place');
    assert.equal(exact.warnings.length, 1);

    const stale = runAutomaticTimeoutSettlement({ hostSwipe: 0, currentSwipe: 1 });
    assert.equal(stale.result, true);
    assert.equal(stale.uiCalls.length, 1, 'old Swipe is not accepted as the current completed mirror');
    assert.equal(stale.uiCalls[0].state, 'error');
    assert.equal(stale.uiCalls[0].uiKey, 'chat:test:0:1:same-hash');
    assert.equal(stale.uiCalls[0].uiSourceHash, 'same-hash');
    assert.equal(stale.warnings.length, 0, 'the stale mirror is not announced as a valid current result');
});
