import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Execute the exact pure production parsing region. No host, model, fetch,
// browser DOM, or real network is involved in these transport-unit tests.
const sourcePath = new URL('../src/independentApi.js', import.meta.url);
const source = readFileSync(sourcePath, 'utf8');
const start = source.indexOf('function textFromContent(value){');
const end = source.indexOf('async function readApiResponse(', start);
assert.ok(start >= 0 && end > start, 'the production stream parsing region must exist');
const sandbox = {
    fetch() { assert.fail('delta fidelity tests must never access a network'); },
    setTimeout() { assert.fail('pure stream parsing must not schedule timers'); },
};
vm.runInNewContext(`${source.slice(start, end)}
globalThis.api = { textFromContent, extractResponseText, mergeIndependentStreamPayload, parseSsePayload, parseNdjsonPayload, incrementalIndependentStreamState };`, sandbox, { filename: sourcePath.pathname });
const runtime = sandbox.api;

const delta = content => ({ choices: [{ delta: { content } }] });
const snapshot = content => ({ choices: [{ message: { content } }] });
const encodeSse = payloads => [
    ': transport comment\r\n',
    ...payloads.map(payload => `event: message\r\ndata: ${JSON.stringify(payload)}\r\n\r\n`),
    'data: [DONE]\r\n\r\n',
].join('');
const encodeNdjson = payloads => `${payloads.map(payload => JSON.stringify(payload)).join('\r\n')}\r\n[DONE]\r\n`;

function incremental(wire, kind, cuts = []) {
    const reader = runtime.incrementalIndependentStreamState(kind);
    let offset = 0;
    for (const cut of cuts) {
        reader.push(wire.slice(offset, cut));
        offset = cut;
    }
    reader.push(wire.slice(offset));
    const result = reader.finish();
    assert.equal(result.raw, wire, 'incremental parser must retain the original wire text');
    return result;
}

function incrementalBytes(bytes, kind, cuts = []) {
    const reader = runtime.incrementalIndependentStreamState(kind);
    const decoder = new TextDecoder();
    let offset = 0;
    for (const cut of cuts) {
        reader.push(decoder.decode(bytes.subarray(offset, cut), { stream: true }));
        offset = cut;
    }
    reader.push(decoder.decode(bytes.subarray(offset), { stream: true }));
    reader.push(decoder.decode());
    return reader.finish();
}

function assertAllParsers(payloads, expected) {
    const sse = encodeSse(payloads);
    const ndjson = encodeNdjson(payloads);
    const parsedSse = runtime.parseSsePayload(sse);
    const parsedNdjson = runtime.parseNdjsonPayload(ndjson);
    assert.equal(parsedSse.text, expected, 'SSE exact visible output');
    assert.equal(parsedNdjson.text, expected, 'NDJSON exact visible output');
    assert.equal(parsedSse.done, true);
    assert.equal(parsedNdjson.done, true);
    for (const [kind, wire] of [['sse', sse], ['ndjson', ndjson], ['auto', sse], ['auto', ndjson]]) {
        assert.equal(incremental(wire, kind).text, expected, `${kind} incremental exact visible output`);
    }
}

const raw = ' \n<toto data-rabbit-mirror="true" data-rm-face="1"><details><summary>【兔子镜：信 🐇】</summary>\n'
    + '<style>.card { color: red; padding: 1px 2px; }</style>\n'
    + '<label for="choice-a"> 轻轻\t翻开 </label><input id="choice-a" type="checkbox">'
    + '<p>哈哈  天空\n天空</p></details></toto>\n '
    + '<toto data-rabbit-mirror="true" data-rm-face="2"><details><summary>【兔子镜：雨】</summary>'
    + '<p>雨 雨\n终点。</p></details></toto>\n\t';

test('every two-delta output boundary preserves exact HTML, attribute spaces, newlines, and unicode', () => {
    for (let boundary = 0; boundary <= raw.length; boundary += 1) {
        assertAllParsers([delta(raw.slice(0, boundary)), delta(raw.slice(boundary))], raw);
    }
});

test('every SSE and NDJSON wire boundary is safe for incremental framing, including CRLF boundaries', () => {
    const payloads = [delta(' <p class="'), delta('a b'), delta('">🐇\n'), delta('雨雨'), delta('</p>\t ' )];
    const expected = ' <p class="a b">🐇\n雨雨</p>\t ';
    for (const [kind, wire] of [['sse', encodeSse(payloads)], ['ndjson', encodeNdjson(payloads)]]) {
        for (let boundary = 0; boundary <= wire.length; boundary += 1) {
            assert.equal(incremental(wire, kind, [boundary]).text, expected, `${kind} wire boundary ${boundary}`);
        }
    }
});

