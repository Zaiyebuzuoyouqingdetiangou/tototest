import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import vm from 'node:vm';
register(new URL('./hostLoader.mjs', import.meta.url));

// Original 45-row library. Exercise consecutive real plans with their attempt
// history intact; do not reset storage between generations or call a model.
const cohort = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url))).js.split('?rmv=')[1];
const load = name => import(new URL(`../src/${name}?rmv=${cohort}`, import.meta.url));
const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
globalThis.sessionStorage = globalThis.localStorage;
const context = { chatId: 'original-cooldown-garden', chat: [{ is_user: false, mes: 'A paper garden after the rain.' }] };
globalThis.SillyTavern = { getContext: () => context };
let entropy = 12345;
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues(array) {
    for (let i = 0; i < array.length; i++) array[i] = entropy = (Math.imul(entropy, 1664525) + 1013904223) >>> 0;
    return array;
} } });
const [normalizer, classifier, selection, store, pool, prompt, settings, storage] = await Promise.all([
    load('externalWorldBook/normalize.js'), load('externalWorldBook/classifier.js'), load('externalWorldBook/selectionState.js'),
    load('externalWorldBook/store.js'), load('externalWorldBook/externalPool.js'), load('promptBuilder.js'), load('settings.js'), load('storage.js'),
]);
function fixture() {
    const book = normalizer.normalizeFileWorldBook({ entries: Object.fromEntries(Array.from({ length: 45 }, (_, i) => [i, {
        uid: i, comment: `${i % 2 ? '主题' : '展现'}${i + 1} 原创花园`, key: [i % 2 ? '主题元素' : '展现形式'],
        content: i % 2 ? '纸鹤在花园里寻找雨后的回信。' : '通过折页标本册的页签查看花瓣观察笔记。',
    }])) }, { fileName: '原创花园.json', fileFingerprint: 'original-garden:45' });
    const selected = selection.createWholeBookSelection(book);
    const draft = classifier.createExternalWorldBookClassificationDraft(book, selected.selectedIds);
    const result = store.prepareExternalLibrarySnapshot(book, draft, { enabled: true, now: 1000 });
    pool.setExternalPoolSnapshot([result.library], new Map([[result.library.libraryId, result.entries]]));
    return result;
}
const config = () => ({ ...structuredClone(settings.defaultSettings), enabled: true, autoRabbitMirrorInjection: true,
    mode: 'all', generationSource: 'independent', rabbitMirrorFaceCount: 5, themesMin: 2, themesMax: 2,
    formatsMin: 2, formatsMax: 2, avoidRepeat: true, cooldownRounds: 10, blacklistEnabled: false,
    externalWorldBookRandomEnabled: true, externalWorldBookMixMode: 'external-only' });
function build(scope, extra = {}) {
    return prompt.planRabbitMirrorPromptDetails(config(), 'independent', null, scope, {
        chat: context.chat, batchIdentity: { mesid: 0, swipeId: 0, sourceHash: 'unchanged-original-scene' }, ...extra,
    });
}

