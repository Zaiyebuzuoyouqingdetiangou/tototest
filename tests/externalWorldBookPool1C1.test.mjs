import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const values = new Map();
globalThis.localStorage = {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
};
globalThis.sessionStorage = globalThis.localStorage;
globalThis.dispatchEvent = () => true;
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };

let seed = 1;
let randomCalls = 0;
const rng = () => {
    randomCalls += 1;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
};
Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    writable: true,
    value: { getRandomValues(array) { for (let i = 0; i < array.length; i += 1) array[i] = Math.floor(rng() * 4294967296); return array; } },
});
Math.random = rng;

const COHORT = '?rmv=1.5.18-audit1c2';
const { defaultSettings } = await import('../src/settings.js');
const picker = await import('../src/picker.js');
const pool = await import(`../src/externalWorldBook/externalPool.js${COHORT}`);
const { EXTERNAL_WORLD_BOOK_CLASSIFICATION } = await import('../src/externalWorldBook/classifier.js');

const THEME = EXTERNAL_WORLD_BOOK_CLASSIFICATION.THEME;
const FORMAT = EXTERNAL_WORLD_BOOK_CLASSIFICATION.FORMAT;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const batchContext = index => ({ batchIdentity: { mesid: 4000 + index, swipeId: 0, sourceHash: `ext-fixture-${index}` } });
const isExternal = id => String(id || '').startsWith('ext:');
const libraryOf = id => String(id || '').split(':')[1] || '';

function libraryEntries(libraryId, themeCount, formatCount, overrides = {}) {
    const entries = [];
    for (let i = 0; i < themeCount; i += 1) {
        entries.push({
            externalId: `ext:${libraryId}:theme:h${i}:s${i}`,
            libraryId,
            classification: THEME,
            enabled: overrides.entryEnabled !== false,
            userConfirmed: overrides.userConfirmed !== false,
        });
    }
    for (let i = 0; i < formatCount; i += 1) {
        entries.push({
            externalId: `ext:${libraryId}:format:h${i}:s${i}`,
            libraryId,
            classification: FORMAT,
            enabled: overrides.entryEnabled !== false,
            userConfirmed: overrides.userConfirmed !== false,
        });
    }
    return entries;
}

function installLibraries(specs) {
    const libraries = [];
    const entriesByLibrary = new Map();
    for (const spec of specs) {
        const [libraryId, themeCount, formatCount, enabled = true] = spec;
        libraries.push({ libraryId, enabled });
        entriesByLibrary.set(libraryId, libraryEntries(libraryId, themeCount, formatCount));
    }
    return pool.setExternalPoolSnapshot(libraries, entriesByLibrary);
}

const externalSettings = (over = {}) => ({
    ...structuredClone(defaultSettings),
    mode: 'all',
    themesMin: 1,
    themesMax: 1,
    formatsMin: 1,
    formatsMax: 1,
    externalWorldBookRandomEnabled: true,
    externalWorldBookMixMode: 'balanced',
    ...over,
});

function resetRandom(nextSeed = 4242) {
    seed = nextSeed >>> 0;
    randomCalls = 0;
}

function sample(faceCount, rounds, over = {}, scopePrefix = 's', { stateful = false } = {}) {
    resetRandom(4242);
    if (!stateful) values.clear();
    const stats = {
        rounds: 0,
        faces: 0,
        roundsWithExternal: 0,
        theme: { slots: 0, external: 0, byLibrary: new Map() },
        format: { slots: 0, external: 0, byLibrary: new Map() },
    };
    for (let i = 0; i < rounds; i += 1) {
        if (!stateful) values.clear();
        const settings = externalSettings(over);
        const batch = faceCount > 1
            ? picker.pickCombinationBatch(settings, `${scopePrefix}-${faceCount}-${i}`, batchContext(i * 13 + faceCount), faceCount)
            : [picker.pickCombination(settings, `${scopePrefix}-${i}`, null)];
        if (!Array.isArray(batch)) continue;
        stats.rounds += 1;
        stats.faces += batch.length;
        let anyExternal = false;
        for (const face of batch) {
            for (const [kind, ids] of [
                ['theme', face?.combo?.themeIds || []],
                ['format', face?.combo?.formatIds || []],
            ]) {
                for (const id of ids) {
                    stats[kind].slots += 1;
                    if (!isExternal(id)) continue;
                    stats[kind].external += 1;
                    anyExternal = true;
                    const libraryId = libraryOf(id);
                    stats[kind].byLibrary.set(libraryId, (stats[kind].byLibrary.get(libraryId) || 0) + 1);
                }
            }
        }
        if (anyExternal) stats.roundsWithExternal += 1;
    }
    stats.randomCalls = randomCalls;
    return stats;
}

