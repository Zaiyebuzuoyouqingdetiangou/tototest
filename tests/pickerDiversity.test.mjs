import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(ROOT, 'src/picker.js'), 'utf8');
const start = source.indexOf('function compactUnique(values)');
const end = source.indexOf('function getCurrentTurnUserMessage', start);
assert.ok(start >= 0 && end > start, 'picker weighting helper block must exist');

const sandbox = {
    randomUnit: () => 0.1,
    Math,
    Number,
    Object,
    Set,
    String,
    Map,
    globalThis: {},
};
vm.createContext(sandbox);
vm.runInContext(`${source.slice(start, end)}
globalThis.api={factor:recentDiversityFactor,formatFamilyKey,themeFamilyKey,weightedSample,weightedThemeSample,themeFamilyBaseWeight,balancedFamilyItemFactor};`, sandbox);
const { factor, formatFamilyKey, themeFamilyKey, weightedSample, weightedThemeSample, themeFamilyBaseWeight, balancedFamilyItemFactor } = sandbox.globalThis.api;

assert.equal(factor(0, 0.35), 1, 'the recent-history debt itself must be neutral when there is no history');
assert.equal(factor(1, 0.35), 0.35, 'the first recent hit preserves the old group penalty');
assert.ok(factor(3, 0.35) < factor(2, 0.35), 'repeated recent hits must accumulate bounded soft debt');
assert.ok(factor(20, 0.35) >= 0.12, 'diversity debt must remain soft and never starve a candidate');
assert.equal(formatFamilyKey('6.2.7'), '6.2');
assert.equal(themeFamilyKey('G.7.19'), 'G.7');
assert.equal(themeFamilyBaseWeight(25), Math.pow(25, 0.6), 'the authorised no-history theme rebalance must use the declared 0.6 family exponent');
assert.equal(balancedFamilyItemFactor(16), 1 / Math.pow(16, 0.55), 'the authorised no-history format rebalance must reduce duplicate child tickets');

const pool = [
    { id: '6.2.1', group: '6' },
    { id: '8.1.1', group: '8' },
];
const result = weightedSample(
    pool,
    1,
    [],
    ['6'],
    true,
    [],
    [],
    {},
    {},
    { 6: 3 },
    { '6.2': 1 },
);
assert.equal(result.selected[0]?.id, '8.1.1', 'a repeatedly seen parent/child family should yield to a fresh family at this deterministic roll');

const immediateFormatResult = weightedSample(
    [
        { id: '6.2.1', group: '6' },
        { id: '6.2.3', group: '6' },
        { id: '8.1.1', group: '8' },
    ],
    1,
    [],
    [],
    true,
    [],
    [],
    {},
    {},
    {},
    {},
    ['6.2'],
);
assert.equal(immediateFormatResult.selected[0]?.id, '8.1.1', 'the immediately previous format family must be hard-avoided when another family exists');

const twoFormatResult = weightedSample(
    [
        { id: '6.2.1', group: '6' },
        { id: '6.2.3', group: '6' },
        { id: '8.1.1', group: '8' },
    ],
    2,
);
assert.equal(new Set(twoFormatResult.selected.map(formatFamilyKey)).size, 2, 'two formats in one round should use different families when possible');

const themeResult = weightedThemeSample(
    [
        { id: 'E.6', group: 'E' },
        { id: 'B.7.4', group: 'B' },
    ],
    1,
    ['E.6'],
    ['E'],
    true,
);
assert.equal(themeResult[0]?.id, 'B.7.4', 'formal history must hard-exclude the exact recent theme when the pool has room');

const onlyFamilyFallback = weightedThemeSample(
    [
        { id: 'G.7.18', group: 'G' },
        { id: 'G.7.19', group: 'G' },
    ],
    1,
    [],
    [],
    true,
    [],
    [],
    {},
    {},
    {},
    ['G.7'],
);
assert.equal(onlyFamilyFallback.length, 1, 'family hard-avoidance must safely fall back when no alternative family exists');

const partialFormatFallback = weightedSample(
    [
        { id: '1.1.1', group: '1' },
        { id: '2.1.1', group: '2' },
        { id: '3.1.1', group: '3' },
    ],
    2,
    [],
    [],
    true,
    [],
    [],
    {},
    {},
    {},
    {},
    ['1.1', '2.1'],
);
assert.equal(partialFormatFallback.selected[0]?.id, '3.1.1', 'a single fresh format family must be consumed before an older family is reopened to fill the round');
assert.equal(new Set(partialFormatFallback.selected.map(formatFamilyKey)).size, 2, 'format fallback must still fill the requested count from distinct families when possible');

const partialThemeFallback = weightedThemeSample(
    [
        { id: 'A.1.1', group: 'A' },
        { id: 'B.1.1', group: 'B' },
        { id: 'C.1.1', group: 'C' },
    ],
    2,
    [],
    [],
    true,
    [],
    [],
    {},
    {},
    {},
    ['A.1', 'B.1'],
);
assert.equal(partialThemeFallback[0]?.id, 'C.1.1', 'a single fresh theme family must be consumed before an older family is reopened to fill the round');
assert.equal(new Set(partialThemeFallback.map(themeFamilyKey)).size, 2, 'theme fallback must still fill the requested count from distinct families');

assert.match(source, /favoriteMultiplierFor\(/, 'favorite multipliers must remain in the weighted path');
assert.match(source, /filterRandomFormatPool|filterRandomThemePool/, 'blacklist-filtered pools remain authoritative');

console.log('pickerDiversity: authorised family rebalance, exact history and maximal immediate-family avoidance preserve safe fallback and pool authority');
