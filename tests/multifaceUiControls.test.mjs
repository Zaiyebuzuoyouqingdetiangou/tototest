import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const values = new Map();
globalThis.localStorage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
};
globalThis.sessionStorage = globalThis.localStorage;
globalThis.dispatchEvent = () => true;
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };

const settingsModule = await import('../src/settings.js');
const { extension_settings } = await import('../../../../extensions.js');
const uiSource = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
extension_settings[settingsModule.MODULE_NAME] = structuredClone(settingsModule.defaultSettings);

// The production DOM must contain one complete toggle/count group. Enhanced
// drawing follows dynamic visual directly so the two compatible controls stay
// discoverable together.
for (const id of ['rh_multiface_enabled', 'rh_multiface_count', 'rh_multiface_count_row', 'rh_multiface_help']) {
    assert.equal((uiSource.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} must exist exactly once`);
}
const selectMarkup = uiSource.match(/<select id="rh_multiface_count"[\s\S]*?<\/select>/)?.[0] || '';
assert.deepEqual([...selectMarkup.matchAll(/<option value="(\d)">/g)].map(match => Number(match[1])), [2, 3, 4, 5]);
const dynamicStart = uiSource.indexOf('<input id="rh_force_visual_scenery"');
const dynamicLabelEnd = uiSource.indexOf('</label>', dynamicStart) + '</label>'.length;
const enhancedStart = uiSource.indexOf('<label for="rh_enhanced_visual_drawing"');
assert.ok(dynamicStart >= 0 && dynamicLabelEnd > dynamicStart && enhancedStart > dynamicLabelEnd);
assert.doesNotMatch(uiSource.slice(dynamicLabelEnd, enhancedStart), /<label\b/, 'enhanced drawing must be the next control after dynamic visual');

class Control {
    constructor() {
        this.value = '';
        this.props = new Map();
        this.listeners = new Map();
    }
    on(event, callback) { this.listeners.set(event, callback); return this; }
    val(value) {
        if (arguments.length) { this.value = String(value); return this; }
        return this.value;
    }
    prop(name, value) {
        if (arguments.length > 1) { this.props.set(name, value); return this; }
        return this.props.get(name);
    }
    fire(event, target) {
        const callback = this.listeners.get(event);
        assert.equal(typeof callback, 'function', `${event} listener must be bound`);
        callback({ target });
    }
}

const controls = new Map([
    ['#rh_enhanced_visual_drawing', new Control()],
    ['#rh_multiface_enabled', new Control()],
    ['#rh_multiface_count', new Control()],
    ['#rh_multiface_count_row', new Control()],
]);
controls.get('#rh_multiface_count').value = '2';
const $ = selector => {
    const control = controls.get(selector);
    if (!control) throw new Error(`unexpected selector ${selector}`);
    return control;
};
const checked = (selector, value) => $(selector).prop('checked', value);

const bindStart = uiSource.indexOf("$('#rh_enhanced_visual_drawing').on('change'");
const bindEnd = uiSource.indexOf("$('#rh_visual_prompt_enabled').on('change'", bindStart);
assert.ok(bindStart >= 0 && bindEnd > bindStart);
const bindingSource = uiSource.slice(bindStart, bindEnd);
const fillStart = uiSource.indexOf("checked('#rh_enhanced_visual_drawing'");
const fillLast = uiSource.indexOf("$('#rh_multiface_count').prop('disabled'", fillStart);
const fillEnd = uiSource.indexOf('\n', fillLast);
assert.ok(fillStart >= 0 && fillEnd > fillStart);
const fillSource = uiSource.slice(fillStart, fillEnd);

const sandbox = {
    $,
    checked,
    settings: settingsModule.getSettings(),
    updateSettings: settingsModule.updateSettings,
};
vm.createContext(sandbox);
vm.runInContext(bindingSource, sandbox);
const fill = () => {
    sandbox.settings = settingsModule.getSettings();
    vm.runInContext(fillSource, sandbox);
};

fill();
assert.equal(settingsModule.getSettings().rabbitMirrorFaceCount, 1);
assert.equal(controls.get('#rh_multiface_enabled').prop('checked'), false);
assert.equal(controls.get('#rh_multiface_count').val(), '2');
assert.equal(controls.get('#rh_multiface_count_row').prop('hidden'), true);
assert.equal(controls.get('#rh_multiface_count').prop('disabled'), true);

controls.get('#rh_multiface_enabled').fire('change', { checked: true });
assert.equal(settingsModule.getSettings().rabbitMirrorFaceCount, 2);
assert.equal(controls.get('#rh_multiface_count_row').prop('hidden'), false);
assert.equal(controls.get('#rh_multiface_count').prop('disabled'), false);

for (const count of [2, 3, 4, 5]) {
    controls.get('#rh_multiface_count').fire('change', { value: String(count) });
    assert.equal(settingsModule.getSettings().rabbitMirrorFaceCount, count);
    const saved = JSON.stringify(settingsModule.getSettings());
    extension_settings[settingsModule.MODULE_NAME] = JSON.parse(saved);
    assert.equal(settingsModule.getSettings().rabbitMirrorFaceCount, count, `${count} faces must survive a settings reload`);
    fill();
    assert.equal(controls.get('#rh_multiface_enabled').prop('checked'), true);
    assert.equal(controls.get('#rh_multiface_count').val(), String(count));
    assert.equal(controls.get('#rh_multiface_count_row').prop('hidden'), false);
    assert.equal(controls.get('#rh_multiface_count').prop('disabled'), false);
}

controls.get('#rh_multiface_enabled').fire('change', { checked: false });
assert.equal(settingsModule.getSettings().rabbitMirrorFaceCount, 1, 'turning multiface off must restore the single-face contract');
fill();
assert.equal(controls.get('#rh_multiface_enabled').prop('checked'), false);
assert.equal(controls.get('#rh_multiface_count').val(), '2', 'the disabled UI shows the safe next-enable default');
assert.equal(controls.get('#rh_multiface_count_row').prop('hidden'), true);
assert.equal(controls.get('#rh_multiface_count').prop('disabled'), true);

// Execute the real initialization completeness gate: missing or duplicate
// multiface controls invalidate a same-version DOM and force cleanup/rebuild.
const initStart = uiSource.indexOf('export function initRabbitMirrorUI() {');
const initEnd = uiSource.indexOf('    const settingsMount = ', initStart);
assert.ok(initStart >= 0 && initEnd > initStart);
const initPrefix = `${uiSource.slice(initStart, initEnd).replace('export function', 'function')}\nreturn 'rebuild';\n}`;

function initDecision(enabledCount, selectCount, enhancedCount = 1, panelCount = 1) {
    let removals = 0;
    const panelToken = {};
    const panel = {
        attr: () => 'true',
        find: selector => ({ length: selector === '#rh_independent_api_section #rh_independent_api_diagnostic' ? 0 : 1 }),
    };
    const advanced = {
        length: 1,
        find(selector) {
            if (selector === '#rh_advanced_page_generation #rh_multiface_enabled') return { length: enabledCount };
            if (selector === '#rh_advanced_page_generation #rh_multiface_count') return { length: selectCount };
            if (selector === '#rh_advanced_page_generation #rh_enhanced_visual_drawing' || selector === '#rh_enhanced_visual_drawing' || selector === '#rh_enhanced_visual_drawing_help') return { length: enhancedCount };
            return { length: 1 };
        },
    };
    const ordinaryModal = { length: 1, find: () => ({ length: 1 }) };
    const existing = {
        length: panelCount,
        filter: () => ({ filter(callback) { return { length: callback(0, panelToken) ? panelCount : 0 }; } }),
        remove() { removals += 1; },
    };
    const context = vm.createContext({
        isCurrentRuntime: () => true,
        getSettings: settingsModule.getSettings,
        uiMountRetryCount: 0,
        SETTINGS_UI_VERSION: 'test-current',
        RUNTIME_VERSION: 'test-current',
        $: selector => {
            if (selector === panelToken) return panel;
            if (selector === '#rabbit_mirror_theater_settings') return existing;
            if (selector === 'body > #rh_advanced_modal') return advanced;
            if (selector === 'body > #rh_world_info_prompt_modal' || selector === 'body > #rh_independent_tag_filter_modal') return ordinaryModal;
            if (selector === 'body > #rh_advanced_modal, body > #rh_world_info_prompt_modal, body > #rh_independent_tag_filter_modal') return { remove() { removals += 1; } };
            throw new Error(`unexpected init selector ${String(selector)}`);
        },
    });
    vm.runInContext(initPrefix, context);
    return { decision: vm.runInContext('initRabbitMirrorUI()', context), removals };
}

assert.deepEqual(initDecision(1, 1), { decision: undefined, removals: 0 });
for (const [enabledCount, selectCount] of [[0, 1], [2, 1], [1, 0], [1, 2]]) {
    assert.deepEqual(initDecision(enabledCount, selectCount), { decision: 'rebuild', removals: 2 });
}
assert.deepEqual(initDecision(1, 1, 0), { decision: 'rebuild', removals: 2 }, 'the adjacent enhanced control is part of the same DOM completeness contract');

console.log('multiface UI controls: off=1, on=2..5, reload, adjacency and DOM completeness passed');
