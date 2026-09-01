import assert from 'node:assert/strict';
import { MULTIFACE_PROTOCOL_LIMITS as limits, parseMultifaceOutput } from '../src/multifaceProtocol.js';

const face = (ordinal, content = `<p>面 ${ordinal} 的独立内容</p>`, attributes = '') =>
    `<toto data-rabbit-mirror="true" data-rm-face="${ordinal}" ${attributes}><details><summary>独立标题 ${ordinal}</summary>${content}</details></toto>`;
const batch = count => Array.from({ length: count }, (_, index) => face(index + 1)).join('\n');
const rejects = (source, code, options = { expectedCount: 2 }) => {
    const result = parseMultifaceOutput(source, options);
    assert.equal(result.ok, false, code);
    assert.ok(result.errors.some(error => error.code === code), `${code}: ${JSON.stringify(result.errors)}`);
    return result;
};

for (const count of [2, 3, 4, 5]) {
    const source = batch(count);
    const result = parseMultifaceOutput(source, { expectedCount: count });
    assert.equal(result.ok, true);
    assert.equal(result.complete, true);
    assert.equal(result.count, count);
    assert.deepEqual(result.faces.map(item => item.index), Array.from({ length: count }, (_, index) => index));
    assert.equal(result.faces.map(item => item.html).join('\n'), source, 'successful slices are exact original source');
    assert.equal(result.faces[0].summaryHtml, '独立标题 1');
    assert.ok(result.faces[0].details.startsWith('<details>'));
    assert.equal(result.stats.bytes, Buffer.byteLength(source));
    assert.equal(parseMultifaceOutput(source).ok, true, 'persisted output infers only complete 2..5 batches');
}

assert.equal(parseMultifaceOutput(`${face(3)}${face(1)}${face(2)}`, { expectedCount: 3 }).ok, true);
assert.deepEqual(parseMultifaceOutput(`${face(3)}${face(1)}${face(2)}`).faces.map(item => item.index), [0, 1, 2], 'wire order is not trusted face order');
rejects(batch(2), 'invalid-expected-count', { expectedCount: '2' });
rejects(batch(2), 'invalid-expected-count', { expectedCount: 1 });
rejects(batch(2), 'invalid-expected-count', { expectedCount: 6 });
rejects(null, 'invalid-input');
rejects(face(1), 'face-count-mismatch');
rejects(face(1), 'face-count-mismatch', {});
rejects(`${face(1)}${face(3)}`, 'face-count-mismatch', {});
rejects(batch(3), 'unexpected-face-index');
rejects(`${batch(5)}${face(6)}`, 'invalid-face-marker', { expectedCount: 5 });
const repeated = rejects(`${face(1)}${face(1)}`, 'duplicate-face-index');
assert.equal(repeated.faces.length, 0, 'ambiguous duplicate must not preserve the earlier same-index face');
rejects(`${face(1)}${face(1).replace('data-rm-face="1"', 'data-rm-face="2"')}`, 'duplicate-face-content');
const duplicateSummary = rejects(
    `${face(1, '<p>第一面正文不同</p>').replace('独立标题 1', 'Mirror A')}${face(2, '<p>第二面正文也不同</p>').replace('独立标题 2', '<span> mirror&nbsp;a </span>')}`,
    'duplicate-face-summary',
);
assert.equal(duplicateSummary.faces.length, 0, 'normalized duplicate titles must not leave one ambiguous face accepted');
rejects(batch(2).replace('data-rm-face="1"', 'data-rm-face="01"'), 'invalid-face-marker');
rejects(batch(2).replace('data-rabbit-mirror="true"', 'data-rabbit-mirror="false"'), 'invalid-face-marker');
rejects(batch(2).replace('data-rm-face="1"', 'data-rm-face="1" DATA-RM-FACE="2"'), 'duplicate-attribute');
rejects(`<div>${batch(2)}</div>`, 'outside-markup');
rejects(`<div>${batch(2)}</div>`, 'nested-face', { expectedCount: 2, allowProse: true });
rejects(`\`\`\`html\n${batch(2)}\n\`\`\``, 'outside-wrapper');
rejects(`\`\`\`html\n${batch(2)}\n\`\`\``, 'outside-wrapper', { expectedCount: 2, allowProse: true });
rejects(`说明文字${batch(2)}`, 'outside-content');
assert.equal(parseMultifaceOutput(`正文前言<p>完整正文</p>${batch(2)}正文后记`, { expectedCount: 2, allowProse: true }).ok, true);
assert.equal(parseMultifaceOutput(`正文比较 1 < 2。${batch(2)}`, { expectedCount: 2, allowProse: true }).ok, true);
rejects(face(1, face(2)), 'nested-face');
rejects(batch(2).replace('</p>', '</div>'), 'mismatched-close');
rejects(batch(2).replace('</details>', '</details><details><summary>多余</summary></details>'), 'multiple-face-details');
rejects(batch(2).replace('<summary>独立标题 1</summary>', ''), 'invalid-face-structure');
rejects(batch(2).replace('</summary>', '</summary><summary>重复标题</summary>'), 'multiple-face-summaries');
rejects(batch(2).replace('<details>', '<p>面外正文</p><details>'), 'invalid-face-root');
assert.equal(parseMultifaceOutput(`${face(1, '<details><summary>局部折叠</summary><p>独立内容</p></details>')}${face(2)}`).ok, true, 'nested ordinary details remain allowed');
assert.equal(parseMultifaceOutput(batch(2).replace('<details>', '<details open class="paper">')).ok, true, 'boolean attributes preserve the next attribute separator');