function ratio(stats, kind) {
    return stats[kind].slots ? stats[kind].external / stats[kind].slots : 0;
}

function captureSequence(faceCount, rounds, settings, prefix) {
    resetRandom(20260905);
    values.clear();
    const sequence = [];
    for (let i = 0; i < rounds; i += 1) {
        values.clear();
        const batch = faceCount > 1
            ? picker.pickCombinationBatch(settings, `${prefix}-${faceCount}-${i}`, batchContext(100000 + i * 11 + faceCount), faceCount)
            : [picker.pickCombination(settings, `${prefix}-${i}`, null)];
        sequence.push(batch.map(face => ({ themeIds: [...(face?.combo?.themeIds || [])], formatIds: [...(face?.combo?.formatIds || [])] })));
    }
    return { sequence, randomCalls };
}

const BASELINE_1515_PICKER = Object.freeze({
    1: { sha256: '7a9a91a06925636873fc10c2899cfd5c2ab24203ad23273bbc1df8a789c2649d', randomCalls: 1280 },
    2: { sha256: '66b72191c4c6f8762c8fa3c00a1b0da24eaf7a536f2847728d8fdc5db1f63772', randomCalls: 2560 },
    3: { sha256: '7f7a45fd926f9565a67f392e0175b34d6c4a37258eb2238fec83287f0e118afe', randomCalls: 3840 },
    4: { sha256: 'c71ee697f82d74f6880ceafef3b48137e953f5f77cea63288ed089356e6b7952', randomCalls: 5120 },
    5: { sha256: '3c636e139883f4aa8c87b8c7be1fab5a9bbb5961008bc0734b66db4202ff4af9', randomCalls: 6400 },
});

function sequenceDigest(sequence) {
    return createHash('sha256').update(JSON.stringify(sequence)).digest('hex');
}

test('hidden-off picker output and RNG consumption stay byte-for-byte locked to the uploaded 1.5.15 baseline', () => {
    installLibraries([['BASELINE_LOCK', 250, 250]]);
    const settings = { ...structuredClone(defaultSettings), mode: 'all', themesMin: 1, themesMax: 1, formatsMin: 1, formatsMax: 1 };
    for (const faces of [1, 2, 3, 4, 5]) {
        resetRandom(20260905);
        values.clear();
        const sequence = [];
        for (let i = 0; i < 80; i += 1) {
            values.clear();
            const batch = faces > 1
                ? picker.pickCombinationBatch(settings, `baseline-lock-${faces}-${i}`, batchContext(i * 17 + faces), faces)
                : [picker.pickCombination(settings, `baseline-lock-${faces}-${i}`, null)];
            sequence.push(batch.map(face => ({ themeIds: [...(face?.combo?.themeIds || [])], formatIds: [...(face?.combo?.formatIds || [])] })));
        }
        assert.equal(sequenceDigest(sequence), BASELINE_1515_PICKER[faces].sha256, `${faces}面：ID序列必须与1.5.15基线完全一致`);
        assert.equal(randomCalls, BASELINE_1515_PICKER[faces].randomCalls, `${faces}面：随机调用次数必须与1.5.15基线完全一致`);
    }
});

