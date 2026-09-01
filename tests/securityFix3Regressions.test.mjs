import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFileSync(resolve(ROOT, relative), 'utf8');
const style = read('style.css');
const ui = read('src/ui.js');
const independent = read('src/independentApi.js');
const sanitizer = read('src/outputSanitizer.js');
const mobileModal = read('src/mobileModalHotfix.js');

// Body-level desktop dialogs retain the settings button contract without inheriting
// the settings drawer's layout containment.
assert.match(style, /\.rabbit-mirror-advanced-modal button\.menu_button,[\s\S]*#rh_world_info_prompt_modal button\.menu_button/);
assert.match(style, /\.rabbit-mirror-advanced-modal button\.menu_button\.rh-advanced-choice \{[\s\S]*display: block !important;[\s\S]*white-space: normal !important;/);
assert.doesNotMatch(ui, /SmartThemeBodyColorText/);
assert.match(ui, /id="rh_advanced_modal_card"[^\n]*background:var\(--SmartThemeBlurTintColor[^\n]*color:var\(--SmartThemeBodyColor/);
assert.match(ui, /id="rh_world_info_prompt_modal"[\s\S]*background:var\(--SmartThemeBlurTintColor[^\n]*color:var\(--SmartThemeBodyColor/);
assert.match(mobileModal, /TARGET_IDS = \['rh_advanced_modal', 'rh_world_info_prompt_modal', 'rh_independent_tag_filter_modal'\]/);
assert.match(mobileModal, /rh_independent_tag_filter_close/);

// Forced resay must enter the existing loading renderer. That renderer is the one
// which preserves current ready details and installs exactly one aria-live status.
const generateStart = independent.indexOf('async function generateFor(index,msg,force=false,sourceAware=true,multifaceResay=null)');
const generateEnd = independent.indexOf('function independentHostForRoot', generateStart);
const generateBlock = independent.slice(generateStart, generateEnd);
assert.ok(generateBlock.length > 0);
assert.doesNotMatch(generateBlock, /if\(!\(force && previousReadyRecord\?\.html\)\)/);
assert.match(generateBlock, /collapseDuplicateIdentityHosts[\s\S]*ensureExternalUi\(el,key,'正在读取当前上下文并生成兔子镜……','loading'/);
assert.match(generateBlock, /manual:!!force/);
assert.match(independent, /if\(state==='loading' && currentReady\)[\s\S]*showIndependentResayStatus\(host\)/);
assert.match(independent, /status\.textContent='🐇 正在重新生成兔子镜……旧版本会保留到新版本完成'/);
const syncStart = independent.indexOf('function syncMessages(indices=null)');
const syncEnd = independent.indexOf('function visibleMessageIndices', syncStart);
const syncBlock = independent.slice(syncStart, syncEnd > syncStart ? syncEnd : undefined);
assert.match(syncBlock, /const manualResayPending=!!\(activePending\?\.manual/);
assert.match(syncBlock, /if\(manualResayPending\)[\s\S]*ensureExternalUi\(el,key,'正在读取当前上下文并生成兔子镜……','loading'/);

function extractFrom(source, name) {
    const start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `missing ${name}`);
    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        else if (source[index] === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(start, index + 1);
        }
    }
    throw new Error(`unterminated ${name}`);
}

const statusSandbox = {
    document: {
        createElement() {
            return {
                attributes: new Map(),
                setAttribute(name, value) { this.attributes.set(name, String(value)); },
                remove() { this.removed = true; },
            };
        },
    },
};
vm.createContext(statusSandbox);
vm.runInContext([
    extractFrom(independent, 'clearIndependentResayStatus'),
    extractFrom(independent, 'showIndependentResayStatus'),
    'globalThis.statusProbe={clearIndependentResayStatus,showIndependentResayStatus};',
].join('\n'), statusSandbox);
const statusHost = {
    dataset: {},
    attributes: new Map(),
    children: [],
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    removeAttribute(name) { this.attributes.delete(name); },
    querySelector() { return this.children.find(child => child.attributes?.get('data-rabbit-mirror-resay-status') === 'true') || null; },
    prepend(child) { this.children.unshift(child); },
};
const firstStatus = statusSandbox.statusProbe.showIndependentResayStatus(statusHost);
const secondStatus = statusSandbox.statusProbe.showIndependentResayStatus(statusHost);
assert.equal(firstStatus, secondStatus, 'repeated resay status updates must reuse one node');
assert.equal(statusHost.children.length, 1);
assert.equal(statusHost.dataset.rmPending, 'true');
assert.equal(statusHost.attributes.get('aria-busy'), 'true');
statusSandbox.statusProbe.clearIndependentResayStatus(statusHost);
assert.equal(statusHost.dataset.rmPending, undefined);
assert.equal(statusHost.attributes.has('aria-busy'), false);
assert.equal(firstStatus.removed, true);

function extractFunction(name) {
    return extractFrom(sanitizer, name);
}

// Execute the exact class cross-parent proof gate with one legitimate and two
// ambiguous controls. Only the uniquely attributable class/target pair may cross.
const sandbox = {
    getCrossContainerTargetsForCheckedRule(root, selector) { return root.targets.get(selector) || []; },
    checkedTargetCarriesResultContent(target) { return target?.content === true; },
    inputHasAssociatedLabel(_root, input) { return input?.labeled === true; },
};
vm.createContext(sandbox);
vm.runInContext(`${extractFunction('getProvableCrossParentTargetsForCheckedRule')}\nglobalThis.probe=getProvableCrossParentTargetsForCheckedRule;`, sandbox);

const target = { content: true };
const input = { labeled: true, parentElement: { contains: node => node === input } };
const uniqueRoot = {
    targets: new Map([['.deep-flow', [target]]]),
    querySelectorAll(selector) { return selector === '.switch-input' ? [input] : []; },
};
const uniqueRule = { source: 'class-local', subjectSelector: '.switch-input', targetSelector: '.deep-flow' };
assert.equal(sandbox.probe(uniqueRoot, input, uniqueRule)[0], target);

const otherInput = { labeled: true };
const sharedRoot = {
    ...uniqueRoot,
    querySelectorAll(selector) { return selector === '.switch-input' ? [input, otherInput] : []; },
};
assert.deepEqual(Array.from(sandbox.probe(sharedRoot, input, uniqueRule)), []);

const twoTargetsRoot = {
    ...uniqueRoot,
    targets: new Map([['.deep-flow', [target, { content: true }]]]),
};
assert.deepEqual(Array.from(sandbox.probe(twoTargetsRoot, input, uniqueRule)), []);
assert.deepEqual(Array.from(sandbox.probe(uniqueRoot, input, { ...uniqueRule, source: 'generic-local' })), []);

assert.match(sanitizer, /id: 'unresolved-checked-target'[\s\S]*unresolvedCheckedRuleCount=/);
assert.match(sanitizer, /meaningfulCheckedRoute = depthAfter\.meaningfulCheckedRuleCount > 0[\s\S]*depthAfter\.unresolvedCheckedRuleCount === 0/);
assert.match(sanitizer, /const actualRepairApplied = !!sourceResult\.changed \|\| executedRepairCount > 0/);
assert.match(sanitizer, /\.filter\(entry => entry\?\.id !== 'interaction-id-scope'\)/);
assert.match(sanitizer, /!actualRepairApplied[\s\S]*未命中任何可安全执行的维修路线，未标记为已维修/);
assert.match(sanitizer, /after\.state === MAINTENANCE_STATES\.repairable\) \{[\s\S]*afterButton\.removeAttribute\(MAINTENANCE_REPAIR_ATTR\)/);
assert.match(sanitizer, /after\.state === MAINTENANCE_STATES\.unknown\) \{[\s\S]*afterButton\.removeAttribute\(MAINTENANCE_REPAIR_ATTR\)/);
assert.match(sanitizer, /const INTERACTION_DIAGNOSTIC_VERSION = `\$\{RUNTIME_VERSION\}-FULL-CHAIN`/);

console.log('SecurityFix3 desktop modal, transactional resay, bounded checked repair and diagnostic version regressions passed');
