import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// Exercise the real producer -> picker -> persisted batch -> prompt boundary.
// The previous external tests used short handwritten ext:fixture IDs, unlike
// IDs produced for a normal Chinese-named JSON file. No private book or API.
const cohort = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8')).js.split('?rmv=')[1];
const moduleAt = name => import(new URL(`../src/${name}?rmv=${cohort}`, import.meta.url).href);
const values = new Map();
globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
};
globalThis.sessionStorage = globalThis.localStorage;
let context = { chatId: 'original-long-filename', chat: [{ is_user: false, mes: 'A completed original scene.' }] };
globalThis.SillyTavern = { getContext: () => context };
const [store, normalize, classifier, selection, pool, prompt, settings, storage, errors] = await Promise.all([
    moduleAt('externalWorldBook/store.js'), moduleAt('externalWorldBook/normalize.js'),
    moduleAt('externalWorldBook/classifier.js'), moduleAt('externalWorldBook/selectionState.js'),
    moduleAt('externalWorldBook/externalPool.js'), moduleAt('promptBuilder.js'), moduleAt('settings.js'), moduleAt('storage.js'), moduleAt('externalWorldBook/errors.js'),
]);

function fixture() {
    const raw = { name: '原创外部参考测试库', entries: Object.fromEntries(Array.from({ length: 45 }, (_, index) => [index, {
        uid: index,
        comment: `${index % 2 ? '主题' : '展现'}${index + 1} 原创纸上花园`,
        key: [index % 2 ? '主题元素' : '展现形式'],
        content: index % 2 ? '一座纸上花园记录园丁重新结识四季的选择。' : '折页植物图鉴，通过花瓣页签查看标本和观察笔记。',
    }])) };
    const book = normalize.normalizeFileWorldBook(raw, { fileName: '原创纸上花园展现与主题母本库.json', fileFingerprint: '原创纸上花园展现与主题母本库.json:19000:1750000000000' });
    const selected = selection.createWholeBookSelection(book);
    const draft = classifier.createExternalWorldBookClassificationDraft(book, selected.selectedIds);
    const snapshot = store.prepareExternalLibrarySnapshot(book, draft, { enabled: true, now: 1000 });
    assert.equal(snapshot.entries.length, 45);
    assert.ok(snapshot.entries.every(entry => entry.externalId.length > 128), 'real producer IDs must cross the former builtin-only limit');
    pool.setExternalPoolSnapshot([snapshot.library], new Map([[snapshot.library.libraryId, snapshot.entries]]));
    return snapshot;
}

test('Chinese filename IDs survive real 1-5-face plans and exact one-attempt batch persistence', () => {
    const snapshot = fixture();
    const rows = new Map(snapshot.entries.map(entry => [entry.externalId, entry]));
    for (const forceVisualScenery of [false, true]) for (const count of [1, 2, 3, 4, 5]) {
        values.clear();
        context = { ...context, chatId: `original-long-${forceVisualScenery}-${count}` };
        const st = { ...structuredClone(settings.defaultSettings), enabled: true, autoRabbitMirrorInjection: true,
            mode: 'all', generationSource: 'independent', rabbitMirrorFaceCount: count,
            themesMin: 1, themesMax: 1, formatsMin: 1, formatsMax: 1, avoidRepeat: false,
            blacklistEnabled: false, externalWorldBookRandomEnabled: true, externalWorldBookMixMode: 'external-only', forceVisualScenery };
        const plan = prompt.planRabbitMirrorPromptDetails(st, 'independent', null, `scope-${count}-${forceVisualScenery}`, {
            batchIdentity: { mesid: 0, swipeId: 0, sourceHash: 'original-source-hash' }, chat: context.chat,
        });
        const selectedRows = new Map(plan.selectedExternalIds.map(id => [id, rows.get(id)]));
        assert.equal(new Set(plan.selectedExternalIds).size, plan.selectedExternalIds.length);
        const result = prompt.renderRabbitMirrorPromptPlan(plan, selectedRows);
        assert.equal(result.metadata.faces?.length ?? 1, count);
        assert.ok(result.prompt.includes('原创纸上花园'));
        if (count > 1) {
            assert.equal(storage.markPendingBatchAttempt(result.batchPlan), true);
            assert.equal(storage.findPendingComboBatchPlan(result.batchPlan.identity).batchId, result.batchPlan.batchId);
            assert.equal(storage.releasePendingComboBatch(result.batchPlan), true);
        }
        selectedRows.clear();
    }
});

test('batch ID boundary remains bounded and rejects malformed or overlong IDs', () => {
    const identity = { chatKey: 'chat:bounds', generationScopeKey: 'bounds', mesid: 0, swipeId: 0, sourceHash: 'bounds', settingsKey: 'bounds' };
    const valid = `ext:LOCAL:theme:${'a'.repeat(180)}`;
    const make = id => storage.createPendingComboBatchPlan([
        { themeIds: [id], formatIds: ['1.1.1'] }, { themeIds: ['A.1.1'], formatIds: ['1.1.2'] },
    ], identity);
    assert.ok(make(valid), 'namespaced external IDs use the same bounded contract as prompt material');
    assert.ok(make('ext:' + 'a'.repeat(2044)), 'exact 2048-character external boundary');
    for (const id of ['a'.repeat(129), 'ext:' + 'a'.repeat(2045), 'ext:bad<markup>', ' ext:bad', 'ext:bad\nline', 'ext:bad\n']) {
        assert.equal(make(id), null, `reject malformed or oversized ID: ${id.length} chars`);
    }
});

test('external preflight distinguishes plan failure and ownership changes without private details', () => {
    for (const code of ['MULTIFACE_PLAN_UNAVAILABLE', 'RABBIT_MIRROR_DISPATCH_LEASE_REJECTED']) {
        const diagnosis = errors.describeExternalWorldBookPreflightFailure({ code, message: 'PRIVATE_BOOK_BODY', details: { source: 'PRIVATE_TITLE' } });
        assert.equal(diagnosis.code, code);
        assert.doesNotMatch(JSON.stringify(diagnosis), /PRIVATE/);
        assert.match(diagnosis.message, code === 'MULTIFACE_PLAN_UNAVAILABLE' ? /计划无法建立.*不表示.*损坏/ : /归属已变化.*不必重新分类/);
    }
});
