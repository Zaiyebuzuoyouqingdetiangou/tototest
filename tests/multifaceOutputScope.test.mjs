import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/outputSanitizer.js', import.meta.url), 'utf8');

function extractFunction(name) {
    const marker = `function ${name}(`;
    const start = source.indexOf(marker);
    assert.notEqual(start, -1, `missing ${name}`);
    const bodyStart = source.indexOf('{', start + marker.length);
    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        else if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`unterminated ${name}`);
}

class Node {
    constructor(kind, attributes = {}) {
        this.kind = kind;
        this.attributes = attributes;
        this.children = [];
        this.parentElement = null;
    }
    append(...children) {
        for (const child of children) { child.parentElement = this; this.children.push(child); }
        return this;
    }
    matches(selector) {
        if (selector === 'details') return this.kind === 'details';
        if (selector === 'toto[data-rabbit-mirror="true"], toto[data-rabbit-hole="true"]') return this.kind === 'toto';
        if (selector === '[data-rabbit-mirror-external-source="true"][data-rm-source="independent"]') return this.kind === 'external';
        return false;
    }
    closest(selector) {
        for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node;
        return null;
    }
    querySelector(selector) {
        if (selector === ':scope > details') return this.children.find(child => child.kind === 'details') || null;
        return null;
    }
}

const program = [
    'const MIRROR_TOTO_SELECTOR = `toto[data-rabbit-mirror="true"], toto[data-rabbit-hole="true"]`;',
    'const rabbitMirrorFacePositionHints = new WeakMap();',
    extractFunction('independentMaintenanceHost'),
    extractFunction('getRabbitMirrorFacePosition').replace('export function', 'function'),
    extractFunction('exactIndependentMaintenanceRoot'),
    'globalThis.probe={getRabbitMirrorFacePosition,exactIndependentMaintenanceRoot};',
].join('\n');
const sandbox = { isRabbitMirrorDetails: () => true };
vm.runInNewContext(program, sandbox);

const external = new Node('external');
const externalFaces = Array.from({ length: 5 }, () => new Node('details'));
external.append(...externalFaces);
for (let index = 0; index < externalFaces.length; index += 1) {
    const info = sandbox.probe.getRabbitMirrorFacePosition(externalFaces[index]);
    assert.deepEqual(JSON.parse(JSON.stringify({ faceIndex: info.faceIndex, faceCount: info.faceCount, source: info.source })),
        { faceIndex: index, faceCount: 5, source: 'independent' });
    assert.equal(sandbox.probe.exactIndependentMaintenanceRoot(externalFaces[index]), externalFaces[index]);
}
const hostileNested = new Node('details');
externalFaces[1].append(hostileNested);
assert.equal(sandbox.probe.getRabbitMirrorFacePosition(hostileNested), null, 'nested generated details cannot claim a face');
assert.equal(sandbox.probe.exactIndependentMaintenanceRoot(hostileNested), null, 'nested tools must fail closed instead of jumping to face one');

const inlineHost = new Node('div');
const inlineTotos = Array.from({ length: 3 }, () => new Node('toto').append(new Node('details')));
inlineHost.append(...inlineTotos);
for (let index = 0; index < inlineTotos.length; index += 1) {
    const info = sandbox.probe.getRabbitMirrorFacePosition(inlineTotos[index]);
    assert.equal(info.faceIndex, index);
    assert.equal(info.faceCount, 3);
    assert.equal(info.source, 'inline');
}

assert.match(source, /RABBIT_MIRROR_OWNER_MODEL_ATTR_RE\.test\(name\)/, 'model owner/face attributes must be stripped');
assert.match(source, /maintenanceSnapshotKey[\s\S]*:face:\$\{faceIndex\}/, 'repair snapshots must be face-scoped');
assert.match(source, /captureMaintenanceRepairOrigin[\s\S]*ownerKey, faceIndex/, 'repair runs must retain the trusted face index');
assert.match(source, /rabbitMirrorRecipeIdentity[\s\S]*\{ faceIndex \}/, 'recipe lookup must receive the local face index');
assert.match(source, /feedbackCatIndependentOwner[\s\S]*\{ faceIndex \}/, 'the cat bridge owner must receive the local face index');
assert.match(source, /cleanRabbitMirrorInteractionResetClone[\s\S]*INTERACTION_HOME_ATTR/, 'runtime home controls must not enter the saved baseline');
assert.match(source, /restoreRabbitMirrorInteractionResetSnapshot[\s\S]*notifyIndependentRepairPersistence\(restoredRoot\)/,
    'resetting an independent face must persist the actual restored face');

console.log('multiface output scope: five direct faces, nested fail-closed, per-face tools and interaction home contract passed');
