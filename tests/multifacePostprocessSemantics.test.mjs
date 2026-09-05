import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { PRESENTATION_FORMATS } from '../data/structured/presentationIndex.js';
import { evaluateIndependentPostSanitizeQuality } from '../src/independentQualityGate.js';
import { parseMultifaceOutput } from '../src/multifaceProtocol.js';

const apiSource = fs.readFileSync(new URL('../src/independentApi.js', import.meta.url), 'utf8');

function functionBlock(name) {
    const marker = `function ${name}(`;
    const start = apiSource.indexOf(marker);
    assert.ok(start >= 0, `${name} must exist`);
    const brace = apiSource.indexOf('{', start);
    assert.ok(brace > start, `${name} body must exist`);
    let depth = 0;
    for (let index = brace; index < apiSource.length; index += 1) {
        if (apiSource[index] === '{') depth += 1;
        else if (apiSource[index] === '}') {
            depth -= 1;
            if (depth === 0) return apiSource.slice(start, index + 1);
        }
    }
    throw new Error(`${name} body is not balanced`);
}

function face(ordinal, marker) {
    return `<toto data-rabbit-mirror="true" data-rm-face="${ordinal}"><details><summary>【兔子镜：合成测试${ordinal}】</summary><style>.root{display:grid;gap:8px;background:#fff;color:#222}.panel{display:none}#a${ordinal}:checked~.root .p1,#b${ordinal}:checked~.root .p2,#c${ordinal}:checked~.root .p3{display:block}</style><input id="a${ordinal}" name="g${ordinal}" type="radio" checked><label for="a${ordinal}">甲</label><input id="b${ordinal}" name="g${ordinal}" type="radio"><label for="b${ordinal}">乙</label><input id="c${ordinal}" name="g${ordinal}" type="radio"><label for="c${ordinal}">丙</label><div class="root ${marker}"><p>第${ordinal}面不同正文</p><section class="panel p1">${'甲'.repeat(90)}</section><section class="panel p2">${'乙'.repeat(90)}</section><section class="panel p3">${'丙'.repeat(90)}</section></div></details></toto>`;
}


function simpleFace(ordinal) {
    return `<toto data-rabbit-mirror="true" data-rm-face="${ordinal}"><details><summary>【兔子镜：简单测试${ordinal}】</summary><style>.simple{background:#fff;color:#222;padding:12px}</style><article class="simple"><p>第${ordinal}面独立简单正文，保持与其它面不同。</p></article></details></toto>`;
}

function harness() {
    const formatMap = new Map(PRESENTATION_FORMATS.map(item => [String(item.id), item]));
    const semanticFailures = [];
    const remembered = [];
    const sandbox = {
        independentPresentationFormatById: formatMap,
        parseMultifaceOutput,
        republishIndependentSemanticFailure(...args) { semanticFailures.push(args); return args[0] || {}; },
        independentMirrorBodyEvidence: () => true,
        independentVisualProgramIntegrity: () => ({ ok: true, reason: '' }),
        prepareIndependentReadyHtml: value => String(value || ''),
        scanRabbitMirrorHtml(value) {
            const source = String(value || '');
            if (source.includes('TABBED')) return { interactionFamily: 'tabbed_radio_family', riskFlags: ['flat_vertical_flow', 'weak_spatial_complexity'] };
            return { interactionFamily: null, riskFlags: [] };
        },
        wrappedIndependentMirrorHtml: value => String(value || ''),
        evaluateIndependentPostSanitizeQuality,
        rememberIndependentQualityFailure(_slot, quality) { remembered.push(quality); },
        wrapIndependentFace: (inner, index) => `<toto data-rabbit-mirror="true" data-rm-face="${index + 1}">${inner}</toto>`,
        assertIndependentMarkupComplexityWithDiagnostic() {},
        String,
        Number,
        Array,
        Map,
        Set,
        Error,
        globalThis: {},
    };
    vm.createContext(sandbox);
    const helperStart = apiSource.indexOf('function independentSelectedFormatDescriptors(');
    const prepareStart = apiSource.indexOf('function prepareIndependentMultifaceResult(', helperStart);
    const prepareEnd = apiSource.indexOf('\nasync function callIndependentApi(', prepareStart);
    assert.ok(helperStart >= 0 && prepareStart > helperStart && prepareEnd > prepareStart);
    const helperBlock = apiSource.slice(helperStart, prepareStart);
    const prepareBlock = apiSource.slice(prepareStart, prepareEnd);
    vm.runInContext(`${functionBlock('wrapPreparedIndependentFace')}\n${helperBlock}\n${prepareBlock}\nglobalThis.run=prepareIndependentMultifaceResult;`, sandbox);
    return { sandbox, semanticFailures, remembered };
}


