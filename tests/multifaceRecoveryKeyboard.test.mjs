import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const independentSource = readFileSync(new URL('../src/independentApi.js', import.meta.url), 'utf8');
const sanitizerSource = readFileSync(new URL('../src/outputSanitizer.js', import.meta.url), 'utf8');

assert.doesNotMatch(sanitizerSource, /↶ 返回初始页|function ensureRabbitMirrorInteractionHomeControl\(/,
    'the runtime must not inject a generic visible reset button into generated artwork');
assert.match(sanitizerSource, /data-rm-maintenance-action="reset-interaction"[\s\S]*恢复交互初始状态/,
    'Maintenance Rabbit remains the explicit recovery surface');
assert.match(sanitizerSource, /function removeRabbitMirrorInteractionHomeControls\(/,
    'the current runtime must remove persisted legacy reset pills');

function extractFunction(source, name) {
    const marker = `function ${name}(`;
    const start = source.indexOf(marker);
    assert.notEqual(start, -1, `missing ${name}`);
    const bodyStart = source.indexOf('{', start + marker.length);
    let depth = 0;
    let quote = '';
    let escaped = false;
    for (let index = bodyStart; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
        if (char === '{') depth += 1;
        else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`unterminated ${name}`);
}

class RecoveryNode {
    constructor(kind, index = null) {
        this.kind = kind;
        this.tagName = kind === 'details' ? 'DETAILS' : 'DIV';
        this.children = [];
        this.parentElement = null;
        this.dataset = {};
        this.classList = { toggle() {} };
        if (index !== null) this.dataset.rabbitMirrorFaceIndex = String(index);
    }
    append(...nodes) {
        for (const node of nodes) {
            if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(child => child !== node);
            node.parentElement = this;
            this.children.push(node);
        }
    }
    remove() {
        if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
        this.parentElement = null;
        this.removed = true;
    }
    closest(selector) {
        for (let node = this; node; node = node.parentElement) {
            if (selector === '[data-rabbit-mirror-external-source="true"]' && node.kind === 'host') return node;
        }
        return null;
    }
    querySelectorAll(selector) {
        const result = [];
        const visit = node => {
            for (const child of node.children) {
                if (selector === 'details[data-rabbit-mirror-external-details="true"]' && child.kind === 'details') result.push(child);
                visit(child);
            }
        };
        visit(this);
        return result;
    }
}

{
    const program = [
        'const SOURCE_ATTR="data-rabbit-mirror-external-source";',
        'const externalFaceDetails=host=>[...(host?.children||[])].filter(node=>node?.tagName==="DETAILS").slice(0,5);',
        'const hasMultifaceMarkup=()=>false;',
        'const parseMultifaceOutput=()=>({ok:false,faces:[]});',
        'const markExternalDetails=(details,key,source)=>{ details.dataset.rabbitMirrorExternalOwner=String(key||""); details.dataset.rabbitMirrorExternalSource=String(source||"independent"); return details; };',
        'const stampExternalDetailsOwnership=()=>{};',
        extractFunction(independentSource, 'repatriateExternalDetails'),
        'globalThis.probe={repatriateExternalDetails};',
    ].join('\n');
    const sandbox = {};
    vm.runInNewContext(program, sandbox);

    const message = new RecoveryNode('message');
    const host = new RecoveryNode('host');
    host.dataset.rmFaceCount = '5';
    const escapedBin = new RecoveryNode('bin');
    message.append(host, escapedBin);
    const faces = Array.from({ length: 5 }, (_, index) => new RecoveryNode('details', index));
    faces.forEach(face => {
        face.dataset.rabbitMirrorExternalOwner = 'owner';
        face.dataset.rabbitMirrorExternalSource = 'independent';
    });
    host.append(faces[0]);
    escapedBin.append(...faces.slice(1));
    const duplicateFirst = new RecoveryNode('details', 0);
    duplicateFirst.dataset.rabbitMirrorExternalOwner = 'owner';
    duplicateFirst.dataset.rabbitMirrorExternalSource = 'independent';
    escapedBin.append(duplicateFirst);

    const recovered = sandbox.probe.repatriateExternalDetails(message, host, 'owner', 'independent');
    assert.equal(recovered, faces[0]);
    assert.deepEqual(host.children, faces, 'all five sibling faces must return to the same host in face order');
    assert.equal(duplicateFirst.removed, true, 'only the indexed duplicate is discarded');
    assert.equal(host.dataset.rmFaceCount, '5');
}

{
    let queued = null;
    let replacements = 0;
    let probes = 0;
    const program = [
        'const verifiedReadyDetailsVisualHealth=new WeakSet();',
        'const externalFaceDetails=host=>host.children;',
        'const completeReadyFaceDetails=host=>host.children;',
        'const readyDetailsVisuallyCollapsed=details=>{ probe(); return !!details.collapsed; };',
        'const replaceReadyDetailsFromSaved=(...args)=>replace(...args);',
        extractFunction(independentSource, 'rebuildCollapsedReadyHost'),
        'globalThis.probeApi={rebuildCollapsedReadyHost};',
    ].join('\n');
    const sandbox = {
        probe: () => { probes += 1; },
        replace: () => { replacements += 1; return true; },
        setTimeout: callback => { queued = callback; return 1; },
        clearTimeout() {},
        currentRuntime: () => true,
    };
    vm.runInNewContext(program, sandbox);
    const faces = Array.from({ length: 5 }, () => ({ hasAttribute: () => false }));
    faces[4].collapsed = true;
    const host = { children: faces, dataset: { rmState: 'ready' }, isConnected: true, __rabbitMirrorCollapsedRecoveryTimer: 0 };
    sandbox.probeApi.rebuildCollapsedReadyHost(null, host, 'owner', 'independent', 'five faces');
    assert.equal(probes, 5, 'visual health must inspect every face, not only face one');
    assert.equal(replacements, 0);
    assert.equal(typeof queued, 'function');
    queued();
    assert.equal(replacements, 1, 'a collapsed later face must rebuild the complete saved batch');
}

class KeyboardElement {
    constructor(kind = 'input', type = 'checkbox') {
        this.kind = kind;
        this.type = type;
        this.checked = false;
    }
    closest(selector) {
        if (this.kind === 'input' && selector.includes(`input[type="${this.type}"]`)) return this;
        return null;
    }
    matches(selector) {
        return this.kind === 'input' && selector.includes(`input[type="${this.type}"]`);
    }
}

{
    const listeners = new Map();
    const removed = [];
    const root = {
        addEventListener(type, handler, capture) { listeners.set(type, { handler, capture }); },
        removeEventListener(type, handler, capture) { removed.push({ type, handler, capture }); },
        contains: () => true,
    };
    const captures = new WeakMap();
    const program = [
        'let toolEntryDelegationRoot=null;',
        'let toolEntryDelegatedClickHandler=null;',
        'let toolEntryDelegatedPointerHandler=null;',
        'let toolEntryDelegatedKeydownHandler=null;',
        'const MAINTENANCE_RABBIT_ATTR="data-maintenance";',
        'const FEEDBACK_CAT_ATTR="data-cat";',
        'const RECIPE_BUTTON_ATTR="data-recipe";',
        extractFunction(sanitizerSource, 'removeToolEntryDelegation'),
        extractFunction(sanitizerSource, 'installToolEntryDelegation'),
        'globalThis.probeApi={installToolEntryDelegation,removeToolEntryDelegation};',
    ].join('\n');
    const sandbox = {
        Element: KeyboardElement,
        isCurrentRuntime: () => true,
        getChatRoot: () => root,
        captureRabbitMirrorInteractionResetFromEventTarget(target) {
            if (!captures.has(target)) captures.set(target, target.checked);
            return true;
        },
        rabbitMirrorToolRootFromButton: () => null,
        handleMaintenanceRabbitClick() {},
        handleRecipeClick() {},
        handleFeedbackCatClick() {},
    };
    vm.runInNewContext(program, sandbox);
    assert.equal(sandbox.probeApi.installToolEntryDelegation(root), true);
    assert.equal(listeners.get('keydown')?.capture, true, 'keyboard baseline listener must run in capture phase');

    for (const key of [' ', 'Enter']) {
        const control = new KeyboardElement();
        listeners.get('keydown').handler({ key, target: control });
        control.checked = true; // browser default activation occurs after keydown
        listeners.get('click').handler({ target: control });
        assert.equal(captures.get(control), false, `${JSON.stringify(key)} must preserve the pre-toggle state`);
    }

    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
        const radio = new KeyboardElement('input', 'radio');
        listeners.get('keydown').handler({ key, target: radio });
        radio.checked = true; // native radio-group navigation occurs after keydown
        assert.equal(captures.get(radio), false, `${key} must preserve the radio group's pre-navigation state`);
    }
    const checkboxArrow = new KeyboardElement();
    listeners.get('keydown').handler({ key: 'ArrowRight', target: checkboxArrow });
    assert.equal(captures.has(checkboxArrow), false, 'radio arrow handling must not snapshot an unrelated checkbox');

    sandbox.probeApi.removeToolEntryDelegation();
    assert.ok(removed.some(item => item.type === 'keydown' && item.capture === true), 'runtime teardown must remove the keydown capture listener');
}

console.log('multiface recovery and keyboard interaction reset tests passed');
