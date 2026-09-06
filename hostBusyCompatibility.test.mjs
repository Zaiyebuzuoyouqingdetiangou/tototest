import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const start = source.indexOf('function hostControlVisible(');
const end = source.indexOf('function stableHostChatSignature(', start);
assert.ok(start >= 0 && end > start, 'busy compatibility helpers must be present');
const helperSource = source.slice(start, end);

assert.match(helperSource, /hostControlVisible\('#mes_stop'\)/, 'official SillyTavern stop control must be recognized');
assert.match(helperSource, /hostControlVisible\('#stop_but'\)/, 'legacy or forked stop control must remain supported');
assert.doesNotMatch(helperSource, /setTimeout|setInterval|MutationObserver|querySelectorAll/, 'busy detection must not add polling, observers or chat scans');

const makeNode = ({
    hidden = false,
    classes = [],
    ariaHidden = null,
    display = 'flex',
    visibility = 'visible',
    contentVisibility = 'visible',
    rects = 1,
} = {}) => ({
    hidden,
    __style: { display, visibility, contentVisibility },
    classList: { contains: name => classes.includes(name) },
    getAttribute: name => name === 'aria-hidden' ? ariaHidden : null,
    getClientRects: () => Array.from({ length: rects }, () => ({})),
});

const factory = new Function('globalThis', 'document', `${helperSource}\nreturn { hostControlVisible, hostLooksBusy };`);

function run({ context = {}, mesStop = null, stopBut = null, streaming = false } = {}) {
    const globalObject = {
        SillyTavern: { getContext: () => context },
        is_send_press: false,
        is_group_generating: false,
        getComputedStyle: node => node.__style,
    };
    const documentObject = {
        querySelector(selector) {
            if (selector.startsWith('#chat .mes.streaming')) return streaming ? makeNode() : null;
            if (selector === '#mes_stop') return mesStop;
            if (selector === '#stop_but') return stopBut;
            return null;
        },
    };
    return factory(globalObject, documentObject).hostLooksBusy();
}

assert.equal(run({ context: { isGenerating: true } }), true, 'explicit modern generating flag must win');
assert.equal(run({ context: { is_generating: true } }), true, 'legacy generating flag must remain supported');
assert.equal(run({ streaming: true }), true, 'streaming message marker must remain supported');
assert.equal(run({ mesStop: makeNode() }), true, 'visible official #mes_stop must mark the host busy');
assert.equal(run({ mesStop: makeNode({ display: 'none' }) }), false, 'display:none #mes_stop must not block deferred runtime forever');
assert.equal(run({ mesStop: makeNode({ visibility: 'hidden' }) }), false, 'visibility:hidden #mes_stop must not count as busy');
assert.equal(run({ mesStop: makeNode({ contentVisibility: 'hidden' }) }), false, 'content-visibility:hidden #mes_stop must not count as busy');
assert.equal(run({ mesStop: makeNode({ hidden: true }) }), false, 'hidden #mes_stop must not count as busy');
assert.equal(run({ mesStop: makeNode({ classes: ['displayNone'] }) }), false, 'displayNone #mes_stop must not count as busy');
assert.equal(run({ mesStop: makeNode({ ariaHidden: 'true' }) }), false, 'aria-hidden #mes_stop must not count as busy');
assert.equal(run({ mesStop: makeNode({ rects: 0 }) }), false, 'non-rendered #mes_stop must not count as busy');
assert.equal(run({ stopBut: makeNode() }), true, 'visible forked #stop_but must remain supported');
assert.equal(run(), false, 'no busy evidence must stay idle');

console.log('host busy compatibility tests passed');
