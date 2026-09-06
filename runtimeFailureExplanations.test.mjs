import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describeExternalWorldBookPreflightFailure } from '../src/externalWorldBook/errors.js';
import { parseMultifaceOutput, recoverableMultifaceFrames } from '../src/multifaceProtocol.js';

const source = readFileSync(new URL('../src/independentApi.js', import.meta.url), 'utf8');
const block = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const sandbox = { describeExternalWorldBookPreflightFailure, hashText: () => 'owner-hash' };
vm.createContext(sandbox);
vm.runInContext(block('function independentLocalPreflightFailure(', 'function independentBatchPlanPreflightError(')
    + block('function independentExternalPromptPreflightError(', 'function independentPromptBatchSignature(')
    + '\nglobalThis.wrap=independentExternalPromptPreflightError;', sandbox);
const owner = { chatKey: 'test', index: 2, swipe: 0, sourceHash: 'body', baseSlot: 'slot', operationEpoch: 1 };
for (const code of ['MULTIFACE_PLAN_UNAVAILABLE', 'RABBIT_MIRROR_DISPATCH_LEASE_REJECTED', 'WORLD_BOOK_NOT_FOUND', 'WORLD_BOOK_STORAGE_UNAVAILABLE']) {
    const error = sandbox.wrap({ code, message: 'PRIVATE_TITLE_AND_RAW', details: { raw: 'PRIVATE_BODY' } }, owner);
    assert.equal(error.code, code);
    assert.ok(error.message.includes(code), `fixed code must be visible: ${code}`);
    assert.ok(!error.message.includes('PRIVATE'));
    assert.equal(error.rabbitMirrorRequestDiagnostic.requestCount, 0);
    assert.equal(error.rabbitMirrorRequestDiagnostic.nextProfile, '');
}
const unknown = sandbox.wrap({ code: 'PRIVATE_RAW_CODE', message: 'PRIVATE_RAW' }, owner);
assert.ok(!unknown.message.includes('PRIVATE'));
const rebuild = sandbox.wrap({ code: 'WORLD_BOOK_ENTRY_STATE_CONFLICT', details: { reason: 'metadata-rebuild-required' } }, owner);
assert.match(rebuild.message, /重建索引/);
vm.runInContext(block('function independentMultifaceIncompleteHint(', 'function prepareIndependentMultifaceResult(')
    + '\nglobalThis.hint=independentMultifaceIncompleteHint;', sandbox);
assert.match(sandbox.hint('unclosed-raw-text', 'stop'), /不能确定/);
assert.match(sandbox.hint('unclosed-raw-text', 'length'), /服务商报告输出达到长度上限/);
assert.ok(!sandbox.hint('unclosed-raw-text', 'PRIVATE_BODY').includes('PRIVATE'));
const cut = '<toto data-rabbit-mirror="true" data-rm-face="1"><details><summary>原创镜面</summary><style>.paper { color: red; }';
const parsed = parseMultifaceOutput(cut, { expectedCount: 5 });
assert.equal(parsed.errors[0].code, 'unclosed-raw-text');
assert.equal(recoverableMultifaceFrames(parsed).length, 0, 'missing close must not be invented to save an ambiguous face');
console.log('runtimeFailureExplanations passed: stage-specific local codes, no raw content, zero-request semantics');
