import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { filterRabbitMirrorVisibleTextValue } from '../src/bannedWords.js';

// Unit coverage only: execute exact production helper/sink bodies. The node
// objects below model ancestor links and text writes, not a browser DOM, CSS,
// sanitizer, mount, or snapshot lifecycle. Real-browser acceptance is separate.
const sourcePath = new URL('../src/outputSanitizer.js', import.meta.url);
const source = readFileSync(sourcePath, 'utf8');

function extractFunction(name) {
    const marker = `function ${name}(`;
    const start = source.indexOf(marker);
    assert.notEqual(start, -1, `missing production function ${name}`);
    const bodyStart = source.indexOf('{', start + marker.length);
    let depth = 0;
    let quote = '';
    let escaped = false;
    let lineComment = false;
    let blockComment = false;
    for (let index = bodyStart; index < source.length; index += 1) {
        const char = source[index];
        const next = source[index + 1];
        if (lineComment) { if (char === '\n') lineComment = false; continue; }
        if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index += 1; } continue; }
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
        if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
        if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
        if (char === '{') depth += 1;
        else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`unterminated production function ${name}`);
}

function extractSet(name) {
    const match = source.match(new RegExp(`const ${name} = new Set\\(\\[[\\s\\S]*?\\]\\);`));
    assert.ok(match, `missing production set ${name}`);
    return match[0];
}

function createRuntime(words = []) {
    const settings = { rabbitMirrorBannedWords: words };
    const sandbox = { getSettings: () => settings, filterRabbitMirrorVisibleTextValue };
    const program = [
        extractSet('RABBIT_MIRROR_NON_CONTENT_TEXT_TAGS'),
        extractSet('DIAGNOSTIC_MULTIFACE_PROTOCOL_CODES'),
        ...[
            'isRabbitMirrorRuntimeTextTarget',
            'filterRabbitMirrorRuntimeText',
            'applyDirectIdClickAssignments',
            'applyRawScriptTimelineActions',
            'fillInChoiceSetBlankText',
            'diagnosticIndependentTerminalFields',
        ].map(extractFunction),
        'globalThis.probe = { isRabbitMirrorRuntimeTextTarget, applyDirectIdClickAssignments, applyRawScriptTimelineActions, fillInChoiceSetBlankText, diagnosticIndependentTerminalFields };',
    ].join('\n');
    vm.runInNewContext(program, sandbox, { filename: sourcePath.pathname });
    return { ...sandbox.probe, settings };
}

function element(tagName = 'DIV', parentElement = null) {
    let value = 'original BAD';
    let writes = 0;
    return {
        nodeType: 1, tagName, parentElement, isConnected: true,
        attrs: { class: 'BAD-card', style: 'color:red' },
        get textContent() { return value; },
        set textContent(next) { value = String(next); writes += 1; },
        get writes() { return writes; },
    };
}

for (const tag of ['STYLE', 'SCRIPT', 'TEMPLATE', 'NOSCRIPT']) {
    test(`runtime text target rejects ${tag}, lowercase spelling, and descendants (ancestor-object unit model)`, () => {
        const runtime = createRuntime(['BAD']);
        const direct = element(tag);
        assert.equal(runtime.isRabbitMirrorRuntimeTextTarget(direct), false);
        assert.equal(runtime.isRabbitMirrorRuntimeTextTarget(element(tag.toLowerCase())), false);
        assert.equal(runtime.isRabbitMirrorRuntimeTextTarget(element('SPAN', direct)), false);
        assert.equal(runtime.isRabbitMirrorRuntimeTextTarget(element('B', element('SPAN', direct))), false);
        assert.equal(runtime.isRabbitMirrorRuntimeTextTarget({ nodeType: 3, parentElement: direct }), false);
        assert.equal(runtime.isRabbitMirrorRuntimeTextTarget({ nodeType: 3, parentNode: direct }), false);

        for (const target of [direct, element('SPAN', direct)]) {
            runtime.applyDirectIdClickAssignments([{ type: 'text', target, value: 'BAD changed' }]);
            runtime.applyRawScriptTimelineActions([{ type: 'text', target, value: 'BAD changed' }]);
            assert.equal(target.writes, 0, 'production text sinks must not mutate non-content targets');
            assert.equal(target.textContent, 'original BAD', 'CSS/script/template text must remain untouched');
            assert.deepEqual(target.attrs, { class: 'BAD-card', style: 'color:red' });
            const textNode = { nodeType: 3, parentElement: target, nodeValue: 'original BAD' };
            runtime.fillInChoiceSetBlankText({ textNode }, 'BAD changed');
            assert.equal(textNode.nodeValue, 'original BAD', 'fill-in text sink must obey the same target boundary');
        }
    });
}

