import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { register } from 'node:module';

// Run with the project's tests/hostLoader.mjs. Only the picker is fixed here;
// the Prompt Builder and its remaining collaborators are production modules.
register(new URL('./fixedPickerLoader.mjs', import.meta.url));
const fixtures = JSON.parse(fs.readFileSync(new URL('./prompt-baseline-fixtures.json', import.meta.url), 'utf8'));
const extraFixtures = JSON.parse(fs.readFileSync(new URL('./prompt-extra-fixtures.json', import.meta.url), 'utf8'));
const allCases = [...fixtures.cases, ...extraFixtures.cases];
const uiSource = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
const permission = '可随本轮内容自由活用 HTML / CSS / 安全内联 SVG 等视觉技法；媒介与组合方式自由选择，不要求每轮使用 SVG。';
const hash = value => createHash('sha256').update(value).digest('hex');
const values = new Map();
const previousStorage = globalThis.localStorage;
const previousPick = globalThis.__rmFixedPick;
const previousDiagnostics = globalThis.__rabbitMirrorPerfDiag;
const previousFetch = globalThis.fetch;
let storageWrites = 0;
globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { storageWrites += 1; values.set(key, String(value)); },
    removeItem: key => values.delete(key),
};
globalThis.fetch = () => { throw new Error('Enhanced visual drawing must not request a network resource'); };

