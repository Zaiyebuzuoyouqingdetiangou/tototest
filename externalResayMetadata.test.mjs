import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Real picker / external-pool modules, with only host storage, entropy and the
// network boundary isolated. Metadata tests execute the exact pure production
// helpers in a VM; neither group is a browser or a paid-generation acceptance.
const values = new Map();
const writes = [];
let networkRequests = 0;
let entropy = 872341;
globalThis.localStorage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem(key, value) { writes.push(key); values.set(key, String(value)); },
    removeItem(key) { writes.push(key); values.delete(key); },
};
globalThis.sessionStorage = globalThis.localStorage;
globalThis.SillyTavern = { getContext: () => ({ chatId: 'external-resay-contract', chat: [] }) };
globalThis.fetch = () => { networkRequests += 1; assert.fail('external re-say unit tests must not access the network'); };
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues(array) {
    for (let index = 0; index < array.length; index += 1) {
        entropy = (Math.imul(entropy, 1664525) + 1013904223) >>> 0;
        array[index] = entropy;
    }
    return array;
} } });

function importedUrl(source, owner, fileName) {
    const value = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1])
        .find(path => path.split('?')[0].endsWith(`/${fileName}`));
    assert.ok(value, `missing real import ${fileName}`);
    return new URL(value, owner);
}
const pickerUrl = new URL('../src/picker.js', import.meta.url);
const pickerSource = readFileSync(pickerUrl, 'utf8');
const picker = await import(pickerUrl.href);
const pool = await import(importedUrl(pickerSource, pickerUrl, 'externalPool.js').href);
const { THEMATIC_CATEGORIES } = await import(importedUrl(pickerSource, pickerUrl, 'thematicIndex.js').href);
const { PRESENTATION_FORMATS } = await import(importedUrl(pickerSource, pickerUrl, 'presentationIndex.js').href);
const blacklistUrl = importedUrl(pickerSource, pickerUrl, 'blacklist.js');
const { defaultSettings } = await import(importedUrl(readFileSync(blacklistUrl, 'utf8'), blacklistUrl, 'settings.js').href);

const guardUrl = new URL('../src/generationGuard.js', import.meta.url);
const guardSource = readFileSync(guardUrl, 'utf8');
const helperStart = guardSource.indexOf('function copyFormatDescriptors(');
const helperEnd = guardSource.indexOf('function isFollowBatchPlan(', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'real metadata copy helpers must exist');
const sandbox = {};
vm.runInNewContext(`${guardSource.slice(helperStart, helperEnd)}
globalThis.copyMetadata = copySelectionMetadata;`, sandbox, { filename: guardUrl.pathname });
const copyMetadata = value => JSON.parse(JSON.stringify(sandbox.copyMetadata(value)));

const themeId = 'ext:RESAY:theme:original:0';
const formatId = 'ext:RESAY:format:original:0';
const alternateTheme = 'ext:RESAY:theme:alternate:0';
const alternateFormat = 'ext:RESAY:format:alternate:0';
const row = (externalId, classification, extra = {}) => ({ externalId, classification,
    enabled: true, userConfirmed: true, title: 'RAW_TITLE_MUST_NOT_ENTER_COMBO',
    raw: 'PRIVATE_RAW_LIBRARY_BODY', rawContent: 'PRIVATE_RAW_LIBRARY_BODY', ...extra });
const entries = () => [row(themeId, 'theme'), row(formatId, 'format'),
    row(alternateTheme, 'theme'), row(alternateFormat, 'format')];
function install(rows = entries(), enabled = true) {
    pool.setExternalPoolSnapshot([{ libraryId: 'RESAY', enabled }], new Map([['RESAY', rows]]));
}
function settings(extra = {}) {
    return { ...structuredClone(defaultSettings), enabled: true, mode: 'all',
        autoRabbitMirrorInjection: true, rabbitMirrorFaceCount: 2,
        themesMin: 1, themesMax: 1, formatsMin: 1, formatsMax: 1,
        externalWorldBookRandomEnabled: true, externalWorldBookMixMode: 'external-only',
        blacklistEnabled: true, blacklistedThemeIds: [], blacklistedFormatIds: [], ...extra };
}
const face = (themes = [themeId], formats = [formatId]) => ({
    themeIds: themes, formatIds: formats, samplingMode: 'classic', forcedVisualScenery: false,
});
function resay(record = face(), extra = {}) {
    return picker.pickCombinationForMultifaceResay(settings(extra), { faceIndex: 0, faces: [record] });
}