test('1C-1 defaults are hidden-off and preserve the builtin path including random calls for 1-5 faces', () => {
    installLibraries([['OFF_LIB', 100, 100]]);
    assert.equal(defaultSettings.externalWorldBookRandomEnabled, false);
    assert.equal(defaultSettings.externalWorldBookMixMode, 'builtin-only');
    for (const faces of [1, 2, 3, 4, 5]) {
        const offSettings = { ...structuredClone(defaultSettings), mode: 'all' };
        const withSnapshot = captureSequence(faces, 80, offSettings, `off-snapshot-${faces}`);
        pool.clearExternalPoolSnapshot();
        const withoutSnapshot = captureSequence(faces, 80, offSettings, `off-empty-${faces}`);
        assert.deepEqual(withSnapshot.sequence, withoutSnapshot.sequence, `${faces} 面：开关关闭时快照存在不得改变ID序列`);
        assert.equal(withSnapshot.randomCalls, withoutSnapshot.randomCalls, `${faces} 面：开关关闭时不得多消耗随机数`);
        installLibraries([['OFF_LIB', 100, 100]]);
    }
});

test('builtin-only mode blocks external entries even when the hidden 1C-1 switch is true', () => {
    installLibraries([['MODE_LIB', 100, 100]]);
    const stats = sample(1, 1200, { externalWorldBookMixMode: 'builtin-only' }, 'mode');
    assert.equal(stats.theme.external + stats.format.external, 0);
});

test('mix modes increase external slot share monotonically for both theme and format', () => {
    installLibraries([['MIX_LIB', 100, 100]]);
    for (const kind of ['theme', 'format']) {
        const ratios = ['builtin-only', 'builtin-preferred', 'balanced', 'external-preferred', 'external-only']
            .map(mode => ratio(sample(1, 1800, { externalWorldBookMixMode: mode }, `mix-${kind}-${mode}`), kind));
        for (let i = 1; i < ratios.length; i += 1) assert.ok(ratios[i] >= ratios[i - 1] - 0.015, `${kind} 档位必须单调`);
        assert.equal(ratios[0], 0);
        assert.ok(ratios[4] > 0.95, `${kind} external-only应接近全部外部`);
    }
});

test('sqrt(n) weighting splits a 100x size gap into about 10x library mass and 10x per-entry mass', () => {
    installLibraries([['SMALL', 10, 10], ['BIG', 1000, 1000]]);
    const stats = sample(1, 7000, {}, 'sqrt');
    for (const kind of ['theme', 'format']) {
        const small = stats[kind].byLibrary.get('SMALL') || 0;
        const big = stats[kind].byLibrary.get('BIG') || 0;
        const libraryRatio = big / small;
        const perEntryRatio = (small / 10) / (big / 1000);
        assert.ok(libraryRatio > 6 && libraryRatio < 16, `${kind} 库总命中比应约1:10，实际1:${libraryRatio.toFixed(1)}`);
        assert.ok(perEntryRatio > 6 && perEntryRatio < 16, `${kind} 单entry比应约10:1，实际${perEntryRatio.toFixed(1)}:1`);
    }
});

test('theme and format library weights use their own eligible counts instead of total book size', () => {
    installLibraries([['CROSS_A', 10, 1000], ['CROSS_B', 1000, 10]]);
    const stats = sample(1, 7000, {}, 'cross');
    const themeA = stats.theme.byLibrary.get('CROSS_A') || 0;
    const themeB = stats.theme.byLibrary.get('CROSS_B') || 0;
    const formatA = stats.format.byLibrary.get('CROSS_A') || 0;
    const formatB = stats.format.byLibrary.get('CROSS_B') || 0;
    assert.ok(themeB / themeA > 6 && themeB / themeA < 16, 'theme应按10 vs 1000加权');
    assert.ok(formatA / formatB > 6 && formatA / formatB < 16, 'format应按1000 vs 10反向加权');
});