test('45 external rows support repeated five-face generations without resetting prior attempts', () => {
    values.clear();
    const library = fixture();
    const rows = new Map(library.entries.map(entry => [entry.externalId, entry]));
    let previous = null;
    for (let round = 0; round < 8; round++) {
        let planned;
        try { planned = build(`external-cooldown-${round}`); }
        catch (error) { error.message = `generation ${round + 1}: ${error.message}`; throw error; }
        const rendered = prompt.renderRabbitMirrorPromptPlan(planned, new Map(planned.selectedExternalIds.map(id => [id, rows.get(id)])));
        const batch = rendered.batchPlan;
        assert.equal(batch.faces.length, 5);
        for (const kind of ['themeIds', 'formatIds']) {
            const ids = batch.faces.flatMap(face => face.combo[kind]);
            assert.equal(ids.length, 10, 'each face retains the requested two entries');
            assert.equal(new Set(ids).size, 10, 'same-batch exclusions must never be relaxed');
            assert.ok(ids.every(id => rows.has(id)), 'no silent builtin fallback');
            if (round === 1) assert.ok(ids.every(id => !previous[kind].includes(id)), 'history is still preferred when fresh entries suffice');
        }
        assert.equal(storage.markPendingBatchAttempt(batch), true, `round ${round + 1} registers before dispatch`);
        const once = values.get('rabbit_mirror_theater:generation_attempts:v1');
        assert.equal(storage.markPendingBatchAttempt(batch), true);
        assert.equal(values.get('rabbit_mirror_theater:generation_attempts:v1'), once, 'one attempt registration, not an automatic retry');
        assert.equal(storage.releasePendingComboBatch(batch), true);
        previous = Object.fromEntries(['themeIds', 'formatIds'].map(kind => [kind, batch.faces.flatMap(face => face.combo[kind])]));
    }
});

test('cooldown reuse never restores strict exclusions, including when all usable IDs have history', () => {
    values.clear();
    const library = fixture();
    const themes = library.entries.filter(row => row.classification === 'theme').map(row => row.externalId);
    const formats = library.entries.filter(row => row.classification === 'format').map(row => row.externalId);
    storage.recordGenerationAttempt({ themeIds: themes.slice(0, 16), formatIds: formats.slice(0, 16) }, { chatKey: storage.getCurrentChatKey(context.chat), attemptId: 'prior-a' });
    storage.recordGenerationAttempt({ themeIds: themes.slice(16), formatIds: formats.slice(16) }, { chatKey: storage.getCurrentChatKey(context.chat), attemptId: 'prior-b' });
    const blocked = [...themes.slice(0, 4), ...formats.slice(0, 4)];
    const plan = build('strict-exclusions', { batchExcludedThemeIds: themes.slice(0, 4), batchExcludedFormatIds: formats.slice(0, 4) });
    assert.equal(plan.batchPlan.faces.length, 5);
    assert.ok(plan.selectedExternalIds.every(id => !blocked.includes(id)));
    assert.equal(new Set(plan.selectedExternalIds).size, 20);
    assert.equal(storage.markPendingBatchAttempt(plan.batchPlan), true);
    assert.equal(storage.releasePendingComboBatch(plan.batchPlan), true);
});

test('a genuinely too-small external library still rejects before registration without builtin fallback', () => {
    values.clear();
    const library = fixture();
    const small = ['theme', 'format'].flatMap(kind => library.entries.filter(row => row.classification === kind).slice(0, 4));
    pool.setExternalPoolSnapshot([library.library], new Map([[library.library.libraryId, small]]));
    const before = [...values];
    assert.throws(() => build('genuinely-too-small'), error => error.code === 'MULTIFACE_PLAN_UNAVAILABLE');
    assert.deepEqual([...values], before, 'failed planning is still request-zero and write-free');
});

test('external cooldown remains preferential even with avoidRepeat off; strict sampling API is unchanged', () => {
    fixture();
    const ids = pool.getExternalPoolSnapshot().formatsByLibrary.flatMap(library => library.ids);
    const strict = ids.slice(0, 2);
    const previous = ids.slice(2, -1);
    const fresh = ids.at(-1);
    const options = { hardExcludedIds: strict, preferredExcludedIds: previous, avoidRepeat: false, randomUnit: () => 0 };
    const selected = pool.pickExternalItems(config(), 'format', 4, options).map(item => item.id);
    assert.equal(selected[0], fresh);
    assert.equal(new Set(selected).size, 4);
    assert.ok(selected.every(id => !strict.includes(id)));
    assert.deepEqual(pool.pickExternalItems(config(), 'format', 1, { hardExcludedIds: ids, randomUnit: () => 0 }), [], 'hard exclusions never become soft implicitly');
});