try {
    const { defaultSettings, getSettings, updateSettings, resetSettings, MODULE_NAME } = await import('../src/settings.js');
    const { extension_settings } = await import('../../../../extensions.js');
    const { buildRabbitMirrorPromptDetails } = await import('../src/promptBuilder.js');
    const { estimatePromptTokens } = await import('../src/tokenMeter.js');

    assert.equal(defaultSettings.enhancedVisualDrawing, false, 'fresh install must leave the permission OFF');
    assert.equal(fixtures.cases.length, 64, 'independent pre-change evidence covers 8 formats and both API/sampling/editing routes');
    assert.equal(extraFixtures.cases.length, 128, 'additional original-ZIP captures cover compact/full raw policies');
    assert.deepEqual([...new Set(allCases.map(item => item.overrides.rawPolicy || 'balanced'))].sort(), ['balanced', 'compact', 'full']);
    assert.equal(new Set(fixtures.cases.map(item => item.picked.combo.formatIds[0])).size, 8);
    assert.deepEqual([...new Set(fixtures.cases.map(item => item.generationType))].sort(), ['independent', 'normal']);
    const tokenDeltas = [];

    for (const fixture of allCases) {
        values.clear();
        globalThis.__rmFixedPick = fixture.picked;
        const settings = { ...structuredClone(defaultSettings), ...fixture.overrides };
        const invoke = options => buildRabbitMirrorPromptDetails(options, fixture.generationType, null, fixture.name, fixture.context);
        const off = invoke({ ...settings, enhancedVisualDrawing: false });
        // These hashes came from the untouched uploaded ZIP, not from removing
        // the new permission from the current implementation's ON output.
        assert.equal(hash(off.prompt), fixture.promptSha256, `${fixture.name}: OFF prompt bytes must match original ZIP`);
        assert.equal(off.prompt.length, fixture.promptChars, `${fixture.name}: OFF character count`);
        assert.equal(Buffer.byteLength(off.prompt, 'utf8'), fixture.promptBytes, `${fixture.name}: OFF byte count`);
        assert.equal(hash(off.executionLock), fixture.executionLockSha256, `${fixture.name}: OFF execution lock`);
        assert.equal(hash(JSON.stringify(off.metadata)), fixture.metadataSha256, `${fixture.name}: OFF complete metadata`);
        assert.deepEqual(estimatePromptTokens(off.prompt), fixture.tokens, `${fixture.name}: OFF token accounting`);
        assert.ok(!off.prompt.includes(permission), `${fixture.name}: OFF must add zero permission characters`);

        const absentSettings = { ...settings };
        delete absentSettings.enhancedVisualDrawing;
        assert.deepEqual(invoke(absentSettings), off, `${fixture.name}: absent legacy setting must be OFF`);

        const on = invoke({ ...settings, enhancedVisualDrawing: true });
        assert.deepEqual(on.metadata, off.metadata, `${fixture.name}: permission must not change selected formats/themes or other metadata`);
        assert.equal(on.executionLock, off.executionLock, `${fixture.name}: near-output lock must remain byte-identical`);
        assert.equal(on.prompt.split(permission).length - 1, 1, `${fixture.name}: one permission per request, not per face or format`);
        assert.equal(on.prompt.length - off.prompt.length, permission.length + 2, `${fixture.name}: only permission and one block separator added`);

        // Independently locate the existing global visual floor in the verified
        // OFF payload; all preceding and following bytes retain their order.
        const floorStart = off.prompt.indexOf('全局视觉地板【始终适用】：');
        assert.ok(floorStart >= 0, `${fixture.name}: required global visual floor exists`);
        const insertion = off.prompt.indexOf('\n\n', floorStart);
        assert.ok(insertion > floorStart, `${fixture.name}: find end of existing floor block`);
        const expectedOn = `${off.prompt.slice(0, insertion)}\n\n${permission}${off.prompt.slice(insertion)}`;
        assert.equal(on.prompt, expectedOn, `${fixture.name}: permission must not override, reorder, or replace any original block`);
        const delta = estimatePromptTokens(on.prompt).estimatedTokens - fixture.tokens.estimatedTokens;
        assert.ok(delta > 0 && delta <= 64, `${fixture.name}: the sole permission must stay a short addition, got ${delta} tokens`);
        tokenDeltas.push(delta);

        // Model choice, temperatures, API triggering and runtime output are not
        // under test here. This covers only the real production prompt boundary.
    }
    assert.equal(storageWrites, 0, 'building OFF/ON prompts must not persist UI/cache/history state');

    const invalidValues = [undefined, null, 0, 1, -1, '', 'false', 'true', [], {}, NaN, Infinity];
    const invalidFixture = fixtures.cases[0];
    globalThis.__rmFixedPick = invalidFixture.picked;
    const invalidBase = { ...structuredClone(defaultSettings), ...invalidFixture.overrides };
    for (const value of invalidValues) {
        extension_settings[MODULE_NAME] = { ...structuredClone(defaultSettings), enhancedVisualDrawing: value };
        assert.equal(getSettings().enhancedVisualDrawing, false, `legacy value ${String(value)} must normalize to false`);
        updateSettings({ enhancedVisualDrawing: true });
        assert.equal(getSettings().enhancedVisualDrawing, true);
        updateSettings({ enhancedVisualDrawing: value });
        assert.equal(extension_settings[MODULE_NAME].enhancedVisualDrawing, false, 'updateSettings must immediately normalize, before a later read');
        const direct = buildRabbitMirrorPromptDetails({ ...invalidBase, enhancedVisualDrawing: value }, invalidFixture.generationType, null, invalidFixture.name, invalidFixture.context);
        assert.equal(hash(direct.prompt), invalidFixture.promptSha256, 'direct builder callers must also require literal true');
    }
    extension_settings[MODULE_NAME] = { mode: 'integrated', visualExtraPrompt: '保留已有自定义偏好' };
    assert.equal(getSettings().enhancedVisualDrawing, false, 'upgrading an old settings object must not enable drawing');
    assert.equal(getSettings().visualExtraPrompt, '保留已有自定义偏好');
    updateSettings({ enhancedVisualDrawing: true });
    extension_settings[MODULE_NAME] = JSON.parse(JSON.stringify(extension_settings[MODULE_NAME]));
    assert.equal(getSettings().enhancedVisualDrawing, true, 'saved boolean must survive settings reload');
    const stable = JSON.stringify(getSettings());
    getSettings();
    assert.equal(JSON.stringify(getSettings()), stable, 'repeated reads/chat changes must not toggle the global setting');
    resetSettings();
    assert.equal(getSettings().enhancedVisualDrawing, false, 'reset must restore OFF');

    // UI contract tests execute the production change callback, fill statement,
    // and init completeness guard with a minimal jQuery/host double. They are
    // not a real browser or complete SillyTavern integration test.
    const inputId = 'rh_enhanced_visual_drawing';
    const helpId = 'rh_enhanced_visual_drawing_help';
    const labelMatch = uiSource.match(/<label\b[^>]*for="rh_enhanced_visual_drawing"[^>]*>[\s\S]*?<\/label>/);
    assert.ok(labelMatch, 'a complete visible label must activate the native checkbox');
    assert.match(labelMatch[0], /<input\b[^>]*id="rh_enhanced_visual_drawing"[^>]*type="checkbox"/);
    assert.match(labelMatch[0], /aria-describedby="rh_enhanced_visual_drawing_help"/);
    assert.match(labelMatch[0], /增强视觉绘制/);
    assert.equal((uiSource.match(/id="rh_enhanced_visual_drawing"/g) || []).length, 1);
    assert.equal((uiSource.match(/id="rh_enhanced_visual_drawing_help"/g) || []).length, 1);
    assert.ok(uiSource.indexOf(labelMatch[0]) > uiSource.indexOf('id="rh_advanced_page_visual"'));
    assert.ok(uiSource.indexOf(labelMatch[0]) < uiSource.indexOf('id="rh_visual_prompt_enabled"'), 'drawing must be independent of editable visual prompt enablement');

    const bindStart = uiSource.indexOf("$('#rh_enhanced_visual_drawing').on('change', e => {");
    const bindEnd = uiSource.indexOf('\n    });', bindStart) + '\n    });'.length;
    assert.ok(bindStart >= 0 && bindEnd > bindStart);
    const bindSource = uiSource.slice(bindStart, bindEnd);
    assert.equal(uiSource.split("$('#rh_enhanced_visual_drawing').on(").length - 1, 1, 'only one listener site is allowed');
    assert.doesNotMatch(bindSource, /setTimeout|setInterval|Observer|fetch|clearLastCombo|refreshRabbitMirrorGenerationMode/);
    const fillSource = uiSource.match(/checked\('#rh_enhanced_visual_drawing', settings\.enhancedVisualDrawing === true\);/)?.[0];
    assert.ok(fillSource, 'rebuild must fill the strict saved boolean');
    const checkedStart = uiSource.indexOf('function checked(id, value) {');
    const checkedEnd = uiSource.indexOf('\n}\n', checkedStart) + 2;
    assert.ok(checkedStart >= 0 && checkedEnd > checkedStart);
    let listener = null;
    let boundCount = 0;
    let savedCount = 0;
    let checkboxState = false;
    globalThis.__rabbitMirrorPerfDiag = { mark(name) { if (name === 'settings.saveScheduled') savedCount += 1; } };
    const uiContext = vm.createContext({
        $: selector => {
            assert.equal(selector, `#${inputId}`);
            return {
                on(event, callback) { assert.equal(event, 'change'); boundCount += 1; listener = callback; },
                prop(name, value) { assert.equal(name, 'checked'); checkboxState = value; },
            };
        },
        updateSettings,
        settings: getSettings(),
    });
    vm.runInContext(uiSource.slice(checkedStart, checkedEnd), uiContext);
    vm.runInContext(bindSource, uiContext);
    vm.runInContext(fillSource, uiContext);
    assert.equal(checkboxState, false);
    assert.equal(boundCount, 1);
    listener({ target: { checked: true } });
    assert.equal(savedCount, 1, 'one user change must schedule one settings save');
    assert.equal(getSettings().enhancedVisualDrawing, true);
    uiContext.settings = getSettings();
    vm.runInContext(fillSource, uiContext);
    assert.equal(checkboxState, true, 'reopening reads the saved ON value');
    listener({ target: { checked: false } });
    assert.equal(savedCount, 2);
    uiContext.settings = getSettings();
    vm.runInContext(fillSource, uiContext);
    assert.equal(checkboxState, false, 'reopening reads the saved OFF value');

    // Execute the real init prefix, including early return and stale DOM cleanup.
    // Stopping before settingsMount intentionally avoids faking the whole UI.
    const initStart = uiSource.indexOf('export function initRabbitMirrorUI() {');
    const initEnd = uiSource.indexOf('    const settingsMount = ', initStart);
    assert.ok(initStart >= 0 && initEnd > initStart);
    const initPrefix = `${uiSource.slice(initStart, initEnd).replace('export function', 'function')}\nreturn 'rebuild';\n}`;
    function initDecision(inputCount, helpCount, panelCount = 1) {
        let removals = 0;
        let completenessCalls = 0;
        const panelToken = {};
        const panel = {
            attr: () => 'true',
            find: selector => ({ length: selector === '#rh_independent_api_section #rh_independent_api_diagnostic' ? 0 : 1 }),
        };
        const advanced = { length: 1, find: selector => ({ length: selector === `#${inputId}` ? inputCount : selector === `#${helpId}` ? helpCount : 1 }) };
        const ordinaryModal = { length: 1, find: () => ({ length: 1 }) };
        const existing = {
            length: panelCount,
            filter: () => ({ filter(callback) { completenessCalls += 1; return { length: callback(0, panelToken) ? panelCount : 0 }; } }),
            remove() { removals += 1; },
        };
        const context = vm.createContext({
            isCurrentRuntime: () => true,
            getSettings,
            uiMountRetryCount: 0,
            SETTINGS_UI_VERSION: 'test-current',
            RUNTIME_VERSION: 'test-current',
            $: selector => {
                if (selector === panelToken) return panel;
                if (selector === '#rabbit_mirror_theater_settings') return existing;
                if (selector === 'body > #rh_advanced_modal') return advanced;
                if (selector === 'body > #rh_world_info_prompt_modal' || selector === 'body > #rh_independent_tag_filter_modal') return ordinaryModal;
                if (selector === 'body > #rh_advanced_modal, body > #rh_world_info_prompt_modal, body > #rh_independent_tag_filter_modal') return { remove() { removals += 1; } };
                throw new Error(`Unexpected selector in init boundary: ${String(selector)}`);
            },
        });
        vm.runInContext(initPrefix, context);
        const decision = vm.runInContext('initRabbitMirrorUI()', context);
        return { decision, removals, completenessCalls };
    }
    assert.deepEqual(initDecision(1, 1), { decision: undefined, removals: 0, completenessCalls: 1 }, 'same-version complete DOM must early-return without re-binding');
    assert.deepEqual(initDecision(1, 1), { decision: undefined, removals: 0, completenessCalls: 1 }, 'repeated initialization remains idempotent');
    for (const [inputCount, helpCount, panels] of [[0, 1, 1], [2, 1, 1], [1, 0, 1], [1, 2, 1], [1, 1, 2]]) {
        assert.deepEqual(initDecision(inputCount, helpCount, panels), { decision: 'rebuild', removals: 2, completenessCalls: 1 }, 'missing/duplicate controls or panels must trigger existing cleanup/rebuild');
    }
    assert.equal(initDecision(0, 0, 0).decision, 'rebuild', 'first initialization requires mounting');
    assert.match(uiSource.slice(uiSource.indexOf('export function destroyRabbitMirrorUI()')), /\$\('#rh_advanced_modal, #rh_world_info_prompt_modal, #rh_independent_tag_filter_modal'\)\.remove\(\)/, 'destroy removes the control-owned event listeners with their modal');

    console.log(`enhancedVisualDrawing tests passed: ${allCases.length} independently captured OFF prompts, ON +${permission.length + 2} chars / +${Math.min(...tokenDeltas)}..${Math.max(...tokenDeltas)} estimated tokens; strict settings and isolated UI contracts. Browser/host integration is separate.`);
} finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
    if (previousPick === undefined) delete globalThis.__rmFixedPick;
    else globalThis.__rmFixedPick = previousPick;
    if (previousDiagnostics === undefined) delete globalThis.__rabbitMirrorPerfDiag;
    else globalThis.__rabbitMirrorPerfDiag = previousDiagnostics;
    globalThis.fetch = previousFetch;
}
