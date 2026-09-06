import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createRabbitMirrorTextReplacementReceipt, matchesRabbitMirrorTextReplacementReceipt, textReplacementReceiptHash } from '../src/replacementReceipt.js';

test('receipt digest binds exact UTF-8 content including Unicode and block boundaries', () => {
    for (const text of ['', 'abc', '甲星港🙂', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), '字'.repeat(200)]) {
        assert.equal(textReplacementReceiptHash(text), createHash('sha256').update(text).digest('hex'));
    }
});
test('out-of-band receipt cannot transfer across bytes, rules, owner or schema', () => {
    const html = '<details><summary>aa</summary></details>';
    const rules = [{find:'a',replace:'aa'}];
    const receipt = createRabbitMirrorTextReplacementReceipt(html, rules, 'chat:2:0:source');
    assert.ok(matchesRabbitMirrorTextReplacementReceipt(JSON.parse(JSON.stringify(receipt)), html, rules, 'chat:2:0:source'));
    assert.equal(matchesRabbitMirrorTextReplacementReceipt(receipt, html+' ', rules, 'chat:2:0:source'), false);
    assert.equal(matchesRabbitMirrorTextReplacementReceipt(receipt, html, [{find:'a',replace:'z'}], 'chat:2:0:source'), false);
    assert.equal(matchesRabbitMirrorTextReplacementReceipt(receipt, html, rules, 'chat:3:0:source'), false);
    assert.equal(matchesRabbitMirrorTextReplacementReceipt({...receipt,version:2}, html, rules, 'chat:2:0:source'), false);
    assert.equal(matchesRabbitMirrorTextReplacementReceipt(null, html, rules, 'chat:2:0:source'), false);
});
test('empty rules do not encode or hash result bytes', () => {
    const Encoder=globalThis.TextEncoder;
    globalThis.TextEncoder=class { constructor(){throw new Error('empty rules reached hashing');} };
    try {
        assert.equal(createRabbitMirrorTextReplacementReceipt('large-result',[],'owner'),null);
        assert.equal(matchesRabbitMirrorTextReplacementReceipt({version:1,ownerKey:'owner'},'large-result',[],'owner'),false);
    } finally {globalThis.TextEncoder=Encoder;}
});