test('builtin/external first-layer share is independent of external library size and count', () => {
    const scenarios = [
        [['A', 10, 10]],
        [['B', 1000, 1000]],
        Array.from({ length: 10 }, (_, i) => [`C${i}`, 250, 250]),
    ];
    for (const kind of ['theme', 'format']) {
        const shares = [];
        for (const specs of scenarios) {
            installLibraries(specs);
            shares.push(ratio(sample(1, 3500, {}, `share-${kind}`), kind));
        }
        assert.ok(Math.max(...shares) - Math.min(...shares) < 0.035, `${kind} 第一层占比不得随库规模漂移`);
    }
});

test('equally sized external libraries share conditional external slots evenly', () => {
    installLibraries([['E1', 100, 100], ['E2', 100, 100], ['E3', 100, 100]]);
    const stats = sample(1, 5000, {}, 'even');
    for (const kind of ['theme', 'format']) {
        for (const key of ['E1', 'E2', 'E3']) {
            const share = (stats[kind].byLibrary.get(key) || 0) / stats[kind].external;
            assert.ok(share > 0.27 && share < 0.40, `${kind}/${key} 应接近1/3，实际${(share * 100).toFixed(1)}%`);
        }
    }
});

test('1B eligibility filters disabled, unconfirmed and non-theme/format entries before the pool snapshot', () => {
    const libraries = [
        { libraryId: 'LIVE', enabled: true },
        { libraryId: 'DEAD_LIB', enabled: false },
    ];
    const entriesByLibrary = new Map([
        ['LIVE', [
            { externalId: 'ext:LIVE:theme:ok', classification: THEME, enabled: true, userConfirmed: true },
            { externalId: 'ext:LIVE:format:ok', classification: FORMAT, enabled: true, userConfirmed: true },
            { externalId: 'ext:LIVE:theme:disabled', classification: THEME, enabled: false, userConfirmed: true },
            { externalId: 'ext:LIVE:theme:unconfirmed', classification: THEME, enabled: true, userConfirmed: false },
            { externalId: 'ext:LIVE:entry:mixed', classification: 'mixed', enabled: true, userConfirmed: true },
            { externalId: 'ext:LIVE:aux:a', classification: 'auxiliary', enabled: true, userConfirmed: true },
            { externalId: 'ext:LIVE:entry:ignore', classification: 'ignore', enabled: true, userConfirmed: true },
            { externalId: 'ext:LIVE:entry:pending', classification: 'pending', enabled: true, userConfirmed: false },
        ]],
        ['DEAD_LIB', libraryEntries('DEAD_LIB', 20, 20)],
    ]);
    const snapshot = pool.setExternalPoolSnapshot(libraries, entriesByLibrary);
    assert.equal(snapshot.themeCount, 1);
    assert.equal(snapshot.formatCount, 1);
    const serialized = JSON.stringify(snapshot);
    assert.match(serialized, /theme:ok/);
    assert.match(serialized, /format:ok/);
    for (const forbidden of ['disabled', 'unconfirmed', 'mixed', 'aux:a', 'ignore', 'pending', 'DEAD_LIB']) assert.doesNotMatch(serialized, new RegExp(forbidden));
});

test('single and 2-5 face batches share the same source-selection layer and preserve exact de-duplication', () => {
    installLibraries([['MF_SMALL', 20, 20], ['MF_BIG', 2000, 2000]]);
    const themeShares = [];
    const formatShares = [];
    for (const faceCount of [1, 2, 3, 4, 5]) {
        const stats = sample(faceCount, 500, {}, `faces-${faceCount}`);
        assert.equal(stats.faces / stats.rounds, faceCount, `${faceCount} 面必须真实产出${faceCount}面`);
        assert.ok(stats.theme.external > 0 && stats.format.external > 0, `${faceCount} 面 theme/format 都应能抽 external ID`);
        themeShares.push(ratio(stats, 'theme'));
        formatShares.push(ratio(stats, 'format'));
    }
    assert.ok(Math.max(...themeShares) - Math.min(...themeShares) < 0.05, 'theme slot external占比不应随面数漂移');
    assert.ok(Math.max(...formatShares) - Math.min(...formatShares) < 0.05, 'format slot external占比不应随面数漂移');

    installLibraries([['DUP', 40, 40]]);
    for (const faceCount of [2, 3, 4, 5]) {
        resetRandom(909);
        for (let i = 0; i < 80; i += 1) {
            values.clear();
            const batch = picker.pickCombinationBatch(externalSettings(), `dup-${faceCount}-${i}`, batchContext(200000 + i * 17 + faceCount), faceCount);
            const themes = batch.flatMap(face => face?.combo?.themeIds || []);
            const formats = batch.flatMap(face => face?.combo?.formatIds || []);
            assert.equal(new Set(themes).size, themes.length, `${faceCount} 面主题 exact 不得重复`);
            assert.equal(new Set(formats).size, formats.length, `${faceCount} 面形式 exact 不得重复`);
        }
    }
});