test('external re-say restores exact current-pool IDs without carrying raw entries or using builtin fallback', () => {
    install();
    const poolBefore = JSON.stringify(pool.getExternalPoolSnapshot());
    const writesBefore = writes.length;
    const result = resay();
    assert.deepEqual(result.combo.themeIds, [themeId]);
    assert.deepEqual(result.combo.formatIds, [formatId]);
    assert.deepEqual(result.combo.themes, [{ id: themeId, group: '', tags: [], externalKind: 'theme' }]);
    assert.deepEqual(result.combo.formats, [{ id: formatId, group: '', tags: [], externalKind: 'format' }]);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_RAW|RAW_TITLE/);
    assert.equal(JSON.stringify(pool.getExternalPoolSnapshot()), poolBefore, 're-say must not mutate the eligible pool');
    assert.equal(writes.length, writesBefore, 're-say must not register or age another random batch');
    assert.equal(networkRequests, 0);
});

test('changing the selected theme preserves the original external form and leaves sibling metadata untouched', () => {
    install();
    const faces = [face([alternateTheme]), face([themeId], [alternateFormat])];
    const before = structuredClone(faces);
    const result = picker.pickCombinationForMultifaceResay(settings(), { faceIndex: 0, faces });
    assert.deepEqual(result.combo.themeIds, [alternateTheme]);
    assert.deepEqual(result.combo.formatIds, [formatId]);
    assert.deepEqual(faces, before, 're-say must not replace or rewrite another face');
    assert.equal(networkRequests, 0);
});

test('mixed builtin and external selections retain order and do not use random-source settings as a replacement', () => {
    install();
    const record = face([THEMATIC_CATEGORIES[0].id, themeId], [formatId, PRESENTATION_FORMATS[0].id]);
    const result = resay(record, { externalWorldBookRandomEnabled: false, externalWorldBookMixMode: 'builtin-only' });
    assert.deepEqual(result.combo.themeIds, record.themeIds);
    assert.deepEqual(result.combo.formatIds, record.formatIds);
});

test('deleted, disabled, unconfirmed, unknown and wrong-kind external IDs fail closed before any request', () => {
    const cases = [
        { rows: entries().filter(item => item.externalId !== formatId) },
        { rows: entries(), enabled: false },
        { rows: entries().map(item => item.externalId === formatId ? { ...item, enabled: false } : item) },
        { rows: entries().map(item => item.externalId === formatId ? { ...item, userConfirmed: false } : item) },
        { rows: entries(), record: face([themeId], ['ext:RESAY:format:missing:0']) },
        { rows: entries(), record: face([themeId], [themeId]) },
        { rows: entries(), record: face([formatId], [formatId]) },
        { rows: entries(), record: face([themeId], [`${formatId} `]) },
    ];
    for (const fixture of cases) {
        install(fixture.rows, fixture.enabled !== false);
        assert.throws(() => resay(fixture.record), error => error?.code === 'MULTIFACE_PLAN_UNAVAILABLE'
            && /不能静默更换/.test(error.message) && !/PRIVATE_RAW|RAW_TITLE/.test(error.message));
        assert.equal(networkRequests, 0, 'validation must not start a generation or model-list request');
    }
});

test('a pool refresh invalidates stale face IDs instead of rehydrating the previous external snapshot', () => {
    install();
    assert.deepEqual(resay().combo.formatIds, [formatId]);
    install([row(alternateTheme, 'theme'), row(alternateFormat, 'format')]);
    assert.throws(() => resay(), error => error?.code === 'MULTIFACE_PLAN_UNAVAILABLE');
    assert.deepEqual(resay(face([alternateTheme], [alternateFormat])).combo.formatIds, [alternateFormat]);
    assert.equal(networkRequests, 0);
});

