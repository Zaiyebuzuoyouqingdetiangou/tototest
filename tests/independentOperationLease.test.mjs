import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/independentApi.js', import.meta.url), 'utf8');
const start = source.indexOf('function globalDispatchLeases()');
const end = source.indexOf('\nfunction currentRuntime()', start);
assert.ok(start >= 0 && end > start, 'dispatch lease helpers must exist');

let now = 10000;
const sandbox = {
    GLOBAL_DISPATCH_LEASE_KEY: '__leases',
    GLOBAL_OPERATION_EPOCH_KEY: '__epochs',
    Date: { now: () => now },
    globalThis: {},
};
vm.createContext(sandbox);
vm.runInContext(`${source.slice(start, end)}
globalThis.reserve = reserveAutomaticDispatchLease;
globalThis.advance = advanceOperationEpochForBase;
globalThis.consumed = automaticDispatchAlreadyConsumed;`, sandbox);

const first = sandbox.globalThis.reserve('chat:7:0', 'A');
assert.ok(first);
assert.equal(first.consume(), true);
assert.equal(first.consume(), false, 'one lease cannot dispatch twice');
assert.equal(first.release(), false, 'a consumed lease leaves a tombstone');
assert.equal(sandbox.globalThis.reserve('chat:7:0', 'B'), null, 'A→B rewrite in one host operation cannot reserve again');
assert.equal(sandbox.globalThis.consumed('chat:7:0'), true);

now += 2000;
const epoch = sandbox.globalThis.advance('chat:7:0', 'host-swipe', 'swipe:1:body-B');
const explicit = sandbox.globalThis.reserve('chat:7:0', 'B');
assert.ok(explicit, 'an explicit later host operation receives a new epoch');
assert.equal(explicit.consume(), true);
now += 8000;
assert.equal(sandbox.globalThis.advance('chat:7:0', 'host-regenerate', 'swipe:1:body-B'), epoch, 'duplicate host events for one exact source must coalesce regardless of delay');
assert.equal(sandbox.globalThis.reserve('chat:7:0', 'C'), null, 'coalesced events cannot open a second paid dispatch');

now += 2000;
sandbox.globalThis.advance('chat:8:0', 'host-continue', 'swipe:0:body-A');
const cancelled = sandbox.globalThis.reserve('chat:8:0', 'A');
assert.ok(cancelled);
assert.equal(cancelled.release(), true, 'pre-dispatch cancellation may release a reservation');
assert.ok(sandbox.globalThis.reserve('chat:8:0', 'A'), 'released pre-dispatch reservation may be retried without payment');

assert.match(source, /const cutover=\{authorized:new Map\(\),activeHostGeneration:null/, 'automatic generation must default to an empty authorization map');
assert.match(source, /if\(!cutover\) return true;/, 'missing cutover authorization must fail closed');
assert.match(source, /finishAutomaticHostGeneration\(finishedContext,last\?\.i \?\? -1\)/, 'only an observed START→END operation may authorize completion');
assert.doesNotMatch(source, /normalized>cutover\.maxIndex|cutover\.unlocked/, 'partial-chat max-index cutover must not survive');

console.log('independent operation lease: one paid dispatch per host-operation epoch passed');
