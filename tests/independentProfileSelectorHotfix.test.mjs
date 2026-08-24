import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const originalDocument = globalThis.document;
const originalMutationObserver = globalThis.MutationObserver;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

let timerId = 0;
const timers = new Map();
globalThis.setTimeout = (callback, delay = 0) => {
    const id = ++timerId;
    timers.set(id, { callback, delay: Number(delay) || 0 });
    return id;
};
globalThis.clearTimeout = id => timers.delete(id);
function runTimersThrough(maxDelay = Infinity) {
    while (true) {
        const next = [...timers.entries()]
            .filter(([, item]) => item.delay <= maxDelay)
            .sort((a, b) => a[1].delay - b[1].delay || a[0] - b[0])[0];
        if (!next) return;
        timers.delete(next[0]);
        next[1].callback();
    }
}

const counts = { ensure: 0, profiles: 0, selectWrites: 0 };
const nodes = new Map();
const documentListeners = new Map();

function fakeNode(extra = {}) {
    const listeners = new Map();
    return {
        id: '',
        style: {},
        dataset: {},
        options: [],
        value: '',
        parentElement: null,
        addEventListener(type, callback) { listeners.set(type, callback); },
        removeEventListener(type) { listeners.delete(type); },
        dispatch(type, event = {}) { listeners.get(type)?.({ currentTarget: this, target: this, ...event }); },
        remove() { if (this.id) nodes.delete(this.id); },
        ...extra,
    };
}

const card = fakeNode({
    appendChild(row) {
        row.parentElement = this;
        nodes.set(row.id, row);
        for (const child of row.__children || []) nodes.set(child.id, child);
    },
});
const importParent = fakeNode({ parentElement: card });
const importButton = fakeNode({ id: 'rh_independent_import_current', parentElement: importParent });
nodes.set(importButton.id, importButton);
nodes.set('rh_independent_connection_status', fakeNode({ id: 'rh_independent_connection_status', textContent: '' }));
nodes.set('rh_independent_model', fakeNode({ id: 'rh_independent_model' }));
const watermark = fakeNode({ textContent: 'old' });

globalThis.document = {
    getElementById(id) {
        if (id === 'rh_independent_import_current') counts.ensure += 1;
        return nodes.get(id) || null;
    },
    querySelector(selector) { return selector.includes('rabbit-mirror-toto-watermark') ? watermark : null; },
    createElement(tag) {
        const node = fakeNode({ tagName: String(tag).toUpperCase(), __children: [] });
        if (tag === 'div') {
            Object.defineProperty(node, 'innerHTML', {
                get() { return this.__html || ''; },
                set(value) {
                    this.__html = value;
                    const select = fakeNode({ id: 'rh_independent_profile_select', __html: '' });
                    Object.defineProperty(select, 'innerHTML', {
                        get() { return this.__html; },
                        set(html) { this.__html = html; counts.selectWrites += 1; },
                    });
                    this.__children = [select, fakeNode({ id: 'rh_independent_profile_refresh' })];
                },
            });
        }
        return node;
    },
    addEventListener(type, callback) { documentListeners.set(type, callback); },
    removeEventListener(type) { documentListeners.delete(type); },
};
globalThis.MutationObserver = class MutationObserver { observe() {} disconnect() {} };

const source = fs.readFileSync(path.join(root, 'src', 'independentProfileSelectorHotfix.js'), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const hotfix = await import(moduleUrl);
hotfix.initRabbitMirrorIndependentProfileSelectorHotfix({
    getSettings: () => ({ independentConnectionProfileId: 'p1' }),
    updateSettings: () => {},
    getIndependentConnectionProfiles: () => {
        counts.profiles += 1;
        return [{ id: 'p1', name: 'One', model: 'm1', api: 'custom' }];
    },
    refreshRabbitMirrorGenerationMode: () => {},
});

assert.deepEqual(counts, { ensure: 0, profiles: 0, selectWrites: 0 }, 'closed settings must do no profile work');
assert.equal(timers.size, 0, 'init must not schedule unconditional retries');

const drawerTarget = { closest: selector => selector.includes('inline-drawer-toggle') ? drawerTarget : null };
documentListeners.get('click')?.({ target: drawerTarget });
runTimersThrough(0);
assert.equal(counts.ensure, 1);
assert.equal(counts.profiles, 1);
assert.equal(counts.selectWrites, 1);

// Repeated clicks in an already-hydrated independent area stay cheap.
const areaTarget = { closest: selector => selector.includes('#rh_independent_api_fields') ? areaTarget : null };
documentListeners.get('click')?.({ target: areaTarget });
runTimersThrough(0);
assert.equal(counts.profiles, 1);
assert.equal(counts.selectWrites, 1);

nodes.get('rh_independent_profile_refresh').dispatch('click');
assert.equal(counts.profiles, 2);
assert.equal(counts.selectWrites, 2);

// Import refreshes only because the user explicitly requested connection work.
const importTarget = { closest: selector => selector.includes('#rh_independent_import_current') ? importTarget : null };
documentListeners.get('click')?.({ target: importTarget });
runTimersThrough(Infinity);
assert.equal(counts.profiles, 4);
assert.equal(counts.selectWrites, 4);

hotfix.destroyRabbitMirrorIndependentProfileSelectorHotfix();
globalThis.document = originalDocument;
globalThis.MutationObserver = originalMutationObserver;
globalThis.setTimeout = originalSetTimeout;
globalThis.clearTimeout = originalClearTimeout;
console.log('independentProfileSelectorHotfix tests passed');