test('real independent preflight reaches its single transport boundary for eight consecutive five-face calls', async () => {
    values.clear();
    const library = fixture();
    const rows = new Map(library.entries.map(entry => [entry.externalId, entry]));
    const source = readFileSync(new URL('../src/independentApi.js', import.meta.url), 'utf8');
    const start = source.indexOf('function independentPromptOwnerPreflightError(');
    const end = source.indexOf('\nfunction externalOwnerMesid(', start);
    assert.ok(start >= 0 && end > start);
    const boundaryReached = new Error('ORIGINAL_FIXTURE_TRANSPORT_BOUNDARY');
    const counters = { plan: 0, render: 0, raw: 0, mark: 0, consume: 0, transport: 0 };
    let batch = null;
    let clock = Date.now();
    const sandbox = {
        Date: class extends Date { static now() { return ++clock; } },
        getSettings: () => ({ ...config(), independentApiBaseUrl: 'https://never-contact.invalid', independentApiModel: 'fixture' }),
        getContext: () => context,
        chatKey: () => storage.getCurrentChatKey(context.chat),
        swipeId: () => 0,
        messageSourceFingerprint: () => 'original-scene-owner',
        messageBaseSlotKey: () => 'original-message-slot',
        operationEpochForBase: () => 1,
        createIndependentVisibleTextReader: () => msg => ({ text: msg.mes }),
        isRabbitMirrorEligibleAssistantMessage: msg => !msg.is_user,
        getExternalPoolHydrationStatus: () => ({ hydrated: true }),
        planRabbitMirrorPromptDetails(...args) { counters.plan++; return prompt.planRabbitMirrorPromptDetails(...args); },
        renderRabbitMirrorPromptPlan(...args) { counters.render++; return prompt.renderRabbitMirrorPromptPlan(...args); },
        async getSelectedExternalEntries(ids) { counters.raw++; return new Map(ids.map(id => [id, rows.get(id)])); },
        recentIndependentVisualGuard: () => '',
        manualRetryVisualGuard: () => '',
        INDEPENDENT_BEHAVIOR_PATCH: '',
        MAX_INDEPENDENT_REQUEST_CHARS: 200000,
        globalWorldInfoSnapshotFor: () => null,
        globalWorldInfoContextView: () => null,
        contextBundle: () => ({ text: context.chat[0].mes, targetVisibleChars: context.chat[0].mes.length, layers: 1, maxLayers: 1 }),
        recordRabbitMirrorIndependentPrompt() {},
        hashText: value => String(value),
        markPendingBatchAttempt(...args) { counters.mark++; return storage.markPendingBatchAttempt(...args); },
        releasePendingComboBatch: storage.releasePendingComboBatch,
        independentBatchPlanPreflightError(reason) { const error = new Error(reason); error.code = reason; return error; },
        independentLocalPreflightFailure: error => error,
        describeExternalWorldBookPreflightFailure: error => ({ code: error.code, message: error.message }),
        async requestIndependentCompletion(_st, _system, _user, options) {
            assert.equal(options.dispatchLease.consume(), true);
            counters.transport++;
            throw boundaryReached;
        },
    };
    vm.runInNewContext(`${source.slice(start, end)}\nglobalThis.invoke=callIndependentApi;`, sandbox);
    for (let round = 0; round < 8; round++) {
        batch = null;
        await assert.rejects(sandbox.invoke(context, 0, context.chat[0], null, {
            manualRetry: round > 0,
            dispatchLease: { epoch: 1, consume() { counters.consume++; return true; } },
            isPromptOwnerCurrent: () => true,
            currentBatchPlan: () => batch,
            onBatchPlan(value) { batch = value; },
        }), error => error === boundaryReached, `call ${round + 1} must reach the boundary, not a plan rejection`);
        assert.equal(batch.faces.length, 5);
        assert.equal(storage.releasePendingComboBatch(batch), true);
    }
    assert.deepEqual(counters, { plan: 8, render: 8, raw: 8, mark: 8, consume: 8, transport: 8 });
});