test('ordinary content and SVG text/tspan stay eligible; missing targets are rejected', () => {
    const runtime = createRuntime();
    for (const tag of ['DIV', 'SPAN', 'BUTTON', 'svg', 'text', 'tspan']) {
        const target = element(tag, element('DETAILS'));
        assert.equal(runtime.isRabbitMirrorRuntimeTextTarget(target), true, tag);
        assert.equal(runtime.isRabbitMirrorRuntimeTextTarget({ nodeType: 3, parentElement: target }), true, `${tag} text child`);
    }
    assert.equal(runtime.isRabbitMirrorRuntimeTextTarget(null), false);
    assert.equal(runtime.isRabbitMirrorRuntimeTextTarget(undefined), false);
    assert.equal(runtime.isRabbitMirrorRuntimeTextTarget({ nodeType: 3 }), false);
});

test('production direct/timeline/fill-in sinks read the current banned settings at assignment time', () => {
    const runtime = createRuntime([]);
    const target = element('text', element('svg'));
    const action = { type: 'text', target, value: 'BAD safe bad' };
    runtime.applyDirectIdClickAssignments([action]);
    assert.equal(target.textContent, 'BAD safe bad');
    runtime.settings.rabbitMirrorBannedWords = ['BAD'];
    runtime.applyDirectIdClickAssignments([action]);
    assert.equal(target.textContent, ' safe ');
    runtime.applyRawScriptTimelineActions([action]);
    assert.equal(target.textContent, ' safe ');
    const textNode = { nodeType: 3, parentElement: target, nodeValue: 'old' };
    runtime.fillInChoiceSetBlankText({ textNode }, 'BAD safe bad');
    assert.equal(textNode.nodeValue, ' safe ');
    assert.deepEqual(target.attrs, { class: 'BAD-card', style: 'color:red' }, 'attribute boundary is unchanged');
    runtime.settings.rabbitMirrorBannedWords = [];
    runtime.applyRawScriptTimelineActions([action]);
    assert.equal(target.textContent, 'BAD safe bad', 'empty settings must not inherit an old matcher');
});

test('terminal formatter preserves requestCount=0, protocolOffset=0, and valid face/code evidence', () => {
    const { diagnosticIndependentTerminalFields: format } = createRuntime();
    assert.equal(format({ requestCount: 0, terminalFace: 5, protocolErrorCode: 'face-count-mismatch', protocolOffset: 0 }),
        'requestCount=0 terminalFace=5 protocolErrorCode=face-count-mismatch protocolOffset=0');
    for (const face of [1, 2, 3, 4, 5]) {
        assert.equal(format({ requestCount: 1, terminalFace: face, protocolErrorCode: 'mismatched-close', protocolOffset: 123 }),
            `requestCount=1 terminalFace=${face} protocolErrorCode=mismatched-close protocolOffset=123`);
    }
    assert.match(format({ protocolErrorCode: 'unclosed-face', protocolOffset: Number.MAX_SAFE_INTEGER }),
        /protocolErrorCode=unclosed-face protocolOffset=9007199254740991$/);
});

test('terminal formatter rejects non-enum request counts and non-integer/out-of-range faces without coercion', () => {
    const { diagnosticIndependentTerminalFields: format } = createRuntime();
    const commonInvalid = [undefined, null, NaN, Infinity, -Infinity, '', '0', '1', true, false, {}, [], 1n];
    for (const requestCount of [...commonInvalid, -1, 0.5, 2, Number.MAX_SAFE_INTEGER]) {
        assert.match(format({ requestCount }), /^requestCount=\? /, `requestCount must be numeric 0 or 1: ${String(requestCount)}`);
    }
    for (const terminalFace of [...commonInvalid, -1, 0, 1.5, 6, Number.MAX_SAFE_INTEGER]) {
        assert.match(format({ terminalFace }), / terminalFace=\(无\) /, `face must be an integer from 1 to 5: ${String(terminalFace)}`);
    }
});

test('terminal formatter rejects negative, fractional, unsafe, and coerced protocol offsets', () => {
    const { diagnosticIndependentTerminalFields: format } = createRuntime();
    for (const protocolOffset of [undefined, null, NaN, Infinity, -Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, '0', '', true, {}, [], 0n]) {
        assert.match(format({ protocolOffset }), / protocolOffset=\(无\)$/, `offset must be a nonnegative safe integer: ${String(protocolOffset)}`);
    }
});

test('terminal formatter never echoes arbitrary error strings, HTML, prompt/body, or unknown protocol codes', () => {
    const { diagnosticIndependentTerminalFields: format } = createRuntime();
    const payload = '<img src="https://invalid.example/SECRET_SENTINEL" onerror="SECRET_SENTINEL">';
    for (const protocolErrorCode of [undefined, null, '', 'unknown-code', 'FACE-COUNT-MISMATCH', 'constructor', '__proto__', payload, {}, []]) {
        const result = format({
            requestCount: payload, terminalFace: payload, protocolErrorCode, protocolOffset: payload,
            terminalErrorCode: payload, semanticFailure: payload, prompt: payload, body: payload, apiKey: payload,
        });
        assert.equal(result, 'requestCount=? terminalFace=(无) protocolErrorCode=(无或未知) protocolOffset=(无)');
        assert.doesNotMatch(result, /SECRET_SENTINEL|<img|https:|onerror|unknown-code|constructor|__proto__/);
    }
    assert.equal(format(null), 'requestCount=? terminalFace=(无) protocolErrorCode=(无或未知) protocolOffset=(无)');
});