test('stateful consecutive generations keep external exact cooldown history meaningful', () => {
    installLibraries([['STATE', 24, 24]]);
    resetRandom(5151);
    values.clear();
    let previousTheme = '';
    let previousFormat = '';
    let immediateThemeRepeats = 0;
    let immediateFormatRepeats = 0;
    for (let i = 0; i < 40; i += 1) {
        const result = picker.pickCombination(externalSettings({ externalWorldBookMixMode: 'external-only' }), `state-${i}`, null);
        const theme = result?.combo?.themeIds?.[0] || '';
        const format = result?.combo?.formatIds?.[0] || '';
        if (theme && theme === previousTheme) immediateThemeRepeats += 1;
        if (format && format === previousFormat) immediateFormatRepeats += 1;
        previousTheme = theme;
        previousFormat = format;
    }
    assert.equal(immediateThemeRepeats, 0, '有足够候选时外部主题不应立即重复');
    assert.equal(immediateFormatRepeats, 0, '有足够候选时外部形式不应立即重复');
});

test('forceVisualScenery keeps the builtin visual format lock while external themes may still participate', () => {
    installLibraries([['VISUAL', 100, 100]]);
    const settings = externalSettings({ forceVisualScenery: true, externalWorldBookMixMode: 'external-only' });
    resetRandom(8181);
    values.clear();
    let externalThemeSeen = false;
    for (let i = 0; i < 100; i += 1) {
        values.clear();
        const combo = picker.pickCombination(settings, `visual-${i}`, null)?.combo;
        assert.deepEqual(combo?.formatIds, ['10.2.2']);
        assert.equal((combo?.formatIds || []).some(isExternal), false);
        if ((combo?.themeIds || []).some(isExternal)) externalThemeSeen = true;
    }
    assert.equal(externalThemeSeen, true, '动态视觉锁只锁format，不应阻断external theme');

    // Baseline multiface semantics intentionally collapse forced visual scenery to the priority single path.
    // 1C-1 must not change that business rule, and the one returned format must remain the builtin lock.
    values.clear();
    const forcedBatch = picker.pickCombinationBatch(settings, 'visual-multiface-baseline', batchContext(818199), 5);
    assert.equal(forcedBatch.length, 1, '强制动态视觉的既有多面优先语义不得因external pool改变');
    assert.deepEqual(forcedBatch[0]?.combo?.formatIds, ['10.2.2']);
    assert.equal((forcedBatch[0]?.combo?.formatIds || []).some(isExternal), false);
});

test('external-only pool shortage preserves existing multiface degradation without looping or builtin fallback', () => {
    installLibraries([['TINY', 2, 2]]);
    const settings = externalSettings({ externalWorldBookMixMode: 'external-only' });
    resetRandom(9191);
    values.clear();
    const batch = picker.pickCombinationBatch(settings, 'tiny-5', batchContext(9999), 5);
    assert.equal(batch.length, 2, '既有batch语义在候选不足时只返回能安全规划的不同面');
    for (const face of batch) {
        assert.ok((face?.combo?.themeIds || []).every(isExternal));
        assert.ok((face?.combo?.formatIds || []).every(isExternal));
    }
});

