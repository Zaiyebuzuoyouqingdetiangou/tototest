import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import fs from 'node:fs';
import { describeExternalWorldBookPreflightFailure } from '../src/externalWorldBook/errors.js';

test('preflight reasons are actionable and never disclose exception text or details', () => {
    const metadata = describeExternalWorldBookPreflightFailure({ code: 'RABBIT_MIRROR_EXTERNAL_METADATA_REBUILD_REQUIRED', message: 'PRIVATE_RAW_BODY' });
    assert.match(metadata.message, /管理已保存内容.*重建抽签索引/);
    const stale = describeExternalWorldBookPreflightFailure({ code: 'RABBIT_MIRROR_EXTERNAL_PREFETCH_STALE' });
    assert.match(stale.message, /不必重新分类/);
    const unknown = describeExternalWorldBookPreflightFailure({ code: '<img src=SECRET>', message: 'PRIVATE_RAW_BODY', details: { key: 'SECRET' } });
    assert.equal(unknown.code, 'RABBIT_MIRROR_EXTERNAL_PREFLIGHT_UNKNOWN');
    assert.doesNotMatch(JSON.stringify([metadata, unknown]), /PRIVATE_RAW_BODY|SECRET|<img/);
});

test('ownership diagnosis retains rejection for every old boundary and labels the first changed owner', () => {
    const source = fs.readFileSync(new URL('../src/injector.js', import.meta.url), 'utf8');
    const fragment = source.slice(source.indexOf('function captureFollowPrefetchOwner('), source.indexOf('export async function rabbitMirrorGenerateInterceptor('));
    const input = [{ mes: 'ORIGINAL' }];
    const host = [{ mes: 'HOST' }];
    const box = { generationInvocationSequence: 1, currentIndependentIntentContext: () => ({ chat: host }), getCurrentChatKey: () => 'chat-a' };
    vm.createContext(box);
    vm.runInContext(fragment, box);
    const owner = box.captureFollowPrefetchOwner(input, 1);
    assert.equal(box.followPrefetchOwnerIsCurrent(owner, input), true);
    input[0].mes = 'CHANGED';
    assert.equal(box.followPrefetchOwnerMismatch(owner, input), 'input-body-changed');
    assert.throws(() => box.assertFollowPrefetchOwner(owner, input), { code: 'RABBIT_MIRROR_EXTERNAL_PREFETCH_STALE', requestCount: 0 });
    input[0].mes = 'ORIGINAL';
    host.push({ mes: 'NEW' });
    assert.equal(box.followPrefetchOwnerMismatch(owner, input), 'host-length-changed');
    host.pop();
    box.generationInvocationSequence = 2;
    assert.equal(box.followPrefetchOwnerMismatch(owner, input), 'generation-replaced');
});
