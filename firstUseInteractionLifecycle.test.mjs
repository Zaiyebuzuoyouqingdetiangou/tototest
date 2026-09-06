import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/outputSanitizer.js', import.meta.url), 'utf8');
const start = source.indexOf('export function armRabbitMirrorFirstUseInteraction(');
const end = source.indexOf('\nfunction getRenderedRabbitMirrorInteractionRoots(', start);
assert.ok(start > 0 && end > start);
const frames = [], timers = [], activated = [], budgets = [];
const ready = new WeakSet();
const sandbox = {
    firstUseInteractionActivatedRoots: ready,
    firstUseInteractionBindings: new WeakMap(),
    requestAnimationFrame: callback => frames.push(callback),
    setTimeout: callback => timers.push(callback),
    maintenanceRepairRootBudget(root) { budgets.push(root); return { ok: root.withinBudget }; },
    activateRabbitMirrorInteractionRescue(root) { activated.push(root); ready.add(root); },
    rehydrateRabbitMirrorMaintenanceRepairs(root) { root.rehydrated += 1; },
    console,
};
vm.createContext(sandbox);
vm.runInContext(source.slice(start, end).replace('export function', 'function') + '\nglobalThis.arm=armRabbitMirrorFirstUseInteraction;', sandbox);

function fixture({ open = false, withinBudget = true } = {}) {
    const handlers = new Map();
    const summary = { contains: target => target === summary };
    const control = { nodeType: 1 };
    const root = {
        isConnected: true, open, withinBudget, rehydrated: 0,
        matches: selector => selector === 'details',
        querySelector: selector => selector === ':scope > summary' ? summary : null,
        addEventListener(type, callback) {
            if (!handlers.has(type)) handlers.set(type, new Set());
            handlers.get(type).add(callback);
        },
        removeEventListener(type, callback) { handlers.get(type)?.delete(callback); },
        emit(type, target = control, key = '') {
            for (const callback of [...(handlers.get(type) || [])]) callback({ type, target, key });
        },
    };
    summary.nodeType = 1;
    return { root, summary, control, handlers };
}
const flush = () => {
    frames.splice(0).forEach(callback => callback());
    timers.splice(0).forEach(callback => callback());
};

const untouched = fixture();
for (let i = 0; i < 5; i++) sandbox.arm(untouched.root);
assert.equal(frames.length, 0);
assert.equal(budgets.length, 0, 'closed history must not walk the safety budget');
assert.equal(activated.length, 0);
assert.equal(untouched.handlers.get('click').size, 1, 'repeated tool refresh must not duplicate bindings');
untouched.root.open = true;
untouched.root.emit('toggle');
untouched.root.emit('toggle');
assert.equal(frames.length, 1, 'first-open schedule is coalesced per face');
untouched.root.open = false;
flush();
assert.equal(activated.length, 0, 'closing before paint cancels activation');
untouched.root.open = true;
untouched.root.emit('toggle');
untouched.root.emit('click', untouched.summary);
assert.equal(activated.length, 0, 'outer title/tool row does not synchronously activate content');
untouched.root.emit('click');
assert.deepEqual(activated, [untouched.root], 'fast internal click activates only its face');
flush();
assert.equal(activated.length, 1, 'queued first-open callback must not run twice after an early tap');
assert.equal(untouched.root.rehydrated, 1);
for (let i = 0; i < 3; i++) { untouched.root.emit('toggle'); untouched.root.emit('click'); sandbox.arm(untouched.root); flush(); }
assert.equal(activated.length, 1, 'subsequent toggles/taps/tool refreshes do not rescan');

const large = fixture({ open: true, withinBudget: false });
sandbox.arm(large.root);
flush();
const budgetCount = budgets.length;
for (let i = 0; i < 3; i++) { large.root.emit('toggle'); large.root.emit('click'); sandbox.arm(large.root); flush(); }
assert.equal(budgets.length, budgetCount, 'over-budget face is rejected once rather than rescanned on every tap');
assert.equal(activated.length, 1, 'over-budget face must not enter the heavy runtime');

const keyboard = fixture({ open: true });
sandbox.arm(keyboard.root);
keyboard.root.emit('keydown', keyboard.control, ' ');
flush();
assert.equal(activated.length, 2, 'first keyboard activation is also prepared before its default action');
assert.equal(keyboard.root.rehydrated, 1);
const alreadyActivated = fixture({ open: true });
ready.add(alreadyActivated.root);
const beforeExisting = budgets.length;
sandbox.arm(alreadyActivated.root);
flush();
assert.equal(budgets.length, beforeExisting, 'existing manual/public activation must not be scanned a second time');
assert.equal(alreadyActivated.handlers.size, 0, 'an initialized live root needs no first-use listeners');
const detached = fixture({ open: true });
sandbox.arm(detached.root);
detached.root.isConnected = false;
flush();
assert.equal(activated.length, 2, 'detached scheduled work must not initialize a stale face');

console.log('PASS: per-live-face lazy scheduling, first click/key, cancellation, existing activation, finite budget rejection and detached-root boundaries. Heavy binding semantics are separately exercised in the real-DOM browser regression.');
