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
globalThis.api={factor:recentDiversityFactor,formatFamilyKey,weightedSample};`, sandbox);
const { factor, formatFamilyKey, weightedSample } = sandbox.globalThis.api;

assert.equal(factor(0, 0.35), 1, 'no-history base weight must remain byte-for-byte neutral');
assert.equal(factor(1, 0.35), 0.35, 'the first recent hit preserves the old group penalty');
assert.ok(factor(3, 0.35) < factor(2, 0.35), 'repeated recent hits must accumulate bounded soft debt');
assert.ok(factor(20, 0.35) >= 0.12, 'diversity debt must remain soft and never starve a candidate');
assert.equal(formatFamilyKey('6.2.7'), '6.2');

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

assert.match(source, /favoriteMultiplierFor\(/, 'favorite multipliers must remain in the weighted path');
assert.match(source, /filterRandomFormatPool|filterRandomThemePool/, 'blacklist-filtered pools remain authoritative');

console.log('pickerDiversity: cumulative soft group/family cooldown keeps base, favorites and pool authority intact');
