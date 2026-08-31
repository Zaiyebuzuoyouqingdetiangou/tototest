import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// --loader ./tests/hostLoader.mjs; real production picker/storage, fake host and entropy only.
const values = new Map();
const reads = [];
const writes = [];
const removals = [];
const originals = new Map();
let entropyState = 123456;
let entropyCalls = 0;
let networkCalls = 0;
let context = { chatId: 'batch-foundation', chat: [] };
function replaceGlobal(name, value) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
replaceGlobal('crypto', { getRandomValues(array) {
    entropyCalls += 1;
    for (let i = 0; i < array.length; i += 1) {
        entropyState = (Math.imul(entropyState, 1664525) + 1013904223) >>> 0;
        array[i] = entropyState;
    }
    return array;
} });
replaceGlobal('localStorage', {
    getItem(key) { reads.push(key); return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { writes.push(key); values.set(key, String(value)); },
    removeItem(key) { removals.push(key); values.delete(key); },
});
replaceGlobal('sessionStorage', globalThis.localStorage);
replaceGlobal('SillyTavern', { getContext: () => context });
replaceGlobal('fetch', () => { networkCalls += 1; throw new Error('Picker must remain network-free'); });

const pickerUrl = new URL('../src/picker.js', import.meta.url);
const pickerSource = readFileSync(pickerUrl, 'utf8');
function importedUrl(source, ownerUrl, fileName) {
    const path = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1])
        .find(value => value.split('?')[0].endsWith(`/${fileName}`));
    assert.ok(path, `Production import must exist: ${fileName}`);
    return new URL(path, ownerUrl);
}
const storageUrl = importedUrl(pickerSource, pickerUrl, 'storage.js');
const blacklistUrl = importedUrl(pickerSource, pickerUrl, 'blacklist.js');
const settingsUrl = importedUrl(readFileSync(blacklistUrl, 'utf8'), blacklistUrl, 'settings.js');
const { defaultSettings } = await import(settingsUrl.href);
const { PRESENTATION_FORMATS } = await import(importedUrl(pickerSource, pickerUrl, 'presentationIndex.js').href);
const { THEMATIC_CATEGORIES } = await import(importedUrl(pickerSource, pickerUrl, 'thematicIndex.js').href);
const storage = await import(storageUrl.href);
const { pickCombination, pickCombinationBatch } = await import(pickerUrl.href);
const BATCH = 'rabbit_mirror_theater:pending_batch:v1';
const PENDING = 'rabbit_mirror_theater:pending_combo:v11';
const HISTORY = 'rabbit_mirror_theater:last_combo:v11';
const ATTEMPTS = 'rabbit_mirror_theater:generation_attempts:v1';
const PITY = 'rabbit_mirror_theater:format_eligible_misses:v1';
const RANK = '1.3.4';
const COMMENT = '1.3.3.review';
const CHAT = '1.1.1.2';
const FORUM = '7.2.1';
const SCENERY = '10.2.2';
let groupCount = 0;

function config(extra = {}) {
    return { ...structuredClone(defaultSettings), mode: 'all', userDirectivePriority: false,
        forceVisualScenery: false, samplingMode: 'classic', themesMin: 1, themesMax: 1,
        formatsMin: 1, formatsMax: 1, avoidRepeat: true, cooldownRounds: 10,
        blacklistEnabled: true, blacklistedThemeIds: [], blacklistedFormatIds: [],
        favoriteThemeIds: [], favoriteFormatIds: [], favoriteThemeMultipliers: {}, favoriteFormatMultipliers: {}, ...extra };
}
function onlyFormats(ids, extra = {}) {
    const allowed = new Set(ids);
    return config({ samplingMode: 'format_only', blacklistedFormatIds: PRESENTATION_FORMATS.filter(item => !allowed.has(item.id)).map(item => item.id), ...extra });
}
const target = (extra = {}) => ({ batchIdentity: { mesid: 7, swipeId: 0, sourceHash: 'final-body-hash', ...extra } });
const shape = face => ({ themeIds: face.combo.themeIds, formatIds: face.combo.formatIds, uiReviewFocus: face.combo.uiReviewFocus });
function clearLogs() { reads.length = 0; writes.length = 0; removals.length = 0; }
function fresh(seed = 123456) {
    values.clear(); clearLogs(); entropyState = seed; entropyCalls = 0;
    context = { chatId: 'batch-foundation', chat: [] };
}
const pending = () => JSON.parse(values.get(BATCH));
const countWrite = key => writes.filter(value => value === key).length;

