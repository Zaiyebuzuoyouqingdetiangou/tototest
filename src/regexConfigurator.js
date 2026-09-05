export const RABBIT_MIRROR_NO_SEND_REGEX_ID = '4f9ec4e0-1b75-4af4-9c9a-5c5a1e7d1701';
export const RABBIT_MIRROR_NO_SEND_REGEX_NAME = 'RabbitMirror｜不发送兔子镜';
export const RABBIT_MIRROR_NO_SEND_REGEX_PATTERN = '/<toto\\b[^>]*>[\\s\\S]*?<\\/toto>\\s*/gi';

export function rabbitMirrorNoSendRegexScript() {
    return {
        id: RABBIT_MIRROR_NO_SEND_REGEX_ID,
        scriptName: RABBIT_MIRROR_NO_SEND_REGEX_NAME,
        findRegex: RABBIT_MIRROR_NO_SEND_REGEX_PATTERN,
        replaceString: '',
        trimStrings: [],
        placement: [2],
        disabled: false,
        markdownOnly: false,
        promptOnly: true,
        runOnEdit: false,
        substituteRegex: 0,
        minDepth: null,
        maxDepth: null,
    };
}

function normalizedPlacement(value) {
    return [...new Set((Array.isArray(value) ? value : []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
}

export function rabbitMirrorNoSendRegexFingerprint(script) {
    if (!script || typeof script !== 'object') return '';
    return JSON.stringify({
        findRegex: String(script.findRegex || ''),
        replaceString: String(script.replaceString ?? ''),
        trimStrings: Array.isArray(script.trimStrings) ? script.trimStrings.map(value => String(value ?? '')) : [],
        placement: normalizedPlacement(script.placement),
        disabled: script.disabled === true,
        markdownOnly: script.markdownOnly === true,
        promptOnly: script.promptOnly === true,
        runOnEdit: script.runOnEdit === true,
        substituteRegex: Number(script.substituteRegex) || 0,
        minDepth: script.minDepth == null ? null : Number(script.minDepth),
        maxDepth: script.maxDepth == null ? null : Number(script.maxDepth),
    });
}

const EXPECTED_FINGERPRINT = rabbitMirrorNoSendRegexFingerprint(rabbitMirrorNoSendRegexScript());

export function inspectRabbitMirrorNoSendRegexScripts(scripts = []) {
    const list = Array.isArray(scripts) ? scripts : [];
    const managedIndex = list.findIndex(script => String(script?.id || '') === RABBIT_MIRROR_NO_SEND_REGEX_ID);
    if (managedIndex >= 0) {
        const current = list[managedIndex];
        const exact = rabbitMirrorNoSendRegexFingerprint(current) === EXPECTED_FINGERPRINT;
        return { status: exact ? 'configured' : 'managed-update', managedIndex, exactIndex: exact ? managedIndex : -1, conflictIndex: -1, script: current };
    }
    const exactIndex = list.findIndex(script => rabbitMirrorNoSendRegexFingerprint(script) === EXPECTED_FINGERPRINT);
    if (exactIndex >= 0) return { status: 'configured', managedIndex: -1, exactIndex, conflictIndex: -1, script: list[exactIndex] };
    const conflictIndex = list.findIndex(script => String(script?.scriptName || '').trim() === RABBIT_MIRROR_NO_SEND_REGEX_NAME);
    if (conflictIndex >= 0) return { status: 'conflict', managedIndex: -1, exactIndex: -1, conflictIndex, script: list[conflictIndex] };
    return { status: 'missing', managedIndex: -1, exactIndex: -1, conflictIndex: -1, script: null };
}

export function upsertRabbitMirrorNoSendRegexScripts(scripts = []) {
    const list = Array.isArray(scripts) ? scripts.map(script => ({ ...script })) : [];
    const inspection = inspectRabbitMirrorNoSendRegexScripts(list);
    if (inspection.status === 'configured') return { changed: false, status: 'configured', scripts: list };
    if (inspection.status === 'conflict') return { changed: false, status: 'conflict', scripts: list };
    const expected = rabbitMirrorNoSendRegexScript();
    if (inspection.status === 'managed-update' && inspection.managedIndex >= 0) {
        list[inspection.managedIndex] = expected;
        return { changed: true, status: 'updated', scripts: list };
    }
    list.push(expected);
    return { changed: true, status: 'created', scripts: list };
}

async function loadRegexEngine() {
    try {
        const engine = await import('../../../../extensions/regex/engine.js');
        if (typeof engine?.getScriptsByType !== 'function' || typeof engine?.saveScriptsByType !== 'function'
            || engine?.SCRIPT_TYPES?.GLOBAL === undefined || engine?.SCRIPT_TYPES?.GLOBAL === null) return null;
        return engine;
    } catch {
        return null;
    }
}

async function regexExtensionDisabled() {
    try {
        const host = await import('../../../../extensions.js');
        const disabledExtensions = host?.extension_settings?.disabledExtensions;
        return Array.isArray(disabledExtensions) ? disabledExtensions.includes('regex') : null;
    } catch {
        return null;
    }
}

export async function inspectRabbitMirrorNoSendRegex() {
    const [engine, disabled] = await Promise.all([loadRegexEngine(), regexExtensionDisabled()]);
    if (!engine) return { available: false, status: 'unavailable', disabled };
    try {
        const scripts = await engine.getScriptsByType(engine.SCRIPT_TYPES.GLOBAL);
        if (!Array.isArray(scripts)) return { available: true, status: 'read-failed', disabled };
        return { available: true, disabled, ...inspectRabbitMirrorNoSendRegexScripts(scripts) };
    } catch {
        return { available: true, status: 'read-failed', disabled };
    }
}

async function configureNoSendRegexOnce() {
    const [engine, disabled] = await Promise.all([loadRegexEngine(), regexExtensionDisabled()]);
    if (!engine) return { ok: false, available: false, status: 'unavailable', disabled, saveAttempted: false };
    let result;
    let expectedSnapshot;
    try {
        const scripts = await engine.getScriptsByType(engine.SCRIPT_TYPES.GLOBAL);
        // An unavailable/failed read is never an empty global list: saving [] here
        // would discard unrelated user rules. Only a real array permits an upsert.
        if (!Array.isArray(scripts)) return { ok: false, available: true, status: 'read-failed', disabled, saveAttempted: false };
        result = upsertRabbitMirrorNoSendRegexScripts(scripts);
        expectedSnapshot = JSON.stringify(result.scripts);
    } catch {
        return { ok: false, available: true, status: 'read-failed', disabled, saveAttempted: false };
    }
    if (result.status === 'conflict') return { ok: false, available: true, disabled, ...result };
    if (!result.changed) return { ok: true, available: true, disabled, saveAttempted: false, ...result };
    try {
        await engine.saveScriptsByType(result.scripts, engine.SCRIPT_TYPES.GLOBAL);
    } catch {
        return { ok: false, available: true, disabled, status: 'save-failed', saveAttempted: true };
    }
    try {
        const saved = await engine.getScriptsByType(engine.SCRIPT_TYPES.GLOBAL);
        if (!Array.isArray(saved) || JSON.stringify(saved) !== expectedSnapshot) {
            return { ok: false, available: true, disabled, status: 'verification-failed', saveAttempted: true };
        }
    } catch {
        return { ok: false, available: true, disabled, status: 'verification-failed', saveAttempted: true };
    }
    // Host read-back proves the settings value, not its debounced server save or
    // the already-open Regex UI list. Opening that UI is a separate best effort.
    return { ok: true, available: true, disabled, saveAttempted: true, ...result };
}

let noSendRegexConfiguration = null;

export function configureRabbitMirrorNoSendRegex() {
    if (!noSendRegexConfiguration) {
        noSendRegexConfiguration = configureNoSendRegexOnce().finally(() => {
            noSendRegexConfiguration = null;
        });
    }
    return noSendRegexConfiguration;
}

function isElementVisible(element) {
    if (!element) return false;
    try {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && !element.hidden;
    } catch {
        return !element.hidden;
    }
}

function openInlineDrawer(drawer) {
    if (!drawer) return;
    const content = drawer.querySelector?.(':scope > .inline-drawer-content') || drawer.querySelector?.('.inline-drawer-content');
    if (content && !isElementVisible(content)) {
        const toggle = drawer.querySelector?.(':scope > .inline-drawer-toggle') || drawer.querySelector?.('.inline-drawer-toggle');
        toggle?.click?.();
    }
}

export async function openSillyTavernRegexSettings() {
    if (typeof document === 'undefined') return { ok: false, reason: 'no-document' };
    const button = document.getElementById('extensionsMenuButton');
    const menu = document.getElementById('extensionsMenu');
    if (button && (!menu || !isElementVisible(menu))) button.click();

    const root = document.querySelector('.regex_settings');
    if (!root) return { ok: false, reason: 'regex-ui-unavailable' };
    const drawers = [];
    let current = root.closest?.('.inline-drawer');
    while (current) {
        drawers.unshift(current);
        current = current.parentElement?.closest?.('.inline-drawer') || null;
    }
    for (const drawer of drawers) openInlineDrawer(drawer);
    openInlineDrawer(root.querySelector?.(':scope > .inline-drawer') || root.querySelector?.('.inline-drawer'));

    const rows = [...document.querySelectorAll('#saved_regex_scripts .regex-script-label')];
    const managed = rows.find(row => String(row.textContent || '').includes(RABBIT_MIRROR_NO_SEND_REGEX_NAME));
    const target = managed || document.getElementById('saved_regex_scripts') || root;
    target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    return { ok: true, foundManagedRow: !!managed };
}
