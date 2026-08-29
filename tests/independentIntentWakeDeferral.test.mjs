import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/injector.js', import.meta.url), 'utf8');

function namedFunctionSource(name) {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `${name} must exist`);
    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        else if (source[index] === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(start, index + 1);
        }
    }
    throw new Error(`unterminated ${name}`);
}

const recordStart = source.indexOf('function recordIndependentGenerationIntent(');
const recordEnd = source.indexOf('\nfunction clearIndependentGenerationIntents', recordStart);
const recordSource = source.slice(recordStart, recordEnd);
assert.match(recordSource, /scheduleIndependentCoreRuntimeWake\(\)/, 'intent capture must schedule the heavy runtime after the interceptor returns');
assert.doesNotMatch(recordSource, /__rabbitMirrorEnsureDeferredCoreRuntime/, 'intent capture must not start the heavy module graph synchronously');

const tasks = [];
let loadCalls = 0;
const sandbox = {
    globalThis: {
        setTimeout(callback, delay) {
            tasks.push({ callback, delay });
            return tasks.length;
        },
        __rabbitMirrorEnsureDeferredCoreRuntime() {
            loadCalls += 1;
            return Promise.resolve(true);
        },
    },
};
vm.createContext(sandbox);
vm.runInContext(`let independentCoreRuntimeWakeTimer = 0;\n${namedFunctionSource('scheduleIndependentCoreRuntimeWake')}\nglobalThis.scheduleWake = scheduleIndependentCoreRuntimeWake;`, sandbox);

assert.equal(sandbox.globalThis.scheduleWake(), true);
assert.equal(sandbox.globalThis.scheduleWake(), false, 'multiple intents in the same host turn must share one deferred wake');
assert.equal(loadCalls, 0, 'the heavy imports must not start before the host receives control back');
assert.equal(tasks.length, 1);
assert.equal(tasks[0].delay, 0);
tasks[0].callback();
await Promise.resolve();
assert.equal(loadCalls, 1);

const destroyStart = source.indexOf('export function destroyIndependentGenerationIntentBridge');
const destroyEnd = source.indexOf('function loadPromptBuilder', destroyStart);
assert.ok(destroyStart >= 0 && destroyEnd > destroyStart, 'intent bridge destroy function must exist');
const destroySource = source.slice(destroyStart, destroyEnd);
assert.match(destroySource, /clearTimeout\?\.\(independentCoreRuntimeWakeTimer\)/, 'destroy must cancel a pending deferred runtime wake');
assert.match(destroySource, /independentCoreRuntimeWakeTimer\s*=\s*0/, 'destroy must clear the coalescing handle');

console.log('independentIntentWakeDeferral: lightweight intent stays synchronous; heavy runtime wake is next-task and coalesced');