// VM orchestration test: sanitizer/scanner are explicit stubs. The separate
// real-browser seam verifies the actual sanitizer, scanner and DOM mount.
test('multiface orchestration accepts 2..5 faces with declared sanitizer/scanner stubs', () => {
    for (const count of [2, 3, 4, 5]) {
        const { sandbox } = harness();
        const raw = Array.from({ length: count }, (_, index) => simpleFace(index + 1)).join('\n');
        const metadata = {
            faceCount: count,
            faces: Array.from({ length: count }, () => ({ formatIds: ['8.7'], formatLabels: ['8.7 人生出场顺序论'] })),
        };
        const result = sandbox.globalThis.run(raw, metadata, { requestCount: 1 }, { slot: `slot-${count}` });
        assert.equal(parseMultifaceOutput(result.html, { expectedCount: count }).ok, true, `${count} faces must remain a valid accepted batch`);
        assert.equal(result.faceScans.length, count);
    }
});

test('multiface quality sees the selected format summary so native page/tab media are not falsely rejected', () => {
    const { sandbox } = harness();
    const raw = `${simpleFace(1)}\n${face(2, 'TABBED')}`;
    const metadata = {
        faceCount: 2,
        faces: [
            { formatIds: ['8.7'], formatLabels: ['8.7 人生出场顺序论'] },
            { formatIds: ['2.1.8'], formatLabels: ['2.1.8 恋爱日记 (Love Chronicle / Flip-book)'] },
        ],
    };
    let result;
    assert.doesNotThrow(() => { result = sandbox.globalThis.run(raw, metadata, { requestCount: 1 }, { slot: 'slot-native' }); }, 'native selected format summary must reach the quality gate');
    assert.equal(parseMultifaceOutput(result.html, { expectedCount: 2 }).ok, true);
    const descriptor = sandbox.independentSelectedFormatDescriptors(metadata.faces[1])[0];
    assert.equal(descriptor.id, '2.1.8');
    assert.match(descriptor.summary, /翻页感|页签感/);
});

test('generic tabs remain rejected when the selected format does not natively call for tabs or paging', () => {
    const { sandbox, remembered } = harness();
    const raw = `${simpleFace(1)}\n${face(2, 'TABBED')}`;
    const metadata = {
        faceCount: 2,
        faces: [
            { formatIds: ['2.1.8'], formatLabels: ['2.1.8 恋爱日记'] },
            { formatIds: ['8.7'], formatLabels: ['8.7 人生出场顺序论'] },
        ],
    };
    assert.throws(
        () => sandbox.globalThis.run(raw, metadata, { requestCount: 1 }, { slot: 'slot-generic' }),
        error => error?.code === 'generic-tabbed-flat-layout'
            && error?.rabbitMirrorMultifaceDiagnostic?.terminalFace === 2
            && error?.rabbitMirrorMultifaceDiagnostic?.qualityCode === 'generic-tabbed-flat-layout',
    );
    assert.equal(remembered.at(-1)?.code, 'generic-tabbed-flat-layout');
});

test('an incomplete five-face batch keeps the precise multiface-incomplete semantic instead of being mislabeled as quality', () => {
    const { sandbox } = harness();
    const raw = [1, 2, 3, 4].map(index => face(index, 'PLAIN')).join('\n');
    const metadata = { faceCount: 5, faces: Array.from({ length: 5 }, () => ({ formatIds: ['8.7'], formatLabels: ['8.7 人生出场顺序论'] })) };
    assert.throws(
        () => sandbox.globalThis.run(raw, metadata, { requestCount: 1 }, {}),
        error => error?.code === 'multiface-incomplete'
            && error?.rabbitMirrorMultifaceDiagnostic?.completedFaces === 4
            && error?.rabbitMirrorMultifaceDiagnostic?.expectedFaces === 5,
    );
});



test('outer multiface semantic mapping preserves precise multiface errors and classifies quality errors separately', () => {
    const helper = functionBlock('independentMultifaceFailureSemantic');
    const sandbox = { String, globalThis: {} };
    vm.createContext(sandbox);
    vm.runInContext(`${helper}
globalThis.run=independentMultifaceFailureSemantic;`, sandbox);
    assert.equal(sandbox.globalThis.run({ code: 'multiface-incomplete' }), 'multiface-incomplete');
    assert.equal(sandbox.globalThis.run({ code: 'multiface-post-sanitize-empty' }), 'multiface-post-sanitize-empty');
    assert.equal(sandbox.globalThis.run({ code: 'generic-tabbed-flat-layout' }), 'multiface-quality');
    assert.equal(sandbox.globalThis.run({}), 'multiface-quality');
});

test('single-face and multiface quality paths both use the same structured format descriptors', () => {
    const callStart = apiSource.indexOf('async function callIndependentApi(');
    const callEnd = apiSource.indexOf('\nfunction externalOwnerMesid(', callStart);
    const callSource = apiSource.slice(callStart, callEnd);
    assert.match(callSource, /const selectedFormats=independentSelectedFormatDescriptors\(details\.metadata\)/);
    const prepareStart = apiSource.indexOf('function prepareIndependentMultifaceResult(');
    const prepareEnd = apiSource.indexOf('\nasync function callIndependentApi(', prepareStart);
    const prepareSource = apiSource.slice(prepareStart, prepareEnd);
    assert.match(prepareSource, /selectedFormats:independentSelectedFormatDescriptors\(faceMetadata\)/);
});