const first = face(1);
const second = face(2);
for (const cut of [second.indexOf('<details>'), second.indexOf('</details>'), second.length - 1]) {
    const result = parseMultifaceOutput(first + second.slice(0, cut), { expectedCount: 2 });
    assert.equal(result.ok, false);
    assert.equal(result.complete, false);
    assert.equal(result.partial, true);
    assert.equal(result.count, 1);
    assert.equal(result.faces[0].html, first, 'retain only proven complete source without adding closing tags');
}

const style = '<style>.panel { color: red; } .panel::after { content: "<toto data-rm-face=5>"; }</style>';
const styled = `${face(1, `${style}<p title="literal > and <toto>">实际内容</p>`)}${face(2)}`;
assert.equal(parseMultifaceOutput(styled).ok, true, 'quoted attribute/CSS tokens are not face delimiters');
assert.equal(parseMultifaceOutput(`${face(1, '<textarea><toto data-rabbit-mirror="true" data-rm-face="5">仅文本</toto></textarea>')}${face(2)}`).ok, true, 'raw-text textarea does not manufacture another face');
assert.equal(parseMultifaceOutput(`${face(1, '<!-- <toto data-rm-face="3"> -->安全注释')}${face(2)}`).ok, true);
assert.equal(parseMultifaceOutput(`${face(1, '<svg viewBox="0 0 10 10"><style>.s{fill:red}</style><path class="s" d="M0 0 L10 10"/><text><![CDATA[<toto>文本]]></text></svg>')}${face(2)}`).ok, true);
rejects(`${face(1, '<style>.a { color:red;</style>')}${face(2)}`, 'unclosed-style');
rejects(`${face(1, '<style>.a { content:"unfinished; }</style>')}${face(2)}`, 'unclosed-style');
rejects(`${face(1, '<style>/* unfinished</style>')}${face(2)}`, 'unclosed-style');
rejects(`${face(1, '<style>.a{color:red;}')}${face(2, '<style>.b{color:blue;}</style>')}`, 'cross-face-style');
rejects(`${face(1, '<style>.a{content:"</style>";}</style>')}${face(2)}`, 'unclosed-style');
rejects(`${face(1, '<style>.a{color:red;}')}${face(2)}`, 'unclosed-raw-text');
rejects(`${face(1, '<!-- unfinished')}${face(2)}`, 'unclosed-comment');
rejects(`${face(1, '<plaintext>not a closable block</plaintext>')}${face(2)}`, 'unsupported-raw-text');
rejects(`${face(1, '<script><!--<script>double escape</script>--></script>')}${face(2)}`, 'unsupported-raw-text');
rejects(`${face(1, '<div/>')}${face(2)}`, 'invalid-self-close');
rejects(`${first}<toto data-rabbit-mirror="true" data-rm-face="2"><details><summary>标题</summary><img title="unterminated>`, 'unclosed-attribute');
rejects(`${face(1, '<!DOCTYPE html>')}${face(2)}`, 'unsupported-declaration');

const forged = parseMultifaceOutput(`${face(1, '<p data-rabbit-mirror-owner="forged">来源不可信</p>', 'data-rabbit-mirror-owner="forged" data-batch-id="forged" data-face-index="4"')}${face(2)}`);
assert.equal(forged.ok, true, 'framing is not sanitization');
assert.deepEqual(Object.keys(forged.faces[0]).sort(), ['details', 'html', 'index', 'inner', 'summaryHtml']);
assert.equal(forged.faces[0].index, 0, 'only validated wire ordinal matches the local plan');
assert.ok(forged.faces[0].inner.includes('data-rabbit-mirror-owner="forged"'), 'caller must sanitize raw source; parser does not falsely mark it safe');

assert.equal(limits.chars, 768 * 1024);
assert.equal(limits.bytes, 512 * 1024);
assert.equal(limits.tags, 4200);
assert.equal(limits.depth, 72);
rejects('x'.repeat(limits.chars + 1), 'character-budget');
rejects('中'.repeat(Math.floor(limits.bytes / 3) + 1), 'byte-budget');
rejects(`${face(1, '<i></i>'.repeat(2101))}${face(2)}`, 'tag-budget');
rejects(`${face(1, '<div>'.repeat(73) + '</div>'.repeat(73))}${face(2)}`, 'depth-budget');
rejects(`${face(1, `<style>${'.x{}'.repeat(1401)}</style>`)}${face(2)}`, 'css-budget');
rejects(`${face(1, `<style>/*${'x'.repeat(limits.cssChars)}*/</style>`)}${face(2)}`, 'css-budget');
rejects(`${face(1, `<img src="data:image/png;base64,${'A'.repeat(limits.dataUriChars)}">`)}${face(2)}`, 'data-uri-budget');
const manyAttrs = Array.from({ length: 121 }, () => `<b ${Array.from({ length: 100 }, (_, index) => `a${index}="x"`).join(' ')}></b>`).join('');
rejects(`${face(1, manyAttrs)}${face(2)}`, 'attribute-budget');
rejects(Array.from({ length: 5 }, (_, index) => face(index + 1, '<i></i>'.repeat(500))).join(''), 'tag-budget', { expectedCount: 5 });
rejects(Array.from({ length: 5 }, (_, index) => face(index + 1, `<style>${'.x{}'.repeat(300)}</style>`)).join(''), 'css-budget', { expectedCount: 5 });
rejects(Array.from({ length: 5 }, (_, index) => face(index + 1, `<img src="data:image/png;base64,${'A'.repeat(40000)}">`)).join(''), 'data-uri-budget', { expectedCount: 5 });
for (const text of ['ASCII', '中文', '😀', '\ud800', '\udfff']) {
    const source = `${face(1, text)}${face(2)}`;
    assert.equal(parseMultifaceOutput(source).stats.bytes, Buffer.byteLength(source));
}

console.log('multiface raw protocol framing, partials, ordinal trust and whole-response limits passed');