try {
    // Planning is not a successful/failed single attempt: no pity or history debt.
    fresh();
    const cfg = config();
    const first = pickCombinationBatch(cfg, 'snapshot', target(), 3);
    assert.equal(first.length, 3);
    assert.deepEqual(writes, [BATCH], 'Successful batch planning writes only one batch');
    for (const key of [PENDING, ATTEMPTS, PITY, HISTORY]) assert.equal(values.has(key), false, `${key} must not be written by pure batch planning`);
    const rawBatch = pending();
    assert.equal(rawBatch.identity.chatKey, 'chat:batch-foundation');
    assert.equal(rawBatch.identity.generationScopeKey, 'snapshot');
    assert.deepEqual(first.map(face => [face.batchId, face.faceIndex]), [0, 1, 2].map(index => [rawBatch.batchId, index]));
    groupCount += 1;

    // Both returned arrays and nested selected items are defensive copies.
    const originalFirst = structuredClone(first);
    first[0].combo.themeIds.length = 0;
    first[0].combo.formats[0].title = 'caller mutation';
    first.pop();
    const callsBeforeCache = entropyCalls;
    clearLogs();
    const second = pickCombinationBatch(cfg, 'snapshot', target(), 3);
    assert.deepEqual(second, originalFirst);
    assert.equal(entropyCalls, callsBeforeCache, 'Cache hit does not consume randomness');
    assert.equal(writes.length + removals.length, 0, 'Cache hit is read-only');
    groupCount += 1;

    // Single entry does not even read or remove an unrelated pending batch.
    const unrelatedRaw = values.get(BATCH);
    clearLogs();
    const single = pickCombinationBatch(cfg, 'single-beside-batch', target(), 1);
    assert.equal(single.length, 1);
    assert.strictEqual(single[0], pickCombination(cfg, 'single-beside-batch', target()));
    assert.equal(reads.includes(BATCH), false);
    assert.equal(removals.includes(BATCH), false);
    assert.equal(values.get(BATCH), unrelatedRaw);
    assert.equal('batchId' in single[0], false);
    groupCount += 1;

    // Explicit identity is mandatory and bounded; invalid input stays single.
    const badTargets = [null, {}, { batchIdentity: {} }, target({ sourceHash: '' }), target({ sourceHash: ' ' }),
        target({ sourceHash: 'x'.repeat(513) }), target({ mesid: '7' }), target({ mesid: -1 }),
        target({ mesid: Number.MAX_SAFE_INTEGER + 1 }), target({ swipeId: Number.NaN }), target({ swipeId: -1 })];
    for (const [index, invalid] of badTargets.entries()) {
        fresh();
        assert.equal(pickCombinationBatch(config(), `invalid-${index}`, invalid, 3).length, 1);
        assert.equal(values.has(BATCH), false);
        assert.equal(reads.includes(BATCH), false);
    }
    fresh();
    assert.equal(pickCombinationBatch(config(), '', target(), 3).length, 1);
    fresh();
    assert.equal(pickCombinationBatch(config(), 's'.repeat(1025), target(), 3).length, 1);
    fresh(); context.chatId = 'c'.repeat(1025);
    assert.equal(pickCombinationBatch(config(), 'too-long-chat', target(), 3).length, 1);
    fresh();
    assert.equal(pickCombinationBatch(config({ blacklistedFormatIds: ['x'.repeat(8200)] }), 'too-long-settings', target(), 3).length, 1);
    groupCount += 1;

    // Stable full white-list signature; secret/prompt switches never enter identity.
    fresh();
    const signatureConfig = config({ favoriteFormatIds: [RANK, FORUM], favoriteFormatMultipliers: { [RANK]: 3, [FORUM]: 5 } });
    const initial = pickCombinationBatch(signatureConfig, 'signature', target(), 3);
    const identityText = pending().identity.settingsKey;
    assert.ok(identityText.startsWith('{') && identityText.length <= 8192);
    signatureConfig.favoriteFormatIds.reverse();
    signatureConfig.enhancedVisualDrawing = true;
    signatureConfig.independentApiKey = 'do-not-cache-secret';
    signatureConfig.independentApiModel = 'unrelated-model';
    signatureConfig.visualPrompt = 'do-not-cache-prompt';
    const noRandomChange = pickCombinationBatch(signatureConfig, 'signature', target(), 3);
    assert.deepEqual(noRandomChange, initial);
    assert.equal(pending().identity.settingsKey, identityText);
    assert.doesNotMatch(identityText, /enhancedVisualDrawing|do-not-cache|independentApi/);
    signatureConfig.favoriteFormatMultipliers[RANK] = 4;
    const changedRandom = pickCombinationBatch(signatureConfig, 'signature', target(), 3);
    assert.notEqual(changedRandom[0].batchId, initial[0].batchId);
    assert.notEqual(pending().identity.settingsKey, identityText);
    groupCount += 1;

    // Every owner dimension, plus actual random restrictions/count, invalidates.
    const changes = [
        { owner: { mesid: 8 } }, { owner: { swipeId: 1 } }, { owner: { sourceHash: 'revised-final-body' } },
        { chatId: 'other-chat' }, { scope: 'other-scope' }, { count: 2 },
        { settings: { avoidRepeat: false } }, { settings: { cooldownRounds: 5 } },
        { settings: { themesMin: 2, themesMax: 2 } }, { settings: { blacklistEnabled: false } },
    ];
    for (const [index, change] of changes.entries()) {
        fresh();
        const baseCfg = config();
        const scope = `owner-${index}`;
        const a = pickCombinationBatch(baseCfg, scope, target(), 3);
        if (change.chatId) context.chatId = change.chatId;
        const b = pickCombinationBatch({ ...baseCfg, ...(change.settings || {}) }, change.scope || scope, target(change.owner), change.count || 3);
        assert.notEqual(a[0].batchId, b[0].batchId, `Identity change ${index} must not reuse batch`);
    }
    groupCount += 1;

    // Local exact exclusion is never reopened, even when all same-group formats remain.
    fresh();
    const two = pickCombinationBatch(onlyFormats([RANK, COMMENT]), 'two-candidates', target(), 3);
    assert.equal(two.length, 2);
    assert.deepEqual(new Set(two.flatMap(face => face.combo.formatIds)), new Set([RANK, COMMENT]));
    assert.equal(two.every(face => face.combo.themeIds.length === 0), true);
    fresh();
    const one = pickCombinationBatch(onlyFormats([RANK]), 'one-candidate', target(), 3);
    assert.equal(one.length, 1);
    assert.deepEqual(one[0].combo.formatIds, [RANK]);
    assert.equal(values.has(BATCH), false);
    fresh();
    const externallyExcluded = pickCombinationBatch(onlyFormats([RANK, COMMENT, CHAT]), 'external-exclusion',
        { ...target(), batchExcludedFormatIds: [RANK, COMMENT] }, 3);
    assert.equal(externallyExcluded.length, 1);
    assert.deepEqual(externallyExcluded[0].combo.formatIds, [CHAT]);
    groupCount += 1;

    // Local restrictions participate in cache identity, and blacklist stays absolute.
    fresh();
    const aExcluded = pickCombinationBatch(onlyFormats([RANK, COMMENT, CHAT, FORUM]), 'changed-exclusion', target(), 3);
    const forbidden = aExcluded[0].combo.formatIds[0];
    const bExcluded = pickCombinationBatch(onlyFormats([RANK, COMMENT, CHAT, FORUM]), 'changed-exclusion',
        { ...target(), batchExcludedFormatIds: [forbidden] }, 3);
    assert.notEqual(bExcluded[0].batchId, aExcluded[0].batchId);
    assert.equal(bExcluded.some(face => face.combo.formatIds.includes(forbidden)), false);
    const bannedCfg = config({ blacklistedFormatIds: [RANK, COMMENT], blacklistedThemeIds: [THEMATIC_CATEGORIES[0].id] });
    const bannedBatch = pickCombinationBatch(bannedCfg, 'blacklist-boundary', target(), 3);
    for (const face of bannedBatch) {
        assert.equal(face.combo.formatIds.some(id => [RANK, COMMENT].includes(id)), false);
        assert.equal(face.combo.themeIds.includes(THEMATIC_CATEGORIES[0].id), false);
    }
    groupCount += 1;

    // Do not satisfy multi-face count by overriding explicit directives or scenery.
    fresh();
    const scenery = pickCombinationBatch(config({ forceVisualScenery: true }), 'forced-scenery', target(), 3);
    assert.equal(scenery.length, 1);
    assert.deepEqual(scenery[0].combo.formatIds, [SCENERY]);
    assert.equal(values.has(BATCH), false);
    fresh(); context.chat = [{ is_user: true, mes: '兔子镜形式：7.2.1', send_date: 7 }];
    const directive = pickCombinationBatch(config({ userDirectivePriority: true }), 'explicit-directive', target(), 3);
    assert.equal(directive.length, 1);
    assert.equal(directive[0].directive.hasFormatRequest, true);
    assert.deepEqual(directive[0].combo.formatIds, [FORUM]);
    assert.equal(values.has(BATCH), false);
    fresh(); context.chat = [{ is_user: true, mes: '关闭兔子镜', send_date: 8 }];
    assert.equal(pickCombinationBatch(config({ userDirectivePriority: true }), 'disabled-directive', target(), 3)[0].disabled, true);
    assert.equal(values.has(BATCH), false);
    groupCount += 1;

    // A former unbound single cache cannot be relabeled as a new owner fallback.
    fresh();
    const priorSingle = pickCombination(onlyFormats([RANK]), 'same-scope');
    assert.deepEqual(priorSingle.combo.formatIds, [RANK]);
    context.chatId = 'new-chat';
    const newScenery = pickCombinationBatch(config({ forceVisualScenery: true }), 'same-scope', target({ mesid: 20, sourceHash: 'other-body' }), 3);
    assert.deepEqual(newScenery[0].combo.formatIds, [SCENERY]);
    fresh();
    pickCombination(onlyFormats([RANK]), 'same-scope-directive');
    context.chatId = 'directive-chat';
    context.chat = [{ is_user: true, mes: '兔子镜形式：7.2.1', send_date: 9 }];
    const newDirective = pickCombinationBatch(config({ userDirectivePriority: true }), 'same-scope-directive', target({ mesid: 22, sourceHash: 'directive-body' }), 2);
    assert.deepEqual(newDirective[0].combo.formatIds, [FORUM]);
    assert.ok(newDirective[0].directive);
    groupCount += 1;

    // Same target/body/scope does not hide edits to the current explicit directive.
    // Count reads on the final user's text, with an untracked first message for chat identity.
    fresh();
    let directiveText = '继续正文';
    let directiveReads = 0;
    const trackedUser = { is_user: true, send_date: 100, get mes() { directiveReads += 1; return directiveText; } };
    context.chat = [{ is_user: false, mes: 'fixed-chat-seed' }, trackedUser];
    const directiveCfg = config({ userDirectivePriority: true });
    const originalDirectiveBatch = pickCombinationBatch(directiveCfg, 'mutable-directive', target(), 3);
    assert.equal(originalDirectiveBatch.length, 3);
    directiveText = '本轮不要兔子镜';
    directiveReads = 0;
    const disabledSameOwner = pickCombinationBatch(directiveCfg, 'mutable-directive', target(), 3);
    assert.equal(disabledSameOwner.length, 1);
    assert.equal(disabledSameOwner[0].disabled, true);
    assert.equal(directiveReads, 4, 'One production current-turn read, not a second scan via single fallback');
    directiveText = '兔子镜形式：7.2.1\n正文：不要把这段正文放进指令签名';
    directiveReads = 0;
    const pointFoodSameOwner = pickCombinationBatch(directiveCfg, 'mutable-directive', target(), 3);
    assert.deepEqual(pointFoodSameOwner[0].combo.formatIds, [FORUM]);
    assert.equal(directiveReads, 4);
    assert.doesNotMatch(pointFoodSameOwner[0].directive.rawDirective, /不要把这段正文/);
    directiveText = '兔子镜形式：1.3.4';
    directiveReads = 0;
    const changedPointFood = pickCombinationBatch(directiveCfg, 'mutable-directive', target(), 3);
    assert.deepEqual(changedPointFood[0].combo.formatIds, [RANK]);
    assert.equal(directiveReads, 4);
    const countBeforeDirectiveHit = entropyCalls;
    assert.deepEqual(pickCombinationBatch(directiveCfg, 'mutable-directive', target(), 3), changedPointFood);
    assert.equal(entropyCalls, countBeforeDirectiveHit);
    groupCount += 1;

    // Missing identity takes the untouched single path; over-limit directive signature
    // safely remains single using the snapshot already read, without oversized batch state.
    fresh();
    directiveText = '兔子镜形式：7.2.1';
    directiveReads = 0;
    context.chat = [{ is_user: false, mes: 'fixed-chat-seed' }, trackedUser];
    const noOwner = pickCombinationBatch(directiveCfg, 'directive-no-owner', null, 3);
    assert.deepEqual(noOwner[0].combo.formatIds, [FORUM]);
    assert.equal(directiveReads, 4);
    assert.equal(reads.includes(BATCH), false);
    fresh();
    directiveText = `兔子镜形式：7.2.1\n${'补充'.repeat(1400)}`;
    directiveReads = 0;
    context.chat = [{ is_user: false, mes: 'fixed-chat-seed' }, trackedUser];
    const oversizedDirective = pickCombinationBatch(config({ userDirectivePriority: true, blacklistedFormatIds: ['z'.repeat(6300)] }),
        'directive-key-too-large', target(), 3);
    assert.equal(oversizedDirective.length, 1);
    assert.deepEqual(oversizedDirective[0].combo.formatIds, [FORUM]);
    assert.equal(directiveReads, 4);
    assert.equal(values.has(BATCH), false);
    assert.equal(reads.includes(BATCH), false);
    groupCount += 1;

    // Storage failure finalizes the already-picked first exactly once, no reroll.
    fresh(985);
    const full = pickCombinationBatch(config(), 'successful-reference', target(), 3);
    const plannedEntropyCalls = entropyCalls;
    fresh(985);
    const realSet = localStorage.setItem;
    localStorage.setItem = (key, value) => { if (key !== BATCH) return realSet(key, value); };
    let degraded;
    try { degraded = pickCombinationBatch(config(), 'write-failure', target(), 3); }
    finally { localStorage.setItem = realSet; }
    assert.equal(degraded.length, 1);
    assert.deepEqual(shape(degraded[0]), shape(full[0]));
    assert.equal(entropyCalls, plannedEntropyCalls, 'Failure must not call single picker to reroll');
    assert.equal(countWrite(PITY), 1);
    assert.equal(countWrite(PENDING), 1);
    assert.equal(countWrite(ATTEMPTS), 1);
    assert.deepEqual(writes.filter(key => [PITY, PENDING, ATTEMPTS].includes(key)), [PITY, PENDING, ATTEMPTS]);
    assert.equal(values.has(HISTORY), false);
    clearLogs();
    const entropyAfterFallback = entropyCalls;
    const restoredSameScope = pickCombinationBatch(config(), 'write-failure', target(), 3);
    assert.deepEqual(restoredSameScope, degraded);
    assert.equal(entropyCalls, entropyAfterFallback);
    assert.equal(writes.length + removals.length, 0);
    assert.equal(pickCombinationBatch(config(), 'write-recovered-new-scope', target(), 3).length, 3);
    groupCount += 1;

    // A missing or tampered pending batch is not a valid cached plan.
    fresh();
    const original = pickCombinationBatch(config(), 'pending-integrity', target(), 3);
    values.delete(BATCH);
    const recreated = pickCombinationBatch(config(), 'pending-integrity', target(), 3);
    assert.notEqual(recreated[0].batchId, original[0].batchId);
    const modified = pending();
    modified.faces[0].themeIds = ['tampered-id'];
    modified.faces[0].signature = JSON.stringify({ themeIds: modified.faces[0].themeIds, formatIds: modified.faces[0].formatIds,
        samplingMode: modified.faces[0].samplingMode || 'classic', forcedVisualScenery: !!modified.faces[0].forcedVisualScenery });
    values.set(BATCH, JSON.stringify(modified));
    const checked = pickCombinationBatch(config(), 'pending-integrity', target(), 3);
    assert.notEqual(checked[0].batchId, recreated[0].batchId);
    assert.equal(checked.some(face => face.combo.themeIds.includes('tampered-id')), false);
    groupCount += 1;

    // C1 consumes an existing soft-pity multiplier but does not age/reset it.
    // Its lifecycle is deliberately not a simulation of single-attempt writes.
    const realEntropy = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { configurable: true, writable: true, value: {
        getRandomValues(array) { array.fill(Math.floor(0.4 * 0x100000000)); return array; },
    } });
    try {
        fresh();
        const noPity = pickCombinationBatch(onlyFormats([RANK, '5.3.1']), 'pity-before', target(), 2);
        assert.deepEqual(noPity[0].combo.formatIds, [RANK]);
        fresh();
        const existingPity = JSON.stringify({ '5.3.1': 320 });
        values.set(PITY, existingPity);
        const withPity = pickCombinationBatch(onlyFormats([RANK, '5.3.1']), 'pity-after', target(), 2);
        assert.deepEqual(withPity[0].combo.formatIds, ['5.3.1'], 'Existing 2x pity multiplier must affect the production selector');
        assert.equal(values.get(PITY), existingPity, 'Planning must preserve pity bytes');
        assert.equal(countWrite(PITY), 0);
    } finally {
        Object.defineProperty(globalThis, 'crypto', { configurable: true, writable: true, value: realEntropy });
    }
    groupCount += 1;

    // Batch uses the same real favorite multiplier and explicit IF group gate;
    // the small controlled pool tests first-face inverse-CDF boundaries, while
    // the remaining face must still respect exact exclusion.
    const previousCrypto = globalThis.crypto;
    let fixedRoll = 0.7;
    Object.defineProperty(globalThis, 'crypto', { configurable: true, writable: true, value: {
        getRandomValues(array) { array.fill(Math.floor(fixedRoll * 0x100000000)); return array; },
    } });
    try {
        fresh();
        const unpreferred = pickCombinationBatch(onlyFormats([RANK, FORUM]), 'batch-favorite-none', target(), 2);
        assert.equal(unpreferred[0].combo.formatIds[0], FORUM);
        fresh();
        const preferred = pickCombinationBatch(onlyFormats([RANK, FORUM], {
            favoriteFormatIds: [RANK], favoriteFormatMultipliers: { [RANK]: 3 },
        }), 'batch-favorite-three', target(), 2);
        assert.equal(preferred[0].combo.formatIds[0], RANK, 'A declared x3 favorite changes the real batch selector boundary');
        assert.equal(preferred[1].combo.formatIds[0], FORUM, 'Favorite cannot defeat batch exact exclusion');
        groupCount += 1;

        fixedRoll = 0.4;
        for (const [ifRoute, expectedFormat] of [[false, RANK], [true, '5.3.1']]) {
            fresh();
            const chatFormat = PRESENTATION_FORMATS.find(item => item.id === CHAT);
            storage.setLastCombo({ themes: [], themeIds: [], themeGroups: [], formats: [chatFormat],
                formatIds: [CHAT], formatGroups: [chatFormat.group], samplingMode: 'classic' });
            storage.commitPendingCombo('batch-group-fixture');
            const routeSettings = onlyFormats([RANK, '5.3.1'], { samplingMode: 'classic',
                blacklistedThemeIds: THEMATIC_CATEGORIES.filter(item =>
                    item.tags?.some(tag => String(tag).trim().toLowerCase() === 'if') !== ifRoute).map(item => item.id),
            });
            const planned = pickCombinationBatch(routeSettings, `batch-group-${ifRoute}`, target(), 2);
            assert.equal(planned.length, 2);
            assert.equal(planned[0].combo.formatIds[0], expectedFormat, 'Only explicitly selected IF themes inherit format group debt');
            assert.equal(new Set(planned.flatMap(face => face.combo.formatIds)).size, 2);
            for (const face of planned) assert.ok(face.combo.themes.every(item =>
                item.tags?.some(tag => String(tag).trim().toLowerCase() === 'if') === ifRoute));
        }
        groupCount += 1;
    } finally {
        Object.defineProperty(globalThis, 'crypto', { configurable: true, writable: true, value: previousCrypto });
    }

    // No real API, body cache, full-chat scan or browser rendering is invoked here.
    assert.equal(networkCalls, 0);
    assert.equal(storage.getComboHistory(20).length, 1, 'Only the explicitly committed group fixture entered history');
    assert.doesNotMatch(pending().identity.settingsKey, /"mes"\s*:|final-body-hash/);
    console.log(`multifaceFoundation: ${groupCount} groups passed using production picker/storage`);
} finally {
    for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
    }
}
