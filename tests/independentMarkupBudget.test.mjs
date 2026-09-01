import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/independentApi.js', import.meta.url), 'utf8');
const start = source.indexOf('function independentMarkupLimitError(');
const end = source.indexOf('\nfunction independentMirrorBodyEvidence', start);
assert.ok(start >= 0 && end > start, 'lexical markup preflight must exist');

const sandbox = {
    INDEPENDENT_RAW_MARKUP_BUDGET_CHARS: 768 * 1024,
    INDEPENDENT_HTML_BUDGET_BYTES: 512 * 1024,
    INDEPENDENT_MAX_TAGS: 4200,
    INDEPENDENT_MAX_APPROX_DEPTH: 72,
    INDEPENDENT_MAX_ATTRIBUTES: 12000,
    INDEPENDENT_MAX_CSS_CHARS: 160000,
    INDEPENDENT_MAX_CSS_RULES: 1400,
    INDEPENDENT_MAX_DATA_URI_CHARS: 192000,
    byteLength: value => Buffer.byteLength(String(value || '')),
    republishIndependentSemanticFailure: (request, failure, next, extra) => {
        sandbox.lastDiagnostic = { request, failure, next, extra };
    },
    globalThis: {},
};
vm.createContext(sandbox);
vm.runInContext(`${source.slice(start, end)}
globalThis.check = assertIndependentMarkupComplexity;
globalThis.checkWithDiagnostic = assertIndependentMarkupComplexityWithDiagnostic;`, sandbox);
const check = sandbox.globalThis.check;

assert.doesNotThrow(() => check('<toto><details><summary>安全</summary><div>正文</div></details></toto>'));
assert.throws(() => check('<i></i>'.repeat(2101)), error => error?.kind === 'tags');
assert.throws(() => check('<div>'.repeat(73) + '</div>'.repeat(73)), error => error?.kind === 'depth');
const attributeBomb = Array.from({ length: 121 }, (_, row) => `<div ${Array.from({ length: 100 }, (_, i) => `a${row}_${i}="x"`).join(' ')}></div>`).join('');
assert.throws(() => check(attributeBomb), error => error?.kind === 'attributes');
assert.throws(() => check(`<style>${'.x{}'.repeat(1401)}</style>`), error => error?.kind === 'css-rules');
const dataUriBomb = Array.from({ length: 7 }, () => `<img src="data:image/png;base64,${'A'.repeat(30000)}">`).join('');
assert.throws(() => check(dataUriBomb), error => error?.kind === 'data-uri-chars');
sandbox.lastDiagnostic = null;
assert.throws(() => sandbox.globalThis.checkWithDiagnostic('<i></i>'.repeat(2101), 'raw', { ok: true }), error => error?.code === 'RABBIT_MIRROR_MARKUP_TOO_COMPLEX');
assert.equal(sandbox.lastDiagnostic?.failure, 'markup-too-complex');
assert.equal(sandbox.lastDiagnostic?.extra?.markupScope, 'raw');
assert.equal(sandbox.lastDiagnostic?.extra?.markupKind, 'tags');
assert.equal(sandbox.lastDiagnostic?.extra?.responseChars, '<i></i>'.repeat(2101).length);
const callStart = source.indexOf('async function callIndependentApi(');
const callEnd = source.indexOf('\nfunction externalOwnerMesid(', callStart);
const callSource = source.slice(callStart, callEnd);
const rawGateIndex = callSource.indexOf("assertIndependentMarkupComplexityWithDiagnostic(raw,'raw',requestDiagnostic)");
const multifaceBranchIndex = callSource.indexOf('if(faceCount>1)', rawGateIndex);
const singleExtractIndex = callSource.indexOf('const inner=extractMirrorInner(raw)', multifaceBranchIndex);
assert.ok(rawGateIndex >= 0 && multifaceBranchIndex > rawGateIndex && singleExtractIndex > multifaceBranchIndex, 'raw output must be checked before either multiface parsing or single-face extraction');
assert.match(callSource.slice(multifaceBranchIndex, singleExtractIndex), /prepareIndependentMultifaceResult\(raw,/, 'multiface output must enter its bounded protocol parser after the shared raw gate');
assert.match(source, /assertIndependentMarkupComplexityWithDiagnostic\(inner,'inner',requestDiagnostic\)/, 'inner output complexity failure must also correct the diagnostic state');
assert.match(source, /if\(!independentRecordWithinBudget\(completed\)\)/, 'completed records must be capped before persistence');

const sanitizerSource = fs.readFileSync(new URL('../src/outputSanitizer.js', import.meta.url), 'utf8');
const lexicalStart = sanitizerSource.indexOf('const RABBIT_MIRROR_MAX_TEMPLATE_NODES');
const lexicalEnd = sanitizerSource.indexOf('\nexport function validateRabbitMirrorTemplateStructuralBudget', lexicalStart);
assert.ok(lexicalStart >= 0 && lexicalEnd > lexicalStart);
const lexicalSandbox = { globalThis: {} };
vm.createContext(lexicalSandbox);
vm.runInContext(`${sanitizerSource.slice(lexicalStart, lexicalEnd).replace('export function validateRabbitMirrorMarkupLexicalBudget', 'function validateRabbitMirrorMarkupLexicalBudget')}
globalThis.check = validateRabbitMirrorMarkupLexicalBudget;`, lexicalSandbox);
const lexicalCheck = lexicalSandbox.globalThis.check;
assert.equal(lexicalCheck('<toto><details><summary>安全</summary><div>正文</div></details></toto>'), true);
assert.equal(lexicalCheck('<i></i>'.repeat(2101)), false, 'tag bomb must fail before DOM parsing');
assert.equal(lexicalCheck('<div>'.repeat(73) + '</div>'.repeat(73)), false, 'deep markup must fail before DOM parsing');
assert.equal(lexicalCheck(`<style>${'.x{}'.repeat(1401)}</style>`), false, 'CSS rule bomb must fail before DOM parsing');
assert.equal(lexicalCheck(`<img src="data:image/png;base64,${'A'.repeat(192100)}">`), false, 'oversized data URI must fail before DOM parsing');
for (const functionName of ['collectRawRabbitMirrorRoots', 'findCleanMaintenanceMirrorNode', 'parseHtmlFragment', 'parseTotoFragment']) {
    const startAt = sanitizerSource.indexOf(`function ${functionName}`);
    const parseAt = sanitizerSource.indexOf('template.innerHTML', startAt);
    const gateAt = sanitizerSource.indexOf('validateRabbitMirrorMarkupLexicalBudget', startAt);
    assert.ok(startAt >= 0 && gateAt > startAt && gateAt < parseAt, `${functionName} must gate before template.innerHTML`);
}

console.log('independent markup structural and persisted-record budgets passed');
