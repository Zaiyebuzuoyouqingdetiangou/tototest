import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRabbitMirrorBannedWords } from '../src/settings.js';
import { filterRabbitMirrorVisibleTextValue, applyRabbitMirrorBannedWordsToDom } from '../src/bannedWords.js';

test('legacy deletion and literal replacement coexist without regex interpretation or replacement expansion', () => {
  const rules = normalizeRabbitMirrorBannedWords(['删除', { find: 'a.b', replace: '$&<b>新</b>' }]);
  assert.equal(filterRabbitMirrorVisibleTextValue('删除 A.B axb', rules).text, ' $&<b>新</b> axb');
  assert.equal(filterRabbitMirrorVisibleTextValue('a', [{ find: 'a', replace: 'b' }, { find: 'b', replace: 'c' }]).text, 'b');
});

test('replacement settings preserve old strings, deduplicate find terms and bound replacement data', () => {
  assert.deepEqual(normalizeRabbitMirrorBannedWords(['OLD', { find: 'old', replace: 'new' }, { find: '', replace: 'x' }]), ['OLD']);
  assert.deepEqual(normalizeRabbitMirrorBannedWords([{ find: '词', replace: '' }]), ['词']);
  assert.equal(normalizeRabbitMirrorBannedWords([{ find: 'a', replace: 'b'.repeat(1000) }])[0].replace.length, 240);
});

test('repeated DOM maintenance does not expand already substituted text or touch markup', () => {
  const node = { nodeType: 3, nodeValue: 'a', parentNode: { tagName: 'P' } };
  const root = { childNodes: [node] };
  const rules = [{ find: 'a', replace: 'aa' }];
  assert.equal(applyRabbitMirrorBannedWordsToDom(root, rules), 1);
  assert.equal(applyRabbitMirrorBannedWordsToDom(root, rules), 0);
  assert.equal(node.nodeValue, 'aa');
});
