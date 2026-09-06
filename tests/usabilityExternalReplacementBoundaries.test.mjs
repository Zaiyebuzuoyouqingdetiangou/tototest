import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseRabbitMirrorReplacementLines, formatRabbitMirrorReplacementLines, filterRabbitMirrorVisibleTextValue } from '../src/bannedWords.js';
import { normalizeRabbitMirrorBannedWords } from '../src/settings.js';

test('literal delimiter, quoted deletion and replacement whitespace survive editor save', () => {
    const rules = normalizeRabbitMirrorBannedWords(['a=>b', '"quoted"', '["x","y"]', { find: 'x=>y', replace: ' leading => trailing ' }, { find: 'old', replace: 'new' }]);
    assert.deepEqual(normalizeRabbitMirrorBannedWords(parseRabbitMirrorReplacementLines(formatRabbitMirrorReplacementLines(rules))), rules);
    assert.deepEqual(normalizeRabbitMirrorBannedWords(parseRabbitMirrorReplacementLines('old => new\nremove')), [{ find: 'old', replace: 'new' }, 'remove']);
});

test('production checked text parsers and application replace non-idempotent values exactly once per click', () => {
    const source = fs.readFileSync(new URL('../src/outputSanitizer.js', import.meta.url), 'utf8');
    const fragment = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
    const target = { textContent: '', setAttribute() {}, removeAttribute() {} };
    const box = { getSettings: () => ({ rabbitMirrorBannedWords: [{ find: 'a', replace: 'aa' }] }), filterRabbitMirrorVisibleTextValue,
        decodeSafeInlineString: value => value, isRabbitMirrorRuntimeTextTarget: () => true, applyPseudoStyleAssignments() {}, restorePseudoStyleState() {},
        PSEUDO_ACTIVE_ATTR: 'active', state: { target }, directMatch: [null, null, null, null, 'a'] };
    vm.createContext(box);
    vm.runInContext(fragment('function filterRabbitMirrorRuntimeText(', 'function filterRabbitMirrorRuntimeDom(')
        + fragment('function parseNamedTextAssignments(', 'function parseCheckedChangeStyleProgramFromSource(')
        + fragment('function applyCheckedChangeProgram(', 'function bindCheckedChangeProgram('), box);
    vm.runInContext(source.match(/state\.activeText = .*directMatch\[4\].*;/)[0], box);
    box.applyCheckedChangeProgram({ checked: true }, [box.state]);
    assert.equal(target.textContent, 'aa', 'direct ternary text must not be filtered at parse and apply');
    const named = box.parseNamedTextAssignments("label.textContent = 'a';", new Map([['label', target]]));
    box.applyCheckedChangeProgram({ checked: true }, [{ target, activeText: named.get(target) }]);
    assert.equal(target.textContent, 'aa', 'named assignment must not be filtered at parse and apply');
    box.applyCheckedChangeProgram({ checked: true }, [{ target, activeText: named.get(target) }]);
    assert.equal(target.textContent, 'aa', 'repeated application must reuse the raw instruction');
});