test('external pool items and snapshots remain ID-only with no prompt-bearing raw content', () => {
    const item = pool.externalPoolItem('ext:LIB:theme:h0:s0', 'theme');
    assert.equal(item.id, 'ext:LIB:theme:h0:s0');
    for (const field of ['title', 'summary', 'rawContent', 'content', 'keywords', 'raw']) assert.equal(field in item, false, `external item不得携带${field}`);
    assert.equal(item.group, '');
    const snapshot = installLibraries([['LIGHT', 3, 3]]);
    const serialized = JSON.stringify(snapshot);
    for (const field of ['rawContent', 'summary', 'localTitle', 'content']) assert.equal(serialized.includes(field), false, `快照不得包含${field}`);
});

test('visual defaults stay unchanged and builtin prompt rendering remains external-free without new entropy', async () => {
    assert.equal(defaultSettings.enhancedVisualDrawing, false);
    assert.equal(defaultSettings.forceVisualScenery, false);
    const promptSource = fs.readFileSync(path.join(root, 'src', 'promptBuilder.js'), 'utf8');
    assert.doesNotMatch(promptSource, /^import .*externalWorldBook\/(?:store|hostReader|importWizard)/m);
    assert.doesNotMatch(promptSource, /\bindexedDB\b|\bfetch\s*\(/);
    assert.match(promptSource, /settings\?\.enhancedVisualDrawing === true/);
    const { planRabbitMirrorPromptDetails, renderRabbitMirrorPromptPlan } = await import('../src/promptBuilder.js');
    for (const type of ['normal', 'independent']) {
        const results = [];
        for (const enabled of [false, true]) {
            values.clear(); resetRandom(13579);
            const settings = externalSettings({ enabled: true, autoRabbitMirrorInjection: true,
                externalWorldBookRandomEnabled: enabled, externalWorldBookMixMode: 'builtin-only' });
            const plan = planRabbitMirrorPromptDetails(settings, type, null, `builtin-prompt-${type}-${enabled}`);
            const entropy = randomCalls;
            assert.deepEqual(plan.selectedExternalIds, []);
            const forbiddenMap = new Map();
            forbiddenMap.has = forbiddenMap.get = () => { throw new Error('builtin prompt must not read external records'); };
            const details = renderRabbitMirrorPromptPlan(plan, forbiddenMap);
            assert.equal(randomCalls, entropy);
            assert.doesNotMatch(details.prompt, /外部母本仅为低优先级创作参考/);
            results.push({ prompt: details.prompt, executionLock: details.executionLock, entropy });
        }
        assert.deepEqual(results[1], results[0], 'all-builtin ON/OFF preserves bytes and draw sequence');
    }
});

test('all production imports of externalPool use one cohort-qualified specifier', () => {
    const srcRoot = path.join(root, 'src');
    const imports = [];
    const walk = dir => {
        for (const name of fs.readdirSync(dir)) {
            const full = path.join(dir, name);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) walk(full);
            else if (/\.m?js$/.test(name)) {
                const source = fs.readFileSync(full, 'utf8');
                for (const match of source.matchAll(/from\s+['\"]([^'\"]*externalPool\.js(?:\?rmv=[^'\"]+)?)['\"]/g)) imports.push({ file: path.relative(root, full), specifier: match[1] });
            }
        }
    };
    walk(srcRoot);
    assert.ok(imports.length >= 2, 'picker和store都应复用同一个externalPool模块');
    const resolved = imports.map(entry => {
        assert.match(entry.specifier, /externalPool\.js\?rmv=1\.5\.18-audit1c2$/, `${entry.file} 必须使用相同cohort`);
        return new URL(entry.specifier, pathToFileURL(path.join(root, entry.file))).href;
    });
    assert.equal(new Set(resolved).size, 1, '所有生产引用解析后必须落到同一个cohort-qualified模块实例');
});

console.log('externalWorldBookPool1C1: formal regression suite passed');
