import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseMultifaceOutput } from '../src/multifaceProtocol.js';

const source = readFileSync(new URL('../src/independentApi.js', import.meta.url), 'utf8');

function functionSource(name) {
    const start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `missing production function ${name}`);
    const candidates = [source.indexOf('\nfunction ', start + 1), source.indexOf('\nasync function ', start + 1)]
        .filter(index => index > start);
    const end = candidates.length ? Math.min(...candidates) : source.length;
    return source.slice(start, end).trim();
}

const face = (ordinal, label = `OLD-${ordinal}`) =>
    `<toto data-rabbit-mirror="true" data-rm-face="${ordinal}"><details${ordinal === 3 ? ' open' : ''}><summary>FACE-${ordinal}</summary><section><input type="checkbox"${ordinal === 4 ? ' checked' : ''}><p>${label}</p></section></details></toto>`;
const batch = labels => labels.map((label, index) => face(index + 1, label)).join('\n');
const originalBatch = batch(['OLD-1', 'OLD-2', 'OLD-3', 'OLD-4', 'OLD-5']);

// A. Execute the production callIndependentApi five-face branch. The request
// function below represents the single paid transport seam and deliberately
// consumes the real dispatch lease passed by production code.
function independentCallHarness(raw) {
    let requestCalls = 0;
    let paidDispatches = 0;
    let attemptMarks = 0;
    let semanticFailures = 0;
    const plan = {
        kind: 'rabbit-mirror-multiface-plan',
        batchId: 'batch-five',
        requestedFaceCount: 5,
        identity: { kind: 'generation-operation', preview: false },
        faces: Array.from({ length: 5 }, (_, faceIndex) => ({ faceIndex })),
    };
    const metadata = {
        faceCount: 5,
        faces: Array.from({ length: 5 }, (_, faceIndex) => ({ faceIndex, formatIds: [`F.${faceIndex}`] })),
        samplingMode: 'classic',
    };
    const sandbox = {
        Date,
        Math,
        Number,
        String,
        Array,
        Object,
        INDEPENDENT_BEHAVIOR_PATCH: '',
        MAX_INDEPENDENT_REQUEST_CHARS: 200_000,
        getSettings: () => ({
            independentApiBaseUrl: 'https://provider.invalid/v1',
            independentApiModel: 'fixture-model',
            independentApiMaxTokens: 12_000,
            independentReadGlobalWorldInfo: false,
            rabbitMirrorFaceCount: 5,
        }),
        swipeId: () => 0,
        createIndependentVisibleTextReader: () => () => ({ text: 'visible assistant body' }),
        isRabbitMirrorEligibleAssistantMessage: message => message?.is_user !== true,
        buildRabbitMirrorPromptDetails: () => ({ prompt: 'FIVE FACE PROMPT', executionLock: 'LOCK', metadata, batchPlan: plan }),
        messageSourceFingerprint: () => 'source-five',
        chatKey: () => 'chat:test',
        hashText: value => `hash:${String(value || '')}`,
        messageBaseSlotKey: (_ctx, index, msg) => `chat:test:${index}:${Number(msg?.swipe_id || 0)}`,
        operationEpochForBase: () => 1,
        recentIndependentVisualGuard: () => '',
        manualRetryVisualGuard: () => '',
        globalWorldInfoSnapshotFor: () => null,
        globalWorldInfoContextView: () => ({ block: '', includedEntries: 0, totalEntries: 0, chars: 0, truncated: false }),
        contextBundle: () => ({ text: 'bounded context', targetVisibleChars: 15, layers: 1, maxLayers: 1, filteredRabbitMirrorChars: 0, filteredExcludedTagChars: 0 }),
        recordRabbitMirrorIndependentPrompt() {},
        markPendingBatchAttempt() { attemptMarks += 1; return true; },
        releasePendingComboBatch() {},
        async requestIndependentCompletion(_settings, _system, _user, options) {
            requestCalls += 1;
            assert.equal(options.dispatchLease.consume(), true, 'the paid seam must consume the one batch lease');
            return {
                response: { ok: true, status: 200 },
                result: { text: raw, payload: {}, raw },
                profile: 'fixture-profile',
                attempts: [{ profile: 'fixture-profile' }],
                requestDiagnostic: { requestCount: 1, automaticRetry: false },
                semanticError: '',
            };
        },
        assertIndependentMarkupComplexityWithDiagnostic() {},
        prepareIndependentMultifaceResult(value, valueMetadata) {
            const parsed = parseMultifaceOutput(value, { expectedCount: Number(valueMetadata.faceCount) });
            if (!parsed.ok) throw new Error(`incomplete ${parsed.count}/${valueMetadata.faceCount}`);
            return { html: value, faceScans: parsed.faces.map(item => ({ faceIndex: item.index })) };
        },
        republishIndependentSemanticFailure() { semanticFailures += 1; },
        independentMultifaceFailureSemantic(error) { const code = String(error?.code || ''); return code.startsWith('multiface-') ? code : 'multiface-quality'; },
        clearIndependentQualityFailure() {},
        rememberApiProfile() {},
        compactRemoteError: () => '',
        profileUsesStreaming: () => false,
        globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(`${functionSource('callIndependentApi').replace('function callIndependentApi', 'async function run')}\nglobalThis.run=run;`, sandbox);
    const dispatchLease = { consume() { paidDispatches += 1; return true; } };
    return {
        run: () => sandbox.globalThis.run({ chat: [{ is_user: false, mes: 'visible assistant body' }] }, 0, { is_user: false, mes: 'visible assistant body' }, null, { dispatchLease }),
        counts: () => ({ requestCalls, paidDispatches, attemptMarks, semanticFailures }),
    };
}

{
    const harness = independentCallHarness(originalBatch);
    const result = await harness.run();
    assert.equal(parseMultifaceOutput(result.html, { expectedCount: 5 }).ok, true);
    assert.deepEqual(harness.counts(), { requestCalls: 1, paidDispatches: 1, attemptMarks: 1, semanticFailures: 0 });
}

{
    const incomplete = originalBatch.slice(0, originalBatch.lastIndexOf('</details>'));
    const harness = independentCallHarness(incomplete);
    await assert.rejects(harness.run(), /incomplete 4\/5/);
    const counts = harness.counts();
    assert.equal(counts.requestCalls, 1, 'an incomplete five-face response must not invoke a second request');
    assert.equal(counts.paidDispatches, 1, 'an incomplete five-face response must consume only one paid dispatch');
    assert.equal(counts.attemptMarks, 1, 'one paid batch is registered once');
    assert.ok(counts.semanticFailures >= 1);
}

// B. Execute the exact accepted-result post-review block. A cache readback miss
// or mounted-DOM mismatch is advisory after protocol/sanitize acceptance; neither
// condition may reject the promise and fall into the generation error UI.
const generateStart = source.indexOf('async function generateFor(');
const reviewStart = source.indexOf('if(result?.batchPlan){', generateStart);
const reviewReturn = source.indexOf('return completed;', reviewStart);
assert.ok(generateStart >= 0 && reviewStart > generateStart && reviewReturn > reviewStart);
const acceptedReviewSource = source.slice(reviewStart, reviewReturn + 'return completed;'.length);

async function acceptedReviewScenario({ persistenceComplete, mountComplete, commitSucceeds = true }) {
    const warnings = [];
    const toasts = [];
    let errorUi = 0;
    let failureStops = 0;
    let commits = 0;
    const completed = { html: originalBatch };
    const mountedFaces = Array.from({ length: mountComplete ? 5 : 4 }, () => ({ usable: true }));
    const liveEl = mountComplete ? null : {};
    const liveHost = { dataset: { rmSourceHash: mountComplete ? 'source-five' : 'wrong-source' }, children: mountedFaces };
    const sandbox = {
        result: { batchPlan: { batchId: 'accepted-five', requestedFaceCount: 5, identity: { kind: 'generation-operation' } }, faceScans: [] },
        settledSlot: 'slot-five',
        settledIdentity: { legacySlots: [] },
        settledSourceHash: 'source-five',
        completed,
        liveEl,
        liveHost,
        flight: { uiSettled: false },
        readStore: () => ({}),
        findSavedRecord: () => ({ html: persistenceComplete ? originalBatch : '' }),
        externalFaceDetails: () => mountedFaces,
        serializeExternalFaceDetails: () => originalBatch,
        parseMultifaceOutput,
        independentStoredHtmlRestorable: html => parseMultifaceOutput(String(html || ''), { expectedCount: 5 }).ok,
        usableReadyDetails: faceNode => faceNode?.usable === true,
        commitPendingComboBatch() { commits += 1; return commitSucceeds; },
        console: { warn(...args) { warnings.push(args); } },
        globalThis: { toastr: { warning(message) { toasts.push(message); } } },
    };
    vm.createContext(sandbox);
    vm.runInContext(`function settleAccepted(){${acceptedReviewSource}}\nglobalThis.run=settleAccepted;`, sandbox);
    let returned;
    await Promise.resolve().then(() => sandbox.globalThis.run()).then(value => { returned = value; }).catch(() => {
        failureStops += 1;
        errorUi += 1;
    });
    return { returned, uiSettled: sandbox.flight.uiSettled, warnings, toasts, errorUi, failureStops, commits };
}

{
    const cacheMiss = await acceptedReviewScenario({ persistenceComplete: false, mountComplete: true });
    assert.equal(cacheMiss.returned.html, originalBatch);
    assert.equal(cacheMiss.uiSettled, true);
    assert.equal(cacheMiss.errorUi, 0);
    assert.equal(cacheMiss.failureStops, 0);
    assert.equal(cacheMiss.commits, 0, 'cooldown history cannot commit until persistence readback succeeds');
    assert.equal(cacheMiss.warnings.length, 1);
}

{
    const mountMiss = await acceptedReviewScenario({ persistenceComplete: true, mountComplete: false, commitSucceeds: false });
    assert.equal(mountMiss.returned.html, originalBatch);
    assert.equal(mountMiss.uiSettled, true);
    assert.equal(mountMiss.errorUi, 0);
    assert.equal(mountMiss.failureStops, 0);
    assert.equal(mountMiss.commits, 1);
    assert.equal(mountMiss.warnings.length, 1);
    assert.equal(mountMiss.toasts.length, 2, 'mount reconciliation and cooldown persistence remain warnings, not failure UI');
}

// C. Execute the production one-face DOM replacement helper. It must replace
// exactly the selected direct child and retain every neighboring node/state.
class FakeDetails {
    constructor(outerHTML, state = {}) {
        this.tagName = 'DETAILS';
        this.outerHTML = outerHTML;
        this.state = state;
        this.open = /<details\b[^>]*\bopen\b/i.test(outerHTML);
        this.isConnected = true;
        this.parentElement = null;
    }
    hasAttribute(name) { return name === 'open' ? this.open : false; }
    setAttribute(name) { if (name === 'open') this.open = true; }
    removeAttribute(name) { if (name === 'open') this.open = false; }
    replaceWith(replacement) {
        const index = this.parentElement.children.indexOf(this);
        assert.ok(index >= 0);
        this.parentElement.children[index] = replacement;
        replacement.parentElement = this.parentElement;
        replacement.isConnected = true;
        this.isConnected = false;
    }
}

function mountedHost() {
    const parsed = parseMultifaceOutput(originalBatch, { expectedCount: 5 });
    const host = {
        isConnected: true,
        dataset: { rmSourceHash: 'source-five', rmState: 'ready', rmFaceCount: '5' },
        classList: { toggle() {} },
        children: parsed.faces.map((item, index) => new FakeDetails(item.details, { checked: index === 3, scroll: index * 10 })),
    };
    host.children.forEach(node => { node.parentElement = host; });
    return host;
}

{
    const host = mountedHost();
    const before = [...host.children];
    const beforeHtml = before.map(node => node.outerHTML);
    const proofs = [];
    let ownershipStamps = 0;
    const sandbox = {
        parseMultifaceOutput,
        extractReadyDetails: html => new FakeDetails(String(html).match(/<details\b[\s\S]*<\/details>/i)?.[0] || ''),
        usableReadyDetails: details => !!details?.outerHTML,
        markExternalDetails() {},
        stampExternalDetailsOwnership() { ownershipStamps += 1; },
        markSanitizedRabbitMirrorFace(_root, proof) { proofs.push(proof); return true; },
        String,
        Number,
        globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(`${functionSource('externalFaceDetails')}\n${functionSource('replaceExternalMultifaceFace')}\nglobalThis.run=replaceExternalMultifaceFace;`, sandbox);
    const updatedBatch = batch(['OLD-1', 'OLD-2', 'NEW-3', 'OLD-4', 'OLD-5']);
    assert.equal(sandbox.globalThis.run(host, 'owner-key', 'independent', updatedBatch, 2), true);
    for (const index of [0, 1, 3, 4]) {
        assert.equal(host.children[index], before[index], `neighbor face ${index} must keep the same DOM node`);
        assert.equal(host.children[index].outerHTML, beforeHtml[index], `neighbor face ${index} HTML must remain byte-identical`);
        assert.equal(host.children[index].state, before[index].state, `neighbor face ${index} interaction state object must survive`);
    }
    assert.notEqual(host.children[2], before[2]);
    assert.match(host.children[2].outerHTML, /NEW-3/);
    assert.equal(host.children[2].open, true, 'the target face keeps its previous outer open state');
    assert.equal(host.dataset.rmFaceCount, '5');
    assert.equal(host.dataset.rmState, 'ready');
    assert.equal(ownershipStamps, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(proofs)), [{ faceIndex: 2, faceCount: 5, sourceHash: 'source-five', origin: 'independent' }]);

    const stableNodes = [...host.children];
    assert.equal(sandbox.globalThis.run(host, 'owner-key', 'independent', updatedBatch.slice(0, -12), 2), false);
    assert.deepEqual(host.children, stableNodes, 'a malformed replacement must leave the entire mounted batch untouched');
}

console.log('multiface critical lifecycle: single paid dispatch, accepted-success review and local DOM resay passed');