test('live external multi-face draws stay distinct and re-saying one face preserves its own exact combination', () => {
    install();
    const selections = picker.pickCombinationBatch(settings(), 'external-resay-live', {
        chat: [], batchPlanningOnly: true,
        batchOperation: { operationId: 'external-resay-live', generationType: 'normal', preview: false },
    }, 2);
    assert.equal(selections.length, 2);
    assert.equal(new Set(selections.flatMap(item => item.combo.themeIds)).size, 2);
    assert.equal(new Set(selections.flatMap(item => item.combo.formatIds)).size, 2);
    const faces = selections.map(item => face(item.combo.themeIds, item.combo.formatIds));
    for (let faceIndex = 0; faceIndex < 2; faceIndex += 1) {
        const result = picker.pickCombinationForMultifaceResay(settings(), { faceIndex, faces });
        assert.deepEqual(result.combo.themeIds, faces[faceIndex].themeIds);
        assert.deepEqual(result.combo.formatIds, faces[faceIndex].formatIds);
    }
    assert.equal(networkRequests, 0);
});

test('selection metadata preserves only bounded descriptors belonging to the same face, never raw fields', () => {
    const record = { formatIds: [formatId], raw: 'PRIVATE_RAW', rawContent: 'PRIVATE_RAW',
        formatDescriptors: [{ id: formatId, title: ' title ', summary: ' summary ', tags: [' paper ', ' tactile '],
            raw: 'PRIVATE_RAW', rawContent: 'PRIVATE_RAW', nested: { body: 'PRIVATE_RAW' } }] };
    const result = copyMetadata(record);
    assert.deepEqual(result.formatDescriptors, [{ id: formatId, title: 'title', summary: 'summary', tags: ['paper', 'tactile'] }]);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_RAW|rawContent|nested/);
    record.formatDescriptors[0].title = 'changed';
    record.formatDescriptors[0].tags[0] = 'changed';
    assert.equal(result.formatDescriptors[0].title, 'title');
    assert.equal(result.formatDescriptors[0].tags[0], 'paper');
});

test('descriptor limits reject invalid identity and object coercion, bound text and tags, and remove duplicates', () => {
    const maxId = `ext:${'x'.repeat(2044)}`;
    const overId = `${maxId}x`;
    const record = { formatIds: [formatId, maxId, overId], formatDescriptors: [
        { id: formatId, title: 't'.repeat(200), summary: 's'.repeat(300), tags: Array(6).fill('g'.repeat(100)) },
        { id: formatId, title: 'duplicate' },
        { id: 'unselected', title: 'must not add selection' },
        { id: overId, title: 'oversized identity' },
        { id: maxId, title: { raw: 'PRIVATE_RAW' }, summary: ['PRIVATE_RAW'], tags: [{ raw: 'PRIVATE_RAW' }, null, ' safe '] },
    ] };
    const descriptors = copyMetadata(record).formatDescriptors;
    assert.equal(descriptors.length, 2);
    assert.equal(descriptors[0].title.length, 160);
    assert.equal(descriptors[0].summary.length, 210);
    assert.deepEqual(descriptors[0].tags.map(tag => tag.length), [64, 64, 64, 64]);
    assert.deepEqual(descriptors[1], { id: maxId, title: '', summary: '', tags: ['safe'] });
    assert.doesNotMatch(JSON.stringify(descriptors), /PRIVATE_RAW|duplicate|unselected|oversized/);
});

test('descriptor count and per-face identity stay bounded without changing the legacy descriptor-free shape', () => {
    const ids = Array.from({ length: 12 }, (_, index) => `ext:MANY:format:${index}:0`);
    const many = { formatIds: ids, formatDescriptors: ids.map(id => ({ id, title: id })) };
    assert.equal(copyMetadata(many).formatDescriptors.length, 8);
    const result = copyMetadata({ ...many, faces: [
        { faceIndex: 0, formatIds: [formatId], formatDescriptors: [{ id: formatId, title: 'one' }, { id: alternateFormat, title: 'wrong face' }] },
        { faceIndex: 1, formatIds: [alternateFormat], formatDescriptors: [{ id: alternateFormat, title: 'two' }] },
    ] });
    assert.deepEqual(result.faces.map(item => item.formatDescriptors.map(descriptor => descriptor.id)), [[formatId], [alternateFormat]]);
    assert.equal('formatDescriptors' in copyMetadata({ formatIds: [formatId] }), false);
    assert.equal('formatDescriptors' in copyMetadata({ formatIds: [formatId], formatDescriptors: [{ id: 'wrong' }] }), false);
    assert.equal(copyMetadata(null), null);
});
