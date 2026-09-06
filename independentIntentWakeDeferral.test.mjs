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
assert.doesNotMatch(recordSource, /scheduleIndependentCoreRuntimeWake\(/, 'START intent capture must not load the heavy graph while the main reply is streaming');
assert.match(recordSource, /cancelIndependentCoreRuntimeWake\(\)/, 'a new START must cancel an older completion wake');
assert.doesNotMatch(recordSource, /__rabbitMirrorEnsureDeferredCoreRuntime/, 'intent capture must not start the heavy module graph synchronously');

const completedSource = namedFunctionSource('markIndependentGenerationIntentCompleted');
const terminalSource = namedFunctionSource('markIndependentGenerationIntentTerminal');
assert.match(completedSource, /scheduleIndependentCoreRuntimeWake\(/, 'an exact rendered completion must schedule the delayed runtime wake');
assert.match(terminalSource, /scheduleIndependentCoreRuntimeWake\(/, 'a terminal event must schedule the delayed runtime wake');

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
vm.runInContext(`let independentCoreRuntimeWakeTimer = 0;\nlet independentCoreRuntimeWakeRevision = 0;\nconst INDEPENDENT_CORE_RUNTIME_WAKE_DELAY_MS = 120;\n${namedFunctionSource('cancelIndependentCoreRuntimeWake')}\n${namedFunctionSource('scheduleIndependentCoreRuntimeWake')}\nglobalThis.scheduleWake = scheduleIndependentCoreRuntimeWake;\nglobalThis.cancelWake = cancelIndependentCoreRuntimeWake;`, sandbox);

assert.equal(sandbox.globalThis.scheduleWake(), true);
assert.equal(sandbox.globalThis.scheduleWake(), false, 'multiple intents in the same host turn must share one deferred wake');
assert.equal(loadCalls, 0, 'the heavy imports must not start before the host receives control back');
assert.equal(tasks.length, 1);
assert.ok(tasks[0].delay > 0, 'completion wake must leave a cancellation window for a newer START');
sandbox.globalThis.cancelWake();
tasks[0].callback();
await Promise.resolve();
assert.equal(loadCalls, 0, 'a newer START must be able to cancel a stale completion wake');
assert.equal(sandbox.globalThis.scheduleWake(), true);
const activeTask = tasks.at(-1);
assert.ok(activeTask.delay > 0);
activeTask.callback();
await Promise.resolve();
assert.equal(loadCalls, 1);

const destroyStart = source.indexOf('export function destroyIndependentGenerationIntentBridge');
const destroyEnd = source.indexOf('function loadPromptBuilder', destroyStart);
assert.ok(destroyStart >= 0 && destroyEnd > destroyStart, 'intent bridge destroy function must exist');
const destroySource = source.slice(destroyStart, destroyEnd);
assert.match(destroySource, /cancelIndependentCoreRuntimeWake\(\)/, 'destroy must cancel the pending delayed wake through the shared revocation path');

console.log('independentIntentWakeDeferral: lightweight intent stays synchronous; heavy runtime wake is next-task and coalesced');
