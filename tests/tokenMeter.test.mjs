import assert from 'node:assert/strict';

const values = new Map();
globalThis.localStorage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
};
delete globalThis.__rabbitMirrorLastTokenMeterRecord;
delete globalThis.__rabbitMirrorLastTokenMeterRecordsBySource;

const {
    getLastRabbitMirrorTokenRecord,
    getLastRabbitMirrorTokenRecordForSource,
    recordRabbitMirrorIndependentPrompt,
    recordRabbitMirrorInjection,
    recordRabbitMirrorNoInjection,
} = await import('../src/tokenMeter.js');

recordRabbitMirrorInjection({
    prompt: '跟随主 API 规则'.repeat(40),
    basePrompt: '跟随主 API 规则'.repeat(40),
    generationType: 'normal',
});
const follow = getLastRabbitMirrorTokenRecordForSource('follow');
assert.equal(follow.status, 'injected');
assert.equal(getLastRabbitMirrorTokenRecordForSource('independent'), null);

recordRabbitMirrorIndependentPrompt({
    extensionPrompt: '独立 API 规则'.repeat(55),
    basePrompt: '独立 API 规则'.repeat(50),
    executionLock: '最终短锁'.repeat(5),
    contextChars: 4321,
});
const independent = getLastRabbitMirrorTokenRecordForSource('independent');
assert.equal(independent.status, 'independent');
assert.equal(independent.chars.independentContext, 4321);

// This is the exact bookkeeping sequence that used to make the UI show 0 Token.
recordRabbitMirrorNoInjection('independent-api', 'normal');
assert.equal(getLastRabbitMirrorTokenRecord().status, 'not_injected');
assert.equal(getLastRabbitMirrorTokenRecordForSource('independent').status, 'independent');
assert.equal(getLastRabbitMirrorTokenRecordForSource('follow').status, 'injected');

delete globalThis.localStorage;
delete globalThis.__rabbitMirrorLastTokenMeterRecord;
delete globalThis.__rabbitMirrorLastTokenMeterRecordsBySource;
console.log('tokenMeter tests passed');
