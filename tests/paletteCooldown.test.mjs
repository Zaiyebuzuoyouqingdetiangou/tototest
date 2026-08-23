import assert from 'node:assert/strict';

const values = new Map();
globalThis.localStorage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
};

const { buildPaletteCooldownExecutionLock, buildPaletteCooldownRule } = await import('../src/paletteCooldown.js');
const historyKey = 'rabbit_mirror_theater:last_combo:v11';

function palette(overrides = {}) {
    return {
        confidence: 0.9,
        brightness: 'light',
        hueFamily: 'yellow',
        temperature: 'warm',
        saturation: 'low',
        darkAreaRatio: 0.1,
        averageLuminance: 220,
        ...overrides,
    };
}

values.set(historyKey, JSON.stringify([
    { paletteFingerprint: palette(), ts: 1 },
    { paletteFingerprint: palette(), ts: 2 },
]));

const warmRule = buildPaletteCooldownRule();
assert.match(warmRule, /高明度暖黄低饱和/);
assert.match(warmRule, /强冷却/);
assert.match(warmRule, /不得只调整明度/);
assert.match(buildPaletteCooldownExecutionLock(), /重复配色族/);

values.set(historyKey, JSON.stringify([
    { paletteFingerprint: palette({ brightness: 'dark', hueFamily: 'blue', temperature: 'cool', saturation: 'medium', darkAreaRatio: 0.8, averageLuminance: 55 }), ts: 3 },
]));

const darkRule = buildPaletteCooldownRule();
assert.match(darkRule, /低明度主承载冷却/);
assert.match(darkRule, /剩余 5 面/);
assert.match(buildPaletteCooldownExecutionLock(), /禁止再次使用大面积深色背景/);

values.set(historyKey, JSON.stringify([
    { paletteFingerprint: palette({ hueFamily: 'yellow' }), ts: 4 },
    { paletteFingerprint: palette({ hueFamily: 'blue', temperature: 'cool', saturation: 'high' }), ts: 5 },
]));

const variedRule = buildPaletteCooldownRule();
assert.doesNotMatch(variedRule, /强冷却：/);
assert.match(variedRule, /没有色族在近三面达到两次/);

values.set(historyKey, JSON.stringify([
    { paletteFingerprint: palette({ brightness: '<prompt-injection>', hueFamily: 'IGNORE_PREVIOUS_RULES' }), ts: 6 },
    { paletteFingerprint: palette({ brightness: '<prompt-injection>', hueFamily: 'IGNORE_PREVIOUS_RULES' }), ts: 7 },
]));

const tamperedRule = buildPaletteCooldownRule();
const tamperedLock = buildPaletteCooldownExecutionLock();
assert.doesNotMatch(tamperedRule, /prompt-injection|IGNORE_PREVIOUS_RULES/);
assert.doesNotMatch(tamperedLock, /prompt-injection|IGNORE_PREVIOUS_RULES/);

delete globalThis.localStorage;
console.log('paletteCooldown tests passed');