test('every UTF-8 byte boundary preserves unicode before the incremental production parser', () => {
    const payloads = [delta(' 🐇'), delta(' 汉字\n'), delta('🐈 ' )];
    const expected = ' 🐇 汉字\n🐈 ';
    const encoder = new TextEncoder();
    for (const [kind, wire] of [['sse', encodeSse(payloads)], ['ndjson', encodeNdjson(payloads)]]) {
        const bytes = encoder.encode(wire);
        for (let boundary = 0; boundary <= bytes.length; boundary += 1) {
            const result = incrementalBytes(bytes, kind, [boundary]);
            assert.equal(result.raw, wire, `${kind} decoder boundary ${boundary}`);
            assert.equal(result.text, expected, `${kind} visible byte boundary ${boundary}`);
        }
    }
});

test('deterministically randomized model deltas and transport chunks preserve the same full output', () => {
    for (let seed = 1; seed <= 24; seed += 1) {
        let state = seed;
        const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
        const payloads = [];
        for (let offset = 0; offset < raw.length;) {
            const width = 1 + next() % 29;
            payloads.push(delta(raw.slice(offset, offset + width)));
            offset += width;
        }
        assertAllParsers(payloads, raw);
        for (const [kind, wire] of [['auto', encodeSse(payloads)], ['auto', encodeNdjson(payloads)]]) {
            const cuts = [];
            for (let offset = 1 + next() % 19; offset < wire.length; offset += 1 + next() % 19) cuts.push(offset);
            assert.equal(incremental(wire, kind, cuts).text, raw, `randomized seed ${seed}`);
        }
    }
});

test('whitespace-only deltas are data and repeated delta tokens are never deduplicated', () => {
    assertAllParsers([' ', ' ', '\t', '\n', '\r', ' '].map(delta), '  \t\n\r ');
    assertAllParsers(['哈', '哈', '哈', ' ', ' ', '>', '>', '\n', '\n'].map(delta), '哈哈哈  >>\n\n');
    assertAllParsers([delta('A'), delta('AA')], 'AAA', 'prefix-shaped deltas are still increments');
    assertAllParsers([delta(''), delta(null), delta(' ')], ' ');
});

test('explicit delta content parts concatenate without synthesized separators or thought leakage', () => {
    assertAllParsers([
        delta([{ type: 'text', text: '<p ' }, { type: 'text', text: 'class="a">' }]),
        delta([{ type: 'reasoning', text: 'PRIVATE_REASONING' }, { type: 'text', text: ' hello ' }]),
        delta([[{ type: 'text', text: 'world' }], { thought: true, text: 'PRIVATE_THOUGHT' }, '</p>']),
    ], '<p class="a"> hello world</p>');
});

test('non-delta cumulative snapshots retain their previous cumulative merge semantics', () => {
    assertAllParsers([snapshot('A'), snapshot('AA'), snapshot('AA'), snapshot('AAB')], 'AAB');
    assertAllParsers([{ text: 'A' }, { text: 'AB' }, { text: 'AB' }, { text: 'ABC' }], 'ABC');
    assertAllParsers([delta('A'), delta('A'), snapshot('AA'), snapshot('AAB')], 'AAB');
    assert.equal(runtime.extractResponseText(snapshot('  legacy snapshot \n')), 'legacy snapshot',
        'the whitespace policy for non-delta snapshots remains unchanged');
});

test('reasoning-only frames stay invisible and cannot replace or append to ordinary content', () => {
    const hiddenFrames = [
        { choices: [{ delta: { reasoning_content: 'PRIVATE_REASONING', reasoning: 'PRIVATE_REASONING' } }] },
        { choices: [{ delta: { content: null, reasoning_content: 'PRIVATE_REASONING' } }] },
        { choices: [{ message: { reasoning_content: 'PRIVATE_REASONING' } }] },
        { thinking: 'PRIVATE_THOUGHT', analysis: 'PRIVATE_ANALYSIS' },
        { content: [{ type: 'reasoning_text', text: 'PRIVATE_REASONING' }, { type: 'analysis', text: 'PRIVATE_ANALYSIS' }] },
        { candidates: [{ content: { parts: [{ thought: true, text: 'PRIVATE_THOUGHT' }] } }] },
    ];
    assertAllParsers(hiddenFrames, '');
    assertAllParsers([delta(' visible '), ...hiddenFrames, delta(' result ')], ' visible  result ');
});

test('an explicit empty delta is not replaced by a competing snapshot field', () => {
    assertAllParsers([
        { choices: [{ delta: { content: '' }, message: { content: 'MUST_NOT_FALL_BACK' } }], text: 'MUST_NOT_FALL_BACK' },
        delta(' visible '),
    ], ' visible ');
});
