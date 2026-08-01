import { getSettings } from './settings.js?rmv=1.1.0b14h59t';
import { getCurrentChatKey } from './storage.js?rmv=1.1.0b14h59t';
import {
    FEEDBACK_CAT_TYPES,
    clearActiveFeedbackForCurrentChat,
    feedbackCatReceiptText,
    feedbackCatStatusText,
    getActiveFeedbackForCurrentChat,
    getFeedbackCatLastReceiptForCurrentChat,
    setActiveFeedbackForCurrentChat,
} from './feedbackCat.js?rmv=1.1.0b14h59t';
import { scanRabbitMirrorHtml } from './visualScanner.js?rmv=1.1.0b14h59t';
import { getRabbitMirrorGenerationSnapshot } from './generationGuard.js?rmv=1.1.0b14h59t';


const RUNTIME_VERSION = '1.1.0-beta.14.59-test';
const RUNTIME_VERSION_ATTR = 'data-rabbit-mirror-runtime-version';

const FEEDBACK_CAT_RUNTIME_STYLE_ID = 'rabbit-mirror-feedback-cat-runtime-style';
const TOOL_ENTRY_HOST_ATTR = 'data-rabbit-mirror-tool-entry-host';

function ensureFeedbackCatRuntimeStyle() {
    if (typeof document === 'undefined') return;
    let style = document.getElementById(FEEDBACK_CAT_RUNTIME_STYLE_ID);
    if (!style) {
        style = document.createElement('style');
        style.id = FEEDBACK_CAT_RUNTIME_STYLE_ID;
        (document.head || document.documentElement)?.appendChild(style);
    }
    const css = `
[${TOOL_ENTRY_HOST_ATTR}][${TOOL_ENTRY_HOST_ATTR}] {
    all: initial !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 2px !important;
    float: inline-end !important;
    flex: 0 0 auto !important;
    position: relative !important;
    z-index: 2147483000 !important;
    width: auto !important;
    min-width: 0 !important;
    height: auto !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    margin: 0 0 0 6px !important;
    margin-inline-start: auto !important;
    padding: 0 !important;
    overflow: visible !important;
    visibility: visible !important;
    opacity: 1 !important;
    pointer-events: auto !important;
    transform: none !important;
    filter: none !important;
    clip: auto !important;
    clip-path: none !important;
    white-space: nowrap !important;
    vertical-align: middle !important;
    color: inherit !important;
    font: inherit !important;
    line-height: 1 !important;
    isolation: isolate !important;
}
[${TOOL_ENTRY_HOST_ATTR}] > button[${MAINTENANCE_RABBIT_ATTR}],
[${TOOL_ENTRY_HOST_ATTR}] > button[${FEEDBACK_CAT_ATTR}] {
    all: initial !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    position: relative !important;
    z-index: 2147483001 !important;
    flex: 0 0 auto !important;
    width: auto !important;
    min-width: 0 !important;
    height: auto !important;
    min-height: 20px !important;
    max-width: none !important;
    max-height: none !important;
    margin: 0 !important;
    padding: 1px 3px !important;
    border: 0 !important;
    border-radius: 5px !important;
    background: transparent !important;
    color: inherit !important;
    font: inherit !important;
    font-size: 14px !important;
    line-height: 1 !important;
    text-indent: 0 !important;
    letter-spacing: normal !important;
    white-space: nowrap !important;
    overflow: visible !important;
    visibility: visible !important;
    opacity: .94 !important;
    pointer-events: auto !important;
    cursor: pointer !important;
    transform: none !important;
    filter: none !important;
    clip: auto !important;
    clip-path: none !important;
    box-shadow: none !important;
    appearance: none !important;
    -webkit-appearance: none !important;
    touch-action: manipulation !important;
    -webkit-tap-highlight-color: transparent !important;
}
[${TOOL_ENTRY_HOST_ATTR}] > button[${MAINTENANCE_RABBIT_ATTR}]::before,
[${TOOL_ENTRY_HOST_ATTR}] > button[${MAINTENANCE_RABBIT_ATTR}]::after,
[${TOOL_ENTRY_HOST_ATTR}] > button[${FEEDBACK_CAT_ATTR}]::before,
[${TOOL_ENTRY_HOST_ATTR}] > button[${FEEDBACK_CAT_ATTR}]::after {
    content: none !important;
    display: none !important;
}
`;
    if (style.textContent !== css) style.textContent = css;
}


function isCurrentRuntime() {
    return globalThis.__rabbitMirrorRuntimeVersion === RUNTIME_VERSION;
}
// Cached SillyTavern script module. In module builds, chat is not guaranteed to be exposed on globalThis.
let hostScriptModule = null;
let outputHostSubscriptions = [];

// 0.32.68: 新增源码恢复链：在 TH/高亮插件生成代码壳后，直接用原始消息的清洗副本瞬时重绘当前显示层；不写回 mes/swipe/display_text；
// 0.32.67: 一次性交互诊断升级为兔子镜总诊断，可检查交互、代码块、纯文字源码、显示源与触发链；急救逻辑保持不变；
// 0.32.66: 新增文字可读性底线；代码块急救补充完整转义兔子镜普通文本 DOM 兜底；其余行为保持不变；
// 本版仅撤回 promptBuilder 中 0.32.60 新增的常驻色彩关系测试规则。
// 含 thinking/reasoning 包裹时仍禁止整条消息瞬时重绘；但允许先隔离并只重建当前兔子镜 DOM。

const TOTO_BLOCK_RE = /<toto\b[\s\S]*?<\/toto>/gi;
const TOTO_BLOCK_SINGLE_RE = /<toto\b[\s\S]*?<\/toto>/i;
const FENCED_BLOCK_RE = /```(?:html|HTML|xml|XML)?\s*\n?([\s\S]*?)\n?```/gi;
const WHOLE_FENCED_BLOCK_RE = /^\s*```(?:html|HTML|xml|XML)?\s*\n?([\s\S]*?)\n?```\s*$/i;
const TRAILING_HTML_START_RE = /(?:^|\n)(<(?:div|section|article|details)\b[\s\S]*)$/i;
const PRE_CODE_RE = /<pre\b[^>]*>\s*<code\b[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const CODE_FENCE_OPEN_RE = /```(?:html|xml|javascript|js|css)?\s*/gi;
const TILDE_FENCE_OPEN_RE = /~~~(?:html|xml|javascript|js|css)?\s*/gi;
const CODE_LIKE_TAG_RE = /<\/?(?:pre|code|kbd|samp)\b[^>]*>/gi;
const CLASS_ATTR_RE = /\sclass=(["'])([^"']*)\1/gi;
const HIGHLIGHT_CLASS_TOKEN_RE = /^(?:language-(?:html|xml|js|javascript|css)|hljs|prism|prettyprint)$/i;
const MULTI_BLANK_LINE_RE = /\n\s*\n/g;




function isFeedbackCatEnabled() {
    try {
        return getSettings().feedbackCatEnabled !== false;
    } catch {
        return true;
    }
}

function isMaintenanceRabbitEnabled() {
    try {
        return getSettings().maintenanceRabbitEnabled !== false;
    } catch {
        return true;
    }
}


const MIRROR_TOTO_SELECTOR = 'toto[data-rabbit-mirror="true"], toto[data-rabbit-hole="true"]';
let interactionScopeCounter = 0;
const interactionScopeStates = new WeakMap();
const SCOPED_INTERACTION_ID_RE = /^(rm-[a-z0-9]+-[a-z0-9]+-[a-z0-9]{5}-)(.+)$/i;
const RADIO_GROUP_RESCUE_ATTR = 'data-rabbit-mirror-radio-group-rescue';
const RADIO_GROUP_ROOT_ATTR = 'data-rabbit-mirror-radio-group-count';
const RAW_RADIO_RESET_RESCUE_ATTR = 'data-rabbit-mirror-radio-reset-rescue';
const RAW_RADIO_RESET_ROOT_ATTR = 'data-rabbit-mirror-radio-reset-count';
const RAW_RADIO_RESET_LAST_ATTR = 'data-rabbit-mirror-radio-reset-last';
const rawRadioResetRescueStates = new WeakMap();

const INTERACTION_RESCUE_MEMORY_KEY = 'rabbitMirrorInteractionRescueMemoryV1';
const rememberedInteractionRescueKeys = new Set();

function hashInteractionSignature(text) {
    let hash = 2166136261;
    for (const char of String(text || '')) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function getInteractionRescueKey(toto) {
    if (!toto?.querySelectorAll) return '';
    const summary = (toto.querySelector('summary')?.textContent || '').replace(/\s+/g, ' ').trim();
    const bodyText = (toto.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
    const inputs = toto.querySelectorAll('input[type="checkbox"], input[type="radio"]').length;
    const labels = toto.querySelectorAll('label').length;
    return hashInteractionSignature(`${summary}|${inputs}|${labels}|${bodyText}`);
}

function loadRememberedInteractionRescues() {
    if (rememberedInteractionRescueKeys.size) return;
    try {
        const values = JSON.parse(sessionStorage.getItem(INTERACTION_RESCUE_MEMORY_KEY) || '[]');
        if (Array.isArray(values)) values.forEach(value => value && rememberedInteractionRescueKeys.add(String(value)));
    } catch {
        // sessionStorage unavailable; in-memory memory still works.
    }
}

function rememberInteractionRescue(toto) {
    const key = getInteractionRescueKey(toto);
    if (!key) return;
    loadRememberedInteractionRescues();
    rememberedInteractionRescueKeys.add(key);
    try {
        sessionStorage.setItem(INTERACTION_RESCUE_MEMORY_KEY, JSON.stringify([...rememberedInteractionRescueKeys].slice(-300)));
    } catch {
        // Ignore storage failures.
    }
}

function wasInteractionRescued(toto) {
    const key = getInteractionRescueKey(toto);
    if (!key) return false;
    loadRememberedInteractionRescues();
    return rememberedInteractionRescueKeys.has(key);
}

function createInteractionScopePrefix() {
    interactionScopeCounter += 1;
    const timePart = Date.now().toString(36);
    const countPart = interactionScopeCounter.toString(36);
    const randomPart = Math.random().toString(36).slice(2, 7);
    return `rm-${timePart}-${countPart}-${randomPart}-`;
}

function escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


function getRabbitMirrorLocalStyleElements(root) {
    if (!root?.querySelectorAll) return [];
    const styles = [];
    const seen = new Set();
    const remember = (style) => {
        if (!style || seen.has(style)) return;
        seen.add(style);
        styles.push(style);
    };

    root.querySelectorAll('style').forEach(remember);

    // SillyTavern/DOMPurify may strip the unknown <toto> wrapper while leaving its scoped
    // <style> as a sibling of <details>. In that layout the control/label remain inside the
    // details root, but :checked CSS sits outside it. Recover only styles carrying this exact
    // mirror's generated scope token, so another mirror in the same message cannot leak in.
    const scopedNode = root.matches?.('[data-rabbit-mirror-css-scope]')
        ? root
        : root.querySelector?.('[data-rabbit-mirror-css-scope]');
    const scopeValue = String(scopedNode?.getAttribute?.('data-rabbit-mirror-css-scope') || '').trim();
    if (!scopeValue) return styles;

    const boundary = root.closest?.('.mes_text') || root.closest?.('.mes') || root.parentElement;
    if (!boundary?.querySelectorAll) return styles;
    const scopePattern = new RegExp(
        `\\[\\s*data-rabbit-mirror-css-scope\\s*=\\s*["']${escapeRegExp(scopeValue)}["']\\s*\\]`,
        'i',
    );
    boundary.querySelectorAll('style').forEach(style => {
        if (scopePattern.test(String(style.textContent || ''))) remember(style);
    });
    return styles;
}

function replaceIdReferenceTokens(value, idMap) {
    return String(value || '')
        .split(/\s+/)
        .map(token => idMap.get(token) || token)
        .join(' ');
}

function rewriteCssIdReferences(cssText, idMap) {
    let css = String(cssText || '');
    for (const [oldId, newId] of idMap.entries()) {
        const escaped = escapeRegExp(oldId);
        // 常规 #id 选择器与 CSS/SVG url(#id) 引用。
        css = css
            .replace(new RegExp(`#${escaped}(?![\\w-])`, 'g'), `#${newId}`)
            .replace(new RegExp(`url\\(\\s*(["']?)#${escaped}\\1\\s*\\)`, 'g'), `url(#${newId})`);

        // ID 隔离后，CSS 属性选择器也必须同步。
        // 典型模型输出：#d1:checked ~ label[for="d1"] div。
        // 过去只改写 #d1 与真实 label.for，遗漏了 style 文本中的 [for="d1"]，
        // 导致整条选择器永久失配。这里只处理明确承载 ID 引用的属性。
        for (const attr of ['id', 'for', 'aria-controls', 'aria-labelledby', 'aria-describedby']) {
            css = css.replace(
                new RegExp(`(\\[\\s*${attr}\\s*=\\s*["'])${escaped}(["']\\s*\\])`, 'gi'),
                `$1${newId}$2`,
            );
        }
        for (const attr of ['href', 'xlink\\:href']) {
            css = css.replace(
                new RegExp(`(\\[\\s*${attr}\\s*=\\s*["']#)${escaped}(["']\\s*\\])`, 'gi'),
                `$1${newId}$2`,
            );
        }
    }
    return css;
}

function rewriteSmilIdReferences(value, idMap) {
    let output = String(value || '');
    for (const [oldId, newId] of idMap.entries()) {
        const escaped = escapeRegExp(oldId);
        output = output.replace(new RegExp(`(^|[;\\s])${escaped}(?=\\.)`, 'g'), `$1${newId}`);
    }
    return output;
}


function addImportantToDeclarationBlock(blockText) {
    return String(blockText || '').replace(
        /(^|;)\s*([a-z-]+)\s*:\s*([^;{}]+?)(\s*!important\s*)?(?=;|$)/gi,
        (match, separator, property, value) => {
            const cleanValue = String(value || '').trim().replace(/\s*!important\s*$/i, '');
            if (!cleanValue) return match;
            return `${separator}${property}: ${cleanValue} !important`;
        },
    );
}

function strengthenCheckedCssText(cssText) {
    // 生成内容经常把初始隐藏状态写成内联 style（display:none / height:0 / opacity:0）。
    // 普通 :checked 规则无法覆盖内联样式，因此只对交互状态规则追加 !important。
    return String(cssText || '').replace(/([^{}]*:checked[^{}]*)\{([^{}]*)\}/gi, (match, selector, declarations) => {
        return `${selector}{${addImportantToDeclarationBlock(declarations)}}`;
    });
}

function strengthenRabbitMirrorCheckedStateCss(toto) {
    if (!toto?.querySelectorAll) return;

    getRabbitMirrorLocalStyleElements(toto).forEach(styleEl => {
        const currentText = String(styleEl.textContent || '');
        if (!/:checked\b/i.test(currentText)) return;

        // 文本级处理可覆盖流式晚到的 style，也不依赖 CSSStyleSheet 是否已挂载。
        const strengthened = strengthenCheckedCssText(currentText);
        if (strengthened !== currentText) styleEl.textContent = strengthened;

        // CSSOM 再兜底一次，支持 @media/@supports 内的状态规则。
        try {
            const visitRules = (rules) => {
                for (const rule of [...(rules || [])]) {
                    if (rule?.cssRules) visitRules(rule.cssRules);
                    if (!rule?.selectorText || !/:checked\b/i.test(rule.selectorText) || !rule.style) continue;
                    for (const property of [...rule.style]) {
                        const value = rule.style.getPropertyValue(property);
                        if (value) rule.style.setProperty(property, value, 'important');
                    }
                }
            };
            visitRules(styleEl.sheet?.cssRules);
        } catch {
            // 某些宿主会暂时禁止读取 CSSOM；文本级修复仍然有效。
        }
    });
}



const interactionInlineOverrideStates = new WeakMap();


const FOCUS_TO_CHECKED_STYLE_ATTR = 'data-rabbit-mirror-focus-to-checked-rescue';
const FOCUS_TO_CHECKED_ROOT_ATTR = 'data-rabbit-mirror-focus-to-checked-rules';

function escapeCssIdentifier(value) {
    const text = String(value || '');
    try {
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(text);
    } catch {
        // Fall through to a conservative identifier escape.
    }
    return text.replace(/(^-?\d)|[^a-zA-Z0-9_-]/g, match => `\\${match}`);
}

function replaceCheckableFocusSubject(selector, input) {
    if (!selector || !input?.id || !/:focus\b\s*[+~]/i.test(selector)) return '';

    // 只接管“checkbox/radio 自身的 :focus 作为持久状态触发器”的明确误写。
    // 目标必须位于后续兄弟链；普通按钮/链接/文本输入的 focus 视觉完全不碰。
    const subjectRe = /((?:input\b)?(?:[#.][a-zA-Z0-9_-]+|\[[^\]]+\])*)\s*:focus\b(?=\s*[+~])/gi;
    let matched = false;
    const rewritten = String(selector).replace(subjectRe, (full, subject) => {
        const candidate = String(subject || '').trim();
        if (!candidate) return full;
        try {
            if (!input.matches(candidate)) return full;
        } catch {
            return full;
        }
        matched = true;
        return `#${escapeCssIdentifier(input.id)}:checked`;
    });
    return matched ? rewritten : '';
}

function collectFocusToCheckedRules(root) {
    if (!root?.querySelectorAll) return [];
    const inputs = [...root.querySelectorAll('input[type="checkbox"], input[type="radio"]')]
        .filter(input => input.id && !input.disabled);
    if (!inputs.length) return [];

    const rules = [];
    const seen = new Set();
    getRabbitMirrorLocalStyleElements(root).filter(styleEl => !styleEl.hasAttribute(FOCUS_TO_CHECKED_STYLE_ATTR)).forEach(styleEl => {
        const css = String(styleEl.textContent || '');
        const blockRe = /([^{}]+)\{([^{}]*)\}/g;
        let match;
        while ((match = blockRe.exec(css))) {
            const selectorText = String(match[1] || '').trim();
            if (!selectorText || selectorText.startsWith('@') || !/:focus\b\s*[+~]/i.test(selectorText)) continue;
            const declarations = addImportantToDeclarationBlock(String(match[2] || ''));
            if (!declarations.trim()) continue;

            for (const selector of selectorText.split(',').map(value => value.trim()).filter(Boolean)) {
                for (const input of inputs) {
                    const rewritten = replaceCheckableFocusSubject(selector, input);
                    if (!rewritten) continue;
                    const key = `${rewritten}|${declarations}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    rules.push(`${rewritten} {${declarations}}`);
                }
            }
        }
    });
    return rules;
}

function refreshFocusToCheckedRescue(root) {
    if (!root?.querySelectorAll) return;
    const rules = collectFocusToCheckedRules(root);
    let rescueStyle = root.querySelector(`style[${FOCUS_TO_CHECKED_STYLE_ATTR}]`);

    if (rules.length) {
        if (!rescueStyle) {
            rescueStyle = document.createElement('style');
            rescueStyle.setAttribute(FOCUS_TO_CHECKED_STYLE_ATTR, 'true');
            root.appendChild(rescueStyle);
        }
        const nextCss = rules.join('\n');
        if (rescueStyle.textContent !== nextCss) rescueStyle.textContent = nextCss;
        root.setAttribute(FOCUS_TO_CHECKED_ROOT_ATTR, String(rules.length));
    } else {
        rescueStyle?.remove();
        root.removeAttribute(FOCUS_TO_CHECKED_ROOT_ATTR);
    }
}


const CHECKED_TEXT_RULE_RESCUE_ATTR = 'data-rabbit-mirror-checked-text-rule-rescue';
const CROSS_PARENT_CHECKED_RULE_RESCUE_ATTR = 'data-rabbit-mirror-cross-parent-checked-rescue';
const CROSS_PARENT_CHECKED_ROOT_ATTR = 'data-rabbit-mirror-cross-parent-checked-rules';
const crossParentCheckedFallbackRoots = new WeakSet();
const CHECKED_PSEUDO_RULE_RESCUE_STYLE_ATTR = 'data-rabbit-mirror-checked-pseudo-rule-rescue';
const CHECKED_PSEUDO_RULE_TARGET_ATTR = 'data-rm-checked-pseudo-rule-target';
const interactionPseudoOverrideStates = new WeakMap();
let checkedPseudoRuleTokenCounter = 0;
const CHECKED_HAS_STATE_RESCUE_STYLE_ATTR = 'data-rabbit-mirror-checked-has-state-rescue';
const CHECKED_HAS_STATE_ROOT_ATTR = 'data-rabbit-mirror-checked-has-state';
const CHECKED_HAS_STATE_RULE_COUNT_ATTR = 'data-rabbit-mirror-checked-has-state-rules';
const checkedHasStateRescueStates = new WeakMap();
const DETACHED_CHECKED_HAS_RESCUE_STYLE_ATTR = 'data-rabbit-mirror-detached-checked-has-rescue';
const DETACHED_CHECKED_HAS_ROOT_ATTR = 'data-rabbit-mirror-detached-checked-has-state';
const DETACHED_CHECKED_HAS_RULE_COUNT_ATTR = 'data-rabbit-mirror-detached-checked-has-rules';
const DETACHED_CHECKED_HAS_CONTROL_ATTR = 'data-rm-detached-checked-has-control';
const detachedCheckedHasRescueStates = new WeakMap();
const PAIRED_CHECKED_STATE_RESCUE_ATTR = 'data-rabbit-mirror-paired-checked-state-rescue';
const PAIRED_CHECKED_STATE_CONTROL_ATTR = 'data-rm-paired-checked-state-control';
const PAIRED_CHECKED_STATE_PANEL_ATTR = 'data-rm-paired-checked-state-panel';
const PAIRED_CHECKED_STATE_COUNT_ATTR = 'data-rabbit-mirror-paired-checked-state-count';
const pairedCheckedStateRescueStates = new WeakMap();
const EXCLUSIVE_STACKED_STATE_RESCUE_ATTR = 'data-rabbit-mirror-exclusive-stacked-state-rescue';
const EXCLUSIVE_STACKED_STATE_COUNT_ATTR = 'data-rabbit-mirror-exclusive-stacked-state-count';
const EXCLUSIVE_STACKED_STATE_CONTROL_ATTR = 'data-rm-exclusive-stacked-state-control';
const EXCLUSIVE_STACKED_STATE_PANEL_ATTR = 'data-rm-exclusive-stacked-state-panel';
const exclusiveStackedStateRescueStates = new WeakMap();
const CHANNEL_DIAL_CYCLE_RESCUE_ATTR = 'data-rabbit-mirror-channel-dial-cycle-rescue';
const CHANNEL_DIAL_CYCLE_COUNT_ATTR = 'data-rabbit-mirror-channel-dial-cycle-count';
const CHANNEL_DIAL_CYCLE_HOST_ATTR = 'data-rm-channel-dial-cycle-host';
const CHANNEL_DIAL_CYCLE_LABEL_ATTR = 'data-rm-channel-dial-cycle-label';
const channelDialCycleRescueStates = new WeakMap();
const EXPANDED_OPACITY_RESCUE_ATTR = 'data-rabbit-mirror-expanded-opacity-rescue';

function collectCheckedRevealSignal(candidate, property, value) {
    if (!candidate) return;
    const name = String(property || '').trim().toLowerCase();
    const cleanValue = String(value || '').trim().toLowerCase();
    if (!name || !cleanValue) return;

    if (name === 'opacity') {
        // 激活规则明确声明透明度时尊重原规则，不进行残留透明度保全。
        candidate.explicitOpacity = true;
        return;
    }

    if (name === 'display' && cleanValue !== 'none') candidate.expands = true;
    else if (name === 'visibility' && cleanValue !== 'hidden' && cleanValue !== 'collapse') candidate.expands = true;
    else if (name === 'height' || name === 'min-height' || name === 'max-height') {
        if (!isCollapsedDimensionValue(cleanValue)) candidate.expands = true;
    }
}

function rememberCheckedRevealCandidate(candidates, target, styleMap) {
    if (!target || !styleMap?.length) return;
    let candidate = candidates.get(target);
    if (!candidate) {
        candidate = { target, expands: false, explicitOpacity: false };
        candidates.set(target, candidate);
    }
    for (const [property, value] of styleMap) collectCheckedRevealSignal(candidate, property, value);
}

function applyExpandedOpacityResidualRescue(input, candidates, records) {
    if (!input?.checked || !candidates?.size || !records) return 0;

    for (const candidate of candidates.values()) {
        const target = candidate?.target;
        if (!target?.isConnected || !candidate.expands || candidate.explicitOpacity) continue;
        if (records.some(record => record.element === target
            && record.property === 'opacity'
            && record.rescueKind === 'expanded-opacity')) continue;

        let computed = null;
        try {
            computed = typeof getComputedStyle === 'function' ? getComputedStyle(target) : null;
        } catch {
            computed = null;
        }
        const opacity = Number.parseFloat(computed?.opacity || '1');
        const display = String(computed?.display || '').toLowerCase();
        const visibility = String(computed?.visibility || '').toLowerCase();
        if (!Number.isFinite(opacity) || opacity > 0.05
            || display === 'none' || visibility === 'hidden' || visibility === 'collapse') continue;

        let rectHeight = 0;
        try {
            rectHeight = Number(target.getBoundingClientRect?.().height || 0);
        } catch {
            rectHeight = 0;
        }
        const naturalHeight = Math.max(rectHeight, Number(target.scrollHeight || 0));
        const hasContent = String(target.textContent || '').replace(/\s+/g, '').length >= 2
            || Number(target.childElementCount || 0) > 0;
        if (!hasContent || naturalHeight <= 4) continue;

        records.push({
            element: target,
            property: 'opacity',
            value: target.style.getPropertyValue('opacity'),
            priority: target.style.getPropertyPriority('opacity'),
            rescueKind: 'expanded-opacity',
        });
        target.style.setProperty('opacity', '1', 'important');
    }

    const rescuedCount = new Set(records
        .filter(record => record.rescueKind === 'expanded-opacity')
        .map(record => record.element)).size;
    if (rescuedCount) input.setAttribute(EXPANDED_OPACITY_RESCUE_ATTR, String(rescuedCount));
    return rescuedCount;
}

function scheduleExpandedOpacityResidualRescue(input, candidates, records) {
    if (!input || !candidates?.size || !records) return;
    for (const delay of [0, 80, 260, 650]) {
        setTimeout(() => {
            if (!input.isConnected || !input.checked
                || interactionInlineOverrideStates.get(input) !== records) return;
            applyExpandedOpacityResidualRescue(input, candidates, records);
        }, delay);
    }
}


const MISSING_CHECKED_SUBJECT_CLASS_RESCUE_ATTR = 'data-rabbit-mirror-missing-checked-class-rescue';
const MISSING_CHECKED_SUBJECT_CLASS_CONTROL_ATTR = 'data-rm-missing-checked-class-control';

function checkedClassRepairDeclarationsCarryState(declarations) {
    const source = String(declarations || '');
    if (!source) return false;
    const strongStateProperty = /(?:^|;)\s*(?:display|visibility|opacity|max-height|min-height|height|transform|clip-path|filter)\s*:\s*([^;{}]+)/gi;
    let match;
    while ((match = strongStateProperty.exec(source))) {
        const value = String(match[1] || '').trim().toLowerCase();
        if (!value) continue;
        if (/^(?:none|normal|initial|inherit|unset)$/i.test(value)) continue;
        return true;
    }
    return false;
}

function rawRootHasExactClassToken(root, className) {
    if (!root?.querySelectorAll || !className) return false;
    return [...root.querySelectorAll('[class]')].some(element => (
        String(element.className || '').split(/\s+/).includes(className)
    ));
}

function parseMissingCheckedSubjectClassRules(rawRoot) {
    if (!rawRoot?.querySelectorAll) return [];
    const groups = new Map();
    for (const styleElement of rawRoot.querySelectorAll('style')) {
        const css = String(styleElement.textContent || '');
        const blockRe = /([^{}]+)\{([^{}]*)\}/g;
        let block;
        while ((block = blockRe.exec(css))) {
            const declarations = String(block[2] || '');
            if (!checkedClassRepairDeclarationsCarryState(declarations)) continue;
            for (const selector of splitCssSelectorList(block[1])) {
                if (!/:checked\b/i.test(selector)) continue;
                const subjectMatch = /(?:^|[\s>+~,(])((?:input)?(?:\s*\[[^\]]+\])?(?:\.[_a-zA-Z][\w-]*)+)\s*:checked\s*([+~])\s*/i.exec(selector);
                if (!subjectMatch) continue;
                const subject = String(subjectMatch[1] || '').trim();
                const tagMatch = /^([a-zA-Z][\w-]*)/.exec(subject);
                if (tagMatch && tagMatch[1].toLowerCase() !== 'input') continue;
                const classes = [...subject.matchAll(/\.([_a-zA-Z][\w-]*)/g)].map(match => match[1]);
                if (classes.length !== 1) continue;
                const rawClass = classes[0];
                if (!rawClass || rawRootHasExactClassToken(rawRoot, rawClass)) continue;
                const item = groups.get(rawClass) || { rawClass, rules: [] };
                item.rules.push({ selector: String(selector || '').trim(), relation: subjectMatch[2] });
                groups.set(rawClass, item);
            }
        }
    }
    return [...groups.values()].filter(group => group.rules.length > 0);
}

function rawCheckedClassRuleMatchesInput(rawRoot, rawInput, rawClass, selector) {
    if (!rawRoot?.cloneNode || !rawInput || !rawClass || !selector || typeof document === 'undefined') return false;
    const rawInputs = [...rawRoot.querySelectorAll('input[type="checkbox"], input[type="radio"]')];
    const inputIndex = rawInputs.indexOf(rawInput);
    if (inputIndex < 0) return false;
    const clone = rawRoot.cloneNode(true);
    const clonedInput = [...clone.querySelectorAll('input[type="checkbox"], input[type="radio"]')][inputIndex];
    if (!clonedInput?.classList) return false;
    clonedInput.classList.add(rawClass);
    clonedInput.checked = true;
    const wrapper = document.createElement('div');
    wrapper.appendChild(clone);
    try {
        return [...wrapper.querySelectorAll(selector)].some(target => (
            target !== clonedInput && normalizeInteractionMatchText(target.textContent).length >= 2
        ));
    } catch {
        return false;
    }
}

function installMissingCheckedSubjectClassRescue(root) {
    if (!root?.querySelectorAll || root.hasAttribute?.(MISSING_CHECKED_SUBJECT_CLASS_RESCUE_ATTR)) {
        return Number.parseInt(root?.getAttribute?.(MISSING_CHECKED_SUBJECT_CLASS_RESCUE_ATTR) || '0', 10) || 0;
    }
    const rawMessage = getRawAssistantMessageForRenderedRoot(root);
    const rawRoot = chooseMatchingRawRabbitMirrorRoot(rawMessage, root);
    if (!rawRoot) return 0;

    const rawInputs = [...rawRoot.querySelectorAll('input[type="checkbox"], input[type="radio"]')];
    if (!rawInputs.length || rawInputs.length > 12) return 0;
    let repaired = 0;
    for (const group of parseMissingCheckedSubjectClassRules(rawRoot)) {
        const candidates = rawInputs.filter(input => {
            if (!inputHasAssociatedLabel(rawRoot, input)) return false;
            const matchingRuleCount = group.rules.filter(rule => (
                rawCheckedClassRuleMatchesInput(rawRoot, input, group.rawClass, rule.selector)
            )).length;
            return matchingRuleCount >= Math.min(2, group.rules.length);
        });
        if (candidates.length !== 1) continue;

        const renderedInput = resolveRenderedCounterpart(rawRoot, root, candidates[0], 'input');
        if (!renderedInput?.classList || findMaintenanceElementByRawClass(root, group.rawClass)) continue;
        const renderedClass = resolveMaintenanceGeneratedClass(root, group.rawClass);
        if (!renderedClass || renderedInput.classList.contains(renderedClass)) continue;
        renderedInput.classList.add(renderedClass);
        renderedInput.setAttribute(MISSING_CHECKED_SUBJECT_CLASS_CONTROL_ATTR, `${group.rawClass}:${renderedClass}`);
        repaired += 1;
    }
    if (repaired) root.setAttribute(MISSING_CHECKED_SUBJECT_CLASS_RESCUE_ATTR, String(repaired));
    return repaired;
}

function buildCheckedSelectorNeedles(input) {
    const needles = [];
    if (input?.id) {
        const escapedId = escapeRegExp(input.id);
        // ID 隔离后，#id 会被改写成 [id="scoped-id"]；两种形式都必须识别。
        const idSubject = `(?:#${escapedId}|\\[\\s*id\\s*=\\s*["']${escapedId}["']\\s*\\])`;
        needles.push({
            source: 'id',
            pattern: new RegExp(`${idSubject}\\s*:checked\\s*([+~])\\s*([^,{]+)`, 'i'),
        });
    }

    for (const className of getClassTokens(input).slice(0, 8)) {
        if (!className || className.length > 120) continue;
        const escapedClass = escapeRegExp(className);
        needles.push({
            source: 'class-local',
            pattern: new RegExp(`\\.${escapedClass}:checked\\s*([+~])\\s*([^,{]+)`, 'i'),
        });
    }
    return needles;
}


function matchGenericLocalCheckedSelector(selector, input) {
    const source = String(selector || '');
    if (!source || !input?.matches) return null;

    // 模型经常不给 input 设置 id/class，只写 input:checked + div ...。
    // 这种规则只能在当前 input 所在 label/局部容器内恢复，绝不能跨兔子镜全局扩散。
    const genericRe = /(?:^|[\s>+~,(])(input(?:\s*\[[^\]]+\])*)\s*:checked\s*([+~])\s*([^,{]+)/gi;
    let match;
    while ((match = genericRe.exec(source))) {
        const subject = String(match[1] || '').trim();
        if (!subject) continue;
        try {
            if (!input.matches(subject)) continue;
        } catch {
            continue;
        }
        return {
            source: 'generic-local',
            relation: match[2],
            rawTargetSelector: match[3],
        };
    }
    return null;
}

function splitCheckedPseudoTargetSelector(selectorText) {
    const source = String(selectorText || '').trim();
    const match = source.match(/^(.*?)(?:::)(before|after)\s*$/i);
    if (!match) return { targetSelector: source, pseudoElement: '' };
    return {
        targetSelector: String(match[1] || '').trim(),
        pseudoElement: String(match[2] || '').toLowerCase(),
    };
}

function addSpaceSeparatedAttributeToken(element, attribute, token) {
    if (!element?.setAttribute || !attribute || !token) return;
    const tokens = new Set(String(element.getAttribute(attribute) || '').split(/\s+/).filter(Boolean));
    tokens.add(token);
    element.setAttribute(attribute, [...tokens].join(' '));
}

function removeSpaceSeparatedAttributeToken(element, attribute, token) {
    if (!element?.getAttribute || !attribute || !token) return;
    const tokens = String(element.getAttribute(attribute) || '').split(/\s+/).filter(Boolean)
        .filter(value => value !== token);
    if (tokens.length) element.setAttribute(attribute, tokens.join(' '));
    else element.removeAttribute(attribute);
}

function restoreInteractionPseudoOverrides(input) {
    const state = interactionPseudoOverrideStates.get(input);
    if (!state) return;
    state.styleElement?.remove?.();
    for (const record of state.targets || []) {
        removeSpaceSeparatedAttributeToken(record.element, CHECKED_PSEUDO_RULE_TARGET_ATTR, record.token);
    }
    interactionPseudoOverrideStates.delete(input);
}

function installInteractionPseudoOverrides(root, input, entries) {
    restoreInteractionPseudoOverrides(input);
    if (!root?.appendChild || !input?.checked || !entries?.length) return 0;

    const styleElement = document.createElement('style');
    styleElement.setAttribute(CHECKED_PSEUDO_RULE_RESCUE_STYLE_ATTR, 'true');
    const targetRecords = [];
    const cssRules = [];
    let declarationCount = 0;

    for (const entry of entries) {
        const target = entry?.target;
        const pseudoElement = String(entry?.pseudoElement || '').toLowerCase();
        const styleMap = Array.isArray(entry?.styleMap) ? entry.styleMap : [];
        if (!target?.isConnected || !/^(?:before|after)$/.test(pseudoElement) || !styleMap.length) continue;

        checkedPseudoRuleTokenCounter += 1;
        const token = `p${checkedPseudoRuleTokenCounter.toString(36)}`;
        addSpaceSeparatedAttributeToken(target, CHECKED_PSEUDO_RULE_TARGET_ATTR, token);
        targetRecords.push({ element: target, token });

        const declarations = styleMap.map(([property, value]) => {
            declarationCount += 1;
            return `${property}: ${value} !important;`;
        }).join('');
        cssRules.push(`[${CHECKED_PSEUDO_RULE_TARGET_ATTR}~="${token}"]::${pseudoElement} {${declarations}}`);
    }

    if (!cssRules.length) {
        for (const record of targetRecords) {
            removeSpaceSeparatedAttributeToken(record.element, CHECKED_PSEUDO_RULE_TARGET_ATTR, record.token);
        }
        return 0;
    }

    styleElement.textContent = cssRules.join('\n');
    root.appendChild(styleElement);
    interactionPseudoOverrideStates.set(input, { styleElement, targets: targetRecords });
    return declarationCount;
}

function parseCheckedRulesFromText(toto, input) {
    if (!toto?.querySelectorAll || !input) return [];
    const selectorNeedles = buildCheckedSelectorNeedles(input);

    const results = [];
    const seen = new Set();
    for (const styleEl of getRabbitMirrorLocalStyleElements(toto)) {
        const css = String(styleEl.textContent || '');
        const blockRe = /([^{}]+)\{([^{}]*)\}/g;
        let match;
        while ((match = blockRe.exec(css))) {
            const selectors = String(match[1] || '').split(',').map(v => v.trim()).filter(Boolean);
            const declarations = String(match[2] || '');
            const styleMap = [];
            declarations.replace(/(^|;)\s*([a-z-]+)\s*:\s*([^;{}]+?)(\s*!important\s*)?(?=;|$)/gi,
                (_m, _sep, property, value) => {
                    const cleanValue = String(value || '').trim().replace(/\s*!important\s*$/i, '');
                    if (property && cleanValue) styleMap.push([property, cleanValue]);
                    return _m;
                });
            if (!styleMap.length) continue;

            for (const selector of selectors) {
                const parsedRules = [];
                for (const needle of selectorNeedles) {
                    const selectorMatch = selector.match(needle.pattern);
                    if (!selectorMatch) continue;
                    parsedRules.push({
                        source: needle.source,
                        relation: selectorMatch[1],
                        rawTargetSelector: selectorMatch[2],
                    });
                }
                const genericRule = matchGenericLocalCheckedSelector(selector, input);
                if (genericRule) parsedRules.push(genericRule);

                for (const parsedRule of parsedRules) {
                    const parsedTarget = splitCheckedPseudoTargetSelector(parsedRule.rawTargetSelector);
                    const targetSelector = parsedTarget.targetSelector;
                    const pseudoElement = parsedTarget.pseudoElement;
                    if (!targetSelector) continue;
                    // 同一条规则可能同时被 id/class 与通用 input 识别；按实际效果去重，保留先出现的精确路线。
                    const key = `${parsedRule.relation}|${targetSelector}|${pseudoElement}|${JSON.stringify(styleMap)}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    results.push({ source: parsedRule.source, relation: parsedRule.relation, targetSelector, pseudoElement, styleMap });
                }
            }
        }
    }
    return results;
}

function getSiblingTargetsForCheckedRule(input, relation, targetSelector) {
    const targets = [];
    if (!input?.parentElement || !targetSelector) return targets;
    let node = input.nextElementSibling;
    if (relation === '+') {
        if (node?.matches?.(targetSelector)) targets.push(node);
        return targets;
    }
    while (node) {
        if (node.matches?.(targetSelector)) targets.push(node);
        node = node.nextElementSibling;
    }
    return targets;
}

function getLabelProxyTargetsForCheckedRule(input, relation, targetSelector) {
    const label = input?.closest?.('label');
    const parent = label?.parentElement || null;
    if (!label || !parent?.querySelectorAll || !label.contains(input) || !targetSelector) return [];

    const followingSiblings = [];
    let sibling = label.nextElementSibling;
    if (relation === '+') {
        if (sibling) followingSiblings.push(sibling);
    } else {
        while (sibling) {
            followingSiblings.push(sibling);
            sibling = sibling.nextElementSibling;
        }
    }
    if (!followingSiblings.length || followingSiblings.length > 8) return [];

    let parentMatches = [];
    try {
        parentMatches = [...parent.querySelectorAll(targetSelector)];
    } catch {
        return [];
    }
    const targets = parentMatches.filter(target => followingSiblings.some(container => (
        target === container || container.contains?.(target)
    )));
    // 只允许当前 label 后方局部兄弟区域内数量可控的目标，避免通用 input:checked 规则扩散到整面兔子镜。
    if (!targets.length || targets.length > 8) return [];
    return targets;
}

function getCrossContainerTargetsForCheckedRule(root, targetSelector) {
    if (!root?.querySelectorAll || !targetSelector) return [];
    try {
        const targets = [...root.querySelectorAll(targetSelector)];
        // 跨容器急救只接受当前兔子镜内明确且数量可控的目标，避免宽泛选择器误伤整页。
        if (!targets.length || targets.length > 12) return [];
        return targets;
    } catch {
        return [];
    }
}

function resolveTargetsForCheckedRule(root, input, rule) {
    if (!root || !input || !rule) return [];
    let targets = getSiblingTargetsForCheckedRule(input, rule.relation, rule.targetSelector);
    if (targets.length) return targets;
    if (rule.source === 'class-local' || rule.source === 'generic-local') {
        targets = getLocalContainerTargetsForCheckedRule(input, rule.targetSelector);
        if (targets.length) return targets;
        // 常见误写：input 被包在 label 内，但 :checked 规则把 label 后方内容当作 input 的兄弟。
        // 以 label 作为结构代理，仅在其同一局部父容器的后续兄弟区域内恢复目标。
        return getLabelProxyTargetsForCheckedRule(input, rule.relation, rule.targetSelector);
    }
    return getCrossContainerTargetsForCheckedRule(root, rule.targetSelector);
}

function findCrossParentCheckedRuleFallbackCandidates(root) {
    if (!root?.querySelectorAll) return [];
    const candidates = [];
    for (const input of root.querySelectorAll('input[type="checkbox"], input[type="radio"]')) {
        if (!inputHasAssociatedLabel(root, input)) continue;
        let ruleCount = 0;
        let targetCount = 0;
        for (const rule of parseCheckedRulesFromText(root, input)) {
            if (rule.source !== 'id') continue;
            if (getSiblingTargetsForCheckedRule(input, rule.relation, rule.targetSelector).length) continue;
            const targets = getCrossContainerTargetsForCheckedRule(root, rule.targetSelector);
            if (!targets.length) continue;
            ruleCount += 1;
            targetCount += targets.length;
        }
        if (ruleCount) candidates.push({ input, ruleCount, targetCount });
    }
    return candidates;
}

function syncCrossParentCheckedRuleFallback(root) {
    if (!root?.querySelectorAll) return 0;
    const inputs = [...root.querySelectorAll(`[${CROSS_PARENT_CHECKED_RULE_RESCUE_ATTR}]`)]
        .filter(input => input.matches?.('input[type="checkbox"], input[type="radio"]'));
    if (!inputs.length) return 0;

    // 先统一撤回旧分支，避免 radio 切换后上一分支的内联急救状态残留。
    for (const input of inputs) restoreInteractionInlineOverrides(input);
    let activeCount = 0;
    for (const input of inputs) {
        if (!input.checked) continue;
        applyCheckedVisualFallback(root, input);
        input.setAttribute('aria-pressed', 'true');
        activeCount += 1;
    }
    for (const input of inputs) {
        if (!input.checked) input.setAttribute('aria-pressed', 'false');
    }
    return activeCount;
}

function scheduleCrossParentCheckedRuleSync(root) {
    if (!root) return;
    for (const delay of [0, 80, 260, 650]) {
        setTimeout(() => {
            if (root.isConnected) syncCrossParentCheckedRuleFallback(root);
        }, delay);
    }
}

function installCrossParentCheckedRuleFallback(root) {
    if (!root?.querySelectorAll) return 0;
    const liveInputs = new Set();
    let ruleCount = 0;
    for (const candidate of findCrossParentCheckedRuleFallbackCandidates(root)) {
        liveInputs.add(candidate.input);
        candidate.input.setAttribute(CROSS_PARENT_CHECKED_RULE_RESCUE_ATTR, String(candidate.ruleCount));
        ruleCount += candidate.ruleCount;
    }
    for (const input of root.querySelectorAll(`[${CROSS_PARENT_CHECKED_RULE_RESCUE_ATTR}]`)) {
        if (!liveInputs.has(input)) input.removeAttribute(CROSS_PARENT_CHECKED_RULE_RESCUE_ATTR);
    }
    if (ruleCount) {
        root.setAttribute(CROSS_PARENT_CHECKED_ROOT_ATTR, String(ruleCount));
        let newlyBound = false;
        if (!crossParentCheckedFallbackRoots.has(root)) {
            const refresh = event => {
                if (!event.target?.hasAttribute?.(CROSS_PARENT_CHECKED_RULE_RESCUE_ATTR)) return;
                syncCrossParentCheckedRuleFallback(root);
                scheduleCrossParentCheckedRuleSync(root);
            };
            root.addEventListener('input', refresh, false);
            root.addEventListener('change', refresh, false);
            crossParentCheckedFallbackRoots.add(root);
            newlyBound = true;
        }
        // 安装时立即落实原本已经 checked 的初始分支；不能要求用户再点一次才显示。
        syncCrossParentCheckedRuleFallback(root);
        if (newlyBound) scheduleCrossParentCheckedRuleSync(root);
    } else {
        root.removeAttribute(CROSS_PARENT_CHECKED_ROOT_ATTR);
    }
    return ruleCount;
}


function parseBrokenCheckedHasStateRules(root) {
    if (!root?.querySelectorAll) return [];
    const results = [];
    const seen = new Set();

    const visitSelector = (selectorText, declarations) => {
        const selector = String(selectorText || '').trim();
        if (!selector || !/:has\(/i.test(selector) || !/:checked\b/i.test(selector)) return;
        // 旧清洗链曾把 body:has(...) 前面再加 .mes_text，形成“消息内部寻找 body”的永不命中选择器。
        // 这里只接管明确含 body:has(...) 的错误祖先链；当前新版已正确改写为兔子镜根 :has(...)，不会命中本兜底。
        if (!/(?:^|[\s>+~])body\s*:has\(/i.test(selector)) return;

        const conditionRe = /:has\(\s*(?:#([A-Za-z_][\w-]*)|\[\s*id\s*=\s*["']([^"']+)["']\s*\])\s*:checked\s*\)/gi;
        const ids = [];
        let lastEnd = -1;
        let match;
        while ((match = conditionRe.exec(selector))) {
            ids.push(String(match[1] || match[2] || ''));
            lastEnd = conditionRe.lastIndex;
        }
        const hasCount = (selector.match(/:has\(/gi) || []).length;
        if (!ids.length || ids.length !== hasCount || lastEnd < 0) return;

        const targetSelector = selector.slice(lastEnd).trim().replace(/^[>+~]\s*/, '');
        if (!targetSelector) return;
        const querySelector = targetSelector.replace(/::(?:before|after)\s*$/i, '').trim();
        if (!querySelector) return;

        const controls = ids.map(id => [...root.querySelectorAll('[id]')]
            .find(element => String(element.id || '') === id
                && element.matches?.('input[type="checkbox"], input[type="radio"]')));
        if (controls.some(control => !control) || new Set(controls).size !== controls.length) return;

        let targets = [];
        try {
            targets = [...root.querySelectorAll(querySelector)];
        } catch {
            return;
        }
        if (!targets.length || targets.length > 12) return;

        const strengthened = addImportantToDeclarationBlock(String(declarations || ''));
        if (!strengthened.trim()) return;
        const key = `${ids.join('|')}|${targetSelector}|${strengthened}`;
        if (seen.has(key)) return;
        seen.add(key);
        results.push({ ids, controls, targetSelector, declarations: strengthened });
    };

    for (const style of getRabbitMirrorLocalStyleElements(root).filter(styleEl => !styleEl.hasAttribute(CHECKED_HAS_STATE_RESCUE_STYLE_ATTR))) {
        const css = String(style.textContent || '');
        const blockRe = /([^{}]+)\{([^{}]*)\}/g;
        let blockMatch;
        while ((blockMatch = blockRe.exec(css))) {
            const declarations = String(blockMatch[2] || '');
            for (const selector of splitCssSelectorList(String(blockMatch[1] || ''))) {
                visitSelector(selector, declarations);
            }
        }
    }
    return results;
}

function refreshCheckedHasStateFallback(root) {
    const state = checkedHasStateRescueStates.get(root);
    if (!state) return;
    const activeTokens = [];
    state.rules.forEach((rule, index) => {
        const active = rule.controls.every(control => control?.isConnected && !!control.checked);
        if (active) activeTokens.push(`s${index}`);
    });
    if (activeTokens.length) root.setAttribute(CHECKED_HAS_STATE_ROOT_ATTR, activeTokens.join(' '));
    else root.removeAttribute(CHECKED_HAS_STATE_ROOT_ATTR);
}

function installCheckedHasStateFallback(root) {
    if (!root?.querySelectorAll) return 0;
    const rules = parseBrokenCheckedHasStateRules(root);
    let state = checkedHasStateRescueStates.get(root);
    let rescueStyle = root.querySelector(`style[${CHECKED_HAS_STATE_RESCUE_STYLE_ATTR}]`);
    if (!rules.length) {
        if (state) {
            root.removeEventListener('input', state.onStateChange, false);
            root.removeEventListener('change', state.onStateChange, false);
            checkedHasStateRescueStates.delete(root);
        }
        rescueStyle?.remove();
        root.removeAttribute(CHECKED_HAS_STATE_ROOT_ATTR);
        root.removeAttribute(CHECKED_HAS_STATE_RULE_COUNT_ATTR);
        return 0;
    }

    if (!state) {
        state = {
            rules: [],
            onStateChange: () => refreshCheckedHasStateFallback(root),
        };
        root.addEventListener('input', state.onStateChange, false);
        root.addEventListener('change', state.onStateChange, false);
        checkedHasStateRescueStates.set(root, state);
    }
    state.rules = rules;

    if (!rescueStyle) {
        rescueStyle = document.createElement('style');
        rescueStyle.setAttribute(CHECKED_HAS_STATE_RESCUE_STYLE_ATTR, 'true');
        root.appendChild(rescueStyle);
    }
    rescueStyle.textContent = rules.map((rule, index) => (
        `[${CHECKED_HAS_STATE_ROOT_ATTR}~="s${index}"] ${rule.targetSelector} {${rule.declarations}}`
    )).join('\n');
    root.setAttribute(CHECKED_HAS_STATE_RULE_COUNT_ATTR, String(rules.length));
    refreshCheckedHasStateFallback(root);
    return rules.length;
}


function normalizeDetachedCheckedHasSelector(selectorText) {
    let selector = String(selectorText || '').trim();
    if (!selector) return '';
    selector = selector.replace(/^:scope\s+/i, '').trim();
    // 样式清洗会在局部选择器前加 .mes_text；当前 root 本身已位于 .mes_text 内，
    // querySelectorAll() 无法从后代重新命中这个外层祖先，因此只移除明确的宿主前缀。
    for (let guard = 0; guard < 5; guard += 1) {
        const next = selector.replace(/^(?:html|body|\.mes_text|\.mes)\s+/i, '').trim();
        if (next === selector) break;
        selector = next;
    }
    return selector;
}

function queryDetachedCheckedHasElements(root, selectorText) {
    if (!root?.querySelectorAll) return [];
    const selector = normalizeDetachedCheckedHasSelector(selectorText);
    if (!selector) return [];
    const result = [];
    const seen = new Set();
    try {
        if (root.matches?.(selector)) {
            result.push(root);
            seen.add(root);
        }
        for (const element of root.querySelectorAll(selector)) {
            if (seen.has(element)) continue;
            seen.add(element);
            result.push(element);
        }
    } catch {
        return [];
    }
    return result;
}

function detachedCheckedHasSafeDeclarations(declarationText) {
    return parseCssStateSiblingAssignments(declarationText)
        .filter(({ value }) => !/(?:expression\s*\(|javascript\s*:|url\s*\()/i.test(String(value || '')))
        .map(({ property, value }) => `${property}: ${value} !important;`)
        .join('');
}

function parseDetachedCheckedHasRules(root) {
    if (!root?.querySelectorAll) return [];
    const rules = [];
    const seen = new Set();
    const blockRe = /([^{}]+)\{([^{}]*)\}/g;
    const conditionRe = /:has\(\s*(input(?:\s*(?:\[[^\]]+\]|[.#][A-Za-z_][\w-]*))*)\s*:checked\s*\)/i;

    for (const style of getRabbitMirrorLocalStyleElements(root).filter(styleEl => !styleEl.hasAttribute(DETACHED_CHECKED_HAS_RESCUE_STYLE_ATTR))) {
        const css = String(style.textContent || '');
        let block;
        blockRe.lastIndex = 0;
        while ((block = blockRe.exec(css))) {
            const declarations = detachedCheckedHasSafeDeclarations(block[2]);
            if (!declarations) continue;
            for (const rawSelector of splitCssSelectorList(block[1])) {
                const selector = String(rawSelector || '').trim();
                if (!selector || (selector.match(/:has\(/gi) || []).length !== 1 || !/:checked\b/i.test(selector)) continue;
                const condition = conditionRe.exec(selector);
                if (!condition) continue;

                const hostSelector = normalizeDetachedCheckedHasSelector(selector.slice(0, condition.index));
                const targetSelector = normalizeDetachedCheckedHasSelector(
                    selector.slice(condition.index + condition[0].length).trim().replace(/^[>+~]\s*/, ''),
                );
                const controlSelector = String(condition[1] || '').replace(/\s+/g, '');
                if (!hostSelector || !targetSelector || !controlSelector) continue;
                if (/:has\(|:checked\b|::(?:before|after)/i.test(targetSelector)) continue;

                const hosts = queryDetachedCheckedHasElements(root, hostSelector);
                const controls = queryDetachedCheckedHasElements(root, controlSelector)
                    .filter(control => control.matches?.('input[type="checkbox"], input[type="radio"]') && !control.disabled);
                const targets = queryDetachedCheckedHasElements(root, targetSelector)
                    .filter(target => hosts.some(host => host === target || host.contains?.(target)));
                if (!hosts.length || hosts.length > 8 || !controls.length || controls.length > 12 || !targets.length || targets.length > 24) continue;

                // 原生 :has() 只有在 input 位于 host 内部时才会命中。当前控件全部位于 host 外，
                // 但目标正文确实位于 host 内，属于可高置信恢复的“控制区与内容区分离”结构。
                if (hosts.some(host => controls.some(control => host.contains?.(control)))) continue;

                const key = `${controlSelector}|${hostSelector}|${targetSelector}|${declarations}`;
                if (seen.has(key)) continue;
                seen.add(key);
                rules.push({ controls, hostSelector, targetSelector, declarations, targets });
            }
        }
    }
    return rules;
}

function refreshDetachedCheckedHasFallback(root) {
    const state = detachedCheckedHasRescueStates.get(root);
    if (!state) return;
    const activeTokens = [];
    state.rules.forEach((rule, index) => {
        if (rule.controls.some(control => control?.isConnected && !!control.checked)) activeTokens.push(`s${index}`);
    });
    if (activeTokens.length) root.setAttribute(DETACHED_CHECKED_HAS_ROOT_ATTR, activeTokens.join(' '));
    else root.removeAttribute(DETACHED_CHECKED_HAS_ROOT_ATTR);
}

function installDetachedCheckedHasFallback(root) {
    if (!root?.querySelectorAll) return 0;
    const rules = parseDetachedCheckedHasRules(root);
    let state = detachedCheckedHasRescueStates.get(root);
    let rescueStyle = root.querySelector(`style[${DETACHED_CHECKED_HAS_RESCUE_STYLE_ATTR}]`);

    const liveControls = new Set(rules.flatMap(rule => rule.controls));
    for (const control of root.querySelectorAll(`[${DETACHED_CHECKED_HAS_CONTROL_ATTR}]`)) {
        if (!liveControls.has(control)) control.removeAttribute(DETACHED_CHECKED_HAS_CONTROL_ATTR);
    }

    if (!rules.length) {
        if (state) {
            root.removeEventListener('input', state.onStateChange, false);
            root.removeEventListener('change', state.onStateChange, false);
            detachedCheckedHasRescueStates.delete(root);
        }
        rescueStyle?.remove();
        root.removeAttribute(DETACHED_CHECKED_HAS_ROOT_ATTR);
        root.removeAttribute(DETACHED_CHECKED_HAS_RULE_COUNT_ATTR);
        return 0;
    }

    if (!state) {
        state = {
            rules: [],
            onStateChange: event => {
                const current = detachedCheckedHasRescueStates.get(root);
                if (!current?.controls?.has(event.target)) return;
                refreshDetachedCheckedHasFallback(root);
                for (const delay of [0, 80, 260]) {
                    setTimeout(() => {
                        if (root.isConnected) refreshDetachedCheckedHasFallback(root);
                    }, delay);
                }
            },
        };
        root.addEventListener('input', state.onStateChange, false);
        root.addEventListener('change', state.onStateChange, false);
        detachedCheckedHasRescueStates.set(root, state);
    }
    state.rules = rules;
    state.controls = liveControls;

    if (!rescueStyle) {
        rescueStyle = document.createElement('style');
        rescueStyle.setAttribute(DETACHED_CHECKED_HAS_RESCUE_STYLE_ATTR, 'true');
        root.appendChild(rescueStyle);
    }
    rescueStyle.textContent = rules.map((rule, index) => (
        `[${DETACHED_CHECKED_HAS_ROOT_ATTR}~="s${index}"] ${rule.targetSelector} {${rule.declarations}}`
    )).join('\n');

    const perControlCount = new Map();
    for (const rule of rules) {
        for (const control of rule.controls) perControlCount.set(control, (perControlCount.get(control) || 0) + 1);
    }
    for (const [control, count] of perControlCount) {
        control.setAttribute(DETACHED_CHECKED_HAS_CONTROL_ATTR, String(count));
    }
    root.setAttribute(DETACHED_CHECKED_HAS_RULE_COUNT_ATTR, String(rules.length));
    refreshDetachedCheckedHasFallback(root);
    return rules.length;
}


function checkedHasDisplayValue(declarations) {
    const source = String(declarations || '');
    const match = /(?:^|;)\s*display\s*:\s*([^;{}]+?)(?:\s*!important\s*)?(?=;|$)/i.exec(source);
    return String(match?.[1] || '').trim().replace(/\s*!important\s*$/i, '').toLowerCase();
}

function parseSimpleCheckedHasDisplayRules(root) {
    if (!root?.querySelectorAll) return [];
    const rules = [];
    const seen = new Set();
    for (const style of getRabbitMirrorLocalStyleElements(root)) {
        const css = String(style.textContent || '');
        const blockRe = /([^{}]+)\{([^{}]*)\}/g;
        let block;
        while ((block = blockRe.exec(css))) {
            const display = checkedHasDisplayValue(block[2]);
            if (!display) continue;
            for (const rawSelector of splitCssSelectorList(block[1])) {
                const selector = String(rawSelector || '').trim();
                if (!selector || !/:has\(/i.test(selector) || !/:checked\b/i.test(selector)) continue;
                const condition = /:has\(\s*(input(?:\s*\[[^\]]+\]|\s*[.#][A-Za-z_][\w-]*)*)\s*:checked\s*\)/i.exec(selector);
                if (!condition) continue;
                const controlSelector = String(condition[1] || '').trim();
                if (!controlSelector || /[>+~,]/.test(controlSelector) || /:(?!not\()/i.test(controlSelector)) continue;
                const targetSelector = selector.slice(condition.index + condition[0].length)
                    .trim()
                    .replace(/^[>+~]\s*/, '');
                if (!targetSelector || /:has\(|:checked\b|::(?:before|after)/i.test(targetSelector)) continue;

                let controls = [];
                let targets = [];
                try {
                    controls = [...root.querySelectorAll(controlSelector)]
                        .filter(input => input.matches?.('input[type="checkbox"]') && !input.disabled);
                    targets = [...root.querySelectorAll(targetSelector)];
                } catch {
                    continue;
                }
                if (!controls.length || controls.length > 8 || !targets.length || targets.length > 8) continue;
                for (const input of controls) {
                    for (const target of targets) {
                        const key = `${controlSelector}|${targetSelector}|${display}|${controls.indexOf(input)}|${targets.indexOf(target)}`;
                        if (seen.has(key)) continue;
                        seen.add(key);
                        rules.push({ input, target, display });
                    }
                }
            }
        }
    }
    return rules;
}

function pairedCheckedStateBaselineHidden(panel) {
    return String(panel?.style?.getPropertyValue?.('display') || '').trim().toLowerCase() === 'none';
}

function findPairedCheckedStateCandidates(root) {
    const rules = parseSimpleCheckedHasDisplayRules(root);
    if (!rules.length) return [];
    const byInput = new Map();
    for (const rule of rules) {
        let targetMap = byInput.get(rule.input);
        if (!targetMap) {
            targetMap = new Map();
            byInput.set(rule.input, targetMap);
        }
        targetMap.set(rule.target, rule.display);
    }

    const inputs = [...byInput.keys()];
    const results = [];
    const seen = new Set();
    for (let firstIndex = 0; firstIndex < inputs.length; firstIndex += 1) {
        const first = inputs[firstIndex];
        const firstMap = byInput.get(first);
        for (let secondIndex = firstIndex + 1; secondIndex < inputs.length; secondIndex += 1) {
            const second = inputs[secondIndex];
            const secondMap = byInput.get(second);
            const firstPanel = [...firstMap.keys()].find(target => target.contains?.(first) && firstMap.get(target) === 'none');
            const secondPanel = [...secondMap.keys()].find(target => target.contains?.(second) && secondMap.get(target) === 'none');
            if (!firstPanel || !secondPanel || firstPanel === secondPanel || firstPanel.parentElement !== secondPanel.parentElement) continue;
            const firstShowsSecond = String(firstMap.get(secondPanel) || '') !== 'none' && !!firstMap.get(secondPanel);
            const secondShowsFirst = String(secondMap.get(firstPanel) || '') !== 'none' && !!secondMap.get(firstPanel);
            if (!firstShowsSecond || !secondShowsFirst) continue;
            if (!inputHasAssociatedLabel(root, first) || !inputHasAssociatedLabel(root, second)) continue;
            if (maintenanceMobileLayoutTextLength(firstPanel) < 8 || maintenanceMobileLayoutTextLength(secondPanel) < 8) continue;

            let forward = first;
            let back = second;
            let initial = firstPanel;
            let feedback = secondPanel;
            let forwardMap = firstMap;
            let backMap = secondMap;
            const firstHidden = pairedCheckedStateBaselineHidden(firstPanel);
            const secondHidden = pairedCheckedStateBaselineHidden(secondPanel);
            if (firstHidden && !secondHidden) {
                forward = second;
                back = first;
                initial = secondPanel;
                feedback = firstPanel;
                forwardMap = secondMap;
                backMap = firstMap;
            } else if (firstHidden === secondHidden) {
                const firstSignature = `${firstPanel.id || ''} ${firstPanel.className || ''}`;
                const secondSignature = `${secondPanel.id || ''} ${secondPanel.className || ''}`;
                if (/(?:feedback|result|detail|secondary|back|反馈|结果|详情|次画面)/i.test(firstSignature)
                    && !/(?:feedback|result|detail|secondary|back|反馈|结果|详情|次画面)/i.test(secondSignature)) {
                    forward = second;
                    back = first;
                    initial = secondPanel;
                    feedback = firstPanel;
                    forwardMap = secondMap;
                    backMap = firstMap;
                }
            }
            if (pairedCheckedStateBaselineHidden(initial) || !pairedCheckedStateBaselineHidden(feedback)) continue;

            const initialShow = String(backMap.get(initial) || '').trim().toLowerCase();
            const feedbackShow = String(forwardMap.get(feedback) || '').trim().toLowerCase();
            if (!initialShow || initialShow === 'none' || !feedbackShow || feedbackShow === 'none') continue;
            const key = `${inputs.indexOf(forward)}|${inputs.indexOf(back)}|${[...root.querySelectorAll('*')].indexOf(initial)}|${[...root.querySelectorAll('*')].indexOf(feedback)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            results.push({ forward, back, initial, feedback, initialShow, feedbackShow });
        }
    }
    return results;
}

function refreshPairedCheckedStateRescue(root) {
    const state = pairedCheckedStateRescueStates.get(root);
    if (!state) return;
    for (const entry of state.entries || []) {
        if (!entry.forward?.isConnected || !entry.back?.isConnected || !entry.initial?.isConnected || !entry.feedback?.isConnected) continue;
        if (entry.back.checked) {
            entry.forward.checked = false;
            entry.back.checked = false;
            restoreInteractionInlineOverrides(entry.forward);
            restoreInteractionInlineOverrides(entry.back);
        } else if (entry.forward.checked) {
            entry.back.checked = false;
        }
        const active = !!entry.forward.checked;
        entry.initial.style.setProperty('display', active ? 'none' : entry.initialShow, 'important');
        entry.feedback.style.setProperty('display', active ? entry.feedbackShow : 'none', 'important');
        entry.forward.setAttribute('aria-pressed', active ? 'true' : 'false');
        entry.back.setAttribute('aria-pressed', 'false');
        entry.initial.setAttribute(PAIRED_CHECKED_STATE_PANEL_ATTR, 'initial');
        entry.feedback.setAttribute(PAIRED_CHECKED_STATE_PANEL_ATTR, 'feedback');
    }
}

function schedulePairedCheckedStateRefresh(root) {
    for (const delay of [0, 80, 260, 650]) {
        setTimeout(() => {
            if (root?.isConnected) refreshPairedCheckedStateRescue(root);
        }, delay);
    }
}

function installPairedCheckedStateRescue(root) {
    if (!root?.querySelectorAll) return 0;
    const entries = findPairedCheckedStateCandidates(root);
    let state = pairedCheckedStateRescueStates.get(root);
    if (!entries.length) {
        if (state) {
            root.removeEventListener('click', state.onClick, true);
            root.removeEventListener('change', state.onChange, false);
            pairedCheckedStateRescueStates.delete(root);
        }
        root.removeAttribute(PAIRED_CHECKED_STATE_RESCUE_ATTR);
        root.removeAttribute(PAIRED_CHECKED_STATE_COUNT_ATTR);
        root.querySelectorAll(`[${PAIRED_CHECKED_STATE_CONTROL_ATTR}], [${PAIRED_CHECKED_STATE_PANEL_ATTR}]`).forEach(element => {
            element.removeAttribute(PAIRED_CHECKED_STATE_CONTROL_ATTR);
            element.removeAttribute(PAIRED_CHECKED_STATE_PANEL_ATTR);
        });
        return 0;
    }

    if (!state) {
        state = {
            entries: [],
            onClick: event => {
                const label = event.target?.closest?.('label');
                if (!label || !root.contains(label)) return;
                const targetId = label.getAttribute('for');
                const input = targetId
                    ? [...root.querySelectorAll('input[id]')].find(element => element.id === targetId)
                    : label.querySelector('input[type="checkbox"]');
                const entry = state.entries.find(item => item.forward === input || item.back === input);
                if (!entry) return;

                // 双向画面由本专项路线独占 label 点击。阻止浏览器原生 label 默认切换，
                // 避免后续通用 label 兜底或迟到的 WebView 默认行为把 back 再次勾上。
                event.preventDefault();
                const forwardBefore = !!entry.forward.checked;
                const backBefore = !!entry.back.checked;
                if (input === entry.forward) {
                    entry.forward.checked = true;
                    entry.back.checked = false;
                } else {
                    entry.forward.checked = false;
                    entry.back.checked = false;
                }
                restoreInteractionInlineOverrides(entry.forward);
                restoreInteractionInlineOverrides(entry.back);
                refreshPairedCheckedStateRescue(root);
                schedulePairedCheckedStateRefresh(root);

                if (forwardBefore !== entry.forward.checked) {
                    entry.forward.dispatchEvent(new Event('input', { bubbles: true }));
                    entry.forward.dispatchEvent(new Event('change', { bubbles: true }));
                }
                if (backBefore !== entry.back.checked) {
                    entry.back.dispatchEvent(new Event('input', { bubbles: true }));
                    entry.back.dispatchEvent(new Event('change', { bubbles: true }));
                }
            },
            onChange: event => {
                const entry = state.entries.find(item => item.forward === event.target || item.back === event.target);
                if (!entry) return;
                if (event.target === entry.forward && entry.forward.checked) entry.back.checked = false;
                if (event.target === entry.back && entry.back.checked) {
                    entry.forward.checked = false;
                    entry.back.checked = false;
                }
                refreshPairedCheckedStateRescue(root);
                schedulePairedCheckedStateRefresh(root);
            },
        };
        root.addEventListener('click', state.onClick, true);
        root.addEventListener('change', state.onChange, false);
        pairedCheckedStateRescueStates.set(root, state);
    }
    state.entries = entries;
    for (const entry of entries) {
        entry.forward.setAttribute(PAIRED_CHECKED_STATE_CONTROL_ATTR, 'forward');
        entry.back.setAttribute(PAIRED_CHECKED_STATE_CONTROL_ATTR, 'back');
    }
    root.setAttribute(PAIRED_CHECKED_STATE_RESCUE_ATTR, 'true');
    root.setAttribute(PAIRED_CHECKED_STATE_COUNT_ATTR, String(entries.length));
    refreshPairedCheckedStateRescue(root);
    schedulePairedCheckedStateRefresh(root);
    return entries.length;
}

function checkedStyleMapActivatesStackedPanel(styleMap) {
    for (const [rawProperty, rawValue] of styleMap || []) {
        const property = String(rawProperty || '').trim().toLowerCase();
        const value = String(rawValue || '').trim().toLowerCase().replace(/\s*!important\s*$/i, '');
        if (property === 'opacity') {
            const opacity = Number.parseFloat(value);
            if (Number.isFinite(opacity) && opacity > 0.05) return true;
        }
        if (property === 'visibility' && !/^(?:hidden|collapse)$/.test(value)) return true;
        if (property === 'display' && value && value !== 'none') return true;
        if (property === 'pointer-events' && value && value !== 'none') return true;
    }
    return false;
}

function commonStackedPanelClassToken(targets) {
    const lists = (targets || []).map(target => new Set(getClassTokens(target)));
    if (!lists.length) return '';
    const candidates = [...lists[0]].filter(token => lists.every(set => set.has(token)));
    return candidates
        .filter(token => /(?:info|content|state|panel|result|feedback|detail|text|screen|view)/i.test(token))
        .sort((a, b) => b.length - a.length)[0] || '';
}

function stackedPanelsShareLayer(parent, panels) {
    if (!parent || !panels?.length) return false;
    const parentStyle = maintenanceSafeComputedStyle(parent);
    const parentDisplay = String(parentStyle?.display || '').toLowerCase();
    if (parentDisplay === 'grid' || parentDisplay === 'inline-grid') {
        const areas = panels.map(panel => {
            const style = maintenanceSafeComputedStyle(panel);
            return [
                String(style?.gridArea || ''),
                String(style?.gridRowStart || ''),
                String(style?.gridColumnStart || ''),
            ].join('|');
        });
        const nonEmpty = areas.filter(value => value.replace(/\|/g, '').trim());
        if (!nonEmpty.length || new Set(nonEmpty).size === 1) return true;
        // 模型常只在公共 class 上声明 grid-area，部分 WebView 的 computedStyle 不返回长属性；
        // 父层为单格 grid 且所有候选是同一公共内容 class 时仍可视为叠层。
        const columnTemplate = String(parentStyle?.gridTemplateColumns || '').trim();
        const rowTemplate = String(parentStyle?.gridTemplateRows || '').trim();
        if (!/\s/.test(columnTemplate) && !/\s/.test(rowTemplate)) return true;
    }
    const positions = panels.map(panel => String(maintenanceSafeComputedStyle(panel)?.position || '').toLowerCase());
    return positions.every(position => position === 'absolute' || position === 'fixed');
}

function findExclusiveStackedStateCandidates(root) {
    if (!root?.querySelectorAll) return [];
    const byParent = new Map();

    for (const input of root.querySelectorAll('input[type="radio"], input[type="checkbox"]')) {
        if (input.disabled) continue;
        for (const rule of parseCheckedRulesFromText(root, input)) {
            if (rule.pseudoElement || !checkedStyleMapActivatesStackedPanel(rule.styleMap)) continue;
            for (const target of resolveTargetsForCheckedRule(root, input, rule)) {
                if (!target?.parentElement || maintenanceMobileLayoutTextLength(target) < 6) continue;
                const parent = target.parentElement;
                if (!byParent.has(parent)) byParent.set(parent, new Map());
                const inputMap = byParent.get(parent);
                if (!inputMap.has(input)) inputMap.set(input, new Set());
                inputMap.get(input).add(target);
            }
        }
    }

    const candidates = [];
    for (const [parent, inputMap] of byParent) {
        const mappedTargets = [...new Set([...inputMap.values()].flatMap(set => [...set]))];
        if (inputMap.size < 2 || mappedTargets.length < 2 || mappedTargets.some(target => target.parentElement !== parent)) continue;
        const commonClass = commonStackedPanelClassToken(mappedTargets);
        if (!commonClass) continue;
        const panels = [...parent.children].filter(child => child.classList?.contains(commonClass));
        if (panels.length < mappedTargets.length || panels.length > 10) continue;
        if (!mappedTargets.every(target => panels.includes(target))) continue;
        if (!stackedPanelsShareLayer(parent, panels)) continue;
        const defaultPanels = panels.filter(panel => !mappedTargets.includes(panel));
        if (!defaultPanels.length && panels.length === mappedTargets.length) {
            // 没有默认层也可以修复，但至少要有两个互斥 radio 分支。
            const controls = [...inputMap.keys()];
            if (!controls.every(input => input.type === 'radio')) continue;
        }
        candidates.push({ parent, inputMap, panels, defaultPanels, commonClass });
    }
    return candidates;
}

function cleanupExclusiveStackedStateRescue(root) {
    const state = exclusiveStackedStateRescueStates.get(root);
    if (state) {
        root.removeEventListener('input', state.onStateChange, false);
        root.removeEventListener('change', state.onStateChange, false);
        for (const entry of state.entries || []) {
            for (const panelState of entry.panelStates || []) {
                restorePseudoStyleState(panelState.panel, panelState.originalStyles);
                panelState.panel?.removeAttribute?.(EXCLUSIVE_STACKED_STATE_PANEL_ATTR);
                panelState.panel?.removeAttribute?.('aria-hidden');
            }
            for (const input of entry.inputMap?.keys?.() || []) {
                input?.removeAttribute?.(EXCLUSIVE_STACKED_STATE_CONTROL_ATTR);
            }
        }
        exclusiveStackedStateRescueStates.delete(root);
    }
    root?.removeAttribute?.(EXCLUSIVE_STACKED_STATE_RESCUE_ATTR);
    root?.removeAttribute?.(EXCLUSIVE_STACKED_STATE_COUNT_ATTR);
}

function refreshExclusiveStackedStateRescue(root) {
    const state = exclusiveStackedStateRescueStates.get(root);
    if (!state) return;
    for (const entry of state.entries || []) {
        if (!entry.parent?.isConnected) continue;
        const checkedMappings = [...entry.inputMap.entries()]
            .filter(([input]) => input?.isConnected && input.checked);
        // radio 组被宿主破坏时，优先采用 DOM 顺序中最后一个 checked 分支；
        // scopeRabbitMirrorInteractionIds 会在本路线安装前恢复真正的单选组。
        const activeMapping = checkedMappings.length ? checkedMappings[checkedMappings.length - 1] : null;
        const activePanels = new Set(activeMapping ? [...activeMapping[1]] : entry.defaultPanels);
        for (const panelState of entry.panelStates) {
            const { panel } = panelState;
            if (!panel?.isConnected) continue;
            const active = activePanels.has(panel);
            panel.style.setProperty('opacity', active ? '1' : '0', 'important');
            panel.style.setProperty('visibility', active ? 'visible' : 'hidden', 'important');
            panel.style.setProperty('pointer-events', active ? 'auto' : 'none', 'important');
            panel.style.setProperty('z-index', active ? '2' : '0', 'important');
            panel.setAttribute(EXCLUSIVE_STACKED_STATE_PANEL_ATTR, active ? 'active' : 'inactive');
            panel.setAttribute('aria-hidden', active ? 'false' : 'true');
        }
        for (const input of entry.inputMap.keys()) {
            input.setAttribute('aria-pressed', input.checked ? 'true' : 'false');
        }
    }
}

function scheduleExclusiveStackedStateRefresh(root) {
    for (const delay of [0, 80, 260, 650]) {
        setTimeout(() => {
            if (root?.isConnected) refreshExclusiveStackedStateRescue(root);
        }, delay);
    }
}

function installExclusiveStackedStateRescue(root) {
    if (!root?.querySelectorAll) return 0;
    const candidates = findExclusiveStackedStateCandidates(root);
    cleanupExclusiveStackedStateRescue(root);
    if (!candidates.length) return 0;

    const state = {
        entries: candidates.map(candidate => ({
            ...candidate,
            panelStates: candidate.panels.map(panel => ({
                panel,
                originalStyles: capturePseudoStyleState(panel, ['opacity', 'visibility', 'pointer-events', 'z-index']),
            })),
        })),
        onStateChange: () => {
            refreshExclusiveStackedStateRescue(root);
            scheduleExclusiveStackedStateRefresh(root);
        },
    };
    root.addEventListener('input', state.onStateChange, false);
    root.addEventListener('change', state.onStateChange, false);
    exclusiveStackedStateRescueStates.set(root, state);

    for (const entry of state.entries) {
        for (const input of entry.inputMap.keys()) {
            input.setAttribute(EXCLUSIVE_STACKED_STATE_CONTROL_ATTR, 'true');
        }
    }
    root.setAttribute(EXCLUSIVE_STACKED_STATE_RESCUE_ATTR, 'true');
    root.setAttribute(EXCLUSIVE_STACKED_STATE_COUNT_ATTR, String(state.entries.length));
    refreshExclusiveStackedStateRescue(root);
    scheduleExclusiveStackedStateRefresh(root);
    return state.entries.length;
}


function channelDialLabelsForInput(root, input) {
    if (!root?.querySelectorAll || !input) return [];
    const labels = new Set();
    for (const label of input.labels || []) {
        if (root.contains?.(label)) labels.add(label);
    }
    const id = String(input.id || '').trim();
    if (id) {
        for (const label of root.querySelectorAll('label[for]')) {
            if (String(label.getAttribute('for') || '') === id) labels.add(label);
        }
    }
    return [...labels];
}

function channelDialMediaSignature(element) {
    if (!element) return '';
    return `${element.id || ''} ${element.className || ''} ${element.getAttribute?.('aria-label') || ''}`;
}

function findChannelDialCycleCandidates(root) {
    if (!root?.querySelectorAll) return [];
    const stackedCandidates = findExclusiveStackedStateCandidates(root);
    const groups = new Map();
    for (const input of root.querySelectorAll('input[type="radio"]')) {
        if (input.disabled) continue;
        const name = String(input.name || '').trim();
        if (!name) continue;
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(input);
    }

    const candidates = [];
    for (const inputs of groups.values()) {
        if (inputs.length < 3 || inputs.length > 8) continue;
        const stacked = stackedCandidates.find(candidate => {
            const mappedInputs = new Set(candidate.inputMap.keys());
            return inputs.every(input => mappedInputs.has(input));
        });
        if (!stacked) continue;

        const allLabels = new Map(inputs.map(input => [input, channelDialLabelsForInput(root, input)]));
        if ([...allLabels.values()].some(labels => !labels.length)) continue;

        const possibleHosts = [...root.querySelectorAll('div,section,nav')].filter(element => {
            const style = maintenanceSafeComputedStyle(element);
            const position = String(style?.position || element.style?.position || '').toLowerCase();
            const signature = channelDialMediaSignature(element);
            const dialLike = /(?:knob|dial|channel-control|频道|旋钮)/i.test(signature)
                || !!element.querySelector?.('[class*="knob" i], [class*="dial" i], [aria-label*="频道"], [aria-label*="旋钮"]');
            if (!dialLike && position !== 'relative') return false;
            return inputs.every(input => (allLabels.get(input) || []).some(label => element.contains(label)));
        });

        let host = null;
        for (const candidateHost of possibleHosts) {
            const rect = maintenanceMobileLayoutRect(candidateHost);
            const width = Number(rect?.width || maintenanceMobileLayoutLengthPx(
                maintenanceSafeComputedStyle(candidateHost)?.width,
                Number(root.getBoundingClientRect?.().width || 480),
            ) || 0);
            const height = Number(rect?.height || 0);
            if ((width > 0 && width > 180) || (height > 0 && height > 180)) continue;
            const visibleDial = [...candidateHost.querySelectorAll('div,span')].find(element => {
                const signature = channelDialMediaSignature(element);
                if (!/(?:knob|dial|旋钮)/i.test(signature)) return false;
                const style = maintenanceSafeComputedStyle(element);
                const elementRect = maintenanceMobileLayoutRect(element);
                return String(style?.display || '').toLowerCase() !== 'none'
                    && Number(elementRect?.width || 0) >= 20
                    && Number(elementRect?.height || 0) >= 20;
            });
            if (!visibleDial) continue;

            let mediaHost = candidateHost;
            let mediaMatched = false;
            while (mediaHost && root.contains?.(mediaHost)) {
                const signature = channelDialMediaSignature(mediaHost);
                const hasScreen = !!mediaHost.querySelector?.('[class*="tv-screen" i], [class*="screen" i], [class*="channel" i], [class*="content-state" i]');
                if (/(?:tv|television|crt|monitor|terminal|频道|电视|监控|终端)/i.test(signature) || hasScreen) {
                    mediaMatched = true;
                    break;
                }
                if (mediaHost === root) break;
                mediaHost = mediaHost.parentElement;
            }
            if (!mediaMatched) continue;
            host = candidateHost;
            break;
        }
        if (!host) continue;
        candidates.push({ inputs, host, labels: [...new Set([...allLabels.values()].flat())] });
    }
    return candidates;
}

function cleanupChannelDialCycleRescue(root) {
    const state = channelDialCycleRescueStates.get(root);
    if (state) {
        for (const entry of state.entries || []) {
            entry.host?.removeEventListener?.('click', entry.onClick, true);
            entry.host?.removeEventListener?.('keydown', entry.onKeyDown, true);
            if (entry.host) {
                if (entry.originalRole == null) entry.host.removeAttribute('role');
                else entry.host.setAttribute('role', entry.originalRole);
                if (entry.originalTabIndex == null) entry.host.removeAttribute('tabindex');
                else entry.host.setAttribute('tabindex', entry.originalTabIndex);
                if (entry.originalAriaLabel == null) entry.host.removeAttribute('aria-label');
                else entry.host.setAttribute('aria-label', entry.originalAriaLabel);
                entry.host.removeAttribute(CHANNEL_DIAL_CYCLE_HOST_ATTR);
            }
            for (const labelState of entry.labelStates || []) {
                const { label, value, priority } = labelState;
                if (!label?.style) continue;
                if (value) label.style.setProperty('pointer-events', value, priority || '');
                else label.style.removeProperty('pointer-events');
                label.removeAttribute(CHANNEL_DIAL_CYCLE_LABEL_ATTR);
            }
        }
        channelDialCycleRescueStates.delete(root);
    }
    root?.removeAttribute?.(CHANNEL_DIAL_CYCLE_RESCUE_ATTR);
    root?.removeAttribute?.(CHANNEL_DIAL_CYCLE_COUNT_ATTR);
}

function activateChannelDialInput(root, entry, nextInput) {
    if (!nextInput?.isConnected || !root.contains?.(nextInput)) return;
    const before = entry.inputs.map(input => !!input.checked);
    setRescuedCheckedState(root, nextInput, true);
    entry.inputs.forEach(input => input.setAttribute('aria-pressed', input.checked ? 'true' : 'false'));
    entry.inputs.forEach((input, index) => {
        if (before[index] === !!input.checked) return;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    refreshExclusiveStackedStateRescue(root);
    scheduleExclusiveStackedStateRefresh(root);
}

function installChannelDialCycleRescue(root) {
    if (!root?.querySelectorAll) return 0;
    const candidates = findChannelDialCycleCandidates(root);
    cleanupChannelDialCycleRescue(root);
    if (!candidates.length) return 0;

    const state = { entries: [] };
    for (const candidate of candidates) {
        const entry = {
            ...candidate,
            originalRole: candidate.host.getAttribute('role'),
            originalTabIndex: candidate.host.getAttribute('tabindex'),
            originalAriaLabel: candidate.host.getAttribute('aria-label'),
            labelStates: candidate.labels.map(label => ({
                label,
                value: label.style.getPropertyValue('pointer-events'),
                priority: label.style.getPropertyPriority('pointer-events'),
            })),
        };
        const cycle = event => {
            if (!entry.host?.isConnected) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            const currentIndex = Math.max(0, entry.inputs.findIndex(input => input.checked));
            const nextInput = entry.inputs[(currentIndex + 1) % entry.inputs.length];
            activateChannelDialInput(root, entry, nextInput);
        };
        entry.onClick = cycle;
        entry.onKeyDown = event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            cycle(event);
        };
        candidate.host.addEventListener('click', entry.onClick, true);
        candidate.host.addEventListener('keydown', entry.onKeyDown, true);
        candidate.host.setAttribute('role', 'button');
        candidate.host.setAttribute('tabindex', '0');
        candidate.host.setAttribute('aria-label', `频道旋钮：点击切换，共 ${candidate.inputs.length} 个频道`);
        candidate.host.setAttribute(CHANNEL_DIAL_CYCLE_HOST_ATTR, 'true');
        for (const label of candidate.labels) {
            label.style.setProperty('pointer-events', 'none', 'important');
            label.setAttribute(CHANNEL_DIAL_CYCLE_LABEL_ATTR, 'true');
        }
        state.entries.push(entry);
    }
    channelDialCycleRescueStates.set(root, state);
    root.setAttribute(CHANNEL_DIAL_CYCLE_RESCUE_ATTR, 'true');
    root.setAttribute(CHANNEL_DIAL_CYCLE_COUNT_ATTR, String(state.entries.length));
    return state.entries.length;
}

function getLocalContainerTargetsForCheckedRule(input, targetSelector) {
    if (!input || !targetSelector) return [];
    const scope = input.closest?.('label') || input.parentElement;
    if (!scope?.querySelectorAll) return [];
    try {
        const targets = [...scope.querySelectorAll(targetSelector)].filter(target => target !== input);
        // class 型 :checked 规则若结构写错，只允许在当前 label/局部容器内补救，
        // 绝不把同类目标扩散到其他事件节点。
        if (!targets.length || targets.length > 8) return [];
        return targets;
    } catch {
        return [];
    }
}

function applyCheckedRuleTextFallback(toto, input) {
    if (!toto || !input) return 0;
    restoreInteractionInlineOverrides(input);
    if (!input.checked) return 0;

    const records = [];
    const pseudoEntries = [];
    const routeKinds = new Set();
    const revealCandidates = new Map();
    for (const rule of parseCheckedRulesFromText(toto, input)) {
        const targets = resolveTargetsForCheckedRule(toto, input, rule);
        for (const target of targets) {
            routeKinds.add(rule.source);
            if (rule.pseudoElement) {
                pseudoEntries.push({ target, pseudoElement: rule.pseudoElement, styleMap: rule.styleMap });
                continue;
            }
            rememberCheckedRevealCandidate(revealCandidates, target, rule.styleMap);
            for (const [property, value] of rule.styleMap) {
                records.push({
                    element: target,
                    property,
                    value: target.style.getPropertyValue(property),
                    priority: target.style.getPropertyPriority(property),
                });
                target.style.setProperty(property, value, 'important');
            }
        }
    }
    const pseudoDeclarationCount = installInteractionPseudoOverrides(toto, input, pseudoEntries);
    if (records.length) {
        interactionInlineOverrideStates.set(input, records);
        applyExpandedOpacityResidualRescue(input, revealCandidates, records);
        scheduleExpandedOpacityResidualRescue(input, revealCandidates, records);
    }
    if (records.length || pseudoDeclarationCount) {
        input.setAttribute(CHECKED_TEXT_RULE_RESCUE_ATTR, [...routeKinds].join(','));
    }
    return records.length + pseudoDeclarationCount;
}

function restoreInteractionInlineOverrides(input) {
    restoreInteractionPseudoOverrides(input);
    const records = interactionInlineOverrideStates.get(input);
    if (!records) {
        input?.removeAttribute?.(EXPANDED_OPACITY_RESCUE_ATTR);
        return;
    }
    for (const record of records) {
        const { element, property, value, priority } = record;
        if (!element?.style) continue;
        if (value) element.style.setProperty(property, value, priority || '');
        else element.style.removeProperty(property);
    }
    interactionInlineOverrideStates.delete(input);
    input?.removeAttribute?.(EXPANDED_OPACITY_RESCUE_ATTR);
}

function applyCheckedRuleInlineFallback(toto, input) {
    if (!toto?.querySelectorAll || !input?.id) return;

    restoreInteractionInlineOverrides(input);
    if (!input.checked) return;

    const escapedId = typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(input.id)
        : String(input.id).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
    const idNeedle = `#${escapedId}:checked`;
    const records = [];
    const revealCandidates = new Map();

    const applyRule = (selectorText, style) => {
        if (!selectorText || !style || !selectorText.includes(idNeedle)) return;
        let targets = [];
        try {
            targets = [...toto.querySelectorAll(selectorText)];
        } catch {
            return;
        }
        const styleMap = [];
        for (const property of [...style]) {
            const value = style.getPropertyValue(property);
            if (value) styleMap.push([property, value]);
        }
        for (const target of targets) {
            rememberCheckedRevealCandidate(revealCandidates, target, styleMap);
            for (const [property, value] of styleMap) {
                records.push({
                    element: target,
                    property,
                    value: target.style.getPropertyValue(property),
                    priority: target.style.getPropertyPriority(property),
                });
                target.style.setProperty(property, value, 'important');
            }
        }
    };

    for (const styleEl of getRabbitMirrorLocalStyleElements(toto)) {
        try {
            const visitRules = (rules) => {
                for (const rule of [...(rules || [])]) {
                    if (rule?.cssRules) visitRules(rule.cssRules);
                    if (rule?.selectorText && rule?.style) applyRule(rule.selectorText, rule.style);
                }
            };
            visitRules(styleEl.sheet?.cssRules);
        } catch {
            // CSSOM 不可读时，文本级 !important 修复仍然保留。
        }
    }

    if (records.length) {
        interactionInlineOverrideStates.set(input, records);
        applyExpandedOpacityResidualRescue(input, revealCandidates, records);
        scheduleExpandedOpacityResidualRescue(input, revealCandidates, records);
    }
}




const TARGET_ACTIVE_ATTR = 'data-rm-target-active';
const TARGET_RESCUE_STYLE_ATTR = 'data-rabbit-mirror-target-rescue';
const interactionCapabilityStates = new WeakMap();

const INLINE_PSEUDO_RESCUE_ATTR = 'data-rabbit-mirror-inline-pseudo-rescue';
const RAW_HOVER_PSEUDO_RESCUE_ATTR = 'data-rabbit-mirror-raw-hover-pseudo-rescue';
const RAW_HOVER_DECORATION_RESTORE_ATTR = 'data-rabbit-mirror-raw-hover-decoration-restore';
const NESTED_DETAILS_REPLACEMENT_ATTR = 'data-rm-nested-details-replacement';
const NESTED_DETAILS_REPLACEMENT_HOST_ATTR = 'data-rm-nested-details-replacement-host';
const NESTED_DETAILS_REPLACEMENT_STYLE_ATTR = 'data-rabbit-mirror-nested-details-replacement-style';
const NESTED_DETAILS_REPLACEMENT_BOUND_ATTR = 'data-rm-nested-details-replacement-bound';
const NESTED_DETAILS_POPUP_RESCUE_ATTR = 'data-rm-nested-details-popup-rescue';
const NESTED_DETAILS_POPUP_HOST_ATTR = 'data-rm-nested-details-popup-host';
const NESTED_DETAILS_POPUP_CONTENT_ATTR = 'data-rm-nested-details-popup-content';
const NESTED_DETAILS_POPUP_STYLE_ATTR = 'data-rabbit-mirror-nested-details-popup-style';
const NESTED_DETAILS_POPUP_COUNT_ATTR = 'data-rabbit-mirror-nested-details-popup-count';
const MOBILE_INLINE_ANNOTATION_RESCUE_ATTR = 'data-rabbit-mirror-mobile-inline-annotation-rescue';
const MOBILE_INLINE_ANNOTATION_HOST_ATTR = 'data-rm-mobile-inline-annotation-host';
const MOBILE_INLINE_ANNOTATION_ORIGINAL_ATTR = 'data-rm-mobile-inline-annotation-original';
const MOBILE_INLINE_ANNOTATION_MIRROR_ATTR = 'data-rm-mobile-inline-annotation-mirror';
const MOBILE_INLINE_ANNOTATION_VISIBLE_ATTR = 'data-rm-mobile-inline-annotation-visible';
const MOBILE_INLINE_ANNOTATION_STYLE_ATTR = 'data-rabbit-mirror-mobile-inline-annotation-style';
const MOBILE_INLINE_ANNOTATION_COUNT_ATTR = 'data-rabbit-mirror-mobile-inline-annotation-count';
const HINTED_PSEUDO_RESCUE_ATTR = 'data-rabbit-mirror-hinted-pseudo-rescue';
const CHANGE_PSEUDO_RESCUE_ATTR = 'data-rabbit-mirror-change-pseudo-rescue';
const DIRECT_ID_CLICK_RESCUE_ATTR = 'data-rabbit-mirror-direct-id-click-rescue';
const DIRECT_ID_CLASS_STATE_RESCUE_ATTR = 'data-rabbit-mirror-direct-id-class-state-rescue';
const RAW_NAMED_FUNCTION_RESCUE_ATTR = 'data-rabbit-mirror-raw-named-function-rescue';
const PASSPORT_DOCUMENT_RESCUE_ATTR = 'data-rabbit-mirror-passport-document-rescue';
const PASSPORT_DOCUMENT_TRIGGER_RESCUE_ATTR = 'data-rabbit-mirror-passport-document-trigger-rescue';
const PASSPORT_DOCUMENT_HOST_ATTR = 'data-rm-passport-document-host';
const PASSPORT_DOCUMENT_COVER_ATTR = 'data-rm-passport-document-cover';
const PASSPORT_DOCUMENT_PAGES_ATTR = 'data-rm-passport-document-pages';
const PASSPORT_DOCUMENT_CLOSE_ATTR = 'data-rm-passport-document-close';
const PASSPORT_DOCUMENT_STAMP_ATTR = 'data-rm-passport-document-stamp';
const PASSPORT_DOCUMENT_STAMP_INDEX_ATTR = 'data-rm-passport-document-stamp-index';
const PASSPORT_DOCUMENT_STAMP_DETAIL_ATTR = 'data-rm-passport-document-stamp-detail';
const PASSPORT_DOCUMENT_STAMP_ACTIVE_ATTR = 'data-rm-passport-document-stamp-active';
const PASSPORT_DOCUMENT_OPEN_ATTR = 'data-rm-passport-document-open';
const PASSPORT_DOCUMENT_STYLE_ATTR = 'data-rabbit-mirror-passport-document-style';
const MARKDOWN_CSS_COMMENT_RESCUE_ATTR = 'data-rabbit-mirror-markdown-css-comment-rescue';
const PSEUDO_ACTIVE_ATTR = 'data-rm-pseudo-active';
const pseudoInteractionStates = new WeakMap();
const directIdClassStateStates = new WeakMap();
// 同一目标 class 可能由“打开／关闭”两个不同按钮控制；登记所有触发器，
// 每次执行后统一同步 aria-pressed，避免前后按钮状态互相矛盾。
const directIdClassOperationTriggerStates = new WeakMap();
const passportDocumentRescueStates = new WeakMap();

// 统一可逆状态底座：第一次接管某个元素时，把原始内联样式写入 data 属性并保存在 WeakMap。
// 即使宿主随后克隆当前 DOM 或急救器再次扫描，也不会把“交互后状态”误记为新的初始状态。
const REVERSIBLE_STYLE_BASELINE_ATTR = 'data-rm-reversible-style-baseline';
const REVERSIBLE_TEXT_BASELINE_ATTR = 'data-rm-reversible-text-baseline';
const reversibleStyleBaselineStates = new WeakMap();
const reversibleTextBaselineStates = new WeakMap();

// 同一个 checkbox/radio 只允许一条“渲染后结构型”急救路线接管，避免多个兜底互相覆盖。
const RENDERED_INPUT_ROUTE_ATTR = 'data-rm-rendered-input-route';
const REVERSIBLE_TARGET_CLOSE_ATTR = 'data-rm-click-to-restore';
const REVERSIBLE_CHECKED_RESULT_RESCUE_ATTR = 'data-rabbit-mirror-reversible-checked-result-rescue';
const REVERSIBLE_CHECKED_RESULT_TARGET_ATTR = 'data-rm-reversible-checked-result-target';
const REVERSIBLE_CHECKED_RESULT_ROOT_ATTR = 'data-rabbit-mirror-reversible-checked-result-count';
const reversibleTargetCloseStates = new WeakMap();
const reversibleCheckedResultRescueStates = new WeakMap();
const interactionLabelFallbackRoots = new WeakSet();
const LABELED_CHECKED_VERIFY_CONTROL_ATTR = 'data-rabbit-mirror-labeled-checked-verify';
const LABELED_CHECKED_VERIFY_ROOT_ATTR = 'data-rabbit-mirror-labeled-checked-verify-count';
const LABELED_CHECKED_VERIFY_LAST_ATTR = 'data-rabbit-mirror-labeled-checked-last';
const LABELED_CHECKED_VERIFY_TARGET_ATTR = 'data-rm-labeled-checked-verify-target';
const labeledCheckedVerificationStates = new WeakMap();
const UNLABELED_CHECKED_HOST_RESCUE_ATTR = 'data-rabbit-mirror-unlabeled-checked-host-rescue';
const UNLABELED_CHECKED_CONTROL_RESCUE_ATTR = 'data-rabbit-mirror-unlabeled-checked-control-rescue';
const unlabeledCheckedHostRescueStates = new WeakMap();
const FOCUS_WITHIN_PERSISTENT_STYLE_ATTR = 'data-rabbit-mirror-focus-within-persistent-style';
const FOCUS_WITHIN_PERSISTENT_ROOT_ATTR = 'data-rabbit-mirror-focus-within-persistent-count';
const FOCUS_WITHIN_PERSISTENT_HOST_ATTR = 'data-rabbit-mirror-focus-within-persistent-host';
const FOCUS_WITHIN_PERSISTENT_CONTROL_ATTR = 'data-rabbit-mirror-focus-within-persistent-control';
const FOCUS_WITHIN_PERSISTENT_ACTIVE_ATTR = 'data-rm-focus-within-persistent-active';
const FOCUS_WITHIN_PERSISTENT_ROUTE = 'focus-within-persistent';
const focusWithinPersistentRescueStates = new WeakMap();
const WEBKIT_3D_FLIP_RESCUE_ATTR = 'data-rabbit-mirror-webkit-3d-flip-rescue';
const DECORATIVE_OVERLAY_PASS_THROUGH_ATTR = 'data-rabbit-mirror-decorative-overlay-pass-through';
const webKit3DFlipRescueStates = new WeakMap();
const webKit3DFlipStyleStates = new WeakMap();
const webKit3DFlipInlineStates = new WeakMap();

function getRenderedInputRoute(input) {
    return String(input?.getAttribute?.(RENDERED_INPUT_ROUTE_ATTR) || '');
}

function claimRenderedInputRoute(input, routeName) {
    if (!input || !routeName) return false;
    const existing = getRenderedInputRoute(input);
    if (existing && existing !== routeName) return false;
    if (!existing) input.setAttribute(RENDERED_INPUT_ROUTE_ATTR, routeName);
    return true;
}

function dispatchRescuedInputState(input) {
    if (!input?.dispatchEvent) return;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

function installReversibleTargetClose(target, input, root) {
    if (!target?.addEventListener || !input || !root?.contains?.(target)) return false;
    const existing = reversibleTargetCloseStates.get(target);
    if (existing?.input === input && existing?.root === root) return true;
    if (existing) {
        target.removeEventListener?.('click', existing.onClick, false);
        reversibleTargetCloseStates.delete(target);
    }
    // DOM 被宿主克隆时 data 属性可能保留而 WeakMap 不保留；允许重新绑定真实监听器。
    if (target.hasAttribute(REVERSIBLE_TARGET_CLOSE_ATTR)) target.removeAttribute(REVERSIBLE_TARGET_CLOSE_ATTR);

    const onClick = event => {
        if (!input.checked) return;
        const nestedInteractive = event.target?.closest?.(EXISTING_INTERACTIVE_SELECTOR);
        if (nestedInteractive && nestedInteractive !== target && target.contains?.(nestedInteractive)) return;
        const selection = globalThis.getSelection?.();
        if (selection && !selection.isCollapsed && String(selection).trim()) return;
        event.preventDefault();
        if (input.type === 'radio') {
            input.checked = false;
            restoreInteractionInlineOverrides(input);
            dispatchRescuedInputState(input);
        } else {
            setRescuedCheckedState(root, input, false);
        }
    };
    target.addEventListener('click', onClick, false);
    target.setAttribute(REVERSIBLE_TARGET_CLOSE_ATTR, 'true');
    if (!target.hasAttribute('title')) target.setAttribute('title', '再次点按返回上一层');
    reversibleTargetCloseStates.set(target, { input, root, onClick });
    return true;
}

// 渲染后结构型状态层急救：不依赖可能已被宿主删除的 onclick/onchange。
// 仅处理非常明确的结构：label 直属隐藏 checkbox/radio + 两层几何重合的前景/隐藏层。
const RENDERED_STATE_LAYER_RESCUE_ATTR = 'data-rabbit-mirror-rendered-state-layer-rescue';
const RENDERED_STATE_LAYER_ROLE_ATTR = 'data-rm-rendered-state-layer-role';
const renderedStateLayerRescueStates = new WeakMap();

function getInlineStyleValue(element, property) {
    return String(element?.style?.getPropertyValue?.(property) || '').trim();
}

function isExplicitlyHiddenStateLayer(element) {
    const display = getInlineStyleValue(element, 'display').toLowerCase();
    const visibility = getInlineStyleValue(element, 'visibility').toLowerCase();
    const opacityText = getInlineStyleValue(element, 'opacity');
    const opacity = Number.parseFloat(opacityText);
    return display === 'none'
        || visibility === 'hidden'
        || (opacityText !== '' && Number.isFinite(opacity) && opacity <= 0.05);
}

// 某些模型把隐藏态只写在 <style> 中，实际节点没有 inline style。
// 这类目标必须读取计算样式，否则“按钮 + 后置内容”会被误判为完全没有交互。
function getRenderedStyleSnapshot(element) {
    let computed = null;
    try {
        computed = typeof getComputedStyle === 'function' ? getComputedStyle(element) : null;
    } catch {
        computed = null;
    }

    const display = String(computed?.display || getInlineStyleValue(element, 'display') || '').trim().toLowerCase();
    const visibility = String(computed?.visibility || getInlineStyleValue(element, 'visibility') || '').trim().toLowerCase();
    const opacityText = String(computed?.opacity || getInlineStyleValue(element, 'opacity') || '').trim();
    const opacity = Number.parseFloat(opacityText);
    const height = String(computed?.height || getInlineStyleValue(element, 'height') || '').trim().toLowerCase();
    const maxHeight = String(computed?.maxHeight || getInlineStyleValue(element, 'max-height') || '').trim().toLowerCase();
    const transform = String(computed?.transform || getInlineStyleValue(element, 'transform') || '').trim();
    const rectHeight = getRenderedElementHeight(element);

    const displayHidden = display === 'none';
    const visibilityHidden = visibility === 'hidden' || visibility === 'collapse';
    const opacityHidden = opacityText !== '' && Number.isFinite(opacity) && opacity <= 0.05;
    const heightCollapsed = isCollapsedDimensionValue(height) && rectHeight <= 1;
    const maxHeightCollapsed = isCollapsedDimensionValue(maxHeight) && rectHeight <= 1;

    return {
        display,
        visibility,
        opacityText,
        opacity,
        height,
        maxHeight,
        transform,
        rectHeight,
        displayHidden,
        visibilityHidden,
        opacityHidden,
        heightCollapsed,
        maxHeightCollapsed,
        hidden: displayHidden || visibilityHidden || opacityHidden || heightCollapsed || maxHeightCollapsed,
    };
}

function isOverlayLikeStateLayer(element) {
    const position = getInlineStyleValue(element, 'position').toLowerCase();
    if (position === 'absolute' || position === 'fixed') return true;

    const inset = getInlineStyleValue(element, 'inset');
    if (inset) return true;

    const edges = ['top', 'right', 'bottom', 'left']
        .map(property => getInlineStyleValue(element, property))
        .filter(Boolean).length;
    if (edges >= 3) return true;

    const width = getInlineStyleValue(element, 'width').replace(/\s+/g, '');
    const height = getInlineStyleValue(element, 'height').replace(/\s+/g, '');
    return width === '100%' && height === '100%';
}

function getStateLayerGeometryScore(first, second) {
    if (!first || !second) return 0;
    let score = 0;
    for (const property of ['position', 'inset', 'top', 'right', 'bottom', 'left', 'width', 'height']) {
        const firstValue = getInlineStyleValue(first, property).replace(/\s+/g, '').toLowerCase();
        const secondValue = getInlineStyleValue(second, property).replace(/\s+/g, '').toLowerCase();
        if (firstValue && secondValue && firstValue === secondValue) score += 1;
    }
    return score;
}

function neutralizeStateLayerTransform(transformText) {
    let transform = String(transformText || '').trim();
    if (!transform || transform.toLowerCase() === 'none') return '';

    let changed = false;
    transform = transform
        .replace(/translate3d\([^)]*\)/gi, () => {
            changed = true;
            return 'translate3d(0, 0, 0)';
        })
        .replace(/translate(?:x|y|z)?\([^)]*\)/gi, match => {
            changed = true;
            const name = match.slice(0, match.indexOf('('));
            if (/^translate$/i.test(name)) return 'translate(0, 0)';
            return `${name}(0)`;
        })
        .replace(/scale3d\([^)]*\)/gi, () => {
            changed = true;
            return 'scale3d(1, 1, 1)';
        })
        .replace(/scale(?:x|y|z)?\([^)]*\)/gi, match => {
            changed = true;
            const name = match.slice(0, match.indexOf('('));
            if (/^scale$/i.test(name)) return 'scale(1)';
            return `${name}(1)`;
        });

    return changed ? transform : '';
}

function buildRenderedStateLayerEntry(label, input) {
    if (!label?.children || !input || input.parentElement !== label) return null;

    const children = [...label.children];
    const inputIndex = children.indexOf(input);
    if (inputIndex < 0) return null;

    // 只看 input 后面的直属元素，避免把 label 里的说明文字或嵌套控件误当成状态层。
    const candidates = children.slice(inputIndex + 1)
        .filter(element => element?.nodeType === 1 && !/^(?:style|script|input)$/i.test(element.tagName || ''))
        .filter(isOverlayLikeStateLayer)
        .slice(0, 6);
    if (candidates.length < 2) return null;

    const rememberedFront = candidates.filter(element => element.getAttribute?.(RENDERED_STATE_LAYER_ROLE_ATTR) === 'front');
    const rememberedReveal = candidates.filter(element => element.getAttribute?.(RENDERED_STATE_LAYER_ROLE_ATTR) === 'reveal');
    const hiddenCandidates = candidates.filter(isExplicitlyHiddenStateLayer);
    const visibleCandidates = candidates.filter(element => !isExplicitlyHiddenStateLayer(element));
    if ((!hiddenCandidates.length || !visibleCandidates.length) && (!rememberedFront.length || !rememberedReveal.length)) return null;

    // DOM 被宿主克隆时，优先沿用上次写入的 front/reveal 角色，避免把交互后状态反向识别。
    const hiddenLayers = rememberedReveal.length ? rememberedReveal : hiddenCandidates.filter(hidden => (
        visibleCandidates.some(visible => getStateLayerGeometryScore(visible, hidden) >= 3)
    ));
    const visibleLayers = rememberedFront.length ? rememberedFront : visibleCandidates.filter(visible => (
        hiddenLayers.some(hidden => getStateLayerGeometryScore(visible, hidden) >= 3)
    ));
    if (!hiddenLayers.length || !visibleLayers.length) return null;

    const visibleStates = visibleLayers.map(target => ({
        target,
        originalStyles: capturePseudoStyleState(target, ['opacity', 'pointer-events']),
    }));
    const hiddenStates = hiddenLayers.map(target => {
        const originalStyles = capturePseudoStyleState(target, ['display', 'visibility', 'opacity', 'pointer-events', 'transform']);
        return {
            target,
            originalStyles,
            activeTransform: neutralizeStateLayerTransform(getCapturedStyleValue(originalStyles, 'transform')),
            wasDisplayNone: getCapturedStyleValue(originalStyles, 'display').toLowerCase() === 'none',
            wasVisibilityHidden: getCapturedStyleValue(originalStyles, 'visibility').toLowerCase() === 'hidden',
        };
    });

    visibleLayers.forEach(target => target.setAttribute(RENDERED_STATE_LAYER_ROLE_ATTR, 'front'));
    hiddenLayers.forEach(target => target.setAttribute(RENDERED_STATE_LAYER_ROLE_ATTR, 'reveal'));

    return { label, input, visibleStates, hiddenStates };
}

function applyRenderedStateLayerEntry(entry) {
    if (!entry?.input) return;
    const active = !!entry.input.checked;

    for (const state of entry.visibleStates || []) {
        restorePseudoStyleState(state.target, state.originalStyles);
        if (active) {
            applyPseudoStyleAssignments(state.target, [
                { property: 'opacity', value: '0' },
                { property: 'pointer-events', value: 'none' },
            ]);
        }
    }

    for (const state of entry.hiddenStates || []) {
        restorePseudoStyleState(state.target, state.originalStyles);
        if (!active) continue;

        const assignments = [
            { property: 'opacity', value: '1' },
            { property: 'pointer-events', value: 'auto' },
        ];
        if (state.wasDisplayNone) assignments.push({ property: 'display', value: 'block' });
        if (state.wasVisibilityHidden) assignments.push({ property: 'visibility', value: 'visible' });
        if (state.activeTransform) assignments.push({ property: 'transform', value: state.activeTransform });
        applyPseudoStyleAssignments(state.target, assignments);
    }

    entry.label?.setAttribute?.('aria-pressed', active ? 'true' : 'false');
    entry.input?.setAttribute?.('aria-pressed', active ? 'true' : 'false');
}

function applyRenderedStateLayerEntries(root) {
    const state = renderedStateLayerRescueStates.get(root);
    if (!state?.entries?.size) return;
    for (const entry of state.entries.values()) applyRenderedStateLayerEntry(entry);
}

function installRenderedStateLayerRescue(root) {
    if (!root?.querySelectorAll) return;

    let state = renderedStateLayerRescueStates.get(root);
    if (!state) {
        state = { entries: new Map(), listenerInstalled: false };
        renderedStateLayerRescueStates.set(root, state);
    }

    for (const label of root.querySelectorAll('label')) {
        const input = label.querySelector(':scope > input[type="checkbox"], :scope > input[type="radio"]');
        if (!input || state.entries.has(input)) continue;
        const existingRoute = getRenderedInputRoute(input);
        if (existingRoute && existingRoute !== 'state-layer') continue;
        const entry = buildRenderedStateLayerEntry(label, input);
        if (!entry || !claimRenderedInputRoute(input, 'state-layer')) continue;
        state.entries.set(input, entry);
        input.setAttribute(RENDERED_STATE_LAYER_RESCUE_ATTR, 'true');
    }

    if (!state.entries.size) return;

    if (!state.listenerInstalled) {
        const refresh = event => {
            const input = event.target;
            if (!input || !state.entries.has(input)) return;
            // radio 切换会同步取消同组旧项，因此统一刷新当前兔子镜内全部结构状态。
            applyRenderedStateLayerEntries(root);
        };
        root.addEventListener('input', refresh, false);
        root.addEventListener('change', refresh, false);
        state.listenerInstalled = true;
        root.dataset.rabbitMirrorRenderedStateLayerFallback = 'true';
    }

    applyRenderedStateLayerEntries(root);
}


// 渲染后“相邻隐藏内容组”急救：用于 label/checkbox 后方紧邻的多段隐藏内容。
// 不依赖 onchange 原文，专门覆盖 querySelectorAll(...)[n] 在宿主净化后无法回读的情况。
const RENDERED_ADJACENT_HIDDEN_GROUP_RESCUE_ATTR = 'data-rabbit-mirror-adjacent-hidden-group-rescue';
const RENDERED_ADJACENT_HIDDEN_ITEM_ATTR = 'data-rm-adjacent-hidden-item';
const renderedAdjacentHiddenGroupRescueStates = new WeakMap();
const ADJACENT_HIDDEN_TRIGGER_HINT_RE = /(?:点击|轻触|触摸|按下|查看|读取|提取|感知|共振|唤醒|揭示|显示|开启|切换|进入)|\b(?:click|tap|touch|open|reveal|show|inspect|sense)\b/i;
const ADJACENT_HIDDEN_CLASS_HINT_RE = /(?:hidden|reveal|secret|thought|detail|info|result|message|dialog|caption|note|content|text)/i;

function getClassTokens(element) {
    return String(element?.getAttribute?.('class') || '')
        .split(/\s+/)
        .map(token => token.trim())
        .filter(Boolean);
}

function isAdjacentHiddenTextCandidate(element) {
    if (!element) return false;
    const previouslyManaged = element.hasAttribute?.(RENDERED_ADJACENT_HIDDEN_ITEM_ATTR);
    if (!previouslyManaged && !isExplicitlyHiddenStateLayer(element)) return false;
    if (element.hasAttribute?.(RENDERED_STATE_LAYER_ROLE_ATTR)
        || element.hasAttribute?.(RENDERED_LIST_DETAIL_PANEL_ATTR)) return false;
    const tagName = String(element.tagName || '').toLowerCase();
    if (!/^(?:p|div|span|section|article|aside|blockquote|small|em|strong)$/.test(tagName)) return false;
    const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
    return text.length >= 6 && text.length <= 1200;
}

function findAdjacentHiddenGroupHost(label) {
    let node = label?.nextElementSibling || null;
    for (let step = 0; node && step < 3; step += 1, node = node.nextElementSibling) {
        if (/^(?:style|script|input|label)$/i.test(node.tagName || '')) continue;
        const candidates = [node, ...(node.querySelectorAll?.('*') || [])].filter(isAdjacentHiddenTextCandidate);
        if (candidates.length) return node;
        // 遇到新的明确交互块后停止跨越，避免误抓更远处的隐藏内容。
        if (node.querySelector?.('input, label, button, details, summary')) break;
    }
    return null;
}

function collectAdjacentHiddenGroupTargets(host) {
    if (!host?.querySelectorAll) return [];
    const candidates = [host, ...host.querySelectorAll('*')]
        .filter(isAdjacentHiddenTextCandidate)
        .slice(0, 24);
    if (!candidates.length) return [];

    // 优先选择共享的语义 class 组，例如两个 .hidden-thought，避免把同一容器内无关隐藏层一起揭开。
    const groups = new Map();
    for (const element of candidates) {
        for (const token of getClassTokens(element)) {
            if (!ADJACENT_HIDDEN_CLASS_HINT_RE.test(token)) continue;
            if (!groups.has(token)) groups.set(token, []);
            groups.get(token).push(element);
        }
    }
    const best = [...groups.values()]
        .map(group => [...new Set(group)])
        .filter(group => group.length >= 1 && group.length <= 8)
        .sort((a, b) => b.length - a.length)[0];
    if (best?.length) return best;

    // 没有语义 class 时，只接受数量很少、且直属于同一个紧邻容器的隐藏文本。
    const direct = [...(host.children || [])].filter(isAdjacentHiddenTextCandidate);
    return direct.length >= 1 && direct.length <= 4 ? direct : [];
}

function buildRenderedAdjacentHiddenGroupEntry(label, input) {
    if (!label || !input || !ADJACENT_HIDDEN_TRIGGER_HINT_RE.test(String(label.textContent || ''))) return null;
    const host = findAdjacentHiddenGroupHost(label);
    if (!host) return null;
    const targets = collectAdjacentHiddenGroupTargets(host);
    if (!targets.length) return null;

    const targetStates = targets.map(target => {
        const originalStyles = capturePseudoStyleState(target, [
            'display', 'visibility', 'opacity', 'pointer-events', 'transform', 'max-height',
        ]);
        const originalTransform = getCapturedStyleValue(originalStyles, 'transform');
        return {
            target,
            originalStyles,
            activeTransform: neutralizeStateLayerTransform(originalTransform),
            wasDisplayNone: getCapturedStyleValue(originalStyles, 'display').toLowerCase() === 'none',
            wasVisibilityHidden: getCapturedStyleValue(originalStyles, 'visibility').toLowerCase() === 'hidden',
            hadCollapsedMaxHeight: /^(?:0|0px|0em|0rem|0%)$/i.test(getCapturedStyleValue(originalStyles, 'max-height').replace(/\s+/g, '')),
        };
    });

    const hostState = {
        target: host,
        originalStyles: capturePseudoStyleState(host, ['min-height', 'overflow']),
        needsHeight: targets.some(target => ['absolute', 'fixed'].includes(getInlineStyleValue(target, 'position').toLowerCase())),
    };

    targets.forEach((target, index) => target.setAttribute(RENDERED_ADJACENT_HIDDEN_ITEM_ATTR, String(index)));
    input.setAttribute(RENDERED_ADJACENT_HIDDEN_GROUP_RESCUE_ATTR, 'true');
    return { label, input, hostState, targetStates };
}

function applyRenderedAdjacentHiddenGroupEntry(entry) {
    if (!entry?.input) return;
    const active = !!entry.input.checked;
    restorePseudoStyleState(entry.hostState.target, entry.hostState.originalStyles);

    for (const state of entry.targetStates || []) {
        restorePseudoStyleState(state.target, state.originalStyles);
        if (!active) continue;
        const assignments = [
            { property: 'opacity', value: '1' },
            { property: 'visibility', value: 'visible' },
            { property: 'pointer-events', value: 'auto' },
        ];
        if (state.wasDisplayNone) assignments.push({ property: 'display', value: 'block' });
        if (state.activeTransform) assignments.push({ property: 'transform', value: state.activeTransform });
        if (state.hadCollapsedMaxHeight) assignments.push({ property: 'max-height', value: '1000px' });
        applyPseudoStyleAssignments(state.target, assignments);
    }

    if (active && entry.hostState.needsHeight) {
        // 绝对定位文本不会撑开父容器；给相邻内容区保留可见高度，避免内容虽已 opacity:1 仍被外层裁切。
        const estimatedHeight = Math.min(240, Math.max(56, (entry.targetStates?.length || 1) * 42));
        applyPseudoStyleAssignments(entry.hostState.target, [
            { property: 'min-height', value: `${estimatedHeight}px` },
            { property: 'overflow', value: 'visible' },
        ]);
    }

    entry.label?.setAttribute?.('aria-pressed', active ? 'true' : 'false');
    entry.input?.setAttribute?.('aria-pressed', active ? 'true' : 'false');
}

function applyRenderedAdjacentHiddenGroupEntries(root) {
    const state = renderedAdjacentHiddenGroupRescueStates.get(root);
    if (!state?.entries?.size) return;
    for (const entry of state.entries.values()) applyRenderedAdjacentHiddenGroupEntry(entry);
}

function installRenderedAdjacentHiddenGroupRescue(root) {
    if (!root?.querySelectorAll) return;
    let state = renderedAdjacentHiddenGroupRescueStates.get(root);
    if (!state) {
        state = { entries: new Map(), listenerInstalled: false };
        renderedAdjacentHiddenGroupRescueStates.set(root, state);
    }

    for (const label of root.querySelectorAll('label')) {
        const input = label.querySelector('input[type="checkbox"], input[type="radio"]');
        if (!input || state.entries.has(input)) continue;
        const existingRoute = getRenderedInputRoute(input);
        if (existingRoute && existingRoute !== 'adjacent-hidden') continue;
        const entry = buildRenderedAdjacentHiddenGroupEntry(label, input);
        if (!entry || !claimRenderedInputRoute(input, 'adjacent-hidden')) continue;
        state.entries.set(input, entry);
        for (const targetState of entry.targetStates || []) installReversibleTargetClose(targetState.target, input, root);
    }
    if (!state.entries.size) return;

    if (!state.listenerInstalled) {
        const refresh = event => {
            if (!state.entries.has(event.target)) return;
            applyRenderedAdjacentHiddenGroupEntries(root);
        };
        root.addEventListener('input', refresh, false);
        root.addEventListener('change', refresh, false);
        state.listenerInstalled = true;
        root.dataset.rabbitMirrorAdjacentHiddenGroupFallback = 'true';
    }
    applyRenderedAdjacentHiddenGroupEntries(root);
}


// 渲染后“label 内单块隐藏内容”急救：用于 checkbox/radio 与隐藏内容同处一个 label 的结构。
// 不依赖宿主可能已经删除的 onclick/onchange，只根据当前安全 DOM 建立状态切换。
const RENDERED_LABEL_INTERNAL_HIDDEN_RESCUE_ATTR = 'data-rabbit-mirror-label-internal-hidden-rescue';
const RENDERED_LABEL_INTERNAL_HIDDEN_ITEM_ATTR = 'data-rm-label-internal-hidden-item';
const renderedLabelInternalHiddenRescueStates = new WeakMap();

function isLabelInternalHiddenCandidate(element, input, label) {
    if (!element || element === input || element === label || !label?.contains?.(element)) return false;
    const tagName = String(element.tagName || '').toLowerCase();
    // 隐藏 input 是交互载体，不得误判为待显示内容。
    if (/^(?:input|select|textarea|option|button|label|style|script|template|svg|path)$/.test(tagName)) return false;
    if (element.hasAttribute?.(RENDERED_STATE_LAYER_ROLE_ATTR)
        || element.hasAttribute?.(RENDERED_ADJACENT_HIDDEN_ITEM_ATTR)
        || element.hasAttribute?.(RENDERED_LIST_DETAIL_PANEL_ATTR)) return false;
    const previouslyManaged = element.hasAttribute?.(RENDERED_LABEL_INTERNAL_HIDDEN_ITEM_ATTR);
    if (!previouslyManaged && !isExplicitlyHiddenStateLayer(element)) return false;

    const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length < 4 || text.length > 1800) return false;

    const classText = `${element.id || ''} ${getClassTokens(element).join(' ')}`;
    const semanticHint = ADJACENT_HIDDEN_CLASS_HINT_RE.test(classText);
    const inlineMaxHeight = getInlineStyleValue(element, 'max-height').replace(/\s+/g, '').toLowerCase();
    const inlineHeight = getInlineStyleValue(element, 'height').replace(/\s+/g, '').toLowerCase();
    const collapsedBox = /^(?:0|0px|0em|0rem|0%)$/.test(inlineMaxHeight)
        || /^(?:0|0px|0em|0rem|0%)$/.test(inlineHeight);

    // 严格补充“label 内弹层”结构：input 后隔着一段可见触发文字，再跟一块 display:none/opacity:0 内容。
    // 这覆盖模型常写错的 this.nextElementSibling（实际目标是下下个兄弟节点），但不会扫描 label 外部。
    const children = [...(label.children || [])];
    const inputIndex = children.indexOf(input);
    const elementIndex = children.indexOf(element);
    const directAfterInput = element.parentElement === label && inputIndex >= 0 && elementIndex > inputIndex;
    const leadingText = directAfterInput
        ? children.slice(inputIndex + 1, elementIndex)
            .filter(node => !isExplicitlyHiddenStateLayer(node))
            .map(node => String(node.textContent || '').replace(/\s+/g, ' ').trim())
            .join(' ')
        : '';
    const triggerHint = ADJACENT_HIDDEN_TRIGGER_HINT_RE.test(leadingText);
    const displayNone = getInlineStyleValue(element, 'display').toLowerCase() === 'none';
    const position = getInlineStyleValue(element, 'position').toLowerCase();
    const positionedPopup = position === 'absolute' || position === 'fixed';

    return previouslyManaged || semanticHint || collapsedBox || (directAfterInput && triggerHint && (displayNone || positionedPopup));
}

function collectLabelInternalHiddenTargets(label, input) {
    if (!label?.querySelectorAll) return [];
    const raw = [...label.querySelectorAll('*')]
        .filter(element => isLabelInternalHiddenCandidate(element, input, label));
    if (!raw.length) return [];

    // 如果父级隐藏容器已被选中，不再同时选择其内部子节点，避免重复写样式。
    const topLevel = raw.filter(element => !raw.some(other => other !== element && other.contains?.(element)));
    return topLevel.slice(0, 4);
}

function getComputedOverflowValue(element) {
    try {
        const style = typeof getComputedStyle === 'function' ? getComputedStyle(element) : null;
        return `${style?.overflow || ''} ${style?.overflowX || ''} ${style?.overflowY || ''}`.toLowerCase();
    } catch {
        return '';
    }
}

function getRenderedElementHeight(element) {
    try {
        return Number(element?.getBoundingClientRect?.().height || 0);
    } catch {
        return 0;
    }
}

function captureLabelInternalAncestorStates(target, label) {
    const states = [];
    let current = target?.parentElement || null;
    for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
        if (!label.contains(current) && current !== label) break;
        const overflow = getComputedOverflowValue(current);
        const inlineHeight = getInlineStyleValue(current, 'height').replace(/\s+/g, '').toLowerCase();
        const inlineMaxHeight = getInlineStyleValue(current, 'max-height').replace(/\s+/g, '').toLowerCase();
        const collapsed = /^(?:0|0px|0em|0rem|0%)$/.test(inlineHeight)
            || /^(?:0|0px|0em|0rem|0%)$/.test(inlineMaxHeight)
            || getRenderedElementHeight(current) <= 1;
        const clips = /(?:hidden|clip)/.test(overflow);
        if (collapsed || clips || current === label) {
            states.push({
                target: current,
                originalStyles: capturePseudoStyleState(current, [
                    'display', 'height', 'min-height', 'max-height', 'overflow', 'overflow-x', 'overflow-y',
                ]),
                collapsed,
                clips,
            });
        }
        if (current === label) break;
    }
    return states;
}

function buildRenderedLabelInternalHiddenEntry(label, input, root) {
    if (!label || !input || input.closest?.('label') !== label) return null;
    const targets = collectLabelInternalHiddenTargets(label, input);
    if (!targets.length) return null;

    const targetStates = targets.map(target => {
        const originalStyles = capturePseudoStyleState(target, [
            'display', 'visibility', 'opacity', 'pointer-events', 'transform',
            'height', 'min-height', 'max-height', 'overflow', 'overflow-x', 'overflow-y',
            'position', 'inset', 'top', 'right', 'bottom', 'left', 'width', 'max-width',
            'box-sizing', 'margin', 'margin-top',
        ]);
        const originalTransform = getCapturedStyleValue(originalStyles, 'transform');
        const originalPosition = getCapturedStyleValue(originalStyles, 'position').toLowerCase();
        return {
            target,
            originalStyles,
            activeTransform: neutralizeStateLayerTransform(originalTransform),
            wasDisplayNone: getCapturedStyleValue(originalStyles, 'display').toLowerCase() === 'none',
            wasVisibilityHidden: getCapturedStyleValue(originalStyles, 'visibility').toLowerCase() === 'hidden',
            hadCollapsedHeight: /^(?:0|0px|0em|0rem|0%)$/i.test(getCapturedStyleValue(originalStyles, 'height').replace(/\s+/g, '')),
            hadCollapsedMaxHeight: /^(?:0|0px|0em|0rem|0%)$/i.test(getCapturedStyleValue(originalStyles, 'max-height').replace(/\s+/g, '')),
            isPositionedPopup: ['absolute', 'fixed'].includes(originalPosition),
            ancestorStates: captureLabelInternalAncestorStates(target, label),
        };
    });

    targets.forEach((target, index) => target.setAttribute(RENDERED_LABEL_INTERNAL_HIDDEN_ITEM_ATTR, String(index)));
    input.setAttribute(RENDERED_LABEL_INTERNAL_HIDDEN_RESCUE_ATTR, 'true');
    return { label, input, targetStates };
}

function restoreLabelInternalAncestorStates(entry) {
    const restored = new Set();
    for (const state of entry?.targetStates || []) {
        for (const ancestor of state.ancestorStates || []) {
            if (!ancestor?.target || restored.has(ancestor.target)) continue;
            restorePseudoStyleState(ancestor.target, ancestor.originalStyles);
            restored.add(ancestor.target);
        }
    }
}

function applyRenderedLabelInternalHiddenEntry(entry) {
    if (!entry?.input) return;
    const active = !!entry.input.checked;
    restoreLabelInternalAncestorStates(entry);

    for (const state of entry.targetStates || []) {
        restorePseudoStyleState(state.target, state.originalStyles);
        if (!active) continue;

        const naturalHeight = Math.max(80, Number(state.target?.scrollHeight || 0) + 24);
        const assignments = [
            { property: 'opacity', value: '1' },
            { property: 'visibility', value: 'visible' },
            { property: 'pointer-events', value: 'auto' },
            { property: 'overflow', value: 'visible' },
        ];
        if (state.wasDisplayNone) assignments.push({ property: 'display', value: 'block' });
        if (state.activeTransform) assignments.push({ property: 'transform', value: state.activeTransform });
        if (state.isPositionedPopup) {
            // 绝对定位弹层经常被外层 overflow:hidden 裁掉，也会盖住原触发区，导致无法再次关闭。
            // 急救时暂时改为同一 label 内的流式展开；取消勾选后由统一基线精确恢复。
            assignments.push(
                { property: 'position', value: 'relative' },
                { property: 'inset', value: 'auto' },
                { property: 'top', value: 'auto' },
                { property: 'right', value: 'auto' },
                { property: 'bottom', value: 'auto' },
                { property: 'left', value: 'auto' },
                { property: 'width', value: '100%' },
                { property: 'max-width', value: '100%' },
                { property: 'box-sizing', value: 'border-box' },
                { property: 'margin', value: '10px 0 0 0' },
            );
        }
        if (state.hadCollapsedHeight || getRenderedElementHeight(state.target) <= 1) {
            assignments.push({ property: 'height', value: 'auto' });
            assignments.push({ property: 'min-height', value: `${naturalHeight}px` });
        }
        if (state.hadCollapsedMaxHeight || getRenderedElementHeight(state.target) <= 1) {
            assignments.push({ property: 'max-height', value: `${Math.max(320, naturalHeight * 2)}px` });
        }
        applyPseudoStyleAssignments(state.target, assignments);

        for (const ancestor of state.ancestorStates || []) {
            const ancestorAssignments = [];
            if (ancestor.clips) {
                ancestorAssignments.push({ property: 'overflow', value: 'visible' });
                ancestorAssignments.push({ property: 'overflow-x', value: 'visible' });
                ancestorAssignments.push({ property: 'overflow-y', value: 'visible' });
            }
            if (ancestor.collapsed || ancestor.target === entry.label) {
                const contentHeight = Math.max(
                    Number(ancestor.target?.scrollHeight || 0),
                    naturalHeight + 48,
                );
                ancestorAssignments.push({ property: 'height', value: 'auto' });
                ancestorAssignments.push({ property: 'max-height', value: `${Math.max(480, contentHeight + 80)}px` });
                ancestorAssignments.push({ property: 'min-height', value: `${Math.min(1200, contentHeight)}px` });
            }
            applyPseudoStyleAssignments(ancestor.target, ancestorAssignments);
        }
    }

    entry.label?.setAttribute?.('aria-pressed', active ? 'true' : 'false');
    entry.input?.setAttribute?.('aria-pressed', active ? 'true' : 'false');
}

function applyRenderedLabelInternalHiddenEntries(root) {
    const state = renderedLabelInternalHiddenRescueStates.get(root);
    if (!state?.entries?.size) return;
    for (const entry of state.entries.values()) applyRenderedLabelInternalHiddenEntry(entry);
}

function installRenderedLabelInternalHiddenRescue(root) {
    if (!root?.querySelectorAll) return;
    let state = renderedLabelInternalHiddenRescueStates.get(root);
    if (!state) {
        state = { entries: new Map(), listenerInstalled: false };
        renderedLabelInternalHiddenRescueStates.set(root, state);
    }

    for (const label of root.querySelectorAll('label')) {
        const input = label.querySelector('input[type="checkbox"], input[type="radio"]');
        if (!input || state.entries.has(input)) continue;
        const existingRoute = getRenderedInputRoute(input);
        if (existingRoute && existingRoute !== 'label-internal') continue;
        const entry = buildRenderedLabelInternalHiddenEntry(label, input, root);
        if (!entry || !claimRenderedInputRoute(input, 'label-internal')) continue;
        state.entries.set(input, entry);
    }
    if (!state.entries.size) return;

    if (!state.listenerInstalled) {
        const refresh = event => {
            if (!state.entries.has(event.target)) return;
            applyRenderedLabelInternalHiddenEntries(root);
            // 某些主题会在 change 后一帧重新写布局；短延迟复核能避免刚显示又被压回 0 高度。
            for (const delay of [0, 80, 260]) {
                setTimeout(() => {
                    if (root.isConnected) applyRenderedLabelInternalHiddenEntries(root);
                }, delay);
            }
        };
        root.addEventListener('input', refresh, false);
        root.addEventListener('change', refresh, false);
        state.listenerInstalled = true;
        root.dataset.rabbitMirrorLabelInternalHiddenFallback = 'true';
    }
    applyRenderedLabelInternalHiddenEntries(root);
}



// 渲染后“label 后置结果层”急救：用于 checkbox/radio 位于 label 内，结果层紧跟在 label 后方的结构。
// 不依赖已被宿主删除的 onchange；优先保证隐藏结果能够显示，并可选增强同画布内的零尺寸视觉主体。
const RENDERED_LABEL_ADJACENT_RESULT_RESCUE_ATTR = 'data-rabbit-mirror-label-adjacent-result-rescue';
const RENDERED_LABEL_ADJACENT_RESULT_ITEM_ATTR = 'data-rm-label-adjacent-result-item';
const RENDERED_LABEL_ADJACENT_VISUAL_ITEM_ATTR = 'data-rm-label-adjacent-visual-item';
const renderedLabelAdjacentResultRescueStates = new WeakMap();
const LABEL_ADJACENT_RESULT_HINT_RE = /(?:detail|result|reaction|response|info|content|reveal|hidden|message|panel|output|详情|结果|反应|状态|信息|揭示)/i;
const LABEL_ADJACENT_VISUAL_HINT_RE = /(?:zone|radar|meter|gauge|ring|circle|field|area|territory|dominance|progress|pulse|wave|领域|雷达|区域|环|范围|进度)/i;

function isCollapsedDimensionValue(value) {
    return /^(?:0|0px|0em|0rem|0%)$/i.test(String(value || '').replace(/\s+/g, ''));
}

function isLabelAdjacentResultCandidate(element) {
    if (!element || /^(?:input|label|button|style|script|template)$/i.test(element.tagName || '')) return false;
    const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length < 8 || text.length > 2400) return false;

    const previouslyManaged = element.hasAttribute?.(RENDERED_LABEL_ADJACENT_RESULT_ITEM_ATTR);
    const hidden = isExplicitlyHiddenStateLayer(element)
        || isCollapsedDimensionValue(getInlineStyleValue(element, 'height'))
        || isCollapsedDimensionValue(getInlineStyleValue(element, 'max-height'));
    if (!previouslyManaged && !hidden) return false;

    const semantic = `${element.id || ''} ${getClassTokens(element).join(' ')}`;
    const hasStructure = !!element.querySelector?.('p, div, span, section, article, ul, ol, dl, table, [style*="background"], [style*="border"]');
    return LABEL_ADJACENT_RESULT_HINT_RE.test(semantic) || hasStructure || text.length >= 40;
}

function findLabelAdjacentResultTarget(label) {
    let node = label?.nextElementSibling || null;
    for (let step = 0; node && step < 3; step += 1, node = node.nextElementSibling) {
        if (/^(?:style|script)$/i.test(node.tagName || '')) continue;
        if (isLabelAdjacentResultCandidate(node)) return node;
        // 只允许跨过很短的空白装饰层；遇到新的交互结构即停止。
        if (node.querySelector?.('input, label, button, details, summary')) break;
        const text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
        if (text.length > 24) break;
    }
    return null;
}

function collectLabelAdjacentVisualTargets(label) {
    const parent = label?.parentElement;
    if (!parent?.children) return [];
    const siblings = [...parent.children];
    const labelIndex = siblings.indexOf(label);
    if (labelIndex <= 0) return [];

    const searchRoots = siblings.slice(Math.max(0, labelIndex - 5), labelIndex).reverse();
    for (const searchRoot of searchRoots) {
        const candidates = [searchRoot, ...(searchRoot.querySelectorAll?.('[class], [id]') || [])]
            .filter(element => {
                const semantic = `${element.id || ''} ${getClassTokens(element).join(' ')}`;
                if (!LABEL_ADJACENT_VISUAL_HINT_RE.test(semantic)) return false;
                if (element.hasAttribute?.(RENDERED_LABEL_ADJACENT_VISUAL_ITEM_ATTR)) return true;
                const width = getInlineStyleValue(element, 'width');
                const height = getInlineStyleValue(element, 'height');
                if (!isCollapsedDimensionValue(width) || !isCollapsedDimensionValue(height)) return false;
                const radius = getInlineStyleValue(element, 'border-radius');
                return /(?:50%|999px|9999px)/i.test(radius) || /circle|ring|zone|radar/i.test(semantic);
            });
        if (candidates.length) return candidates.slice(0, 2);
    }
    return [];
}

function buildRenderedLabelAdjacentResultEntry(label, input) {
    if (!label || !input || input.closest?.('label') !== label) return null;
    const target = findLabelAdjacentResultTarget(label);
    if (!target) return null;

    const originalStyles = capturePseudoStyleState(target, [
        'display', 'visibility', 'opacity', 'pointer-events', 'transform',
        'height', 'min-height', 'max-height', 'overflow', 'overflow-x', 'overflow-y',
    ]);
    const targetState = {
        target,
        originalStyles,
        activeTransform: neutralizeStateLayerTransform(getCapturedStyleValue(originalStyles, 'transform')),
        wasDisplayNone: getCapturedStyleValue(originalStyles, 'display').toLowerCase() === 'none',
        hadCollapsedHeight: isCollapsedDimensionValue(getCapturedStyleValue(originalStyles, 'height')),
        hadCollapsedMaxHeight: isCollapsedDimensionValue(getCapturedStyleValue(originalStyles, 'max-height')),
    };

    const visualStates = collectLabelAdjacentVisualTargets(label).map(visual => ({
        target: visual,
        originalStyles: capturePseudoStyleState(visual, ['width', 'height', 'opacity', 'transform']),
    }));

    target.setAttribute(RENDERED_LABEL_ADJACENT_RESULT_ITEM_ATTR, 'true');
    visualStates.forEach((state, index) => state.target.setAttribute(RENDERED_LABEL_ADJACENT_VISUAL_ITEM_ATTR, String(index)));
    input.setAttribute(RENDERED_LABEL_ADJACENT_RESULT_RESCUE_ATTR, 'true');
    return { label, input, targetState, visualStates };
}

function applyRenderedLabelAdjacentResultEntry(entry) {
    if (!entry?.input || !entry?.targetState?.target) return;
    const active = !!entry.input.checked;
    const state = entry.targetState;
    restorePseudoStyleState(state.target, state.originalStyles);
    for (const visualState of entry.visualStates || []) restorePseudoStyleState(visualState.target, visualState.originalStyles);

    if (active) {
        const naturalHeight = Math.max(72, Number(state.target.scrollHeight || 0) + 20);
        const assignments = [
            { property: 'opacity', value: '1' },
            { property: 'visibility', value: 'visible' },
            { property: 'pointer-events', value: 'auto' },
            { property: 'overflow', value: 'visible' },
        ];
        if (state.wasDisplayNone) assignments.push({ property: 'display', value: 'block' });
        if (state.activeTransform) assignments.push({ property: 'transform', value: state.activeTransform });
        if (state.hadCollapsedHeight) assignments.push({ property: 'height', value: 'auto' });
        if (state.hadCollapsedMaxHeight || getRenderedElementHeight(state.target) <= 1) {
            assignments.push({ property: 'max-height', value: `${Math.max(360, naturalHeight * 2)}px` });
            assignments.push({ property: 'min-height', value: `${Math.min(1200, naturalHeight)}px` });
        }
        applyPseudoStyleAssignments(state.target, assignments);

        for (const visualState of entry.visualStates || []) {
            let size = 130;
            try {
                const rect = visualState.target.parentElement?.getBoundingClientRect?.();
                const candidate = Math.min(Number(rect?.width || 0), Number(rect?.height || 0)) * 0.72;
                if (Number.isFinite(candidate) && candidate >= 56) size = Math.max(72, Math.min(160, Math.round(candidate)));
            } catch {
                // Fallback size remains 130px.
            }
            applyPseudoStyleAssignments(visualState.target, [
                { property: 'width', value: `${size}px` },
                { property: 'height', value: `${size}px` },
                { property: 'opacity', value: '1' },
            ]);
        }
    }

    entry.label?.setAttribute?.('aria-pressed', active ? 'true' : 'false');
    entry.input?.setAttribute?.('aria-pressed', active ? 'true' : 'false');
}

function applyRenderedLabelAdjacentResultEntries(root) {
    const state = renderedLabelAdjacentResultRescueStates.get(root);
    if (!state?.entries?.size) return;
    for (const entry of state.entries.values()) applyRenderedLabelAdjacentResultEntry(entry);
}

function installRenderedLabelAdjacentResultRescue(root) {
    if (!root?.querySelectorAll) return;
    let state = renderedLabelAdjacentResultRescueStates.get(root);
    if (!state) {
        state = { entries: new Map(), listenerInstalled: false };
        renderedLabelAdjacentResultRescueStates.set(root, state);
    }

    for (const label of root.querySelectorAll('label')) {
        const input = label.querySelector('input[type="checkbox"], input[type="radio"]');
        if (!input || state.entries.has(input)) continue;
        const existingRoute = getRenderedInputRoute(input);
        if (existingRoute && existingRoute !== 'label-adjacent') continue;
        const entry = buildRenderedLabelAdjacentResultEntry(label, input);
        if (!entry || !claimRenderedInputRoute(input, 'label-adjacent')) continue;
        state.entries.set(input, entry);
        installReversibleTargetClose(entry.targetState?.target, input, root);
    }
    if (!state.entries.size) return;

    if (!state.listenerInstalled) {
        const refresh = event => {
            if (!state.entries.has(event.target)) return;
            applyRenderedLabelAdjacentResultEntries(root);
            for (const delay of [0, 80, 260]) {
                setTimeout(() => {
                    if (root.isConnected) applyRenderedLabelAdjacentResultEntries(root);
                }, delay);
            }
        };
        root.addEventListener('input', refresh, false);
        root.addEventListener('change', refresh, false);
        state.listenerInstalled = true;
        root.dataset.rabbitMirrorLabelAdjacentResultFallback = 'true';
    }
    applyRenderedLabelAdjacentResultEntries(root);
}


// checkbox/radio → ID目标显隐急救：专门解析安全的
// document.getElementById('id').style.xxx = this.checked ? 'A' : 'B'
// 不执行模型 JavaScript；将状态绑定到 input/change，因此 label 兜底手动切换时也能生效。
const RENDERED_CHECKED_ID_TARGET_RESCUE_ATTR = 'data-rabbit-mirror-checked-id-target-rescue';
const RENDERED_CHECKED_ID_TARGET_ITEM_ATTR = 'data-rm-checked-id-target-item';
const renderedCheckedIdTargetRescueStates = new WeakMap();
const CHECKED_ID_TARGET_ALLOWED_PROPERTIES = new Set([
    'display', 'visibility', 'opacity', 'pointer-events', 'transform',
    'height', 'min-height', 'max-height', 'width', 'min-width', 'max-width',
    'overflow', 'overflow-x', 'overflow-y', 'background', 'background-color', 'color',
]);

function collectCheckedIdTargetAssignments(scriptText, root) {
    const source = String(scriptText || '');
    if (!source || !/document\s*\.\s*getElementById\s*\(/i.test(source)
        || !/this\s*\.\s*checked/i.test(source)) return null;

    const matches = [];
    const remember = (match, rawId, rawProperty, checkedValue, uncheckedValue) => {
        const target = resolveScopedPseudoId(root, rawId);
        const property = normalizeStylePropertyName(rawProperty);
        const activeValue = decodeSafeInlineString(checkedValue).trim();
        const inactiveValue = decodeSafeInlineString(uncheckedValue).trim();
        if (!target || !property || !CHECKED_ID_TARGET_ALLOWED_PROPERTIES.has(property)
            || !activeValue || !inactiveValue) return false;
        matches.push({
            start: match.index,
            end: match.index + match[0].length,
            target,
            property,
            checkedValue: activeValue,
            uncheckedValue: inactiveValue,
        });
        return true;
    };

    // document.getElementById('id').style.display = this.checked ? 'block' : 'none';
    const dotRe = /document\s*\.\s*getElementById\s*\(\s*(['"])([a-zA-Z_][\w:.-]*)\1\s*\)\s*\.\s*style\s*\.\s*([a-zA-Z][\w]*)\s*=\s*this\s*\.\s*checked\s*\?\s*(['"])([\s\S]*?)\4\s*:\s*(['"])([\s\S]*?)\6\s*;?/g;
    let match;
    while ((match = dotRe.exec(source))) {
        if (!remember(match, match[2], match[3], match[5], match[7])) return null;
    }

    // document.getElementById('id').style['display'] = this.checked ? 'block' : 'none';
    const bracketRe = /document\s*\.\s*getElementById\s*\(\s*(['"])([a-zA-Z_][\w:.-]*)\1\s*\)\s*\.\s*style\s*\[\s*(['"])([a-zA-Z-]+)\3\s*\]\s*=\s*this\s*\.\s*checked\s*\?\s*(['"])([\s\S]*?)\5\s*:\s*(['"])([\s\S]*?)\7\s*;?/g;
    while ((match = bracketRe.exec(source))) {
        if (!remember(match, match[2], match[4], match[6], match[8])) return null;
    }

    if (!matches.length) return null;
    matches.sort((a, b) => a.start - b.start);

    // 仅接受上述条件赋值与空白、分号、注释。出现其他语句时整段放弃。
    let cursor = 0;
    let remainder = '';
    for (const item of matches) {
        if (item.start < cursor) continue;
        remainder += source.slice(cursor, item.start);
        cursor = item.end;
    }
    remainder += source.slice(cursor);
    remainder = remainder
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\r\n]*/g, '')
        .replace(/[\s;]+/g, '');
    if (remainder !== '') return null;

    return matches.map(item => ({
        target: item.target,
        property: item.property,
        checkedValue: item.checkedValue,
        uncheckedValue: item.uncheckedValue,
    }));
}

function collectRenderedCheckedIdTargetSources(root) {
    const sources = new Map();
    if (!root?.querySelectorAll) return sources;

    for (const input of root.querySelectorAll('input[type="checkbox"][onclick], input[type="radio"][onclick]')) {
        const source = String(input.getAttribute('onclick') || '');
        if (source) sources.set(input, source);
    }

    // 宿主若已删除 onclick，则从同一条消息的原始兔子镜按子节点路径回读。
    const rawMessage = getRawAssistantMessageForRenderedRoot(root);
    const rawRoot = chooseMatchingRawRabbitMirrorRoot(rawMessage, root);
    if (!rawRoot?.querySelectorAll) return sources;

    for (const rawInput of rawRoot.querySelectorAll('input[type="checkbox"][onclick], input[type="radio"][onclick]')) {
        const path = getElementChildIndexPath(rawRoot, rawInput);
        if (!path) continue;
        const renderedInput = resolveElementChildIndexPath(root, path);
        if (!renderedInput?.matches?.('input[type="checkbox"], input[type="radio"]') || sources.has(renderedInput)) continue;
        const source = String(rawInput.getAttribute('onclick') || '');
        if (source) sources.set(renderedInput, source);
    }
    return sources;
}

function buildRenderedCheckedIdTargetEntry(input, assignments) {
    if (!input || !assignments?.length) return null;
    const targetStates = assignments.map(action => {
        const originalStyles = capturePseudoStyleState(action.target, [action.property]);
        action.target.setAttribute(RENDERED_CHECKED_ID_TARGET_ITEM_ATTR, 'true');
        return { ...action, originalStyles };
    });
    input.setAttribute(RENDERED_CHECKED_ID_TARGET_RESCUE_ATTR, 'true');
    return { input, targetStates };
}

function applyRenderedCheckedIdTargetEntry(entry) {
    if (!entry?.input || !entry?.targetStates?.length) return;
    const active = !!entry.input.checked;
    for (const state of entry.targetStates) {
        restorePseudoStyleState(state.target, state.originalStyles);
        const value = active ? state.checkedValue : state.uncheckedValue;
        applyPseudoStyleAssignments(state.target, [{ property: state.property, value }]);
        if (state.property === 'display' || state.property === 'visibility' || state.property === 'opacity') {
            const hidden = (state.property === 'display' && value.toLowerCase() === 'none')
                || (state.property === 'visibility' && value.toLowerCase() === 'hidden')
                || (state.property === 'opacity' && Number.parseFloat(value) <= 0.05);
            state.target.setAttribute('aria-hidden', hidden ? 'true' : 'false');
        }
    }
    entry.input.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function installRenderedCheckedIdTargetRescue(root) {
    if (!root?.querySelectorAll) return;
    let state = renderedCheckedIdTargetRescueStates.get(root);
    if (!state) {
        state = { entries: new Map(), listenerInstalled: false };
        renderedCheckedIdTargetRescueStates.set(root, state);
    }

    for (const [input, source] of collectRenderedCheckedIdTargetSources(root)) {
        if (state.entries.has(input)) continue;
        const existingRoute = getRenderedInputRoute(input);
        if (existingRoute && existingRoute !== 'checked-id-target') continue;
        const assignments = collectCheckedIdTargetAssignments(source, root);
        if (!assignments?.length || !claimRenderedInputRoute(input, 'checked-id-target')) continue;
        const entry = buildRenderedCheckedIdTargetEntry(input, assignments);
        if (!entry) continue;
        state.entries.set(input, entry);
        // 避免浏览器原生 click 与本地 input/change 急救重复执行。
        input.removeAttribute('onclick');
    }
    if (!state.entries.size) return;

    if (!state.listenerInstalled) {
        const refresh = event => {
            const entry = state.entries.get(event.target);
            if (!entry) return;
            applyRenderedCheckedIdTargetEntry(entry);
            for (const delay of [0, 80, 260]) {
                setTimeout(() => {
                    if (root.isConnected && entry.input.isConnected) applyRenderedCheckedIdTargetEntry(entry);
                }, delay);
            }
        };
        root.addEventListener('input', refresh, false);
        root.addEventListener('change', refresh, false);
        state.listenerInstalled = true;
        root.dataset.rabbitMirrorCheckedIdTargetFallback = 'true';
    }

    for (const entry of state.entries.values()) applyRenderedCheckedIdTargetEntry(entry);
}


// 渲染后“按钮 + 后置隐藏内容”急救：用于宿主删除 onclick 后，只剩普通 button 与紧邻隐藏内容的结构。
// 该路线优先于触屏 hover 兜底；点击一次显示，第二次点击精确恢复最初状态。
const RENDERED_BUTTON_ADJACENT_HIDDEN_RESCUE_ATTR = 'data-rabbit-mirror-button-adjacent-hidden-rescue';
const RENDERED_BUTTON_ADJACENT_HIDDEN_ITEM_ATTR = 'data-rm-button-adjacent-hidden-item';
const renderedButtonAdjacentHiddenRescueStates = new WeakMap();
const BUTTON_ADJACENT_HIDDEN_HINT_RE = /(?:hidden|secret|detail|data|log|result|reaction|response|message|content|reveal|decode|机密|隐藏|秘密|详情|日志|结果|反应|反馈|信息|内容|解码)/i;

function isRenderedButtonAdjacentHiddenTarget(element, button) {
    if (!element || !button || element === button) return false;
    const tagName = String(element.tagName || '').toLowerCase();
    if (!/^(?:div|section|article|aside|p|ul|ol|dl)$/.test(tagName)) return false;

    const previouslyManaged = element.hasAttribute?.(RENDERED_BUTTON_ADJACENT_HIDDEN_ITEM_ATTR);
    const renderedStyle = getRenderedStyleSnapshot(element);
    const hidden = isExplicitlyHiddenStateLayer(element)
        || renderedStyle.hidden
        || isCollapsedDimensionValue(getInlineStyleValue(element, 'height'))
        || isCollapsedDimensionValue(getInlineStyleValue(element, 'max-height'));
    if (!previouslyManaged && !hidden) return false;

    const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length < 4 || text.length > 3200) return false;
    const semantic = `${element.id || ''} ${getClassTokens(element).join(' ')}`;
    return previouslyManaged || BUTTON_ADJACENT_HIDDEN_HINT_RE.test(semantic) || text.length >= 24;
}

function findRenderedButtonAdjacentHiddenTarget(button) {
    let node = button?.nextElementSibling || null;
    for (let step = 0; node && step < 3; step += 1, node = node.nextElementSibling) {
        if (/^(?:style|script|template)$/i.test(node.tagName || '')) continue;
        if (isRenderedButtonAdjacentHiddenTarget(node, button)) return node;

        // 只允许跨过空白/极短装饰节点；遇到另一处明确交互即停止，避免串到无关区域。
        if (node.querySelector?.('button, input, label, details, summary')) break;
        const text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
        if (text.length > 12) break;
    }
    return null;
}

function hasRenderedButtonAdjacentHiddenCandidates(root) {
    if (!root?.querySelectorAll) return false;
    return [...root.querySelectorAll('button')].some(button => !!findRenderedButtonAdjacentHiddenTarget(button));
}

function buildRenderedButtonAdjacentHiddenEntry(button, target) {
    if (!button || !target) return null;
    const renderedStyle = getRenderedStyleSnapshot(target);
    const originalStyles = capturePseudoStyleState(target, [
        'display', 'visibility', 'opacity', 'pointer-events', 'transform',
        'height', 'min-height', 'max-height', 'overflow', 'overflow-x', 'overflow-y',
        'position', 'inset', 'top', 'right', 'bottom', 'left', 'width', 'max-width',
        'margin', 'margin-top',
    ]);
    const inlinePosition = getCapturedStyleValue(originalStyles, 'position').toLowerCase();
    let computedPosition = '';
    try {
        computedPosition = String(typeof getComputedStyle === 'function' ? getComputedStyle(target)?.position || '' : '').toLowerCase();
    } catch {
        computedPosition = '';
    }
    const position = inlinePosition || computedPosition;
    const originalTransform = getCapturedStyleValue(originalStyles, 'transform') || renderedStyle.transform;
    const activeTransform = neutralizeStateLayerTransform(originalTransform)
        || (originalTransform && originalTransform.toLowerCase() !== 'none' ? 'none' : '');

    target.setAttribute(RENDERED_BUTTON_ADJACENT_HIDDEN_ITEM_ATTR, 'true');
    button.setAttribute(RENDERED_BUTTON_ADJACENT_HIDDEN_RESCUE_ATTR, 'true');
    return {
        button,
        target,
        active: false,
        originalStyles,
        activeTransform,
        wasDisplayNone: getCapturedStyleValue(originalStyles, 'display').toLowerCase() === 'none' || renderedStyle.displayHidden,
        wasVisibilityHidden: getCapturedStyleValue(originalStyles, 'visibility').toLowerCase() === 'hidden' || renderedStyle.visibilityHidden,
        wasOpacityHidden: renderedStyle.opacityHidden,
        hadCollapsedHeight: isCollapsedDimensionValue(getCapturedStyleValue(originalStyles, 'height')) || renderedStyle.heightCollapsed,
        hadCollapsedMaxHeight: isCollapsedDimensionValue(getCapturedStyleValue(originalStyles, 'max-height')) || renderedStyle.maxHeightCollapsed,
        isPositionedPopup: position === 'absolute' || position === 'fixed',
    };
}

function applyRenderedButtonAdjacentHiddenEntry(entry, active = entry?.active) {
    if (!entry?.button || !entry?.target) return;
    entry.active = !!active;
    restorePseudoStyleState(entry.target, entry.originalStyles);

    if (entry.active) {
        const naturalHeight = Math.max(64, Number(entry.target.scrollHeight || 0) + 20);
        const assignments = [
            { property: 'opacity', value: '1' },
            { property: 'visibility', value: 'visible' },
            { property: 'pointer-events', value: 'auto' },
        ];
        if (entry.wasDisplayNone) assignments.push({ property: 'display', value: 'block' });
        if (entry.activeTransform) assignments.push({ property: 'transform', value: entry.activeTransform });
        if (entry.hadCollapsedHeight) assignments.push({ property: 'height', value: 'auto' });
        if (entry.hadCollapsedMaxHeight || getRenderedElementHeight(entry.target) <= 1) {
            assignments.push({ property: 'max-height', value: `${Math.max(320, naturalHeight * 2)}px` });
            assignments.push({ property: 'min-height', value: `${Math.min(1200, naturalHeight)}px` });
        }
        if (entry.isPositionedPopup) {
            assignments.push(
                { property: 'position', value: 'relative' },
                { property: 'inset', value: 'auto' },
                { property: 'top', value: 'auto' },
                { property: 'right', value: 'auto' },
                { property: 'bottom', value: 'auto' },
                { property: 'left', value: 'auto' },
                { property: 'width', value: 'auto' },
                { property: 'max-width', value: '100%' },
                { property: 'margin-top', value: '10px' },
            );
        }
        applyPseudoStyleAssignments(entry.target, assignments);
    }

    entry.button.setAttribute('aria-expanded', entry.active ? 'true' : 'false');
    entry.button.setAttribute('aria-pressed', entry.active ? 'true' : 'false');
}

function installRenderedButtonAdjacentHiddenRescue(root) {
    if (!root?.querySelectorAll) return;
    let state = renderedButtonAdjacentHiddenRescueStates.get(root);
    if (!state) {
        state = { entries: new Map() };
        renderedButtonAdjacentHiddenRescueStates.set(root, state);
    }

    for (const button of root.querySelectorAll('button')) {
        if (button.closest?.(`[${INTERACTION_DIAGNOSTIC_PANEL_ATTR}]`)
            || button.hasAttribute?.(RENDERED_CSS_STATE_SIBLING_RESCUE_ATTR)
            || state.entries.has(button)) continue;
        const target = findRenderedButtonAdjacentHiddenTarget(button);
        if (!target) continue;
        const entry = buildRenderedButtonAdjacentHiddenEntry(button, target);
        if (!entry) continue;
        state.entries.set(button, entry);

        button.addEventListener('click', event => {
            event.preventDefault();
            const nextActive = !entry.active;
            applyRenderedButtonAdjacentHiddenEntry(entry, nextActive);
            // 第二次点击恢复隐藏时，移除按钮焦点，避免原始 :focus + 后置内容规则继续把目标显示出来。
            if (!nextActive) {
                setTimeout(() => {
                    try {
                        if (document?.activeElement === entry.button) entry.button.blur?.();
                    } catch {
                        // 无 document 或 blur 不可用时，后续内联状态恢复仍继续执行。
                    }
                }, 0);
            }
            // 某些主题会在点击后一帧重写 display；短延迟复核只重放当前可逆状态。
            for (const delay of [0, 80, 260]) {
                setTimeout(() => {
                    if (root.isConnected && entry.button.isConnected && entry.target.isConnected) {
                        applyRenderedButtonAdjacentHiddenEntry(entry, entry.active);
                    }
                }, delay);
            }
        }, false);
        applyRenderedButtonAdjacentHiddenEntry(entry, false);
    }

    if (state.entries.size) root.dataset.rabbitMirrorButtonAdjacentHiddenFallback = 'true';
}


// 渲染后“CSS 状态兄弟映射”急救：精准读取模型已写出的
// A:active + B、A:focus ~ B、A:nth-child(n):focus ~ B 等规则。
// 在移动端把瞬时 active/focus 变成可逆点击状态，并按原 CSS 声明显示对应后置内容。
const RENDERED_CSS_STATE_SIBLING_RESCUE_ATTR = 'data-rabbit-mirror-css-state-sibling-rescue';
const RENDERED_CSS_STATE_SIBLING_ITEM_ATTR = 'data-rm-css-state-sibling-item';
const RENDERED_CSS_STATE_CROSS_TREE_RESCUE_ATTR = 'data-rabbit-mirror-css-state-cross-tree-rescue';
const RENDERED_CSS_STATE_CROSS_TREE_ROOT_ATTR = 'data-rabbit-mirror-css-state-cross-tree-fallback';
const renderedCssStateSiblingRescueStates = new WeakMap();
const CSS_STATE_SIBLING_SAFE_PROPERTIES = new Set([
    'display', 'visibility', 'opacity', 'pointer-events', 'transform', 'filter',
    'height', 'min-height', 'max-height', 'width', 'min-width', 'max-width',
    'overflow', 'overflow-x', 'overflow-y', 'position', 'inset', 'top', 'right', 'bottom', 'left',
    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'z-index', 'clip-path', 'background', 'background-color', 'color',
    'border', 'border-color', 'border-top', 'border-right', 'border-bottom', 'border-left',
    'box-shadow', 'text-shadow', 'font-weight', 'font-style', 'letter-spacing',
]);

function parseCssStateSiblingAssignments(blockText) {
    const assignments = new Map();
    const declarationRe = /(^|;)\s*([a-z-]+)\s*:\s*([^;{}]+?)(?=;|$)/gi;
    let match;
    while ((match = declarationRe.exec(String(blockText || '')))) {
        const property = normalizeStylePropertyName(match[2]);
        const value = String(match[3] || '').trim().replace(/\s*!important\s*$/i, '');
        if (!CSS_STATE_SIBLING_SAFE_PROPERTIES.has(property) || !value) continue;
        assignments.set(property, value);
    }
    return [...assignments.entries()].map(([property, value]) => ({ property, value }));
}

function normalizeCssStateSiblingSelector(selector) {
    return String(selector || '')
        .trim()
        .replace(/^(?:\.mes_text\s+)+/i, '')
        .replace(/^:scope\s+/, '')
        .trim();
}

function parseCssStateSiblingSelector(selectorText) {
    const selector = String(selectorText || '').trim();
    if (!selector || !/:(?:active|focus-within|focus|hover)\b/i.test(selector)) return null;
    const match = /^([\s\S]*?):(active|focus-within|focus|hover)\b\s*([+~])\s*([\s\S]+)$/i.exec(selector);
    if (!match) return null;
    const triggerSelector = normalizeCssStateSiblingSelector(match[1]);
    const targetSelector = normalizeCssStateSiblingSelector(match[4]);
    if (!triggerSelector || !targetSelector) return null;
    return {
        triggerSelector,
        stateType: String(match[2] || '').toLowerCase(),
        combinator: match[3],
        targetSelector,
    };
}

function parseCssDirectStateSelector(selectorText) {
    const selector = String(selectorText || '').trim();
    const match = /^([\s\S]*?):(active|focus-within|focus|hover)\b\s*$/i.exec(selector);
    if (!match) return null;
    const triggerSelector = normalizeCssStateSiblingSelector(match[1]);
    return triggerSelector ? { triggerSelector, stateType: String(match[2] || '').toLowerCase() } : null;
}

function queryCssStateSiblingTriggers(root, selector) {
    if (!root?.querySelectorAll || !selector) return [];
    try {
        return [...root.querySelectorAll(selector)];
    } catch {
        return [];
    }
}

function elementMatchesCssStateSiblingSelector(element, selector) {
    if (!element?.matches || !selector) return false;
    try {
        return element.matches(selector);
    } catch {
        return false;
    }
}

function collectCssStateSiblingTargets(trigger, combinator, targetSelector) {
    if (!trigger || !targetSelector) return [];
    if (combinator === '+') {
        const target = trigger.nextElementSibling;
        return target && elementMatchesCssStateSiblingSelector(target, targetSelector) ? [target] : [];
    }
    const targets = [];
    for (let node = trigger.nextElementSibling; node; node = node.nextElementSibling) {
        if (elementMatchesCssStateSiblingSelector(node, targetSelector)) targets.push(node);
    }
    return targets;
}

function cssStateNodeDistanceToAncestor(node, ancestor, maxDistance = 6) {
    let current = node;
    for (let distance = 0; current && distance <= maxDistance; distance += 1, current = current.parentElement) {
        if (current === ancestor) return distance;
    }
    return Number.POSITIVE_INFINITY;
}

function findCssStateLocalCommonAncestor(root, trigger, target) {
    if (!root || !trigger || !target) return null;
    let ancestor = trigger.parentElement;
    for (let triggerDistance = 1; ancestor && triggerDistance <= 3; triggerDistance += 1, ancestor = ancestor.parentElement) {
        if (ancestor === root) break;
        if (!ancestor.contains?.(target)) continue;
        const targetDistance = cssStateNodeDistanceToAncestor(target, ancestor, 5);
        if (targetDistance <= 4) return ancestor;
    }
    return null;
}

// 模型有时把 A:hover ~ B 写成跨层、逆向或嵌套关系：触发器与目标实际位于
// 同一局部画布，但不满足 CSS 兄弟选择器。只有原关系完全找不到目标、目标数量受限、
// 且触发器与目标共享近距离局部祖先时，才把它作为高置信跨层候选。
function collectCssStateCrossTreeTargets(root, trigger, targetSelector) {
    if (!root?.querySelectorAll || !trigger || !targetSelector) return [];
    let candidates = [];
    try {
        candidates = [...root.querySelectorAll(targetSelector)];
    } catch {
        return [];
    }
    if (!candidates.length || candidates.length > 8) return [];
    return candidates.filter(target => {
        if (!target || target === trigger || target.closest?.(`[${INTERACTION_DIAGNOSTIC_PANEL_ATTR}]`)) return false;
        if (trigger.contains?.(target) || target.contains?.(trigger)) return false;
        return !!findCssStateLocalCommonAncestor(root, trigger, target);
    });
}

function cssStateSiblingAssignmentsReveal(assignments) {
    for (const { property, value } of assignments || []) {
        const normalized = String(value || '').trim().toLowerCase();
        if (property === 'opacity' && Number.parseFloat(normalized) > 0.05) return true;
        if (property === 'display' && normalized !== 'none') return true;
        if (property === 'visibility' && !/(?:hidden|collapse)/.test(normalized)) return true;
        if ((property === 'height' || property === 'max-height' || property === 'min-height')
            && !isCollapsedDimensionValue(normalized)) return true;
        if (property === 'pointer-events' && normalized !== 'none') return true;
    }
    return false;
}

function collectRenderedCssStateSiblingRuleData(root) {
    if (!root?.querySelectorAll) return { mappings: [], directRules: [] };
    const mappings = [];
    const directRules = [];
    const blockRe = /([^{}]+)\{([^{}]*)\}/g;

    for (const style of getRabbitMirrorLocalStyleElements(root)) {
        if (style.hasAttribute?.(TOUCH_HOVER_STYLE_ATTR)) continue;
        const cssText = String(style.textContent || '');
        blockRe.lastIndex = 0;
        let match;
        while ((match = blockRe.exec(cssText))) {
            const selectorText = String(match[1] || '').replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
            if (!selectorText || selectorText.startsWith('@')) continue;
            const assignments = parseCssStateSiblingAssignments(match[2]);
            if (!assignments.length) continue;
            for (const rawSelector of splitCssSelectorList(selectorText)) {
                const sibling = parseCssStateSiblingSelector(rawSelector);
                if (sibling) {
                    mappings.push({ ...sibling, assignments });
                    continue;
                }
                const direct = parseCssDirectStateSelector(rawSelector);
                if (direct) directRules.push({ ...direct, assignments });
            }
        }
    }
    return { mappings, directRules };
}

function buildRenderedCssStateSiblingEntries(root) {
    const { mappings, directRules } = collectRenderedCssStateSiblingRuleData(root);
    if (!mappings.length) return [];
    const grouped = new Map();

    for (const mapping of mappings) {
        for (const trigger of queryCssStateSiblingTriggers(root, mapping.triggerSelector)) {
            if (trigger.closest?.(`[${INTERACTION_DIAGNOSTIC_PANEL_ATTR}]`)) continue;
            let targets = collectCssStateSiblingTargets(trigger, mapping.combinator, mapping.targetSelector);
            let crossTree = false;
            if (!targets.length) {
                targets = collectCssStateCrossTreeTargets(root, trigger, mapping.targetSelector);
                crossTree = targets.length > 0;
            }

            for (const target of targets) {
                if (!target || target === trigger || target.closest?.(`[${INTERACTION_DIAGNOSTIC_PANEL_ATTR}]`)) continue;
                const text = normalizeInteractionMatchText(target.textContent);
                if (!text && !target.children?.length) continue;

                let entry = grouped.get(trigger);
                if (!entry) {
                    entry = {
                        trigger,
                        targetAssignments: new Map(),
                        triggerAssignments: [],
                        active: false,
                        group: trigger.parentElement || root,
                        crossTree: false,
                        stateTypes: new Set(),
                    };
                    grouped.set(trigger, entry);
                }
                entry.crossTree = entry.crossTree || crossTree;
                entry.stateTypes.add(mapping.stateType);
                let targetMap = entry.targetAssignments.get(target);
                if (!targetMap) {
                    targetMap = new Map();
                    entry.targetAssignments.set(target, targetMap);
                }
                for (const assignment of mapping.assignments) targetMap.set(assignment.property, assignment.value);
            }
        }
    }

    const entries = [];
    for (const entry of grouped.values()) {
        const targetRecords = [...entry.targetAssignments.entries()].map(([target, assignmentMap]) => {
            const assignments = [...assignmentMap.entries()].map(([property, value]) => ({ property, value }));
            const rendered = getRenderedStyleSnapshot(target);
            const hidden = rendered.hidden || rendered.rectHeight <= 1
                || isCollapsedDimensionValue(getInlineStyleValue(target, 'height'))
                || isCollapsedDimensionValue(getInlineStyleValue(target, 'max-height'));
            return {
                target,
                assignments,
                rendered,
                hidden,
                reveals: cssStateSiblingAssignmentsReveal(assignments),
            };
        });

        // 跨层兜底必须至少包含一个“原本隐藏、状态后显现”的真实目标。
        // 满足后才把同一状态里的旧主体隐藏／移位声明一并接管，避免把普通 hover 装饰误变成点击程序。
        const hasHiddenRevealTarget = targetRecords.some(record => record.hidden && record.reveals);
        if (entry.crossTree && !hasHiddenRevealTarget) continue;
        const acceptedTargets = entry.crossTree
            ? targetRecords
            : targetRecords.filter(record => record.hidden || record.reveals);
        if (!acceptedTargets.length) continue;

        for (const rule of directRules) {
            if (elementMatchesCssStateSiblingSelector(entry.trigger, rule.triggerSelector)) {
                const merged = new Map(entry.triggerAssignments.map(item => [item.property, item.value]));
                for (const assignment of rule.assignments) merged.set(assignment.property, assignment.value);
                entry.triggerAssignments = [...merged.entries()].map(([property, value]) => ({ property, value }));
            }
        }

        const triggerProperties = new Set(entry.triggerAssignments.map(item => item.property));
        entry.triggerOriginalStyles = capturePseudoStyleState(entry.trigger, triggerProperties);
        entry.targetStates = acceptedTargets.map(record => {
            const { target, assignments, rendered } = record;
            let computedPosition = '';
            try { computedPosition = String(getComputedStyle(target)?.position || '').toLowerCase(); } catch { computedPosition = ''; }
            const position = getInlineStyleValue(target, 'position').toLowerCase() || computedPosition;
            const properties = new Set([
                ...assignments.map(item => item.property),
                'display', 'visibility', 'opacity', 'pointer-events', 'transform',
                'height', 'min-height', 'max-height', 'overflow', 'overflow-x', 'overflow-y',
                'position', 'inset', 'top', 'right', 'bottom', 'left', 'width', 'max-width',
            ]);
            const parent = target.parentElement;
            return {
                target,
                assignments,
                rendered,
                positionedOverlay: position === 'absolute' || position === 'fixed',
                originalStyles: capturePseudoStyleState(target, properties),
                parent,
                parentOriginalStyles: parent ? capturePseudoStyleState(parent, ['height', 'min-height', 'max-height', 'overflow', 'overflow-x', 'overflow-y']) : new Map(),
            };
        });
        if (!entry.targetStates.length) continue;
        entry.trigger.setAttribute(RENDERED_CSS_STATE_SIBLING_RESCUE_ATTR, 'true');
        if (entry.crossTree) entry.trigger.setAttribute(RENDERED_CSS_STATE_CROSS_TREE_RESCUE_ATTR, 'true');
        entry.targetStates.forEach((state, index) => state.target.setAttribute(RENDERED_CSS_STATE_SIBLING_ITEM_ATTR, String(index)));
        entries.push(entry);
    }
    return entries;
}

function applyRenderedCssStateSiblingEntry(entry, active = entry?.active) {
    if (!entry?.trigger) return;
    entry.active = !!active;
    restorePseudoStyleState(entry.trigger, entry.triggerOriginalStyles);
    if (entry.active) applyPseudoStyleAssignments(entry.trigger, entry.triggerAssignments);

    for (const state of entry.targetStates || []) {
        restorePseudoStyleState(state.target, state.originalStyles);
        if (state.parent) restorePseudoStyleState(state.parent, state.parentOriginalStyles);
        if (!entry.active) continue;

        const assignments = [...state.assignments];
        const propertyMap = new Map(assignments.map(item => [item.property, item.value]));
        if (state.rendered.displayHidden && !propertyMap.has('display')) assignments.push({ property: 'display', value: 'block' });
        if (!propertyMap.has('visibility')) assignments.push({ property: 'visibility', value: 'visible' });
        if (!propertyMap.has('opacity')) assignments.push({ property: 'opacity', value: '1' });
        if (!propertyMap.has('pointer-events')) assignments.push({ property: 'pointer-events', value: 'auto' });

        let computedLineHeight = 20;
        let availableWidth = 320;
        try {
            const computed = typeof getComputedStyle === 'function' ? getComputedStyle(state.target) : null;
            computedLineHeight = Number.parseFloat(computed?.lineHeight || '') || 20;
            availableWidth = Number(state.parent?.getBoundingClientRect?.().width || state.target.getBoundingClientRect?.().width || 320);
        } catch {
            computedLineHeight = 20;
            availableWidth = 320;
        }
        const textLength = normalizeInteractionMatchText(state.target.textContent).length;
        const explicitBreaks = state.target.querySelectorAll?.('br')?.length || 0;
        const charsPerLine = Math.max(16, Math.floor(Math.max(160, availableWidth - 24) / 7));
        const estimatedLines = Math.max(1, Math.ceil(textLength / charsPerLine) + explicitBreaks);
        const naturalHeight = Math.max(
            64,
            Number(state.target.scrollHeight || 0) + 20,
            Math.ceil(estimatedLines * computedLineHeight + 28),
        );
        const collapsed = state.rendered.rectHeight <= 1
            || isCollapsedDimensionValue(getCapturedStyleValue(state.originalStyles, 'height'))
            || isCollapsedDimensionValue(getCapturedStyleValue(state.originalStyles, 'max-height'));
        if (collapsed) {
            if (!propertyMap.has('height')) assignments.push({ property: 'height', value: 'auto' });
            if (!propertyMap.has('max-height')) assignments.push({ property: 'max-height', value: `${Math.max(640, naturalHeight * 2)}px` });
            assignments.push({ property: 'overflow', value: 'visible' });
        }

        if (state.positionedOverlay && state.parent) {
            assignments.push(
                { property: 'height', value: 'auto' },
                { property: 'min-height', value: `${Math.min(2400, naturalHeight)}px` },
                { property: 'max-height', value: 'none' },
                { property: 'overflow', value: 'visible' },
            );
            applyPseudoStyleAssignments(state.parent, [
                { property: 'min-height', value: `${Math.min(2400, naturalHeight)}px` },
            ]);
        }
        applyPseudoStyleAssignments(state.target, assignments);
    }

    if (entry.trigger.matches?.('input[type="checkbox"], input[type="radio"]')) {
        try { entry.trigger.checked = entry.active; } catch {}
    }
    entry.trigger.setAttribute('aria-expanded', entry.active ? 'true' : 'false');
    entry.trigger.setAttribute('aria-pressed', entry.active ? 'true' : 'false');
}

function hasRenderedCssStateSiblingCandidates(root) {
    if (!root?.querySelectorAll) return false;
    return buildRenderedCssStateSiblingEntries(root).length > 0;
}

function installRenderedCssStateSiblingRescue(root) {
    if (!root?.querySelectorAll) return;
    let state = renderedCssStateSiblingRescueStates.get(root);
    if (!state) {
        state = { entries: new Map() };
        renderedCssStateSiblingRescueStates.set(root, state);
    }

    for (const entry of buildRenderedCssStateSiblingEntries(root)) {
        if (state.entries.has(entry.trigger)) continue;
        state.entries.set(entry.trigger, entry);
        preparePseudoTrigger(entry.trigger);

        const toggle = event => {
            if (event?.type === 'keydown') {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
            } else {
                event?.preventDefault?.();
            }
            const nextActive = !entry.active;
            if (nextActive) {
                for (const other of state.entries.values()) {
                    if (other !== entry && other.group === entry.group && other.active) {
                        applyRenderedCssStateSiblingEntry(other, false);
                        try { other.trigger.blur?.(); } catch {}
                    }
                }
            }
            applyRenderedCssStateSiblingEntry(entry, nextActive);
            if (!nextActive) {
                setTimeout(() => {
                    try { if (document?.activeElement === entry.trigger) entry.trigger.blur?.(); } catch {}
                }, 0);
            }
            for (const delay of [0, 80, 260]) {
                setTimeout(() => {
                    if (root.isConnected && entry.trigger.isConnected) applyRenderedCssStateSiblingEntry(entry, entry.active);
                }, delay);
            }
        };

        entry.trigger.addEventListener('click', toggle, false);
        entry.trigger.addEventListener('keydown', toggle, false);

        // 隐藏 input 的 :active/:focus 伪交互在触屏端不会形成可保持状态；
        // 若存在明确 label[for]，让真实可触摸的 label 代理同一可逆状态，并同步 input.checked。
        const triggerId = String(entry.trigger.id || '').trim();
        const transientInput = triggerId
            && entry.trigger.matches?.('input[type="checkbox"], input[type="radio"]')
            && [...(entry.stateTypes || [])].some(type => /^(?:active|focus|focus-within|hover)$/.test(type));
        if (transientInput) {
            let proxyLabels = [];
            try {
                const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(triggerId) : triggerId.replace(/(["\\])/g, '\\$1');
                proxyLabels = [...root.querySelectorAll(`label[for="${escapedId}"]`)];
            } catch {
                proxyLabels = [...root.querySelectorAll('label')].filter(label => label.getAttribute('for') === triggerId);
            }
            for (const label of proxyLabels) {
                if (label.closest?.(`[${INTERACTION_DIAGNOSTIC_PANEL_ATTR}]`)) continue;
                label.setAttribute('data-rabbit-mirror-transient-state-proxy', 'true');
                label.setAttribute('role', label.getAttribute('role') || 'button');
                if (!label.hasAttribute('tabindex')) label.setAttribute('tabindex', '0');
                label.addEventListener('click', toggle, false);
                label.addEventListener('keydown', toggle, false);
            }
        }
        applyRenderedCssStateSiblingEntry(entry, false);
    }

    if (state.entries.size) root.dataset.rabbitMirrorCssStateSiblingFallback = 'true';
    const crossTreeCount = [...state.entries.values()].filter(entry => entry.crossTree).length;
    if (crossTreeCount) root.setAttribute(RENDERED_CSS_STATE_CROSS_TREE_ROOT_ATTR, String(crossTreeCount));
    else root.removeAttribute(RENDERED_CSS_STATE_CROSS_TREE_ROOT_ATTR);
}


// 渲染后“可点击容器 + 后置隐藏内容”急救：用于 onclick 被删除后，
// 只剩 cursor:pointer 的普通 div/span 与紧邻 display:none 正文的结构。
// 与“可点击画面 + 弹层”不同，本路线不要求关闭按钮，点击一次显示，第二次恢复。
const RENDERED_CLICKABLE_ADJACENT_HIDDEN_RESCUE_ATTR = 'data-rabbit-mirror-clickable-adjacent-hidden-rescue';
const RENDERED_CLICKABLE_ADJACENT_HIDDEN_ITEM_ATTR = 'data-rm-clickable-adjacent-hidden-item';
const renderedClickableAdjacentHiddenRescueStates = new WeakMap();
const CLICKABLE_ADJACENT_HIDDEN_TRIGGER_HINT_RE = /(?:点击|轻触|触摸|确认|查看|检视|检查|展开|打开|开启|读取|揭示|解锁|封存|归档|提交|播放)|\b(?:click|tap|touch|confirm|view|inspect|check|expand|open|read|reveal|unlock|archive|submit|play)\b/i;
const CLICKABLE_ADJACENT_HIDDEN_TRIGGER_CLASS_RE = /(?:trigger|button|action|click|tap|confirm|toggle|reveal|open|操作|按钮|触发)/i;
const CLICKABLE_ADJACENT_HIDDEN_TARGET_CLASS_RE = /(?:hidden|secret|detail|result|message|content|text|archive|record|system|隐藏|秘密|详情|结果|信息|内容|正文|档案|记录|判定)/i;

function isRenderedClickableAdjacentHiddenTrigger(element) {
    if (!element) return false;
    if (element.hasAttribute?.(RENDERED_CLICKABLE_ADJACENT_HIDDEN_RESCUE_ATTR)) return true;
    const tagName = String(element.tagName || '').toLowerCase();
    if (!/^(?:div|section|article|figure|aside|span|p)$/.test(tagName)) return false;
    if (isExplicitlyHiddenStateLayer(element)) return false;
    if (getInlineStyleValue(element, 'cursor').toLowerCase() !== 'pointer') return false;
    if (element.querySelector?.('button, input, label, summary, details, select, textarea, a[href]')) return false;

    const text = normalizeInteractionMatchText(element.textContent);
    if (text.length < 2 || text.length > 420) return false;
    const semantic = `${element.id || ''} ${getClassTokens(element).join(' ')}`;
    return CLICKABLE_ADJACENT_HIDDEN_TRIGGER_HINT_RE.test(text)
        || CLICKABLE_ADJACENT_HIDDEN_TRIGGER_CLASS_RE.test(semantic);
}

function isRenderedClickableAdjacentHiddenTarget(element, trigger) {
    if (!element || !trigger || element === trigger) return false;
    const tagName = String(element.tagName || '').toLowerCase();
    if (!/^(?:div|section|article|aside|p|ul|ol|dl|blockquote|pre)$/.test(tagName)) return false;

    const previouslyManaged = element.hasAttribute?.(RENDERED_CLICKABLE_ADJACENT_HIDDEN_ITEM_ATTR);
    const hidden = isExplicitlyHiddenStateLayer(element)
        || isCollapsedDimensionValue(getInlineStyleValue(element, 'height'))
        || isCollapsedDimensionValue(getInlineStyleValue(element, 'max-height'));
    if (!previouslyManaged && !hidden) return false;

    // 带独立关闭按钮或绝对/固定定位的结构继续交给“可点击画面弹层”路线，避免双重接管。
    const position = getInlineStyleValue(element, 'position').toLowerCase();
    if (!previouslyManaged && (/^(?:absolute|fixed)$/.test(position) || findRenderedClickableAdjacentPopupCloseButtons(element).length)) return false;

    const text = normalizeInteractionMatchText(element.textContent);
    if (text.length < 4 || text.length > 5000) return false;
    const semantic = `${element.id || ''} ${getClassTokens(element).join(' ')}`;
    return previouslyManaged
        || CLICKABLE_ADJACENT_HIDDEN_TARGET_CLASS_RE.test(semantic)
        || text.length >= 12;
}

function findRenderedClickableAdjacentHiddenTarget(trigger) {
    let node = trigger?.nextElementSibling || null;
    for (let step = 0; node && step < 3; step += 1, node = node.nextElementSibling) {
        if (/^(?:style|script|template)$/i.test(node.tagName || '')) continue;
        if (isRenderedClickableAdjacentHiddenTarget(node, trigger)) return node;

        // 允许跨过一个纯装饰短节点；遇到真实内容或另一交互区立即停止。
        if (node.querySelector?.('button, input, label, details, summary, select, textarea, a[href]')) break;
        const text = normalizeInteractionMatchText(node.textContent);
        if (text.length > 12) break;
    }
    return null;
}

function hasRenderedClickableAdjacentHiddenCandidates(root) {
    if (!root?.querySelectorAll) return false;
    return [...root.querySelectorAll('div, section, article, figure, aside, span, p')]
        .some(trigger => isRenderedClickableAdjacentHiddenTrigger(trigger)
            && !!findRenderedClickableAdjacentHiddenTarget(trigger));
}

function buildRenderedClickableAdjacentHiddenEntry(trigger, target) {
    if (!trigger || !target) return null;
    const targetOriginalStyles = capturePseudoStyleState(target, [
        'display', 'visibility', 'opacity', 'pointer-events', 'transform',
        'height', 'min-height', 'max-height', 'overflow', 'overflow-x', 'overflow-y',
        'position', 'inset', 'top', 'right', 'bottom', 'left', 'width', 'max-width',
        'margin', 'margin-top',
    ]);
    trigger.setAttribute(RENDERED_CLICKABLE_ADJACENT_HIDDEN_RESCUE_ATTR, 'true');
    target.setAttribute(RENDERED_CLICKABLE_ADJACENT_HIDDEN_ITEM_ATTR, 'true');
    return {
        trigger,
        target,
        active: false,
        targetOriginalStyles,
        activeTransform: neutralizeStateLayerTransform(getCapturedStyleValue(targetOriginalStyles, 'transform')),
        wasDisplayNone: getCapturedStyleValue(targetOriginalStyles, 'display').toLowerCase() === 'none',
        hadCollapsedHeight: isCollapsedDimensionValue(getCapturedStyleValue(targetOriginalStyles, 'height')),
        hadCollapsedMaxHeight: isCollapsedDimensionValue(getCapturedStyleValue(targetOriginalStyles, 'max-height')),
    };
}

function applyRenderedClickableAdjacentHiddenEntry(entry, active = entry?.active) {
    if (!entry?.trigger || !entry?.target) return;
    entry.active = !!active;
    restorePseudoStyleState(entry.target, entry.targetOriginalStyles);

    if (entry.active) {
        const naturalHeight = Math.max(48, Number(entry.target.scrollHeight || 0) + 20);
        const assignments = [
            { property: 'opacity', value: '1' },
            { property: 'visibility', value: 'visible' },
            { property: 'pointer-events', value: 'auto' },
        ];
        if (entry.wasDisplayNone) assignments.push({ property: 'display', value: 'block' });
        if (entry.activeTransform) assignments.push({ property: 'transform', value: entry.activeTransform });
        if (entry.hadCollapsedHeight) assignments.push({ property: 'height', value: 'auto' });
        if (entry.hadCollapsedMaxHeight || getRenderedElementHeight(entry.target) <= 1) {
            assignments.push({ property: 'max-height', value: `${Math.max(320, naturalHeight * 2)}px` });
            assignments.push({ property: 'min-height', value: `${Math.min(1200, naturalHeight)}px` });
        }
        applyPseudoStyleAssignments(entry.target, assignments);
    }

    entry.trigger.setAttribute('aria-expanded', entry.active ? 'true' : 'false');
    entry.trigger.setAttribute('aria-pressed', entry.active ? 'true' : 'false');
    entry.target.setAttribute('aria-hidden', entry.active ? 'false' : 'true');
}

function installRenderedClickableAdjacentHiddenRescue(root) {
    if (!root?.querySelectorAll) return;
    let state = renderedClickableAdjacentHiddenRescueStates.get(root);
    if (!state) {
        state = { entries: new Map() };
        renderedClickableAdjacentHiddenRescueStates.set(root, state);
    }

    for (const trigger of root.querySelectorAll('div, section, article, figure, aside, span, p')) {
        if (trigger.closest?.(`[${INTERACTION_DIAGNOSTIC_PANEL_ATTR}]`) || state.entries.has(trigger)) continue;
        if (!isRenderedClickableAdjacentHiddenTrigger(trigger)) continue;
        const target = findRenderedClickableAdjacentHiddenTarget(trigger);
        if (!target) continue;
        const entry = buildRenderedClickableAdjacentHiddenEntry(trigger, target);
        if (!entry) continue;
        state.entries.set(trigger, entry);
        preparePseudoTrigger(trigger);

        const toggle = event => {
            if (event?.type === 'click' && shouldIgnorePseudoToggleEvent(event, trigger)) return;
            if (event?.type === 'keydown') {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
            }
            event?.preventDefault?.();
            applyRenderedClickableAdjacentHiddenEntry(entry, !entry.active);
            for (const delay of [0, 80, 260]) {
                setTimeout(() => {
                    if (root.isConnected && entry.trigger.isConnected && entry.target.isConnected) {
                        applyRenderedClickableAdjacentHiddenEntry(entry, entry.active);
                    }
                }, delay);
            }
        };

        trigger.addEventListener('click', toggle, false);
        trigger.addEventListener('keydown', toggle, false);
        applyRenderedClickableAdjacentHiddenEntry(entry, false);
    }

    if (state.entries.size) root.dataset.rabbitMirrorClickableAdjacentHiddenFallback = 'true';
}


// 渲染后“可点击画面 + 相邻弹层”急救：用于宿主删除 onclick 后，
// 只剩带 cursor:pointer 的画面、紧邻隐藏弹层以及弹层内关闭按钮的结构。
// 点击画面打开，点击关闭入口恢复；不依赖原始事件代码，并保持完整可逆。
const RENDERED_CLICKABLE_ADJACENT_POPUP_RESCUE_ATTR = 'data-rabbit-mirror-clickable-adjacent-popup-rescue';
const RENDERED_CLICKABLE_ADJACENT_POPUP_ITEM_ATTR = 'data-rm-clickable-adjacent-popup-item';
const RENDERED_CLICKABLE_ADJACENT_POPUP_CLOSE_ATTR = 'data-rm-clickable-adjacent-popup-close';
const renderedClickableAdjacentPopupRescueStates = new WeakMap();
const CLICKABLE_ADJACENT_POPUP_TRIGGER_HINT_RE = /(?:点击|轻触|触摸|查看|检视|检查|打开|开启|进入|解锁|翻阅|读取|回忆|相簿|底片)|\b(?:click|tap|touch|open|inspect|view|enter|unlock|album|memory)\b/i;
const CLICKABLE_ADJACENT_POPUP_CLOSE_HINT_RE = /(?:关闭|合上|收起|返回|退出|结束|完成)|\b(?:close|back|exit|dismiss|done|cancel)\b/i;
const CLICKABLE_ADJACENT_POPUP_TARGET_HINT_RE = /(?:popup|modal|dialog|overlay|album|memory|detail|secret|hidden|弹层|弹窗|浮层|相簿|回忆|详情|秘密|隐藏)/i;

function isRenderedClickableAdjacentPopupTrigger(element) {
    if (!element || element.hasAttribute?.(RENDERED_CLICKABLE_ADJACENT_POPUP_RESCUE_ATTR)) return !!element;
    const tagName = String(element.tagName || '').toLowerCase();
    if (!/^(?:div|section|article|figure|aside|span)$/.test(tagName)) return false;
    if (isExplicitlyHiddenStateLayer(element)) return false;
    if (getInlineStyleValue(element, 'cursor').toLowerCase() !== 'pointer') return false;
    const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
    return text.length >= 2 && text.length <= 420;
}

function findRenderedClickableAdjacentPopupCloseButtons(target) {
    if (!target?.querySelectorAll) return [];
    const buttons = [...target.querySelectorAll('button, [role="button"]')];
    const hinted = buttons.filter(button => CLICKABLE_ADJACENT_POPUP_CLOSE_HINT_RE.test(
        String(button.textContent || button.getAttribute?.('aria-label') || '').replace(/\s+/g, ' ').trim(),
    ));
    return hinted.length ? hinted : (buttons.length === 1 ? buttons : []);
}

function isRenderedClickableAdjacentPopupTarget(element, trigger) {
    if (!element || !trigger || element === trigger) return false;
    const tagName = String(element.tagName || '').toLowerCase();
    if (!/^(?:div|section|article|aside|dialog)$/.test(tagName)) return false;

    const previouslyManaged = element.hasAttribute?.(RENDERED_CLICKABLE_ADJACENT_POPUP_ITEM_ATTR);
    if (!previouslyManaged && !isExplicitlyHiddenStateLayer(element)) return false;

    const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length < 8 || text.length > 5000) return false;

    const position = getInlineStyleValue(element, 'position').toLowerCase();
    const semantic = `${element.id || ''} ${getClassTokens(element).join(' ')}`;
    const closeButtons = findRenderedClickableAdjacentPopupCloseButtons(element);
    const triggerText = String(trigger.textContent || '').replace(/\s+/g, ' ').trim();
    const triggerHint = CLICKABLE_ADJACENT_POPUP_TRIGGER_HINT_RE.test(triggerText);
    const popupHint = /^(?:absolute|fixed)$/.test(position)
        || CLICKABLE_ADJACENT_POPUP_TARGET_HINT_RE.test(semantic)
        || closeButtons.length > 0;

    return previouslyManaged || (triggerHint && popupHint && closeButtons.length > 0);
}

function findRenderedClickableAdjacentPopupTarget(trigger) {
    let node = trigger?.nextElementSibling || null;
    for (let step = 0; node && step < 2; step += 1, node = node.nextElementSibling) {
        if (/^(?:style|script|template)$/i.test(node.tagName || '')) continue;
        if (isRenderedClickableAdjacentPopupTarget(node, trigger)) return node;
        break;
    }
    return null;
}

function hasRenderedClickableAdjacentPopupCandidates(root) {
    if (!root?.querySelectorAll) return false;
    return [...root.querySelectorAll('div, section, article, figure, aside, span')]
        .some(trigger => isRenderedClickableAdjacentPopupTrigger(trigger)
            && !!findRenderedClickableAdjacentPopupTarget(trigger));
}

function buildRenderedClickableAdjacentPopupEntry(trigger, target) {
    if (!trigger || !target) return null;
    const targetOriginalStyles = capturePseudoStyleState(target, [
        'display', 'visibility', 'opacity', 'pointer-events', 'transform',
        'height', 'min-height', 'max-height', 'overflow', 'overflow-x', 'overflow-y',
        'position', 'inset', 'top', 'right', 'bottom', 'left', 'width', 'max-width',
        'margin', 'margin-top', 'z-index',
    ]);
    const triggerOriginalStyles = capturePseudoStyleState(trigger, ['filter', 'opacity', 'transform']);
    const closeButtons = findRenderedClickableAdjacentPopupCloseButtons(target);
    if (!closeButtons.length) return null;

    trigger.setAttribute(RENDERED_CLICKABLE_ADJACENT_POPUP_RESCUE_ATTR, 'true');
    target.setAttribute(RENDERED_CLICKABLE_ADJACENT_POPUP_ITEM_ATTR, 'true');
    closeButtons.forEach(button => button.setAttribute(RENDERED_CLICKABLE_ADJACENT_POPUP_CLOSE_ATTR, 'true'));

    return {
        trigger,
        target,
        closeButtons,
        active: false,
        targetOriginalStyles,
        triggerOriginalStyles,
        activeTransform: neutralizeStateLayerTransform(getCapturedStyleValue(targetOriginalStyles, 'transform')),
        wasDisplayNone: getCapturedStyleValue(targetOriginalStyles, 'display').toLowerCase() === 'none',
        hadCollapsedHeight: isCollapsedDimensionValue(getCapturedStyleValue(targetOriginalStyles, 'height')),
        hadCollapsedMaxHeight: isCollapsedDimensionValue(getCapturedStyleValue(targetOriginalStyles, 'max-height')),
    };
}

function applyRenderedClickableAdjacentPopupEntry(entry, active = entry?.active) {
    if (!entry?.trigger || !entry?.target) return;
    entry.active = !!active;
    restorePseudoStyleState(entry.target, entry.targetOriginalStyles);
    restorePseudoStyleState(entry.trigger, entry.triggerOriginalStyles);

    if (entry.active) {
        const assignments = [
            { property: 'opacity', value: '1' },
            { property: 'visibility', value: 'visible' },
            { property: 'pointer-events', value: 'auto' },
        ];
        if (entry.wasDisplayNone) assignments.push({ property: 'display', value: 'block' });
        if (entry.activeTransform) assignments.push({ property: 'transform', value: entry.activeTransform });
        if (entry.hadCollapsedHeight) assignments.push({ property: 'height', value: 'auto' });
        if (entry.hadCollapsedMaxHeight) assignments.push({ property: 'max-height', value: '1200px' });
        applyPseudoStyleAssignments(entry.target, assignments);
    }

    entry.trigger.setAttribute('aria-expanded', entry.active ? 'true' : 'false');
    entry.trigger.setAttribute('aria-pressed', entry.active ? 'true' : 'false');
    entry.target.setAttribute('aria-hidden', entry.active ? 'false' : 'true');
}

function installRenderedClickableAdjacentPopupRescue(root) {
    if (!root?.querySelectorAll) return;
    let state = renderedClickableAdjacentPopupRescueStates.get(root);
    if (!state) {
        state = { entries: new Map() };
        renderedClickableAdjacentPopupRescueStates.set(root, state);
    }

    for (const trigger of root.querySelectorAll('div, section, article, figure, aside, span')) {
        if (trigger.closest?.(`[${INTERACTION_DIAGNOSTIC_PANEL_ATTR}]`) || state.entries.has(trigger)) continue;
        if (!isRenderedClickableAdjacentPopupTrigger(trigger)) continue;
        const target = findRenderedClickableAdjacentPopupTarget(trigger);
        if (!target) continue;
        const entry = buildRenderedClickableAdjacentPopupEntry(trigger, target);
        if (!entry) continue;
        state.entries.set(trigger, entry);
        preparePseudoTrigger(trigger);

        const toggle = event => {
            if (event && shouldIgnorePseudoToggleEvent(event, trigger)) return;
            event?.preventDefault?.();
            applyRenderedClickableAdjacentPopupEntry(entry, !entry.active);
            for (const delay of [0, 80, 260]) {
                setTimeout(() => {
                    if (root.isConnected && entry.trigger.isConnected && entry.target.isConnected) {
                        applyRenderedClickableAdjacentPopupEntry(entry, entry.active);
                    }
                }, delay);
            }
        };

        trigger.addEventListener('click', toggle, false);
        trigger.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            toggle(event);
        }, false);

        for (const closeButton of entry.closeButtons) {
            closeButton.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                applyRenderedClickableAdjacentPopupEntry(entry, false);
            }, false);
        }
        applyRenderedClickableAdjacentPopupEntry(entry, false);
    }

    if (state.entries.size) root.dataset.rabbitMirrorClickableAdjacentPopupFallback = 'true';
}



// 渲染后“可点击容器内部揭示”急救：用于 onclick 被删除后，
// 容器内部仍保留点击提示与 display:none / opacity:0 正文的结构。
// 每个容器独立、可逆，不依赖 class 原名或原始事件代码。
const RENDERED_CONTAINER_INTERNAL_REVEAL_ATTR = 'data-rabbit-mirror-container-internal-reveal';
const RENDERED_CONTAINER_INTERNAL_REVEAL_ITEM_ATTR = 'data-rm-container-internal-reveal-item';
const renderedContainerInternalRevealStates = new WeakMap();
const CONTAINER_INTERNAL_REVEAL_HINT_RE = /(?:点击|轻触|触摸|恢复|曝光|播放|读取|查看|展开|解锁|揭示|悬停|移入|划过|鼠标经过|鼠标移入)|\b(?:click|tap|touch|restore|expose|play|read|view|open|reveal|hover|mouseover|mouse\s*over)\b/i;
const CONTAINER_INTERNAL_REVEAL_HOVER_HINT_RE = /(?:悬停|移入|划过|鼠标经过|鼠标移入)|\b(?:hover|mouseover|mouse\s*over)\b/i;
const CONTAINER_INTERNAL_REVEAL_CLASS_RE = /(?:hidden|secret|reveal|detail|content|text|message|msg|fragment|track|scene)/i;

function isRenderedContainerInternalRevealTarget(element, host) {
    if (!element || !host || element.parentElement !== host) return false;
    const tagName = String(element.tagName || '').toLowerCase();
    if (!/^(?:div|section|article|aside|p|blockquote|pre)$/.test(tagName)) return false;
    const previouslyManaged = element.hasAttribute?.(RENDERED_CONTAINER_INTERNAL_REVEAL_ITEM_ATTR);
    const hidden = isExplicitlyHiddenStateLayer(element)
        || isCollapsedDimensionValue(getInlineStyleValue(element, 'height'))
        || isCollapsedDimensionValue(getInlineStyleValue(element, 'max-height'));
    if (!previouslyManaged && !hidden) return false;
    const text = normalizeInteractionMatchText(element.textContent);
    return text.length >= 4 && text.length <= 6000;
}

function collectRenderedContainerInternalRevealHints(host, targets) {
    const targetSet = new Set(targets || []);
    return [...(host?.children || [])].filter(element => {
        if (targetSet.has(element) || isExplicitlyHiddenStateLayer(element)) return false;
        const text = normalizeInteractionMatchText(element.textContent);
        const semantic = `${element.id || ''} ${getClassTokens(element).join(' ')}`;
        return text.length > 0 && text.length <= 260
            && (CONTAINER_INTERNAL_REVEAL_HINT_RE.test(text) || /(?:hint|instruction|prompt|提示|操作)/i.test(semantic));
    }).slice(0, 4);
}

function buildRenderedContainerInternalRevealEntry(host) {
    if (!host?.children || host.hasAttribute?.(RENDERED_MASK_REVEAL_RESCUE_ATTR)) return null;
    if (host.querySelector?.('input, label, button, summary, details, select, textarea')) return null;

    const targets = [...host.children].filter(element => isRenderedContainerInternalRevealTarget(element, host)).slice(0, 4);
    if (!targets.length) return null;
    const hints = collectRenderedContainerInternalRevealHints(host, targets);
    const semantic = `${host.id || ''} ${getClassTokens(host).join(' ')} ${normalizeInteractionMatchText(host.textContent).slice(0, 300)}`;
    const hasPointerCursor = getInlineStyleValue(host, 'cursor').toLowerCase() === 'pointer';

    // 旧路线要求外层容器预先写 cursor:pointer。模型若把 onmouseover 错挂在
    // opacity:0/max-height:0 的答案自身，宿主净化事件属性后，外层问题行通常没有 cursor。
    // 此时只在同一直属容器内同时存在“悬停/点击查看”等明确提示与隐藏正文时接管，
    // 不把普通装饰层或无提示的静态内容误判为交互。
    if (!hasPointerCursor && !hints.length) return null;
    if (!hints.length && !CONTAINER_INTERNAL_REVEAL_CLASS_RE.test(semantic)) return null;

    const targetStates = targets.map(target => ({
        target,
        originalStyles: capturePseudoStyleState(target, [
            'display', 'visibility', 'opacity', 'pointer-events', 'transform',
            'height', 'min-height', 'max-height', 'overflow', 'overflow-x', 'overflow-y',
        ]),
        activeTransform: neutralizeStateLayerTransform(getInlineStyleValue(target, 'transform')),
        wasDisplayNone: getInlineStyleValue(target, 'display').toLowerCase() === 'none',
        wasVisibilityHidden: getInlineStyleValue(target, 'visibility').toLowerCase() === 'hidden',
        hadCollapsedHeight: isCollapsedDimensionValue(getInlineStyleValue(target, 'height')),
        hadCollapsedMaxHeight: isCollapsedDimensionValue(getInlineStyleValue(target, 'max-height')),
    }));
    const hintStates = hints.map(target => ({
        target,
        originalStyles: capturePseudoStyleState(target, ['display', 'visibility', 'opacity', 'pointer-events']),
    }));

    host.setAttribute(RENDERED_CONTAINER_INTERNAL_REVEAL_ATTR, 'true');
    targets.forEach((target, index) => target.setAttribute(RENDERED_CONTAINER_INTERNAL_REVEAL_ITEM_ATTR, String(index)));
    const hoverHint = hints.some(target => CONTAINER_INTERNAL_REVEAL_HOVER_HINT_RE.test(normalizeInteractionMatchText(target.textContent)));
    return { host, targetStates, hintStates, active: false, pinned: false, hoverHint };
}

function applyRenderedContainerInternalRevealEntry(entry, active = entry?.active) {
    if (!entry?.host) return;
    entry.active = !!active;
    for (const state of entry.targetStates || []) {
        restorePseudoStyleState(state.target, state.originalStyles);
        if (!entry.active) continue;
        const assignments = [
            { property: 'opacity', value: '1' },
            { property: 'visibility', value: 'visible' },
            { property: 'pointer-events', value: 'auto' },
            { property: 'overflow', value: 'visible' },
        ];
        if (state.wasDisplayNone) assignments.push({ property: 'display', value: 'block' });
        if (state.wasVisibilityHidden) assignments.push({ property: 'visibility', value: 'visible' });
        if (state.activeTransform) assignments.push({ property: 'transform', value: state.activeTransform });
        if (state.hadCollapsedHeight) assignments.push({ property: 'height', value: 'auto' });
        if (state.hadCollapsedMaxHeight) assignments.push({ property: 'max-height', value: '1600px' });
        applyPseudoStyleAssignments(state.target, assignments);
    }
    for (const state of entry.hintStates || []) {
        restorePseudoStyleState(state.target, state.originalStyles);
        if (entry.active) applyPseudoStyleAssignments(state.target, [
            { property: 'display', value: 'none' },
            { property: 'opacity', value: '0' },
            { property: 'pointer-events', value: 'none' },
        ]);
    }
    entry.host.setAttribute('aria-expanded', entry.active ? 'true' : 'false');
    entry.host.setAttribute('aria-pressed', entry.active ? 'true' : 'false');
}

function findRenderedContainerInternalRevealEntries(root) {
    if (!root?.querySelectorAll) return [];
    const entries = [];
    for (const host of root.querySelectorAll('div, section, article, aside, figure')) {
        if (host.closest?.(`[${INTERACTION_DIAGNOSTIC_PANEL_ATTR}]`)) continue;
        const entry = buildRenderedContainerInternalRevealEntry(host);
        if (entry) entries.push(entry);
    }
    return entries;
}

function hasRenderedContainerInternalRevealCandidates(root) {
    if (!root?.querySelectorAll) return false;
    return [...root.querySelectorAll('div, section, article, aside, figure')].some(host => {
        if (host.querySelector?.('input, label, button, summary, details, select, textarea')) return false;
        const targets = [...(host.children || [])].filter(element => isRenderedContainerInternalRevealTarget(element, host));
        if (!targets.length) return false;
        const hints = collectRenderedContainerInternalRevealHints(host, targets);
        const hasPointerCursor = getInlineStyleValue(host, 'cursor').toLowerCase() === 'pointer';
        if (!hasPointerCursor && !hints.length) return false;
        return hints.length > 0
            || CONTAINER_INTERNAL_REVEAL_CLASS_RE.test(`${host.id || ''} ${getClassTokens(host).join(' ')}`);
    });
}

function installRenderedContainerInternalRevealRescue(root) {
    if (!root?.querySelectorAll) return;
    let state = renderedContainerInternalRevealStates.get(root);
    if (!state) {
        state = { entries: new Map() };
        renderedContainerInternalRevealStates.set(root, state);
    }

    for (const entry of findRenderedContainerInternalRevealEntries(root)) {
        if (state.entries.has(entry.host)) continue;
        state.entries.set(entry.host, entry);
        preparePseudoTrigger(entry.host);
        const togglePinned = event => {
            if (event?.type === 'click' && shouldIgnorePseudoToggleEvent(event, entry.host)) return;
            if (event?.type === 'keydown') {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
            }
            event?.preventDefault?.();
            entry.pinned = !entry.pinned;
            applyRenderedContainerInternalRevealEntry(entry, entry.pinned);
        };
        entry.host.addEventListener('click', togglePinned, false);
        entry.host.addEventListener('keydown', togglePinned, false);

        // 写着“悬停查看”的结构在桌面端继续保留悬停体验；手机端则由点击锁定。
        // pinned 与 hover 分离，避免 mouseenter 已展开后随后的 click 反向把内容关掉。
        if (entry.hoverHint) {
            entry.host.addEventListener('pointerenter', event => {
                if (event.pointerType === 'touch' || entry.pinned) return;
                applyRenderedContainerInternalRevealEntry(entry, true);
            }, false);
            entry.host.addEventListener('pointerleave', event => {
                if (event.pointerType === 'touch' || entry.pinned) return;
                applyRenderedContainerInternalRevealEntry(entry, false);
            }, false);
        }
        applyRenderedContainerInternalRevealEntry(entry, false);
    }
    if (state.entries.size) root.dataset.rabbitMirrorContainerInternalRevealFallback = 'true';
}

// 渲染后“遮罩—隐藏层揭示”急救：用于宿主已删除 onmouseover/onmouseout，且没有表单控件的画面揭层。
// 只识别同一容器内语义明确的遮罩层与隐藏正文层，点击/轻触一次显示，再次点击恢复。
const RENDERED_MASK_REVEAL_RESCUE_ATTR = 'data-rabbit-mirror-mask-reveal-rescue';
const RENDERED_MASK_REVEAL_TARGET_ATTR = 'data-rm-mask-reveal-target';
const renderedMaskRevealRescueStates = new WeakMap();
const MASK_REVEAL_MASK_HINT_RE = /(?:frost|fog|mist|mask|cover|veil|curtain|overlay|blur|霜|雾|遮罩|覆盖|幕)/i;
const MASK_REVEAL_HIDDEN_HINT_RE = /(?:hidden|reveal|secret|message|msg|detail|content|note|memo|thought|隐藏|揭示|秘密|信息|备忘|内容)/i;
const MASK_REVEAL_TRIGGER_HINT_RE = /(?:长按|按住|点击|轻触|触摸|擦拭|擦去|揭开|查看|显露|解锁|开启)|\b(?:click|tap|touch|hold|wipe|reveal|open|inspect)\b/i;

function isRenderedMaskRevealHiddenTarget(element) {
    if (!element) return false;
    const previouslyManaged = element.hasAttribute?.(RENDERED_MASK_REVEAL_TARGET_ATTR);
    if (!previouslyManaged && !isExplicitlyHiddenStateLayer(element)) return false;
    const tagName = String(element.tagName || '').toLowerCase();
    if (!/^(?:div|section|article|aside|p|span)$/.test(tagName)) return false;
    const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length < 8 || text.length > 1800) return false;
    const semantic = `${element.id || ''} ${getClassTokens(element).join(' ')}`;
    return MASK_REVEAL_HIDDEN_HINT_RE.test(semantic) || text.length >= 30;
}

function isRenderedMaskRevealMask(element) {
    if (!element || isExplicitlyHiddenStateLayer(element)) return false;
    const semantic = `${element.id || ''} ${getClassTokens(element).join(' ')}`;
    const clipPath = getInlineStyleValue(element, 'clip-path');
    const backdrop = getInlineStyleValue(element, 'backdrop-filter');
    const looksLikeMask = MASK_REVEAL_MASK_HINT_RE.test(semantic) || !!clipPath || !!backdrop;
    return looksLikeMask && isOverlayLikeStateLayer(element);
}

function findRenderedMaskRevealEntries(root) {
    if (!root?.querySelectorAll) return [];
    const entries = [];
    const seenHosts = new Set();

    for (const hidden of root.querySelectorAll('div, section, article, aside, p, span')) {
        if (!isRenderedMaskRevealHiddenTarget(hidden)) continue;
        const host = hidden.parentElement;
        if (!host || seenHosts.has(host) || host.hasAttribute?.(RAW_SELF_MUTATION_RESCUE_ATTR) || host.querySelector?.('input, label, button, select, textarea')) continue;
        const siblings = [...(host.children || [])];
        const masks = siblings.filter(item => item !== hidden && isRenderedMaskRevealMask(item));
        if (!masks.length) continue;

        const hostText = String(host.textContent || '').replace(/\s+/g, ' ').trim();
        const cursor = getInlineStyleValue(host, 'cursor').toLowerCase();
        if (cursor !== 'pointer' && !MASK_REVEAL_TRIGGER_HINT_RE.test(hostText)) continue;

        const mask = masks[0];
        const hiddenOriginalStyles = capturePseudoStyleState(hidden, ['display', 'visibility', 'opacity', 'pointer-events', 'transform']);
        const maskOriginalStyles = capturePseudoStyleState(mask, ['opacity', 'clip-path', 'pointer-events', 'filter']);
        const hiddenState = {
            target: hidden,
            originalStyles: hiddenOriginalStyles,
            activeTransform: neutralizeStateLayerTransform(getCapturedStyleValue(hiddenOriginalStyles, 'transform')),
            wasDisplayNone: getCapturedStyleValue(hiddenOriginalStyles, 'display').toLowerCase() === 'none',
        };
        const maskState = {
            target: mask,
            originalStyles: maskOriginalStyles,
            originalClipPath: getCapturedStyleValue(maskOriginalStyles, 'clip-path'),
        };
        entries.push({
            host,
            hiddenState,
            maskState,
            active: host.getAttribute?.('aria-pressed') === 'true',
        });
        seenHosts.add(host);
    }
    return entries;
}

function hasRenderedMaskRevealCandidates(root) {
    return findRenderedMaskRevealEntries(root).length > 0;
}

function applyRenderedMaskRevealEntry(entry, active) {
    if (!entry?.host) return;
    entry.active = !!active;
    restorePseudoStyleState(entry.hiddenState.target, entry.hiddenState.originalStyles);
    restorePseudoStyleState(entry.maskState.target, entry.maskState.originalStyles);

    if (entry.active) {
        const revealAssignments = [
            { property: 'opacity', value: '1' },
            { property: 'visibility', value: 'visible' },
            { property: 'pointer-events', value: 'auto' },
        ];
        if (entry.hiddenState.wasDisplayNone) revealAssignments.push({ property: 'display', value: 'flex' });
        if (entry.hiddenState.activeTransform) revealAssignments.push({ property: 'transform', value: entry.hiddenState.activeTransform });
        applyPseudoStyleAssignments(entry.hiddenState.target, revealAssignments);

        const maskAssignments = [
            { property: 'opacity', value: '0.18' },
            { property: 'pointer-events', value: 'none' },
        ];
        if (/circle\(/i.test(entry.maskState.originalClipPath)) {
            maskAssignments.push({ property: 'clip-path', value: 'circle(85% at 50% 50%)' });
        }
        applyPseudoStyleAssignments(entry.maskState.target, maskAssignments);
    }

    entry.host.setAttribute('aria-pressed', entry.active ? 'true' : 'false');
}

function installRenderedMaskRevealRescue(root) {
    if (!root?.querySelectorAll) return;
    let state = renderedMaskRevealRescueStates.get(root);
    if (!state) {
        state = { hosts: new Map() };
        renderedMaskRevealRescueStates.set(root, state);
    }

    for (const entry of findRenderedMaskRevealEntries(root)) {
        if (state.hosts.has(entry.host)) continue;
        state.hosts.set(entry.host, entry);
        entry.host.setAttribute(RENDERED_MASK_REVEAL_RESCUE_ATTR, 'true');
        entry.hiddenState.target.setAttribute(RENDERED_MASK_REVEAL_TARGET_ATTR, 'true');
        preparePseudoTrigger(entry.host);

        const activate = event => {
            if (event?.type === 'click' && shouldIgnorePseudoToggleEvent(event, entry.host)) return;
            if (event?.type === 'keydown') {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
            }
            applyRenderedMaskRevealEntry(entry, !entry.active);
        };
        entry.host.addEventListener('click', activate, false);
        entry.host.addEventListener('keydown', activate, false);
        applyRenderedMaskRevealEntry(entry, entry.active);
    }
}

// 渲染后“列表项目 → 详情视图”急救：不依赖已被宿主删除的 onclick。
// 仅处理严格结构：同一布局中，前置区域存在 N 个明确可点击候选项，后置详情容器直属包含 N 个隐藏详情层。
const RENDERED_LIST_DETAIL_RESCUE_ATTR = 'data-rabbit-mirror-rendered-list-detail-rescue';
const RENDERED_LIST_DETAIL_TRIGGER_ATTR = 'data-rm-list-detail-trigger';
const RENDERED_LIST_DETAIL_PANEL_ATTR = 'data-rm-list-detail-panel';
const RENDERED_LIST_DETAIL_ACTIVE_ATTR = 'data-rm-list-detail-active';
const renderedListDetailRescueStates = new WeakMap();
const LIST_DETAIL_DEFAULT_HINT_RE = /(?:等待|请选择|选择|选取|点击|轻触|触摸|查看|展开).{0,24}(?:目标|项目|条目|内容|详情|证物|报告|视图|对象|选项)?|\b(?:waiting|select|choose|pick|tap|click)\b/i;

function isMeaningfulListDetailPanel(element) {
    if (!element?.id || !isExplicitlyHiddenStateLayer(element)) return false;
    const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length < 24) return false;
    const tagName = String(element.tagName || '').toLowerCase();
    if (!/^(?:div|section|article|aside|li)$/.test(tagName)) return false;
    return !!element.querySelector?.('h1, h2, h3, h4, h5, h6, p, ul, ol, dl, table, [style*="border"], [style*="background"]')
        || text.length >= 80;
}

function isLikelyListDetailTrigger(element) {
    if (!element?.style || !element?.textContent) return false;
    const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 120) return false;

    const tagName = String(element.tagName || '').toLowerCase();
    if (/^(?:input|textarea|select|option|details|summary)$/.test(tagName)) return false;

    const cursor = getInlineStyleValue(element, 'cursor').toLowerCase();
    const decoration = `${getInlineStyleValue(element, 'text-decoration')} ${getInlineStyleValue(element, 'text-decoration-line')}`.toLowerCase();
    const role = String(element.getAttribute?.('role') || '').toLowerCase();
    const explicitlyClickable = cursor === 'pointer'
        || decoration.includes('underline')
        || role === 'button'
        || element.hasAttribute?.('onclick');
    if (!explicitlyClickable) return false;

    // 选择最内层的明确触发项，避免同时把 li 与内部 span 都计入。
    const nestedClickable = [...(element.querySelectorAll?.('[style*="cursor"], [style*="text-decoration"], [role="button"], [onclick]') || [])]
        .some(child => child !== element && isLikelyListDetailTrigger(child));
    return !nestedClickable;
}

function collectListDetailTriggersBeforeHost(host, expectedCount) {
    const parent = host?.parentElement;
    if (!parent || expectedCount < 2 || expectedCount > 8) return [];
    const siblings = [...parent.children];
    const hostIndex = siblings.indexOf(host);
    if (hostIndex <= 0) return [];

    const searchRoots = siblings.slice(0, hostIndex);
    const candidates = [];
    for (const searchRoot of searchRoots) {
        if (isLikelyListDetailTrigger(searchRoot)) candidates.push(searchRoot);
        for (const element of searchRoot.querySelectorAll?.('*') || []) {
            if (isLikelyListDetailTrigger(element)) candidates.push(element);
        }
    }

    const unique = [...new Set(candidates)]
        .filter(candidate => !candidates.some(other => other !== candidate && candidate.contains?.(other)));
    return unique.length === expectedCount ? unique : [];
}

function getListDetailDefaultViews(host, panels) {
    const panelSet = new Set(panels);
    return [...host.children].filter(element => {
        if (panelSet.has(element) || isExplicitlyHiddenStateLayer(element)) return false;
        const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
        const id = String(element.id || '').toLowerCase();
        if (!text || text.length > 180) return false;
        return /(?:default|empty|placeholder|waiting|select|choose)/i.test(id)
            || LIST_DETAIL_DEFAULT_HINT_RE.test(text);
    }).slice(0, 3);
}

function buildRenderedListDetailEntry(host) {
    if (!host?.children) return null;
    const panels = [...host.children].filter(isMeaningfulListDetailPanel);
    if (panels.length < 2 || panels.length > 8) return null;

    const triggers = collectListDetailTriggersBeforeHost(host, panels.length);
    if (triggers.length !== panels.length) return null;

    const defaultViews = getListDetailDefaultViews(host, panels);
    const panelStates = panels.map(panel => ({
        panel,
        originalStyles: capturePseudoStyleState(panel, ['display', 'visibility', 'opacity', 'pointer-events']),
        wasDisplayNone: getInlineStyleValue(panel, 'display').toLowerCase() === 'none',
        wasVisibilityHidden: getInlineStyleValue(panel, 'visibility').toLowerCase() === 'hidden',
    }));
    const defaultStates = defaultViews.map(view => ({
        view,
        originalStyles: capturePseudoStyleState(view, ['display', 'visibility', 'opacity', 'pointer-events']),
    }));

    panels.forEach((panel, index) => {
        panel.setAttribute(RENDERED_LIST_DETAIL_PANEL_ATTR, String(index));
        panel.setAttribute('aria-hidden', 'true');
    });
    triggers.forEach((trigger, index) => {
        trigger.setAttribute(RENDERED_LIST_DETAIL_TRIGGER_ATTR, String(index));
        trigger.setAttribute('aria-controls', panels[index].id);
        trigger.setAttribute('aria-pressed', 'false');
    });

    return { host, triggers, panelStates, defaultStates, activeIndex: -1 };
}

function applyRenderedListDetailEntry(entry, activeIndex) {
    if (!entry) return;
    entry.activeIndex = Number.isInteger(activeIndex) ? activeIndex : -1;

    for (const [index, state] of entry.panelStates.entries()) {
        restorePseudoStyleState(state.panel, state.originalStyles);
        const active = index === entry.activeIndex;
        if (active) {
            const assignments = [
                { property: 'visibility', value: 'visible' },
                { property: 'opacity', value: '1' },
                { property: 'pointer-events', value: 'auto' },
            ];
            if (state.wasDisplayNone) assignments.push({ property: 'display', value: 'block' });
            applyPseudoStyleAssignments(state.panel, assignments);
            state.panel.setAttribute('aria-hidden', 'false');
            state.panel.setAttribute(RENDERED_LIST_DETAIL_ACTIVE_ATTR, 'true');
        } else {
            state.panel.setAttribute('aria-hidden', 'true');
            state.panel.removeAttribute(RENDERED_LIST_DETAIL_ACTIVE_ATTR);
        }
    }

    for (const state of entry.defaultStates) {
        restorePseudoStyleState(state.view, state.originalStyles);
        if (entry.activeIndex >= 0) {
            applyPseudoStyleAssignments(state.view, [
                { property: 'display', value: 'none' },
                { property: 'opacity', value: '0' },
                { property: 'pointer-events', value: 'none' },
            ]);
            state.view.setAttribute('aria-hidden', 'true');
        } else {
            state.view.removeAttribute('aria-hidden');
        }
    }

    entry.triggers.forEach((trigger, index) => {
        const active = index === entry.activeIndex;
        trigger.setAttribute('aria-pressed', active ? 'true' : 'false');
        if (active) trigger.setAttribute(RENDERED_LIST_DETAIL_ACTIVE_ATTR, 'true');
        else trigger.removeAttribute(RENDERED_LIST_DETAIL_ACTIVE_ATTR);
    });
}

function findRenderedListDetailEntries(root) {
    if (!root?.querySelectorAll) return [];
    const entries = [];
    for (const host of root.querySelectorAll('div, section, article, aside')) {
        const entry = buildRenderedListDetailEntry(host);
        if (entry) entries.push(entry);
    }
    return entries;
}

function hasRenderedListDetailCandidates(root) {
    return findRenderedListDetailEntries(root).length > 0;
}

function installRenderedListDetailRescue(root) {
    if (!root?.querySelectorAll) return;
    let state = renderedListDetailRescueStates.get(root);
    if (!state) {
        state = { hosts: new Map() };
        renderedListDetailRescueStates.set(root, state);
    }

    for (const entry of findRenderedListDetailEntries(root)) {
        if (state.hosts.has(entry.host)) continue;
        state.hosts.set(entry.host, entry);
        entry.host.setAttribute(RENDERED_LIST_DETAIL_RESCUE_ATTR, 'true');

        entry.triggers.forEach((trigger, index) => {
            preparePseudoTrigger(trigger);
            const activate = event => {
                if (event?.type === 'keydown') {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                }
                applyRenderedListDetailEntry(entry, index);
            };
            trigger.addEventListener('click', activate, false);
            trigger.addEventListener('keydown', activate, false);
        });
        applyRenderedListDetailEntry(entry, -1);
    }
}

const PSEUDO_INTERACTION_HINT_RE = /(?:鼠标\s*)?(?:悬停|划过|移入)|\bhover\b|(?:点击|轻触|触摸).{0,16}(?:显示|查看|展开|播放|切换)/i;
const EXISTING_INTERACTIVE_SELECTOR = 'a, button, input, label, summary, select, textarea, [role="button"], [contenteditable="true"]';

function normalizeStylePropertyName(property) {
    return String(property || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase();
}

function parseInlineStyleAssignments(scriptText) {
    const assignments = new Map();
    const source = String(scriptText || '');
    if (!source || !/this\.style/i.test(source)) return [];

    const remember = (property, value) => {
        const normalizedProperty = normalizeStylePropertyName(property);
        const normalizedValue = String(value || '').trim();
        if (!normalizedProperty || !normalizedValue) return;
        assignments.set(normalizedProperty, normalizedValue);
    };

    // 只解析安全且意图明确的 this.style.xxx='value'，绝不执行模型输出的 JavaScript。
    const dotAssignmentRe = /this\.style\.([a-zA-Z][\w]*)\s*=\s*(['"])([\s\S]*?)\2\s*;?/g;
    let match;
    while ((match = dotAssignmentRe.exec(source))) remember(match[1], match[3]);

    const bracketAssignmentRe = /this\.style\[\s*(['"])([a-zA-Z-]+)\1\s*\]\s*=\s*(['"])([\s\S]*?)\3\s*;?/g;
    while ((match = bracketAssignmentRe.exec(source))) remember(match[2], match[4]);

    return [...assignments.entries()].map(([property, value]) => ({ property, value }));
}

function collectInlineAssignments(element, attributeNames) {
    const combined = new Map();
    for (const attributeName of attributeNames) {
        const value = element?.getAttribute?.(attributeName);
        for (const assignment of parseInlineStyleAssignments(value)) {
            combined.set(assignment.property, assignment.value);
        }
    }
    return [...combined.entries()].map(([property, value]) => ({ property, value }));
}

function resolveScopedPseudoId(root, rawId) {
    const id = String(rawId || '').trim();
    if (!root?.querySelectorAll || !id) return null;

    const direct = [...root.querySelectorAll('[id]')].find(element => element.id === id);
    if (direct) return direct;

    const mappedId = interactionScopeStates.get(root)?.idMap?.get?.(id);
    if (mappedId) {
        const mapped = [...root.querySelectorAll('[id]')].find(element => element.id === mappedId);
        if (mapped) return mapped;
    }

    return null;
}

function resolveParentElementExpression(element, expression) {
    const source = String(expression || '').replace(/\s+/g, '');
    if (!/^this(?:\.parentElement)+$/.test(source)) return null;
    const depth = (source.match(/\.parentElement/g) || []).length;
    let current = element;
    for (let index = 0; index < depth; index += 1) {
        current = current?.parentElement || null;
        if (!current) return null;
    }
    return current;
}

function isSafeLocalQuerySelector(selector) {
    const source = String(selector || '').trim();
    // 仅允许一个简单的 ID、class 或标签选择器；禁止组合器、属性、伪类与通配符。
    return /^(?:#[a-zA-Z_][\w:.-]*|\.[a-zA-Z_][\w-]*|[a-zA-Z][\w-]*)$/.test(source);
}

function resolveSafeScopedQuery(scope, selector, root) {
    const safeSelector = String(selector || '').trim();
    if (!scope?.querySelector || !root?.contains || !root.contains(scope) || !isSafeLocalQuerySelector(safeSelector)) return null;
    if (safeSelector.startsWith('#')) {
        return resolveScopedPseudoId(scope, safeSelector.slice(1)) || resolveScopedPseudoId(root, safeSelector.slice(1));
    }
    try {
        let target = scope.querySelector(safeSelector);
        // 酒馆净化器会把模型 class 改写为 custom-xxx。原始 onchange 仍引用旧 class，
        // 急救时仅在同一兔子镜范围内补查该安全前缀，不访问整页。
        if (!target && safeSelector.startsWith('.')) {
            const className = safeSelector.slice(1);
            target = scope.querySelector(`.custom-${className}`);
            if (!target) {
                target = [...scope.querySelectorAll('[class]')].find(element =>
                    [...(element.classList || [])].some(token => token === className || token.endsWith(`-${className}`)),
                ) || null;
            }
        }
        return target && root.contains(target) ? target : null;
    } catch {
        return null;
    }
}

function resolveSafeScopedQueryAll(scope, selector, root) {
    const safeSelector = String(selector || '').trim();
    if (!scope?.querySelectorAll || !root?.contains || !root.contains(scope) || !isSafeLocalQuerySelector(safeSelector)) return [];
    if (safeSelector.startsWith('#')) {
        const target = resolveScopedPseudoId(scope, safeSelector.slice(1)) || resolveScopedPseudoId(root, safeSelector.slice(1));
        return target ? [target] : [];
    }
    try {
        let targets = [...scope.querySelectorAll(safeSelector)].filter(target => target && root.contains(target));
        if (!targets.length && safeSelector.startsWith('.')) {
            const className = safeSelector.slice(1);
            targets = [...scope.querySelectorAll(`.custom-${className}`)].filter(target => target && root.contains(target));
            if (!targets.length) {
                targets = [...scope.querySelectorAll('[class]')].filter(element =>
                    root.contains(element)
                    && [...(element.classList || [])].some(token => token === className || token.endsWith(`-${className}`)),
                );
            }
        }
        return targets.slice(0, 64);
    } catch {
        return [];
    }
}

function resolveRelativeQueryExpression(input, expression, root) {
    const source = String(expression || '').replace(/\s+/g, '');
    const match = /^(this(?:\.parentElement)*)\.querySelector\((['"])([.#][\w:.-]+)\2\)$/.exec(source);
    if (!match) return null;
    const scope = match[1] === 'this' ? input : resolveParentElementExpression(input, match[1]);
    return resolveSafeScopedQuery(scope, match[3], root);
}

function findMatchingScriptBrace(sourceText, openIndex) {
    const source = String(sourceText || '');
    if (source[openIndex] !== '{') return -1;
    let depth = 0;
    let quote = '';
    let escaped = false;

    for (let index = openIndex; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '"' || char === "'" || char === '`') {
            quote = char;
            continue;
        }
        if (char === '{') depth += 1;
        else if (char === '}') {
            depth -= 1;
            if (depth === 0) return index;
        }
    }
    return -1;
}

function extractCheckedConditionalBranches(scriptText) {
    const source = String(scriptText || '');
    const conditionMatch = /if\s*\(\s*this\.checked\s*\)/i.exec(source);
    if (!conditionMatch) return null;

    const activeOpen = source.indexOf('{', conditionMatch.index + conditionMatch[0].length);
    if (activeOpen < 0) return null;
    const activeClose = findMatchingScriptBrace(source, activeOpen);
    if (activeClose < 0) return null;

    const tail = source.slice(activeClose + 1);
    const elseMatch = /^\s*else\s*/i.exec(tail);
    if (!elseMatch) return null;
    const inactiveOpen = source.indexOf('{', activeClose + 1 + elseMatch[0].length);
    if (inactiveOpen < 0) return null;
    const inactiveClose = findMatchingScriptBrace(source, inactiveOpen);
    if (inactiveClose < 0) return null;

    return {
        active: source.slice(activeOpen + 1, activeClose),
        inactive: source.slice(inactiveOpen + 1, inactiveClose),
    };
}

function parseNamedStyleAssignments(scriptText, targetMap, targetCollections = new Map()) {
    const assignmentsByTarget = new Map();
    const source = String(scriptText || '');

    const rememberTarget = (target, property, value) => {
        const normalizedProperty = normalizeStylePropertyName(property);
        const normalizedValue = String(value || '').trim();
        if (!target || !normalizedProperty || !normalizedValue) return;
        if (!assignmentsByTarget.has(target)) assignmentsByTarget.set(target, new Map());
        assignmentsByTarget.get(target).set(normalizedProperty, normalizedValue);
    };
    const remember = (targetName, property, value) => rememberTarget(targetMap.get(targetName), property, value);
    const rememberIndexed = (collectionName, rawIndex, property, value) => {
        const index = Number(rawIndex);
        const collection = targetCollections.get(collectionName);
        if (!Number.isSafeInteger(index) || index < 0 || index > 63 || !collection) return;
        rememberTarget(collection[index], property, value);
    };

    const dotAssignmentRe = /([a-zA-Z_$][\w$]*)\.style\.([a-zA-Z][\w]*)\s*=\s*(['"])([\s\S]*?)\3\s*;?/g;
    let match;
    while ((match = dotAssignmentRe.exec(source))) remember(match[1], match[2], match[4]);

    const bracketAssignmentRe = /([a-zA-Z_$][\w$]*)\.style\[\s*(['"])([a-zA-Z-]+)\2\s*\]\s*=\s*(['"])([\s\S]*?)\4\s*;?/g;
    while ((match = bracketAssignmentRe.exec(source))) remember(match[1], match[3], match[5]);

    const indexedDotAssignmentRe = /([a-zA-Z_$][\w$]*)\s*\[\s*(\d{1,2})\s*\]\s*\.style\.([a-zA-Z][\w]*)\s*=\s*(['"])([\s\S]*?)\4\s*;?/g;
    while ((match = indexedDotAssignmentRe.exec(source))) rememberIndexed(match[1], match[2], match[3], match[5]);

    const indexedBracketAssignmentRe = /([a-zA-Z_$][\w$]*)\s*\[\s*(\d{1,2})\s*\]\s*\.style\[\s*(['"])([a-zA-Z-]+)\3\s*\]\s*=\s*(['"])([\s\S]*?)\5\s*;?/g;
    while ((match = indexedBracketAssignmentRe.exec(source))) rememberIndexed(match[1], match[2], match[4], match[6]);

    return new Map(
        [...assignmentsByTarget.entries()].map(([target, assignments]) => [
            target,
            [...assignments.entries()].map(([property, value]) => ({ property, value })),
        ]),
    );
}

function parseNamedTextAssignments(scriptText, targetMap, targetCollections = new Map()) {
    const textByTarget = new Map();
    const source = String(scriptText || '');
    const rememberText = (target, mode, rawValue) => {
        if (!target) return;
        const value = decodeSafeInlineString(rawValue);
        // innerHTML 只接受纯文本；任何标签形态都放弃该条文字赋值。
        if (mode === 'innerHTML' && /<[^>]*>/.test(value)) return;
        textByTarget.set(target, value);
    };

    const textAssignmentRe = /([a-zA-Z_$][\w$]*)\.(innerHTML|innerText|textContent)\s*=\s*(['"])((?:\\.|(?!\3)[\s\S])*)\3\s*;?/g;
    let match;
    while ((match = textAssignmentRe.exec(source))) rememberText(targetMap.get(match[1]), match[2], match[4]);

    const indexedTextAssignmentRe = /([a-zA-Z_$][\w$]*)\s*\[\s*(\d{1,2})\s*\]\s*\.(innerHTML|innerText|textContent)\s*=\s*(['"])((?:\\.|(?!\4)[\s\S])*)\4\s*;?/g;
    while ((match = indexedTextAssignmentRe.exec(source))) {
        const index = Number(match[2]);
        const collection = targetCollections.get(match[1]);
        if (!Number.isSafeInteger(index) || index < 0 || index > 63 || !collection) continue;
        rememberText(collection[index], match[3], match[5]);
    }
    return textByTarget;
}


function resolveAncestorQueryExpression(input, expression, root) {
    const source = String(expression || '').trim();
    const match = /^(this(?:(?:\s*\.\s*(?:parentNode|parentElement))*))\s*\.\s*querySelector\(\s*(['"])([.#]?[a-zA-Z_][\w:.-]*)\2\s*\)$/.exec(source);
    if (!match) return null;

    const chain = match[1];
    const depth = (chain.match(/\.\s*(?:parentNode|parentElement)/g) || []).length;
    let scope = input;
    for (let index = 0; index < depth; index += 1) {
        scope = scope?.parentElement || null;
        if (!scope || !root?.contains?.(scope)) return null;
    }
    return resolveSafeScopedQuery(scope, match[3], root);
}

function parseSafeCssTextAssignments(cssText) {
    const assignments = [];
    const source = String(cssText || '').trim();
    if (!source || /[{}<>]/.test(source)) return assignments;
    for (const declaration of source.split(';')) {
        const index = declaration.indexOf(':');
        if (index <= 0) continue;
        const property = normalizeStylePropertyName(declaration.slice(0, index).trim());
        const value = declaration.slice(index + 1).trim();
        if (!/^[a-z][a-z0-9-]*$/i.test(property) || !value) continue;
        assignments.push({ property, value });
    }
    return assignments;
}

function resolveCheckedRelativeElementExpression(input, expression, root) {
    const source = String(expression || '').replace(/\s+/g, '');
    if (!/^this(?:\.(?:nextElementSibling|previousElementSibling|parentElement|parentNode)){0,6}$/.test(source)) return null;

    let target = input;
    const steps = source.match(/\.(?:nextElementSibling|previousElementSibling|parentElement|parentNode)/g) || [];
    for (const rawStep of steps) {
        const step = rawStep.slice(1);
        if (step === 'nextElementSibling') target = target?.nextElementSibling || null;
        else if (step === 'previousElementSibling') target = target?.previousElementSibling || null;
        else target = target?.parentElement || null;
        if (!target || !root?.contains?.(target)) return null;
    }
    return target && root?.contains?.(target) ? target : null;
}

function parseCheckedTernaryStyleProgramFromSource(input, root, scriptText) {
    const source = String(scriptText || '');
    if (!source || !/this\s*\.\s*checked\s*\?/i.test(source)) return null;

    const stateValues = new Map();
    const ternaryRe = /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*this\s*\.\s*checked\s*\?\s*(['"])((?:\\.|(?!\2)[\s\S])*)\2\s*:\s*(['"])((?:\\.|(?!\4)[\s\S])*)\4\s*;?/g;
    let match;
    while ((match = ternaryRe.exec(source))) {
        stateValues.set(match[1], {
            active: decodeSafeInlineString(match[3]),
            inactive: decodeSafeInlineString(match[5]),
        });
    }
    // 直接写在赋值右侧的三元表达式不需要先声明状态变量。
    // 不能在 stateValues 为空时提前退出，否则
    // this.nextElementSibling.style.opacity = this.checked ? '1' : '0'
    // 这类最常见结构会在真正解析前被误判为无程序。

    const statesByTarget = new Map();
    const ensureTargetState = target => {
        if (!target) return null;
        if (!statesByTarget.has(target)) {
            statesByTarget.set(target, {
                target,
                activeAssignments: [],
                inactiveAssignments: [],
                activeText: undefined,
                inactiveText: undefined,
            });
        }
        return statesByTarget.get(target);
    };

    // 支持模型最常见的直接相邻目标写法：
    // this.nextElementSibling.style.opacity = this.checked ? '1' : '0';
    // 仅沿当前 input 的有限亲属/兄弟链解析，不执行任意 JavaScript，也不会越出当前兔子镜。
    const rememberDirectStyle = (expression, property, rawActive, rawInactive) => {
        const target = resolveCheckedRelativeElementExpression(input, expression, root);
        const state = ensureTargetState(target);
        const normalizedProperty = normalizeStylePropertyName(property);
        if (!state || !/^[a-z][a-z0-9-]*$/i.test(normalizedProperty)) return;
        state.activeAssignments.push({ property: normalizedProperty, value: decodeSafeInlineString(rawActive) });
        state.inactiveAssignments.push({ property: normalizedProperty, value: decodeSafeInlineString(rawInactive) });
    };

    const directDotTernaryRe = /(this(?:\s*\.\s*(?:nextElementSibling|previousElementSibling|parentElement|parentNode)){0,6})\s*\.\s*style\s*\.\s*([a-zA-Z][\w]*)\s*=\s*this\s*\.\s*checked\s*\?\s*(['"])((?:\\.|(?!\3)[\s\S])*)\3\s*:\s*(['"])((?:\\.|(?!\5)[\s\S])*)\5\s*;?/g;
    let directMatch;
    while ((directMatch = directDotTernaryRe.exec(source))) {
        rememberDirectStyle(directMatch[1], directMatch[2], directMatch[4], directMatch[6]);
    }

    const directBracketTernaryRe = /(this(?:\s*\.\s*(?:nextElementSibling|previousElementSibling|parentElement|parentNode)){0,6})\s*\.\s*style\s*\[\s*(['"])([a-zA-Z-]+)\2\s*\]\s*=\s*this\s*\.\s*checked\s*\?\s*(['"])((?:\\.|(?!\4)[\s\S])*)\4\s*:\s*(['"])((?:\\.|(?!\6)[\s\S])*)\6\s*;?/g;
    while ((directMatch = directBracketTernaryRe.exec(source))) {
        rememberDirectStyle(directMatch[1], directMatch[3], directMatch[5], directMatch[7]);
    }

    const directTextTernaryRe = /(this(?:\s*\.\s*(?:nextElementSibling|previousElementSibling|parentElement|parentNode)){0,6})\s*\.\s*(innerText|textContent)\s*=\s*this\s*\.\s*checked\s*\?\s*(['"])((?:\\.|(?!\3)[\s\S])*)\3\s*:\s*(['"])((?:\\.|(?!\5)[\s\S])*)\5\s*;?/g;
    while ((directMatch = directTextTernaryRe.exec(source))) {
        const target = resolveCheckedRelativeElementExpression(input, directMatch[1], root);
        const state = ensureTargetState(target);
        if (!state) continue;
        state.activeText = decodeSafeInlineString(directMatch[4]);
        state.inactiveText = decodeSafeInlineString(directMatch[6]);
    }

    const queryExpressionPattern = String.raw`(this(?:(?:\s*\.\s*(?:parentNode|parentElement))*)\s*\.\s*querySelector\(\s*(['"])([.#]?[a-zA-Z_][\w:.-]*)\2\s*\))`;

    // 逐行解析，避免 cssText 的字符串内部包含分号时被错误截断。
    for (const rawLine of source.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || /^(?:const|let|var)\b/.test(line)) continue;

        let lineMatch = new RegExp(`^${queryExpressionPattern}\\s*\\.\\s*style\\s*\\.\\s*([a-zA-Z][\\w]*)\\s*=\\s*([a-zA-Z_$][\\w$]*)\\s*;?$`).exec(line);
        if (lineMatch) {
            const target = resolveAncestorQueryExpression(input, lineMatch[1], root);
            const values = stateValues.get(lineMatch[5]);
            const state = ensureTargetState(target);
            if (state && values) {
                const property = normalizeStylePropertyName(lineMatch[4]);
                state.activeAssignments.push({ property, value: values.active });
                state.inactiveAssignments.push({ property, value: values.inactive });
            }
            continue;
        }

        lineMatch = new RegExp(`^${queryExpressionPattern}\\s*\\.\\s*(innerText|textContent)\\s*=\\s*([a-zA-Z_$][\\w$]*)\\s*;?$`).exec(line);
        if (lineMatch) {
            const target = resolveAncestorQueryExpression(input, lineMatch[1], root);
            const values = stateValues.get(lineMatch[5]);
            const state = ensureTargetState(target);
            if (state && values) {
                state.activeText = values.active;
                state.inactiveText = values.inactive;
            }
            continue;
        }

        lineMatch = new RegExp(`^${queryExpressionPattern}\\s*\\.\\s*style\\s*\\.\\s*cssText\\s*=\\s*([a-zA-Z_$][\\w$]*)\\s*\\+\\s*(['"])((?:\\\\.|(?!\\5)[\\s\\S])*)\\5\\s*;?$`).exec(line);
        if (lineMatch) {
            const target = resolveAncestorQueryExpression(input, lineMatch[1], root);
            const values = stateValues.get(lineMatch[4]);
            const suffix = decodeSafeInlineString(lineMatch[6]);
            const state = ensureTargetState(target);
            if (state && values) {
                state.activeAssignments.push(...parseSafeCssTextAssignments(`${values.active}${suffix}`));
                state.inactiveAssignments.push(...parseSafeCssTextAssignments(`${values.inactive}${suffix}`));
            }
        }
    }

    const states = [];
    for (const state of statesByTarget.values()) {
        const properties = new Set([
            ...state.activeAssignments.map(item => item.property),
            ...state.inactiveAssignments.map(item => item.property),
        ]);
        if (!properties.size && state.activeText === undefined && state.inactiveText === undefined) continue;
        states.push({
            ...state,
            originalText: captureStableTextState(state.target),
            originalStyles: capturePseudoStyleState(state.target, properties),
        });
    }
    return states.length ? states : null;
}

function parseCheckedChangeStyleProgramFromSource(input, root, scriptText) {
    const source = String(scriptText || '');
    if (!source) return null;
    if (!/if\s*\(\s*this\.checked\s*\)/i.test(source)) {
        return parseCheckedTernaryStyleProgramFromSource(input, root, source);
    }

    // 只接受结构清晰的 if(this.checked){...} else {...}，绝不执行模型输出的 JavaScript。
    const branches = extractCheckedConditionalBranches(source);
    if (!branches) return null;

    const targetMap = new Map([['this', input]]);
    const targetCollections = new Map();

    // 支持：const wrapper = this.parentElement.parentElement;
    const parentAliasRe = /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(this(?:\s*\.\s*parentElement)+)\s*;?/g;
    let match;
    while ((match = parentAliasRe.exec(source))) {
        const resolved = resolveParentElementExpression(input, match[2]);
        if (resolved && root.contains(resolved)) targetMap.set(match[1], resolved);
    }

    // 支持：const target = this.parentElement.parentElement.querySelector('.target-class');
    // 以及 const target = wrapper.querySelector('#target-id')。只允许单一 class / ID 选择器。
    const relativeQueryAliasRe = /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(this(?:\s*\.\s*parentElement)*)\s*\.\s*querySelector\(\s*(['"])([.#][a-zA-Z_][\w:.-]*)\3\s*\)\s*;?/g;
    while ((match = relativeQueryAliasRe.exec(source))) {
        const expression = `${match[2]}.querySelector('${match[4]}')`;
        const target = resolveRelativeQueryExpression(input, expression, root);
        if (target) targetMap.set(match[1], target);
    }

    const queryAliasRe = /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*([a-zA-Z_$][\w$]*)\.querySelector\(\s*(['"])([.#]?[a-zA-Z_][\w:.-]*)\3\s*\)\s*;?/g;
    while ((match = queryAliasRe.exec(source))) {
        const scope = targetMap.get(match[2]);
        const target = resolveSafeScopedQuery(scope, match[4], root);
        if (target) targetMap.set(match[1], target);
    }

    // 模型常用 document.getElementById；宿主会删除 onchange，且 ID 可能已被兔子镜作用域化。
    // 这里只在当前兔子镜内解析安全的固定 ID，不访问整页，也不执行模型 JavaScript。
    const documentIdAliasRe = /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*document\s*\.\s*getElementById\(\s*(['"])([a-zA-Z_][\w:.-]*)\2\s*\)\s*;?/g;
    while ((match = documentIdAliasRe.exec(source))) {
        const target = resolveScopedPseudoId(root, match[3]);
        if (target) targetMap.set(match[1], target);
    }

    // 模型常用 document.querySelector；急救器不会访问整页，而是强制收敛到当前兔子镜。
    const documentQueryAliasRe = /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*document\s*\.\s*querySelector\(\s*(['"])([.#]?[a-zA-Z_][\w:.-]*)\2\s*\)\s*;?/g;
    while ((match = documentQueryAliasRe.exec(source))) {
        const target = resolveSafeScopedQuery(root, match[3], root);
        if (target) targetMap.set(match[1], target);
    }

    // document 作用域别名建立后，再解析依赖它的二级查询，例如 core = cluster.querySelector('div')。
    queryAliasRe.lastIndex = 0;
    while ((match = queryAliasRe.exec(source))) {
        const scope = targetMap.get(match[2]);
        const target = resolveSafeScopedQuery(scope, match[4], root);
        if (target) targetMap.set(match[1], target);
    }

    // 支持固定索引的安全集合访问：const nodes = document/queryScope.querySelectorAll('.item'); nodes[0].style...
    const documentQueryAllAliasRe = /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*document\s*\.\s*querySelectorAll\(\s*(['"])([.#]?[a-zA-Z_][\w:.-]*)\2\s*\)\s*;?/g;
    while ((match = documentQueryAllAliasRe.exec(source))) {
        const targets = resolveSafeScopedQueryAll(root, match[3], root);
        if (targets.length) targetCollections.set(match[1], targets);
    }

    const scopedQueryAllAliasRe = /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*([a-zA-Z_$][\w$]*)\.querySelectorAll\(\s*(['"])([.#]?[a-zA-Z_][\w:.-]*)\3\s*\)\s*;?/g;
    while ((match = scopedQueryAllAliasRe.exec(source))) {
        const scope = targetMap.get(match[2]);
        const targets = resolveSafeScopedQueryAll(scope, match[4], root);
        if (targets.length) targetCollections.set(match[1], targets);
    }

    const activeByTarget = parseNamedStyleAssignments(branches.active, targetMap, targetCollections);
    const inactiveByTarget = parseNamedStyleAssignments(branches.inactive, targetMap, targetCollections);
    const activeTextByTarget = parseNamedTextAssignments(branches.active, targetMap, targetCollections);
    const inactiveTextByTarget = parseNamedTextAssignments(branches.inactive, targetMap, targetCollections);
    const targets = new Set([
        ...activeByTarget.keys(),
        ...inactiveByTarget.keys(),
        ...activeTextByTarget.keys(),
        ...inactiveTextByTarget.keys(),
    ]);
    if (!targets.size || (!activeByTarget.size && !activeTextByTarget.size)) return null;

    const states = [];
    for (const target of targets) {
        const activeAssignments = activeByTarget.get(target) || [];
        const inactiveAssignments = inactiveByTarget.get(target) || [];
        const properties = new Set([...activeAssignments, ...inactiveAssignments].map(item => item.property));
        const hasActiveText = activeTextByTarget.has(target);
        const hasInactiveText = inactiveTextByTarget.has(target);
        if (!properties.size && !hasActiveText && !hasInactiveText) continue;
        states.push({
            target,
            activeAssignments,
            inactiveAssignments,
            activeText: hasActiveText ? activeTextByTarget.get(target) : undefined,
            inactiveText: hasInactiveText ? inactiveTextByTarget.get(target) : undefined,
            originalText: captureStableTextState(target),
            originalStyles: capturePseudoStyleState(target, properties),
        });
    }

    return states.length ? states : null;
}

function parseCheckedChangeStyleProgram(input, root) {
    return parseCheckedChangeStyleProgramFromSource(input, root, input?.getAttribute?.('onchange') || '');
}

function applyCheckedChangeProgram(input, states) {
    const active = !!input?.checked;
    for (const state of states || []) {
        if (!state?.target) continue;
        if (active) {
            if (state.activeText !== undefined) state.target.textContent = state.activeText;
            applyPseudoStyleAssignments(state.target, state.activeAssignments);
            state.target.setAttribute(PSEUDO_ACTIVE_ATTR, 'true');
        } else {
            restorePseudoStyleState(state.target, state.originalStyles);
            if (state.inactiveText !== undefined) state.target.textContent = state.inactiveText;
            else if (state.originalText !== undefined) state.target.textContent = state.originalText;
            applyPseudoStyleAssignments(state.target, state.inactiveAssignments);
            state.target.removeAttribute(PSEUDO_ACTIVE_ATTR);
        }
    }
    input?.setAttribute?.('aria-pressed', active ? 'true' : 'false');
}

function bindCheckedChangeProgram(input, states) {
    if (!input || !states?.length || input.hasAttribute(CHANGE_PSEUDO_RESCUE_ATTR)) return false;
    input.addEventListener('change', () => applyCheckedChangeProgram(input, states), false);
    input.addEventListener('input', () => applyCheckedChangeProgram(input, states), false);
    input.removeAttribute('onchange');
    input.setAttribute(CHANGE_PSEUDO_RESCUE_ATTR, 'true');
    applyCheckedChangeProgram(input, states);
    return true;
}

function installCheckedChangePseudoInteractionRescue(root) {
    if (!root?.querySelectorAll) return;
    const candidates = [...root.querySelectorAll('input[type="checkbox"][onchange], input[type="radio"][onchange]')];

    for (const input of candidates) {
        if (input.hasAttribute(CHANGE_PSEUDO_RESCUE_ATTR)) continue;
        const states = parseCheckedChangeStyleProgram(input, root);
        if (!states?.length) continue;
        bindCheckedChangeProgram(input, states);
    }
}

function readReversibleStyleBaseline(element) {
    if (!element?.style) return new Map();
    const remembered = reversibleStyleBaselineStates.get(element);
    if (remembered) return remembered;

    const baseline = new Map();
    const encoded = element.getAttribute?.(REVERSIBLE_STYLE_BASELINE_ATTR) || '';
    if (encoded) {
        try {
            const parsed = JSON.parse(decodeURIComponent(encoded));
            if (parsed && typeof parsed === 'object') {
                for (const [property, state] of Object.entries(parsed)) {
                    baseline.set(property, {
                        value: String(state?.value || ''),
                        priority: String(state?.priority || ''),
                    });
                }
            }
        } catch {
            // 损坏或旧格式的本地标记直接忽略，并从当前原始 DOM 重新建立。
        }
    }
    reversibleStyleBaselineStates.set(element, baseline);
    return baseline;
}

function persistReversibleStyleBaseline(element, baseline) {
    if (!element?.setAttribute || !baseline?.size) return;
    try {
        const serializable = Object.fromEntries([...baseline.entries()].map(([property, state]) => [property, {
            value: String(state?.value || ''),
            priority: String(state?.priority || ''),
        }]));
        element.setAttribute(REVERSIBLE_STYLE_BASELINE_ATTR, encodeURIComponent(JSON.stringify(serializable)));
    } catch {
        // data 属性写入失败时，WeakMap 中的当前会话基线仍可使用。
    }
}

function capturePseudoStyleState(element, properties) {
    const captured = new Map();
    if (!element?.style) return captured;
    const baseline = readReversibleStyleBaseline(element);
    let changed = false;

    for (const property of properties) {
        if (!baseline.has(property)) {
            baseline.set(property, {
                value: element.style.getPropertyValue(property) || '',
                priority: element.style.getPropertyPriority(property) || '',
            });
            changed = true;
        }
        const state = baseline.get(property) || { value: '', priority: '' };
        captured.set(property, { value: state.value, priority: state.priority });
    }
    if (changed) persistReversibleStyleBaseline(element, baseline);
    return captured;
}

function getCapturedStyleValue(captured, property) {
    return String(captured?.get?.(property)?.value || '').trim();
}

function captureStableTextState(element) {
    if (!element) return '';
    if (reversibleTextBaselineStates.has(element)) return reversibleTextBaselineStates.get(element);

    let value = '';
    const encoded = element.getAttribute?.(REVERSIBLE_TEXT_BASELINE_ATTR) || '';
    if (encoded) {
        try {
            value = decodeURIComponent(encoded);
        } catch {
            value = '';
        }
    }
    if (!encoded) {
        value = String(element.textContent || '');
        try {
            if (value.length <= 4000) element.setAttribute(REVERSIBLE_TEXT_BASELINE_ATTR, encodeURIComponent(value));
        } catch {
            // WeakMap fallback remains available.
        }
    }
    reversibleTextBaselineStates.set(element, value);
    return value;
}

function applyPseudoStyleAssignments(element, assignments) {
    for (const { property, value } of assignments || []) {
        if (!property || !value) continue;
        element.style?.setProperty?.(property, value, 'important');
    }
}

function restorePseudoStyleState(element, captured) {
    for (const [property, previous] of captured || []) {
        if (previous?.value) element.style?.setProperty?.(property, previous.value, previous.priority || '');
        else element.style?.removeProperty?.(property);
    }
}

function setPseudoInteractionState(state, active) {
    if (!state?.target) return;
    state.active = !!active;
    if (state.active) {
        applyPseudoStyleAssignments(state.target, state.activeAssignments);
        state.target.setAttribute(PSEUDO_ACTIVE_ATTR, 'true');
    } else {
        restorePseudoStyleState(state.target, state.originalStyles);
        applyPseudoStyleAssignments(state.target, state.inactiveAssignments);
        state.target.removeAttribute(PSEUDO_ACTIVE_ATTR);
    }
    state.trigger?.setAttribute?.('aria-pressed', state.active ? 'true' : 'false');
}

function isPseudoTriggerUsable(element) {
    if (!element?.style) return false;
    const display = String(element.style.getPropertyValue('display') || '').trim().toLowerCase();
    const visibility = String(element.style.getPropertyValue('visibility') || '').trim().toLowerCase();
    const pointerEvents = String(element.style.getPropertyValue('pointer-events') || '').trim().toLowerCase();
    return display !== 'none' && visibility !== 'hidden' && pointerEvents !== 'none';
}

function preparePseudoTrigger(trigger) {
    if (!trigger?.setAttribute) return;
    const tagName = String(trigger.tagName || '').toLowerCase();
    const alreadyInteractive = /^(?:a|button|input|label|summary|select|textarea)$/.test(tagName)
        || trigger.hasAttribute('tabindex')
        || trigger.hasAttribute('role');
    if (!alreadyInteractive) {
        trigger.setAttribute('role', 'button');
        trigger.setAttribute('tabindex', '0');
    }
    trigger.setAttribute('aria-pressed', 'false');
    if (!trigger.style?.getPropertyValue?.('cursor')) trigger.style?.setProperty?.('cursor', 'pointer');
}

function shouldIgnorePseudoToggleEvent(event, trigger) {
    const interactive = event.target?.closest?.(EXISTING_INTERACTIVE_SELECTOR);
    return !!(interactive && interactive !== trigger && trigger?.contains?.(interactive));
}

function bindPseudoToggle(trigger, state) {
    if (!trigger?.addEventListener || !state) return;
    preparePseudoTrigger(trigger);

    trigger.addEventListener('click', event => {
        if (shouldIgnorePseudoToggleEvent(event, trigger)) return;
        setPseudoInteractionState(state, !state.active);
    }, false);

    trigger.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        setPseudoInteractionState(state, !state.active);
    }, false);
}

function findHintedHiddenLayerPairs(root) {
    if (!root?.querySelectorAll) return [];
    const pairs = [];
    const hints = [...root.querySelectorAll('div, p, span, small, em, strong')]
        .filter(element => {
            const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
            return text && text.length <= 100 && PSEUDO_INTERACTION_HINT_RE.test(text);
        });

    for (const hint of hints) {
        const host = hint.parentElement;
        if (!host || !root.contains(host)) continue;
        const candidates = [...host.children].filter(candidate => {
            if (candidate === hint || candidate.contains(hint) || candidate.hasAttribute(HINTED_PSEUDO_RESCUE_ATTR) || candidate.hasAttribute(INLINE_PSEUDO_RESCUE_ATTR)) return false;
            const opacity = Number.parseFloat(candidate.style?.getPropertyValue?.('opacity') || '');
            const visibility = String(candidate.style?.getPropertyValue?.('visibility') || '').trim().toLowerCase();
            const hidden = (Number.isFinite(opacity) && opacity <= 0.05) || visibility === 'hidden';
            if (!hidden) return false;

            const position = String(candidate.style?.getPropertyValue?.('position') || '').trim().toLowerCase();
            const width = String(candidate.style?.getPropertyValue?.('width') || '').trim();
            const height = String(candidate.style?.getPropertyValue?.('height') || '').trim();
            const inset = String(candidate.style?.getPropertyValue?.('inset') || '').trim();
            const looksLikeLayer = /^(?:absolute|fixed)$/.test(position)
                && (width === '100%' || height === '100%' || inset === '0' || inset === '0px');
            if (!looksLikeLayer) return false;

            const animatedDescendant = candidate.querySelector?.('[style*="animation"], animate, animateTransform');
            const meaningfulContent = String(candidate.textContent || '').replace(/\s+/g, ' ').trim().length >= 12;
            return !!animatedDescendant || meaningfulContent;
        });
        if (!candidates.length) continue;
        pairs.push({ hint, host, target: candidates[0] });
    }
    return pairs;
}

function hasPseudoInteractionCandidates(root) {
    if (!root?.querySelectorAll) return false;
    if (root.querySelector('[onmouseover], [onmouseenter], [onmouseout], [onmouseleave], [onclick], [onchange]')) return true;
    return findHintedHiddenLayerPairs(root).length > 0;
}


function decodeSafeInlineString(value) {
    return String(value || '')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\(['"\\])/g, '$1');
}

function getSafeClassTokens(value) {
    return String(value || '')
        .split(/\s+/)
        .map(token => token.trim())
        .filter(token => /^[a-zA-Z_][\w-]*$/.test(token));
}

function inferRenderedClassPrefix(target, rawTokens, root) {
    const currentTokens = [...(target?.classList || [])];
    const scores = new Map();
    for (const rawToken of rawTokens || []) {
        for (const currentToken of currentTokens) {
            if (currentToken === rawToken) scores.set('', (scores.get('') || 0) + 3);
            else if (currentToken.endsWith(rawToken)) {
                const prefix = currentToken.slice(0, -rawToken.length);
                if (/^[a-zA-Z0-9_-]+$/.test(prefix)) scores.set(prefix, (scores.get(prefix) || 0) + 2);
            }
        }
    }

    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked.length) return ranked[0][0];

    const cssText = [...(root?.querySelectorAll?.('style') || [])]
        .map(style => style.textContent || '')
        .join('\n');
    if ((rawTokens || []).some(token => new RegExp(`\\.custom-${escapeRegExp(token)}(?![\\w-])`).test(cssText))) {
        return 'custom-';
    }
    return '';
}

function buildDirectIdClassStateAction(target, rawClassValue, root) {
    const rawTokens = getSafeClassTokens(decodeSafeInlineString(rawClassValue));
    if (!target?.classList || !rawTokens.length) return null;
    const prefix = inferRenderedClassPrefix(target, rawTokens, root);
    const classes = [...new Set(rawTokens.map(token => {
        if (target.classList.contains(token)) return token;
        if (prefix && target.classList.contains(`${prefix}${token}`)) return `${prefix}${token}`;
        return `${prefix}${token}`;
    }))];
    return classes.length ? { type: 'class-state', target, classes } : null;
}

function applyDirectIdClassState(action) {
    const target = action?.target;
    if (!target?.classList || !Array.isArray(action.classes)) return;

    let state = directIdClassStateStates.get(target);
    if (!state) {
        state = {
            baseline: new Set([...target.classList]),
            applied: new Set(),
        };
        directIdClassStateStates.set(target, state);
    }

    for (const className of state.applied) {
        if (!state.baseline.has(className)) target.classList.remove(className);
    }
    for (const className of state.baseline) target.classList.add(className);
    for (const className of action.classes) target.classList.add(className);

    state.applied = new Set(action.classes.filter(className => !state.baseline.has(className)));
}

function collectDirectIdClickAssignments(scriptText, root, rawRoot = null) {
    const source = String(scriptText || '');
    if (!source || !/document\s*\.\s*getElementById\s*\(/i.test(source)) return null;

    const matches = [];
    const addMatch = (match, action) => {
        matches.push({ start: match.index, end: match.index + match[0].length, action });
    };


    const resolveRawIdTarget = rawId => {
        const id = String(rawId || '').trim();
        if (!rawRoot?.querySelectorAll || !id) return null;
        return [...rawRoot.querySelectorAll('[id]')].find(element => element.id === id) || null;
    };
    const buildClassOperationAction = (rawId, rawClassName, operation) => {
        const target = resolveScopedPseudoId(root, rawId);
        const rawTarget = resolveRawIdTarget(rawId);
        const classToken = String(rawClassName || '').trim();
        if (!target?.classList || !rawTarget?.classList || !/^[a-zA-Z_][\w-]*$/.test(classToken)) return null;
        const prefix = inferRenderedClassPrefix(target, [...rawTarget.classList], root);
        const className = target.classList.contains(classToken) ? classToken : `${prefix || ''}${classToken}`;

        // 仅恢复在原始／渲染 CSS 中真实出现过的状态 class，避免把任意 onclick 变成无依据状态机。
        const rawCssText = [...(rawRoot.querySelectorAll?.('style') || [])].map(style => style.textContent || '').join('\n');
        const renderedCssText = [...(root.querySelectorAll?.('style') || [])].map(style => style.textContent || '').join('\n');
        const rawEvidence = new RegExp(`\\.${escapeRegExp(classToken)}(?![\\w-])`).test(rawCssText)
            || rawTarget.classList.contains(classToken);
        const renderedEvidence = new RegExp(`\\.${escapeRegExp(className)}(?![\\w-])`).test(renderedCssText)
            || target.classList.contains(className);
        if (!rawEvidence || !renderedEvidence) return null;
        return { type: `class-${operation}`, target, className };
    };

    // document.getElementById('id').checked = true/false;
    // 仅接受固定布尔值与当前兔子镜内真实 checkbox/radio，不执行任意表达式。
    const checkedRe = /document\s*\.\s*getElementById\s*\(\s*(['"])([a-zA-Z_][\w:.-]*)\1\s*\)\s*\.\s*checked\s*=\s*(true|false)\s*;?/gi;
    let match;
    while ((match = checkedRe.exec(source))) {
        const target = resolveScopedPseudoId(root, match[2]);
        if (!target?.matches?.('input[type="checkbox"], input[type="radio"]')) return null;
        addMatch(match, { type: 'checked', target, value: String(match[3]).toLowerCase() === 'true', root });
    }

    // document.getElementById('id').style.left = '70%';
    const styleDotRe = /document\s*\.\s*getElementById\s*\(\s*(['"])([a-zA-Z_][\w:.-]*)\1\s*\)\s*\.\s*style\s*\.\s*([a-zA-Z][\w]*)\s*=\s*(['"])((?:\\.|(?!\4)[\s\S])*)\4\s*;?/g;
    while ((match = styleDotRe.exec(source))) {
        const target = resolveScopedPseudoId(root, match[2]);
        const property = normalizeStylePropertyName(match[3]);
        const value = decodeSafeInlineString(match[5]);
        if (!target || !property || !value) return null;
        addMatch(match, { type: 'style', target, property, value });
    }

    // document.getElementById('id').style['left'] = '70%';
    const styleBracketRe = /document\s*\.\s*getElementById\s*\(\s*(['"])([a-zA-Z_][\w:.-]*)\1\s*\)\s*\.\s*style\s*\[\s*(['"])([a-zA-Z-]+)\3\s*\]\s*=\s*(['"])((?:\\.|(?!\5)[\s\S])*)\5\s*;?/g;
    while ((match = styleBracketRe.exec(source))) {
        const target = resolveScopedPseudoId(root, match[2]);
        const property = normalizeStylePropertyName(match[4]);
        const value = decodeSafeInlineString(match[6]);
        if (!target || !property || !value) return null;
        addMatch(match, { type: 'style', target, property, value });
    }

    // document.getElementById('id').innerText/textContent = '...';
    const textRe = /document\s*\.\s*getElementById\s*\(\s*(['"])([a-zA-Z_][\w:.-]*)\1\s*\)\s*\.\s*(innerText|textContent)\s*=\s*(['"])((?:\\.|(?!\4)[\s\S])*)\4\s*;?/g;
    while ((match = textRe.exec(source))) {
        const target = resolveScopedPseudoId(root, match[2]);
        const value = decodeSafeInlineString(match[5]);
        if (!target) return null;
        addMatch(match, { type: 'text', target, value });
    }

    // document.getElementById('id').classList.toggle/add/remove('active');
    // 只接受固定 ID、固定 class 与三种有限操作；按原目标 class 推导宿主前缀，绝不执行原始 JavaScript。
    const classOperationRe = /document\s*\.\s*getElementById\s*\(\s*(['"])([a-zA-Z_][\w:.-]*)\1\s*\)\s*\.\s*classList\s*\.\s*(toggle|add|remove)\s*\(\s*(['"])([a-zA-Z_][\w-]*)\4\s*\)\s*;?/gi;
    while ((match = classOperationRe.exec(source))) {
        const action = buildClassOperationAction(match[2], match[5], String(match[3] || '').toLowerCase());
        if (!action) return null;
        addMatch(match, action);
    }

    // document.getElementById('id').className = 'base active';
    // 只接受固定字符串，并把酒馆自动加入的 custom- 前缀映射回当前安全 DOM。
    const classNameRe = /document\s*\.\s*getElementById\s*\(\s*(['"])([a-zA-Z_][\w:.-]*)\1\s*\)\s*\.\s*className\s*=\s*(['"])((?:\\.|(?!\3)[\s\S])*)\3\s*;?/g;
    while ((match = classNameRe.exec(source))) {
        const target = resolveScopedPseudoId(root, match[2]);
        const action = buildDirectIdClassStateAction(target, match[4], root);
        if (!action) return null;
        addMatch(match, action);
    }

    if (!matches.length) return null;
    matches.sort((a, b) => a.start - b.start);

    // 只接受由上述明确赋值与空白/分号组成的脚本。任何未知语句都会放弃，绝不部分执行。
    let cursor = 0;
    let remainder = '';
    for (const item of matches) {
        if (item.start < cursor) continue;
        remainder += source.slice(cursor, item.start);
        cursor = item.end;
    }
    remainder += source.slice(cursor);
    if (remainder.replace(/[\s;]+/g, '') !== '') return null;

    return matches.map(item => item.action);
}

function applyDirectIdClickAssignments(actions) {
    for (const action of actions || []) {
        if (!action?.target) continue;
        if (action.type === 'style') {
            action.target.style?.setProperty?.(action.property, action.value, 'important');
        } else if (action.type === 'text') {
            action.target.textContent = action.value;
        } else if (action.type === 'checked') {
            const actionRoot = action.root?.contains?.(action.target)
                ? action.root
                : action.target.closest?.(MIRROR_TOTO_SELECTOR) || action.target.closest?.('details');
            if (actionRoot && action.target.type === 'radio' && action.value === false) {
                const previous = !!action.target.checked;
                action.target.checked = false;
                restoreInteractionInlineOverrides(action.target);
                if (previous) dispatchRescuedInputState(action.target);
            } else if (actionRoot) {
                setRescuedCheckedState(actionRoot, action.target, action.value);
            }
        } else if (action.type === 'class-state') {
            applyDirectIdClassState(action);
        } else if (action.type === 'class-toggle') {
            action.target.classList.toggle(action.className);
        } else if (action.type === 'class-add') {
            action.target.classList.add(action.className);
        } else if (action.type === 'class-remove') {
            action.target.classList.remove(action.className);
        }
    }
}

function installDirectIdClickProgramRescue(root) {
    if (!root?.querySelectorAll) return;
    const candidates = [...root.querySelectorAll('[onclick]')];

    for (const trigger of candidates) {
        if (trigger.hasAttribute(DIRECT_ID_CLICK_RESCUE_ATTR)) continue;
        const source = trigger.getAttribute('onclick');
        const actions = collectDirectIdClickAssignments(source, root);
        if (!actions?.length) continue;

        preparePseudoTrigger(trigger);
        const activate = event => {
            if (event?.type === 'click' && shouldIgnorePseudoToggleEvent(event, trigger)) return;
            if (event?.type === 'keydown') {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
            }
            if (event?.type === 'change' && trigger.matches?.('input[type="radio"]') && !trigger.checked) return;
            applyDirectIdClickAssignments(actions);
        };

        trigger.addEventListener('click', activate, false);
        trigger.addEventListener('keydown', activate, false);
        if (trigger.matches?.('input[type="checkbox"], input[type="radio"]')) {
            trigger.addEventListener('change', activate, false);
        }
        trigger.removeAttribute('onclick');
        trigger.removeAttribute('aria-pressed');
        trigger.setAttribute(DIRECT_ID_CLICK_RESCUE_ATTR, 'true');
    }
}


function getRabbitMirrorSummaryText(root) {
    const summary = root?.querySelector?.('summary');
    if (!summary) return '';
    const clone = summary.cloneNode?.(true);
    if (clone?.querySelectorAll) {
        clone.querySelectorAll(`[${MAINTENANCE_RABBIT_ATTR}], [${FEEDBACK_CAT_ATTR}], [${RESAY_ATTR}], [${TOOL_ENTRY_HOST_ATTR}]`).forEach(node => node.remove());
    }
    return String((clone || summary).textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function getAvailableHostChat() {
    try {
        const contextChat = globalThis.SillyTavern?.getContext?.()?.chat;
        if (Array.isArray(contextChat)) return contextChat;
    } catch {
        // Fall through to the imported script module.
    }

    if (Array.isArray(hostScriptModule?.chat)) return hostScriptModule.chat;
    if (Array.isArray(globalThis.chat)) return globalThis.chat;
    return [];
}

function getExternalOwnerMessageIndex(node) {
    const shell = node?.closest?.('[data-rabbit-mirror-external-shell][data-rm-owner-mesid], [data-rabbit-mirror-external-source][data-rm-owner-mesid]');
    const value = Number(shell?.getAttribute?.('data-rm-owner-mesid'));
    return Number.isInteger(value) && value >= 0 ? value : -1;
}

function getAssistantMessageForRenderedRoot(root) {
    const chat = getAvailableHostChat();
    if (!chat.length || !root?.closest) return null;

    const externalIndex = getExternalOwnerMessageIndex(root);
    if (externalIndex >= 0 && chat[externalIndex] && !chat[externalIndex]?.is_user) return chat[externalIndex];

    const messageElement = root.closest('.mes, [mesid], [data-message-id], [data-messageid]');
    const rawMessageId = messageElement?.getAttribute?.('mesid')
        ?? messageElement?.getAttribute?.('data-message-id')
        ?? messageElement?.getAttribute?.('data-messageid')
        ?? messageElement?.dataset?.messageId
        ?? messageElement?.dataset?.messageid;
    const numericId = Number.parseInt(String(rawMessageId ?? ''), 10);
    if (Number.isInteger(numericId) && chat[numericId] && !chat[numericId]?.is_user) {
        return chat[numericId];
    }

    const summary = getRabbitMirrorSummaryText(root);
    if (!summary) return null;
    for (let index = chat.length - 1; index >= Math.max(0, chat.length - 12); index -= 1) {
        const item = chat[index];
        if (item?.is_user) continue;
        const sources = maintenanceMessageSourceCandidates(item);
        if (sources.some(candidate => candidate.source.includes(summary))) return item;
    }
    return null;
}

function getRawAssistantMessageForRenderedRoot(root) {
    const externalShell = root?.closest?.('[data-rabbit-mirror-external-shell][data-rm-source="independent"]');
    const independentSource = externalShell?.__rabbitMirrorIndependentSource;
    if (typeof independentSource === 'string' && independentSource.trim()) return independentSource;

    const message = getAssistantMessageForRenderedRoot(root);
    if (!message) return '';

    if (typeof message?.mes === 'string') return message.mes;
    const swipeIndex = Number.isInteger(message?.swipe_id) ? message.swipe_id : -1;
    if (swipeIndex >= 0 && typeof message?.swipes?.[swipeIndex] === 'string') {
        return message.swipes[swipeIndex];
    }
    if (typeof message?.extra?.display_text === 'string') return message.extra.display_text;
    return '';
}

function collectRawRabbitMirrorRoots(rawHtml) {
    if (!rawHtml || typeof document === 'undefined') return [];
    try {
        // 原始消息可能含会截断 inline style 的未编码 SVG Data URI。
        // 先在字符串层移除损坏的背景声明，再交给 template 解析；否则后续安全事件回读也会失去真实 DOM 路径。
        const prepared = rescueDamagedDataUriRabbitMirrorOutput(
            decodeHtmlEntities(normalizeMirrorAttribute(String(rawHtml))),
        );
        const template = document.createElement('template');
        template.innerHTML = prepared;
        const roots = [...template.content.querySelectorAll(MIRROR_TOTO_SELECTOR)];
        if (roots.length) return roots;

        return [...template.content.querySelectorAll('details')]
            .filter(details => isRabbitMirrorDetails(details));
    } catch {
        return [];
    }
}
function chooseMatchingRawRabbitMirrorRoot(rawHtml, renderedRoot) {
    const candidates = collectRawRabbitMirrorRoots(rawHtml);
    if (!candidates.length) return null;

    const renderedSummary = getRabbitMirrorSummaryText(renderedRoot);
    const matched = candidates.find(candidate => getRabbitMirrorSummaryText(candidate) === renderedSummary)
        || candidates.find(candidate => renderedSummary && getRabbitMirrorSummaryText(candidate).includes(renderedSummary))
        || candidates[0];

    if (!matched) return null;
    const renderedTag = String(renderedRoot?.tagName || '').toLowerCase();
    const matchedTag = String(matched.tagName || '').toLowerCase();
    if (renderedTag === matchedTag) return matched;

    if (renderedTag === 'details') {
        return matched.querySelector?.(':scope > details') || matched.querySelector?.('details') || matched;
    }
    if (renderedTag === 'toto' && matchedTag === 'details') return matched;
    return matched;
}

function getElementChildIndexPath(root, element) {
    if (!root || !element || root === element) return [];
    const path = [];
    let current = element;
    while (current && current !== root) {
        const parent = current.parentElement;
        if (!parent) return null;
        const index = [...parent.children].indexOf(current);
        if (index < 0) return null;
        path.unshift(index);
        current = parent;
    }
    return current === root ? path : null;
}

function resolveElementChildIndexPath(root, path) {
    let current = root;
    for (const index of path || []) {
        current = current?.children?.[index] || null;
        if (!current) return null;
    }
    return current;
}


function normalizeInteractionMatchText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function resolveRenderedCounterpart(rawRoot, renderedRoot, rawElement, selector = '*') {
    if (!rawRoot || !renderedRoot || !rawElement) return null;
    const rawTag = String(rawElement.tagName || '').toLowerCase();

    if (rawElement.matches?.('input[type="checkbox"], input[type="radio"]')) {
        const rawInputs = [...rawRoot.querySelectorAll('input[type="checkbox"], input[type="radio"]')];
        const renderedInputs = [...renderedRoot.querySelectorAll('input[type="checkbox"], input[type="radio"]')];
        const index = rawInputs.indexOf(rawElement);
        return index >= 0 ? (renderedInputs[index] || null) : null;
    }

    const rawId = String(rawElement.id || '').trim();
    if (rawId) {
        const idCandidate = resolveScopedPseudoId(renderedRoot, rawId);
        if (idCandidate && String(idCandidate.tagName || '').toLowerCase() === rawTag) return idCandidate;
    }

    const path = getElementChildIndexPath(rawRoot, rawElement);
    const pathCandidate = path ? resolveElementChildIndexPath(renderedRoot, path) : null;
    if (pathCandidate && String(pathCandidate.tagName || '').toLowerCase() === rawTag) return pathCandidate;

    const rawText = normalizeInteractionMatchText(rawElement.textContent);
    const candidates = [...renderedRoot.querySelectorAll(selector)]
        .filter(candidate => String(candidate.tagName || '').toLowerCase() === rawTag);
    if (!candidates.length) return null;
    if (rawText) {
        const exact = candidates.find(candidate => normalizeInteractionMatchText(candidate.textContent) === rawText);
        if (exact) return exact;
        const prefix = rawText.slice(0, Math.min(64, rawText.length));
        const near = candidates.find(candidate => normalizeInteractionMatchText(candidate.textContent).includes(prefix));
        if (near) return near;
    }

    const rawPeers = [...rawRoot.querySelectorAll(rawTag || '*')];
    const index = rawPeers.indexOf(rawElement);
    return index >= 0 ? (candidates[index] || null) : null;
}

const RAW_SELF_MUTATION_RESCUE_ATTR = 'data-rabbit-mirror-self-mutation-rescue';
const RAW_SELF_MUTATION_HTML_BASELINE_ATTR = 'data-rm-self-mutation-html-baseline';
const RAW_SELF_MUTATION_ACTIVE_ATTR = 'data-rm-self-mutation-active';
const rawSelfMutationRescueStates = new WeakMap();

function parseSafeSelfMutationText(mode, rawValue) {
    const decoded = decodeSafeInlineString(rawValue);
    if (mode !== 'innerHTML') return decoded;
    if (typeof document === 'undefined') return decoded.replace(/<[^>]*>/g, '');
    try {
        const template = document.createElement('template');
        template.innerHTML = decoded;
        if (template.content.querySelector('script, style, iframe, object, embed, form, input, button, a')) return null;
        return String(template.content.textContent || '').replace(/\s+/g, ' ').trim();
    } catch {
        return null;
    }
}

function parseRelativeSelfMutationAssignments(scriptText, trigger, root) {
    const source = String(scriptText || '');
    const grouped = new Map();
    if (!source || !trigger || !root?.contains?.(trigger)) return [];

    const remember = (expression, property, value) => {
        const target = resolveCheckedRelativeElementExpression(trigger, expression, root);
        const normalizedProperty = normalizeStylePropertyName(property);
        const normalizedValue = String(value || '').trim();
        if (!target?.style || !normalizedProperty || !normalizedValue) return;
        let entry = grouped.get(target);
        if (!entry) {
            entry = { target, assignments: new Map() };
            grouped.set(target, entry);
        }
        // 同一目标、同一属性只保留脚本中的最后一次赋值，兼容 setTimeout 内的最终状态。
        entry.assignments.set(normalizedProperty, normalizedValue);
    };

    let match;
    const dotAssignmentRe = /(this(?:\s*\.\s*(?:nextElementSibling|previousElementSibling|parentElement|parentNode)){1,6})\s*\.\s*style\s*\.\s*([a-zA-Z][\w]*)\s*=\s*(['"])((?:\\.|(?!\3)[\s\S])*)\3\s*;?/g;
    while ((match = dotAssignmentRe.exec(source))) remember(match[1], match[2], match[4]);

    const bracketAssignmentRe = /(this(?:\s*\.\s*(?:nextElementSibling|previousElementSibling|parentElement|parentNode)){1,6})\s*\.\s*style\s*\[\s*(['"])([a-zA-Z-]+)\2\s*\]\s*=\s*(['"])((?:\\.|(?!\4)[\s\S])*)\4\s*;?/g;
    while ((match = bracketAssignmentRe.exec(source))) remember(match[1], match[3], match[5]);

    return [...grouped.values()].map(item => {
        const assignments = [...item.assignments.entries()].map(([property, value]) => ({ property, value }));
        return {
            target: item.target,
            assignments,
            originalStyles: capturePseudoStyleState(item.target, new Set(assignments.map(assignment => assignment.property))),
        };
    });
}


// 从原始消息安全回读 this.querySelector('固定选择器').style.xxx = '固定值'。
// 先在原始兔子镜内定位目标，再按 DOM 路径映射到已渲染节点，兼容宿主给 class 自动加前缀。
function parseRawDescendantSelfMutationAssignments(scriptText, rawTrigger, rawRoot, renderedRoot) {
    const source = String(scriptText || '');
    const grouped = new Map();
    if (!source || !rawTrigger?.querySelector || !rawRoot || !renderedRoot) return [];

    const remember = (selector, property, value) => {
        const safeSelector = String(selector || '').trim();
        if (!safeSelector || safeSelector.length > 240 || /[{};]/.test(safeSelector)) return;
        let rawTarget = null;
        try { rawTarget = rawTrigger.querySelector(safeSelector); } catch { return; }
        if (!rawTarget || rawTarget === rawTrigger) return;
        const target = resolveRenderedCounterpart(rawRoot, renderedRoot, rawTarget, '*');
        const normalizedProperty = normalizeStylePropertyName(property);
        const normalizedValue = decodeSafeInlineString(value).trim();
        if (!target?.style || !renderedRoot.contains?.(target) || !normalizedProperty || !normalizedValue) return;
        let entry = grouped.get(target);
        if (!entry) {
            entry = { target, assignments: new Map() };
            grouped.set(target, entry);
        }
        entry.assignments.set(normalizedProperty, normalizedValue);
    };

    let match;
    const dotAssignmentRe = /this\s*\.\s*querySelector\s*\(\s*(['"])((?:\\.|(?!\1)[\s\S]){1,240})\1\s*\)\s*\.\s*style\s*\.\s*([a-zA-Z][\w]*)\s*=\s*(['"])((?:\\.|(?!\4)[\s\S])*)\4\s*;?/g;
    while ((match = dotAssignmentRe.exec(source))) remember(decodeSafeInlineString(match[2]), match[3], match[5]);

    const bracketAssignmentRe = /this\s*\.\s*querySelector\s*\(\s*(['"])((?:\\.|(?!\1)[\s\S]){1,240})\1\s*\)\s*\.\s*style\s*\[\s*(['"])([a-zA-Z-]+)\3\s*\]\s*=\s*(['"])((?:\\.|(?!\5)[\s\S])*)\5\s*;?/g;
    while ((match = bracketAssignmentRe.exec(source))) remember(decodeSafeInlineString(match[2]), match[4], match[6]);


    // opacity=1 / zIndex=10 等不带引号的有限数字赋值。
    const dotNumericAssignmentRe = /this\s*\.\s*querySelector\s*\(\s*(['"])((?:\\.|(?!\1)[\s\S]){1,240})\1\s*\)\s*\.\s*style\s*\.\s*([a-zA-Z][\w]*)\s*=\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*;?/g;
    while ((match = dotNumericAssignmentRe.exec(source))) remember(decodeSafeInlineString(match[2]), match[3], match[4]);

    const bracketNumericAssignmentRe = /this\s*\.\s*querySelector\s*\(\s*(['"])((?:\\.|(?!\1)[\s\S]){1,240})\1\s*\)\s*\.\s*style\s*\[\s*(['"])([a-zA-Z-]+)\3\s*\]\s*=\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*;?/g;
    while ((match = bracketNumericAssignmentRe.exec(source))) remember(decodeSafeInlineString(match[2]), match[4], match[5]);

    return [...grouped.values()].map(item => {
        const assignments = [...item.assignments.entries()].map(([property, value]) => ({ property, value }));
        return {
            target: item.target,
            assignments,
            originalStyles: capturePseudoStyleState(item.target, new Set(assignments.map(assignment => assignment.property))),
        };
    });
}

function parseSafeAttributeGroupToggleProgram(source, trigger, root, rawTrigger = null, rawRoot = null) {
    const script = String(source || '');
    if (!script || !trigger || !rawTrigger || !rawRoot || !root) return null;

    // 仅接受明确的 this.setAttribute('data-*', this.getAttribute(...) === active ? inactive : active)
    // 加同一父容器兄弟项设为 inactive 的有限状态程序；不执行模型 JavaScript。
    const toggleMatch = /this\s*\.\s*setAttribute\(\s*(['"])(data-[a-zA-Z0-9_-]+)\1\s*,\s*this\s*\.\s*getAttribute\(\s*(['"])\2\3\s*\)\s*={2,3}\s*(['"])([^'"]+)\4\s*\?\s*(['"])([^'"]+)\6\s*:\s*(['"])([^'"]+)\8\s*\)/i.exec(script);
    if (!toggleMatch) return null;

    const attributeName = toggleMatch[2];
    const comparedValue = String(toggleMatch[5] || '');
    const whenEqual = String(toggleMatch[7] || '');
    const whenDifferent = String(toggleMatch[9] || '');
    if (!attributeName.startsWith('data-') || !comparedValue || !whenEqual || !whenDifferent) return null;

    // 严格提取并验证同组兄弟关闭意图。
    const strictPeerMatch = /Array\s*\.\s*from\(\s*this\s*\.\s*parent(?:Node|Element)\s*\.\s*children\s*\)\s*\.\s*forEach\s*\(\s*([a-zA-Z_$][\w$]*)\s*=>[\s\S]{0,600}?\1\s*!={1,2}\s*this[\s\S]{0,600}?\1\s*\.\s*classList\s*\.\s*contains\(\s*(['"])([a-zA-Z_][\w-]*)\2\s*\)[\s\S]{0,600}?\1\s*\.\s*setAttribute\(\s*(['"])(data-[a-zA-Z0-9_-]+)\4\s*,\s*(['"])([^'"]+)\6\s*\)/i.exec(script);
    if (!strictPeerMatch) return null;

    const peerClass = strictPeerMatch[3];
    const peerAttribute = strictPeerMatch[5];
    const peerInactiveValue = strictPeerMatch[7];
    if (peerAttribute !== attributeName || peerInactiveValue !== whenEqual) return null;

    const rawParent = rawTrigger.parentElement;
    if (!rawParent) return null;
    const rawPeers = [...rawParent.children].filter(node => node !== rawTrigger && node.classList?.contains?.(peerClass));
    const peers = rawPeers
        .map(rawPeer => resolveRenderedCounterpart(rawRoot, root, rawPeer, '*'))
        .filter(peer => peer && peer !== trigger && root.contains?.(peer));

    return {
        kind: 'attribute-group-toggle',
        trigger,
        attributeName,
        comparedValue,
        activeValue: whenDifferent,
        inactiveValue: whenEqual,
        peers,
        active: trigger.getAttribute(attributeName) === whenDifferent,
    };
}

function parseSafeSelfClassToggleProgram(source, trigger, root, rawTrigger = null) {
    const script = String(source || '');
    const match = /^\s*this\s*\.\s*classList\s*\.\s*toggle\(\s*(['"])([a-zA-Z_][\w-]*)\1\s*\)\s*;?\s*$/i.exec(script);
    if (!match || !trigger?.classList) return null;
    const rawClassName = match[2];
    const rawTokens = [...(rawTrigger?.classList || [])];
    if (!rawTokens.length) rawTokens.push(rawClassName);
    const prefix = inferRenderedClassPrefix(trigger, rawTokens, root);
    const className = trigger.classList.contains(rawClassName)
        ? rawClassName
        : `${prefix}${rawClassName}`;
    return {
        kind: 'class-toggle',
        trigger,
        className,
        active: trigger.classList.contains(className),
    };
}

function parseSelfMutationProgram(source, trigger, root, rawTrigger = null, rawRoot = null) {
    const script = String(source || '');
    if (!script) return null;

    const classToggleProgram = parseSafeSelfClassToggleProgram(script, trigger, root, rawTrigger);
    if (classToggleProgram) return classToggleProgram;

    const attributeProgram = parseSafeAttributeGroupToggleProgram(script, trigger, root, rawTrigger, rawRoot);
    if (attributeProgram) return attributeProgram;

    if (!/this\s*\.(?:innerHTML|innerText|textContent|style|nextElementSibling|previousElementSibling|parentElement|parentNode|querySelector|classList)/i.test(script)) return null;

    const activeAssignments = parseInlineStyleAssignments(script);
    const relativeMutations = parseRelativeSelfMutationAssignments(script, trigger, root);
    const descendantMutations = parseRawDescendantSelfMutationAssignments(script, rawTrigger, rawRoot, root);
    const relatedMutations = [...relativeMutations, ...descendantMutations];
    let activeText;
    const textMatch = /this\s*\.\s*(innerHTML|innerText|textContent)\s*=\s*(['"])((?:\\.|(?!\2)[\s\S])*)\2\s*;?/i.exec(script);
    if (textMatch) activeText = parseSafeSelfMutationText(textMatch[1], textMatch[3]);
    if (!activeAssignments.length && activeText == null && !relatedMutations.length) return null;

    const properties = new Set(activeAssignments.map(item => item.property));
    let originalHtml = trigger.innerHTML;
    const encodedBaseline = trigger.getAttribute?.(RAW_SELF_MUTATION_HTML_BASELINE_ATTR) || '';
    if (encodedBaseline) {
        try { originalHtml = decodeURIComponent(encodedBaseline); } catch { originalHtml = trigger.innerHTML; }
    } else {
        try { trigger.setAttribute(RAW_SELF_MUTATION_HTML_BASELINE_ATTR, encodeURIComponent(originalHtml)); } catch {}
    }
    return {
        trigger,
        active: trigger.getAttribute?.(RAW_SELF_MUTATION_ACTIVE_ATTR) === 'true',
        activeAssignments,
        activeText,
        relatedMutations,
        originalHtml,
        originalStyles: capturePseudoStyleState(trigger, properties),
    };
}

function applyRawSelfMutationEntry(entry, active) {
    if (!entry?.trigger) return;
    entry.active = !!active;

    if (entry.kind === 'class-toggle') {
        entry.trigger.classList.toggle(entry.className, entry.active);
        entry.trigger.setAttribute('aria-pressed', entry.active ? 'true' : 'false');
        entry.trigger.setAttribute(RAW_SELF_MUTATION_ACTIVE_ATTR, entry.active ? 'true' : 'false');
        return;
    }

    if (entry.kind === 'attribute-group-toggle') {
        for (const peer of entry.peers || []) {
            peer?.setAttribute?.(entry.attributeName, entry.inactiveValue);
            peer?.setAttribute?.('aria-pressed', 'false');
            const peerEntry = rawSelfMutationRescueStates.get(entry.trigger.closest?.('details'))?.entries?.get?.(peer);
            if (peerEntry) peerEntry.active = false;
        }
        entry.trigger.setAttribute(entry.attributeName, entry.active ? entry.activeValue : entry.inactiveValue);
        entry.trigger.setAttribute('aria-pressed', entry.active ? 'true' : 'false');
        entry.trigger.setAttribute(RAW_SELF_MUTATION_ACTIVE_ATTR, entry.active ? 'true' : 'false');
        return;
    }

    restorePseudoStyleState(entry.trigger, entry.originalStyles);
    for (const mutation of entry.relatedMutations || []) {
        restorePseudoStyleState(mutation.target, mutation.originalStyles);
    }
    if (entry.active) {
        if (entry.activeText != null) entry.trigger.textContent = entry.activeText;
        applyPseudoStyleAssignments(entry.trigger, entry.activeAssignments);
        for (const mutation of entry.relatedMutations || []) {
            applyPseudoStyleAssignments(mutation.target, mutation.assignments);
        }
    } else if (entry.activeText != null) {
        entry.trigger.innerHTML = entry.originalHtml;
    }
    entry.trigger.setAttribute('aria-pressed', entry.active ? 'true' : 'false');
    entry.trigger.setAttribute(RAW_SELF_MUTATION_ACTIVE_ATTR, entry.active ? 'true' : 'false');
}

function rawHoverProgramHasMeaningfulTouchState(root, target, assignments) {
    return (assignments || []).some(({ property, value }) => {
        const name = normalizeStylePropertyName(property);
        const cleanValue = String(value || '').trim().toLowerCase();
        if (checkedDeclarationCreatesContentReveal(root, target, name, cleanValue)) return true;
        // 3D 翻面会切换实际观看内容，不属于普通按钮变色或轻微位移。
        if (name === 'transform' && /(?:rotate[xy]|perspective)\s*\(/i.test(cleanValue)) return true;
        return false;
    });
}

function bindRawHoverDecorationRestore(trigger, state) {
    if (!trigger?.addEventListener || !state) return;
    const apply = active => {
        if (active) applyPseudoStyleAssignments(state.target, state.activeAssignments);
        else {
            restorePseudoStyleState(state.target, state.originalStyles);
            applyPseudoStyleAssignments(state.target, state.inactiveAssignments);
        }
    };
    trigger.addEventListener('pointerenter', event => {
        if (event.pointerType === 'mouse') apply(true);
    }, false);
    trigger.addEventListener('pointerleave', event => {
        if (event.pointerType === 'mouse') apply(false);
    }, false);
}

function installRawMessageHoverPseudoRescue(root) {
    if (!root?.querySelectorAll) return 0;
    const rawMessage = getRawAssistantMessageForRenderedRoot(root);
    const rawRoot = chooseMatchingRawRabbitMirrorRoot(rawMessage, root);
    if (!rawRoot?.querySelectorAll) return 0;

    let installed = 0;
    for (const rawTrigger of rawRoot.querySelectorAll('[onmouseover], [onmouseenter]')) {
        const renderedTrigger = resolveRenderedCounterpart(rawRoot, root, rawTrigger, 'div, span, section, article, figure, aside, button');
        if (!renderedTrigger
            || renderedTrigger.hasAttribute(RAW_HOVER_PSEUDO_RESCUE_ATTR)
            || renderedTrigger.hasAttribute(RAW_HOVER_DECORATION_RESTORE_ATTR)) continue;
        const activeSource = rawTrigger.getAttribute('onmouseover') || rawTrigger.getAttribute('onmouseenter') || '';
        const inactiveSource = rawTrigger.getAttribute('onmouseout') || rawTrigger.getAttribute('onmouseleave') || '';
        const activeAssignments = parseInlineStyleAssignments(activeSource);
        const inactiveAssignments = parseInlineStyleAssignments(inactiveSource);
        if (!activeAssignments.length) continue;

        const properties = new Set([...activeAssignments, ...inactiveAssignments].map(item => item.property));
        const state = {
            target: renderedTrigger,
            trigger: renderedTrigger,
            active: false,
            activeAssignments,
            inactiveAssignments,
            originalStyles: capturePseudoStyleState(renderedTrigger, properties),
        };

        if (!rawHoverProgramHasMeaningfulTouchState(root, renderedTrigger, activeAssignments)) {
            // 纯配色、阴影、边框或平面位移只恢复桌面鼠标悬停；
            // 不把它伪装成可点击按钮，也不在触屏上制造可保持的假状态。
            bindRawHoverDecorationRestore(renderedTrigger, state);
            renderedTrigger.setAttribute(RAW_HOVER_DECORATION_RESTORE_ATTR, 'true');
            continue;
        }

        pseudoInteractionStates.set(renderedTrigger, state);
        bindPseudoToggle(renderedTrigger, state);
        renderedTrigger.addEventListener('pointerenter', event => {
            if (event.pointerType === 'mouse') setPseudoInteractionState(state, true);
        }, false);
        renderedTrigger.addEventListener('pointerleave', event => {
            if (event.pointerType === 'mouse') setPseudoInteractionState(state, false);
        }, false);
        renderedTrigger.setAttribute(RAW_HOVER_PSEUDO_RESCUE_ATTR, 'true');
        installed += 1;
    }
    const liveMeaningfulCount = root.querySelectorAll?.(`[${RAW_HOVER_PSEUDO_RESCUE_ATTR}]`)?.length || 0;
    if (liveMeaningfulCount) root.dataset.rabbitMirrorRawHoverFallback = String(liveMeaningfulCount);
    else delete root.dataset.rabbitMirrorRawHoverFallback;
    return installed;
}

function installRawMessageSelfMutationRescue(root) {
    if (!root?.querySelectorAll) return 0;
    const rawMessage = getRawAssistantMessageForRenderedRoot(root);
    const rawRoot = chooseMatchingRawRabbitMirrorRoot(rawMessage, root);
    if (!rawRoot?.querySelectorAll) return 0;

    let state = rawSelfMutationRescueStates.get(root);
    if (!state) {
        state = { entries: new Map() };
        rawSelfMutationRescueStates.set(root, state);
    }

    let installed = 0;
    for (const rawTrigger of rawRoot.querySelectorAll('[onclick]')) {
        const source = rawTrigger.getAttribute('onclick') || '';
        if (!/this\s*\.(?:innerHTML|innerText|textContent|style|nextElementSibling|previousElementSibling|parentElement|parentNode|querySelector|setAttribute|getAttribute|classList)/i.test(source)) continue;
        const renderedTrigger = resolveRenderedCounterpart(rawRoot, root, rawTrigger, 'div, span, section, article, figure, aside, button');
        if (!renderedTrigger || state.entries.has(renderedTrigger)) continue;
        const entry = parseSelfMutationProgram(source, renderedTrigger, root, rawTrigger, rawRoot);
        if (!entry) continue;

        state.entries.set(renderedTrigger, entry);
        preparePseudoTrigger(renderedTrigger);
        const toggle = event => {
            if (event?.type === 'click' && shouldIgnorePseudoToggleEvent(event, renderedTrigger)) return;
            if (event?.type === 'keydown') {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
            }
            event?.preventDefault?.();
            applyRawSelfMutationEntry(entry, !entry.active);
        };
        renderedTrigger.addEventListener('click', toggle, false);
        renderedTrigger.addEventListener('keydown', toggle, false);
        renderedTrigger.setAttribute(RAW_SELF_MUTATION_RESCUE_ATTR, 'true');
        installed += 1;
    }
    if (installed || state.entries.size) root.dataset.rabbitMirrorSelfMutationFallback = 'true';
    return installed;
}

function directIdClassOperationActions(actions) {
    return (actions || []).filter(action => /^class-(?:toggle|add|remove)$/.test(String(action?.type || ''))
        && action?.target?.classList && action?.className);
}

function registerDirectIdClassOperationTrigger(trigger, actions) {
    for (const action of directIdClassOperationActions(actions)) {
        let classMap = directIdClassOperationTriggerStates.get(action.target);
        if (!classMap) {
            classMap = new Map();
            directIdClassOperationTriggerStates.set(action.target, classMap);
        }
        let triggers = classMap.get(action.className);
        if (!triggers) {
            triggers = new Set();
            classMap.set(action.className, triggers);
        }
        triggers.add(trigger);
    }
}

function syncDirectIdClassOperationTriggers(actions) {
    for (const action of directIdClassOperationActions(actions)) {
        const active = action.target.classList.contains(action.className);
        const triggers = directIdClassOperationTriggerStates.get(action.target)?.get?.(action.className) || [];
        for (const trigger of triggers) {
            if (!trigger?.isConnected) continue;
            trigger.setAttribute('aria-pressed', active ? 'true' : 'false');
            trigger.setAttribute('data-rabbit-mirror-direct-id-class-active', active ? 'true' : 'false');
        }
    }
}

function bindDirectIdClickActions(trigger, actions) {
    if (!trigger || !actions?.length || trigger.hasAttribute(DIRECT_ID_CLICK_RESCUE_ATTR)) return false;

    preparePseudoTrigger(trigger);
    const activate = event => {
        if (event?.type === 'click' && shouldIgnorePseudoToggleEvent(event, trigger)) return;
        if (event?.type === 'keydown') {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
        }
        // 隐藏 checkbox/radio 在触屏环境通常由 label 兜底直接切换 checked，
        // 原 input 不一定收到 click，但一定会收到急救器补发的 input/change。
        // radio 只在成为当前选中项时执行原 onclick 的固定赋值，避免失选分支反向覆盖。
        if (event?.type === 'change' && trigger.matches?.('input[type="radio"]') && !trigger.checked) return;
        applyDirectIdClickAssignments(actions);
        syncDirectIdClassOperationTriggers(actions);
    };

    registerDirectIdClassOperationTrigger(trigger, actions);
    trigger.addEventListener('click', activate, false);
    trigger.addEventListener('keydown', activate, false);
    if (trigger.matches?.('input[type="checkbox"], input[type="radio"]')) {
        trigger.addEventListener('change', activate, false);
    }
    trigger.removeAttribute('onclick');
    trigger.removeAttribute('aria-pressed');
    trigger.setAttribute(DIRECT_ID_CLICK_RESCUE_ATTR, 'true');
    if (actions.some(action => action?.type === 'class-state' || /^class-(?:toggle|add|remove)$/.test(String(action?.type || '')))) {
        trigger.setAttribute(DIRECT_ID_CLASS_STATE_RESCUE_ATTR, 'true');
    }
    syncDirectIdClassOperationTriggers(actions);
    return true;
}

function reclaimStaleInertActionTrigger(trigger) {
    if (!trigger?.hasAttribute?.(INERT_ACTION_BUTTON_RESCUE_ATTR) || !trigger.parentNode) return trigger;
    const statusId = String(trigger.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
        .find(id => trigger.parentElement?.querySelector?.(`#${escapeCssIdentifier(id)}`)?.hasAttribute?.(INERT_ACTION_STATUS_ATTR));
    const adjacentStatus = trigger.nextElementSibling?.hasAttribute?.(INERT_ACTION_STATUS_ATTR)
        ? trigger.nextElementSibling
        : (statusId ? trigger.parentElement?.querySelector?.(`#${escapeCssIdentifier(statusId)}`) : null);
    adjacentStatus?.remove?.();

    // 热重载时旧版通用兜底的 listener 无法直接移除；用等价克隆替换按钮，
    // 保留结构与样式，同时清除旧 listener 和通用状态属性，再交给真实 class 状态程序接管。
    const replacement = trigger.cloneNode(true);
    replacement.removeAttribute(INERT_ACTION_BUTTON_RESCUE_ATTR);
    replacement.removeAttribute('data-rabbit-mirror-inert-action-active');
    replacement.removeAttribute('aria-pressed');
    if (statusId) {
        const describedBy = String(replacement.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).filter(id => id !== statusId);
        if (describedBy.length) replacement.setAttribute('aria-describedby', describedBy.join(' '));
        else replacement.removeAttribute('aria-describedby');
    }
    trigger.replaceWith(replacement);
    return replacement;
}


function parseSafeRawRadioResetProgram(source) {
    const outer = /^\s*document\s*\.\s*querySelectorAll\s*\(\s*(['"])([\s\S]*?)\1\s*\)\s*\.\s*forEach\s*\(\s*([\s\S]*?)\s*\)\s*;?\s*$/.exec(String(source || ''));
    if (!outer) return false;

    const selector = String(outer[2] || '')
        .replace(/\s+/g, '')
        .replace(/(['"])radio\1/gi, 'radio')
        .toLowerCase();
    if (selector !== 'input[type=radio]') return false;

    const callback = String(outer[3] || '').trim();
    const arrow = /^\(?\s*([a-zA-Z_$][\w$]*)\s*\)?\s*=>\s*(?:\{\s*)?\1\s*\.\s*checked\s*=\s*false\s*;?\s*(?:\}\s*)?$/.exec(callback);
    if (arrow) return true;

    const classic = /^function\s*\(\s*([a-zA-Z_$][\w$]*)\s*\)\s*\{\s*\1\s*\.\s*checked\s*=\s*false\s*;?\s*\}$/.exec(callback);
    return !!classic;
}

function resetLocalRabbitMirrorRadios(root) {
    if (!root?.querySelectorAll) return 0;
    const radios = [...root.querySelectorAll('input[type="radio"]')];
    let changed = 0;
    for (const radio of radios) {
        cancelLabeledCheckedTransitionVerification(radio);
        const wasChecked = !!radio.checked;
        radio.checked = false;
        restoreInteractionInlineOverrides(radio);
        radio.setAttribute?.('aria-pressed', 'false');
        if (wasChecked) {
            changed += 1;
            dispatchRescuedInputState(radio);
        }
    }
    applyRenderedLabelInternalHiddenEntries(root);
    syncCrossParentCheckedRuleFallback(root);
    root.setAttribute?.(RAW_RADIO_RESET_LAST_ATTR, `radios=${radios.length};changed=${changed}`);
    return changed;
}

function installRawMessageRadioResetProgramRescue(root) {
    if (!root?.querySelectorAll) return 0;
    const rawMessage = getRawAssistantMessageForRenderedRoot(root);
    const rawRoot = chooseMatchingRawRabbitMirrorRoot(rawMessage, root);
    if (!rawRoot?.querySelectorAll) return 0;

    let state = rawRadioResetRescueStates.get(root);
    if (!state) {
        state = { entries: new Map() };
        rawRadioResetRescueStates.set(root, state);
    }
    for (const [trigger, entry] of [...state.entries]) {
        if (!trigger?.isConnected || !root.contains?.(trigger)) {
            trigger?.removeEventListener?.('click', entry.onActivate, false);
            trigger?.removeEventListener?.('keydown', entry.onActivate, false);
            state.entries.delete(trigger);
        }
    }

    let installed = 0;
    for (const rawTrigger of rawRoot.querySelectorAll('[onclick]')) {
        if (!parseSafeRawRadioResetProgram(rawTrigger.getAttribute('onclick'))) continue;
        const renderedTrigger = resolveRenderedCounterpart(rawRoot, root, rawTrigger, '*');
        if (!renderedTrigger || state.entries.has(renderedTrigger)) continue;
        if (!root.querySelector('input[type="radio"]')) continue;

        // DOM 克隆会保留 data 属性但不会保留监听器；允许在新根节点上重新绑定。
        renderedTrigger.removeAttribute?.(RAW_RADIO_RESET_RESCUE_ATTR);
        preparePseudoTrigger(renderedTrigger);
        const onActivate = event => {
            if (event?.type === 'click' && shouldIgnorePseudoToggleEvent(event, renderedTrigger)) return;
            if (event?.type === 'keydown') {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
            }
            event?.preventDefault?.();
            event?.stopPropagation?.();
            resetLocalRabbitMirrorRadios(root);
        };
        renderedTrigger.addEventListener('click', onActivate, false);
        renderedTrigger.addEventListener('keydown', onActivate, false);
        renderedTrigger.setAttribute(RAW_RADIO_RESET_RESCUE_ATTR, 'true');
        state.entries.set(renderedTrigger, { onActivate });
        installed += 1;
    }

    const liveCount = state.entries.size;
    if (liveCount) root.setAttribute(RAW_RADIO_RESET_ROOT_ATTR, String(liveCount));
    else {
        root.removeAttribute(RAW_RADIO_RESET_ROOT_ATTR);
        root.removeAttribute(RAW_RADIO_RESET_LAST_ATTR);
    }
    return installed;
}

function installRawMessageDirectIdClickProgramRescue(root) {
    if (!root?.querySelectorAll) return 0;
    const rawMessage = getRawAssistantMessageForRenderedRoot(root);
    const rawRoot = chooseMatchingRawRabbitMirrorRoot(rawMessage, root);
    if (!rawRoot?.querySelectorAll) return 0;

    let installed = 0;
    for (const rawTrigger of rawRoot.querySelectorAll('[onclick]')) {
        let renderedTrigger = resolveRenderedCounterpart(rawRoot, root, rawTrigger, '*');
        if (!renderedTrigger || renderedTrigger.hasAttribute(DIRECT_ID_CLICK_RESCUE_ATTR)) continue;
        renderedTrigger = reclaimStaleInertActionTrigger(renderedTrigger);

        const source = rawTrigger.getAttribute('onclick');
        const actions = collectDirectIdClickAssignments(source, root, rawRoot);
        if (!actions?.length) continue;
        if (bindDirectIdClickActions(renderedTrigger, actions)) installed += 1;
    }
    return installed;
}



function passportDocumentSemanticText(element) {
    return `${element?.id || ''} ${element?.className || ''} ${element?.getAttribute?.('aria-label') || ''}`;
}

function passportDocumentLooksLikeCover(element) {
    return /(?:passport|document|book|travel|visa|证件|护照|通行).*(?:cover|front|封面)|(?:cover|front|封面).*(?:passport|document|book|travel|visa|证件|护照|通行)/i.test(passportDocumentSemanticText(element));
}

function passportDocumentLooksLikePages(element) {
    return /(?:passport|document|book|travel|visa|证件|护照|通行).*(?:pages?|inside|content|内页|页)|(?:pages?|inside|content|内页|页).*(?:passport|document|book|travel|visa|证件|护照|通行)/i.test(passportDocumentSemanticText(element));
}

function passportDocumentLooksLikeStamp(element) {
    if (!element?.querySelector) return false;
    const signature = passportDocumentSemanticText(element);
    if (!/(?:^|[\s_-])stamp(?:$|[\s_-])|印章|邮戳/i.test(signature)) return false;
    return !![...element.querySelectorAll('*')].find(child => /(?:stamp.*detail|detail.*stamp|印章.*详情|批注)/i.test(passportDocumentSemanticText(child)));
}

function passportDocumentStampDetail(stamp) {
    if (!stamp?.querySelectorAll) return null;
    return [...stamp.querySelectorAll('*')].find(child => /(?:stamp.*detail|detail.*stamp|印章.*详情|批注)/i.test(passportDocumentSemanticText(child))) || null;
}

function findRenderedPassportDocumentCandidates(root) {
    if (!root?.querySelectorAll) return [];
    const candidates = [];
    const seen = new Set();
    for (const pages of root.querySelectorAll('div,section,article')) {
        if (!passportDocumentLooksLikePages(pages)) continue;
        const cover = pages.previousElementSibling;
        const host = pages.parentElement;
        if (!cover || !host || !passportDocumentLooksLikeCover(cover)) continue;
        const stamps = [...pages.querySelectorAll('div,label,button')].filter(passportDocumentLooksLikeStamp);
        if (stamps.length < 2) continue;
        const close = [...pages.querySelectorAll('div,span,button,a')].find(element => /(?:close|fold|合上|关闭|收起)/i.test(`${passportDocumentSemanticText(element)} ${element.textContent || ''}`)) || null;
        if (seen.has(pages)) continue;
        seen.add(pages);
        candidates.push({ host, cover, pages, close, stamps });
    }
    return candidates;
}

function markRenderedPassportDocumentCandidate(candidate, marked = null) {
    if (!candidate) return 0;
    const { host, cover, pages, close, stamps } = candidate;
    const mark = (element, attr, value = 'true') => {
        if (!element?.setAttribute) return;
        element.setAttribute(attr, value);
        marked?.add?.(element);
    };
    mark(host, PASSPORT_DOCUMENT_HOST_ATTR);
    mark(cover, PASSPORT_DOCUMENT_COVER_ATTR);
    mark(pages, PASSPORT_DOCUMENT_PAGES_ATTR);
    if (close) mark(close, PASSPORT_DOCUMENT_CLOSE_ATTR);
    (stamps || []).forEach((stamp, index) => {
        mark(stamp, PASSPORT_DOCUMENT_STAMP_ATTR);
        mark(stamp, PASSPORT_DOCUMENT_STAMP_INDEX_ATTR, String(index + 1));
        const detail = passportDocumentStampDetail(stamp);
        if (detail) mark(detail, PASSPORT_DOCUMENT_STAMP_DETAIL_ATTR);
    });
    return 3 + (close ? 1 : 0) + (stamps?.length || 0);
}

function parseSafeSelfClassAddProgram(source) {
    const match = /^\s*this\s*\.\s*classList\s*\.\s*add\(\s*(['"])([a-zA-Z_][\w-]*)\1\s*\)\s*;?\s*$/i.exec(String(source || ''));
    return match ? match[2] : '';
}

function parseSafeQuerySelectorClassRemoveProgram(source, expectedClass) {
    const match = /^\s*document\s*\.\s*querySelector\(\s*(['"])(\.[a-zA-Z_][\w-]*)\1\s*\)\s*\.\s*classList\s*\.\s*remove\(\s*(['"])([a-zA-Z_][\w-]*)\3\s*\)\s*;?\s*$/i.exec(String(source || ''));
    if (!match || match[4] !== expectedClass) return null;
    return { selector: match[2], className: match[4] };
}

function parsePassportStampNthRules(rawRoot, stampClassName) {
    if (!rawRoot?.querySelectorAll || !stampClassName) return new Map();
    const safeProperties = new Set([
        'border-color', 'border-style', 'border-width', 'color', 'background', 'background-color',
        'grid-column', 'grid-row', 'justify-self', 'align-self', 'margin-top', 'margin-bottom',
        'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
        'border-radius', 'transform', 'opacity',
    ]);
    const result = new Map();
    const escaped = escapeRegExp(stampClassName);
    const ruleRe = new RegExp(`\\.${escaped}\\s*:nth-child\\(\\s*(\\d+)\\s*\\)\\s*\\{([^{}]*)\\}`, 'gi');
    const declarationRe = /(^|;)\s*([a-z-]+)\s*:\s*([^;{}]+?)(?=;|$)/gi;
    for (const style of rawRoot.querySelectorAll('style')) {
        const cssText = String(style.textContent || '');
        let ruleMatch;
        while ((ruleMatch = ruleRe.exec(cssText))) {
            const index = Number(ruleMatch[1]);
            if (!Number.isInteger(index) || index < 1 || index > 12) continue;
            const assignments = [];
            declarationRe.lastIndex = 0;
            let declaration;
            while ((declaration = declarationRe.exec(ruleMatch[2]))) {
                const property = normalizeStylePropertyName(declaration[2]);
                const value = String(declaration[3] || '').trim().replace(/\s*!important\s*$/i, '');
                if (safeProperties.has(property) && value) assignments.push({ property, value });
            }
            if (assignments.length) result.set(index, assignments);
        }
    }
    return result;
}

function applyPassportStampNthRules(rawCandidate, renderedCandidate, rawRoot) {
    const rawStamps = rawCandidate?.stamps || [];
    const renderedStamps = renderedCandidate?.stamps || [];
    if (!rawStamps.length || !renderedStamps.length) return 0;
    const classCounts = new Map();
    for (const token of rawStamps[0].classList || []) {
        if (/(?:^|[-_])stamp$/i.test(token) || /^stamp$/i.test(token)) classCounts.set(token, 1);
    }
    const stampClassName = [...classCounts.keys()][0] || [...(rawStamps[0].classList || [])].find(token => /stamp/i.test(token)) || '';
    const rules = parsePassportStampNthRules(rawRoot, stampClassName);
    let applied = 0;
    for (let index = 0; index < renderedStamps.length; index += 1) {
        const assignments = rules.get(index + 1);
        if (!assignments?.length) continue;
        applyPseudoStyleAssignments(renderedStamps[index], assignments);
        applied += assignments.length;
    }
    return applied;
}

function ensurePassportDocumentRescueStyle(root) {
    if (!root?.querySelector) return null;
    let style = root.querySelector(`style[${PASSPORT_DOCUMENT_STYLE_ATTR}]`);
    if (!style) {
        style = document.createElement('style');
        style.setAttribute(PASSPORT_DOCUMENT_STYLE_ATTR, 'true');
        root.appendChild(style);
    }
    style.textContent = `
[${PASSPORT_DOCUMENT_HOST_ATTR}] { perspective: 1000px; }
[${PASSPORT_DOCUMENT_COVER_ATTR}] { -webkit-backface-visibility: hidden !important; backface-visibility: hidden !important; -webkit-transform-style: preserve-3d !important; transform-style: preserve-3d !important; will-change: transform; }
[${PASSPORT_DOCUMENT_PAGES_ATTR}] { -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
[${PASSPORT_DOCUMENT_STAMP_ATTR}] { overflow: visible !important; }
[${PASSPORT_DOCUMENT_STAMP_ATTR}][${PASSPORT_DOCUMENT_STAMP_ACTIVE_ATTR}="true"] > [${PASSPORT_DOCUMENT_STAMP_DETAIL_ATTR}] { opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; }
@media (max-width: ${MOBILE_LAYOUT_BREAKPOINT_PX}px) {
  [${PASSPORT_DOCUMENT_HOST_ATTR}] { height: clamp(380px, 70svh, 560px) !important; min-height: 380px !important; overflow: hidden !important; }
  [${PASSPORT_DOCUMENT_COVER_ATTR}] { height: 100% !important; min-height: 100% !important; box-sizing: border-box !important; }
  [${PASSPORT_DOCUMENT_PAGES_ATTR}] { height: 100% !important; max-height: none !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; grid-auto-flow: row !important; grid-auto-rows: max-content !important; align-content: start !important; overflow-y: auto !important; overflow-x: hidden !important; padding: clamp(12px, 4vw, 20px) !important; box-sizing: border-box !important; }
  [${PASSPORT_DOCUMENT_STAMP_ATTR}] { min-width: 0 !important; max-width: 100% !important; box-sizing: border-box !important; flex-wrap: nowrap !important; }
  [${PASSPORT_DOCUMENT_STAMP_ATTR}][${PASSPORT_DOCUMENT_STAMP_INDEX_ATTR}="1"] { grid-column: 1 !important; grid-row: 1 !important; justify-self: end !important; }
  [${PASSPORT_DOCUMENT_STAMP_ATTR}][${PASSPORT_DOCUMENT_STAMP_INDEX_ATTR}="2"] { grid-column: 2 !important; grid-row: 2 !important; justify-self: start !important; }
  [${PASSPORT_DOCUMENT_STAMP_ATTR}][${PASSPORT_DOCUMENT_STAMP_INDEX_ATTR}="3"] { grid-column: 1 / span 2 !important; grid-row: 3 !important; justify-self: center !important; }
  [${PASSPORT_DOCUMENT_STAMP_ATTR}][${PASSPORT_DOCUMENT_STAMP_ACTIVE_ATTR}="true"] { margin-bottom: clamp(120px, 32vw, 170px) !important; }
  [${PASSPORT_DOCUMENT_STAMP_DETAIL_ATTR}] { width: min(220px, calc(100vw - 86px)) !important; max-width: min(220px, calc(100vw - 86px)) !important; box-sizing: border-box !important; writing-mode: horizontal-tb !important; white-space: normal !important; overflow-wrap: anywhere !important; word-break: break-word !important; }
  [${PASSPORT_DOCUMENT_STAMP_ATTR}][${PASSPORT_DOCUMENT_STAMP_INDEX_ATTR}="1"] > [${PASSPORT_DOCUMENT_STAMP_DETAIL_ATTR}] { left: 0 !important; right: auto !important; transform: translateY(6px) !important; }
  [${PASSPORT_DOCUMENT_STAMP_ATTR}][${PASSPORT_DOCUMENT_STAMP_INDEX_ATTR}="2"] > [${PASSPORT_DOCUMENT_STAMP_DETAIL_ATTR}] { left: auto !important; right: 0 !important; transform: translateY(6px) !important; }
  [${PASSPORT_DOCUMENT_STAMP_ATTR}][${PASSPORT_DOCUMENT_STAMP_INDEX_ATTR}="3"] > [${PASSPORT_DOCUMENT_STAMP_DETAIL_ATTR}] { left: 50% !important; right: auto !important; transform: translateX(-50%) translateY(6px) !important; }
  [${PASSPORT_DOCUMENT_STAMP_ATTR}][${PASSPORT_DOCUMENT_STAMP_ACTIVE_ATTR}="true"] > [${PASSPORT_DOCUMENT_STAMP_DETAIL_ATTR}] { transform-origin: top center !important; }
  [${PASSPORT_DOCUMENT_CLOSE_ATTR}] { position: sticky !important; bottom: 0 !important; right: auto !important; grid-column: 1 / span 2 !important; justify-self: end !important; width: max-content !important; margin-top: 12px !important; padding: 6px 8px !important; background: rgba(253, 251, 247, 0.94) !important; z-index: 40 !important; }
}`;
    return style;
}

function findRawPassportDocumentCandidate(root) {
    const rawMessage = getRawAssistantMessageForRenderedRoot(root);
    const rawRoot = chooseMatchingRawRabbitMirrorRoot(rawMessage, root);
    if (!rawRoot?.querySelectorAll) return null;
    for (const rawCover of rawRoot.querySelectorAll('[onclick]')) {
        const openClass = parseSafeSelfClassAddProgram(rawCover.getAttribute('onclick'));
        if (!openClass || !passportDocumentLooksLikeCover(rawCover)) continue;
        const rawPages = rawCover.nextElementSibling;
        if (!rawPages || !passportDocumentLooksLikePages(rawPages)) continue;
        const rawStamps = [...rawPages.querySelectorAll('div,label,button')].filter(passportDocumentLooksLikeStamp);
        if (rawStamps.length < 2) continue;
        const rawClose = [...rawPages.querySelectorAll('[onclick]')].find(element => parseSafeQuerySelectorClassRemoveProgram(element.getAttribute('onclick'), openClass)) || null;
        const renderedCover = resolveRenderedCounterpart(rawRoot, root, rawCover, '*');
        const renderedPages = resolveRenderedCounterpart(rawRoot, root, rawPages, '*');
        if (!renderedCover || !renderedPages) continue;
        const renderedHost = renderedPages.parentElement;
        const renderedClose = rawClose ? resolveRenderedCounterpart(rawRoot, root, rawClose, '*') : null;
        const renderedStamps = rawStamps.map(stamp => resolveRenderedCounterpart(rawRoot, root, stamp, '*')).filter(Boolean);
        if (!renderedHost || renderedStamps.length < 2) continue;
        const prefix = inferRenderedClassPrefix(renderedCover, [...rawCover.classList, openClass], root);
        const renderedOpenClass = renderedCover.classList.contains(openClass) ? openClass : `${prefix}${openClass}`;
        return {
            rawRoot,
            rawCandidate: { host: rawPages.parentElement, cover: rawCover, pages: rawPages, close: rawClose, stamps: rawStamps },
            renderedCandidate: { host: renderedHost, cover: renderedCover, pages: renderedPages, close: renderedClose, stamps: renderedStamps },
            openClass: renderedOpenClass,
        };
    }
    return null;
}

function applyPassportDocumentOpenState(entry, active) {
    if (!entry?.candidate?.cover || !entry?.candidate?.pages) return;
    entry.active = !!active;
    const { host, cover, pages } = entry.candidate;
    cover.classList.toggle(entry.openClass, entry.active);
    host.setAttribute(PASSPORT_DOCUMENT_OPEN_ATTR, entry.active ? 'true' : 'false');
    cover.setAttribute('aria-expanded', entry.active ? 'true' : 'false');
    pages.setAttribute('aria-hidden', entry.active ? 'false' : 'true');
    restorePseudoStyleState(pages, entry.pagesOriginalStyles);
    if (entry.active) {
        applyPseudoStyleAssignments(pages, [
            { property: 'opacity', value: '1' },
            { property: 'visibility', value: 'visible' },
            { property: 'pointer-events', value: 'auto' },
        ]);
    } else {
        applyPseudoStyleAssignments(pages, [
            { property: 'opacity', value: '0' },
            { property: 'pointer-events', value: 'none' },
        ]);
        for (const stampEntry of entry.stampEntries || []) applyPassportStampState(entry, stampEntry, false);
    }
}

function applyPassportStampState(documentEntry, stampEntry, active) {
    if (!stampEntry?.stamp) return;
    stampEntry.active = !!active;
    stampEntry.stamp.setAttribute(PASSPORT_DOCUMENT_STAMP_ACTIVE_ATTR, stampEntry.active ? 'true' : 'false');
    stampEntry.stamp.setAttribute('aria-expanded', stampEntry.active ? 'true' : 'false');
    if (!stampEntry.active && stampEntry.detail) {
        restorePseudoStyleState(stampEntry.detail, stampEntry.detailOriginalStyles);
    }
    if (stampEntry.active && stampEntry.detail) {
        applyPseudoStyleAssignments(stampEntry.detail, [
            { property: 'opacity', value: '1' },
            { property: 'visibility', value: 'visible' },
            { property: 'pointer-events', value: 'auto' },
        ]);
    }
}

function installPassportDocumentRescue(root) {
    if (!root?.querySelectorAll || !root?.isConnected) return 0;
    const raw = findRawPassportDocumentCandidate(root);
    if (!raw) return 0;
    const candidate = raw.renderedCandidate;
    markRenderedPassportDocumentCandidate(candidate);
    ensurePassportDocumentRescueStyle(root);
    applyPassportStampNthRules(raw.rawCandidate, candidate, raw.rawRoot);

    let state = passportDocumentRescueStates.get(root);
    if (!state) {
        state = { entries: [] };
        passportDocumentRescueStates.set(root, state);
    }
    if (state.entries.some(entry => entry.candidate.cover === candidate.cover)) return 0;

    const entry = {
        candidate,
        openClass: raw.openClass,
        active: candidate.cover.classList.contains(raw.openClass),
        pagesOriginalStyles: capturePseudoStyleState(candidate.pages, ['opacity', 'visibility', 'pointer-events']),
        stampEntries: [],
    };
    for (const stamp of candidate.stamps) {
        const detail = passportDocumentStampDetail(stamp);
        const stampEntry = {
            stamp,
            detail,
            active: false,
            detailOriginalStyles: detail ? capturePseudoStyleState(detail, ['opacity', 'visibility', 'pointer-events', 'transform']) : new Map(),
        };
        entry.stampEntries.push(stampEntry);
        preparePseudoTrigger(stamp);
        const toggleStamp = event => {
            if (event?.type === 'keydown') {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
            } else if (event?.target?.closest?.(`[${PASSPORT_DOCUMENT_STAMP_DETAIL_ATTR}]`)) {
                return;
            } else event?.preventDefault?.();
            const next = !stampEntry.active;
            for (const other of entry.stampEntries) if (other !== stampEntry && other.active) applyPassportStampState(entry, other, false);
            applyPassportStampState(entry, stampEntry, next);
        };
        stamp.addEventListener('click', toggleStamp, false);
        stamp.addEventListener('keydown', toggleStamp, false);
        stamp.setAttribute(PASSPORT_DOCUMENT_TRIGGER_RESCUE_ATTR, 'true');
        applyPassportStampState(entry, stampEntry, false);
    }

    preparePseudoTrigger(candidate.cover);
    const open = event => {
        if (event?.type === 'keydown') {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
        } else event?.preventDefault?.();
        applyPassportDocumentOpenState(entry, true);
        for (const delay of [0, 80, 260, 650]) setTimeout(() => root.isConnected && applyPassportDocumentOpenState(entry, entry.active), delay);
    };
    candidate.cover.addEventListener('click', open, false);
    candidate.cover.addEventListener('keydown', open, false);
    candidate.cover.setAttribute(PASSPORT_DOCUMENT_TRIGGER_RESCUE_ATTR, 'true');

    if (candidate.close) {
        preparePseudoTrigger(candidate.close);
        const close = event => {
            if (event?.type === 'keydown') {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
            } else event?.preventDefault?.();
            event?.stopPropagation?.();
            applyPassportDocumentOpenState(entry, false);
        };
        candidate.close.addEventListener('click', close, false);
        candidate.close.addEventListener('keydown', close, false);
        candidate.close.setAttribute(PASSPORT_DOCUMENT_TRIGGER_RESCUE_ATTR, 'true');
    }

    state.entries.push(entry);
    root.setAttribute(PASSPORT_DOCUMENT_RESCUE_ATTR, String(state.entries.length));
    applyPassportDocumentOpenState(entry, entry.active);
    return 1 + entry.stampEntries.length;
}

function stripSafeJavaScriptComments(sourceText) {
    const source = String(sourceText || '');
    let output = '';
    let quote = '';
    let escaped = false;
    let lineComment = false;
    let blockComment = false;

    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        const next = source[index + 1] || '';
        if (lineComment) {
            if (char === '\n' || char === '\r') {
                lineComment = false;
                output += char;
            } else output += ' ';
            continue;
        }
        if (blockComment) {
            if (char === '*' && next === '/') {
                blockComment = false;
                output += '  ';
                index += 1;
            } else output += char === '\n' || char === '\r' ? char : ' ';
            continue;
        }
        if (quote) {
            output += char;
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '"' || char === "'" || char === '`') {
            quote = char;
            output += char;
            continue;
        }
        if (char === '/' && next === '/') {
            lineComment = true;
            output += '  ';
            index += 1;
            continue;
        }
        if (char === '/' && next === '*') {
            blockComment = true;
            output += '  ';
            index += 1;
            continue;
        }
        output += char;
    }
    return output;
}

function findSafeJavaScriptClosingBrace(sourceText, openIndex) {
    const source = String(sourceText || '');
    if (source[openIndex] !== '{') return -1;
    let depth = 0;
    let quote = '';
    let escaped = false;
    let lineComment = false;
    let blockComment = false;

    for (let index = openIndex; index < source.length; index += 1) {
        const char = source[index];
        const next = source[index + 1] || '';
        if (lineComment) {
            if (char === '\n' || char === '\r') lineComment = false;
            continue;
        }
        if (blockComment) {
            if (char === '*' && next === '/') {
                blockComment = false;
                index += 1;
            }
            continue;
        }
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '"' || char === "'" || char === '`') {
            quote = char;
            continue;
        }
        if (char === '/' && next === '/') {
            lineComment = true;
            index += 1;
            continue;
        }
        if (char === '/' && next === '*') {
            blockComment = true;
            index += 1;
            continue;
        }
        if (char === '{') depth += 1;
        else if (char === '}') {
            depth -= 1;
            if (depth === 0) return index;
            if (depth < 0) return -1;
        }
    }
    return -1;
}

function extractSafeNamedFunctionBody(rawRoot, functionName) {
    const name = String(functionName || '').trim();
    if (!rawRoot?.querySelectorAll || !/^[a-zA-Z_$][\w$]*$/.test(name)) return '';
    const headerRe = new RegExp(`function\\s+${escapeRegExp(name)}\\s*\\(\\s*\\)\\s*\\{`, 'g');
    for (const script of rawRoot.querySelectorAll('script')) {
        const source = String(script.textContent || '');
        headerRe.lastIndex = 0;
        const match = headerRe.exec(source);
        if (!match) continue;
        const openIndex = source.indexOf('{', match.index + match[0].length - 1);
        const closeIndex = findSafeJavaScriptClosingBrace(source, openIndex);
        if (openIndex >= 0 && closeIndex > openIndex) return source.slice(openIndex + 1, closeIndex);
    }
    return '';
}

function resolveRenderedClassName(target, rawClassName, root) {
    const rawName = String(rawClassName || '').trim();
    if (!target?.classList || !/^[a-zA-Z_][\w-]*$/.test(rawName)) return '';
    if (target.classList.contains(rawName)) return rawName;
    const prefix = inferRenderedClassPrefix(target, [rawName], root);
    return `${prefix || ''}${rawName}`;
}

function parseSafeNamedFunctionClassBranch(branchText, variableTargets, root) {
    const source = String(branchText || '');
    const actions = [];
    const actionRe = /([a-zA-Z_$][\w$]*)\s*\.\s*classList\s*\.\s*(add|remove)\s*\(\s*(['"])([a-zA-Z_][\w-]*)\3\s*\)\s*;?/g;
    let cursor = 0;
    let match;
    while ((match = actionRe.exec(source))) {
        if (source.slice(cursor, match.index).trim()) return null;
        const target = variableTargets.get(match[1]);
        const className = resolveRenderedClassName(target, match[4], root);
        if (!target || !className) return null;
        actions.push({ target, operation: match[2], className });
        cursor = match.index + match[0].length;
    }
    if (source.slice(cursor).trim() || !actions.length) return null;
    return actions;
}

function parseSafeNamedFunctionClassProgram(rawRoot, renderedRoot, functionName) {
    const rawBody = extractSafeNamedFunctionBody(rawRoot, functionName);
    if (!rawBody) return null;
    let source = stripSafeJavaScriptComments(rawBody);
    const variableTargets = new Map();
    const declarationRe = /\b(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*document\s*\.\s*getElementById\s*\(\s*(['"])([a-zA-Z_][\w:.-]*)\2\s*\)\s*;?/g;
    source = source.replace(declarationRe, (whole, variableName, quote, rawId) => {
        const target = resolveScopedPseudoId(renderedRoot, rawId);
        if (target) variableTargets.set(variableName, target);
        return ' '.repeat(whole.length);
    });
    if (!variableTargets.size) return null;

    const conditionRe = /if\s*\(\s*([a-zA-Z_$][\w$]*)\s*\.\s*classList\s*\.\s*contains\s*\(\s*(['"])([a-zA-Z_][\w-]*)\2\s*\)\s*\)\s*\{/g;
    const conditionMatch = conditionRe.exec(source);
    if (!conditionMatch || source.slice(0, conditionMatch.index).trim()) return null;
    const conditionTarget = variableTargets.get(conditionMatch[1]);
    const conditionClassName = resolveRenderedClassName(conditionTarget, conditionMatch[3], renderedRoot);
    if (!conditionTarget || !conditionClassName) return null;

    const trueOpen = source.indexOf('{', conditionMatch.index + conditionMatch[0].length - 1);
    const trueClose = findSafeJavaScriptClosingBrace(source, trueOpen);
    if (trueClose < 0) return null;
    const afterTrue = source.slice(trueClose + 1);
    const elseMatch = /^\s*else\s*\{/.exec(afterTrue);
    if (!elseMatch) return null;
    const falseOpen = trueClose + 1 + elseMatch[0].lastIndexOf('{');
    const falseClose = findSafeJavaScriptClosingBrace(source, falseOpen);
    if (falseClose < 0 || source.slice(falseClose + 1).trim()) return null;

    const whenActive = parseSafeNamedFunctionClassBranch(source.slice(trueOpen + 1, trueClose), variableTargets, renderedRoot);
    const whenInactive = parseSafeNamedFunctionClassBranch(source.slice(falseOpen + 1, falseClose), variableTargets, renderedRoot);
    if (!whenActive?.length || !whenInactive?.length) return null;
    return {
        functionName,
        conditionTarget,
        conditionClassName,
        whenActive,
        whenInactive,
        triggers: new Set(),
    };
}

function applySafeNamedFunctionClassProgram(program) {
    if (!program?.conditionTarget?.classList) return;
    const wasActive = program.conditionTarget.classList.contains(program.conditionClassName);
    const actions = wasActive ? program.whenActive : program.whenInactive;
    for (const action of actions || []) {
        if (!action?.target?.classList) continue;
        action.target.classList[action.operation](action.className);
    }
    const isActive = program.conditionTarget.classList.contains(program.conditionClassName);
    for (const trigger of program.triggers || []) {
        trigger?.setAttribute?.('aria-pressed', isActive ? 'true' : 'false');
    }
}

function installRawMessageNamedFunctionClassRescue(root) {
    if (!root?.querySelectorAll) return 0;
    const rawMessage = getRawAssistantMessageForRenderedRoot(root);
    const rawRoot = chooseMatchingRawRabbitMirrorRoot(rawMessage, root);
    if (!rawRoot?.querySelectorAll) return 0;

    const programs = new Map();
    let installed = 0;
    for (const rawTrigger of rawRoot.querySelectorAll('[onclick]')) {
        const callMatch = /^\s*([a-zA-Z_$][\w$]*)\s*\(\s*\)\s*;?\s*$/.exec(String(rawTrigger.getAttribute('onclick') || ''));
        if (!callMatch) continue;
        const renderedTrigger = resolveRenderedCounterpart(rawRoot, root, rawTrigger, '*');
        if (!renderedTrigger || renderedTrigger.hasAttribute(RAW_NAMED_FUNCTION_RESCUE_ATTR)) continue;

        let program = programs.get(callMatch[1]);
        if (!program) {
            program = parseSafeNamedFunctionClassProgram(rawRoot, root, callMatch[1]);
            if (!program) continue;
            programs.set(callMatch[1], program);
        }

        preparePseudoTrigger(renderedTrigger);
        const activate = event => {
            if (event?.type === 'click' && shouldIgnorePseudoToggleEvent(event, renderedTrigger)) return;
            if (event?.type === 'keydown') {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
            }
            event?.preventDefault?.();
            applySafeNamedFunctionClassProgram(program);
        };
        renderedTrigger.addEventListener('click', activate, false);
        renderedTrigger.addEventListener('keydown', activate, false);
        renderedTrigger.setAttribute(RAW_NAMED_FUNCTION_RESCUE_ATTR, callMatch[1]);
        renderedTrigger.setAttribute(DIRECT_ID_CLICK_RESCUE_ATTR, 'true');
        renderedTrigger.setAttribute(DIRECT_ID_CLASS_STATE_RESCUE_ATTR, 'true');
        program.triggers.add(renderedTrigger);
        installed += 1;
    }
    return installed;
}

function installRawMessageCheckedChangeProgramRescue(root) {
    if (!root?.querySelectorAll) return 0;
    const rawMessage = getRawAssistantMessageForRenderedRoot(root);
    const rawRoot = chooseMatchingRawRabbitMirrorRoot(rawMessage, root);
    if (!rawRoot?.querySelectorAll) return 0;

    let installed = 0;
    for (const rawInput of rawRoot.querySelectorAll('input[type="checkbox"][onchange], input[type="radio"][onchange]')) {
        const renderedInput = resolveRenderedCounterpart(rawRoot, root, rawInput, 'input[type="checkbox"], input[type="radio"]');
        if (!renderedInput?.matches?.('input[type="checkbox"], input[type="radio"]')) continue;
        if (renderedInput.hasAttribute(CHANGE_PSEUDO_RESCUE_ATTR)) continue;

        const source = rawInput.getAttribute('onchange') || '';
        const states = parseCheckedChangeStyleProgramFromSource(renderedInput, root, source);
        if (!states?.length) continue;
        if (bindCheckedChangeProgram(renderedInput, states)) installed += 1;
    }
    return installed;
}

function installInlineEventPseudoInteractionRescue(root) {
    if (!root?.querySelectorAll) return;
    const candidates = [...root.querySelectorAll('[onmouseover], [onmouseenter], [onmouseout], [onmouseleave], [onclick]')];

    for (const target of candidates) {
        if (target.hasAttribute(INLINE_PSEUDO_RESCUE_ATTR)) continue;
        const hoverOn = collectInlineAssignments(target, ['onmouseover', 'onmouseenter']);
        const hoverOff = collectInlineAssignments(target, ['onmouseout', 'onmouseleave']);
        const clickOn = collectInlineAssignments(target, ['onclick']);
        const activeAssignments = hoverOn.length ? hoverOn : clickOn;
        if (!activeAssignments.length) continue;

        const properties = new Set([...activeAssignments, ...hoverOff].map(item => item.property));
        const originalStyles = capturePseudoStyleState(target, properties);
        const trigger = isPseudoTriggerUsable(target) ? target : target.parentElement;
        if (!trigger || !root.contains(trigger)) continue;

        const state = {
            target,
            trigger,
            active: false,
            activeAssignments,
            inactiveAssignments: hoverOff,
            originalStyles,
        };
        pseudoInteractionStates.set(target, state);
        bindPseudoToggle(trigger, state);

        // 桌面鼠标继续保留原本的进入/离开语义；触屏则通过点击切换。
        if (hoverOn.length) {
            trigger.addEventListener('pointerenter', event => {
                if (event.pointerType === 'mouse') setPseudoInteractionState(state, true);
            }, false);
            trigger.addEventListener('pointerleave', event => {
                if (event.pointerType === 'mouse') setPseudoInteractionState(state, false);
            }, false);
        }

        // 识别成功后移除对应内联事件，避免 CSP 报错或浏览器与急救器双重执行。
        for (const attributeName of ['onmouseover', 'onmouseenter', 'onmouseout', 'onmouseleave', 'onclick']) {
            const eventCode = target.getAttribute(attributeName);
            if (parseInlineStyleAssignments(eventCode).length) target.removeAttribute(attributeName);
        }
        target.setAttribute(INLINE_PSEUDO_RESCUE_ATTR, 'true');
    }
}

function installHintedHiddenLayerRescue(root) {
    for (const { host, target } of findHintedHiddenLayerPairs(root)) {
        if (target.hasAttribute(HINTED_PSEUDO_RESCUE_ATTR)) continue;
        const properties = new Set(['opacity', 'visibility', 'pointer-events']);
        const originalStyles = capturePseudoStyleState(target, properties);
        const activeAssignments = [
            { property: 'opacity', value: '1' },
            { property: 'visibility', value: 'visible' },
            { property: 'pointer-events', value: 'auto' },
        ];
        const state = {
            target,
            trigger: host,
            active: false,
            activeAssignments,
            inactiveAssignments: [],
            originalStyles,
        };
        pseudoInteractionStates.set(target, state);
        bindPseudoToggle(host, state);
        target.setAttribute(HINTED_PSEUDO_RESCUE_ATTR, 'true');
    }
}

function installPseudoInteractionRescue(root) {
    installCheckedChangePseudoInteractionRescue(root);
    installDirectIdClickProgramRescue(root);
    installInlineEventPseudoInteractionRescue(root);
    // 某些宿主会在渲染前移除 onmouseover/onclick。此路径只在“悬停/点击提示 + 隐藏全覆盖层”同时存在时启用。
    installHintedHiddenLayerRescue(root);
}

function detectInteractionCapabilities(root) {
    if (!root?.querySelectorAll) return { checked: false, hover: false, details: false, target: false, pseudo: false, listDetail: false, maskReveal: false, stateSibling: false, buttonAdjacent: false, clickableAdjacent: false, clickablePopup: false, containerReveal: false, selfMutation: false, detachedCheckedHas: false, selectionFallback: false, disabledChoiceFallback: false, actionFallback: false, staticChoiceSelection: false, structuredStaticDisclosure: false, fillInChoice: false, reversibleChecked: false };
    const cssText = getRabbitMirrorLocalStyleElements(root).map(style => style.textContent || '').join('\n');
    const outerDetails = root.matches?.('details') ? root : root.querySelector(':scope > details');
    const nestedDetails = [...root.querySelectorAll('details')].filter(item => item !== outerDetails);
    const capabilities = {
        checked: !!root.querySelector('input[type="checkbox"], input[type="radio"]') || /:checked\b/i.test(cssText),
        hover: /:hover\b/i.test(cssText),
        details: nestedDetails.length > 0,
        target: /:target\b/i.test(cssText) || !!root.querySelector('a[href^="#"]'),
        pseudo: hasPseudoInteractionCandidates(root),
        listDetail: hasRenderedListDetailCandidates(root),
        maskReveal: hasRenderedMaskRevealCandidates(root),
        stateSibling: hasRenderedCssStateSiblingCandidates(root),
        buttonAdjacent: hasRenderedButtonAdjacentHiddenCandidates(root),
        clickableAdjacent: hasRenderedClickableAdjacentHiddenCandidates(root),
        clickablePopup: hasRenderedClickableAdjacentPopupCandidates(root),
        containerReveal: hasRenderedContainerInternalRevealCandidates(root),
        selfMutation: (rawSelfMutationRescueStates.get(root)?.entries?.size || 0) > 0,
        detachedCheckedHas: Number.parseInt(root.getAttribute?.(DETACHED_CHECKED_HAS_RULE_COUNT_ATTR) || '0', 10) > 0,
        selectionFallback: !!root.querySelector(`[${SELECTION_ONLY_FALLBACK_ATTR}]`),
        disabledChoiceFallback: !!root.querySelector(`[${DISABLED_ONLY_CHOICE_RESCUE_ATTR}]`),
        actionFallback: !!root.querySelector(`[${INERT_ACTION_BUTTON_RESCUE_ATTR}]`),
        staticChoiceSelection: Number.parseInt(root.getAttribute?.(STATIC_CHOICE_SELECTION_COUNT_ATTR) || '0', 10) > 0,
        structuredStaticDisclosure: Number.parseInt(root.getAttribute?.(STRUCTURED_STATIC_DISCLOSURE_COUNT_ATTR) || '0', 10) > 0,
        fillInChoice: Number.parseInt(root.getAttribute?.(FILL_IN_CHOICE_COUNT_ATTR) || '0', 10) > 0,
        passportDocument: (passportDocumentRescueStates.get(root)?.entries?.length || 0) > 0,
        reversibleChecked: Number.parseInt(root.getAttribute?.(REVERSIBLE_CHECKED_RESULT_ROOT_ATTR) || '0', 10) > 0,
    };
    interactionCapabilityStates.set(root, capabilities);
    root.dataset.rabbitMirrorInteractionRoutes = Object.entries(capabilities)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name)
        .join(',') || 'none';
    return capabilities;
}

function collectTargetRulesFromCss(cssText) {
    const rules = [];
    const blockRe = /([^{}]+)\{([^{}]*)\}/g;
    let match;
    while ((match = blockRe.exec(String(cssText || '')))) {
        const selectorText = String(match[1] || '').trim();
        if (!selectorText || selectorText.startsWith('@') || !/:target\b/i.test(selectorText)) continue;
        const declarations = addImportantToDeclarationBlock(String(match[2] || ''));
        if (!declarations.trim()) continue;
        const selectors = selectorText.split(',')
            .map(value => value.trim())
            .filter(Boolean)
            .map(selector => selector.replace(/:target\b/gi, `[${TARGET_ACTIVE_ATTR}="true"]`));
        if (selectors.length) rules.push(`${selectors.join(', ')} {${declarations}}`);
    }
    return rules.join('\n');
}

function refreshTargetRescue(root) {
    if (!root?.querySelectorAll) return;
    let combinedCss = '';
    getRabbitMirrorLocalStyleElements(root).filter(styleEl => !styleEl.hasAttribute(TARGET_RESCUE_STYLE_ATTR)).forEach(styleEl => {
        const parsed = collectTargetRulesFromCss(styleEl.textContent || '');
        if (parsed) combinedCss += `${parsed}\n`;
    });
    let rescueStyle = root.querySelector(`style[${TARGET_RESCUE_STYLE_ATTR}]`);
    if (combinedCss.trim()) {
        if (!rescueStyle) {
            rescueStyle = document.createElement('style');
            rescueStyle.setAttribute(TARGET_RESCUE_STYLE_ATTR, 'true');
            root.appendChild(rescueStyle);
        }
        const nextCss = combinedCss.trim();
        if (rescueStyle.textContent !== nextCss) rescueStyle.textContent = nextCss;
    } else if (rescueStyle) {
        rescueStyle.remove();
    }

    if (root.dataset.rabbitMirrorTargetFallback === 'true') return;
    root.addEventListener('click', event => {
        const anchor = event.target?.closest?.('a[href^="#"]');
        if (!anchor || !root.contains(anchor)) return;
        const rawId = String(anchor.getAttribute('href') || '').slice(1);
        if (!rawId) return;
        let target = null;
        try {
            target = [...root.querySelectorAll('[id]')].find(el => el.id === decodeURIComponent(rawId));
        } catch {
            target = [...root.querySelectorAll('[id]')].find(el => el.id === rawId);
        }
        if (!target) return;
        event.preventDefault();
        root.querySelectorAll(`[${TARGET_ACTIVE_ATTR}="true"]`).forEach(el => {
            if (el !== target) el.removeAttribute(TARGET_ACTIVE_ATTR);
        });
        const active = target.getAttribute(TARGET_ACTIVE_ATTR) === 'true';
        if (active) target.removeAttribute(TARGET_ACTIVE_ATTR);
        else target.setAttribute(TARGET_ACTIVE_ATTR, 'true');
    }, true);
    root.dataset.rabbitMirrorTargetFallback = 'true';
}

function installNestedDetailsFallback(root) {
    if (!root?.querySelectorAll || root.dataset.rabbitMirrorDetailsFallback === 'true') return;
    const outerDetails = root.matches?.('details') ? root : root.querySelector(':scope > details');
    root.addEventListener('click', event => {
        const summary = event.target?.closest?.('summary');
        const details = summary?.parentElement;
        if (!summary || !details || details.tagName !== 'DETAILS' || details === outerDetails || !root.contains(details)) return;
        // 仅当宿主没有在本次点击中改变 open 状态时才兜底，避免双重切换。
        const before = details.open;
        setTimeout(() => {
            if (details.isConnected && details.open === before) details.open = !before;
        }, 0);
    }, true);
    root.dataset.rabbitMirrorDetailsFallback = 'true';
}

function directReadableDetailsChildren(details, summary) {
    return [...(details?.children || [])].filter(child => {
        if (child === summary) return false;
        const tag = String(child.tagName || '').toLowerCase();
        if (['style', 'script', 'template', 'noscript'].includes(tag)) return false;
        return String(child.textContent || '').replace(/\s+/g, ' ').trim().length > 0;
    });
}

function isFullHeightNestedDetailsCandidate(details, summary) {
    if (!details || !summary || details.parentElement == null) return false;
    const contentChildren = directReadableDetailsChildren(details, summary);
    if (!contentChildren.length) return false;

    const parent = details.parentElement;
    let parentStyle = null;
    let detailsStyle = null;
    let summaryStyle = null;
    try {
        parentStyle = globalThis.getComputedStyle?.(parent) || null;
        detailsStyle = globalThis.getComputedStyle?.(details) || null;
        summaryStyle = globalThis.getComputedStyle?.(summary) || null;
    } catch {
        // Inline declarations below are enough for a conservative fallback.
    }

    const parentOverflow = `${parent.style?.overflow || ''} ${parentStyle?.overflow || ''} ${parentStyle?.overflowY || ''}`.toLowerCase();
    const clippedParent = /hidden|clip/.test(parentOverflow);
    if (!clippedParent) return false;

    const summaryInlineHeight = String(summary.style?.height || '').trim().toLowerCase();
    const detailsInlineHeight = String(details.style?.height || '').trim().toLowerCase();
    const summaryComputedHeight = String(summaryStyle?.height || '').trim().toLowerCase();
    const detailsComputedHeight = String(detailsStyle?.height || '').trim().toLowerCase();
    const summaryExplicitFull = summaryInlineHeight === '100%' || summaryComputedHeight === '100%';
    const detailsExplicitFull = detailsInlineHeight === '100%' || detailsComputedHeight === '100%';

    let geometryFull = false;
    try {
        const parentRect = parent.getBoundingClientRect?.();
        const summaryRect = summary.getBoundingClientRect?.();
        if (parentRect?.height > 24 && summaryRect?.height > 0) {
            geometryFull = summaryRect.height >= parentRect.height * 0.72;
        }
    } catch {
        // ignore geometry failures in older WebViews
    }

    const fullOverlayContent = contentChildren.some(child => {
        const inline = String(child.getAttribute?.('style') || '').toLowerCase();
        let childStyle = null;
        try { childStyle = globalThis.getComputedStyle?.(child) || null; } catch {}
        const position = String(child.style?.position || childStyle?.position || '').toLowerCase();
        if (!/^(?:absolute|fixed)$/.test(position)) return false;
        const top = String(child.style?.top || childStyle?.top || '').trim().toLowerCase();
        const left = String(child.style?.left || childStyle?.left || '').trim().toLowerCase();
        const width = String(child.style?.width || childStyle?.width || '').trim().toLowerCase();
        const height = String(child.style?.height || childStyle?.height || '').trim().toLowerCase();
        const insetZero = /(?:^|;)\s*inset\s*:\s*0(?:px)?(?:\s*;|$)/.test(inline);
        const anchoredTopLeft = /^(?:0|0px)$/.test(top) && /^(?:0|0px)$/.test(left);
        const fillsWidth = width === '100%' || /(?:^|;)\s*(?:right\s*:\s*0(?:px)?|width\s*:\s*100%)\s*(?:;|$)/.test(inline);
        const fillsHeight = height === '100%' || /(?:^|;)\s*(?:bottom\s*:\s*0(?:px)?|height\s*:\s*100%)\s*(?:;|$)/.test(inline);
        return insetZero || (anchoredTopLeft && fillsWidth && fillsHeight);
    });

    return summaryExplicitFull || detailsExplicitFull || geometryFull || fullOverlayContent;
}

function ensureNestedDetailsReplacementStyle(root) {
    if (!root?.querySelector) return null;
    let style = root.querySelector(`style[${NESTED_DETAILS_REPLACEMENT_STYLE_ATTR}]`);
    if (!style) {
        style = document.createElement('style');
        style.setAttribute(NESTED_DETAILS_REPLACEMENT_STYLE_ATTR, 'true');
        root.appendChild(style);
    }
    style.textContent = `
[${NESTED_DETAILS_REPLACEMENT_HOST_ATTR}="true"] {
  height: auto !important;
  min-height: var(--rm-nested-details-original-height, 0px) !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}
[${NESTED_DETAILS_REPLACEMENT_ATTR}="true"] {
  width: 100% !important;
  height: auto !important;
  min-height: 100% !important;
  box-sizing: border-box !important;
}
[${NESTED_DETAILS_REPLACEMENT_ATTR}="true"][open] {
  overflow: auto !important;
  overscroll-behavior: contain !important;
}
[${NESTED_DETAILS_REPLACEMENT_ATTR}="true"][open] > summary {
  display: none !important;
  height: auto !important;
  min-height: 0 !important;
}
[${NESTED_DETAILS_REPLACEMENT_ATTR}="true"][open] > :not(summary):not(style):not(script):not(template) {
  width: 100% !important;
  min-height: 100% !important;
  box-sizing: border-box !important;
}
`;
    return style;
}

function installNestedDetailsReplacementContainment(root) {
    if (!root?.querySelectorAll) return 0;
    const outerDetails = root.matches?.('details') ? root : root.querySelector(':scope > details');
    let patched = 0;
    for (const details of root.querySelectorAll('details')) {
        if (details === outerDetails) continue;
        const summary = details.querySelector?.(':scope > summary');
        if (!summary || !isFullHeightNestedDetailsCandidate(details, summary)) continue;
        if (details.getAttribute(NESTED_DETAILS_REPLACEMENT_ATTR) !== 'true') {
            details.setAttribute(NESTED_DETAILS_REPLACEMENT_ATTR, 'true');
            const host = details.parentElement;
            if (host) {
                let originalHeight = 0;
                try { originalHeight = Math.round(host.getBoundingClientRect?.().height || 0); } catch {}
                if (originalHeight > 0) host.style.setProperty('--rm-nested-details-original-height', `${originalHeight}px`);
                host.setAttribute(NESTED_DETAILS_REPLACEMENT_HOST_ATTR, 'true');
            }
            patched += 1;
        }
        if (details.getAttribute(NESTED_DETAILS_REPLACEMENT_BOUND_ATTR) === 'true') continue;
        const contentChildren = directReadableDetailsChildren(details, summary);
        for (const child of contentChildren) {
            child.addEventListener('click', event => {
                if (!details.open) return;
                const interactive = event.target?.closest?.('a, button, input, label, select, textarea, summary, [role="button"], [contenteditable="true"]');
                if (interactive && interactive !== child) return;
                details.open = false;
            }, false);
            child.addEventListener('keydown', event => {
                if (!details.open || (event.key !== 'Enter' && event.key !== ' ')) return;
                event.preventDefault();
                details.open = false;
            }, false);
            if (!child.hasAttribute('tabindex')) child.setAttribute('tabindex', '0');
            if (!child.hasAttribute('role')) child.setAttribute('role', 'button');
            if (!child.getAttribute('aria-label')) child.setAttribute('aria-label', '轻触返回上一面');
        }
        details.setAttribute(NESTED_DETAILS_REPLACEMENT_BOUND_ATTR, 'true');
    }
    if (patched || root.querySelector?.(`[${NESTED_DETAILS_REPLACEMENT_ATTR}="true"]`)) {
        ensureNestedDetailsReplacementStyle(root);
        root.dataset.rabbitMirrorNestedDetailsReplacement = String(root.querySelectorAll(`[${NESTED_DETAILS_REPLACEMENT_ATTR}="true"]`).length);
    }
    return patched;
}

function findNestedDetailsPopupClippingAncestor(element, root) {
    let current = element?.parentElement || null;
    for (let depth = 0; current && depth < 10; depth += 1, current = current.parentElement) {
        const style = maintenanceSafeComputedStyle(current);
        const overflow = `${style?.overflow || ''} ${style?.overflowX || ''} ${style?.overflowY || ''}`.toLowerCase();
        if (/(?:hidden|clip)/.test(overflow)) return current;
        if (current === root) break;
    }
    return null;
}

function nestedDetailsPopupOffsetLikelyOutside(content) {
    const top = String(content?.style?.top || '').trim().toLowerCase();
    if (/^(?:10[1-9]|1[1-9]\d|[2-9]\d{2,})(?:\.\d+)?%$/.test(top)) return true;
    const bottom = String(content?.style?.bottom || '').trim().toLowerCase();
    if (/^-(?:\d+(?:\.\d+)?)(?:px|rem|em|%)$/.test(bottom)) return true;
    return false;
}

function findNestedDetailsPopupClippingCandidates(root) {
    if (!root?.querySelectorAll) return [];
    const outerDetails = root.matches?.('details') ? root : root.querySelector(':scope > details');
    const candidates = [];
    const seen = new Set();

    for (const details of root.querySelectorAll('details')) {
        if (details === outerDetails || details.hasAttribute(NESTED_DETAILS_REPLACEMENT_ATTR)) continue;
        const summary = details.querySelector?.(':scope > summary');
        if (!summary) continue;
        for (const content of directReadableDetailsChildren(details, summary)) {
            if (seen.has(content)) continue;
            const text = String(content.textContent || '').replace(/\s+/g, ' ').trim();
            if (text.length < 2) continue;
            const style = maintenanceSafeComputedStyle(content);
            const position = String(style?.position || content.style?.position || '').toLowerCase();
            if (position !== 'absolute' && position !== 'fixed') continue;
            const clippingAncestor = findNestedDetailsPopupClippingAncestor(content, root);
            if (!clippingAncestor) continue;

            let outside = nestedDetailsPopupOffsetLikelyOutside(content);
            try {
                const contentRect = content.getBoundingClientRect?.();
                const clipRect = clippingAncestor.getBoundingClientRect?.();
                if (contentRect && clipRect) {
                    outside = outside
                        || contentRect.left < clipRect.left - 2
                        || contentRect.right > clipRect.right + 2
                        || contentRect.top < clipRect.top - 2
                        || contentRect.bottom > clipRect.bottom + 2;
                }
            } catch {
                // Inline top/left evidence above remains available in older WebViews.
            }
            if (!outside) continue;
            seen.add(content);
            candidates.push({ details, summary, content, clippingAncestor });
        }
    }
    return candidates;
}

function ensureNestedDetailsPopupRescueStyle(root) {
    if (!root?.querySelector) return null;
    let style = root.querySelector(`style[${NESTED_DETAILS_POPUP_STYLE_ATTR}]`);
    if (!style) {
        style = document.createElement('style');
        style.setAttribute(NESTED_DETAILS_POPUP_STYLE_ATTR, 'true');
        root.appendChild(style);
    }
    style.textContent = `
[${NESTED_DETAILS_POPUP_HOST_ATTR}="true"] {
  align-items: stretch !important;
  min-width: 0 !important;
}
[${NESTED_DETAILS_POPUP_RESCUE_ATTR}="true"] {
  min-width: 0 !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
}
[${NESTED_DETAILS_POPUP_RESCUE_ATTR}="true"][open] > [${NESTED_DETAILS_POPUP_CONTENT_ATTR}="true"] {
  position: relative !important;
  inset: auto !important;
  top: auto !important;
  right: auto !important;
  bottom: auto !important;
  left: auto !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  margin-top: 8px !important;
  box-sizing: border-box !important;
}
@media (max-width: 640px) {
  [${NESTED_DETAILS_POPUP_HOST_ATTR}="true"] {
    flex-direction: column !important;
    flex-wrap: nowrap !important;
    align-items: stretch !important;
  }
  [${NESTED_DETAILS_POPUP_RESCUE_ATTR}="true"] {
    width: 100% !important;
    flex: 1 1 auto !important;
  }
}
`;
    return style;
}

function repairNestedDetailsPopupClipping(root) {
    if (!root?.querySelectorAll) return 0;
    const candidates = findNestedDetailsPopupClippingCandidates(root);
    let repaired = 0;
    for (const { details, content } of candidates) {
        if (!details?.isConnected || !content?.isConnected) continue;
        details.setAttribute(NESTED_DETAILS_POPUP_RESCUE_ATTR, 'true');
        content.setAttribute(NESTED_DETAILS_POPUP_CONTENT_ATTR, 'true');
        details.parentElement?.setAttribute?.(NESTED_DETAILS_POPUP_HOST_ATTR, 'true');
        repaired += 1;
    }
    if (repaired > 0 || root.querySelector?.(`[${NESTED_DETAILS_POPUP_RESCUE_ATTR}="true"]`)) {
        ensureNestedDetailsPopupRescueStyle(root);
        root.setAttribute(
            NESTED_DETAILS_POPUP_COUNT_ATTR,
            String(root.querySelectorAll(`[${NESTED_DETAILS_POPUP_RESCUE_ATTR}="true"]`).length),
        );
    }
    return repaired;
}


function mobileInlineAnnotationMeaningfulText(element) {
    return String(element?.textContent || '').replace(/\s+/g, ' ').trim().length >= 12;
}

function mobileInlineAnnotationCheckedTargets(root, input) {
    const targets = new Set();
    for (const rule of parseCheckedRulesFromText(root, input)) {
        for (const target of maintenanceMobileLayoutResolveCheckedTargets(root, input, rule)) {
            if (target && target !== input) targets.add(target);
        }
    }
    return targets;
}

function findMobileInlineAnnotationCandidates(root) {
    if (!root?.querySelectorAll) return [];
    const viewportWidth = Math.max(0, Number(globalThis.innerWidth || globalThis.document?.documentElement?.clientWidth || 0));
    if (viewportWidth > MOBILE_LAYOUT_BREAKPOINT_PX + 40) return [];
    const result = [];
    const seen = new Set();

    for (const host of root.querySelectorAll('label')) {
        if (host.hasAttribute(MOBILE_INLINE_ANNOTATION_HOST_ATTR)) continue;
        const input = host.querySelector?.(':scope > input[type="checkbox"], :scope > input[type="radio"]');
        if (!input || input.disabled) continue;
        const hostStyle = maintenanceSafeComputedStyle(host);
        const hostDisplay = String(hostStyle?.display || '').toLowerCase();
        if (hostDisplay && !/^(?:inline|inline-block|inline-flex|inline-grid)$/.test(hostDisplay)) continue;

        const routedTargets = mobileInlineAnnotationCheckedTargets(root, input);
        if (!routedTargets.size) continue;
        const children = [...(host.children || [])];
        for (const content of children) {
            if (content === input || seen.has(content) || content.hasAttribute(MOBILE_INLINE_ANNOTATION_ORIGINAL_ATTR)) continue;
            if (!routedTargets.has(content) || !mobileInlineAnnotationMeaningfulText(content)) continue;
            const style = maintenanceSafeComputedStyle(content);
            const position = String(style?.position || content.style?.position || '').toLowerCase();
            if (position !== 'absolute' && position !== 'fixed') continue;
            const inlineStyle = String(content.getAttribute?.('style') || '').toLowerCase();
            const width = maintenanceMobileLayoutLengthPx(style?.width || content.style?.width, Number(root.clientWidth || 0));
            const fixedWidth = /(?:^|;)\s*(?:width|min-width)\s*:\s*\d+(?:\.\d+)?(?:px|rem|em|vw)\b/.test(inlineStyle) || width >= 140;
            const overflowAncestor = diagnosticFindClippingAncestor(content, root);
            if (!fixedWidth && !overflowAncestor) continue;
            seen.add(content);
            result.push({ host, input, content });
        }
    }
    return result;
}

function removeDuplicateIdsFromMobileAnnotationMirror(mirror) {
    if (!mirror?.querySelectorAll) return;
    if (mirror.id) mirror.removeAttribute('id');
    mirror.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
    mirror.querySelectorAll('input,button,select,textarea,a[href],label[for]').forEach(element => {
        element.removeAttribute?.('for');
        element.removeAttribute?.('href');
        element.setAttribute?.('tabindex', '-1');
        element.setAttribute?.('aria-hidden', 'true');
    });
}

function ensureMobileInlineAnnotationRescueStyle(root) {
    if (!root?.querySelector) return null;
    let style = root.querySelector(`style[${MOBILE_INLINE_ANNOTATION_STYLE_ATTR}]`);
    if (!style) {
        style = document.createElement('style');
        style.setAttribute(MOBILE_INLINE_ANNOTATION_STYLE_ATTR, 'true');
        root.appendChild(style);
    }
    style.textContent = `
[${MOBILE_INLINE_ANNOTATION_MIRROR_ATTR}="true"] { display: none !important; }
@media (max-width: ${MOBILE_LAYOUT_BREAKPOINT_PX}px) {
  [${MOBILE_INLINE_ANNOTATION_ORIGINAL_ATTR}="true"] { display: none !important; }
  [${MOBILE_INLINE_ANNOTATION_MIRROR_ATTR}="true"][${MOBILE_INLINE_ANNOTATION_VISIBLE_ATTR}="true"] {
    display: block !important;
    position: relative !important;
    inset: auto !important;
    top: auto !important;
    right: auto !important;
    bottom: auto !important;
    left: auto !important;
    float: none !important;
    clear: both !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    height: auto !important;
    max-height: none !important;
    box-sizing: border-box !important;
    margin: 8px 0 12px !important;
    white-space: normal !important;
    writing-mode: horizontal-tb !important;
    text-orientation: mixed !important;
    overflow: visible !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
    z-index: auto !important;
  }
}`;
    return style;
}

function refreshMobileInlineAnnotationRescue(root) {
    const state = mobileInlineAnnotationRescueStates.get(root);
    if (!state) return;
    for (const entry of state.entries || []) {
        if (!entry.input?.isConnected || !entry.mirror?.isConnected) continue;
        const visible = !!entry.input.checked;
        if (visible) entry.mirror.setAttribute(MOBILE_INLINE_ANNOTATION_VISIBLE_ATTR, 'true');
        else entry.mirror.removeAttribute(MOBILE_INLINE_ANNOTATION_VISIBLE_ATTR);
        entry.mirror.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
}

function installMobileInlineAnnotationRescue(root) {
    if (!root?.querySelectorAll || !root?.isConnected) return 0;
    let state = mobileInlineAnnotationRescueStates.get(root);
    if (!state) {
        state = {
            entries: [],
            onStateChange: () => setTimeout(() => refreshMobileInlineAnnotationRescue(root), 0),
        };
        root.addEventListener('input', state.onStateChange, false);
        root.addEventListener('change', state.onStateChange, false);
        mobileInlineAnnotationRescueStates.set(root, state);
    }

    let repaired = 0;
    for (const { host, input, content } of findMobileInlineAnnotationCandidates(root)) {
        if (!host?.isConnected || !input?.isConnected || !content?.isConnected) continue;
        mobileInlineAnnotationCounter += 1;
        const token = `rm-note-${mobileInlineAnnotationCounter.toString(36)}`;
        const mirror = content.cloneNode(true);
        removeDuplicateIdsFromMobileAnnotationMirror(mirror);
        mirror.setAttribute(MOBILE_INLINE_ANNOTATION_MIRROR_ATTR, 'true');
        mirror.setAttribute('data-rm-mobile-inline-annotation-token', token);
        mirror.setAttribute('aria-live', 'polite');
        mirror.setAttribute('aria-hidden', 'true');
        content.setAttribute(MOBILE_INLINE_ANNOTATION_ORIGINAL_ATTR, 'true');
        content.setAttribute('data-rm-mobile-inline-annotation-token', token);
        host.setAttribute(MOBILE_INLINE_ANNOTATION_HOST_ATTR, 'true');
        host.insertAdjacentElement('afterend', mirror);
        state.entries.push({ host, input, content, mirror, token });
        repaired += 1;
    }

    if (repaired > 0 || state.entries.some(entry => entry.mirror?.isConnected)) {
        ensureMobileInlineAnnotationRescueStyle(root);
        refreshMobileInlineAnnotationRescue(root);
        [80, 260, 650].forEach(delay => setTimeout(() => refreshMobileInlineAnnotationRescue(root), delay));
        root.setAttribute(MOBILE_INLINE_ANNOTATION_RESCUE_ATTR, 'true');
        root.setAttribute(
            MOBILE_INLINE_ANNOTATION_COUNT_ATTR,
            String(state.entries.filter(entry => entry.mirror?.isConnected).length),
        );
    }
    return repaired;
}

function repairMarkdownEmphasisInsideCssComments(cssText) {
    let changed = false;
    const repaired = String(cssText || '').replace(
        /\/\*([\s\S]*?)<(em|i)>\s*\/([\s\S]*?)\/\s*<\/\2>([\s\S]*?)\*\//gi,
        (full, before, tagName, rules, after) => {
            if (!/[{}]/.test(rules) || !/[.#:@\[]/.test(rules)) return full;
            changed = true;
            return `/*${before}*/${rules}/*${after}*/`;
        },
    );
    return { changed, repaired };
}

function repairMarkdownCorruptedCssComments(root) {
    if (!root?.querySelectorAll) return 0;
    let repairedCount = 0;
    for (const style of getRabbitMirrorLocalStyleElements(root)) {
        const current = String(style.textContent || '');
        if (!/<(?:em|i)>\s*\//i.test(current) || !/\/\s*<\/(?:em|i)>/i.test(current)) continue;
        const result = repairMarkdownEmphasisInsideCssComments(current);
        if (!result.changed || result.repaired === current) continue;
        style.textContent = result.repaired;
        style.setAttribute(MARKDOWN_CSS_COMMENT_RESCUE_ATTR, 'true');
        repairedCount += 1;
    }
    if (repairedCount) root.dataset.rabbitMirrorMarkdownCssCommentRescue = String(repairedCount);
    return repairedCount;
}


function applyCheckedVisualFallback(root, input) {
    const renderedRoute = getRenderedInputRoute(input);
    if (renderedRoute) {
        restoreInteractionInlineOverrides(input);
        return;
    }
    const textRuleCount = applyCheckedRuleTextFallback(root, input);
    if (!textRuleCount) applyCheckedRuleInlineFallback(root, input);
}

function checkedStyleMapHidesTrigger(styleMap) {
    for (const [rawProperty, rawValue] of styleMap || []) {
        const property = String(rawProperty || '').trim().toLowerCase();
        const value = String(rawValue || '').trim().toLowerCase().replace(/\s*!important\s*$/i, '');
        if (property === 'display' && value === 'none') return true;
        if (property === 'visibility' && /^(?:hidden|collapse)$/.test(value)) return true;
        if (property === 'pointer-events' && value === 'none') return true;
        if (property === 'opacity') {
            const opacity = Number.parseFloat(value);
            if (Number.isFinite(opacity) && opacity <= 0.05) return true;
        }
        if (/^(?:width|height|max-width|max-height)$/.test(property) && isCollapsedDimensionValue(value)) return true;
        if (property === 'clip-path' && /^(?:inset\(\s*(?:50%|100%))/i.test(value)) return true;
        if (property === 'transform' && /scale(?:x|y|3d)?\(\s*0(?:\s*[,)]|\))/i.test(value)) return true;
    }
    return false;
}

function checkedStyleMapRevealsResult(root, target, styleMap) {
    if (!checkedTargetCarriesResultContent(target)) return false;
    return (styleMap || []).some(([property, value]) => (
        checkedDeclarationCreatesContentReveal(root, target, property, value)
    ));
}

function associatedLabelsForInput(root, input) {
    if (!root?.querySelectorAll || !input) return [];
    const labels = new Set();
    input.closest?.('label') && labels.add(input.closest('label'));
    for (const label of [...(input.labels || [])]) {
        if (root.contains?.(label)) labels.add(label);
    }
    const id = String(input.id || '');
    if (id) {
        for (const label of root.querySelectorAll('label[for]')) {
            if (String(label.getAttribute('for') || '') === id) labels.add(label);
        }
    }
    return [...labels];
}

function inputHasVisibleNativeToggle(input) {
    if (!input) return false;
    const snapshot = getRenderedStyleSnapshot(input);
    let rect = null;
    try {
        rect = input.getBoundingClientRect?.();
    } catch {
        rect = null;
    }
    const width = Number(rect?.width || 0);
    const height = Number(rect?.height || 0);
    return !snapshot.hidden && width >= 8 && height >= 8;
}

function targetAlreadyProvidesCheckedReturn(target, input) {
    if (!target || !input) return true;
    if (target.matches?.(EXISTING_INTERACTIVE_SELECTOR)) return true;
    const wrappingLabel = target.closest?.('label');
    if (wrappingLabel) {
        const forId = String(wrappingLabel.getAttribute('for') || '');
        if ((forId && forId === String(input.id || '')) || wrappingLabel.contains?.(input)) return true;
    }
    for (const label of target.querySelectorAll?.('label[for]') || []) {
        if (String(label.getAttribute('for') || '') === String(input.id || '')) return true;
    }
    return false;
}

function findOneWayCheckedResultCandidates(root) {
    if (!root?.querySelectorAll) return [];
    const candidates = [];
    const seen = new Set();

    for (const input of root.querySelectorAll('input[type="checkbox"]')) {
        if (input.disabled || inputHasVisibleNativeToggle(input)) continue;
        const labels = associatedLabelsForInput(root, input);
        if (!labels.length) continue;

        const hiddenLabels = new Set();
        const revealedTargets = new Set();
        for (const rule of parseCheckedRulesFromText(root, input)) {
            if (rule.pseudoElement) continue;
            const targets = resolveTargetsForCheckedRule(root, input, rule);
            for (const target of targets) {
                if (checkedStyleMapHidesTrigger(rule.styleMap)) {
                    for (const label of labels) {
                        if (target === label || target.contains?.(label)) hiddenLabels.add(label);
                    }
                }
                if (checkedStyleMapRevealsResult(root, target, rule.styleMap)) revealedTargets.add(target);
            }
        }
        if (hiddenLabels.size !== labels.length || !revealedTargets.size) continue;

        for (const target of revealedTargets) {
            if (!target?.isConnected || targetAlreadyProvidesCheckedReturn(target, input)) continue;
            const key = `${String(input.id || '')}|${String(target.className || target.tagName || '')}|${String(target.textContent || '').slice(0, 80)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            candidates.push({ input, target, labels });
        }
    }
    return candidates;
}

function installOneWayCheckedResultFallback(root) {
    if (!root?.querySelectorAll) return 0;
    let state = reversibleCheckedResultRescueStates.get(root);
    if (!state) {
        state = { entries: new Map() };
        reversibleCheckedResultRescueStates.set(root, state);
    }
    for (const [target, entry] of [...state.entries]) {
        if (!target?.isConnected || !entry.input?.isConnected || !root.contains?.(target) || !root.contains(entry.input)) {
            state.entries.delete(target);
        }
    }

    const perInput = new Map();
    for (const candidate of findOneWayCheckedResultCandidates(root)) {
        const existing = state.entries.get(candidate.target);
        if (existing && existing.input !== candidate.input) continue;
        if (!installReversibleTargetClose(candidate.target, candidate.input, root)) continue;
        candidate.target.setAttribute(REVERSIBLE_CHECKED_RESULT_TARGET_ATTR, 'true');
        state.entries.set(candidate.target, candidate);
        perInput.set(candidate.input, (perInput.get(candidate.input) || 0) + 1);
    }

    for (const input of root.querySelectorAll(`[${REVERSIBLE_CHECKED_RESULT_RESCUE_ATTR}]`)) {
        if (!perInput.has(input)) input.removeAttribute(REVERSIBLE_CHECKED_RESULT_RESCUE_ATTR);
    }
    for (const [input, count] of perInput) {
        input.setAttribute(REVERSIBLE_CHECKED_RESULT_RESCUE_ATTR, String(count));
    }

    const liveCount = [...state.entries.keys()].filter(target => target?.isConnected && root.contains?.(target)).length;
    if (liveCount) root.setAttribute(REVERSIBLE_CHECKED_RESULT_ROOT_ATTR, String(liveCount));
    else root.removeAttribute(REVERSIBLE_CHECKED_RESULT_ROOT_ATTR);
    return liveCount;
}

function inputHasAssociatedLabel(root, input) {
    if (!input) return false;
    if (input.closest?.('label')) return true;
    if (input.labels?.length) return true;
    const id = String(input.id || '');
    if (!id || !root?.querySelectorAll) return false;
    return [...root.querySelectorAll('label[for]')].some(label => String(label.getAttribute('for') || '') === id);
}

function checkedSelectorTargetsInputState(selector, input) {
    const source = String(selector || '').trim();
    if (!source || !/:checked\b/i.test(source) || !input?.matches) return false;

    // 只识别“当前 input 自身进入 checked 后会影响其他节点/宿主”的规则。
    // 允许 ancestor input:checked ~ target，也允许 .host:has(input:checked) target；
    // 单纯 input:checked { accent-color: ... } 不扩大点击区。
    const checkedSubjectRe = /((?:[a-zA-Z][\w-]*)?(?:(?:[#.][\w-]+)|(?:\[[^\]]+\]))*)\s*:checked\b/gi;
    let match;
    while ((match = checkedSubjectRe.exec(source))) {
        const subject = String(match[1] || '').trim() || 'input';
        let matchesInput = false;
        try {
            matchesInput = input.matches(subject);
        } catch {
            matchesInput = false;
        }
        if (!matchesInput) continue;

        const before = source.slice(0, match.index);
        const after = source.slice(match.index + match[0].length);
        const openHasIndex = before.lastIndexOf(':has(');
        const closeBeforeIndex = before.lastIndexOf(')');
        if (openHasIndex > closeBeforeIndex && after.includes(')')) return true;

        // checkbox/radio 是空元素；实际可见状态通常由 + / ~ / > 目标承担。
        // 允许中间带 :not(...) / :is(...) 等伪类，只要其后仍出现结构组合符。
        if (/(?:^|[^\\])[+~>]/.test(after)) return true;
    }
    return false;
}

function inputHasMeaningfulCheckedSiblingRule(root, input) {
    if (!root?.querySelectorAll || !input?.matches) return false;

    // 优先走 CSSOM，能正确进入 @media / @supports 等嵌套规则；
    // 文本扫描作为 WebView 暂时禁止读取 style.sheet 时的后备。
    for (const style of getRabbitMirrorLocalStyleElements(root)) {
        try {
            let found = false;
            const visitRules = (rules) => {
                for (const rule of [...(rules || [])]) {
                    if (found) return;
                    if (rule?.cssRules) visitRules(rule.cssRules);
                    if (!rule?.selectorText || !/:checked\b/i.test(rule.selectorText)) continue;
                    for (const selector of splitCssSelectorList(rule.selectorText)) {
                        if (checkedSelectorTargetsInputState(selector, input)) {
                            found = true;
                            return;
                        }
                    }
                }
            };
            visitRules(style.sheet?.cssRules);
            if (found) return true;
        } catch {
            // Continue with text scan below.
        }
    }

    const cssText = getRabbitMirrorLocalStyleElements(root).map(style => String(style.textContent || '')).join('\n');
    const selectorBlockRe = /(?:^|[{}])\s*([^{}]*:checked[^{}]*)\{/gi;
    let match;
    while ((match = selectorBlockRe.exec(cssText))) {
        const selectorText = String(match[1] || '').trim();
        for (const selector of splitCssSelectorList(selectorText)) {
            if (checkedSelectorTargetsInputState(selector, input)) return true;
        }
    }
    return false;
}

function focusWithinPersistentInputLooksLikeOverlay(input) {
    if (!input?.style) return false;
    let computed = null;
    try { computed = typeof getComputedStyle === 'function' ? getComputedStyle(input) : null; } catch {}
    const inlineOpacity = Number.parseFloat(input.style.getPropertyValue('opacity') || '');
    const computedOpacity = Number.parseFloat(computed?.opacity || '');
    const opacity = Number.isFinite(computedOpacity) ? computedOpacity : inlineOpacity;
    const position = String(computed?.position || input.style.getPropertyValue('position') || '').trim().toLowerCase();
    const pointerEvents = String(computed?.pointerEvents || input.style.getPropertyValue('pointer-events') || '').trim().toLowerCase();
    if (pointerEvents === 'none') return false;
    return Number.isFinite(opacity) && opacity <= 0.05 && /^(?:absolute|fixed)$/.test(position);
}

function parseFocusWithinPersistentRules(root) {
    if (!root?.querySelectorAll) return [];
    const rules = [];
    const seen = new Set();
    const blockRe = /([^{}]+)\{([^{}]*)\}/g;
    for (const style of getRabbitMirrorLocalStyleElements(root).filter(styleEl => !styleEl.hasAttribute(FOCUS_WITHIN_PERSISTENT_STYLE_ATTR))) {
        const cssText = String(style.textContent || '');
        blockRe.lastIndex = 0;
        let block;
        while ((block = blockRe.exec(cssText))) {
            const selectorText = String(block[1] || '').trim();
            if (!selectorText || selectorText.startsWith('@') || !/:focus-within\b/i.test(selectorText)) continue;
            const assignments = parseCssStateSiblingAssignments(block[2]);
            if (!assignments.length) continue;
            const declarations = addImportantToDeclarationBlock(String(block[2] || ''));
            if (!declarations.trim()) continue;
            for (const selector of splitCssSelectorList(selectorText)) {
                const matches = [...String(selector || '').matchAll(/:focus-within\b/gi)];
                if (matches.length !== 1) continue;
                const index = matches[0].index;
                const subjectSelector = String(selector).slice(0, index).trim();
                const suffix = String(selector).slice(index + matches[0][0].length);
                if (!subjectSelector || /:(?:hover|active|focus|checked|target|has)\b/i.test(subjectSelector)) continue;
                const transformedSelector = String(selector).replace(
                    /:focus-within\b/i,
                    `[${FOCUS_WITHIN_PERSISTENT_ACTIVE_ATTR}="true"]`,
                );
                const key = `${subjectSelector}|${suffix}|${transformedSelector}|${declarations}`;
                if (seen.has(key)) continue;
                seen.add(key);
                rules.push({ subjectSelector, suffix, transformedSelector, declarations, assignments });
            }
        }
    }
    return rules;
}

function focusWithinPersistentHostMatchesRule(host, rule) {
    if (!host?.matches || !rule?.subjectSelector) return false;
    try { return host.matches(rule.subjectSelector); } catch { return false; }
}

function focusWithinPersistentRuleTargets(host, rule) {
    if (!host || !rule) return [];
    const suffix = String(rule.suffix || '');
    if (!suffix.trim()) return [host];
    if (!/^\s+/.test(suffix)) return [];
    const selector = suffix.trim();
    if (!selector || /^[>+~]/.test(selector)) return [];
    try { return [...host.querySelectorAll(selector)]; } catch { return []; }
}

function focusWithinPersistentRuleRevealsContent(root, host, rule) {
    if (!/^\s+/.test(String(rule?.suffix || ''))) return false;
    for (const target of focusWithinPersistentRuleTargets(host, rule)) {
        if ((rule.assignments || []).some(({ property, value }) => (
            checkedDeclarationCreatesContentReveal(root, target, property, value)
        ))) return true;
    }
    return false;
}

function findFocusWithinPersistentCandidates(root) {
    if (!root?.querySelectorAll) return [];
    const rules = parseFocusWithinPersistentRules(root);
    if (!rules.length) return [];
    const candidates = [];
    for (const input of root.querySelectorAll('input[type="checkbox"]')) {
        if (input.disabled || inputHasAssociatedLabel(root, input) || !focusWithinPersistentInputLooksLikeOverlay(input)) continue;
        if (getRenderedInputRoute(input) && getRenderedInputRoute(input) !== FOCUS_WITHIN_PERSISTENT_ROUTE) continue;

        let host = input.parentElement;
        for (let depth = 0; host && host !== root && depth < 6; depth += 1, host = host.parentElement) {
            const controls = host.querySelectorAll?.('input[type="checkbox"], input[type="radio"]') || [];
            if (controls.length !== 1 || controls[0] !== input) continue;
            const matchedRules = rules.filter(rule => focusWithinPersistentHostMatchesRule(host, rule));
            if (!matchedRules.length || !matchedRules.some(rule => focusWithinPersistentRuleRevealsContent(root, host, rule))) continue;
            candidates.push({ input, host, rules: matchedRules });
            break;
        }
    }
    return candidates;
}

function setFocusWithinPersistentState(root, entry, active, phase = 'sync') {
    if (!root || !entry?.host || !entry?.input) return;
    entry.active = !!active;
    entry.host.setAttribute(FOCUS_WITHIN_PERSISTENT_ACTIVE_ATTR, entry.active ? 'true' : 'false');
    entry.host.setAttribute('aria-pressed', entry.active ? 'true' : 'false');
    entry.host.setAttribute('aria-expanded', entry.active ? 'true' : 'false');
    entry.input.setAttribute('aria-pressed', entry.active ? 'true' : 'false');
    const identity = String(entry.input.getAttribute('aria-label') || entry.input.id || entry.input.name || 'checkbox').slice(0, 100);
    root.dataset.rabbitMirrorFocusWithinPersistentLast = `${identity}:${entry.active ? '1' : '0'}@${phase}`;

    // 关闭时必须主动移走真实焦点，否则原始 :focus-within 仍会暂时压过持久状态桥接。
    if (!entry.active) {
        setTimeout(() => {
            const focused = typeof document !== 'undefined' ? document.activeElement : null;
            if (focused && (focused === entry.host || entry.host.contains?.(focused))) focused.blur?.();
        }, 0);
    }
}

function detachFocusWithinPersistentEntry(entry) {
    const { input, host, onPointerDown, onClick, onChange, onKeyDown } = entry || {};
    if (host?.removeEventListener) {
        if (onPointerDown) host.removeEventListener('pointerdown', onPointerDown, true);
        if (onClick) host.removeEventListener('click', onClick, false);
        if (onKeyDown) host.removeEventListener('keydown', onKeyDown, false);
    }
    if (input?.removeEventListener && onChange) input.removeEventListener('change', onChange, false);
    host?.removeAttribute?.(FOCUS_WITHIN_PERSISTENT_HOST_ATTR);
    host?.removeAttribute?.(FOCUS_WITHIN_PERSISTENT_ACTIVE_ATTR);
    input?.removeAttribute?.(FOCUS_WITHIN_PERSISTENT_CONTROL_ATTR);
    if (getRenderedInputRoute(input) === FOCUS_WITHIN_PERSISTENT_ROUTE) input.removeAttribute(RENDERED_INPUT_ROUTE_ATTR);
}

function installFocusWithinPersistentFallback(root) {
    if (!root?.querySelectorAll) return 0;
    const candidates = findFocusWithinPersistentCandidates(root);
    const candidateByInput = new Map(candidates.map(candidate => [candidate.input, candidate]));
    const rescueState = focusWithinPersistentRescueStates.get(root) || { entries: new Map() };
    const { entries } = rescueState;

    for (const [input, entry] of [...entries]) {
        const candidate = candidateByInput.get(input);
        if (!candidate || candidate.host !== entry.host || !entry.host?.isConnected) {
            detachFocusWithinPersistentEntry(entry);
            entries.delete(input);
        }
    }

    for (const candidate of candidates) {
        const { input, host } = candidate;
        if (entries.has(input) || !claimRenderedInputRoute(input, FOCUS_WITHIN_PERSISTENT_ROUTE)) continue;

        if (host.hasAttribute(FOCUS_WITHIN_PERSISTENT_HOST_ATTR)) {
            const ownedByLiveEntry = [...entries.values()].some(entry => entry.host === host);
            if (ownedByLiveEntry) continue;
            host.removeAttribute(FOCUS_WITHIN_PERSISTENT_HOST_ATTR);
            host.removeAttribute(FOCUS_WITHIN_PERSISTENT_ACTIVE_ATTR);
        }

        const entry = {
            ...candidate,
            active: !!input.checked,
            beforePointer: null,
            onPointerDown: null,
            onClick: null,
            onChange: null,
            onKeyDown: null,
        };

        entry.onPointerDown = event => {
            if (event.target === input || event.target?.closest?.('input') === input) entry.beforePointer = !!input.checked;
        };
        entry.onChange = () => setFocusWithinPersistentState(root, entry, !!input.checked, 'change');
        entry.onClick = event => {
            const clickedInput = event.target === input || event.target?.closest?.('input') === input;
            if (clickedInput) {
                const before = entry.beforePointer;
                entry.beforePointer = null;
                setTimeout(() => {
                    if (!input.isConnected || !root.contains(input)) return;
                    if (before !== null && !!input.checked === !!before) {
                        input.checked = !before;
                        dispatchRescuedInputState(input);
                    }
                    setFocusWithinPersistentState(root, entry, !!input.checked, 'click');
                }, 0);
                return;
            }
            if (shouldIgnorePseudoToggleEvent(event, host)) return;
            event.preventDefault();
            input.checked = !input.checked;
            dispatchRescuedInputState(input);
            setFocusWithinPersistentState(root, entry, !!input.checked, 'host-click');
        };
        entry.onKeyDown = event => {
            if (event.target !== host || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            input.checked = !input.checked;
            dispatchRescuedInputState(input);
            setFocusWithinPersistentState(root, entry, !!input.checked, 'keyboard');
        };

        preparePseudoTrigger(host);
        host.addEventListener('pointerdown', entry.onPointerDown, true);
        host.addEventListener('click', entry.onClick, false);
        host.addEventListener('keydown', entry.onKeyDown, false);
        input.addEventListener('change', entry.onChange, false);
        host.setAttribute(FOCUS_WITHIN_PERSISTENT_HOST_ATTR, 'true');
        input.setAttribute(FOCUS_WITHIN_PERSISTENT_CONTROL_ATTR, 'true');
        entries.set(input, entry);
        setFocusWithinPersistentState(root, entry, !!input.checked, 'install');
    }

    const cssRules = [];
    const seenCss = new Set();
    for (const entry of entries.values()) {
        for (const rule of entry.rules || []) {
            const css = `${rule.transformedSelector} {${rule.declarations}}`;
            if (seenCss.has(css)) continue;
            seenCss.add(css);
            cssRules.push(css);
        }
    }
    let rescueStyle = root.querySelector(`style[${FOCUS_WITHIN_PERSISTENT_STYLE_ATTR}]`);
    if (cssRules.length) {
        if (!rescueStyle) {
            rescueStyle = document.createElement('style');
            rescueStyle.setAttribute(FOCUS_WITHIN_PERSISTENT_STYLE_ATTR, 'true');
            root.appendChild(rescueStyle);
        }
        const nextCss = cssRules.join('\n');
        if (rescueStyle.textContent !== nextCss) rescueStyle.textContent = nextCss;
        root.setAttribute(FOCUS_WITHIN_PERSISTENT_ROOT_ATTR, String(entries.size));
    } else {
        rescueStyle?.remove();
        root.removeAttribute(FOCUS_WITHIN_PERSISTENT_ROOT_ATTR);
        delete root.dataset.rabbitMirrorFocusWithinPersistentLast;
    }
    focusWithinPersistentRescueStates.set(root, rescueState);
    return entries.size;
}

function findUnlabeledCheckedHost(root, input) {
    let host = input?.parentElement || null;
    for (let depth = 0; host && host !== root && depth < 6; depth += 1, host = host.parentElement) {
        const controls = host.querySelectorAll?.('input[type="checkbox"], input[type="radio"]') || [];
        const hasSiblingContent = [...(host.children || [])].some(child => child !== input && !/^(?:style|script)$/i.test(child.tagName || ''));
        if (controls.length === 1 && hasSiblingContent) return host;
    }
    return null;
}

function recordUnlabeledCheckedHostResult(root, state, before, intended, phase) {
    if (!root || !state?.input) return;
    const actual = !!state.input.checked;
    state.lastBefore = !!before;
    state.lastIntended = !!intended;
    state.lastActual = actual;
    state.lastPhase = String(phase || 'unknown');
    state.lastMatched = actual === !!intended;
    if (phase === 'click') state.toggleCount = (state.toggleCount || 0) + 1;
    if (phase === 'verified' && state.lastMatched) state.verifiedCount = (state.verifiedCount || 0) + 1;
    const identity = String(state.input.id || state.input.name || state.input.type || 'control').slice(0, 100);
    root.dataset.rabbitMirrorUnlabeledCheckedLast = `${identity}:${before ? '1' : '0'}>${intended ? '1' : '0'}=${actual ? '1' : '0'}@${state.lastPhase}`;
}

function verifyUnlabeledCheckedHostState(root, state, before, intended) {
    for (const delay of [0, 60]) {
        setTimeout(() => {
            const { input, host } = state || {};
            if (!input?.isConnected || !host?.isConnected || !root?.contains?.(input) || !root.contains(host)) return;
            if (!!input.checked !== !!intended) {
                setRescuedCheckedState(root, input, intended);
                state.correctionCount = (state.correctionCount || 0) + 1;
            } else {
                applyCheckedVisualFallback(root, input);
            }
            recordUnlabeledCheckedHostResult(root, state, before, intended, 'verified');
        }, delay);
    }
}

function detachUnlabeledCheckedHostEntry(state) {
    const { input, host, onPointerDown, onClick } = state || {};
    if (host?.removeEventListener) {
        if (onPointerDown) host.removeEventListener('pointerdown', onPointerDown, true);
        if (onClick) host.removeEventListener('click', onClick, true);
    }
    host?.removeAttribute?.(UNLABELED_CHECKED_HOST_RESCUE_ATTR);
    input?.removeAttribute?.(UNLABELED_CHECKED_CONTROL_RESCUE_ATTR);
}

function setRescuedCheckedState(root, input, nextChecked) {
    if (!input || input.disabled) return false;
    const previous = !!input.checked;
    if (input.type === 'radio') {
        const radioName = String(input.name || '');
        [...root.querySelectorAll('input[type="radio"]')]
            .filter(item => item !== input && (!radioName || item.name === radioName))
            .forEach(item => {
                item.checked = false;
                restoreInteractionInlineOverrides(item);
            });
        input.checked = true;
    } else {
        input.checked = !!nextChecked;
    }
    applyCheckedVisualFallback(root, input);
    if (previous !== input.checked) dispatchRescuedInputState(input);
    return previous !== input.checked;
}

function installUnlabeledCheckedHostFallback(root) {
    if (!root?.querySelectorAll) return 0;

    // 流式渲染时 input、style 与正文可能分批到达。旧实现第一次扫描为 0 后就永久返回空 Map，
    // 维修兔再次调用也无法真实安装。这里改为增量校准：清理失效条目并补装新命中路线。
    const rescueState = unlabeledCheckedHostRescueStates.get(root) || { entries: new Map() };
    const { entries } = rescueState;

    for (const [input, state] of [...entries]) {
        const expectedHost = input?.isConnected
            && root.contains?.(input)
            && !input.disabled
            && !inputHasAssociatedLabel(root, input)
            && inputHasMeaningfulCheckedSiblingRule(root, input)
            ? findUnlabeledCheckedHost(root, input)
            : null;
        if (!expectedHost || expectedHost !== state.host || !state.host?.isConnected) {
            detachUnlabeledCheckedHostEntry(state);
            entries.delete(input);
        }
    }

    for (const input of root.querySelectorAll('input[type="checkbox"], input[type="radio"]')) {
        if (entries.has(input) || input.disabled || inputHasAssociatedLabel(root, input)
            || !inputHasMeaningfulCheckedSiblingRule(root, input)) continue;
        const host = findUnlabeledCheckedHost(root, input);
        if (!host) continue;

        // DOM 被宿主克隆时 data 属性可能保留而 WeakMap 不保留；先移除无状态的旧标记再重绑。
        if (host.hasAttribute(UNLABELED_CHECKED_HOST_RESCUE_ATTR)) {
            const ownedByLiveEntry = [...entries.values()].some(entry => entry.host === host);
            if (ownedByLiveEntry) continue;
            host.removeAttribute(UNLABELED_CHECKED_HOST_RESCUE_ATTR);
        }

        const state = {
            input,
            host,
            beforePointer: null,
            toggleCount: 0,
            correctionCount: 0,
            verifiedCount: 0,
            onPointerDown: null,
            onClick: null,
        };

        state.onPointerDown = (event) => {
            const nestedInteractive = event.target?.closest?.(EXISTING_INTERACTIVE_SELECTOR);
            if (nestedInteractive && nestedInteractive !== input && host.contains(nestedInteractive)) return;
            state.beforePointer = !!input.checked;
        };

        state.onClick = (event) => {
            const nestedInteractive = event.target?.closest?.(EXISTING_INTERACTIVE_SELECTOR);
            if (nestedInteractive && nestedInteractive !== input && host.contains(nestedInteractive)) return;
            const clickedInput = event.target === input || event.target?.closest?.('input') === input;
            const before = state.beforePointer === null ? !!input.checked : state.beforePointer;
            state.beforePointer = null;
            const intended = input.type === 'radio' ? true : !before;

            if (!clickedInput) {
                // 当前局部宿主已经由急救器接管；阻止同一次点击继续冒泡到旧 onclick/其他兜底，
                // 避免 true→false 的双重切换。链接、按钮、summary 等原生交互已在上方排除。
                event.preventDefault();
                event.stopImmediatePropagation?.();
                setRescuedCheckedState(root, input, intended);
                recordUnlabeledCheckedHostResult(root, state, before, intended, 'click');
                verifyUnlabeledCheckedHostState(root, state, before, intended);
                return;
            }

            // 直接点到 input 时优先保留原生切换；若 WebView 没有执行 default action，下一任务补切一次。
            setTimeout(() => {
                if (!input.isConnected || !root.contains(input)) return;
                if (!!input.checked === before) setRescuedCheckedState(root, input, intended);
                else applyCheckedVisualFallback(root, input);
                recordUnlabeledCheckedHostResult(root, state, before, intended, 'click');
                verifyUnlabeledCheckedHostState(root, state, before, intended);
            }, 0);
        };

        host.addEventListener('pointerdown', state.onPointerDown, true);
        host.addEventListener('click', state.onClick, true);
        host.setAttribute(UNLABELED_CHECKED_HOST_RESCUE_ATTR, 'true');
        input.setAttribute(UNLABELED_CHECKED_CONTROL_RESCUE_ATTR, 'true');
        entries.set(input, state);
    }

    unlabeledCheckedHostRescueStates.set(root, rescueState);
    if (entries.size) root.dataset.rabbitMirrorUnlabeledCheckedFallback = String(entries.size);
    else {
        delete root.dataset.rabbitMirrorUnlabeledCheckedFallback;
        delete root.dataset.rabbitMirrorUnlabeledCheckedLast;
    }
    return entries.size;
}

function isRelevant3DFlipDeclaration(property, value) {
    const lowerProperty = String(property || '').toLowerCase();
    const sourceValue = String(value || '');
    return (lowerProperty === 'backface-visibility' && /hidden/i.test(sourceValue))
        || (lowerProperty === 'transform-style' && /preserve-3d/i.test(sourceValue))
        || lowerProperty === 'perspective'
        || (lowerProperty === 'transform' && /rotateY\s*\(/i.test(sourceValue));
}

function addWebKit3DFlipPrefixes(cssText) {
    let changed = false;
    const repaired = String(cssText || '').replace(/\{([^{}]*)\}/g, (ruleBlock, declarations) => {
        const patchedDeclarations = String(declarations || '').replace(
            /(^|;)(\s*)(backface-visibility|transform-style|perspective|transform)\s*:\s*([^;{}]+)(?=;|$)/gi,
            (full, separator, spacing, property, rawValue, offset, declarationSource) => {
                const value = String(rawValue || '').trim();
                const lowerProperty = String(property || '').toLowerCase();
                if (!isRelevant3DFlipDeclaration(lowerProperty, value)) return full;

                // 第二次扫描时，若紧邻的前一条已经是同值 WebKit 声明，不重复插入。
                const before = String(declarationSource || '').slice(0, offset);
                const previousPrefix = new RegExp(
                    `(?:^|;)\\s*-webkit-${escapeRegExp(lowerProperty)}\\s*:\\s*${escapeRegExp(value)}\\s*$`,
                    'i',
                );
                if (previousPrefix.test(before)) return full;

                changed = true;
                return `${separator}${spacing}-webkit-${lowerProperty}: ${value};${spacing}${lowerProperty}: ${value}`;
            },
        );
        return `{${patchedDeclarations}}`;
    });
    return { changed, repaired };
}

function collectWebKit3DFlipEvidence(root) {
    if (!root?.querySelectorAll) return {
        rotateY: 0, webkitRotateY: 0, backface: 0, webkitBackface: 0,
        preserve3d: 0, webkitPreserve3d: 0, perspective: 0, webkitPerspective: 0,
    };
    const source = [
        ...getRabbitMirrorLocalStyleElements(root).map(style => String(style.textContent || '')),
        ...[...root.querySelectorAll('[style]')].map(element => String(element.getAttribute('style') || '')),
    ].join('\n');
    const count = pattern => (source.match(pattern) || []).length;
    return {
        rotateY: count(/(?:^|[;{]\s*)transform\s*:[^;{}]*rotateY\s*\(/gim),
        webkitRotateY: count(/(?:^|[;{]\s*)-webkit-transform\s*:[^;{}]*rotateY\s*\(/gim),
        backface: count(/(?:^|[;{]\s*)backface-visibility\s*:\s*hidden\b/gim),
        webkitBackface: count(/(?:^|[;{]\s*)-webkit-backface-visibility\s*:\s*hidden\b/gim),
        preserve3d: count(/(?:^|[;{]\s*)transform-style\s*:\s*preserve-3d\b/gim),
        webkitPreserve3d: count(/(?:^|[;{]\s*)-webkit-transform-style\s*:\s*preserve-3d\b/gim),
        perspective: count(/(?:^|[;{]\s*)perspective\s*:/gim),
        webkitPerspective: count(/(?:^|[;{]\s*)-webkit-perspective\s*:/gim),
    };
}

function formatWebKit3DFlipEvidence(root) {
    const evidence = collectWebKit3DFlipEvidence(root);
    return `rotateY=${evidence.rotateY}/${evidence.webkitRotateY} backface=${evidence.backface}/${evidence.webkitBackface} preserve3d=${evidence.preserve3d}/${evidence.webkitPreserve3d} perspective=${evidence.perspective}/${evidence.webkitPerspective}`;
}

function installWebKit3DFlipRescue(root) {
    if (!root?.querySelectorAll) return 0;
    const rescueState = webKit3DFlipRescueStates.get(root) || { patchedNodes: new Set() };
    const { patchedNodes } = rescueState;
    for (const node of [...patchedNodes]) {
        if (!node?.isConnected || !root.contains?.(node)) patchedNodes.delete(node);
    }

    const flipSourceText = [
        ...getRabbitMirrorLocalStyleElements(root).map(style => String(style.textContent || '')),
        ...[...root.querySelectorAll('[style]')].map(element => String(element.getAttribute('style') || '')),
    ].join('\n');
    const hasRotateY = /rotateY\s*\(/i.test(flipSourceText);
    const has3DStructure = /(?:-webkit-)?backface-visibility\s*:\s*hidden/i.test(flipSourceText)
        || /(?:-webkit-)?transform-style\s*:\s*preserve-3d/i.test(flipSourceText);
    if (!hasRotateY || !has3DStructure) {
        webKit3DFlipRescueStates.set(root, rescueState);
        if (!patchedNodes.size) root.removeAttribute?.(WEBKIT_3D_FLIP_RESCUE_ATTR);
        return patchedNodes.size;
    }

    // 每个 style 独立补前缀。front/back 与 rotateY 常分散在多个 style 标签中，
    // 不能再要求“当前 style 自己也含 rotateY”；同时允许流式追加后再次增量扫描。
    for (const style of getRabbitMirrorLocalStyleElements(root)) {
        const current = String(style.textContent || '');
        if (webKit3DFlipStyleStates.get(style) === current) continue;
        const result = addWebKit3DFlipPrefixes(current);
        if (result.changed && result.repaired !== current) {
            style.textContent = result.repaired;
            style.setAttribute(WEBKIT_3D_FLIP_RESCUE_ATTR, 'true');
            patchedNodes.add(style);
        }
        webKit3DFlipStyleStates.set(style, String(style.textContent || ''));
    }

    // 仅复制元素本来就有的 3D 声明到 WebKit 前缀；绝不向整个容器新加 rotateY。
    for (const element of root.querySelectorAll('[style]')) {
        const current = String(element.getAttribute('style') || '');
        if (webKit3DFlipInlineStates.get(element) === current) continue;
        let changed = false;
        for (const property of ['backface-visibility', 'transform-style', 'perspective', 'transform']) {
            const value = element.style.getPropertyValue(property).trim();
            if (!value || !isRelevant3DFlipDeclaration(property, value)) continue;
            const prefixedProperty = `-webkit-${property}`;
            const priority = element.style.getPropertyPriority(property) || '';
            if (element.style.getPropertyValue(prefixedProperty).trim() !== value
                || element.style.getPropertyPriority(prefixedProperty) !== priority) {
                element.style.setProperty(prefixedProperty, value, priority);
                changed = true;
            }
        }
        if (changed) {
            element.setAttribute(WEBKIT_3D_FLIP_RESCUE_ATTR, 'true');
            patchedNodes.add(element);
        }
        webKit3DFlipInlineStates.set(element, String(element.getAttribute('style') || ''));
    }

    webKit3DFlipRescueStates.set(root, rescueState);
    if (patchedNodes.size) root.setAttribute(WEBKIT_3D_FLIP_RESCUE_ATTR, String(patchedNodes.size));
    else root.removeAttribute?.(WEBKIT_3D_FLIP_RESCUE_ATTR);
    return patchedNodes.size;
}


function isZeroInsetValue(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return /^(?:0|0px|0%|0em|0rem)$/.test(normalized);
}

function isHighConfidenceDecorativeOverlay(element) {
    if (!element?.style || element.hasAttribute?.(DECORATIVE_OVERLAY_PASS_THROUGH_ATTR)) return false;
    const position = String(element.style.getPropertyValue('position') || '').trim().toLowerCase();
    if (position !== 'absolute' && position !== 'fixed') return false;

    const inset = String(element.style.getPropertyValue('inset') || '').trim().toLowerCase();
    const fullInset = inset && inset.split(/\s+/).every(isZeroInsetValue);
    const fullEdges = ['top', 'right', 'bottom', 'left']
        .every(property => isZeroInsetValue(element.style.getPropertyValue(property)));
    if (!fullInset && !fullEdges) return false;

    if (String(element.textContent || '').trim()) return false;
    if (element.querySelector?.('a, button, input, select, textarea, label, summary, [role="button"], [contenteditable="true"]')) return false;
    if (element.hasAttribute?.('onclick') || element.hasAttribute?.('onpointerdown') || element.hasAttribute?.('ontouchstart')) return false;

    const cursor = String(element.style.getPropertyValue('cursor') || '').trim().toLowerCase();
    const pointerEvents = String(element.style.getPropertyValue('pointer-events') || '').trim().toLowerCase();
    if (cursor === 'pointer' || pointerEvents === 'none') return false;

    const background = `${element.style.getPropertyValue('background')} ${element.style.getPropertyValue('background-image')}`.trim();
    const opacity = Number.parseFloat(element.style.getPropertyValue('opacity') || '1');
    const decorativePaint = !!background && background.toLowerCase() !== 'none';
    const lowOpacity = Number.isFinite(opacity) && opacity <= 0.45;
    return decorativePaint && lowOpacity;
}

function findDecorativeOverlayPassThroughCandidates(root) {
    if (!root?.querySelectorAll) return [];
    return [...root.querySelectorAll('[style]')].filter(isHighConfidenceDecorativeOverlay);
}

function installDecorativeOverlayPassThrough(root) {
    let patched = 0;
    for (const overlay of findDecorativeOverlayPassThroughCandidates(root)) {
        overlay.style.setProperty('pointer-events', 'none', 'important');
        overlay.setAttribute(DECORATIVE_OVERLAY_PASS_THROUGH_ATTR, 'true');
        overlay.setAttribute('aria-hidden', 'true');
        patched += 1;
    }
    return patched;
}

function installIntelligentInteractionRescue(root) {
    // Markdown 可能把相邻的 CSS 注释边界 */ ... /* 解析成 <em>/ ... /</em>，
    // 导致两段注释之间的状态规则被整段吞入注释。只在急救开启后修复当前 DOM 的明确损坏形态。
    repairMarkdownCorruptedCssComments(root);

    // SillyTavern/DOMPurify 可能在渲染前移除 onclick。只恢复原始源码中精确的
    // querySelectorAll('input[type=radio]').forEach(r => r.checked=false) 取消程序，
    // 并把原本会误伤整页的 document 范围收紧到当前兔子镜。
    installRawMessageRadioResetProgramRescue(root);
    // 回读安全可解析的 getElementById 样式/文字赋值，并按同一 DOM 路径绑定到渲染节点。
    installRawMessageDirectIdClickProgramRescue(root);
    // 护照／证件类翻页采用“一次打开 + 独立关闭 + 印章长按详情”的复合结构；
    // 不执行原始 JavaScript，只回读固定 class add/remove 意图并恢复可逆开合和点按详情。
    installPassportDocumentRescue(root);
    // 命名函数仅接受受限的 getElementById + classList.contains/add/remove 两分支状态机；
    // 不执行原始 script，只把安全类名切换重新绑定到当前兔子镜。
    installRawMessageNamedFunctionClassRescue(root);
    // 回读只改写触发元素自身的安全 onclick（文字/样式），并改造成可逆点击。
    installRawMessageSelfMutationRescue(root);
    // 宿主会移除 onmouseover/onmouseout；从原始消息回读仅修改 this.style 的安全样式赋值，
    // 桌面保留悬停，触屏改为可保持、可再次点击恢复的状态。
    installRawMessageHoverPseudoRescue(root);
    // 同样从原始消息回读受限的 onchange 状态程序，覆盖宿主已删除事件属性的情况。
    installRawMessageCheckedChangeProgramRescue(root);
    // 低透明度、无文字、无交互后代的全覆盖纹理层在部分 WebView 中会截获触摸；
    // 只对高置信装饰层开启点击穿透，不处理真正的遮罩交互。
    installDecorativeOverlayPassThrough(root);

    // 模型偶尔在 CSS 中写出 .trigger:checked，却忘记把 trigger class 放到唯一的隐藏控件上。
    // 仅在原始源码中可证明“补上该 class 后，当前 label 控件会命中有正文的局部状态规则”时恢复。
    installMissingCheckedSubjectClassRescue(root);

    const capabilities = detectInteractionCapabilities(root);
    if (capabilities.checked) {
        // 无 label 的透明 checkbox 若只依赖父容器 :focus-within 显示背面，
        // 在触屏 WebView 中焦点会立即丢失或无法再次关闭。把同一套现有 CSS
        // 映射到本地持久状态属性；只接管明确承担第二层内容的高置信结构。
        installFocusWithinPersistentFallback(root);
        // 模型常把 checkbox/radio 的可保持状态误写成 :focus ~ ...。
        // 仅在当前兔子镜内复制为唯一 input ID 的 :checked 规则；普通 focus 视觉不受影响。
        refreshFocusToCheckedRescue(root);
        strengthenRabbitMirrorCheckedStateCss(root);
        // 旧消息中可能残留 .mes_text body:has(...:checked) 这类永不命中的全选联动；
        // 用当前兔子镜根的可逆状态属性恢复，不依赖宿主对 :has() 的支持。
        installCheckedHasStateFallback(root);
        // 控件区与内容区分离时，模型写出的 .content:has(input:checked) 永远无法命中；
        // 仅对控件明确位于 host 外、正文明确位于 host 内的局部规则建立状态桥接。
        installDetachedCheckedHasFallback(root);
        // 两个独立 checkbox 若分别承担“进入下一画面”和“返回主画面”，纯 CSS 会在返回后残留双重 checked，
        // 且内联 display:none 会压过普通 :has() 规则。只对互为反向显示、各自位于对应状态层内的高置信结构恢复可重复往返。
        installPairedCheckedStateRescue(root);
        // 优先解析 checkbox/radio 中安全的 ID 目标条件显隐；绑定到 input/change，
        // 避免 label 兜底只切换 checked、却不触发原 onclick 的情况。
        installRenderedCheckedIdTargetRescue(root);
        // 先从已渲染的安全 DOM 识别前景/隐藏层，再由 label 兜底触发 input/change。
        // 此路径完全不依赖已被宿主删除的 onclick/onchange。
        installRenderedStateLayerRescue(root);
        // 补救 label 后方的多段隐藏内容（如 querySelectorAll(...)[0/1]），不依赖事件原文。
        installRenderedAdjacentHiddenGroupRescue(root);
        // 补救 checkbox/radio 与单块隐藏正文同处 label 内的结构。
        installRenderedLabelInternalHiddenRescue(root);
        // 补救 label 后方紧邻的单块结果层，并可选增强同画布内的零尺寸视觉主体。
        installRenderedLabelAdjacentResultRescue(root);
        installInteractionLabelFallback(root);
        // 有 label 的 checked 控件不仅登记监听器，还登记可验证的受控目标；
        // 点击后会校验 checked 是否保持、第二状态是否真实改变，并在 WebView 回滚时补正。
        installLabeledCheckedVerificationFallback(root);
        // input 位于按钮组内、受控内容位于按钮组外时，原生 ~ 选择器无法跨父层命中。
        // 只对唯一 ID 触发器登记文本级跨父层兜底，实际切换仍由当前 label 驱动。
        installCrossParentCheckedRuleFallback(root);
        // 多个正文层叠在同一 grid-area/绝对定位画布中时，模型常给默认层写死内联 opacity:1；
        // checked 分支虽然成功显现，默认层仍会和新正文重叠。只对同一公共内容 class 的高置信互斥叠层强制单层可见。
        installExclusiveStackedStateRescue(root);
        // 电视／终端用多个重叠 label 模拟旋钮分区时，中间频道常被高 z-index 的左右标签永久遮住。
        // 只对已经存在完整 radio 分支和叠层画面的高置信旋钮，改为每次点按按顺序循环频道。
        installChannelDialCycleRescue(root);
        // checkbox 的 checked 分支若把唯一 label/触发器隐藏，却只留下普通正文结果，
        // 用户会失去取消勾选的入口。仅对这一高置信单向结构，让已展开结果可再次点按返回上一层。
        installOneWayCheckedResultFallback(root);
        // 没有 label 的透明 checkbox/radio 在 iOS WebView 中经常只有极小原生点击区；
        // 用其局部父容器兜底切换，不改动正常 label 交互。
        installUnlabeledCheckedHostFallback(root);
    }
    // Safari/WebKit 对 3D 翻面仍要求前缀版 backface/preserve-3d；缺失时背面会镜像或双面同显。
    installWebKit3DFlipRescue(root);
    // 精准读取 :active/:focus/:focus-within/:hover 与 +/~ 的后置状态映射；
    // 先于启发式按钮路线安装，避免同一按钮被两套可逆状态重复接管。
    if (capabilities.stateSibling) installRenderedCssStateSiblingRescue(root);
    // 普通 button 后紧邻隐藏内容时，先建立真实揭示路线，避免只被归类为 hover 颜色反馈。
    if (capabilities.buttonAdjacent) installRenderedButtonAdjacentHiddenRescue(root);
    // 普通 cursor:pointer 容器后紧邻 display:none 正文时，不再错误要求弹层必须带关闭按钮。
    if (capabilities.clickableAdjacent) installRenderedClickableAdjacentHiddenRescue(root);
    if (capabilities.clickablePopup) installRenderedClickableAdjacentPopupRescue(root);
    if (capabilities.hover) refreshTouchHoverRescue(root);
    if (capabilities.target) refreshTargetRescue(root);
    if (capabilities.details) installNestedDetailsFallback(root);
    if (capabilities.pseudo) installPseudoInteractionRescue(root);
    // 遮罩类优先于普通容器内揭示，避免同一画面被两条路线重复接管。
    if (capabilities.maskReveal) installRenderedMaskRevealRescue(root);
    if (capabilities.containerReveal) installRenderedContainerInternalRevealRescue(root);
    if (capabilities.listDetail) installRenderedListDetailRescue(root);
    // 纯静态的“选项 A/B/C”卡片若已有明确选择文案、统一同级容器与 cursor:pointer，
    // 可安全补成互斥且可撤回的选择状态；只确认用户选中了哪张卡，不生成缺失的剧情结果。
    installStaticChoiceSelectionFallback(root);
}

const touchHoverRescueStates = new WeakMap();
const TOUCH_HOVER_ATTR = 'data-rm-touch-hover';
const TOUCH_HOVER_READY_ATTR = 'data-rm-touch-hover-ready';
const TOUCH_HOVER_STYLE_ATTR = 'data-rabbit-mirror-touch-hover-rescue';

function touchHoverRuleTargets(root, selectorText) {
    if (!root?.querySelectorAll) return [];
    const selector = pseudoStateTargetSelector(selectorText)
        .replace(/::(?:before|after)\b/gi, '')
        .trim();
    if (!selector) return [];
    try {
        return [...root.querySelectorAll(selector)];
    } catch {
        return [];
    }
}

function touchHoverNumericValue(value) {
    const match = String(value || '').replace(/\s*!important\s*$/i, '').trim().match(/^(-?\d+(?:\.\d+)?)/);
    return match ? Number.parseFloat(match[1]) : Number.NaN;
}

function touchHoverRuleCarriesSecondState(root, selectorText, declarationText) {
    const declarations = [];
    const declarationRe = /(^|;)\s*([a-z-]+)\s*:\s*([^;{}]+?)(?=;|$)/gi;
    let declaration;
    while ((declaration = declarationRe.exec(String(declarationText || '')))) {
        declarations.push([
            normalizeStylePropertyName(declaration[2]),
            String(declaration[3] || '').replace(/\s*!important\s*$/i, '').trim(),
        ]);
    }
    if (!declarations.length) return false;

    const pseudoElement = /::(?:before|after)\b/i.test(selectorText);
    const targets = touchHoverRuleTargets(root, selectorText);

    return declarations.some(([property, value]) => {
        const name = String(property || '').toLowerCase();
        const normalizedValue = String(value || '').trim().toLowerCase();

        // Hover 生成真实伪元素文字时属于新增内容，不是普通装饰。
        if (pseudoElement && name === 'content') {
            return normalizedValue && !/^(?:none|normal|""|'')$/.test(normalizedValue);
        }

        // 3D 翻面会切换观察面；平面位移、缩放和 rotate() 仍只是视觉反馈。
        if (name === 'transform') {
            return /(?:rotate[xy]|perspective)\s*\(/i.test(normalizedValue);
        }

        if (!targets.length) return false;

        if (name === 'display' && normalizedValue !== 'none') {
            return targets.some(target => target.hidden || diagnosticComputedStyle(target)?.display === 'none');
        }
        if (name === 'visibility' && /^(?:visible|initial|inherit|unset)$/.test(normalizedValue)) {
            return targets.some(target => /^(?:hidden|collapse)$/.test(String(diagnosticComputedStyle(target)?.visibility || '').toLowerCase()));
        }
        if (name === 'opacity') {
            const next = touchHoverNumericValue(normalizedValue);
            if (!Number.isFinite(next) || next <= 0.05) return false;
            return targets.some(target => {
                const current = Number.parseFloat(String(diagnosticComputedStyle(target)?.opacity || '1'));
                return Number.isFinite(current) && current <= 0.05;
            });
        }
        if (name === 'height' || name === 'max-height' || name === 'width' || name === 'max-width') {
            const next = touchHoverNumericValue(normalizedValue);
            if (!Number.isFinite(next) || next <= 1) return false;
            return targets.some(target => {
                const style = diagnosticComputedStyle(target);
                const current = Number.parseFloat(String(style?.getPropertyValue?.(name) || style?.[name] || ''));
                return Number.isFinite(current) && current <= 1;
            });
        }
        if ((name === 'clip-path' || name === '-webkit-clip-path') && !/^(?:none|initial|inherit|unset)$/.test(normalizedValue)) {
            return targets.some(target => {
                const style = diagnosticComputedStyle(target);
                const current = String(style?.getPropertyValue?.(name) || style?.clipPath || '').toLowerCase();
                return /inset\(\s*(?:50|100)%|circle\(\s*0|polygon\(\s*0\s+0\s*,\s*0\s+0/i.test(current);
            });
        }
        return false;
    });
}

function collectTouchHoverRulesFromCss(root, cssText) {
    const rules = [];
    const subjects = new Set();
    const blockRe = /([^{}]+)\{([^{}]*)\}/g;
    let match;

    while ((match = blockRe.exec(String(cssText || '')))) {
        const selectorText = String(match[1] || '').trim();
        if (!selectorText || selectorText.startsWith('@') || !/:hover\b/i.test(selectorText)) continue;

        const declarationText = String(match[2] || '');
        const declarations = addImportantToDeclarationBlock(declarationText);
        if (!declarations.trim()) continue;

        const transformedSelectors = [];
        for (const selector of selectorText.split(',').map(value => value.trim()).filter(Boolean)) {
            if (!/:hover\b/i.test(selector)) continue;

            // 只有 Hover 真正揭示隐藏内容、展开零尺寸层、生成伪元素正文或执行 3D 翻面时，
            // 才在触屏端模拟持久 Hover。颜色、阴影、平面位移、缩放等装饰反馈保持原样。
            if (!touchHoverRuleCarriesSecondState(root, selector, declarationText)) continue;

            transformedSelectors.push(selector.replace(/:hover\b/gi, `[${TOUCH_HOVER_ATTR}="true"]`));

            const subjectRe = /((?:[a-zA-Z][\w-]*)?(?:[#.][\w-]+|\[[^\]]+\])*)\s*:hover\b/gi;
            let subjectMatch;
            while ((subjectMatch = subjectRe.exec(selector))) {
                const subject = String(subjectMatch[1] || '').trim();
                if (subject) subjects.add(subject);
            }
        }

        if (transformedSelectors.length) {
            rules.push(`${transformedSelectors.join(', ')} {${declarations}}`);
        }
    }

    return { cssText: rules.join('\n'), subjects: [...subjects] };
}

function refreshTouchHoverRescue(toto) {
    if (!toto?.querySelectorAll) return;

    let combinedCss = '';
    const subjects = new Set();
    getRabbitMirrorLocalStyleElements(toto).filter(styleEl => !styleEl.hasAttribute(TOUCH_HOVER_STYLE_ATTR)).forEach(styleEl => {
        const parsed = collectTouchHoverRulesFromCss(toto, styleEl.textContent || '');
        if (parsed.cssText) combinedCss += `${parsed.cssText}\n`;
        parsed.subjects.forEach(subject => subjects.add(subject));
    });

    let rescueStyle = toto.querySelector(`style[${TOUCH_HOVER_STYLE_ATTR}]`);
    if (combinedCss.trim()) {
        if (!rescueStyle) {
            rescueStyle = document.createElement('style');
            rescueStyle.setAttribute(TOUCH_HOVER_STYLE_ATTR, 'true');
            toto.appendChild(rescueStyle);
        }
        const nextCss = combinedCss.trim();
        if (rescueStyle.textContent !== nextCss) rescueStyle.textContent = nextCss;
    } else if (rescueStyle) {
        rescueStyle.remove();
    }

    toto.querySelectorAll?.(`[${TOUCH_HOVER_READY_ATTR}]`)?.forEach(element => element.removeAttribute(TOUCH_HOVER_READY_ATTR));
    let eligibleCount = 0;
    for (const subject of subjects) {
        try {
            toto.querySelectorAll(subject).forEach(element => {
                if (!element.hasAttribute(TOUCH_HOVER_READY_ATTR)) eligibleCount += 1;
                element.setAttribute(TOUCH_HOVER_READY_ATTR, 'true');
            });
        } catch {
            // Ignore malformed model-generated selectors.
        }
    }
    toto.querySelectorAll?.(`[${TOUCH_HOVER_ATTR}]`)?.forEach(element => {
        if (!element.hasAttribute(TOUCH_HOVER_READY_ATTR)) element.removeAttribute(TOUCH_HOVER_ATTR);
    });

    const previousState = touchHoverRescueStates.get(toto) || {};
    if (!eligibleCount) {
        if (previousState.listener) toto.removeEventListener('click', previousState.listener, false);
        touchHoverRescueStates.set(toto, { subjects: [], eligibleCount: 0, listener: null });
        toto.removeAttribute('data-rabbit-mirror-touch-hover-fallback');
        return;
    }

    let listener = previousState.listener;
    if (!listener) {
        listener = (event) => {
            const state = touchHoverRescueStates.get(toto);
            if (!state?.eligibleCount) return;

            const hoverTarget = event.target?.closest?.(`[${TOUCH_HOVER_READY_ATTR}="true"]`);
            if (!hoverTarget || !toto.contains(hoverTarget)) return;
            if (hoverTarget.hasAttribute?.(RENDERED_CSS_STATE_SIBLING_RESCUE_ATTR)
                || hoverTarget.hasAttribute?.(RENDERED_BUTTON_ADJACENT_HIDDEN_RESCUE_ATTR)
                || hoverTarget.hasAttribute?.(RENDERED_CLICKABLE_ADJACENT_POPUP_RESCUE_ATTR)
                || hoverTarget.hasAttribute?.(FILL_IN_CHOICE_BLANK_ATTR)) return;

            const isActive = hoverTarget.getAttribute(TOUCH_HOVER_ATTR) === 'true';
            if (isActive) hoverTarget.removeAttribute(TOUCH_HOVER_ATTR);
            else hoverTarget.setAttribute(TOUCH_HOVER_ATTR, 'true');
        };
        toto.addEventListener('click', listener, false);
    }

    touchHoverRescueStates.set(toto, { subjects: [...subjects], eligibleCount, listener });
    toto.dataset.rabbitMirrorTouchHoverFallback = 'true';
}

function getAssociatedCheckableLabels(root, input) {
    if (!root?.querySelectorAll || !input) return [];
    const result = [];
    const seen = new Set();
    const wrapping = input.closest?.('label');
    if (wrapping && root.contains?.(wrapping)) {
        result.push(wrapping);
        seen.add(wrapping);
    }
    for (const label of [...(input.labels || [])]) {
        if (!label || seen.has(label) || !root.contains?.(label)) continue;
        result.push(label);
        seen.add(label);
    }
    const id = String(input.id || '');
    if (id) {
        for (const label of root.querySelectorAll('label[for]')) {
            if (String(label.getAttribute('for') || '') !== id || seen.has(label)) continue;
            result.push(label);
            seen.add(label);
        }
    }
    return result;
}

function checkedVerificationDeclarationIsMeaningful(property, value, pseudoElement = '') {
    const name = String(property || '').trim().toLowerCase();
    const cleanValue = String(value || '').trim().toLowerCase();
    if (pseudoElement && name === 'content') return cleanValue && cleanValue !== 'none' && cleanValue !== 'normal';
    if (['display', 'visibility', 'opacity', 'height', 'max-height', 'min-height', 'transform', 'clip-path', 'filter'].includes(name)) return true;
    if (name === 'content') return true;
    if (name.startsWith('background') || name === 'color' || name.startsWith('border') || name === 'box-shadow' || name === 'text-shadow') return true;
    return false;
}

function checkedVerificationDeclarationCarriesSecondState(property, value, pseudoElement = '') {
    const name = String(property || '').trim().toLowerCase();
    const cleanValue = String(value || '').trim().toLowerCase();
    if (name === 'content') return !!cleanValue && cleanValue !== 'none' && cleanValue !== 'normal' && cleanValue !== '""' && cleanValue !== "''";
    if (pseudoElement) return false;
    if (name === 'display') return cleanValue !== 'none';
    if (name === 'visibility') return cleanValue !== 'hidden' && cleanValue !== 'collapse';
    if (name === 'opacity') return Number.parseFloat(cleanValue) > 0.05;
    if (['height', 'max-height', 'min-height'].includes(name)) return !isCollapsedDimensionValue(cleanValue);
    return false;
}

function collectLabeledCheckedVerificationTargets(root, input) {
    if (!root || !input) return [];
    const entries = [];
    const entriesByKey = new Map();
    for (const rule of parseCheckedRulesFromText(root, input)) {
        const meaningful = (rule.styleMap || []).some(([property, value]) => (
            checkedVerificationDeclarationIsMeaningful(property, value, rule.pseudoElement)
        ));
        if (!meaningful) continue;
        const secondState = (rule.styleMap || []).some(([property, value]) => (
            checkedVerificationDeclarationCarriesSecondState(property, value, rule.pseudoElement)
        ));
        for (const target of resolveTargetsForCheckedRule(root, input, rule)) {
            if (!target?.isConnected || target === input || !root.contains?.(target)) continue;
            const key = `${rule.pseudoElement || 'self'}|${String(target.tagName || '')}|${String(target.className || '')}|${String(target.id || '')}`;
            const existing = entriesByKey.get(key);
            if (existing) {
                existing.secondState = existing.secondState || secondState;
                continue;
            }
            const entry = { target, pseudoElement: rule.pseudoElement || '', secondState };
            entriesByKey.set(key, entry);
            entries.push(entry);
            target.setAttribute?.(LABELED_CHECKED_VERIFY_TARGET_ATTR, 'true');
            if (entries.length >= 12) return entries;
        }
    }
    return entries;
}

function captureLabeledCheckedTargetState(entry) {
    const target = entry?.target;
    if (!target) return null;
    let computed = null;
    let pseudo = null;
    try {
        computed = typeof getComputedStyle === 'function' ? getComputedStyle(target) : null;
        if (entry.pseudoElement && typeof getComputedStyle === 'function') pseudo = getComputedStyle(target, entry.pseudoElement);
    } catch {
        computed = null;
        pseudo = null;
    }
    let rect = { width: 0, height: 0 };
    try {
        rect = target.getBoundingClientRect?.() || rect;
    } catch {
        // ignore
    }
    const opacity = Number.parseFloat(computed?.opacity || '1');
    return {
        display: String(computed?.display || ''),
        visibility: String(computed?.visibility || ''),
        opacity: Number.isFinite(opacity) ? opacity : 1,
        width: Number(rect.width || 0),
        height: Number(rect.height || 0),
        color: String(computed?.color || ''),
        backgroundColor: String(computed?.backgroundColor || ''),
        transform: String(computed?.transform || ''),
        content: String(pseudo?.content || ''),
    };
}

function labeledCheckedTargetStateChanged(before, after) {
    if (!before || !after) return false;
    for (const key of ['display', 'visibility', 'color', 'backgroundColor', 'transform', 'content']) {
        if (String(before[key] || '') !== String(after[key] || '')) return true;
    }
    if (Math.abs(Number(before.opacity || 0) - Number(after.opacity || 0)) > 0.02) return true;
    if (Math.abs(Number(before.width || 0) - Number(after.width || 0)) > 1) return true;
    if (Math.abs(Number(before.height || 0) - Number(after.height || 0)) > 1) return true;
    return false;
}

function prepareLabeledCheckedVerification(root, input) {
    const labels = getAssociatedCheckableLabels(root, input);
    const targets = collectLabeledCheckedVerificationTargets(root, input);
    return {
        labels,
        targets,
        before: targets.map(entry => captureLabeledCheckedTargetState(entry)),
        beforeChecked: !!input?.checked,
    };
}

function recordLabeledCheckedVerification(root, input, verification, intended, phase, corrected = false) {
    if (!root || !input || !verification) return false;
    const after = verification.targets.map(entry => captureLabeledCheckedTargetState(entry));
    const changedFlags = after.map((snapshot, index) => labeledCheckedTargetStateChanged(verification.before[index], snapshot));
    const changedCount = changedFlags.filter(Boolean).length;
    const secondStateTargetCount = verification.targets.filter(entry => entry.secondState).length;
    const secondStateChangedCount = verification.targets.reduce((count, entry, index) => (
        count + (entry.secondState && changedFlags[index] ? 1 : 0)
    ), 0);
    const checkedMatched = !!input.checked === !!intended;
    const visualMatched = secondStateTargetCount > 0 && secondStateChangedCount > 0;
    const matched = checkedMatched && visualMatched;
    const identity = String(input.id || input.name || input.type || 'control').slice(0, 100);
    const status = matched ? 'verified' : (corrected ? 'corrected' : 'failed');
    input.setAttribute(LABELED_CHECKED_VERIFY_CONTROL_ATTR, status);
    input.setAttribute('aria-pressed', input.checked ? 'true' : 'false');
    root.setAttribute(LABELED_CHECKED_VERIFY_LAST_ATTR, `${identity}:${verification.beforeChecked ? '1' : '0'}>${intended ? '1' : '0'}=${input.checked ? '1' : '0'};targets=${verification.targets.length};changed=${changedCount};second=${secondStateChangedCount}/${secondStateTargetCount}@${phase}:${status}`);
    return matched;
}

function cancelLabeledCheckedTransitionVerification(input) {
    const state = labeledCheckedVerificationStates.get(input);
    if (!state) return;
    state.sequence = (state.sequence || 0) + 1;
}

function scheduleLabeledCheckedTransitionVerification(root, input, verification, intended, phase = 'label-click') {
    if (!root || !input || !verification) return;
    const state = labeledCheckedVerificationStates.get(input) || { verifiedCount: 0, correctionCount: 0, sequence: 0 };
    const sequence = (state.sequence || 0) + 1;
    state.sequence = sequence;
    labeledCheckedVerificationStates.set(input, state);
    for (const delay of [0, 70, 240]) {
        setTimeout(() => {
            if (state.sequence !== sequence) return;
            if (!root.isConnected || !input.isConnected || !root.contains(input)) return;
            let corrected = false;
            if (!!input.checked !== !!intended) {
                setRescuedCheckedState(root, input, intended);
                corrected = true;
                state.correctionCount += 1;
            } else {
                applyCheckedVisualFallback(root, input);
                applyRenderedLabelInternalHiddenEntries(root);
            }
            const matched = recordLabeledCheckedVerification(root, input, verification, intended, `${phase}+${delay}ms`, corrected);
            if (matched) state.verifiedCount += 1;
        }, delay);
    }
}

function installLabeledCheckedVerificationFallback(root) {
    if (!root?.querySelectorAll) return 0;
    let count = 0;
    for (const input of root.querySelectorAll('input[type="checkbox"], input[type="radio"]')) {
        if (input.hasAttribute?.(DETACHED_CHECKED_HAS_CONTROL_ATTR)) {
            input.removeAttribute?.(LABELED_CHECKED_VERIFY_CONTROL_ATTR);
            continue;
        }
        if (input.disabled || !inputHasAssociatedLabel(root, input) || !inputHasMeaningfulCheckedSiblingRule(root, input)) {
            input.removeAttribute?.(LABELED_CHECKED_VERIFY_CONTROL_ATTR);
            continue;
        }
        const verification = prepareLabeledCheckedVerification(root, input);
        if (!verification.labels.length || !verification.targets.some(entry => entry.secondState)) continue;
        if (!input.hasAttribute(LABELED_CHECKED_VERIFY_CONTROL_ATTR)) input.setAttribute(LABELED_CHECKED_VERIFY_CONTROL_ATTR, 'ready');
        count += 1;
    }
    if (count) root.setAttribute(LABELED_CHECKED_VERIFY_ROOT_ATTR, String(count));
    else {
        root.removeAttribute(LABELED_CHECKED_VERIFY_ROOT_ATTR);
        root.removeAttribute(LABELED_CHECKED_VERIFY_LAST_ATTR);
    }
    return count;
}

const MAINTENANCE_CHECKED_SANDBOX_ATTR = 'data-rabbit-mirror-maintenance-checked-sandbox';

function maintenanceProbeElementPath(ancestor, element) {
    if (!ancestor || !element) return null;
    if (ancestor === element) return [];
    const path = [];
    let current = element;
    while (current && current !== ancestor) {
        const parent = current.parentElement;
        if (!parent) return null;
        const index = [...parent.children].indexOf(current);
        if (index < 0) return null;
        path.unshift(index);
        current = parent;
    }
    return current === ancestor ? path : null;
}

function maintenanceProbeElementAtPath(ancestor, path) {
    let current = ancestor;
    for (const index of path || []) {
        current = current?.children?.[index] || null;
        if (!current) return null;
    }
    return current;
}

function sanitizeMaintenanceProbeClone(clone) {
    if (!clone?.querySelectorAll) return;
    clone.querySelectorAll(`script, iframe, object, embed, [${INTERACTION_DIAGNOSTIC_PANEL_ATTR}], [${MAINTENANCE_MENU_ATTR}], [${FEEDBACK_CAT_MENU_ATTR}], [${MAINTENANCE_RABBIT_ATTR}], [${FEEDBACK_CAT_ATTR}], [${TOOL_ENTRY_HOST_ATTR}]`)
        .forEach(node => node.remove());
    clone.querySelectorAll('*').forEach(element => {
        for (const attribute of [...element.attributes]) {
            if (/^on[a-z]+$/i.test(attribute.name)) element.removeAttribute(attribute.name);
        }
        if (element.matches?.('audio, video')) {
            element.preload = 'none';
            element.autoplay = false;
        }
        if (element.matches?.('img')) element.loading = 'lazy';
    });
}

function createMaintenanceLabeledCheckedProbeSandbox(root) {
    if (!root?.cloneNode || typeof document === 'undefined' || !document.body) return null;
    const shell = root.closest?.('toto') || root;
    const rootPath = maintenanceProbeElementPath(shell, root);
    if (!rootPath) return null;

    const cloneShell = shell.cloneNode(true);
    sanitizeMaintenanceProbeClone(cloneShell);
    const cloneRoot = maintenanceProbeElementAtPath(cloneShell, rootPath);
    if (!cloneRoot?.querySelectorAll) return null;

    const host = document.createElement('div');
    host.setAttribute(MAINTENANCE_CHECKED_SANDBOX_ATTR, 'true');
    host.setAttribute('aria-hidden', 'true');
    host.inert = true;
    const width = Math.max(280, Math.min(960, Math.round(root.getBoundingClientRect?.().width || 360)));
    host.style.cssText = `all:initial!important;position:fixed!important;left:-100000px!important;top:0!important;width:${width}px!important;min-height:1px!important;opacity:0!important;pointer-events:none!important;overflow:hidden!important;contain:layout style paint!important;z-index:-2147483648!important;`;

    let mount = host;
    try {
        const shadow = host.attachShadow?.({ mode: 'closed' });
        if (shadow) mount = shadow;
    } catch {
        mount = host;
    }
    const quietStyle = document.createElement('style');
    quietStyle.textContent = '*,:before,:after{animation:none!important;transition:none!important;scroll-behavior:auto!important;}';
    mount.append(quietStyle, cloneShell);
    document.body.appendChild(host);
    return { host, root: cloneRoot, destroy: () => host.remove() };
}

function applyMaintenanceSandboxCheckedState(root, input, nextChecked) {
    if (!root || !input || input.disabled) return false;
    if (input.type === 'radio') {
        const radioName = String(input.name || '');
        [...root.querySelectorAll('input[type="radio"]')]
            .filter(item => item !== input && (!radioName || item.name === radioName))
            .forEach(item => { item.checked = false; });
        input.checked = true;
    } else {
        input.checked = !!nextChecked;
    }
    applyCheckedVisualFallback(root, input);
    applyRenderedLabelInternalHiddenEntries(root);
    input.setAttribute('aria-pressed', input.checked ? 'true' : 'false');
    try { void input.offsetHeight; } catch {}
    return !!input.checked === (input.type === 'radio' ? true : !!nextChecked);
}

function scheduleMaintenanceLabeledCheckedProbe(root, diagnosticState) {
    if (!root?.querySelectorAll) return 0;
    const renderedStateInputs = root.querySelectorAll('input[type="checkbox"], input[type="radio"]').length;
    const rawMessage = getRawAssistantMessageForRenderedRoot(root);
    const rawRoot = chooseMatchingRawRabbitMirrorRoot(rawMessage, root);
    const rawStateInputs = rawRoot?.querySelectorAll?.('input[type="checkbox"], input[type="radio"]')?.length || 0;
    if (!renderedStateInputs && !rawStateInputs) {
        diagnosticState?.events?.push?.('maintenance-sandbox-probe:not-applicable;原始与渲染均无checkbox/radio，无需验证');
        return 0;
    }
    if (Number.parseInt(root.getAttribute?.(DETACHED_CHECKED_HAS_RULE_COUNT_ATTR) || '0', 10) > 0) {
        diagnosticState?.events?.push?.('maintenance-sandbox-probe:detached-has-route-present;控件与正文状态桥接已安装，未操作真实控件');
        return 0;
    }
    const sandbox = createMaintenanceLabeledCheckedProbeSandbox(root);
    if (!sandbox) {
        diagnosticState?.events?.push?.('maintenance-sandbox-probe:unavailable;未操作真实控件');
        return 0;
    }

    const sandboxRoot = sandbox.root;
    const input = [...sandboxRoot.querySelectorAll('input[type="checkbox"]')].find(candidate => (
        !candidate.disabled
        && inputHasAssociatedLabel(sandboxRoot, candidate)
        && inputHasMeaningfulCheckedSiblingRule(sandboxRoot, candidate)
        && collectLabeledCheckedVerificationTargets(sandboxRoot, candidate).some(entry => entry.secondState)
    ));
    if (!input) {
        sandbox.destroy();
        diagnosticState?.events?.push?.('maintenance-sandbox-probe:no-safe-candidate;未操作真实控件');
        return 0;
    }

    const originalChecked = !!input.checked;
    const intended = !originalChecked;
    const verification = prepareLabeledCheckedVerification(sandboxRoot, input);
    if (!verification.targets.some(entry => entry.secondState)) {
        sandbox.destroy();
        diagnosticState?.events?.push?.('maintenance-sandbox-probe:no-second-state;未操作真实控件');
        return 0;
    }

    diagnosticState?.events?.push?.(`maintenance-sandbox-probe:scheduled target=${diagnosticElementName(input)} intended=${intended};真实控件未操作`);

    setTimeout(() => {
        if (!sandbox.host.isConnected || !input.isConnected) return;
        const applied = applyMaintenanceSandboxCheckedState(sandboxRoot, input, intended);
        diagnosticState?.events?.push?.(`maintenance-sandbox-probe:state-set checked=${input.checked} applied=${applied};无click/change/input事件`);
    }, 30);

    setTimeout(() => {
        if (!sandbox.host.isConnected || !input.isConnected) return;
        const matched = recordLabeledCheckedVerification(sandboxRoot, input, verification, intended, 'maintenance-sandbox-probe-observe', false);
        const evidence = String(sandboxRoot.getAttribute?.(LABELED_CHECKED_VERIFY_LAST_ATTR) || '');
        if (evidence) root.setAttribute?.(LABELED_CHECKED_VERIFY_LAST_ATTR, evidence);
        diagnosticState?.events?.push?.(`maintenance-sandbox-probe:observed checked=${input.checked} matched=${matched};真实控件保持原状`);
    }, 150);

    setTimeout(() => {
        sandbox.destroy();
        diagnosticState?.events?.push?.('maintenance-sandbox-probe:destroyed;隐藏副本已删除');
    }, 310);
    return 1;
}

function installInteractionLabelFallback(toto) {
    if (!toto || interactionLabelFallbackRoots.has(toto)) return;

    // 使用捕获阶段，避免主题或其他插件在内部 stopPropagation 后导致 label 完全点不开。
    toto.addEventListener('click', (event) => {
        const label = event.target?.closest?.('label');
        if (!label || !toto.contains(label)) return;

        const targetId = label.getAttribute('for');
        const input = targetId
            ? [...toto.querySelectorAll('input[id]')].find(el => el.id === targetId)
            : label.querySelector('input[type="checkbox"], input[type="radio"]');
        if (!input || !/^(?:checkbox|radio)$/i.test(input.type || '') || input.disabled) return;
        const labeledVerification = input.hasAttribute?.(DETACHED_CHECKED_HAS_CONTROL_ATTR)
            ? null
            : prepareLabeledCheckedVerification(toto, input);
        // 双向频道／画面切换由专项路线独占，避免通用 label 兜底把“返回”控件重新勾上。
        if (input.hasAttribute(PAIRED_CHECKED_STATE_CONTROL_ATTR)) return;

        // 浏览器/主题层有时不会可靠触发隐藏 input；只在当前兔子镜内手动完成一次。
        event.preventDefault();
        const previous = !!input.checked;
        const intendedChecked = input.type === 'radio' ? true : !previous;
        if (input.type === 'radio') {
            // 先恢复同组上一分支由急救器写入的内联状态，再切换到当前分支。
            const radioName = String(input.name || '');
            [...toto.querySelectorAll('input[type="radio"]')]
                .filter(item => item !== input && (!radioName || item.name === radioName))
                .forEach(item => restoreInteractionInlineOverrides(item));
            input.checked = true;
        } else {
            input.checked = !input.checked;
        }

        // 在部分移动端 WebView 中，晚到的 <style> 即使被补上 !important，
        // 也可能未稳定覆盖元素原有的内联 display:none。这里直接按真实 :checked
        // 规则把状态声明落到匹配目标上，取消勾选时再恢复，作为最终兜底。
        // 先走不依赖 CSSOM 的文本解析兜底；酒馆/WebView 即使不给 style.sheet，仍能修复。
        // 文本规则命中后不要再运行 CSSOM 兜底，否则后者开头的恢复动作会撤销刚应用的状态。
        applyCheckedVisualFallback(toto, input);
        // label 内隐藏正文已有明确结构路线时，立即按本次 intended checked 状态落地，
        // 不只依赖后续冒泡 change；部分 WebView 会延迟或吞掉合成事件。
        applyRenderedLabelInternalHiddenEntries(toto);

        if (previous !== input.checked) {
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (labeledVerification) {
            scheduleLabeledCheckedTransitionVerification(toto, input, labeledVerification, intendedChecked, 'label-click');
        } else {
            input.removeAttribute?.(LABELED_CHECKED_VERIFY_CONTROL_ATTR);
            toto.removeAttribute?.(LABELED_CHECKED_VERIFY_LAST_ATTR);
        }

        // 某些移动 WebView 会在捕获阶段 preventDefault 后仍执行一次迟到的原生 label 切换，
        // 使 checkbox 刚被急救器设为 true 又立刻回到 false。下一任务强制确认本次意图，
        // 仅在状态被回滚时补发一次 input/change，不造成正常环境的双重切换。
        setTimeout(() => {
            if (!input.isConnected || input.checked === intendedChecked) return;
            input.checked = intendedChecked;
            restoreInteractionInlineOverrides(input);
            applyCheckedVisualFallback(toto, input);
            applyRenderedLabelInternalHiddenEntries(toto);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }, 0);
    }, true);

    interactionLabelFallbackRoots.add(toto);
    toto.dataset.rabbitMirrorInteractionFallback = 'true';
}

function collectExistingIdReferences(text, existingIds, output) {
    const value = String(text || '');
    // 按 DOM 中真实存在的 ID 精确匹配，避免把 :checked / :hover 等伪类误当成 ID 的一部分。
    for (const id of existingIds) {
        const escaped = escapeRegExp(id);
        if (new RegExp(`#${escaped}(?![\\w-])`).test(value)
            || new RegExp(`url\\(\\s*["']?#${escaped}(?:["']?\\s*)\\)`, 'i').test(value)
            || new RegExp(`\\[\\s*id\\s*=\\s*["']${escaped}["']\\s*\\]`, 'i').test(value)) {
            output.add(id);
        }
    }
}

function collectUrlIdReferences(text, existingIds, output) {
    const pattern = /url\(\s*["']?#([^\s)"']+)/gi;
    let match;
    while ((match = pattern.exec(String(text || '')))) {
        const id = match[1];
        if (existingIds.has(id)) output.add(id);
    }
}

function buildElementsById(toto) {
    const elementsById = new Map();
    toto.querySelectorAll('[id]').forEach(el => {
        const id = String(el.id || '').trim();
        if (!id) return;
        if (!elementsById.has(id)) elementsById.set(id, []);
        elementsById.get(id).push(el);
    });
    return elementsById;
}

function collectCurrentIdsToScope(toto, elementsById, mappedValues = new Set()) {
    const existingIds = new Set(elementsById.keys());
    const idsToScope = new Set();
    const controls = [...toto.querySelectorAll('input[type="checkbox"], input[type="radio"]')];

    controls.forEach(input => {
        const id = String(input.id || '').trim();
        if (id && !mappedValues.has(id)) idsToScope.add(id);
    });

    toto.querySelectorAll('label[for], [href^="#"], [xlink\\:href^="#"], [aria-controls], [aria-labelledby], [aria-describedby]').forEach(el => {
        const forValue = el.getAttribute('for');
        if (forValue && existingIds.has(forValue) && !mappedValues.has(forValue)) idsToScope.add(forValue);
        for (const attr of ['href', 'xlink:href']) {
            const value = el.getAttribute(attr);
            const id = value?.startsWith('#') ? value.slice(1) : '';
            if (id && existingIds.has(id) && !mappedValues.has(id)) idsToScope.add(id);
        }
        for (const attr of ['aria-controls', 'aria-labelledby', 'aria-describedby']) {
            const value = el.getAttribute(attr);
            if (value) value.split(/\s+/).filter(Boolean).forEach(id => {
                if (existingIds.has(id) && !mappedValues.has(id)) idsToScope.add(id);
            });
        }
    });

    getRabbitMirrorLocalStyleElements(toto).forEach(styleEl => {
        collectExistingIdReferences(styleEl.textContent, existingIds, idsToScope);
    });
    toto.querySelectorAll('*').forEach(el => {
        for (const attr of [...(el.attributes || [])]) {
            if (!attr?.value || /^(?:id|class)$/i.test(attr.name)) continue;
            collectUrlIdReferences(attr.value, existingIds, idsToScope);
            if (/^(?:begin|end)$/i.test(attr.name) && attr.value.includes('.')) {
                for (const id of existingIds) {
                    if (!mappedValues.has(id) && new RegExp(`(^|[;\\s])${escapeRegExp(id)}(?=\\.)`).test(attr.value)) idsToScope.add(id);
                }
            }
        }
    });

    return { controls, idsToScope };
}

function synchronizeInteractionReferences(toto, idMap) {
    if (!idMap?.size) return;

    toto.querySelectorAll('label[for]').forEach(label => {
        const oldFor = label.getAttribute('for');
        if (idMap.has(oldFor)) label.setAttribute('for', idMap.get(oldFor));
    });

    toto.querySelectorAll('[href^="#"], [xlink\\:href^="#"]').forEach(el => {
        for (const attr of ['href', 'xlink:href']) {
            const value = el.getAttribute(attr);
            if (!value?.startsWith('#')) continue;
            const oldId = value.slice(1);
            if (idMap.has(oldId)) el.setAttribute(attr, `#${idMap.get(oldId)}`);
        }
    });

    for (const attr of ['aria-controls', 'aria-labelledby', 'aria-describedby']) {
        toto.querySelectorAll(`[${attr}]`).forEach(el => {
            el.setAttribute(attr, replaceIdReferenceTokens(el.getAttribute(attr), idMap));
        });
    }

    // 流式生成时 <style> 往往最后才到达。每次扫描都重新同步，避免旧 ID 留在晚到的 CSS 中。
    getRabbitMirrorLocalStyleElements(toto).forEach(styleEl => {
        const currentText = String(styleEl.textContent || '');
        const rewrittenText = rewriteCssIdReferences(currentText, idMap);
        // 仅在内容确实变化时重建样式表。无条件写回会触发 MutationObserver，
        // 让 @keyframes 动画不断从 0 秒重启，视觉上表现为完全静止。
        if (rewrittenText !== currentText) styleEl.textContent = rewrittenText;
    });

    // 同步所有属性中的 url(#id)，覆盖 SVG 的 fill/stroke/filter/clip-path/mask/marker 等。
    toto.querySelectorAll('*').forEach(el => {
        for (const attr of [...(el.attributes || [])]) {
            if (!attr?.value) continue;
            if (/url\(\s*["']?#/i.test(attr.value)) {
                el.setAttribute(attr.name, rewriteCssIdReferences(attr.value, idMap));
            } else if (/^(?:begin|end)$/i.test(attr.name) && attr.value.includes('.')) {
                el.setAttribute(attr.name, rewriteSmilIdReferences(attr.value, idMap));
            }
        }
    });
}

function recoverInteractionScopeState(toto) {
    const idMap = new Map();
    let prefix = '';
    toto.querySelectorAll('[id]').forEach(el => {
        const currentId = String(el.id || '').trim();
        const match = currentId.match(SCOPED_INTERACTION_ID_RE);
        if (!match) return;
        prefix ||= match[1];
        if (match[1] === prefix && match[2]) idMap.set(match[2], currentId);
    });
    return idMap.size ? { prefix, idMap } : null;
}

function inspectSanitizedRadioGroupLoss(root) {
    const empty = { candidateCount: 0, rescuedCount: 0, groups: [] };
    if (!root?.querySelectorAll) return empty;
    const rawMessage = getRawAssistantMessageForRenderedRoot(root);
    const rawRoot = chooseMatchingRawRabbitMirrorRoot(rawMessage, root);
    if (!rawRoot?.querySelectorAll) {
        return {
            ...empty,
            rescuedCount: Number.parseInt(root.getAttribute?.(RADIO_GROUP_ROOT_ATTR) || '0', 10) || 0,
        };
    }

    const rawRadios = [...rawRoot.querySelectorAll('input[type="radio"]')];
    const renderedRadios = [...root.querySelectorAll('input[type="radio"]')];
    if (!rawRadios.length || rawRadios.length !== renderedRadios.length) {
        return {
            ...empty,
            rescuedCount: Number.parseInt(root.getAttribute?.(RADIO_GROUP_ROOT_ATTR) || '0', 10) || 0,
        };
    }

    const groups = new Map();
    rawRadios.forEach((rawInput, index) => {
        const rawName = String(rawInput.getAttribute('name') || '').trim();
        if (!rawName) return;
        if (!groups.has(rawName)) groups.set(rawName, []);
        groups.get(rawName).push({ rawInput, renderedInput: renderedRadios[index] || null });
    });

    const candidates = [];
    for (const [rawName, entries] of groups) {
        if (entries.length < 2 || entries.some(entry => !entry.renderedInput)) continue;
        const renderedNames = entries.map(entry => String(entry.renderedInput.getAttribute('name') || '').trim());
        const sameNonEmptyName = renderedNames.every(name => name && name === renderedNames[0]);
        const rescueMarked = entries.every(entry => entry.renderedInput.hasAttribute(RADIO_GROUP_RESCUE_ATTR));
        const checkedCount = entries.filter(entry => entry.renderedInput.checked).length;
        if (!sameNonEmptyName || !rescueMarked || checkedCount > 1) {
            candidates.push({ rawName, entries, renderedNames, checkedCount });
        }
    }

    return {
        candidateCount: candidates.length,
        rescuedCount: Number.parseInt(root.getAttribute?.(RADIO_GROUP_ROOT_ATTR) || '0', 10) || 0,
        groups: candidates,
    };
}

function restoreSanitizedRadioGroups(root, scopePrefix = '') {
    if (!root?.querySelectorAll) return 0;
    const inspection = inspectSanitizedRadioGroupLoss(root);
    if (!inspection.groups.length) {
        const existing = root.querySelectorAll?.(`[${RADIO_GROUP_RESCUE_ATTR}]`)?.length || 0;
        if (!existing) root.removeAttribute?.(RADIO_GROUP_ROOT_ATTR);
        return Number.parseInt(root.getAttribute?.(RADIO_GROUP_ROOT_ATTR) || '0', 10) || 0;
    }

    for (const group of inspection.groups) {
        const scopedName = `${scopePrefix || ''}${group.rawName}`;
        const groupToken = `g${hashInteractionSignature(scopedName).slice(0, 10)}`;
        const renderedInputs = group.entries.map(entry => entry.renderedInput).filter(Boolean);
        if (renderedInputs.length < 2) continue;

        const checkedInputs = renderedInputs.filter(input => input.checked);
        const focused = renderedInputs.includes(globalThis.document?.activeElement)
            ? globalThis.document.activeElement
            : null;
        const rawDefaultEntry = [...group.entries].reverse().find(entry => entry.rawInput.hasAttribute('checked')) || null;
        let preferred = null;
        if (checkedInputs.length === 1) preferred = checkedInputs[0];
        else if (checkedInputs.length > 1) preferred = focused && focused.checked ? focused : checkedInputs[checkedInputs.length - 1];
        else if (rawDefaultEntry) preferred = rawDefaultEntry.renderedInput;

        for (const input of renderedInputs) {
            if (String(input.getAttribute('name') || '') !== scopedName) {
                input.setAttribute('name', scopedName);
            }
            input.setAttribute(RADIO_GROUP_RESCUE_ATTR, groupToken);
        }

        if (preferred) {
            for (const input of renderedInputs) {
                const shouldCheck = input === preferred;
                input.checked = shouldCheck;
                if (!shouldCheck) restoreInteractionInlineOverrides(input);
            }
            applyCheckedVisualFallback(root, preferred);
        } else {
            for (const input of renderedInputs) {
                input.checked = false;
                restoreInteractionInlineOverrides(input);
            }
        }
    }

    const liveGroups = new Set(
        [...root.querySelectorAll(`[${RADIO_GROUP_RESCUE_ATTR}]`)]
            .map(input => String(input.getAttribute(RADIO_GROUP_RESCUE_ATTR) || ''))
            .filter(Boolean),
    ).size;
    if (liveGroups) root.setAttribute(RADIO_GROUP_ROOT_ATTR, String(liveGroups));
    else root.removeAttribute(RADIO_GROUP_ROOT_ATTR);
    return liveGroups;
}

function scopeRabbitMirrorInteractionIds(toto, { installRescue = true } = {}) {
    if (!toto?.querySelector) return;

    // WeakMap 记录同一 DOM 在流式生成期间的映射；旧版本留下的 data 标记则从已加前缀的 ID 中恢复。
    let state = interactionScopeStates.get(toto);
    if (!state && toto.dataset.rabbitMirrorInteractionScoped === 'true') {
        state = recoverInteractionScopeState(toto);
        if (state) interactionScopeStates.set(toto, state);
        else delete toto.dataset.rabbitMirrorInteractionScoped;
    }

    if (!state) {
        state = { prefix: createInteractionScopePrefix(), idMap: new Map() };
        interactionScopeStates.set(toto, state);
    }

    // DOMPurify/宿主可能移除 radio 的 name，原本的单选组会退化成多个可同时 checked 的独立控件。
    // 从同一条消息的原始兔子镜按 radio 顺序恢复组名，并使用当前镜面前缀隔离跨消息碰撞。
    const restoredRadioGroupCount = restoreSanitizedRadioGroups(toto, state.prefix);

    const mappedValues = new Set(state.idMap.values());
    const elementsById = buildElementsById(toto);
    const { controls, idsToScope } = collectCurrentIdsToScope(toto, elementsById, mappedValues);

    // 新到达的交互控件或 SVG/CSS 引用只追加到原映射，不会给已有 ID 再套第二层前缀。
    for (const oldId of idsToScope) {
        if (state.idMap.has(oldId) || mappedValues.has(oldId) || !elementsById.has(oldId)) continue;
        const newId = `${state.prefix}${oldId}`;
        state.idMap.set(oldId, newId);
        mappedValues.add(newId);
        for (const el of elementsById.get(oldId) || []) el.id = newId;
    }

    controls.filter(input => input.type === 'radio' && input.hasAttribute('name')).forEach(input => {
        const name = input.getAttribute('name') || '';
        if (name && !name.startsWith(state.prefix)) input.name = `${state.prefix}${name}`;
    });

    synchronizeInteractionReferences(toto, state.idMap);
    if (installRescue) installIntelligentInteractionRescue(toto);
    toto.dataset.rabbitMirrorInteractionScoped = 'true';
    return { scopedIdCount: state.idMap.size, radioGroupCount: restoredRadioGroupCount };
}

export function isolateRabbitMirrorInteractionIds(root) {
    return scopeRabbitMirrorInteractionIds(root, { installRescue: false });
}

function getRenderedRabbitMirrorInteractionRoots(root) {
    if (!root?.querySelectorAll) return [];
    const candidates = new Set(root.querySelectorAll(MIRROR_TOTO_SELECTOR));

    // 部分酒馆渲染/净化链会移除未知的 <toto> 外壳，但保留带“兔子镜”标题的 <details>。
    // 代码块急救原本已有该兼容路径；交互急救也必须识别同一类实际渲染结果。
    root.querySelectorAll('details').forEach(details => {
        if (!isRabbitMirrorDetails(details)) return;
        if (details.closest(MIRROR_TOTO_SELECTOR)) return;
        candidates.add(details);
    });

    return [...candidates];
}


// beta.14.48: keep the automatic-frame removal migration, but do not render or infer any new frame color.
// Clean attributes and CSS variables written by beta.14.35-14.46 so cached mirrors
// immediately return to the original external-frame rendering without touching generated content.
function clearLegacyRabbitMirrorAutoFrameArtifacts(root) {
    if (!root) return;
    const targets = new Set();
    if (root.nodeType === 1) targets.add(root);
    root.closest?.('.rabbit-mirror-external-shell[data-rm-source="independent"]') && targets.add(root.closest('.rabbit-mirror-external-shell[data-rm-source="independent"]'));
    root.querySelectorAll?.('[data-rabbit-mirror-auto-frame], [data-rabbit-mirror-auto-frame-version], [data-rabbit-mirror-auto-frame-source], [data-rabbit-mirror-auto-frame-preserved], [style*="--rm-auto-frame-"]').forEach(node => targets.add(node));

    for (const target of targets) {
        target.removeAttribute?.('data-rabbit-mirror-auto-frame');
        target.removeAttribute?.('data-rabbit-mirror-auto-frame-version');
        target.removeAttribute?.('data-rabbit-mirror-auto-frame-source');
        target.removeAttribute?.('data-rabbit-mirror-auto-frame-preserved');
        if (!target.style) continue;
        for (const name of [
            '--rm-auto-frame-base',
            '--rm-auto-frame-summary',
            '--rm-auto-frame-border',
            '--rm-auto-frame-surface',
            '--rm-auto-frame-text',
            '--rm-auto-frame-shadow',
        ]) target.style.removeProperty(name);
        if (!String(target.getAttribute?.('style') || '').trim()) target.removeAttribute?.('style');
    }
}


// 一次性兔子镜总诊断：用户启动后点击一条异常消息。
// 既可捕获已渲染兔子镜交互，也可捕获尚未恢复的代码块/纯文字兔子镜消息；约 650ms 后自动停止。
const INTERACTION_DIAGNOSTIC_PANEL_ATTR = 'data-rabbit-mirror-interaction-diagnostic';

// 0.33.7: 维修兔 v1.6。把既有代码块、纯文字、源码/SVG、CSS作用域与完整交互急救库接入逐条维修流水线。
// 设计底线：没有高置信证据就不修改；黄灯才允许调用已有修复路线，红灯只生成诊断。
const MAINTENANCE_RABBIT_ATTR = 'data-rabbit-mirror-maintenance-rabbit';
const MAINTENANCE_STATE_ATTR = 'data-rabbit-mirror-maintenance-state';
const MAINTENANCE_REASON_ATTR = 'data-rabbit-mirror-maintenance-reason';
const MAINTENANCE_REPAIR_ATTR = 'data-rabbit-mirror-maintenance-repaired';
const MAINTENANCE_MENU_ATTR = 'data-rabbit-mirror-maintenance-menu';
const INDEPENDENT_REPAIR_PERSIST_EVENT = 'rabbitmirror:independent-repair-persist';
const maintenancePreRepairSnapshots = new Map();
const MAINTENANCE_AUTO_SAFE_ATTR = 'data-rabbit-mirror-auto-safe-maintenance';
const MAINTENANCE_AUTO_SAFE_RESULT_ATTR = 'data-rabbit-mirror-auto-safe-result';
const MAINTENANCE_AUTO_SAFE_VERSION = 'safe-v2-state-preserving';
const FEEDBACK_CAT_ATTR = 'data-rabbit-mirror-feedback-cat';
const RESAY_ATTR = 'data-rabbit-mirror-resay';
const FEEDBACK_CAT_MENU_ATTR = 'data-rabbit-mirror-feedback-cat-menu';
const FEEDBACK_RESAY_EVENT = 'rabbitmirror:resay';
const FEEDBACK_HISTORY_EVENT = 'rabbitmirror:history';
const SELECTION_ONLY_FALLBACK_ATTR = 'data-rabbit-mirror-selection-only-fallback';
const SELECTION_ONLY_PLACEHOLDER_ATTR = 'data-rabbit-mirror-selection-only-placeholder';
const SELECTION_ONLY_SOURCE_ATTR = 'data-rabbit-mirror-selection-only-source';
const DISABLED_ONLY_CHOICE_RESCUE_ATTR = 'data-rabbit-mirror-disabled-choice-rescue';
const DISABLED_ONLY_CHOICE_CONTROL_ATTR = 'data-rm-disabled-choice-control';
const INERT_ACTION_BUTTON_RESCUE_ATTR = 'data-rabbit-mirror-inert-action-rescue';
const INERT_ACTION_STATUS_ATTR = 'data-rabbit-mirror-inert-action-status';
const STATIC_CHOICE_SELECTION_RESCUE_ATTR = 'data-rabbit-mirror-static-choice-selection-rescue';
const STATIC_CHOICE_SELECTION_ITEM_ATTR = 'data-rm-static-choice-item';
const STATIC_CHOICE_SELECTION_SELECTED_ATTR = 'data-rm-static-choice-selected';
const STATIC_CHOICE_SELECTION_COUNT_ATTR = 'data-rabbit-mirror-static-choice-selection-count';
const STATIC_CHOICE_SELECTION_STYLE_ATTR = 'data-rabbit-mirror-static-choice-selection-style';
const staticChoiceSelectionRescueStates = new WeakMap();
const STRUCTURED_STATIC_DISCLOSURE_RESCUE_ATTR = 'data-rabbit-mirror-structured-static-disclosure';
const STRUCTURED_STATIC_DISCLOSURE_TRIGGER_ATTR = 'data-rm-structured-static-disclosure-trigger';
const STRUCTURED_STATIC_DISCLOSURE_BODY_ATTR = 'data-rm-structured-static-disclosure-body';
const STRUCTURED_STATIC_DISCLOSURE_OPEN_ATTR = 'data-rm-structured-static-disclosure-open';
const STRUCTURED_STATIC_DISCLOSURE_COUNT_ATTR = 'data-rabbit-mirror-structured-static-disclosure-count';
const STRUCTURED_STATIC_DISCLOSURE_STYLE_ATTR = 'data-rabbit-mirror-structured-static-disclosure-style';
const structuredStaticDisclosureRescueStates = new WeakMap();
const FILL_IN_CHOICE_RESCUE_ATTR = 'data-rabbit-mirror-fill-in-choice-rescue';
const FILL_IN_CHOICE_BLANK_ATTR = 'data-rm-fill-in-choice-blank';
const FILL_IN_CHOICE_ACTIVE_ATTR = 'data-rm-fill-in-choice-active';
const FILL_IN_CHOICE_FILLED_ATTR = 'data-rm-fill-in-choice-filled';
const FILL_IN_CHOICE_CODE_ATTR = 'data-rm-fill-in-choice-code';
const FILL_IN_CHOICE_OPTION_ATTR = 'data-rm-fill-in-choice-option';
const FILL_IN_CHOICE_AVAILABLE_ATTR = 'data-rm-fill-in-choice-available';
const FILL_IN_CHOICE_SELECTED_ATTR = 'data-rm-fill-in-choice-selected';
const FILL_IN_CHOICE_USED_ATTR = 'data-rm-fill-in-choice-used';
const FILL_IN_CHOICE_COUNT_ATTR = 'data-rabbit-mirror-fill-in-choice-count';
const FILL_IN_CHOICE_STYLE_ATTR = 'data-rabbit-mirror-fill-in-choice-style';
const fillInChoiceRescueStates = new WeakMap();
const MOBILE_LAYOUT_RESCUE_STYLE_ATTR = 'data-rabbit-mirror-mobile-layout-rescue';
const MOBILE_LAYOUT_SCOPE_ATTR = 'data-rabbit-mirror-mobile-layout-scope';
const MOBILE_LAYOUT_RESCUE_COUNT_ATTR = 'data-rabbit-mirror-mobile-layout-count';
const MOBILE_LAYOUT_FIT_ATTR = 'data-rm-mobile-fit';
const MOBILE_LAYOUT_MIN_ATTR = 'data-rm-mobile-min';
const MOBILE_LAYOUT_GRID_COLLAPSE_ATTR = 'data-rm-mobile-grid-collapse';
const MOBILE_LAYOUT_MATRIX_PRESERVE_ATTR = 'data-rm-mobile-matrix-preserve';
const MOBILE_LAYOUT_MATRIX_ACTIVE_ATTR = 'data-rm-mobile-matrix-active';
const MOBILE_LAYOUT_MATRIX_CELL_ATTR = 'data-rm-mobile-matrix-cell';
const MOBILE_LAYOUT_FLEX_WRAP_ATTR = 'data-rm-mobile-flex-wrap';
const MOBILE_LAYOUT_FLEX_STACK_ATTR = 'data-rm-mobile-flex-stack';
const MOBILE_LAYOUT_SINGLE_COLUMN_ATTR = 'data-rm-mobile-single-column';
const MOBILE_LAYOUT_FLUID_TITLE_ATTR = 'data-rm-mobile-fluid-title';
const MOBILE_LAYOUT_COMPACT_PADDING_ATTR = 'data-rm-mobile-compact-padding';
const MOBILE_LAYOUT_COMPACT_GAP_ATTR = 'data-rm-mobile-compact-gap';
const MOBILE_LAYOUT_MEDIA_ATTR = 'data-rm-mobile-media';
const MOBILE_LAYOUT_SCROLL_ATTR = 'data-rm-mobile-scroll';
const MOBILE_LAYOUT_BREAK_TEXT_ATTR = 'data-rm-mobile-break-text';
const MOBILE_LAYOUT_STATE_CONTENT_ATTR = 'data-rm-mobile-state-content';
const MOBILE_LAYOUT_STATE_ACTIVE_ATTR = 'data-rm-mobile-state-active';
const MOBILE_LAYOUT_SECTION_STACK_PRESERVE_ATTR = 'data-rm-mobile-section-stack-preserve';
const MOBILE_LAYOUT_SCREEN_SHELL_PRESERVE_ATTR = 'data-rm-mobile-screen-shell-preserve';
const MOBILE_LAYOUT_RELATION_TREE_ATTR = 'data-rm-mobile-relation-tree';
const MOBILE_LAYOUT_RELATION_BRANCH_ATTR = 'data-rm-mobile-relation-branch';
const MOBILE_LAYOUT_RELATION_CELL_ATTR = 'data-rm-mobile-relation-cell';
const MOBILE_LAYOUT_RELATION_DETAIL_ATTR = 'data-rm-mobile-relation-detail';
const MOBILE_LAYOUT_RELATION_SIDE_ATTR = 'data-rm-mobile-relation-side';
const MOBILE_LAYOUT_BREAKPOINT_PX = 640;
const MOBILE_LAYOUT_TARGET_ATTRS = Object.freeze([
    MOBILE_LAYOUT_FIT_ATTR,
    MOBILE_LAYOUT_MIN_ATTR,
    MOBILE_LAYOUT_GRID_COLLAPSE_ATTR,
    MOBILE_LAYOUT_MATRIX_PRESERVE_ATTR,
    MOBILE_LAYOUT_MATRIX_ACTIVE_ATTR,
    MOBILE_LAYOUT_MATRIX_CELL_ATTR,
    MOBILE_LAYOUT_FLEX_WRAP_ATTR,
    MOBILE_LAYOUT_FLEX_STACK_ATTR,
    MOBILE_LAYOUT_SINGLE_COLUMN_ATTR,
    MOBILE_LAYOUT_FLUID_TITLE_ATTR,
    MOBILE_LAYOUT_COMPACT_PADDING_ATTR,
    MOBILE_LAYOUT_COMPACT_GAP_ATTR,
    MOBILE_LAYOUT_MEDIA_ATTR,
    MOBILE_LAYOUT_SCROLL_ATTR,
    MOBILE_LAYOUT_BREAK_TEXT_ATTR,
    MOBILE_LAYOUT_STATE_CONTENT_ATTR,
    MOBILE_LAYOUT_STATE_ACTIVE_ATTR,
    MOBILE_LAYOUT_SECTION_STACK_PRESERVE_ATTR,
    MOBILE_LAYOUT_SCREEN_SHELL_PRESERVE_ATTR,
    MOBILE_LAYOUT_RELATION_TREE_ATTR,
    MOBILE_LAYOUT_RELATION_BRANCH_ATTR,
    MOBILE_LAYOUT_RELATION_CELL_ATTR,
    MOBILE_LAYOUT_RELATION_DETAIL_ATTR,
    MOBILE_LAYOUT_RELATION_SIDE_ATTR,
]);
const mobileLayoutRescueStates = new WeakMap();
const mobileMatrixPreserveStates = new WeakMap();
const mobileInlineAnnotationRescueStates = new WeakMap();
let mobileInlineAnnotationCounter = 0;
let mobileLayoutScopeCounter = 0;
const SOURCE_TRUNCATION_NOTICE_ATTR = 'data-rabbit-mirror-source-truncation-notice';
const MAINTENANCE_STATES = Object.freeze({ idle: 'idle', checking: 'checking', healthy: 'healthy', repairable: 'repairable', unknown: 'unknown' });
const INTERACTION_DIAGNOSTIC_VERSION = '1.1.0-BETA-10-FULL-CHAIN';
const DIAGNOSTIC_WAIT_TIMEOUT_MS = 45000;
const DIAGNOSTIC_SOURCE_LIMIT = 60000;
const interactionDiagnosticStates = new WeakMap();
let oneShotInteractionDiagnosticSession = null;

function diagnosticCompactText(value, maxLength = 80) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function diagnosticComputedStyle(element) {
    try {
        return typeof getComputedStyle === 'function' ? getComputedStyle(element) : null;
    } catch {
        return null;
    }
}

function diagnosticRect(element) {
    try {
        const rect = element?.getBoundingClientRect?.();
        if (!rect) return { width: 0, height: 0 };
        return {
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
        };
    } catch {
        return { width: 0, height: 0 };
    }
}

function diagnosticElementName(element) {
    if (!element) return '(none)';
    const tag = String(element.tagName || 'node').toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const classes = getClassTokens(element).slice(0, 3).map(token => `.${token}`).join('');
    return `${tag}${id}${classes}`;
}

function diagnosticFindClippingAncestor(element, root) {
    let current = element?.parentElement || null;
    for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
        if (current.closest?.(`[${INTERACTION_DIAGNOSTIC_PANEL_ATTR}]`)) return null;
        const style = diagnosticComputedStyle(current);
        const overflow = `${style?.overflow || ''}/${style?.overflowX || ''}/${style?.overflowY || ''}`.toLowerCase();
        const rect = diagnosticRect(current);
        if (/(?:hidden|clip)/.test(overflow) || rect.height <= 1) {
            return `${diagnosticElementName(current)} height=${rect.height}px overflow=${overflow}`;
        }
        if (current === root) break;
    }
    return null;
}

function diagnosticCollectTargets(root) {
    if (!root?.querySelectorAll) return [];
    const semanticSelectors = [
        '.hidden-thought',
        '[class*="hidden"]',
        '[class*="reveal"]',
        '[class*="secret"]',
        `[${RENDERED_BUTTON_ADJACENT_HIDDEN_ITEM_ATTR}]`,
        `[${RENDERED_CSS_STATE_SIBLING_ITEM_ATTR}]`,
    ];
    const seen = new Set();
    const result = [];
    const append = element => {
        if (!element || seen.has(element)) return false;
        if (element.closest?.(`[${INTERACTION_DIAGNOSTIC_PANEL_ATTR}]`)) return false;
        if (element.closest?.(`[${SOURCE_TRUNCATION_NOTICE_ATTR}]`)) return false;
        const tagName = String(element.tagName || '').toLowerCase();
        if (/^(?:input|select|textarea|option|button|label|style|script|template)$/.test(tagName)) return false;
        seen.add(element);
        result.push(element);
        return result.length >= 12;
    };

    // 语义类名或已经登记过的急救目标即使当前可见，也要保留在诊断候选中，
    // 这样可以观察“切换后是否真的出现”。
    for (const element of root.querySelectorAll(semanticSelectors.join(','))) {
        if (append(element)) return result;
    }

    // 样式候选必须按实际数值判断。旧实现用 [style*="opacity:0"]，
    // 会把 opacity:0.7、opacity:0.8 等正常可见装饰误报成隐藏内容。
    for (const element of root.querySelectorAll('[style]')) {
        if (!getRenderedStyleSnapshot(element).hidden) continue;
        if (append(element)) return result;
    }

    // 诊断模式也读取计算样式，覆盖隐藏态仅存在于 <style> 的按钮后置结果。
    for (const button of root.querySelectorAll('button')) {
        const target = findRenderedButtonAdjacentHiddenTarget(button);
        if (append(target)) break;
    }
    return result;
}

function diagnosticFindAssociatedLabel(root, input) {
    if (!input) return null;
    const wrapping = input.closest?.('label');
    if (wrapping) return wrapping;
    if (input.labels?.length) return input.labels[0] || null;
    const id = String(input.id || '');
    if (!id || !root?.querySelectorAll) return null;
    return [...root.querySelectorAll('label[for]')].find(label => String(label.getAttribute('for') || '') === id) || null;
}

function diagnosticRouteSummary(root) {
    return {
        adjacent: renderedAdjacentHiddenGroupRescueStates.get(root)?.entries?.size || 0,
        layers: renderedStateLayerRescueStates.get(root)?.entries?.size || 0,
        labelInternal: renderedLabelInternalHiddenRescueStates.get(root)?.entries?.size || 0,
        labelAdjacent: renderedLabelAdjacentResultRescueStates.get(root)?.entries?.size || 0,
        maskReveal: renderedMaskRevealRescueStates.get(root)?.hosts?.size || 0,
        listDetail: renderedListDetailRescueStates.get(root)?.entries?.size || 0,
        stateSibling: renderedCssStateSiblingRescueStates.get(root)?.entries?.size || 0,
        stateCrossTree: Number.parseInt(root?.getAttribute?.(RENDERED_CSS_STATE_CROSS_TREE_ROOT_ATTR) || '0', 10) || 0,
        buttonAdjacent: renderedButtonAdjacentHiddenRescueStates.get(root)?.entries?.size || 0,
        clickableAdjacent: renderedClickableAdjacentHiddenRescueStates.get(root)?.entries?.size || 0,
        clickablePopup: renderedClickableAdjacentPopupRescueStates.get(root)?.entries?.size || 0,
        checkedIdTarget: renderedCheckedIdTargetRescueStates.get(root)?.entries?.size || 0,
        focusToChecked: Number.parseInt(root?.getAttribute?.(FOCUS_TO_CHECKED_ROOT_ATTR) || '0', 10) || 0,
        checkedTextRule: root?.querySelectorAll?.(`[${CHECKED_TEXT_RULE_RESCUE_ATTR}]`)?.length || 0,
        missingCheckedClass: Number.parseInt(root?.getAttribute?.(MISSING_CHECKED_SUBJECT_CLASS_RESCUE_ATTR) || '0', 10) || 0,
        crossParentChecked: Number.parseInt(root?.getAttribute?.(CROSS_PARENT_CHECKED_ROOT_ATTR) || '0', 10) || 0,
        checkedHasState: Number.parseInt(root?.getAttribute?.(CHECKED_HAS_STATE_RULE_COUNT_ATTR) || '0', 10) || 0,
        detachedCheckedHas: Number.parseInt(root?.getAttribute?.(DETACHED_CHECKED_HAS_RULE_COUNT_ATTR) || '0', 10) || 0,
        pairedCheckedState: Number.parseInt(root?.getAttribute?.(PAIRED_CHECKED_STATE_COUNT_ATTR) || '0', 10) || 0,
        exclusiveStackedState: Number.parseInt(root?.getAttribute?.(EXCLUSIVE_STACKED_STATE_COUNT_ATTR) || '0', 10) || 0,
        channelDialCycle: Number.parseInt(root?.getAttribute?.(CHANNEL_DIAL_CYCLE_COUNT_ATTR) || '0', 10) || 0,
        reversibleChecked: Number.parseInt(root?.getAttribute?.(REVERSIBLE_CHECKED_RESULT_ROOT_ATTR) || '0', 10) || 0,
        radioGroups: Number.parseInt(root?.getAttribute?.(RADIO_GROUP_ROOT_ATTR) || '0', 10) || 0,
        radioReset: Number.parseInt(root?.getAttribute?.(RAW_RADIO_RESET_ROOT_ATTR) || '0', 10) || 0,
        expandedOpacity: root?.querySelectorAll?.(`[${EXPANDED_OPACITY_RESCUE_ATTR}]`)?.length || 0,
        containerReveal: renderedContainerInternalRevealStates.get(root)?.entries?.size || 0,
        selfMutation: rawSelfMutationRescueStates.get(root)?.entries?.size || 0,
        classStateProgram: root?.querySelectorAll?.(`[${DIRECT_ID_CLASS_STATE_RESCUE_ATTR}]`)?.length || 0,
        cssCommentRepair: root?.querySelectorAll?.(`[${MARKDOWN_CSS_COMMENT_RESCUE_ATTR}]`)?.length || 0,
        changeProgram: root?.querySelectorAll?.(`[${CHANGE_PSEUDO_RESCUE_ATTR}]`)?.length || 0,
        focusWithinPersistent: Number.parseInt(root?.getAttribute?.(FOCUS_WITHIN_PERSISTENT_ROOT_ATTR) || '0', 10) || 0,
        unlabeledChecked: unlabeledCheckedHostRescueStates.get(root)?.entries?.size || 0,
        labeledCheckedVerify: Number.parseInt(root?.getAttribute?.(LABELED_CHECKED_VERIFY_ROOT_ATTR) || '0', 10) || 0,
        webkit3dFlip: Number.parseInt(root?.getAttribute?.(WEBKIT_3D_FLIP_RESCUE_ATTR) || '0', 10) || 0,
        selectionFallback: root?.querySelectorAll?.(`[${SELECTION_ONLY_FALLBACK_ATTR}]`)?.length || 0,
        disabledChoice: root?.querySelectorAll?.(`[${DISABLED_ONLY_CHOICE_RESCUE_ATTR}]`)?.length || 0,
        inertAction: root?.querySelectorAll?.(`[${INERT_ACTION_BUTTON_RESCUE_ATTR}]`)?.length || 0,
        staticChoiceSelection: Number.parseInt(root?.getAttribute?.(STATIC_CHOICE_SELECTION_COUNT_ATTR) || '0', 10) || 0,
        structuredStaticDisclosure: Number.parseInt(root?.getAttribute?.(STRUCTURED_STATIC_DISCLOSURE_COUNT_ATTR) || '0', 10) || 0,
        fillInChoice: Number.parseInt(root?.getAttribute?.(FILL_IN_CHOICE_COUNT_ATTR) || '0', 10) || 0,
        passportDocument: passportDocumentRescueStates.get(root)?.entries?.length || 0,
        decorativeOverlayPassThrough: root?.querySelectorAll?.(`[${DECORATIVE_OVERLAY_PASS_THROUGH_ATTR}]`)?.length || 0,
        touchHoverEligible: root?.querySelectorAll?.(`[${TOUCH_HOVER_READY_ATTR}]`)?.length || 0,
        touchHoverActive: root?.querySelectorAll?.(`[${TOUCH_HOVER_ATTR}="true"]`)?.length || 0,
    };
}

function diagnosticInferReason(root, inputs, targets, state = null) {
    const routes = diagnosticRouteSummary(root);
    const depth = maintenanceCheckedInteractionDepth(root);
    const routeCount = routes.adjacent + routes.layers + routes.labelInternal + routes.labelAdjacent + routes.maskReveal + routes.listDetail + routes.stateSibling + routes.buttonAdjacent + routes.clickableAdjacent + routes.clickablePopup + routes.checkedIdTarget + routes.focusToChecked + routes.checkedTextRule + routes.missingCheckedClass + routes.crossParentChecked + routes.checkedHasState + routes.detachedCheckedHas + routes.pairedCheckedState + routes.exclusiveStackedState + routes.channelDialCycle + routes.expandedOpacity + routes.containerReveal + routes.selfMutation + routes.classStateProgram + routes.cssCommentRepair + routes.changeProgram + routes.focusWithinPersistent + routes.unlabeledChecked + routes.labeledCheckedVerify + routes.selectionFallback + routes.disabledChoice + routes.inertAction + routes.staticChoiceSelection + routes.structuredStaticDisclosure + routes.fillInChoice + routes.passportDocument + routes.decorativeOverlayPassThrough;
    const checkedInputs = inputs.filter(input => input.checked);
    const visibleTargets = targets.filter(target => {
        const style = diagnosticComputedStyle(target);
        const rect = diagnosticRect(target);
        const opacity = Number.parseFloat(style?.opacity || '1');
        return style?.display !== 'none' && style?.visibility !== 'hidden' && opacity > 0.05 && rect.height > 0;
    });

    if (routes.detachedCheckedHas > 0) {
        return '已恢复控制区与内容区分离的 :has() 状态联动；radio 切换会显示原始源码中对应的正文分支。';
    }
    if (routes.focusWithinPersistent > 0) {
        return '已把无 label 透明 checkbox 的 :focus-within 第二层内容恢复为可保持、可再次关闭的点击状态。';
    }
    if (depth.selectionOnlyFallbackCount > 0) {
        const statusOnlyCount = diagnosticQueryContentAll(root, `[${SELECTION_ONLY_FALLBACK_ATTR}="status-only"]`).length;
        if (statusOnlyCount > 0) return '已为只有选中样式、没有结果内容的选项建立明确状态提示；不会伪造缺失剧情。';
        return '已为缺少分支内容的选择控件建立明确缺失提示与返回路径；默认内容保持原样，其他选项不会伪造剧情。';
    }
    if (depth.checkedSelectionOnly && !targets.length) return 'radio/checkbox 只改变选中项外观，源码没有可识别的第二层内容；可使用维修兔建立明确缺失提示。';
    const pseudoDepth = maintenancePseudoInteractionDepth(root);
    if (!inputs.length && pseudoDepth.pseudoVisualOnlyRaw && !routes.stateSibling && !routes.buttonAdjacent && !routes.clickableAdjacent && !routes.clickablePopup && !routes.containerReveal && !routes.listDetail) {
        return '当前只有 Hover／Active 的变色、背景或轻微位移，没有可保持状态或第二层内容。';
    }
    const reachability = maintenanceReachableInteractionEvidence(root, routes, depth, pseudoDepth, getRawAssistantMessageForRenderedRoot(root));
    if (!inputs.length && routes.fillInChoice > 0) {
        return '已把原有填空与候选碎片恢复为可选择、可改选、可清除的保持状态；只使用源码现有候选，不补写新答案。';
    }
    if (!inputs.length && routes.staticChoiceSelection > 0) {
        return '已把原有的静态抉择卡片恢复为互斥、可撤回的选择状态；只记录当前选项，不编造缺失的后续剧情。';
    }
    if (!inputs.length && findStaticChoiceSelectionCandidates(root).length > 0) {
        return '检测到具有明确“选项”文案和点击外观的静态卡片，可使用维修兔恢复互斥选择状态。';
    }
    if (!inputs.length && reachability.noInteractionStructure) {
        return '原始输出只有静态内容或动画，没有可达的内容交互结构；维修兔不能在不编造结果的情况下自动补全。';
    }
    if (!inputs.length && routes.selfMutation > 0) {
        const activeSelfMutation = !!root.querySelector?.(`[${RAW_SELF_MUTATION_ACTIVE_ATTR}="true"]`);
        return activeSelfMutation
            ? '元素自身状态切换已执行，当前可见变化由 class／样式状态直接驱动；此类交互不要求另有隐藏内容。'
            : '元素自身状态切换路线已建立；本次诊断未实际点击该元素，不能因没有隐藏内容而判定交互失败。';
    }
    if (!inputs.length && routeCount && visibleTargets.length) return '非表单交互急救路线已建立，候选内容在计算样式中已有可见项。';
    if (!inputs.length && routeCount) return '非表单交互急救路线已建立，但候选内容最终仍不可见：样式可能被覆盖或被布局裁切。';
    if (!inputs.length) return '未找到 checkbox/radio：渲染后控件可能被删除，或当前交互并非表单状态结构。';
    const diagnosticEvents = state?.events || [];
    const inputInteractionObserved = diagnosticEvents.some(item => /(?:click|input|change):capture target=input/i.test(String(item || '')));
    const sandboxProbeAttempted = diagnosticEvents.some(item => /maintenance-sandbox-probe:/i.test(String(item || '')));
    const labeledProbeLast = String(root.getAttribute?.(LABELED_CHECKED_VERIFY_LAST_ATTR) || '');
    if (/maintenance-sandbox-probe-observe:verified/i.test(labeledProbeLast)) {
        return '维修兔已在隐藏隔离副本中切换有 label 的 checkbox，并观察到 checked 状态与第二层内容真实变化；当前页面的真实控件未被操作。';
    }
    if (sandboxProbeAttempted && !inputInteractionObserved) {
        return '全链路诊断只在隐藏隔离副本中尝试动态验证；本次未形成高置信第二状态证据，当前页面真实控件未被操作。';
    }
    if (!checkedInputs.length && !inputInteractionObserved) return '本次诊断没有实际操作 checkbox/radio；当前只能确认急救路线是否安装，不能据此判断控件发生了重复切换。';
    if (!checkedInputs.length) return '实际操作后控件仍未保持勾选；可能发生重复切换、触摸被覆盖层拦截，或宿主再次回滚了状态。';
    if (!routeCount && targets.length) return 'checkbox 已切换，但没有任何渲染后急救路线建立：当前结构识别条件未命中。';
    if (routeCount && !visibleTargets.length) return '急救路线已建立，但候选内容最终仍不可见：样式可能未执行、被宿主覆盖，或被布局裁切。';
    if (visibleTargets.length) return '候选内容在计算样式中已有可见项；若屏幕仍看不到，请重点查看高度、裁切和时间快照。';
    return '尚无法自动归因，请连同源码与实际渲染代码一起反馈。';
}

function captureInteractionDiagnosticSnapshot(root, state, label) {
    if (!root || !state) return;
    const targets = diagnosticCollectTargets(root).slice(0, 6);
    const inputs = [...root.querySelectorAll('input[type="checkbox"], input[type="radio"]')].slice(0, 6);
    const targetSummary = targets.map((target, index) => {
        const computed = diagnosticComputedStyle(target);
        const rect = diagnosticRect(target);
        return `${index}:${diagnosticElementName(target)} opacity=${computed?.opacity || '?'} display=${computed?.display || '?'} height=${rect.height}px`;
    }).join(' | ');
    const inputSummary = inputs.map((input, index) => `${index}:${diagnosticElementName(input)}=${!!input.checked}`).join(' | ');
    state.snapshots.push(`${label} inputs[${inputSummary || 'none'}] targets[${targetSummary || 'none'}]`);
    if (state.snapshots.length > 6) state.snapshots.splice(0, state.snapshots.length - 6);
}


function diagnosticMessageBody(root) {
    if (!root?.closest) return root || null;
    if (root.matches?.('.mes_text')) return root;
    return root.closest('.mes_text') || root.querySelector?.('.mes_text') || root;
}

function diagnosticIsInternalUiNode(node) {
    if (!node) return false;
    if (node.matches?.(`[${MAINTENANCE_RABBIT_ATTR}], [${FEEDBACK_CAT_ATTR}], [${RESAY_ATTR}], [${TOOL_ENTRY_HOST_ATTR}]`)) return true;
    return !!node.closest?.(`[${INTERACTION_DIAGNOSTIC_PANEL_ATTR}], [${MAINTENANCE_MENU_ATTR}], [${FEEDBACK_CAT_MENU_ATTR}]`);
}

function diagnosticQueryContentAll(root, selector) {
    return [...(root?.querySelectorAll?.(selector) || [])]
        .filter(node => !diagnosticIsInternalUiNode(node));
}

function diagnosticContentSnapshot(root) {
    const fallback = {
        html: String(root?.innerHTML || ''),
        text: String(root?.textContent || ''),
    };
    const clone = root?.cloneNode?.(true);
    if (!clone?.querySelectorAll) return fallback;
    clone.querySelectorAll(`[${INTERACTION_DIAGNOSTIC_PANEL_ATTR}], [${MAINTENANCE_MENU_ATTR}], [${MAINTENANCE_RABBIT_ATTR}], [${FEEDBACK_CAT_MENU_ATTR}], [${FEEDBACK_CAT_ATTR}]`)
        .forEach(node => node.remove());
    return {
        html: String(clone.innerHTML || ''),
        text: String(clone.textContent || ''),
    };
}


const TEXT_CLIPPING_REPAIR_ATTR = 'data-rabbit-mirror-text-clipping-repair';
const TEXT_CLIPPING_ITEM_ATTR = 'data-rm-text-clipping-item';
const TEXT_CLIPPING_BASELINE_ATTR = 'data-rm-text-clipping-baseline';

function maintenanceSafeComputedStyle(element) {
    try {
        return typeof getComputedStyle === 'function' ? getComputedStyle(element) : null;
    } catch {
        return null;
    }
}

function maintenanceIsVisibleContentElement(element) {
    if (!element?.getBoundingClientRect || diagnosticIsInternalUiNode(element)) return false;
    const tag = String(element.tagName || '').toLowerCase();
    if (/^(?:style|script|template|input|select|textarea|option|svg|path|br|hr)$/.test(tag)) return false;
    if (element.closest?.('[hidden], [aria-hidden="true"]')) return false;
    const style = maintenanceSafeComputedStyle(element);
    if (!style || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    const opacity = Number.parseFloat(style.opacity || '1');
    if (Number.isFinite(opacity) && opacity <= 0.05) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
}

function maintenanceHasMeaningfulText(element) {
    const text = String(element?.textContent || '').replace(/\s+/g, ' ').trim();
    return text.length >= 2 && text.length <= 12000;
}

function maintenanceDirectTextLength(element) {
    let length = 0;
    for (const node of [...(element?.childNodes || [])]) {
        if (node?.nodeType === 3) length += String(node.nodeValue || '').replace(/\s+/g, ' ').trim().length;
    }
    return length;
}

function maintenanceVisibleTextRects(element, limit = 80) {
    if (!element || typeof document === 'undefined' || !document.createTreeWalker || !document.createRange) return [];
    const SHOW_TEXT = globalThis.NodeFilter?.SHOW_TEXT ?? 4;
    const FILTER_ACCEPT = globalThis.NodeFilter?.FILTER_ACCEPT ?? 1;
    const FILTER_REJECT = globalThis.NodeFilter?.FILTER_REJECT ?? 2;
    const walker = document.createTreeWalker(element, SHOW_TEXT, {
        acceptNode(node) {
            const value = String(node?.nodeValue || '').replace(/\s+/g, ' ').trim();
            if (!value) return FILTER_REJECT;
            const parent = node.parentElement;
            if (!parent || diagnosticIsInternalUiNode(parent) || !maintenanceIsVisibleContentElement(parent)) return FILTER_REJECT;
            return FILTER_ACCEPT;
        },
    });
    const rects = [];
    let node;
    while ((node = walker.nextNode()) && rects.length < limit) {
        try {
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const rect of [...range.getClientRects()]) {
                if (rect.width > 0.5 && rect.height > 0.5) rects.push(rect);
                if (rects.length >= limit) break;
            }
            range.detach?.();
        } catch {
            // Ignore a single malformed text node.
        }
    }
    return rects;
}

function maintenanceHasIntentionalMarquee(element) {
    if (!element?.querySelectorAll) return false;
    for (const descendant of element.querySelectorAll('*')) {
        const style = maintenanceSafeComputedStyle(descendant);
        if (!style) continue;
        const animationName = String(style.animationName || '').trim().toLowerCase();
        const whiteSpace = String(style.whiteSpace || '').trim().toLowerCase();
        if (animationName && animationName !== 'none' && whiteSpace === 'nowrap') return true;
    }
    return false;
}

function maintenanceTextClippingEvidence(element, root) {
    if (!maintenanceIsVisibleContentElement(element) || !maintenanceHasMeaningfulText(element)) return null;
    // 护照／证件专项维修会单独恢复封面、内页滚动与印章详情。
    // 不再让通用文字裁切巡逻把尚未打开的封面或受控详情误报为正文丢失。
    if (maintenanceMobileLayoutIsPassportManaged(element)) return null;
    const style = maintenanceSafeComputedStyle(element);
    if (!style) return null;
    const rect = element.getBoundingClientRect();
    const clientWidth = Number(element.clientWidth || 0);
    const clientHeight = Number(element.clientHeight || 0);
    if (clientWidth <= 1 || clientHeight <= 1) return null;

    const overflow = String(style.overflow || '').toLowerCase();
    const overflowX = String(style.overflowX || overflow).toLowerCase();
    const overflowY = String(style.overflowY || overflow).toLowerCase();
    const clipsX = /(?:hidden|clip)/.test(overflowX);
    const clipsY = /(?:hidden|clip)/.test(overflowY);
    const whiteSpace = String(style.whiteSpace || '').toLowerCase();
    const textOverflow = String(style.textOverflow || '').toLowerCase();
    const lineClamp = String(style.webkitLineClamp || element.style?.getPropertyValue?.('-webkit-line-clamp') || '').trim().toLowerCase();
    const lineClamped = !!lineClamp && !/^(?:none|unset|initial|0)$/.test(lineClamp);
    const noWrap = /^(?:nowrap|pre)$/.test(whiteSpace);
    const directText = maintenanceDirectTextLength(element) > 0;
    const semanticTextTag = /^(?:p|span|div|li|td|th|h[1-6]|blockquote|pre|code|label|button|summary|figcaption|dd|dt)$/.test(String(element.tagName || '').toLowerCase());

    const scrollOverflowX = Number(element.scrollWidth || 0) > clientWidth + 2;
    const scrollOverflowY = Number(element.scrollHeight || 0) > clientHeight + 2;
    const textRects = maintenanceVisibleTextRects(element);
    const textOutsideX = textRects.some(textRect => textRect.left < rect.left - 1 || textRect.right > rect.right + 1);
    const textOutsideY = textRects.some(textRect => textRect.top < rect.top - 1 || textRect.bottom > rect.bottom + 1);

    // scrollWidth/scrollHeight 可能由绝对定位装饰层或整块媒介结构撑大。
    // 只有直属文本，或自身就是文字载体且没有块级结构子树时，才把滚动尺寸当文字证据。
    const hasBlockStructure = !!element.querySelector?.('div,section,article,main,aside,header,footer,ul,ol,table,figure,details,form');
    const scrollTextEvidence = directText || (semanticTextTag && !hasBlockStructure);
    let horizontal = (clipsX && textOutsideX)
        || ((clipsX || noWrap || textOverflow === 'ellipsis') && scrollTextEvidence && scrollOverflowX);
    const vertical = lineClamped
        || (clipsY && textOutsideY)
        || (clipsY && scrollTextEvidence && scrollOverflowY);
    // 滚动字幕会故意把 nowrap 文本移出裁切窗口；这是媒介动画，不是文字丢失。
    if (horizontal && !vertical && clipsX && maintenanceHasIntentionalMarquee(element)) horizontal = false;
    if (!horizontal && !vertical) return null;

    return {
        element,
        horizontal,
        vertical,
        noWrap,
        lineClamped,
        rootWidth: Number(root?.getBoundingClientRect?.().width || 0),
        elementWidth: rect.width,
    };
}

function findMaintenanceTextClippingCandidates(root) {
    if (!root?.querySelectorAll) return [];
    const candidates = [];
    const seen = new Set();
    const elements = [root, ...root.querySelectorAll('*')];
    for (const element of elements) {
        if (seen.has(element)) continue;
        const evidence = maintenanceTextClippingEvidence(element, root);
        if (!evidence) continue;
        seen.add(element);
        candidates.push(evidence);
        if (candidates.length >= 24) break;
    }
    return candidates;
}

function encodeTextClippingBaseline(element, properties) {
    if (!element?.style || element.hasAttribute(TEXT_CLIPPING_BASELINE_ATTR)) return;
    const baseline = {};
    for (const property of properties) {
        baseline[property] = {
            value: element.style.getPropertyValue(property),
            priority: element.style.getPropertyPriority(property),
        };
    }
    try {
        element.setAttribute(TEXT_CLIPPING_BASELINE_ATTR, encodeURIComponent(JSON.stringify(baseline)));
    } catch {
        element.setAttribute(TEXT_CLIPPING_BASELINE_ATTR, 'captured');
    }
}


function repairMaintenanceTextClipping(root) {
    if (!root?.querySelectorAll) return 0;
    let repaired = 0;
    const candidates = findMaintenanceTextClippingCandidates(root);
    for (const evidence of candidates) {
        const element = evidence.element;
        if (!element?.style) continue;
        const tag = String(element.tagName || '').toLowerCase();
        const hasBlockStructure = !!element.querySelector?.('div,section,article,main,aside,header,footer,ul,ol,table,figure,details,form');
        const directTextCarrier = maintenanceDirectTextLength(element) > 0;
        const semanticLeafText = /^(?:p|span|li|td|th|h[1-6]|blockquote|pre|code|label|button|figcaption|dd|dt)$/.test(tag) && !hasBlockStructure;
        // 只维修真正的叶级文字载体。含完整布局子树的画框、卡片、翻页和档案板只报告，不改结构。
        if (!directTextCarrier && !semanticLeafText) continue;
        const properties = [
            'white-space', 'overflow-wrap', 'word-break', 'text-overflow',
            'width', 'max-width', 'min-width', 'box-sizing',
            'height', 'min-height', 'max-height', 'overflow', 'overflow-x', 'overflow-y',
            'display', '-webkit-line-clamp', 'line-clamp', '-webkit-box-orient',
        ];
        encodeTextClippingBaseline(element, properties);
        element.style.setProperty('min-width', '0', 'important');
        element.style.setProperty('max-width', '100%', 'important');
        element.style.setProperty('box-sizing', 'border-box', 'important');
        element.style.setProperty('overflow-wrap', 'anywhere', 'important');
        element.style.setProperty('word-break', 'break-word', 'important');
        element.style.setProperty('text-overflow', 'clip', 'important');
        const computedPosition = String(maintenanceSafeComputedStyle(element)?.position || '').toLowerCase();
        // 仅解除叶级、非绝对定位文字自身的裁切；绝不打开媒介外壳或叠层页面的 overflow。
        if (evidence.lineClamped && computedPosition !== 'absolute' && computedPosition !== 'fixed') {
            element.style.setProperty('overflow', 'visible', 'important');
            element.style.setProperty('overflow-x', 'visible', 'important');
            element.style.setProperty('overflow-y', 'visible', 'important');
        }

        if (evidence.noWrap || evidence.horizontal) {
            element.style.setProperty('white-space', tag === 'pre' || tag === 'code' ? 'pre-wrap' : 'normal', 'important');
            // 解除 nowrap 后文字会新增行；即使首次采样只有横向溢出，也必须同步释放固定高度。
            element.style.setProperty('height', 'auto', 'important');
            element.style.setProperty('max-height', 'none', 'important');
        }
        if (evidence.elementWidth > Math.max(1, evidence.rootWidth) + 2) {
            element.style.setProperty('width', '100%', 'important');
        }
        if (evidence.vertical || evidence.lineClamped) {
            element.style.setProperty('height', 'auto', 'important');
            element.style.setProperty('max-height', 'none', 'important');
        }
        if (evidence.lineClamped) {
            element.style.setProperty('-webkit-line-clamp', 'unset', 'important');
            element.style.setProperty('line-clamp', 'unset', 'important');
            element.style.setProperty('-webkit-box-orient', 'initial', 'important');
            if (String(maintenanceSafeComputedStyle(element)?.display || '').toLowerCase() === '-webkit-box') {
                element.style.setProperty('display', 'block', 'important');
            }
        }
        element.setAttribute(TEXT_CLIPPING_ITEM_ATTR, 'true');
        repaired += 1;
    }
    if (repaired > 0) root.setAttribute(TEXT_CLIPPING_REPAIR_ATTR, String(repaired));
    return repaired;
}


function maintenanceSourceTextMatchesCurrentMirror(value, root) {
    const wantedSummary = normalizeMaintenanceSummaryText(getRabbitMirrorSummaryText(root));
    if (!wantedSummary) return false;
    const decoded = decodeHtmlEntities(String(value || ''))
        .replace(/[\u200B\u200C\u200D\uFEFF]/g, ' ')
        .replace(/<[^>]*>/g, ' ');
    const candidate = normalizeMaintenanceSummaryText(decoded);
    if (!candidate) return false;
    return candidate.includes(wantedSummary)
        || (candidate.length >= 8 && candidate.length >= Math.floor(wantedSummary.length * 0.65) && wantedSummary.includes(candidate));
}

function maintenanceRelevantSourceNodes(root, body, selector) {
    const nodes = diagnosticQueryContentAll(body, selector);
    if (!nodes.length) return [];
    return nodes.filter(node => {
        if (node === root || node.contains?.(root) || root?.contains?.(node)) return true;
        const snapshot = diagnosticContentSnapshot(node);
        return maintenanceSourceTextMatchesCurrentMirror(`${snapshot.text}\n${snapshot.html}`, root);
    });
}

function maintenanceRelevantThRenderNodes(root, body, relevantCodeShellNodes = []) {
    const shellSet = new Set(relevantCodeShellNodes || []);
    return diagnosticQueryContentAll(body, '.TH-render').filter(node => {
        if (node === root || node.contains?.(root) || root?.contains?.(node)) return true;
        if ([...shellSet].some(shell => node.contains?.(shell) || shell.contains?.(node))) return true;
        const snapshot = diagnosticContentSnapshot(node);
        return maintenanceSourceTextMatchesCurrentMirror(`${snapshot.text}\n${snapshot.html}`, root);
    });
}

function diagnosticCodeRescueSummary(root) {
    const body = diagnosticMessageBody(root);
    const snapshot = diagnosticContentSnapshot(body);
    const renderedText = snapshot.text;
    const decodedRendered = decodeHtmlEntities(renderedText)
        .replace(/\u00a0/g, ' ')
        .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
        .trim();
    const rawMessage = String(getRawAssistantMessageForRenderedRoot(root) || '');
    const decodedRaw = decodeHtmlEntities(rawMessage);
    const codeShellNodes = diagnosticQueryContentAll(body, CODE_SHELL_SELECTOR);
    const relevantCodeShellNodes = maintenanceRelevantSourceNodes(root, body, CODE_SHELL_SELECTOR);
    const codeShells = codeShellNodes.length;
    const relevantCodeShells = relevantCodeShellNodes.length;
    const relevantShellSnapshot = relevantCodeShellNodes
        .map(node => diagnosticContentSnapshot(node))
        .map(item => `${item.text}\n${item.html}`)
        .join('\n');
    const renderedMirrors = diagnosticQueryContentAll(body, 'toto[data-rabbit-mirror="true"], toto, details').length;
    const strictWhole = extractStrictWholeRabbitMirrorText(body);
    const rawHasToto = /<toto\b/i.test(decodedRaw);
    const renderedHasTotoText = /<toto\b/i.test(decodedRendered);
    const renderedHasEscapedToto = /&lt;\s*toto\b/i.test(renderedText) || renderedHasTotoText;
    const renderedHasFence = /```(?:html|xml)?/i.test(decodedRendered);
    const rawNeeds = rawMessage ? needsSanitize(decodedRaw) : false;
    const renderedNeeds = decodedRendered ? needsSanitize(decodedRendered) : false;
    const currentMirrorNeedsSanitize = relevantShellSnapshot
        ? needsSanitize(decodeHtmlEntities(relevantShellSnapshot))
        : false;
    const rawCleaned = rawNeeds ? cleanRabbitMirrorOutput(decodedRaw) : decodedRaw;
    const rawWouldChange = !!rawMessage && rawCleaned !== rawMessage && rawCleaned !== decodedRaw;
    const strictParseOk = strictWhole ? !!parseTotoFragment(cleanRabbitMirrorOutput(strictWhole)) : false;
    const messageElement = body?.closest?.('.mes, [mesid], [data-message-id], [data-messageid]');
    const externalMesid = getExternalOwnerMessageIndex(body);
    const mesid = externalMesid >= 0 ? String(externalMesid) : (messageElement?.getAttribute?.('mesid') || '(unknown)');
    const displayTextDiff = (() => {
        try {
            const index = Number.parseInt(mesid, 10);
            const chat = hostScriptModule?.chat || globalThis.chat;
            const message = Number.isInteger(index) && Array.isArray(chat) ? chat[index] : null;
            return typeof message?.extra?.display_text === 'string' && message.extra.display_text !== message?.mes;
        } catch { return false; }
    })();

    let reason = '旧全局急救调度已移除；当前兔子镜仅由逐条维修兔按用户操作处理。';
    if (renderedMirrors && !renderedHasTotoText && !relevantCodeShells) reason = '当前消息中已存在真实兔子镜 DOM；若仍异常，重点查看交互或 CSS，而非代码块恢复。';
    else if (strictWhole && strictParseOk) reason = '当前显示层是完整纯文字兔子镜，且解析测试成功，但仍未替换：优先怀疑扫描触发时机、消息 DOM 选择器或后续插件再次重绘。';
    else if (strictWhole && !strictParseOk) reason = '已命中完整纯文字兔子镜，但解析测试失败：源码边界、标签结构或清洗结果仍有问题。';
    else if (relevantCodeShells && (renderedHasTotoText || currentMirrorNeedsSanitize)) reason = '发现代码块外壳与兔子镜源码候选；若未恢复，优先检查替换目标识别或后续重绘覆盖。';
    else if (rawNeeds && !currentMirrorNeedsSanitize && !strictWhole && !relevantCodeShells) reason = '聊天原始源需要急救，但当前显示层不再呈现相同源码：可能由 display_text、显示正则或其他美化插件接管。';
    else if (renderedHasEscapedToto && !strictWhole) reason = '显示层含兔子镜标签文字，但并非“整条消息仅一个完整 toto”结构，因此严格纯文字兜底不会接管。';
    else if (renderedHasFence && !relevantCodeShells) reason = '看到三反引号文本，但宿主没有生成标准代码块节点；当前严格纯文字兜底又未命中完整 toto。';

    return {
        body, mesid, codeShells, relevantCodeShells, renderedMirrors, strictWhole: !!strictWhole, strictParseOk,
        renderedHasTotoText, renderedHasEscapedToto, renderedHasFence,
        rawHasToto, rawNeeds, renderedNeeds, currentMirrorNeedsSanitize, rawWouldChange, displayTextDiff,
        renderedLength: decodedRendered.length, rawLength: decodedRaw.length, reason,
    };
}


function cssStructuralBalance(cssText) {
    const source = String(cssText || '');
    let depth = 0;
    let minDepth = 0;
    let quote = '';
    let escaped = false;
    let inComment = false;

    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        const next = source[index + 1] || '';

        if (inComment) {
            if (char === '*' && next === '/') {
                inComment = false;
                index += 1;
            }
            continue;
        }
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '/' && next === '*') {
            inComment = true;
            index += 1;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === '{') depth += 1;
        else if (char === '}') {
            depth -= 1;
            minDepth = Math.min(minDepth, depth);
        }
    }
    return { depth, extraClosingBrace: minDepth < 0, unterminatedString: !!quote, unterminatedComment: inComment };
}

function maintenanceRawSourceIntegrity(decodedRaw, root) {
    const isolated = extractMaintenanceMirrorSourceBySummary(decodedRaw, root);
    if (!isolated) {
        return {
            isolated: '', rawSourceBodyMissing: false, rawCssTruncated: false,
            rawBodyTagCount: 0, rawBodyTextLength: 0, rawBodyElementCount: 0,
            rawBodySemanticElementCount: 0, rawBodyVisualProgramCount: 0, rawBodyEmptyShell: false,
            sourceTruncationNoticeInstalled: !!root?.querySelector?.(`[${SOURCE_TRUNCATION_NOTICE_ATTR}]`),
        };
    }

    const styleBlocks = [...isolated.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)]
        .map(match => String(match[1] || ''));
    const cssBalance = cssStructuralBalance(styleBlocks.join('\n'));
    const withoutNonBody = isolated
        .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
        .replace(/<summary\b[^>]*>[\s\S]*?<\/summary\s*>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<\/?(?:toto|details)\b[^>]*>/gi, ' ')
        .replace(/<br\s*\/?>/gi, ' ');
    const rawBodyTagCount = (withoutNonBody.match(/<(?:div|section|article|label|input|button|p|span|h[1-6]|ul|ol|li|table|form|figure|main|header|footer|nav|img|svg|canvas)\b/gi) || []).length;
    const rawBodyText = decodeHtmlEntities(withoutNonBody.replace(/<[^>]*>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
    let parsedBodyEvidence = null;
    try {
        const parsedCandidate = findCleanMaintenanceMirrorNode(isolated, root);
        parsedBodyEvidence = parsedCandidate ? maintenanceMirrorBodyEvidence(parsedCandidate) : null;
    } catch {
        parsedBodyEvidence = null;
    }
    const rawSourceBodyMissing = (rawBodyTagCount === 0 && rawBodyText.length === 0)
        || !!parsedBodyEvidence?.highConfidenceEmptyShell;
    const rawCssTruncated = styleBlocks.length > 0 && (
        cssBalance.depth > 0
        || cssBalance.extraClosingBrace
        || cssBalance.unterminatedString
        || cssBalance.unterminatedComment
    );

    return {
        isolated,
        rawSourceBodyMissing,
        rawCssTruncated,
        rawBodyTagCount,
        rawBodyTextLength: rawBodyText.length,
        rawBodyElementCount: Number(parsedBodyEvidence?.bodyElementCount || 0),
        rawBodySemanticElementCount: Number(parsedBodyEvidence?.semanticElementCount || 0),
        rawBodyVisualProgramCount: Number(parsedBodyEvidence?.visualProgramCount || 0),
        rawBodyEmptyShell: !!parsedBodyEvidence?.highConfidenceEmptyShell,
        sourceTruncationNoticeInstalled: !!root?.querySelector?.(`[${SOURCE_TRUNCATION_NOTICE_ATTR}]`),
    };
}

function diagnosticFullChainSummary(root, code) {
    const body = code?.body || diagnosticMessageBody(root);
    const rawMessage = String(getRawAssistantMessageForRenderedRoot(root) || '');
    const decodedRaw = decodeHtmlEntities(rawMessage);
    const snapshot = diagnosticContentSnapshot(body);
    const renderedHtml = snapshot.html;
    const renderedText = snapshot.text;
    const styleTexts = diagnosticQueryContentAll(body, 'style').map(style => String(style.textContent || '')).join('\n');
    const rawStyles = [...decodedRaw.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(match => match[1] || '').join('\n');
    // 宿主/美化插件会返回多种 CSS 错误文案（property missing ':'、missing '}' 等）。
    // 只要当前消息出现其标准 CSS ERROR 前缀，就应视为源码重建信号，而不能只识别某一种报错。
    const hostCssParserErrorText = (renderedText.match(/CSS\s+ERROR\s*:\s*Error:[^\r\n]{0,320}/i)?.[0] || '').trim();
    const hostCssParserError = !!hostCssParserErrorText;
    const rawUnencodedSvgDataUri = /data:image\/svg\+xml[^,]*,(?:\s|%20)*(?:<|&lt;)svg\b/i.test(rawStyles);
    const rawCssCommentCount = (rawStyles.match(/\/\*[\s\S]*?\*\//g) || []).length;
    const rawStylesWithoutComments = stripCssComments(rawStyles);
    const rawCssIdSelectorCount = (rawStylesWithoutComments.match(/(?:^|})\s*#[A-Za-z_-][\w-]*(?=[\s:.\[>~+,{])/gm) || []).length;
    const rawInlineEvents = (decodedRaw.match(/\son[a-z]+\s*=/gi) || []).length;
    let renderedInlineEvents = 0;
    body?.querySelectorAll?.('*').forEach(element => {
        for (const attr of [...(element.attributes || [])]) {
            if (/^on[a-z]+$/i.test(attr.name)) renderedInlineEvents += 1;
        }
    });
    const cssText = `${rawStyles}\n${styleTexts}`;
    const cssRuleCount = (cssText.match(/[^@{}][^{}]*\{[^{}]*\}/g) || []).length;
    const animationCount = (cssText.match(/@keyframes\b/gi) || []).length;
    const hoverCount = (cssText.match(/:hover\b/gi) || []).length;
    const focusCount = (cssText.match(/:focus(?:-within)?\b/gi) || []).length;
    const activeCount = (cssText.match(/:active\b/gi) || []).length;
    const checkedCount = (cssText.match(/:checked\b/gi) || []).length;
    const mobileWebKit = /(?:iPhone|iPad|iPod).*AppleWebKit|AppleWebKit.*Mobile/i.test(String(globalThis.navigator?.userAgent || ''));
    const flipSourceText = `${decodedRaw}
${styleTexts}`;
    const flipEvidence = collectWebKit3DFlipEvidence(root);
    const mobile3DFlipCandidate = mobileWebKit
        && /rotateY\s*\(/i.test(flipSourceText)
        && /backface-visibility\s*:\s*hidden/i.test(flipSourceText)
        && /preserve-3d/i.test(flipSourceText)
        && (flipEvidence.webkitRotateY < flipEvidence.rotateY
            || flipEvidence.webkitBackface < flipEvidence.backface
            || flipEvidence.webkitPreserve3d < flipEvidence.preserve3d
            || flipEvidence.webkitPerspective < flipEvidence.perspective);
    const detailsCount = diagnosticQueryContentAll(body, 'details').length;
    const styleCount = diagnosticQueryContentAll(body, 'style').length;
    const scriptCount = diagnosticQueryContentAll(body, 'script').length;
    const iframeCount = diagnosticQueryContentAll(body, 'iframe').length;
    const inputCount = diagnosticQueryContentAll(body, 'input,select,textarea').length;
    const buttonCount = diagnosticQueryContentAll(body, 'button').length;
    const thRenderCount = diagnosticQueryContentAll(body, '.TH-render').length;
    const highlightedCount = diagnosticQueryContentAll(body, 'code.hljs,[data-highlighted="yes"]').length;
    const relevantCodeShellNodes = maintenanceRelevantSourceNodes(root, body, CODE_SHELL_SELECTOR);
    const relevantThRenderCount = maintenanceRelevantThRenderNodes(root, body, relevantCodeShellNodes).length;
    const relevantHighlightedCount = maintenanceRelevantSourceNodes(root, body, 'code.hljs,[data-highlighted="yes"]').length;
    const mirrorCount = getRenderedRabbitMirrorInteractionRoots(body).filter(node => !diagnosticIsInternalUiNode(node)).length;
    const scopedCount = diagnosticQueryContentAll(body, '[data-rabbit-mirror-interaction-scoped="true"]').length;
    const rescuedCount = diagnosticQueryContentAll(body, '[data-rabbit-mirror-interaction-rescued="true"]').length;
    let maintenanceModuleVersion = '';
    let maintenanceModuleMode = '';
    let maintenanceSourceAttempted = false;
    let maintenanceSourceChanged = false;
    let maintenanceSourceReason = '';
    let maintenanceFindingCount = 0;
    let maintenanceRepairOrder = '';
    let maintenanceResolvedCount = 0;
    let maintenanceRemainingCount = 0;
    const maintenanceModuleNodes = [...(body?.querySelectorAll?.('[data-rabbit-mirror-maintenance-modules]') || [])].reverse();
    for (const node of maintenanceModuleNodes) {
        try {
            const payload = JSON.parse(node.getAttribute('data-rabbit-mirror-maintenance-modules') || '{}');
            maintenanceModuleVersion = String(payload?.version || '');
            maintenanceModuleMode = String(payload?.autoSelected || payload?.mode || '');
            maintenanceSourceAttempted = !!payload?.sourceRepair?.attempted;
            maintenanceSourceChanged = !!payload?.sourceRepair?.changed;
            maintenanceSourceReason = String(payload?.sourceRepair?.reason || '');
            maintenanceFindingCount = Array.isArray(payload?.findingsBefore) ? payload.findingsBefore.length : 0;
            maintenanceRepairOrder = Array.isArray(payload?.repairOrder) ? payload.repairOrder.join(' → ') : '';
            maintenanceResolvedCount = Array.isArray(payload?.verification?.resolved) ? payload.verification.resolved.length : 0;
            maintenanceRemainingCount = Array.isArray(payload?.verification?.remaining) ? payload.verification.remaining.length : 0;
            break;
        } catch {
            // Ignore malformed historical metadata and continue to an older valid record.
        }
    }
    const rawInputCount = (decodedRaw.match(/<input\b/gi) || []).length;
    const rawLabelCount = (decodedRaw.match(/<label\b/gi) || []).length;
    const renderedLabelCount = diagnosticQueryContentAll(body, 'label').length;
    const rawUiTagCount = countRawUiTags(decodedRaw);
    const rawSourceIntegrity = maintenanceRawSourceIntegrity(decodedRaw, root);
    const renderedUiTagCount = diagnosticQueryContentAll(body, 'div,section,article,label,input,button,p,span,h1,h2,h3,h4,h5,h6,ul,ol,li,table,form,details,summary,figure,main,header,footer,nav').length;
    const primaryDetails = root?.matches?.('details') ? root : root?.querySelector?.('details');
    const primarySummary = primaryDetails?.querySelector?.(':scope > summary') || primaryDetails?.querySelector?.('summary');
    const primaryRect = diagnosticRect(primaryDetails);
    const summaryRect = diagnosticRect(primarySummary);
    const primaryOpen = String(primaryDetails?.tagName || '').toLowerCase() !== 'details' || !!primaryDetails?.open;
    const renderedBodyElementCount = primaryDetails ? [...(primaryDetails.children || [])].filter(child => {
        const tag = String(child?.tagName || '').toLowerCase();
        if (!tag || tag === 'summary' || tag === 'style' || tag === 'script' || tag === 'br') return false;
        if (child.matches?.(`[${MAINTENANCE_RABBIT_ATTR}], [${FEEDBACK_CAT_ATTR}], [${RESAY_ATTR}], [${TOOL_ENTRY_HOST_ATTR}]`) || child.closest?.(`[${INTERACTION_DIAGNOSTIC_PANEL_ATTR}], [${FEEDBACK_CAT_MENU_ATTR}]`)) return false;
        if (tag === 'p' && !String(child.textContent || '').trim() && !child.children?.length) return false;
        return true;
    }).length : 0;
    const renderedBodyEvidence = primaryDetails ? maintenanceMirrorBodyEvidence(primaryDetails) : null;
    // 空壳 details 的默认 margin、summary 按钮或主题样式可能让外框高度略高于 summary，
    // 不能再把“几何高度几乎相等”作为源码缺失的必要条件。
    // 同时检查当前消息的 mes、当前 swipe 与有效显示源：只要其中存在同标题完整主体，
    // 就应判为“可来源恢复”，而不是“内容从未生成”；完全找不到同标题主体时才判为空壳。
    const currentMessage = getAssistantMessageForRenderedRoot(root);
    const distinctDisplaySource = messageUsesDistinctDisplaySource(currentMessage);
    const recoverableBodySource = currentMessage
        ? findRecoverableMaintenanceMirrorSource(currentMessage, root, { displayOnly: distinctDisplaySource })
        : null;
    const renderedShellBodyMissing = !!(primaryDetails && primaryOpen && (
        renderedBodyElementCount === 0
        || renderedBodyEvidence?.highConfidenceEmptyShell
    ));
    const rawSourceBodyMissing = !!(renderedShellBodyMissing
        && !recoverableBodySource
        && (rawSourceIntegrity.rawSourceBodyMissing || !rawSourceIntegrity.isolated));
    const rawCssTruncated = !!(rawSourceIntegrity.rawSourceBodyMissing && rawSourceIntegrity.rawCssTruncated);
    const sourceTruncationNoticeInstalled = !!rawSourceIntegrity.sourceTruncationNoticeInstalled;
    const visibleBodyMissing = !!(primaryDetails && primaryOpen && code?.rawHasToto && rawUiTagCount >= 6 && (
        renderedBodyElementCount === 0
        || (primaryRect.height > 0 && primaryRect.height <= summaryRect.height + 10)
    ));
    const repairedDataUriSource = rescueDamagedDataUriRabbitMirrorOutput(decodedRaw);
    const damagedDataUriCandidate = repairedDataUriSource !== decodedRaw;
    const controlsLost = rawInputCount > 0 && inputCount === 0;
    const labelsLost = rawLabelCount > 0 && renderedLabelCount === 0;
    const severeStructureLoss = rawUiTagCount >= 8 && renderedUiTagCount + 5 < rawUiTagCount
        && renderedUiTagCount < Math.ceil(rawUiTagCount * 0.55);
    const structureTruncated = damagedDataUriCandidate && (controlsLost || labelsLost || severeStructureLoss);
    const rawMirrorSourcePresent = !!code?.rawHasToto || /<details\b/i.test(decodedRaw);
    const sourceCandidate = !sourceTruncationNoticeInstalled && ((rawMirrorSourcePresent && (
        !!code?.rawNeeds
        || !!code?.currentMirrorNeedsSanitize
        || Number(code?.relevantCodeShells || 0) > 0
        || relevantThRenderCount > 0
        || relevantHighlightedCount > 0
        || visibleBodyMissing
        || severeStructureLoss
    )) || !!(renderedShellBodyMissing && recoverableBodySource));
    const currentMirrorRenderedEscapedTags = !!code?.currentMirrorNeedsSanitize
        || Number(code?.relevantCodeShells || 0) > 0
        || !!code?.strictWhole;
    // 原始聊天内容会永久保留未清洗源码；这本身不是显示故障。
    // 只有当前显示层仍存在 CSS ERROR、代码壳、转义源码或完整纯文字候选时，才判定源码仍被遮蔽。
    const sourceObscured = sourceCandidate && (
        hostCssParserError
        || relevantThRenderCount > 0
        || relevantHighlightedCount > 0
        || Number(code?.relevantCodeShells || 0) > 0
        || !!code?.strictWhole
        || !!code?.currentMirrorNeedsSanitize
        || visibleBodyMissing
        || severeStructureLoss
        || rawSourceBodyMissing
    );
    let verdict = '当前链路未发现单一高置信故障点。';
    if (sourceTruncationNoticeInstalled) verdict = '原始输出缺少正文，维修兔已显示截断说明；缺失内容无法从现有源码恢复，需要重新生成该条。';
    else if (rawCssTruncated) verdict = '高置信：原始兔子镜在 <style> 中途截断，正文未生成；现有源码无法恢复缺失内容，只能显示截断说明并重新生成该条。';
    else if (rawSourceBodyMissing) verdict = '高置信：原始兔子镜只包含样式或空壳，没有可显示的正文主体；现有源码无法补回不存在的内容。';
    else if (structureTruncated) verdict = '高置信：损坏的 SVG Data URI 破坏了 inline style 属性边界，导致后续 DOM 被截断；应移除该背景声明并用原始源码临时重绘显示层。';
    else if (damagedDataUriCandidate) verdict = '检测到疑似损坏的 SVG Data URI；当前结构尚未达到高置信截断阈值，但建议优先执行保主体清洗。';
    else if (sourceCandidate && hostCssParserError && rawUnencodedSvgDataUri) verdict = '高置信：宿主 CSS 解析器在原始 SVG Data URI 之后中断，后续 HTML 被代码壳接管；源码恢复时应先编码 SVG 数据并重绘当前显示层。';
    else if (sourceCandidate && hostCssParserError && rawCssIdSelectorCount > 0) verdict = '高置信：宿主 CSS 解析器在状态 ID 选择器附近中断，后续 HTML 被代码壳接管；源码恢复时应使用兼容选择器并重绘当前显示层。';
    else if (sourceCandidate && hostCssParserError && rawCssCommentCount > 0) verdict = '高置信：宿主 CSS 解析器在注释边界附近中断，后续 HTML 被代码壳接管；源码恢复时应移除 CSS 注释并重绘当前显示层。';
    else if (sourceCandidate && hostCssParserError) verdict = '宿主 CSS 解析失败并遮蔽了原始兔子镜源码；应先执行 CSS 兼容清洗，再重绘当前显示层。';
    else if (sourceCandidate && relevantThRenderCount) verdict = '原始兔子镜源码被 TH-render 代码壳接管；应检查源码恢复是否在其重绘后再次执行。';
    else if (sourceCandidate && relevantHighlightedCount) verdict = '原始兔子镜源码进入语法高亮代码壳；应检查源码恢复触发时机或后续重绘覆盖。';
    else if (sourceCandidate && sourceObscured) verdict = '原始源需要恢复；请使用当前条目的维修兔，无法恢复时生成全链路诊断。';
    else if (code?.strictWhole && code?.strictParseOk) verdict = '显示层是可解析的完整纯文字兔子镜，但替换未发生；重点检查消息选择器与观察器触发。';
    else if (mirrorCount > 0 && Number(code?.relevantCodeShells || 0) === 0) verdict = '兔子镜主体已经渲染；故障更可能位于 CSS、可读性或交互链。';
    else if (rawInlineEvents > renderedInlineEvents) verdict = '原始源码中的内联事件在渲染后减少，说明宿主净化器删除了部分事件属性。';
    return {
        rawHtml: /<\/?[a-z][^>]*>/i.test(decodedRaw),
        rawToto: /<toto\b/i.test(decodedRaw),
        rawFence: /```(?:html|xml)?/i.test(decodedRaw),
        renderedEscapedTags: /&lt;\/?[a-z]/i.test(renderedHtml) || /<toto\b/i.test(renderedText),
        currentMirrorRenderedEscapedTags,
        detailsCount, styleCount, scriptCount, iframeCount, inputCount, buttonCount,
        cssRuleCount, animationCount, hoverCount, focusCount, activeCount, checkedCount,
        rawInlineEvents, renderedInlineEvents, thRenderCount, highlightedCount,
        relevantThRenderCount, relevantHighlightedCount, relevantCodeShellCount: Number(code?.relevantCodeShells || 0),
        mirrorCount, scopedCount, rescuedCount, sourceCandidate, sourceObscured,
        maintenanceModuleVersion, maintenanceModuleMode, maintenanceSourceAttempted, maintenanceSourceChanged, maintenanceSourceReason,
        maintenanceFindingCount, maintenanceRepairOrder, maintenanceResolvedCount, maintenanceRemainingCount,
        hostCssParserError, hostCssParserErrorText, rawUnencodedSvgDataUri, rawCssCommentCount, rawCssIdSelectorCount,
        rawInputCount, rawLabelCount, renderedLabelCount, rawUiTagCount, renderedUiTagCount,
        damagedDataUriCandidate, controlsLost, labelsLost, severeStructureLoss, structureTruncated,
        visibleBodyMissing, rawSourceBodyMissing, rawCssTruncated, sourceTruncationNoticeInstalled,
        rawBodyTagCount: rawSourceIntegrity.rawBodyTagCount, rawBodyTextLength: rawSourceIntegrity.rawBodyTextLength,
        rawBodyElementCount: rawSourceIntegrity.rawBodyElementCount,
        rawBodySemanticElementCount: rawSourceIntegrity.rawBodySemanticElementCount,
        rawBodyVisualProgramCount: rawSourceIntegrity.rawBodyVisualProgramCount,
        rawBodyEmptyShell: rawSourceIntegrity.rawBodyEmptyShell,
        renderedBodyElementCount,
        renderedBodyTextLength: Number(renderedBodyEvidence?.textLength || 0),
        renderedBodySemanticElementCount: Number(renderedBodyEvidence?.semanticElementCount || 0),
        renderedBodyVisualProgramCount: Number(renderedBodyEvidence?.visualProgramCount || 0),
        renderedBodyEmptyShell: !!renderedBodyEvidence?.highConfidenceEmptyShell,
        recoverableBodySource: recoverableBodySource?.label || '', mobile3DFlipCandidate, verdict,
    };
}

function buildInteractionDiagnosticText(root, state, phase = 'capture complete') {
    const inputs = diagnosticQueryContentAll(root, 'input[type="checkbox"], input[type="radio"]').slice(0, 8);
    const labels = diagnosticQueryContentAll(root, 'label');
    const targets = diagnosticCollectTargets(root);
    const routes = diagnosticRouteSummary(root);
    const checkedDepth = maintenanceCheckedInteractionDepth(root);
    const pseudoDepth = maintenancePseudoInteractionDepth(root);
    const reachability = maintenanceReachableInteractionEvidence(
        root,
        routes,
        checkedDepth,
        pseudoDepth,
        getRawAssistantMessageForRenderedRoot(root),
    );
    const mobileLayout = inspectMaintenanceMobileLayout(root);
    const nestedDetailsPopupCandidateCount = findNestedDetailsPopupClippingCandidates(root).length;
    const mobileInlineAnnotationCandidateCount = findMobileInlineAnnotationCandidates(root).length;
    const structuredStaticDisclosureCandidateCount = findStructuredStaticDisclosureCandidates(root).length;
    const fillInChoiceCandidateCount = findFillInChoiceCandidates(root)
        .reduce((sum, candidate) => sum + Number(candidate.blanks?.length || 0), 0);
    const title = diagnosticCompactText(root.querySelector('summary')?.textContent, 64);
    const code = diagnosticCodeRescueSummary(root);
    const full = diagnosticFullChainSummary(root, code);
    const lines = [
        `RabbitMirror 全链路诊断 ${INTERACTION_DIAGNOSTIC_VERSION}`,
        `标题: ${title || '(未渲染 summary／可能仍是代码块或纯文字)'}`,
        `阶段: ${phase}`,
        `诊断模式: 一次性全链路诊断（已自动停止）`,
        `控件验证: 隐藏隔离副本（不点击、不派发事件、不修改当前页面真实控件）`,
        `维修兔: ${isMaintenanceRabbitEnabled() ? 'ON（逐条手动巡逻）' : 'OFF'}`,
        `旧全局急救链: 已合并停用`,
        `消息 mesid: ${code.mesid}`,
        `根节点: ${diagnosticElementName(root)} / connected=${!!root.isConnected}`,
        '',
        '[1. HTML／Markdown 输入层]',
        `原始源含HTML=${full.rawHtml} 含toto=${full.rawToto} 含三反引号=${full.rawFence}`,
        `显示层仍含转义标签=${full.renderedEscapedTags}`,
        '',
        '[2. DOM 渲染层]',
        `details=${full.detailsCount} style=${full.styleCount} script=${full.scriptCount} iframe=${full.iframeCount}`,
        `buttons=${full.buttonCount} inputs=${full.inputCount} rabbitMirrors=${full.mirrorCount}`,
        `原始 inputs=${full.rawInputCount} labels=${full.rawLabelCount} UI标签≈${full.rawUiTagCount}`,
        `渲染 inputs=${full.inputCount} labels=${full.renderedLabelCount} UI标签≈${full.renderedUiTagCount}`,
        `SVG Data URI损坏候选=${full.damagedDataUriCandidate} 结构截断=${full.structureTruncated}`,
        `原始源码主体缺失=${!!full.rawSourceBodyMissing} 空结构壳=${!!full.rawBodyEmptyShell} CSS中途截断=${!!full.rawCssTruncated} 截断说明=${!!full.sourceTruncationNoticeInstalled}`,
        `原始主体 文本=${full.rawBodyTextLength ?? 0} 元素=${full.rawBodyElementCount ?? 0} 语义/媒体=${full.rawBodySemanticElementCount ?? 0} 视觉程序=${full.rawBodyVisualProgramCount ?? 0}`,
        `展开后主体缺失=${full.visibleBodyMissing} 空结构壳=${!!full.renderedBodyEmptyShell} 主体子节点=${full.renderedBodyElementCount ?? 0} 文本=${full.renderedBodyTextLength ?? 0}`,
        '',
        '[3. CSS 能力层]',
        `rules≈${full.cssRuleCount} keyframes=${full.animationCount}`,
        `hover=${full.hoverCount} focus=${full.focusCount} active=${full.activeCount} checked=${full.checkedCount}`,
        `宿主CSS解析错误=${full.hostCssParserError} 原始未编码SVG=${full.rawUnencodedSvgDataUri} 原始CSS注释=${full.rawCssCommentCount} 原始#ID选择器=${full.rawCssIdSelectorCount}`,
        `宿主CSS错误摘要=${full.hostCssParserErrorText || '(无)'}`,
        '',
        '[4. 净化器／属性保留层]',
        `原始内联事件=${full.rawInlineEvents} 渲染后内联事件=${full.renderedInlineEvents}`,
        `script保留=${full.scriptCount} iframe保留=${full.iframeCount}`,
        '',
        '[5. 宿主／美化重绘层]',
        `TH-render=${full.thRenderCount} highlightedCode=${full.highlightedCount}`,
        `当前镜面相关 TH-render=${full.relevantThRenderCount || 0} highlightedCode=${full.relevantHighlightedCount || 0} codeShells=${full.relevantCodeShellCount || 0}`,
        `源码恢复候选=${full.sourceCandidate} 源码被显示层遮蔽=${full.sourceObscured}`,
        '',
        '[6. RabbitMirror 急救安装层]',
        `interactionScoped=${full.scopedCount} interactionRescued=${full.rescuedCount}`,
        `maintenanceVersion=${full.maintenanceModuleVersion || '(无)'} mode=${full.maintenanceModuleMode || '(无)'}`,
        `findings=${full.maintenanceFindingCount || 0} repairOrder=${full.maintenanceRepairOrder || '(无)'}`,
        `verifiedResolved=${full.maintenanceResolvedCount || 0} verifiedRemaining=${full.maintenanceRemainingCount || 0}`,
        `sourceRepair attempted=${!!full.maintenanceSourceAttempted} changed=${!!full.maintenanceSourceChanged}`,
        `sourceRepair reason=${full.maintenanceSourceReason || '(无)'}`,
        '',
        `[全链路初步判断] ${full.verdict}`,
        '',
        '[7. 代码块／纯文字恢复链]',
        `标准代码外壳 codeShells=${code.codeShells} 当前镜面相关=${code.relevantCodeShells || 0}`,
        `已渲染兔子镜节点 renderedMirrors=${code.renderedMirrors}`,
        `显示层含 toto 标签文字=${code.renderedHasTotoText}`,
        `显示层含转义/可见 toto=${code.renderedHasEscapedToto}`,
        `显示层含三反引号=${code.renderedHasFence}`,
        `完整纯文字 toto 候选=${code.strictWhole} parseOk=${code.strictParseOk}`,
        `原始消息含 toto=${code.rawHasToto} needsSanitize=${code.rawNeeds} wouldChange=${code.rawWouldChange}`,
        `显示层 needsSanitize=${code.renderedNeeds} 当前镜面 needsSanitize=${!!code.currentMirrorNeedsSanitize} display_text与mes不同=${code.displayTextDiff}`,
        `长度 raw=${code.rawLength} renderedText=${code.renderedLength}`,
        `[代码块初步判断] ${code.reason}`,
        '',
        '[8. 交互恢复链]',
        `labels=${labels.length} inputs=${inputs.length} hiddenCandidates=${targets.length}`,
        `相邻隐藏组 entries=${routes.adjacent} listener=${root.dataset.rabbitMirrorAdjacentHiddenGroupFallback || 'false'}`,
        `双层状态 entries=${routes.layers} listener=${root.dataset.rabbitMirrorRenderedStateLayerFallback || 'false'}`,
        `label内隐藏 entries=${routes.labelInternal} listener=${root.dataset.rabbitMirrorLabelInternalHiddenFallback || 'false'}`,
        `label后置结果 entries=${routes.labelAdjacent} listener=${root.dataset.rabbitMirrorLabelAdjacentResultFallback || 'false'}`,
        `遮罩揭示 entries=${routes.maskReveal} listener=${routes.maskReveal ? 'true' : 'false'}`,
        `列表详情 entries=${routes.listDetail} listener=${root.dataset.rabbitMirrorRenderedListDetailFallback || 'false'}`,
        `状态兄弟映射 entries=${routes.stateSibling} listener=${root.dataset.rabbitMirrorCssStateSiblingFallback || 'false'}`,
        `跨层伪类状态 entries=${routes.stateCrossTree} listener=${routes.stateCrossTree ? 'true' : 'false'}`,
        `按钮后置内容 entries=${routes.buttonAdjacent} listener=${root.dataset.rabbitMirrorButtonAdjacentHiddenFallback || 'false'}`,
        `可点击后置内容 entries=${routes.clickableAdjacent} listener=${root.dataset.rabbitMirrorClickableAdjacentHiddenFallback || 'false'}`,
        `可点击画面弹层 entries=${routes.clickablePopup} listener=${root.dataset.rabbitMirrorClickableAdjacentPopupFallback || 'false'}`,
        `ID目标显隐 entries=${routes.checkedIdTarget} listener=${root.dataset.rabbitMirrorCheckedIdTargetFallback || 'false'}`,
        `focus→checked entries=${routes.focusToChecked} listener=${routes.focusToChecked ? 'true' : 'false'}`,
        `CSS状态规则 entries=${routes.checkedTextRule} listener=${routes.checkedTextRule ? 'true' : 'false'}`,
        `checked缺失控制类恢复 entries=${routes.missingCheckedClass} listener=${routes.missingCheckedClass ? 'true' : 'false'}`,
        `跨父层checked兜底 entries=${routes.crossParentChecked} listener=${routes.crossParentChecked ? 'true' : 'false'}`,
        `全选联动兜底 entries=${routes.checkedHasState} listener=${routes.checkedHasState ? 'true' : 'false'}`,
        `跨容器:has状态桥接 entries=${routes.detachedCheckedHas} listener=${routes.detachedCheckedHas ? 'true' : 'false'}`,
        `双向画面切换 entries=${routes.pairedCheckedState} listener=${routes.pairedCheckedState ? 'true' : 'false'}`,
        `叠层正文互斥 entries=${routes.exclusiveStackedState} listener=${routes.exclusiveStackedState ? 'true' : 'false'}`,
        `频道旋钮循环 entries=${routes.channelDialCycle} listener=${routes.channelDialCycle ? 'true' : 'false'}`,
        `单向checked回退 entries=${routes.reversibleChecked} listener=${routes.reversibleChecked ? 'true' : 'false'}`,
        `radio同组恢复 groups=${routes.radioGroups} listener=${routes.radioGroups ? 'true' : 'false'}`,
        `radio取消程序恢复 entries=${routes.radioReset} listener=${routes.radioReset ? 'true' : 'false'} last=${root.getAttribute?.(RAW_RADIO_RESET_LAST_ATTR) || '(尚未点击验证)'}`,
        `checked交互深度 rules=${checkedDepth.checkedRuleCount} selectionOnly=${checkedDepth.selectionStyleRuleCount} secondLayer=${checkedDepth.meaningfulCheckedRuleCount} fallback=${checkedDepth.selectionOnlyFallbackCount}`,
        `伪类交互深度 rules=${pseudoDepth.pseudoRuleCount} visualOnly=${pseudoDepth.visualOnlyPseudoRuleCount} secondLayer=${pseudoDepth.meaningfulPseudoRuleCount}`,
        `可达内容交互 elements=${reachability.contentInteractiveElementCount} routes=${reachability.installedInteractionRouteCount} missing=${reachability.noInteractionStructure}`,
        `内部details替换承载 patches=${root.dataset.rabbitMirrorNestedDetailsReplacement || '0'}`,
        `原始Hover触屏兜底 entries=${root.dataset.rabbitMirrorRawHoverFallback || '0'}`,
        `触屏Hover候选 targets=${routes.touchHoverEligible} active=${routes.touchHoverActive} listener=${root.dataset.rabbitMirrorTouchHoverFallback || 'false'}`,
        `展开透明保全 entries=${routes.expandedOpacity} listener=${routes.expandedOpacity ? 'true' : 'false'}`,
        `容器内揭示 entries=${routes.containerReveal} listener=${root.dataset.rabbitMirrorContainerInternalRevealFallback || 'false'}`,
        `元素自变化 entries=${routes.selfMutation} listener=${root.dataset.rabbitMirrorSelfMutationFallback || 'false'}`,
        `类名状态程序 entries=${routes.classStateProgram} listener=${routes.classStateProgram ? 'true' : 'false'}`,
        `CSS注释保全 entries=${routes.cssCommentRepair} listener=${routes.cssCommentRepair ? 'true' : 'false'}`,
        `安全状态程序 entries=${routes.changeProgram} listener=${routes.changeProgram ? 'true' : 'false'}`,
        `护照／证件翻页 entries=${routes.passportDocument} listener=${routes.passportDocument ? 'true' : 'false'}`,
        `装饰覆盖层穿透 entries=${routes.decorativeOverlayPassThrough} listener=${routes.decorativeOverlayPassThrough ? 'true' : 'false'}`,
        `无label focus-within持久桥接 entries=${routes.focusWithinPersistent} listener=${routes.focusWithinPersistent ? 'true' : 'false'} last=${root.dataset.rabbitMirrorFocusWithinPersistentLast || '(尚未点击验证)'}`,
        `无label控件宿主 entries=${routes.unlabeledChecked} listener=${routes.unlabeledChecked ? 'true' : 'false'} last=${root.dataset.rabbitMirrorUnlabeledCheckedLast || '(尚未点击验证)'}`,
        `有label控件安全副本实测 entries=${routes.labeledCheckedVerify} last=${root.getAttribute?.(LABELED_CHECKED_VERIFY_LAST_ATTR) || '(尚未安全验证)'}`,
        `缺失分支兜底 entries=${routes.selectionFallback} listener=${routes.selectionFallback ? 'true' : 'false'}`,
        `disabled选择恢复 groups=${routes.disabledChoice} listener=${routes.disabledChoice ? 'true' : 'false'}`,
        `无动作按钮兜底 entries=${routes.inertAction} listener=${routes.inertAction ? 'true' : 'false'}`,
        `静态抉择选择 entries=${routes.staticChoiceSelection} listener=${routes.staticChoiceSelection ? 'true' : 'false'}`,
        `结构化静态分段 candidates=${structuredStaticDisclosureCandidateCount} entries=${routes.structuredStaticDisclosure} listener=${routes.structuredStaticDisclosure ? 'true' : 'false'}`,
        `填空候选恢复 candidates=${fillInChoiceCandidateCount} entries=${routes.fillInChoice} listener=${routes.fillInChoice ? 'true' : 'false'}`,
        `iOS 3D翻面兼容 patches=${routes.webkit3dFlip} evidence=${formatWebKit3DFlipEvidence(root)}`,
        `label fallback=${root.dataset.rabbitMirrorLabelFallback || root.dataset.rabbitMirrorCheckedFallback || root.dataset.rabbitMirrorInteractionFallback || 'unknown'}`,
        '',
        '[9. 手机端排版／内容承载]',
        `viewportWidth=${mobileLayout.viewportWidth || 0} narrow=${!!mobileLayout.narrowViewport} candidates=${mobileLayout.candidateCount || 0}`,
        `overflow=${mobileLayout.horizontalOverflowCount || 0} fixedWidth=${mobileLayout.fixedWidthCount || 0} grid=${mobileLayout.gridCount || 0} matrix=${mobileLayout.matrixCount || 0} flex=${mobileLayout.flexCount || 0}`,
        `multiColumn=${mobileLayout.multiColumnCount || 0} media=${mobileLayout.mediaCount || 0} stateContent=${mobileLayout.stateContentCount || 0}`,
        `护照／证件内页=${mobileLayout.passportDocumentCount || 0} repaired=${root.getAttribute?.(PASSPORT_DOCUMENT_RESCUE_ATTR) || '0'}`,
        `剖面／分层保形=${mobileLayout.sectionStackCount || 0}`,
        `电视／终端屏幕保形=${mobileLayout.screenShellCount || 0}`,
        `内部details弹出结果裁切=${nestedDetailsPopupCandidateCount} repaired=${root.getAttribute?.(NESTED_DETAILS_POPUP_COUNT_ATTR) || '0'}`,
        `手机端行内批注=${mobileInlineAnnotationCandidateCount} repaired=${root.getAttribute?.(MOBILE_INLINE_ANNOTATION_COUNT_ATTR) || '0'}`,
        `repairScope=${root.getAttribute?.(MOBILE_LAYOUT_SCOPE_ATTR) || '(无)'} patched=${root.getAttribute?.(MOBILE_LAYOUT_RESCUE_COUNT_ATTR) || '0'}`,
        '',
        '[捕获事件]',
    ];

    if (!state.events.length) lines.push('（未捕获 click / input / change）');
    else state.events.slice(-16).forEach(item => lines.push(item));

    lines.push('', '[时间快照]');
    if (!state.snapshots.length) lines.push('（无）');
    else state.snapshots.forEach(item => lines.push(item));

    lines.push('', '[输入控件]');
    if (!inputs.length) lines.push('（无）');
    inputs.forEach((input, index) => {
        const label = diagnosticFindAssociatedLabel(root, input);
        lines.push(
            `${index}: ${diagnosticElementName(input)} type=${input.type} checked=${!!input.checked}`,
            `   label=${!!label} text="${diagnosticCompactText(label?.textContent, 68)}"`,
            `   attrs: route=${getRenderedInputRoute(input) || 'none'} adjacent=${input.getAttribute(RENDERED_ADJACENT_HIDDEN_GROUP_RESCUE_ATTR) || 'false'} layer=${input.getAttribute(RENDERED_STATE_LAYER_RESCUE_ATTR) || 'false'} labelInternal=${input.getAttribute(RENDERED_LABEL_INTERNAL_HIDDEN_RESCUE_ATTR) || 'false'} labelAdjacent=${input.getAttribute(RENDERED_LABEL_ADJACENT_RESULT_RESCUE_ATTR) || 'false'} idTarget=${input.getAttribute(RENDERED_CHECKED_ID_TARGET_RESCUE_ATTR) || 'false'} cssChecked=${input.getAttribute(CHECKED_TEXT_RULE_RESCUE_ATTR) || 'false'} detachedHas=${input.getAttribute(DETACHED_CHECKED_HAS_CONTROL_ATTR) || 'false'} focusWithinPersistent=${input.getAttribute(FOCUS_WITHIN_PERSISTENT_CONTROL_ATTR) || 'false'} radioGroup=${input.getAttribute(RADIO_GROUP_RESCUE_ATTR) || 'false'} expandedOpacity=${input.getAttribute(EXPANDED_OPACITY_RESCUE_ATTR) || 'false'} change=${input.getAttribute(CHANGE_PSEUDO_RESCUE_ATTR) || 'false'} unlabeledHost=${input.getAttribute(UNLABELED_CHECKED_CONTROL_RESCUE_ATTR) || 'false'} labeledVerified=${input.getAttribute(LABELED_CHECKED_VERIFY_CONTROL_ATTR) || 'false'}`,
        );
    });

    lines.push('', '[疑似隐藏内容]');
    if (!targets.length) lines.push('（无）');
    targets.forEach((target, index) => {
        const computed = diagnosticComputedStyle(target);
        const rect = diagnosticRect(target);
        const parentRect = diagnosticRect(target.parentElement);
        const clipping = diagnosticFindClippingAncestor(target, root);
        lines.push(
            `${index}: ${diagnosticElementName(target)} text="${diagnosticCompactText(target.textContent, 70)}"`,
            `   inline: opacity=${getInlineStyleValue(target, 'opacity') || '(empty)'} display=${getInlineStyleValue(target, 'display') || '(empty)'} visibility=${getInlineStyleValue(target, 'visibility') || '(empty)'} transform=${getInlineStyleValue(target, 'transform') || '(empty)'} height=${getInlineStyleValue(target, 'height') || '(empty)'} maxHeight=${getInlineStyleValue(target, 'max-height') || '(empty)'}`,
            `   computed: opacity=${computed?.opacity || '?'} display=${computed?.display || '?'} visibility=${computed?.visibility || '?'} height=${rect.height}px parentHeight=${parentRect.height}px`,
            `   clipping: ${clipping || '未发现明显裁切祖先'}`,
        );
    });

    lines.push('', `[初步判断] ${diagnosticInferReason(root, inputs, targets, state)}`);
    return lines.join('\n');
}

function diagnosticLimitSource(text, maxLength = DIAGNOSTIC_SOURCE_LIMIT) {
    let source = String(text || '');
    source = source
        .replace(/data:[^"'<>\s]{240,}/gi, match => `${match.slice(0, 72)}…[资源内容已省略]`)
        .replace(/[A-Za-z0-9+/]{600,}={0,2}/g, '[超长编码内容已省略]');
    if (source.length <= maxLength) return source;
    return `${source.slice(0, maxLength)}\n<!-- 已截断：原长度 ${source.length} 字符 -->`;
}

function getDiagnosticRawSource(root) {
    const rawMessage = getRawAssistantMessageForRenderedRoot(root);
    const rawRoot = chooseMatchingRawRabbitMirrorRoot(rawMessage, root);
    if (rawRoot?.outerHTML) return diagnosticLimitSource(rawRoot.outerHTML);
    const match = String(rawMessage || '').match(TOTO_BLOCK_SINGLE_RE);
    return diagnosticLimitSource(match?.[0] || rawMessage || '（未能从宿主聊天数据中取得原始兔子镜源码）');
}

function getDiagnosticRenderedSource(root) {
    try {
        const clone = root.cloneNode(true);
        if (clone.matches?.(`[${INTERACTION_DIAGNOSTIC_PANEL_ATTR}]`)) return '（当前根节点为诊断面板，无法复制兔子镜）';
        clone.querySelectorAll?.(`[${INTERACTION_DIAGNOSTIC_PANEL_ATTR}]`).forEach(panel => panel.remove());
        return diagnosticLimitSource(clone.outerHTML || '（无法序列化实际渲染代码）');
    } catch {
        return '（无法序列化实际渲染代码）';
    }
}

function buildInteractionDiagnosticClipboardText(root, state) {
    const report = state.report || buildInteractionDiagnosticText(root, state, 'capture complete');
    return [
        report,
        '',
        '[隐私提醒] 以下源码包含当前这一条兔子镜中的文字内容；请确认后再发送给他人。超长资源与编码内容会自动省略。',
        '',
        '[原始兔子镜源码]',
        getDiagnosticRawSource(root),
        '',
        '[实际渲染代码]',
        getDiagnosticRenderedSource(root),
    ].join('\n');
}

async function copyDiagnosticText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const ok = document.execCommand('copy');
            textarea.remove();
            return !!ok;
        } catch {
            return false;
        }
    }
}

function removeInteractionDiagnostic(root) {
    const state = interactionDiagnosticStates.get(root);
    state?.panel?.remove?.();
    interactionDiagnosticStates.delete(root);
    root?.querySelectorAll?.(`[${INTERACTION_DIAGNOSTIC_PANEL_ATTR}]`).forEach(panel => panel.remove());
}

function removeAllInteractionDiagnosticPanels() {
    const chatRoot = getChatRoot();
    chatRoot?.querySelectorAll?.(`[${INTERACTION_DIAGNOSTIC_PANEL_ATTR}]`).forEach(panel => panel.remove());
}

function createOneShotInteractionDiagnosticPanel(root, state) {
    if (!root?.isConnected || state.panel?.isConnected) return;
    const panel = document.createElement('div');
    panel.setAttribute(INTERACTION_DIAGNOSTIC_PANEL_ATTR, 'true');
    panel.style.cssText = [
        'position:relative', 'z-index:2147483000', 'display:block', 'box-sizing:border-box',
        'margin:16px 8px 8px', 'padding:12px', 'border:3px solid #facc15', 'border-radius:8px',
        'background:#111827', 'color:#f9fafb', 'box-shadow:0 0 0 2px #ef4444 inset',
        'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace', 'font-size:11px', 'line-height:1.45',
        'white-space:normal', 'overflow:auto', 'max-height:520px',
    ].join(';');

    const heading = document.createElement('div');
    heading.textContent = '【一次性兔子镜总诊断｜捕获完成后自动停止】';
    heading.style.cssText = 'font-weight:800;color:#fde047;margin-bottom:8px;';

    const privacy = document.createElement('div');
    privacy.textContent = '点击异常消息即可诊断：支持交互失效、代码块、纯文字源码与显示源冲突。复制时会附带该条源码与实际渲染代码；不会自动上传。';
    privacy.style.cssText = 'color:#cbd5e1;margin-bottom:8px;font-size:10px;';

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;';
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.textContent = '复制诊断＋代码';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = '关闭报告';
    const retryButton = document.createElement('button');
    retryButton.type = 'button';
    retryButton.textContent = '重新诊断';
    for (const button of [copyButton, closeButton, retryButton]) {
        button.style.cssText = 'cursor:pointer;padding:5px 10px;border:1px solid #fde047;border-radius:5px;background:#1f2937;color:#fff;';
    }
    actions.append(copyButton, closeButton, retryButton);

    const pre = document.createElement('pre');
    pre.textContent = '正在检查当前消息的代码恢复链与交互状态，请稍候约半秒……';
    pre.style.cssText = 'margin:0;white-space:pre-wrap;word-break:break-word;color:#f3f4f6;background:transparent;border:0;padding:0;';
    panel.append(heading, privacy, actions, pre);

    const outerDetails = root.matches?.('details') ? root : root.querySelector(':scope > details');
    (outerDetails || root).appendChild(panel);
    Object.assign(state, { panel, pre, copyButton, closeButton, retryButton });

    copyButton.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        const original = copyButton.textContent;
        copyButton.textContent = '正在整理源码…';
        const ok = await copyDiagnosticText(buildInteractionDiagnosticClipboardText(root, state));
        copyButton.textContent = ok ? '已复制' : '复制失败，请截图';
        setTimeout(() => { if (copyButton.isConnected) copyButton.textContent = original; }, 1400);
    });
    closeButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        removeInteractionDiagnostic(root);
    });
    retryButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        removeInteractionDiagnostic(root);
        triggerInteractionDiagnosticOnce();
    });
}

function getDiagnosticRootFromTarget(target) {
    if (!target?.closest) return null;
    if (target.closest(`[${INTERACTION_DIAGNOSTIC_PANEL_ATTR}]`)) return null;
    const toto = target.closest(MIRROR_TOTO_SELECTOR);
    if (toto && isInsideChatMessage(toto)) return toto;
    const details = target.closest('details');
    if (details && isRabbitMirrorDetails(details) && isInsideChatMessage(details)) return details;
    // 总诊断必须允许点击尚未恢复成 DOM 的代码块或纯文字源码。
    const body = target.closest('.mes_text');
    if (body && isInsideChatMessage(body)) return body;
    const message = target.closest('.mes, [mesid], [data-message-id], [data-messageid]');
    const messageBody = message?.querySelector?.('.mes_text');
    if (messageBody && isInsideChatMessage(messageBody)) return messageBody;
    return null;
}

function stopOneShotInteractionDiagnosticSession() {
    const session = oneShotInteractionDiagnosticSession;
    if (!session) return;
    for (const [type, handler] of Object.entries(session.handlers || {})) {
        session.chatRoot?.removeEventListener?.(type, handler, true);
    }
    for (const timer of session.timers || []) clearTimeout(timer);
    oneShotInteractionDiagnosticSession = null;
}

function finalizeOneShotInteractionDiagnostic(root, state) {
    captureInteractionDiagnosticSnapshot(root, state, '+650ms');
    state.report = buildInteractionDiagnosticText(root, state, 'full check +650ms');
    if (state.pre?.isConnected) state.pre.textContent = state.report;
    stopOneShotInteractionDiagnosticSession();
}

function handleOneShotInteractionDiagnosticEvent(session, event) {
    const root = getDiagnosticRootFromTarget(event?.target);
    if (!root) return;
    if (session.root && session.root !== root) return;

    if (!session.root) {
        session.root = root;
        removeInteractionDiagnostic(root);
        const state = { events: [], snapshots: [], panel: null, pre: null, report: '' };
        session.state = state;
        interactionDiagnosticStates.set(root, state);
        createOneShotInteractionDiagnosticPanel(root, state);
        captureInteractionDiagnosticSnapshot(root, state, '捕获前');
        for (const [label, delay] of [['+0ms', 0], ['+100ms', 100], ['+500ms', 500]]) {
            session.timers.push(setTimeout(() => captureInteractionDiagnosticSnapshot(root, state, label), delay));
        }
        session.timers.push(setTimeout(() => finalizeOneShotInteractionDiagnostic(root, state), 650));
    }

    const state = session.state;
    const target = event?.target;
    const checked = target?.matches?.('input[type="checkbox"], input[type="radio"]') ? ` checked=${!!target.checked}` : '';
    state.events.push(`${event.type}:capture target=${diagnosticElementName(target)}${checked}`);
    if (state.events.length > 24) state.events.splice(0, state.events.length - 24);
}


function maintenanceRabbitTitle(state, reason = '') {
    const details = reason ? `：${reason}` : '';
    if (state === MAINTENANCE_STATES.checking) return `维修兔正在巡逻${details}`;
    if (state === MAINTENANCE_STATES.healthy) return `维修兔：未发现需要维修的问题。点击可重新巡逻${details}`;
    if (state === MAINTENANCE_STATES.repairable) return `维修兔：发现可安全尝试修复的问题。点击开始维修${details}`;
    if (state === MAINTENANCE_STATES.unknown) return `维修兔：无法安全判断。点击生成全链路诊断${details}`;
    return '维修兔：点击巡逻';
}

function maintenanceRabbitGlyph(state) {
    if (state === MAINTENANCE_STATES.healthy) return '🐇🟢';
    if (state === MAINTENANCE_STATES.repairable) return '🐇🟡';
    if (state === MAINTENANCE_STATES.unknown) return '🐇🔴';
    return '🐇⚪';
}

function setMaintenanceRabbitState(button, state, reason = '') {
    if (!button) return;
    button.setAttribute(MAINTENANCE_STATE_ATTR, state);
    button.setAttribute(MAINTENANCE_REASON_ATTR, reason);
    button.textContent = maintenanceRabbitGlyph(state);
    button.title = maintenanceRabbitTitle(state, reason);
    button.setAttribute('aria-label', button.title);
    normalizeRabbitMirrorToolButton(button);
}

function isLikelyTouchDevice() {
    try {
        return (navigator.maxTouchPoints || 0) > 0 || globalThis.matchMedia?.('(hover: none)')?.matches === true;
    } catch {
        return false;
    }
}

function maintenanceInteractionScopeEvidence(root) {
    const controls = diagnosticQueryContentAll(root, 'input[type="checkbox"][id], input[type="radio"][id]');
    const explicitLabels = diagnosticQueryContentAll(root, 'label[for]');
    let duplicateIds = 0;
    let brokenLocalLabels = 0;
    let checkedCssIdSelectors = 0;

    for (const input of controls) {
        const id = String(input.id || '').trim();
        if (!id) continue;
        try {
            if (document.querySelectorAll(`#${escapeCssIdentifier(id)}`).length > 1) duplicateIds += 1;
        } catch {
            // Ignore selector failures.
        }
        const wrappingLabel = input.closest?.('label');
        const explicitLabel = explicitLabels.find(label => label.getAttribute('for') === id);
        const wrappingValid = !!wrappingLabel && wrappingLabel.control === input;
        const explicitValid = !!explicitLabel && explicitLabel.control === input;
        if (!wrappingValid && !explicitValid) brokenLocalLabels += 1;
    }

    const cssText = [...(root?.querySelectorAll?.('style') || [])].map(style => String(style.textContent || '')).join('\n');
    for (const input of controls) {
        const id = String(input.id || '').trim();
        if (!id) continue;
        const escaped = escapeRegExp(id);
        if (new RegExp(`(?:#${escaped}|\\[\\s*id\\s*=\\s*["']${escaped}["']\\s*\\])[^{}]*:checked`, 'i').test(cssText)) checkedCssIdSelectors += 1;
    }

    return { duplicateIds, brokenLocalLabels, checkedCssIdSelectors, needsScopeRepair: controls.length > 0 && (duplicateIds > 0 || brokenLocalLabels > 0) };
}


function selectionOnlyFallbackLabelText(input) {
    const label = input?.closest?.('label');
    const text = diagnosticCompactText(label?.textContent || input?.value || input?.id || '该选项', 120);
    return text || '该选项';
}

function lowestCommonElementAncestor(elements, boundary) {
    const list = (elements || []).filter(Boolean);
    if (!list.length) return null;
    let node = list[0];
    while (node && node !== boundary) {
        if (list.every(element => node.contains?.(element))) return node;
        node = node.parentElement;
    }
    return boundary && list.every(element => boundary.contains?.(element)) ? boundary : null;
}

function nextSelectionOnlyContentRegion(groupContainer, root) {
    let current = groupContainer;
    while (current && current !== root) {
        let sibling = current.nextElementSibling;
        while (sibling) {
            const tag = String(sibling.tagName || '').toLowerCase();
            const text = String(sibling.textContent || '').replace(/\s+/g, ' ').trim();
            if (!['style', 'script', 'br'].includes(tag)
                && !(tag === 'p' && !text)
                && !diagnosticIsInternalUiNode(sibling)
                && !sibling.matches?.(`[${SELECTION_ONLY_PLACEHOLDER_ATTR}]`)) {
                const hasControls = !!sibling.querySelector?.('input, select, textarea, button, label');
                if (!hasControls && text.length >= 60) return sibling;
                break;
            }
            sibling = sibling.nextElementSibling;
        }
        current = current.parentElement;
    }
    return null;
}


function maintenanceElementLooksClickable(element) {
    if (!element) return false;
    const inlineCursor = String(element.style?.getPropertyValue?.('cursor') || '').trim().toLowerCase();
    const computedCursor = String(diagnosticComputedStyle(element)?.cursor || '').trim().toLowerCase();
    return inlineCursor === 'pointer'
        || computedCursor === 'pointer'
        || element.getAttribute?.('role') === 'button'
        || element.hasAttribute?.('tabindex');
}

function findDisabledOnlyChoiceGroupCandidates(root) {
    if (!root?.querySelectorAll) return [];
    const groups = new Map();
    for (const input of diagnosticQueryContentAll(root, 'input[type="radio"][name]')) {
        const name = String(input.name || '').trim();
        if (!name) continue;
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(input);
    }

    const candidates = [];
    for (const inputs of groups.values()) {
        if (inputs.length < 2 || !inputs.every(input => input.disabled)) continue;
        const labels = inputs.map(input => diagnosticFindAssociatedLabel(root, input)).filter(Boolean);
        if (labels.length !== inputs.length || !labels.some(maintenanceElementLooksClickable)) continue;
        const groupContainer = lowestCommonElementAncestor(labels, root);
        if (!groupContainer || groupContainer === root || groupContainer.hasAttribute?.(DISABLED_ONLY_CHOICE_RESCUE_ATTR)) continue;
        if (groupContainer.getAttribute?.('aria-disabled') === 'true') continue;
        candidates.push({ inputs, labels, groupContainer });
    }
    return candidates;
}

function installDisabledOnlyChoiceFallback(root) {
    let installed = 0;
    for (const candidate of findDisabledOnlyChoiceGroupCandidates(root)) {
        for (const input of candidate.inputs) {
            input.setAttribute(DISABLED_ONLY_CHOICE_CONTROL_ATTR, 'true');
            input.disabled = false;
        }
        candidate.groupContainer.setAttribute(DISABLED_ONLY_CHOICE_RESCUE_ATTR, 'true');
        candidate.groupContainer.dataset.rabbitMirrorDisabledChoiceCount = String(candidate.inputs.length);
        installed += 1;
    }
    if (installed > 0) root.dataset.rabbitMirrorDisabledChoiceFallback = String(installed);
    return installed;
}


const STATIC_CHOICE_TITLE_RE = /^(?:选项|选择|方案|路线|分支|抉择|结局|行动|choice|option|route|path)\s*(?:[A-Z0-9一二三四五六七八九十]+)?\s*[:：·\-—]/i;
const STATIC_CHOICE_CONTEXT_RE = /(?:抉择|选择|选项|分支|路线|结局|节点|肉鸽|choice|option|decision|route|branch)/i;

function staticChoiceCardTitle(element) {
    if (!element?.querySelector) return '';
    const title = element.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > header, :scope > strong, :scope > b');
    return diagnosticCompactText(title?.textContent || element.textContent || '', 160);
}

function staticChoiceCardHasRealControl(element) {
    if (!element?.querySelector) return false;
    return !!element.querySelector('button, input, select, textarea, a[href], label, details, summary, [popovertarget], [commandfor], [contenteditable="true"]');
}

function staticChoiceCardLooksEligible(element) {
    if (!element || diagnosticIsInternalUiNode(element) || staticChoiceCardHasRealControl(element)) return false;
    const tag = String(element.tagName || '').toLowerCase();
    if (!/^(?:div|section|article|li|figure)$/.test(tag)) return false;
    if (!maintenanceElementLooksClickable(element)) return false;
    const text = diagnosticCompactText(element.textContent || '', 1600);
    if (text.length < 18 || text.length > 1500) return false;
    return STATIC_CHOICE_TITLE_RE.test(staticChoiceCardTitle(element));
}

function findStaticChoiceSelectionCandidates(root) {
    if (!root?.querySelectorAll) return [];
    const candidates = [];
    const managedGroups = new Set((staticChoiceSelectionRescueStates.get(root)?.entries || []).map(entry => entry.group));
    for (const group of diagnosticQueryContentAll(root, 'div, section, article, main, ul, ol')) {
        if (managedGroups.has(group)) continue;
        const managedAncestor = group.parentElement?.closest?.(`[${STATIC_CHOICE_SELECTION_RESCUE_ATTR}]`);
        if (managedAncestor && managedGroups.has(managedAncestor)) continue;
        if (group.querySelector?.('input, button, select, textarea, details, summary, [popovertarget], [commandfor]')) continue;

        const children = [...(group.children || [])]
            .filter(child => !/^(?:style|script|template|br)$/i.test(String(child.tagName || '')));
        if (children.length < 2 || children.length > 8) continue;
        if (!children.every(staticChoiceCardLooksEligible)) continue;

        const style = diagnosticComputedStyle(group);
        const display = String(style?.display || group.style?.display || '').toLowerCase();
        if (!/(?:grid|flex)/.test(display)) continue;

        const contextText = diagnosticCompactText(`${group.previousElementSibling?.textContent || ''} ${group.parentElement?.textContent || ''}`, 1200);
        const titles = children.map(staticChoiceCardTitle);
        if (!titles.every(title => STATIC_CHOICE_TITLE_RE.test(title))) continue;
        if (!STATIC_CHOICE_CONTEXT_RE.test(contextText) && children.length < 3) continue;

        candidates.push({ group, items: children, titles });
    }
    return candidates;
}

function ensureStaticChoiceSelectionStyle(root) {
    let style = root.querySelector?.(`style[${STATIC_CHOICE_SELECTION_STYLE_ATTR}]`);
    if (!style) {
        style = document.createElement('style');
        style.setAttribute(STATIC_CHOICE_SELECTION_STYLE_ATTR, 'true');
        root.appendChild(style);
    }
    style.textContent = `
[${STATIC_CHOICE_SELECTION_RESCUE_ATTR}] [${STATIC_CHOICE_SELECTION_ITEM_ATTR}] { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
[${STATIC_CHOICE_SELECTION_RESCUE_ATTR}="active"] [${STATIC_CHOICE_SELECTION_ITEM_ATTR}]:not([${STATIC_CHOICE_SELECTION_SELECTED_ATTR}="true"]) { opacity: .72 !important; }
[${STATIC_CHOICE_SELECTION_ITEM_ATTR}="true"][${STATIC_CHOICE_SELECTION_SELECTED_ATTR}="true"] { outline: 2px solid currentColor !important; outline-offset: 2px !important; }
`;
}

function applyStaticChoiceSelectionState(entry, selectedItem = null) {
    if (!entry?.group) return;
    entry.selectedItem = selectedItem && entry.items.includes(selectedItem) ? selectedItem : null;
    entry.group.setAttribute(STATIC_CHOICE_SELECTION_RESCUE_ATTR, entry.selectedItem ? 'active' : 'true');
    for (const item of entry.items) {
        const selected = item === entry.selectedItem;
        item.setAttribute(STATIC_CHOICE_SELECTION_SELECTED_ATTR, selected ? 'true' : 'false');
        item.setAttribute('aria-checked', selected ? 'true' : 'false');
    }
}

function installStaticChoiceSelectionFallback(root) {
    if (!root?.querySelectorAll) return 0;
    const candidates = findStaticChoiceSelectionCandidates(root);
    if (!candidates.length) return Number.parseInt(root.getAttribute?.(STATIC_CHOICE_SELECTION_COUNT_ATTR) || '0', 10) || 0;

    ensureStaticChoiceSelectionStyle(root);
    let state = staticChoiceSelectionRescueStates.get(root);
    if (!state) {
        state = { entries: [] };
        staticChoiceSelectionRescueStates.set(root, state);
    }

    let installed = 0;
    for (const candidate of candidates) {
        const rememberedSelectedItem = candidate.items.find(item => item.getAttribute?.(STATIC_CHOICE_SELECTION_SELECTED_ATTR) === 'true') || null;
        const entry = { ...candidate, selectedItem: rememberedSelectedItem };
        candidate.group.setAttribute(STATIC_CHOICE_SELECTION_RESCUE_ATTR, rememberedSelectedItem ? 'active' : 'true');
        candidate.group.setAttribute('role', 'radiogroup');
        candidate.group.setAttribute('aria-label', '抉择选项');

        for (const [index, item] of candidate.items.entries()) {
            item.setAttribute(STATIC_CHOICE_SELECTION_ITEM_ATTR, 'true');
            item.setAttribute(STATIC_CHOICE_SELECTION_SELECTED_ATTR, 'false');
            item.setAttribute('role', 'radio');
            item.setAttribute('aria-checked', 'false');
            item.setAttribute('aria-label', candidate.titles[index] || `选项 ${index + 1}`);
            if (!item.hasAttribute('tabindex')) item.setAttribute('tabindex', '0');

            const activate = event => {
                if (event?.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
                if (event?.type === 'keydown') event.preventDefault();
                if (event?.type === 'click' && event.target?.closest?.('a,button,input,select,textarea,label,summary')) return;
                const next = entry.selectedItem === item ? null : item;
                applyStaticChoiceSelectionState(entry, next);
            };
            item.addEventListener('click', activate, false);
            item.addEventListener('keydown', activate, false);
        }
        state.entries.push(entry);
        applyStaticChoiceSelectionState(entry, rememberedSelectedItem);
        installed += 1;
    }

    const total = new Set([...root.querySelectorAll?.(`[${STATIC_CHOICE_SELECTION_RESCUE_ATTR}]`) || []]).size;
    if (total) root.setAttribute(STATIC_CHOICE_SELECTION_COUNT_ATTR, String(total));
    return installed;
}


const FILL_IN_CHOICE_PLACEHOLDER_RE = /(?:[_＿]{3,}|…{2,}|\.\.\.{1,}|待填|填空|请填|blank|fill[\s_-]*in)/i;
const FILL_IN_CHOICE_HINT_RE = /(?:选项|候选|可选|答案|option|choice).{0,40}(?:待填|可选|选择|choose|fill)?/i;
const FILL_IN_CHOICE_CONTEXT_RE = /(?:填空|待填|候选|选项|答案|行为碎片|fill[\s_-]*in|blank|choice|option)/i;

function fillInChoiceDirectTextNode(element) {
    if (!element?.childNodes) return null;
    let fallback = null;
    for (const node of element.childNodes) {
        if (node?.nodeType !== 3) continue;
        fallback ||= node;
        if (FILL_IN_CHOICE_PLACEHOLDER_RE.test(String(node.nodeValue || ''))) return node;
    }
    return fallback;
}

function fillInChoiceDirectText(element) {
    if (!element?.childNodes) return '';
    return [...element.childNodes]
        .filter(node => node?.nodeType === 3)
        .map(node => String(node.nodeValue || ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function fillInChoiceExtractCodes(value) {
    const raw = String(value || '').toUpperCase().replace(/／/g, '/');
    const found = [];
    const add = code => {
        const clean = String(code || '').trim().toUpperCase();
        if (!/^[A-Z0-9]{1,3}$/.test(clean) || found.includes(clean)) return;
        found.push(clean);
    };
    for (const match of raw.matchAll(/\[\s*([A-Z0-9]{1,3})\s*\]/g)) add(match[1]);
    const stripped = raw
        .replace(/(?:选项|候选|可选|答案|OPTION|CHOICE|待填|填写|填空|请选择|选择|CHOOSE|FILL\s*IN)/g, ' ')
        .replace(/[()（）【】\[\]]/g, ' ');
    for (const token of stripped.split(/[\/、,，;；|\s]+/)) add(token);
    return found;
}

function fillInChoiceBlankEvidence(element) {
    if (!element || diagnosticIsInternalUiNode(element)) return null;
    const tag = String(element.tagName || '').toLowerCase();
    if (!/^(?:span|div|p|em|strong|b|i|code|small)$/.test(tag)) return null;
    if (element.querySelector?.('button, input, select, textarea, a[href], label, details, summary')) return null;
    const directText = fillInChoiceDirectText(element);
    const semantic = `${element.id || ''} ${getClassTokens(element).join(' ')} ${element.getAttribute?.('title') || ''}`;
    if (!FILL_IN_CHOICE_PLACEHOLDER_RE.test(`${directText} ${semantic}`)) return null;

    let hintNode = null;
    let allowedCodes = [];
    for (const node of element.querySelectorAll?.('*') || []) {
        const hint = diagnosticCompactText(node.textContent || '', 180);
        if (!FILL_IN_CHOICE_HINT_RE.test(hint)) continue;
        const codes = fillInChoiceExtractCodes(hint);
        if (!codes.length) continue;
        hintNode = node;
        allowedCodes = codes;
        break;
    }
    if (!allowedCodes.length) {
        const fallbackHint = `${element.getAttribute?.('aria-label') || ''} ${element.getAttribute?.('title') || ''}`;
        allowedCodes = fillInChoiceExtractCodes(fallbackHint);
    }
    if (!allowedCodes.length) return null;
    const textNode = fillInChoiceDirectTextNode(element);
    if (!textNode) return null;
    return {
        blank: element,
        textNode,
        originalText: String(textNode.nodeValue || ''),
        placeholder: directText || '_______',
        hintNode,
        allowedCodes,
    };
}

function fillInChoiceOptionEvidence(element) {
    if (!element || diagnosticIsInternalUiNode(element)) return null;
    const tag = String(element.tagName || '').toLowerCase();
    if (!/^(?:div|li|p|span|article|section)$/.test(tag)) return null;
    if (element.querySelector?.('button, input, select, textarea, a[href], label, details, summary')) return null;
    const directTag = [...(element.children || [])].find(child => /^\s*\[[A-Z0-9]{1,3}\]\s*$/i.test(String(child.textContent || '')));
    let code = '';
    let tagText = '';
    if (directTag) {
        tagText = String(directTag.textContent || '').trim();
        code = fillInChoiceExtractCodes(tagText)[0] || '';
    } else {
        const directText = fillInChoiceDirectText(element);
        const match = /^\s*\[([A-Z0-9]{1,3})\]\s*/i.exec(directText);
        if (!match) return null;
        code = String(match[1] || '').toUpperCase();
        tagText = match[0];
    }
    if (!code) return null;
    const allText = diagnosticCompactText(element.textContent || '', 240);
    const label = diagnosticCompactText(allText.replace(tagText, ''), 180);
    if (label.length < 2 || label.length > 160) return null;
    const nestedTagged = [...(element.querySelectorAll?.('div, li, p, span, article, section') || [])]
        .filter(node => node !== element && node !== directTag)
        .some(node => {
            const direct = fillInChoiceDirectText(node);
            const total = diagnosticCompactText(node.textContent || '', 220);
            return /^\s*\[[A-Z0-9]{1,3}\]/i.test(direct) && total.replace(direct, '').trim().length >= 2;
        });
    if (nestedTagged) return null;
    return { option: element, code, label };
}

function fillInChoiceHasExistingControl(root) {
    if (!root?.querySelectorAll) return true;
    const outerDetails = root.matches?.('details') ? root : root.querySelector?.(':scope > details');
    const outerSummary = outerDetails?.querySelector?.(':scope > summary') || null;
    return diagnosticQueryContentAll(root, 'button, input:not([type="hidden"]), select, textarea, a[href], label, details, summary, [contenteditable="true"], [popovertarget], [commandfor]')
        .some(element => {
            if (outerSummary && (element === outerSummary || outerSummary.contains?.(element))) return false;
            if (element === outerDetails) return false;
            if (element.matches?.(`[${MAINTENANCE_RABBIT_ATTR}], [${FEEDBACK_CAT_ATTR}], [${RESAY_ATTR}], [${TOOL_ENTRY_HOST_ATTR}]`)) return false;
            return true;
        });
}

function findFillInChoiceCandidates(root) {
    if (!root?.querySelectorAll || fillInChoiceHasExistingControl(root)) return [];
    if (Number.parseInt(root.getAttribute?.(FILL_IN_CHOICE_COUNT_ATTR) || '0', 10) > 0) return [];

    const blanks = diagnosticQueryContentAll(root, 'span, div, p, em, strong, b, i, code, small')
        .map(fillInChoiceBlankEvidence)
        .filter(Boolean)
        .filter(entry => !entry.blank.closest?.(`[${FILL_IN_CHOICE_RESCUE_ATTR}]`));
    if (!blanks.length || blanks.length > 12) return [];

    const options = diagnosticQueryContentAll(root, 'div, li, p, span, article, section')
        .map(fillInChoiceOptionEvidence)
        .filter(Boolean);
    if (options.length < 2 || options.length > 36) return [];

    const optionCodes = new Set(options.map(item => item.code));
    const matchedBlanks = blanks.map(entry => ({
        ...entry,
        allowedCodes: entry.allowedCodes.filter(code => optionCodes.has(code)),
    })).filter(entry => entry.allowedCodes.length > 0);
    if (!matchedBlanks.length) return [];

    const usedCodes = new Set(matchedBlanks.flatMap(entry => entry.allowedCodes));
    const matchedOptions = options.filter(item => usedCodes.has(item.code));
    if (matchedOptions.length < 2) return [];
    const contextText = diagnosticCompactText(root.textContent || '', 2600);
    if (!FILL_IN_CHOICE_CONTEXT_RE.test(contextText)) return [];
    if (matchedBlanks.length === 1 && matchedOptions.length < 2) return [];
    return [{ blanks: matchedBlanks, options: matchedOptions }];
}

function ensureFillInChoiceStyle(root) {
    let style = root.querySelector?.(`style[${FILL_IN_CHOICE_STYLE_ATTR}]`);
    if (!style) {
        style = document.createElement('style');
        style.setAttribute(FILL_IN_CHOICE_STYLE_ATTR, 'true');
        root.appendChild(style);
    }
    style.textContent = `
[${FILL_IN_CHOICE_BLANK_ATTR}] { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
[${FILL_IN_CHOICE_BLANK_ATTR}][${FILL_IN_CHOICE_ACTIVE_ATTR}="true"] { outline: 2px solid currentColor !important; outline-offset: 3px !important; }
[${FILL_IN_CHOICE_BLANK_ATTR}][${FILL_IN_CHOICE_FILLED_ATTR}="true"] { font-style: normal !important; min-width: 0 !important; }
[${FILL_IN_CHOICE_OPTION_ATTR}] { cursor: pointer !important; touch-action: manipulation; -webkit-tap-highlight-color: transparent; transition: opacity .16s ease, outline-color .16s ease, transform .16s ease; }
[${FILL_IN_CHOICE_RESCUE_ATTR}="active"] [${FILL_IN_CHOICE_OPTION_ATTR}][${FILL_IN_CHOICE_AVAILABLE_ATTR}="false"] { opacity: .34 !important; pointer-events: none !important; }
[${FILL_IN_CHOICE_OPTION_ATTR}][${FILL_IN_CHOICE_SELECTED_ATTR}="true"] { outline: 2px solid currentColor !important; outline-offset: 2px !important; }
[${FILL_IN_CHOICE_OPTION_ATTR}][${FILL_IN_CHOICE_USED_ATTR}="true"] { box-shadow: inset 0 0 0 1px currentColor !important; }
[${FILL_IN_CHOICE_BLANK_ATTR}]:focus-visible, [${FILL_IN_CHOICE_OPTION_ATTR}]:focus-visible { outline: 2px solid currentColor !important; outline-offset: 3px !important; }
`;
}

function fillInChoiceSetBlankText(entry, value) {
    if (!entry?.textNode) return;
    entry.textNode.nodeValue = String(value ?? '');
}

function applyFillInChoiceState(state) {
    if (!state?.root) return;
    state.root.setAttribute(FILL_IN_CHOICE_RESCUE_ATTR, state.activeEntry ? 'active' : 'true');
    for (const entry of state.entries) {
        const active = state.activeEntry === entry;
        entry.blank.setAttribute(FILL_IN_CHOICE_ACTIVE_ATTR, active ? 'true' : 'false');
        entry.blank.setAttribute(FILL_IN_CHOICE_FILLED_ATTR, entry.selectedCode ? 'true' : 'false');
        if (entry.selectedCode) entry.blank.setAttribute(FILL_IN_CHOICE_CODE_ATTR, entry.selectedCode);
        else entry.blank.removeAttribute(FILL_IN_CHOICE_CODE_ATTR);
        entry.blank.setAttribute('aria-expanded', active ? 'true' : 'false');
        entry.blank.setAttribute('aria-label', entry.selectedLabel
            ? `已填：${entry.selectedLabel}；点击修改，Delete 清除`
            : '待填空；点击后选择现有候选项');
    }
    for (const item of state.options) {
        const available = !state.activeEntry || state.activeEntry.allowedCodes.includes(item.code);
        const selected = !!state.activeEntry && state.activeEntry.selectedCode === item.code;
        const used = state.entries.some(entry => entry.selectedCode === item.code);
        item.option.setAttribute(FILL_IN_CHOICE_AVAILABLE_ATTR, available ? 'true' : 'false');
        item.option.setAttribute(FILL_IN_CHOICE_SELECTED_ATTR, selected ? 'true' : 'false');
        item.option.setAttribute(FILL_IN_CHOICE_USED_ATTR, used ? 'true' : 'false');
        item.option.setAttribute('aria-disabled', available ? 'false' : 'true');
        item.option.setAttribute('aria-selected', selected ? 'true' : 'false');
        item.option.tabIndex = available ? 0 : -1;
    }
}

function fillInChoiceClearEntry(state, entry, { focus = true } = {}) {
    if (!entry) return;
    entry.selectedCode = '';
    entry.selectedLabel = '';
    fillInChoiceSetBlankText(entry, entry.originalText || entry.placeholder || '_______');
    state.activeEntry = null;
    applyFillInChoiceState(state);
    if (focus) entry.blank.focus?.();
}

function fillInChoiceSelectOption(state, entry, optionEntry) {
    if (!entry || !optionEntry || !entry.allowedCodes.includes(optionEntry.code)) return;
    if (entry.selectedCode === optionEntry.code) {
        fillInChoiceClearEntry(state, entry);
        return;
    }
    entry.selectedCode = optionEntry.code;
    entry.selectedLabel = optionEntry.label;
    fillInChoiceSetBlankText(entry, optionEntry.label);
    state.activeEntry = null;
    applyFillInChoiceState(state);
    entry.blank.focus?.();
}

function fillInChoiceEligibleOptions(state) {
    if (!state?.activeEntry) return state?.options || [];
    return state.options.filter(item => state.activeEntry.allowedCodes.includes(item.code));
}

function installFillInChoiceFallback(root) {
    if (!root?.querySelectorAll) return 0;
    const candidates = findFillInChoiceCandidates(root);
    if (!candidates.length) return Number.parseInt(root.getAttribute?.(FILL_IN_CHOICE_COUNT_ATTR) || '0', 10) || 0;

    ensureFillInChoiceStyle(root);
    let state = fillInChoiceRescueStates.get(root);
    if (!state) {
        state = { root, entries: [], options: [], activeEntry: null };
        fillInChoiceRescueStates.set(root, state);
    }
    let installed = 0;

    for (const candidate of candidates) {
        for (const rawEntry of candidate.blanks) {
            if (state.entries.some(entry => entry.blank === rawEntry.blank)) continue;
            const entry = { ...rawEntry, selectedCode: '', selectedLabel: '' };
            entry.blank.setAttribute(FILL_IN_CHOICE_BLANK_ATTR, 'true');
            entry.blank.setAttribute('role', 'button');
            if (!entry.blank.hasAttribute('tabindex')) entry.blank.tabIndex = 0;
            state.entries.push(entry);
            installed += 1;

            entry.blank.addEventListener('click', event => {
                if (event.target?.closest?.(`[${FILL_IN_CHOICE_OPTION_ATTR}]`)) return;
                state.activeEntry = state.activeEntry === entry ? null : entry;
                applyFillInChoiceState(state);
            }, false);
            entry.blank.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    state.activeEntry = state.activeEntry === entry ? null : entry;
                    applyFillInChoiceState(state);
                    if (state.activeEntry === entry) fillInChoiceEligibleOptions(state)[0]?.option?.focus?.();
                    return;
                }
                if ((event.key === 'Delete' || event.key === 'Backspace') && entry.selectedCode) {
                    event.preventDefault();
                    fillInChoiceClearEntry(state, entry);
                    return;
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    state.activeEntry = null;
                    applyFillInChoiceState(state);
                }
            }, false);
        }

        for (const rawOption of candidate.options) {
            if (state.options.some(item => item.option === rawOption.option)) continue;
            const item = { ...rawOption };
            item.option.setAttribute(FILL_IN_CHOICE_OPTION_ATTR, 'true');
            item.option.setAttribute(FILL_IN_CHOICE_CODE_ATTR, item.code);
            item.option.setAttribute('role', 'option');
            if (!item.option.hasAttribute('tabindex')) item.option.tabIndex = 0;
            state.options.push(item);

            const choose = event => {
                if (event?.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
                if (event?.type === 'keydown') event.preventDefault();
                let entry = state.activeEntry;
                if (!entry || !entry.allowedCodes.includes(item.code)) {
                    const eligible = state.entries.filter(candidateEntry => candidateEntry.allowedCodes.includes(item.code));
                    entry = eligible.find(candidateEntry => !candidateEntry.selectedCode) || eligible[0] || null;
                }
                if (!entry) return;
                fillInChoiceSelectOption(state, entry, item);
            };
            item.option.addEventListener('click', choose, false);
            item.option.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    choose(event);
                    return;
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    const active = state.activeEntry;
                    state.activeEntry = null;
                    applyFillInChoiceState(state);
                    active?.blank?.focus?.();
                    return;
                }
                const eligible = fillInChoiceEligibleOptions(state);
                const currentIndex = eligible.indexOf(item);
                if (currentIndex < 0) return;
                let nextIndex = currentIndex;
                if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % eligible.length;
                else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + eligible.length) % eligible.length;
                else if (event.key === 'Home') nextIndex = 0;
                else if (event.key === 'End') nextIndex = eligible.length - 1;
                else return;
                event.preventDefault();
                eligible[nextIndex]?.option?.focus?.();
            }, false);
        }
    }

    if (installed > 0 && !state.outsideListenerInstalled) {
        root.addEventListener('click', event => {
            if (!state.activeEntry) return;
            if (event.target?.closest?.(`[${FILL_IN_CHOICE_BLANK_ATTR}], [${FILL_IN_CHOICE_OPTION_ATTR}]`)) return;
            state.activeEntry = null;
            applyFillInChoiceState(state);
        }, false);
        state.outsideListenerInstalled = true;
    }

    const total = state.entries.length;
    if (total) root.setAttribute(FILL_IN_CHOICE_COUNT_ATTR, String(total));
    applyFillInChoiceState(state);
    return installed;
}


function structuredStaticDisclosureInlineStyle(element) {
    return String(element?.getAttribute?.('style') || '').toLowerCase();
}

function structuredStaticDisclosureFontWeight(element) {
    const style = diagnosticComputedStyle(element);
    const raw = String(style?.fontWeight || element?.style?.fontWeight || '').toLowerCase();
    if (raw === 'bold' || raw === 'bolder') return 700;
    const numeric = Number.parseInt(raw, 10);
    return Number.isFinite(numeric) ? numeric : 400;
}

function structuredStaticDisclosureLooksSegmented(container) {
    if (!container) return false;
    const style = diagnosticComputedStyle(container);
    const inline = structuredStaticDisclosureInlineStyle(container);
    const display = String(style?.display || container.style?.display || '').toLowerCase();
    const className = String(container.className || '').toLowerCase();
    return /(?:grid|flex)/.test(display)
        || /(?:border(?:-|:)|background(?:-|:)|box-shadow\s*:|padding\s*:)/.test(inline)
        || /(?:card|panel|item|entry|row|metric|stat|evidence|record|section|block)/.test(className);
}

function structuredStaticDisclosureTitleLooksExplicit(trigger, container, children) {
    const title = diagnosticCompactText(trigger?.textContent || '', 180);
    if (title.length < 2 || title.length > 120) return false;
    if (/^(?:h[1-6]|legend|dt|th)$/i.test(String(trigger?.tagName || ''))) return true;
    if (structuredStaticDisclosureFontWeight(trigger) >= 600) return true;
    const triggerStyle = diagnosticComputedStyle(trigger);
    const textTransform = String(triggerStyle?.textTransform || trigger?.style?.textTransform || '').toLowerCase();
    const letterSpacing = Number.parseFloat(triggerStyle?.letterSpacing || trigger?.style?.letterSpacing || '0') || 0;
    if (textTransform && textTransform !== 'none') return true;
    if (Math.abs(letterSpacing) >= 0.4) return true;
    const emphasizedDescendant = [...(trigger.querySelectorAll?.('strong, b, h1, h2, h3, h4, h5, h6, [style]') || [])]
        .some(node => /font-weight\s*:\s*(?:bold|[6-9]00)\b/i.test(String(node.getAttribute?.('style') || ''))
            || /^(?:strong|b|h[1-6])$/i.test(String(node.tagName || '')));
    if (emphasizedDescendant) return true;
    if (children.length === 2 && structuredStaticDisclosureFontWeight(children[1]) >= 600) return true;
    return false;
}

function structuredStaticDisclosureBodyLooksMeaningful(bodies) {
    const visibleBodies = bodies.filter(body => {
        const style = diagnosticComputedStyle(body);
        const position = String(style?.position || body?.style?.position || '').toLowerCase();
        const opacity = Number.parseFloat(style?.opacity || body?.style?.opacity || '1');
        return position !== 'absolute' && position !== 'fixed' && !(Number.isFinite(opacity) && opacity <= 0.08);
    });
    if (!visibleBodies.length) return false;
    const textLength = visibleBodies.reduce((sum, body) => sum + diagnosticCompactText(body.textContent || '', 1200).length, 0);
    if (textLength >= 2) return true;
    return visibleBodies.some(body => {
        const inline = structuredStaticDisclosureInlineStyle(body);
        return /(?:background(?:-|:)|border(?:-|:)|height\s*:\s*(?:[2-9]|[1-9]\d))/i.test(inline)
            || !!body.querySelector?.('img, svg, canvas, video, progress, meter');
    });
}

const STRUCTURED_STATIC_DISCLOSURE_INTENT_RE = /(?:点击|点按|轻触|展开|收起|折叠|打开|关闭|查看(?:详情|全文|内容)?|更多|显示|隐藏|切换|揭示|翻开|展开阅读|tap|click|expand|collapse|toggle|open|close|view\s+(?:more|details)|show|hide|reveal)/i;
const STRUCTURED_STATIC_DISCLOSURE_CLASS_RE = /(?:accordion|collapse|collapsible|disclosure|toggle|expander|fold|drawer|spoiler|reveal|expandable)/i;

function structuredStaticDisclosureHasExplicitIntent(trigger, container, ignoreGeneratedRescueSemantics = false) {
    if (!trigger || !container) return false;
    const ariaLabel = String(trigger.getAttribute?.('aria-label') || '');
    const generatedLabel = /^展开或收起：/.test(ariaLabel);
    const semanticLabel = ignoreGeneratedRescueSemantics && generatedLabel ? '' : ariaLabel;
    const text = diagnosticCompactText(`${trigger.textContent || ''} ${semanticLabel} ${trigger.getAttribute?.('title') || ''}`, 220);
    if (STRUCTURED_STATIC_DISCLOSURE_INTENT_RE.test(text)) return true;

    const identity = `${trigger.id || ''} ${trigger.className || ''} ${container.id || ''} ${container.className || ''}`;
    if (STRUCTURED_STATIC_DISCLOSURE_CLASS_RE.test(identity)) return true;

    const inline = structuredStaticDisclosureInlineStyle(trigger);
    if (/cursor\s*:\s*pointer\b/i.test(inline)) return true;
    if (trigger.hasAttribute?.('onclick') || trigger.hasAttribute?.('aria-controls')) return true;
    if (!ignoreGeneratedRescueSemantics) {
        const role = String(trigger.getAttribute?.('role') || '').toLowerCase();
        if (role === 'button' || role === 'switch' || role === 'tab') return true;
    }
    return false;
}

function clearOrphanedStructuredStaticDisclosureArtifacts(root) {
    if (!root?.querySelectorAll || structuredStaticDisclosureRescueStates.get(root)?.entries?.length) return 0;
    let cleared = 0;
    for (const container of root.querySelectorAll(`[${STRUCTURED_STATIC_DISCLOSURE_RESCUE_ATTR}]`)) {
        const trigger = container.querySelector?.(`:scope > [${STRUCTURED_STATIC_DISCLOSURE_TRIGGER_ATTR}]`);
        // 新版只撤回缺乏原始交互意图的旧维修结果。明确写有“点击/展开”、组件类名、
        // cursor:pointer、onclick 或 aria-controls 的真实折叠结构继续保留，避免升级时误伤。
        if (trigger && structuredStaticDisclosureHasExplicitIntent(trigger, container, true)) continue;
        if (trigger) {
            const generatedLabel = /^展开或收起：/.test(String(trigger.getAttribute('aria-label') || ''));
            trigger.removeAttribute(STRUCTURED_STATIC_DISCLOSURE_TRIGGER_ATTR);
            // 旧版只有在原元素缺少 aria-label 时才写入这一固定文案；以它作为证据，
            // 避免清理时误删作者本来就设置的 role/tabindex/aria-expanded。
            if (generatedLabel) {
                if (trigger.getAttribute('role') === 'button') trigger.removeAttribute('role');
                if (trigger.getAttribute('tabindex') === '0') trigger.removeAttribute('tabindex');
                trigger.removeAttribute('aria-label');
                trigger.removeAttribute('aria-expanded');
            }
        }
        container.querySelectorAll?.(`:scope > [${STRUCTURED_STATIC_DISCLOSURE_BODY_ATTR}]`)
            ?.forEach(body => body.removeAttribute(STRUCTURED_STATIC_DISCLOSURE_BODY_ATTR));
        container.removeAttribute(STRUCTURED_STATIC_DISCLOSURE_RESCUE_ATTR);
        container.removeAttribute(STRUCTURED_STATIC_DISCLOSURE_OPEN_ATTR);
        cleared += 1;
    }
    const remaining = root.querySelectorAll(`[${STRUCTURED_STATIC_DISCLOSURE_RESCUE_ATTR}]`).length;
    if (remaining <= 0) {
        root.querySelector?.(`style[${STRUCTURED_STATIC_DISCLOSURE_STYLE_ATTR}]`)?.remove();
        root.removeAttribute?.(STRUCTURED_STATIC_DISCLOSURE_COUNT_ATTR);
    } else {
        root.setAttribute?.(STRUCTURED_STATIC_DISCLOSURE_COUNT_ATTR, String(remaining));
    }
    return cleared;
}

function structuredStaticDisclosureHasExistingInteraction(root) {
    if (!root?.querySelectorAll) return true;
    const outerDetails = root.matches?.('details') ? root : root.querySelector?.(':scope > details');
    const outerSummary = outerDetails?.querySelector?.(':scope > summary') || null;
    const selector = [
        'button', 'input:not([type="hidden"])', 'select', 'textarea', 'a[href]',
        '[role="button"]', '[role="switch"]', '[role="tab"]', '[role="radio"]',
        '[contenteditable="true"]', '[popovertarget]', '[commandfor]', '[tabindex]', 'summary',
    ].join(',');
    return diagnosticQueryContentAll(root, selector).some(element => {
        if (outerSummary && (element === outerSummary || outerSummary.contains?.(element))) return false;
        if (element.matches?.(`[${MAINTENANCE_RABBIT_ATTR}], [${FEEDBACK_CAT_ATTR}], [${RESAY_ATTR}], [${TOOL_ENTRY_HOST_ATTR}]`)) return false;
        return true;
    });
}

function findStructuredStaticDisclosureCandidates(root) {
    if (!root?.querySelectorAll || structuredStaticDisclosureHasExistingInteraction(root)) return [];
    const managed = new Set((structuredStaticDisclosureRescueStates.get(root)?.entries || []).map(entry => entry.container));
    const rawCandidates = [];
    for (const container of diagnosticQueryContentAll(root, 'div, section, article, main, li, dl')) {
        if (managed.has(container) || diagnosticIsInternalUiNode(container)) continue;
        if (container.hasAttribute?.(STRUCTURED_STATIC_DISCLOSURE_RESCUE_ATTR)) continue;
        if (container.querySelector?.('input, button, select, textarea, details, summary, a[href], [popovertarget], [commandfor], [contenteditable="true"]')) continue;
        const children = [...(container.children || [])]
            .filter(child => !/^(?:style|script|template|br)$/i.test(String(child.tagName || '')))
            .filter(child => !diagnosticIsInternalUiNode(child));
        if (children.length < 2 || children.length > 5) continue;
        if (!structuredStaticDisclosureLooksSegmented(container)) continue;
        const [trigger, ...bodies] = children;
        const inlinePair = children.length === 2 && children.every(child => /^(?:span|small|em|strong|b|i|code)$/i.test(String(child.tagName || '')));
        if (inlinePair && structuredStaticDisclosureFontWeight(children[1]) < 600) continue;
        const triggerStyle = diagnosticComputedStyle(trigger);
        const triggerPosition = String(triggerStyle?.position || trigger?.style?.position || '').toLowerCase();
        const triggerOpacity = Number.parseFloat(triggerStyle?.opacity || trigger?.style?.opacity || '1');
        if (triggerPosition === 'absolute' || triggerPosition === 'fixed') continue;
        if (Number.isFinite(triggerOpacity) && triggerOpacity <= 0.08) continue;
        if (!structuredStaticDisclosureTitleLooksExplicit(trigger, container, children)) continue;
        // 维修兔只能恢复已经表达出来的交互意图，不能把普通卡片、漫画分格或静态信息块
        // 擅自改造成折叠控件。必须存在点击/展开文案、交互语义、cursor:pointer 或明确组件类名。
        if (!structuredStaticDisclosureHasExplicitIntent(trigger, container)) continue;
        if (!structuredStaticDisclosureBodyLooksMeaningful(bodies)) continue;
        const wholeTextLength = diagnosticCompactText(container.textContent || '', 2200).length;
        if (wholeTextLength < 6 || wholeTextLength > 2000) continue;
        rawCandidates.push({ container, trigger, bodies, title: diagnosticCompactText(trigger.textContent || '', 80) });
    }

    // 只保留最内层的明确分段，避免同时把整张镜面和其内部小节都改造成折叠层。
    const leafCandidates = rawCandidates.filter(candidate => !rawCandidates.some(other => (
        other !== candidate && candidate.container.contains?.(other.container)
    )));
    // 单个普通标题正文很可能只是排版，不足以证明模型试图生成可推进结构；至少命中两段才允许维修兔介入。
    if (leafCandidates.length < 2) return [];
    return leafCandidates.slice(0, 12);
}

function ensureStructuredStaticDisclosureStyle(root) {
    let style = root.querySelector?.(`style[${STRUCTURED_STATIC_DISCLOSURE_STYLE_ATTR}]`);
    if (!style) {
        style = document.createElement('style');
        style.setAttribute(STRUCTURED_STATIC_DISCLOSURE_STYLE_ATTR, 'true');
        root.appendChild(style);
    }
    style.textContent = `
[${STRUCTURED_STATIC_DISCLOSURE_RESCUE_ATTR}] > [${STRUCTURED_STATIC_DISCLOSURE_TRIGGER_ATTR}] { cursor: pointer !important; touch-action: manipulation; -webkit-tap-highlight-color: transparent; position: relative; padding-right: max(1.8em, 28px) !important; }
[${STRUCTURED_STATIC_DISCLOSURE_RESCUE_ATTR}] > [${STRUCTURED_STATIC_DISCLOSURE_TRIGGER_ATTR}]::after { content: '−'; position: absolute; right: .35em; top: 50%; transform: translateY(-50%); font: 700 1em/1 sans-serif; opacity: .66; }
[${STRUCTURED_STATIC_DISCLOSURE_RESCUE_ATTR}][${STRUCTURED_STATIC_DISCLOSURE_OPEN_ATTR}="false"] > [${STRUCTURED_STATIC_DISCLOSURE_TRIGGER_ATTR}]::after { content: '+'; }
[${STRUCTURED_STATIC_DISCLOSURE_RESCUE_ATTR}][${STRUCTURED_STATIC_DISCLOSURE_OPEN_ATTR}="false"] > [${STRUCTURED_STATIC_DISCLOSURE_BODY_ATTR}] { display: none !important; }
[${STRUCTURED_STATIC_DISCLOSURE_RESCUE_ATTR}] > [${STRUCTURED_STATIC_DISCLOSURE_TRIGGER_ATTR}]:focus-visible { outline: 2px solid currentColor !important; outline-offset: 3px !important; }
`;
}

function applyStructuredStaticDisclosureState(entry, open) {
    if (!entry?.container || !entry?.trigger) return;
    entry.open = !!open;
    entry.container.setAttribute(STRUCTURED_STATIC_DISCLOSURE_OPEN_ATTR, entry.open ? 'true' : 'false');
    entry.trigger.setAttribute('aria-expanded', entry.open ? 'true' : 'false');
}

function installStructuredStaticDisclosureFallback(root) {
    if (!root?.querySelectorAll) return 0;
    // 升级后先撤回旧版本在普通静态分段上留下的内部标记与样式；不触碰原始正文和作者样式。
    clearOrphanedStructuredStaticDisclosureArtifacts(root);
    const candidates = findStructuredStaticDisclosureCandidates(root);
    if (!candidates.length) return Number.parseInt(root.getAttribute?.(STRUCTURED_STATIC_DISCLOSURE_COUNT_ATTR) || '0', 10) || 0;

    ensureStructuredStaticDisclosureStyle(root);
    let state = structuredStaticDisclosureRescueStates.get(root);
    if (!state) {
        state = { entries: [] };
        structuredStaticDisclosureRescueStates.set(root, state);
    }

    let installed = 0;
    for (const candidate of candidates) {
        if (state.entries.some(entry => entry.container === candidate.container)) continue;
        const entry = { ...candidate, open: true };
        candidate.container.setAttribute(STRUCTURED_STATIC_DISCLOSURE_RESCUE_ATTR, 'true');
        candidate.trigger.setAttribute(STRUCTURED_STATIC_DISCLOSURE_TRIGGER_ATTR, 'true');
        candidate.trigger.setAttribute('role', 'button');
        if (!candidate.trigger.hasAttribute('tabindex')) candidate.trigger.setAttribute('tabindex', '0');
        if (!candidate.trigger.hasAttribute('aria-label')) {
            candidate.trigger.setAttribute('aria-label', `展开或收起：${candidate.title || '当前内容'}`);
        }
        for (const body of candidate.bodies) body.setAttribute(STRUCTURED_STATIC_DISCLOSURE_BODY_ATTR, 'true');
        state.entries.push(entry);
        applyStructuredStaticDisclosureState(entry, true);

        const activate = event => {
            if (event?.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
            if (event?.type === 'keydown') event.preventDefault();
            if (event?.type === 'click' && event.target?.closest?.('a,button,input,select,textarea,label,summary')) return;
            applyStructuredStaticDisclosureState(entry, !entry.open);
        };
        candidate.trigger.addEventListener('click', activate, false);
        candidate.trigger.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                activate(event);
                return;
            }
            const currentIndex = state.entries.indexOf(entry);
            if (event.key === 'Escape') {
                event.preventDefault();
                for (const item of state.entries) applyStructuredStaticDisclosureState(item, true);
                candidate.trigger.focus?.();
                return;
            }
            let nextIndex = currentIndex;
            if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % state.entries.length;
            else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + state.entries.length) % state.entries.length;
            else if (event.key === 'Home') nextIndex = 0;
            else if (event.key === 'End') nextIndex = state.entries.length - 1;
            else return;
            event.preventDefault();
            state.entries[nextIndex]?.trigger?.focus?.();
        }, false);
        installed += 1;
    }

    const total = new Set([...root.querySelectorAll?.(`[${STRUCTURED_STATIC_DISCLOSURE_RESCUE_ATTR}]`) || []]).size;
    if (total) root.setAttribute(STRUCTURED_STATIC_DISCLOSURE_COUNT_ATTR, String(total));
    return installed;
}

const INERT_ACTION_BUTTON_TEXT_RE = /(?:确认|提交|下注|买定离手|继续|下一步|开始|启动|执行|打开|查看|领取|解锁|发送|保存|进入|揭示|抽取|投票|选择|决定|叩谢|拜谢|谢神|参拜|叩拜|礼拜|合掌|祈愿|祈福|还愿|上香|奉纳|致谢|道谢|感谢|confirm|submit|continue|next|start|launch|execute|open|view|claim|unlock|send|save|enter|reveal|draw|vote|choose|bet|place\s+bet|pray|worship|give\s+thanks|offer\s+thanks)/i;
const INERT_ACTION_RITUAL_TEXT_RE = /(?:叩谢|拜谢|谢神|参拜|叩拜|礼拜|合掌|祈愿|祈福|还愿|上香|奉纳|致谢|道谢|感谢|pray|worship|give\s+thanks|offer\s+thanks)/i;
let inertActionStatusCounter = 0;

function inertActionStatusMessage(button) {
    const rawLabel = diagnosticCompactText(button?.textContent || button?.getAttribute?.('aria-label') || '', 80)
        .replace(/[。！？!?]+$/g, '')
        .trim();
    const label = rawLabel || '当前操作';
    if (INERT_ACTION_RITUAL_TEXT_RE.test(label)) {
        return `“${label}”状态已记录。原始输出没有提供额外结果；再次点击可撤回。`;
    }
    return `“${label}”已记录。原始输出没有提供对应的后续结果内容；再次点击可撤回。`;
}

function buttonHasKnownInteractionRoute(button, root) {
    if (!button || !root) return true;
    if (diagnosticIsInternalUiNode(button) || button.closest?.('summary, form, label')) return true;
    if (button.disabled) return true;
    if (button.hasAttribute?.('onclick') || button.hasAttribute?.('onchange') || button.hasAttribute?.('oninput')) return true;
    if (button.hasAttribute?.('popovertarget') || button.hasAttribute?.('commandfor') || button.hasAttribute?.('formaction')) return true;
    if (button.hasAttribute?.('aria-controls')) {
        const targetId = String(button.getAttribute('aria-controls') || '').trim();
        if (targetId && root.querySelector?.(`#${escapeCssIdentifier(targetId)}`)) return true;
    }
    const rescueAttrs = [
        RENDERED_BUTTON_ADJACENT_HIDDEN_RESCUE_ATTR,
        RENDERED_CLICKABLE_ADJACENT_HIDDEN_RESCUE_ATTR,
        RENDERED_CLICKABLE_ADJACENT_POPUP_RESCUE_ATTR,
        RENDERED_CSS_STATE_SIBLING_RESCUE_ATTR,
        DIRECT_ID_CLICK_RESCUE_ATTR,
        DIRECT_ID_CLASS_STATE_RESCUE_ATTR,
        RAW_SELF_MUTATION_RESCUE_ATTR,
        INLINE_PSEUDO_RESCUE_ATTR,
        HINTED_PSEUDO_RESCUE_ATTR,
        INERT_ACTION_BUTTON_RESCUE_ATTR,
    ];
    if (rescueAttrs.some(attribute => button.hasAttribute?.(attribute))) return true;
    if (findRenderedButtonAdjacentHiddenTarget(button)
        || findRenderedClickableAdjacentHiddenTarget(button)
        || findRenderedClickableAdjacentPopupTarget(button)) return true;
    return false;
}

function findInertActionButtonCandidates(root) {
    if (!root?.querySelectorAll) return [];
    return diagnosticQueryContentAll(root, 'button').filter(button => {
        if (buttonHasKnownInteractionRoute(button, root)) return false;
        const text = diagnosticCompactText(button.textContent || button.getAttribute?.('aria-label') || '', 180);
        return text.length >= 2 && INERT_ACTION_BUTTON_TEXT_RE.test(text);
    });
}

function installInertActionButtonFallback(root) {
    let installed = 0;
    for (const button of findInertActionButtonCandidates(root)) {
        const status = document.createElement('div');
        status.setAttribute(INERT_ACTION_STATUS_ATTR, 'true');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        status.id = `rm-inert-action-status-${(++inertActionStatusCounter).toString(36)}`;
        status.hidden = true;
        status.style.cssText = 'display:none;box-sizing:border-box;width:100%;margin-top:10px;padding:10px 12px;border:1px dashed currentColor;border-radius:6px;font-size:13px;line-height:1.55;opacity:.8;';
        status.textContent = inertActionStatusMessage(button);
        button.insertAdjacentElement('afterend', status);

        const describedBy = String(button.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
        if (!describedBy.includes(status.id)) describedBy.push(status.id);
        button.setAttribute('aria-describedby', describedBy.join(' '));

        let active = false;
        const render = () => {
            status.hidden = !active;
            status.style.display = active ? 'block' : 'none';
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
            button.dataset.rabbitMirrorInertActionActive = active ? 'true' : 'false';
        };
        button.addEventListener('click', event => {
            event.preventDefault();
            active = !active;
            render();
        }, false);
        button.setAttribute(INERT_ACTION_BUTTON_RESCUE_ATTR, 'true');
        render();
        installed += 1;
    }
    if (installed > 0) root.dataset.rabbitMirrorInertActionFallback = String(installed);
    return installed;
}

function findSelectionOnlyRadioFallbackCandidates(root) {
    if (!root?.querySelectorAll) return [];
    const groups = new Map();
    for (const input of diagnosticQueryContentAll(root, 'input[type="radio"]')) {
        const name = String(input.name || '').trim();
        if (!name) continue;
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(input);
    }

    const candidates = [];
    for (const inputs of groups.values()) {
        if (inputs.length < 2) continue;
        // 已由跨容器 :has() 状态桥接恢复真实分支内容，不得再误判成“只有选中样式”。
        if (inputs.some(input => input.hasAttribute?.(DETACHED_CHECKED_HAS_CONTROL_ATTR))) continue;
        const labels = inputs.map(input => input.closest?.('label')).filter(Boolean);
        if (labels.length !== inputs.length) continue;
        const groupContainer = lowestCommonElementAncestor(labels, root);
        if (!groupContainer || groupContainer === root || groupContainer.hasAttribute?.(SELECTION_ONLY_FALLBACK_ATTR)) continue;

        const checkedInput = inputs.find(input => input.checked) || null;
        const nearbyContentRegion = nextSelectionOnlyContentRegion(groupContainer, root);
        // 只有确实存在默认选中项时，才能把后续正文安全视为该默认分支。
        // 若没有默认项或根本没有后续正文，只建立“已选择但原文无结果”的状态提示，不擅自隐藏任何现有内容。
        const mode = nearbyContentRegion && checkedInput ? 'content-region' : 'status-only';
        candidates.push({
            inputs,
            labels,
            groupContainer,
            contentRegion: mode === 'content-region' ? nearbyContentRegion : null,
            defaultInput: mode === 'content-region' ? checkedInput : null,
            mode,
        });
    }
    return candidates;
}

function installSelectionOnlyStateFallback(root) {
    if (!root?.querySelectorAll) return 0;
    const checkedDepth = maintenanceCheckedInteractionDepth(root);
    const forcedDisabledChoiceGroup = !!root.querySelector?.(`[${DISABLED_ONLY_CHOICE_RESCUE_ATTR}]`);
    if (!checkedDepth.checkedSelectionOnly && !forcedDisabledChoiceGroup) return 0;
    let installed = 0;
    for (const candidate of findSelectionOnlyRadioFallbackCandidates(root)) {
        const { inputs, groupContainer, contentRegion, defaultInput, mode } = candidate;
        const placeholder = document.createElement('div');
        placeholder.setAttribute(SELECTION_ONLY_PLACEHOLDER_ATTR, 'true');
        placeholder.setAttribute('role', 'status');
        placeholder.setAttribute('aria-live', 'polite');
        placeholder.hidden = true;
        placeholder.style.cssText = 'box-sizing:border-box;width:100%;padding:16px;border:1px dashed currentColor;border-radius:6px;line-height:1.6;opacity:.82;';
        const title = document.createElement('div');
        title.style.cssText = 'font-weight:700;margin-bottom:6px;';
        const note = document.createElement('div');
        note.style.cssText = 'font-size:13px;opacity:.78;';
        placeholder.append(title, note);

        if (mode === 'content-region' && contentRegion) {
            note.textContent = '原始输出未提供此选项的对应内容。切回默认选项可查看已保留内容。';
            contentRegion.insertAdjacentElement('afterend', placeholder);
            contentRegion.setAttribute(SELECTION_ONLY_SOURCE_ATTR, 'true');
        } else {
            note.textContent = '原始输出只提供了选中样式，没有对应的结果内容。可继续切换其他选项，维修兔不会代写缺失剧情。';
            groupContainer.insertAdjacentElement('afterend', placeholder);
        }

        const originalDisplay = contentRegion?.style?.getPropertyValue?.('display') || '';
        const originalPriority = contentRegion?.style?.getPropertyPriority?.('display') || '';
        const render = () => {
            const selected = inputs.find(input => input.checked) || null;
            if (mode === 'content-region' && contentRegion && defaultInput) {
                const showOriginal = !selected || selected === defaultInput;
                if (showOriginal) {
                    if (originalDisplay) contentRegion.style.setProperty('display', originalDisplay, originalPriority);
                    else contentRegion.style.removeProperty('display');
                    placeholder.hidden = true;
                    placeholder.style.display = 'none';
                } else {
                    contentRegion.style.setProperty('display', 'none', 'important');
                    title.textContent = selectionOnlyFallbackLabelText(selected);
                    placeholder.hidden = false;
                    placeholder.style.display = 'block';
                }
            } else if (selected) {
                title.textContent = selectionOnlyFallbackLabelText(selected);
                placeholder.hidden = false;
                placeholder.style.display = 'block';
            } else {
                placeholder.hidden = true;
                placeholder.style.display = 'none';
            }
            groupContainer.dataset.rabbitMirrorSelectionOnlySelected = String(selected?.id || selected?.value || '');
        };
        const onChange = event => {
            if (!inputs.includes(event.target)) return;
            render();
        };
        groupContainer.addEventListener('change', onChange, false);
        groupContainer.setAttribute(SELECTION_ONLY_FALLBACK_ATTR, mode);
        render();
        installed += 1;
    }
    if (installed > 0) {
        const capabilities = detectInteractionCapabilities(root);
        capabilities.selectionFallback = true;
        interactionCapabilityStates.set(root, capabilities);
        root.dataset.rabbitMirrorInteractionRoutes = Object.entries(capabilities)
            .filter(([, enabled]) => enabled)
            .map(([name]) => name)
            .join(',') || 'none';
    }
    return installed;
}

function isCheckedSelectionVisualProperty(property, value) {
    const name = String(property || '').trim().toLowerCase();
    const cleanValue = String(value || '').trim().toLowerCase();
    if (!name) return true;
    if (name === 'transform') {
        // 双面翻转会改变观察内容；普通位移、缩放与平面旋转只算选中反馈。
        return !/(?:rotate[xy]|perspective)\s*\(/i.test(cleanValue);
    }
    if (name.startsWith('--')) return true;
    return name === 'color'
        || name === 'background' || name.startsWith('background-')
        || name === 'border' || name.startsWith('border-')
        || name === 'box-shadow' || name === 'text-shadow'
        || name === 'outline' || name.startsWith('outline-')
        || name === 'filter' || name === 'backdrop-filter'
        || name === 'fill' || name === 'stroke'
        || name === 'cursor'
        || name === 'font-weight' || name === 'font-style'
        || name === 'text-decoration' || name === 'letter-spacing'
        || name === 'translate' || name === 'rotate' || name === 'scale'
        || name === 'transition' || name.startsWith('transition-')
        || name === 'transform-origin';
}


function checkedBaselineDeclarationMap(declarations) {
    const map = new Map();
    const declarationRe = /(^|;)\s*([a-z-]+)\s*:\s*([^;{}]+?)(?=;|$)/gi;
    let match;
    while ((match = declarationRe.exec(String(declarations || '')))) {
        map.set(normalizeStylePropertyName(match[2]), String(match[3] || '').replace(/\s*!important\s*$/i, '').trim().toLowerCase());
    }
    return map;
}

function checkedTargetHasHiddenBaseline(root, target, property) {
    if (!target) return false;
    const name = normalizeStylePropertyName(property);
    const inlineValue = String(target.style?.getPropertyValue?.(name) || '').trim().toLowerCase();
    const computed = diagnosticComputedStyle(target);
    const computedValue = String(computed?.getPropertyValue?.(name) || computed?.[name] || '').trim().toLowerCase();

    if (name === 'display' && (target.hidden || inlineValue === 'none' || computedValue === 'none')) return true;
    if (name === 'visibility' && /^(?:hidden|collapse)$/.test(inlineValue || computedValue)) return true;
    if (name === 'opacity') {
        const value = Number.parseFloat(inlineValue || computedValue || '1');
        if (Number.isFinite(value) && value <= 0.05) return true;
    }
    if (/^(?:height|max-height|min-height)$/.test(name)) {
        const value = inlineValue || computedValue;
        if (isCollapsedDimensionValue(value)) return true;
    }
    if (name === 'clip-path' && /(?:inset\(\s*50%|circle\(\s*0|polygon\(\s*0)/i.test(inlineValue || computedValue)) return true;

    const blockRe = /([^{}]+)\{([^{}]*)\}/g;
    for (const style of diagnosticQueryContentAll(root, 'style')) {
        const cssText = String(style.textContent || '');
        blockRe.lastIndex = 0;
        let block;
        while ((block = blockRe.exec(cssText))) {
            const selectorText = String(block[1] || '').trim();
            if (!selectorText || selectorText.startsWith('@') || /:(?:checked|hover|active|focus|focus-within|target|has)\b/i.test(selectorText)) continue;
            const declarations = checkedBaselineDeclarationMap(block[2]);
            if (!declarations.has(name)) continue;
            const baselineValue = declarations.get(name) || '';
            let matches = false;
            for (const selector of splitCssSelectorList(selectorText)) {
                try {
                    if (target.matches?.(selector)) {
                        matches = true;
                        break;
                    }
                } catch {
                    // Ignore malformed model-generated selectors.
                }
            }
            if (!matches) continue;
            if (name === 'display' && baselineValue === 'none') return true;
            if (name === 'visibility' && /^(?:hidden|collapse)$/.test(baselineValue)) return true;
            if (name === 'opacity') {
                const value = Number.parseFloat(baselineValue);
                if (Number.isFinite(value) && value <= 0.05) return true;
            }
            if (/^(?:height|max-height|min-height)$/.test(name) && isCollapsedDimensionValue(baselineValue)) return true;
            if (name === 'clip-path' && /(?:inset\(\s*50%|circle\(\s*0|polygon\(\s*0)/i.test(baselineValue)) return true;
        }
    }
    return false;
}

function checkedTargetCarriesResultContent(target) {
    if (!target) return false;
    const text = normalizeInteractionMatchText(target.textContent);
    if (text.length >= 2) return true;
    if (target.querySelector?.('img,svg,canvas,video,audio,figure,table,ul,ol,dl,blockquote')) return true;
    const semantic = `${target.id || ''} ${getClassTokens(target).join(' ')}`;
    return /(?:result|reaction|response|message|content|detail|reveal|hidden|panel|output|结果|反应|反馈|信息|详情|揭示|正文)/i.test(semantic)
        && !/(?:progress|meter|bar|track|fill|indicator|decor|ornament|进度|装饰)/i.test(semantic);
}

function checkedDeclarationCreatesContentReveal(root, target, property, value) {
    if (!checkedTargetCarriesResultContent(target)) return false;
    const name = normalizeStylePropertyName(property);
    const cleanValue = String(value || '').replace(/\s*!important\s*$/i, '').trim().toLowerCase();
    if (name === 'display') return cleanValue !== 'none' && checkedTargetHasHiddenBaseline(root, target, name);
    if (name === 'visibility') return /^(?:visible|initial|inherit|unset)$/.test(cleanValue) && checkedTargetHasHiddenBaseline(root, target, name);
    if (name === 'opacity') {
        const next = Number.parseFloat(cleanValue);
        return Number.isFinite(next) && next > 0.05 && checkedTargetHasHiddenBaseline(root, target, name);
    }
    if (/^(?:height|max-height|min-height)$/.test(name)) {
        return !isCollapsedDimensionValue(cleanValue) && checkedTargetHasHiddenBaseline(root, target, name);
    }
    if (name === 'clip-path') return /^(?:none|initial|inherit|unset)$/.test(cleanValue) && checkedTargetHasHiddenBaseline(root, target, name);
    if (name === 'content') return !/^(?:none|normal|['"]{0,2})$/.test(cleanValue);
    return false;
}

function isCheckedRuleVisualOnlyForTarget(root, target, styleMap) {
    return (styleMap || []).every(([property, value]) => {
        if (checkedDeclarationCreatesContentReveal(root, target, property, value)) return false;
        const name = normalizeStylePropertyName(property);
        if (/^(?:display|visibility|opacity|height|max-height|min-height|clip-path)$/.test(name)) return true;
        return isCheckedSelectionVisualProperty(name, value);
    });
}

function maintenanceCheckedInteractionDepth(root) {
    const controls = diagnosticQueryContentAll(root, 'input[type="checkbox"], input[type="radio"]');
    const selectionOnlyFallbackCount = diagnosticQueryContentAll(root, `[${SELECTION_ONLY_FALLBACK_ATTR}]`).length;
    if (!controls.length) return { checkedSelectionOnly: false, checkedSelectionOnlyRaw: false, checkedRuleCount: 0, meaningfulCheckedRuleCount: 0, selectionStyleRuleCount: 0, selectionOnlyFallbackCount };

    let checkedRuleCount = 0;
    let meaningfulCheckedRuleCount = 0;
    let selectionStyleRuleCount = 0;
    for (const input of controls) {
        const wrappingLabel = input.closest?.('label');
        for (const rule of parseCheckedRulesFromText(root, input)) {
            checkedRuleCount += 1;
            let targets = getSiblingTargetsForCheckedRule(input, rule.relation, rule.targetSelector);
            if (!targets.length) {
                targets = rule.source === 'class-local' || rule.source === 'generic-local'
                    ? getLocalContainerTargetsForCheckedRule(input, rule.targetSelector)
                    : getCrossContainerTargetsForCheckedRule(root, rule.targetSelector);
            }
            const onlySelectionSurface = targets.length > 0 && targets.every(target => (
                (wrappingLabel && (target === wrappingLabel || wrappingLabel.contains?.(target)))
                || String(target.tagName || '').toLowerCase() === 'label'
            ));
            const visualOnly = targets.length > 0
                && targets.every(target => isCheckedRuleVisualOnlyForTarget(root, target, rule.styleMap));
            if (onlySelectionSurface && visualOnly) selectionStyleRuleCount += 1;
            else meaningfulCheckedRuleCount += 1;
        }
    }

    const detachedCheckedHasRuleCount = Number.parseInt(root.getAttribute?.(DETACHED_CHECKED_HAS_RULE_COUNT_ATTR) || '0', 10) || 0;
    if (detachedCheckedHasRuleCount > 0) {
        checkedRuleCount += detachedCheckedHasRuleCount;
        meaningfulCheckedRuleCount += detachedCheckedHasRuleCount;
    }

    const checkedSelectionOnlyRaw = checkedRuleCount > 0
        && meaningfulCheckedRuleCount === 0
        && selectionStyleRuleCount === checkedRuleCount
        && controls.length > 1;
    const checkedSelectionOnly = checkedSelectionOnlyRaw && selectionOnlyFallbackCount === 0;
    return { checkedSelectionOnly, checkedSelectionOnlyRaw, checkedRuleCount, meaningfulCheckedRuleCount, selectionStyleRuleCount, selectionOnlyFallbackCount };
}



function pseudoStateTargetSelector(selectorText) {
    return String(selectorText || '')
        .replace(/:(?:hover|active|focus-within|focus)\b/gi, '')
        .trim();
}

function pseudoStateOpacityReveal(root, selectorText, value) {
    const nextOpacity = Number.parseFloat(String(value || ''));
    if (!Number.isFinite(nextOpacity) || nextOpacity <= 0.05) return false;
    const selector = pseudoStateTargetSelector(selectorText);
    if (!selector || !root?.querySelectorAll) return false;
    try {
        return [...root.querySelectorAll(selector)].some(target => {
            const style = diagnosticComputedStyle(target);
            const current = Number.parseFloat(style?.opacity || '1');
            return Number.isFinite(current) && current <= 0.05;
        });
    } catch {
        return false;
    }
}

function pseudoStateMovesDecorativeNestedDetailsSummary(root, selectorText, property) {
    const name = normalizeStylePropertyName(property);
    if (!['left', 'right', 'top', 'bottom'].includes(name)) return false;
    if (!/:hover\b/i.test(String(selectorText || ''))) return false;
    const selector = pseudoStateTargetSelector(selectorText);
    if (!selector || !root?.querySelectorAll) return false;
    try {
        const targets = [...root.querySelectorAll(selector)];
        if (!targets.length) return false;
        return targets.every(target => {
            const summary = target.closest?.('summary');
            const details = summary?.parentElement;
            if (!summary || !details || details.tagName !== 'DETAILS') return false;
            const outerDetails = root.matches?.('details') ? root : root.querySelector?.(':scope > details');
            if (details === outerDetails) return false;
            if (String(target.textContent || '').trim()) return false;
            const rect = target.getBoundingClientRect?.();
            const thinDecoration = !rect || Number(rect.height || 0) <= 16 || Number(rect.width || 0) <= 16;
            return thinDecoration;
        });
    } catch {
        return false;
    }
}

function isPseudoStateVisualOnlyProperty(root, selectorText, property, value) {
    const name = normalizeStylePropertyName(property);
    const normalizedValue = String(value || '').trim().toLowerCase();
    if (name === 'opacity') return !pseudoStateOpacityReveal(root, selectorText, normalizedValue);
    if (pseudoStateMovesDecorativeNestedDetailsSummary(root, selectorText, name)) return true;
    return isCheckedSelectionVisualProperty(name, normalizedValue);
}

function maintenancePseudoInteractionDepth(root) {
    let pseudoRuleCount = 0;
    let visualOnlyPseudoRuleCount = 0;
    let meaningfulPseudoRuleCount = 0;
    const blockRe = /([^{}]+)\{([^{}]*)\}/g;
    const declarationRe = /(^|;)\s*([a-z-]+)\s*:\s*([^;{}]+?)(?=;|$)/gi;

    for (const style of diagnosticQueryContentAll(root, 'style')) {
        if (style.hasAttribute?.(TOUCH_HOVER_STYLE_ATTR)) continue;
        const cssText = String(style.textContent || '');
        blockRe.lastIndex = 0;
        let block;
        while ((block = blockRe.exec(cssText))) {
            const selectorText = String(block[1] || '').trim();
            if (!/:(?:hover|active|focus-within|focus)\b/i.test(selectorText)) continue;
            for (const selector of selectorText.split(',').map(value => value.trim()).filter(Boolean)) {
                if (!/:(?:hover|active|focus-within|focus)\b/i.test(selector)) continue;
                const declarations = [];
                declarationRe.lastIndex = 0;
                let declaration;
                while ((declaration = declarationRe.exec(String(block[2] || '')))) {
                    declarations.push([declaration[2], declaration[3]]);
                }
                if (!declarations.length) continue;
                pseudoRuleCount += 1;
                const visualOnly = declarations.every(([property, value]) => (
                    isPseudoStateVisualOnlyProperty(root, selector, property, value)
                ));
                if (visualOnly) visualOnlyPseudoRuleCount += 1;
                else meaningfulPseudoRuleCount += 1;
            }
        }
    }

    const touchHoverEligibleCount = diagnosticQueryContentAll(root, `[${TOUCH_HOVER_READY_ATTR}]`).length;
    const touchHoverActiveCount = diagnosticQueryContentAll(root, `[${TOUCH_HOVER_ATTR}="true"]`).length;
    return {
        pseudoRuleCount,
        visualOnlyPseudoRuleCount,
        meaningfulPseudoRuleCount,
        touchHoverEligibleCount,
        touchHoverActiveCount,
        pseudoVisualOnlyRaw: pseudoRuleCount > 0 && meaningfulPseudoRuleCount === 0,
    };
}

function recoveredInlineStateProgramCount(root) {
    if (!root?.querySelectorAll) return 0;
    const selector = [
        `[${CHANGE_PSEUDO_RESCUE_ATTR}]`,
        `[${INLINE_PSEUDO_RESCUE_ATTR}]`,
        `[${DIRECT_ID_CLICK_RESCUE_ATTR}]`,
        `[${DIRECT_ID_CLASS_STATE_RESCUE_ATTR}]`,
        `[${RAW_SELF_MUTATION_RESCUE_ATTR}]`,
        `[${RAW_NAMED_FUNCTION_RESCUE_ATTR}]`,
        `[${RAW_RADIO_RESET_RESCUE_ATTR}]`,
        `[${PASSPORT_DOCUMENT_TRIGGER_RESCUE_ATTR}]`,
    ].join(',');
    return new Set([...root.querySelectorAll(selector)]).size;
}

function maintenanceReachableInteractionEvidence(root, routeSummary, checkedDepth, pseudoDepth, raw) {
    if (!root?.querySelectorAll) {
        return { contentInteractiveElementCount: 0, installedInteractionRouteCount: 0, noInteractionStructure: false };
    }
    const outerDetails = root.matches?.('details') ? root : root.querySelector?.(':scope > details');
    const outerSummary = outerDetails?.querySelector?.(':scope > summary') || null;
    const interactiveSelector = [
        'button', 'input:not([type="hidden"])', 'select', 'textarea', 'a[href]',
        '[role="button"]', '[role="switch"]', '[role="tab"]', '[role="menuitem"]', '[role="radio"]',
        '[contenteditable="true"]', '[popovertarget]', '[commandfor]', '[tabindex]', 'summary',
    ].join(',');
    const contentInteractiveElementCount = diagnosticQueryContentAll(root, interactiveSelector)
        .filter(element => {
            if (outerSummary && (element === outerSummary || outerSummary.contains?.(element))) return false;
            if (element.matches?.(`[${MAINTENANCE_RABBIT_ATTR}], [${FEEDBACK_CAT_ATTR}], [${RESAY_ATTR}], [${TOOL_ENTRY_HOST_ATTR}]`)) return false;
            return true;
        }).length;

    const installedInteractionRouteCount = Number(routeSummary.adjacent || 0)
        + Number(routeSummary.layers || 0)
        + Number(routeSummary.labelInternal || 0)
        + Number(routeSummary.labelAdjacent || 0)
        + Number(routeSummary.maskReveal || 0)
        + Number(routeSummary.listDetail || 0)
        + Number(routeSummary.stateSibling || 0)
        + Number(routeSummary.stateCrossTree || 0)
        + Number(routeSummary.buttonAdjacent || 0)
        + Number(routeSummary.clickableAdjacent || 0)
        + Number(routeSummary.clickablePopup || 0)
        + Number(routeSummary.checkedIdTarget || 0)
        + Number(routeSummary.focusToChecked || 0)
        + Number(routeSummary.checkedTextRule || 0)
        + Number(routeSummary.crossParentChecked || 0)
        + Number(routeSummary.checkedHasState || 0)
        + Number(routeSummary.detachedCheckedHas || 0)
        + Number(routeSummary.pairedCheckedState || 0)
        + Number(routeSummary.exclusiveStackedState || 0)
        + Number(routeSummary.channelDialCycle || 0)
        + Number(routeSummary.reversibleChecked || 0)
        + Number(routeSummary.containerReveal || 0)
        + Number(routeSummary.selfMutation || 0)
        + Number(routeSummary.classStateProgram || 0)
        + Number(routeSummary.changeProgram || 0)
        + Number(routeSummary.focusWithinPersistent || 0)
        + Number(routeSummary.unlabeledChecked || 0)
        + Number(routeSummary.selectionFallback || 0)
        + Number(routeSummary.disabledChoice || 0)
        + Number(routeSummary.inertAction || 0)
        + Number(routeSummary.staticChoiceSelection || 0)
        + Number(routeSummary.structuredStaticDisclosure || 0)
        + Number(routeSummary.fillInChoice || 0)
        + Number(routeSummary.passportDocument || 0);

    const rawStateProgram = /\bon(?:click|change|input)\s*=|setAttribute\s*\(\s*['"]data-|classList\.(?:add|remove|toggle)|\.checked\s*=|:checked\b|:target\b/i.test(String(raw || ''));
    const nestedDetailsCount = diagnosticQueryContentAll(root, 'details').filter(details => details !== outerDetails).length;
    const staticChoiceCandidateCount = findStaticChoiceSelectionCandidates(root).length;
    const structuredStaticDisclosureCandidateCount = findStructuredStaticDisclosureCandidates(root).length;
    const fillInChoiceCandidateCount = findFillInChoiceCandidates(root)
        .reduce((sum, candidate) => sum + Number(candidate.blanks?.length || 0), 0);
    const noInteractionStructure = contentInteractiveElementCount === 0
        && installedInteractionRouteCount === 0
        && staticChoiceCandidateCount === 0
        && structuredStaticDisclosureCandidateCount === 0
        && fillInChoiceCandidateCount === 0
        && Number(checkedDepth?.checkedRuleCount || 0) === 0
        && Number(pseudoDepth?.pseudoRuleCount || 0) === 0
        && nestedDetailsCount === 0
        && !rawStateProgram;
    return { contentInteractiveElementCount, installedInteractionRouteCount, noInteractionStructure };
}

function maintenanceKnownInteractionEvidence(root, full, code) {
    const raw = decodeHtmlEntities(getRawAssistantMessageForRenderedRoot(root) || '');
    const stateProgram = /\bon(?:click|change|input)\s*=|setAttribute\s*\(\s*['"]data-|classList\.(?:add|remove|toggle)|\.checked\s*=|:checked\b/i.test(raw);
    const checkedControlsLost = full.controlsLost && full.checkedCount > 0;
    const lostInlineStatePrograms = Math.max(0, Number(full.rawInlineEvents || 0) - Number(full.renderedInlineEvents || 0));
    const recoveredInlineStatePrograms = recoveredInlineStateProgramCount(root);
    const strippedStateProgram = lostInlineStatePrograms > recoveredInlineStatePrograms && stateProgram;
    const decorativeOverlayCandidateCount = findDecorativeOverlayPassThroughCandidates(root).length;
    const scopeEvidence = maintenanceInteractionScopeEvidence(root);
    const checkedDepth = maintenanceCheckedInteractionDepth(root);
    const pseudoDepth = maintenancePseudoInteractionDepth(root);
    const routeSummary = diagnosticRouteSummary(root);
    const otherRouteCount = routeSummary.adjacent + routeSummary.layers + routeSummary.labelInternal + routeSummary.labelAdjacent
        + routeSummary.maskReveal + routeSummary.listDetail + routeSummary.stateSibling + routeSummary.buttonAdjacent
        + routeSummary.clickableAdjacent + routeSummary.clickablePopup + routeSummary.checkedIdTarget + routeSummary.focusToChecked
        + routeSummary.checkedTextRule + routeSummary.crossParentChecked + routeSummary.checkedHasState + routeSummary.detachedCheckedHas + routeSummary.pairedCheckedState + routeSummary.expandedOpacity
        + routeSummary.reversibleChecked + routeSummary.radioReset
        + routeSummary.containerReveal + routeSummary.selfMutation + routeSummary.classStateProgram + routeSummary.changeProgram
        + routeSummary.focusWithinPersistent + routeSummary.unlabeledChecked + routeSummary.selectionFallback + routeSummary.disabledChoice + routeSummary.inertAction + routeSummary.staticChoiceSelection + routeSummary.structuredStaticDisclosure + routeSummary.fillInChoice + routeSummary.passportDocument;
    const innerDetailsCount = diagnosticQueryContentAll(root, 'details').length;
    const hasTargetRoute = !!root?.querySelector?.('a[href^="#"]') && /:target\b/i.test(raw);
    const hasPopoverRoute = !!root?.querySelector?.('[popovertarget], [commandfor], [popover]');
    const pseudoVisualOnly = pseudoDepth.pseudoVisualOnlyRaw
        && checkedDepth.meaningfulCheckedRuleCount === 0
        && otherRouteCount === 0
        && innerDetailsCount === 0
        && !hasTargetRoute
        && !hasPopoverRoute;
    const rawRootForCheckedClass = chooseMatchingRawRabbitMirrorRoot(raw, root);
    const missingCheckedSubjectClassCandidateCount = rawRootForCheckedClass
        ? parseMissingCheckedSubjectClassRules(rawRootForCheckedClass).length
        : 0;
    const missingCheckedSubjectClassRescueCount = Number.parseInt(root.getAttribute?.(MISSING_CHECKED_SUBJECT_CLASS_RESCUE_ATTR) || '0', 10) || 0;
    const missingCheckedSubjectClassMissingCount = Math.max(0, missingCheckedSubjectClassCandidateCount - missingCheckedSubjectClassRescueCount);
    const radioGroupInspection = inspectSanitizedRadioGroupLoss(root);
    const radioGroupLossCandidateCount = Number(radioGroupInspection.candidateCount) || 0;
    const radioGroupRescueCount = Number(radioGroupInspection.rescuedCount) || 0;
    const selectionOnlyRepairCandidateCount = checkedDepth.checkedSelectionOnly
        ? findSelectionOnlyRadioFallbackCandidates(root).length
        : 0;
    const crossParentCheckedRuleCandidateCount = findCrossParentCheckedRuleFallbackCandidates(root)
        .filter(candidate => !candidate.input.hasAttribute(CROSS_PARENT_CHECKED_RULE_RESCUE_ATTR))
        .length;
    const checkedHasStateRuleCandidateCount = parseBrokenCheckedHasStateRules(root).length;
    const checkedHasStateRuleRescueCount = Number.parseInt(root.getAttribute?.(CHECKED_HAS_STATE_RULE_COUNT_ATTR) || '0', 10) || 0;
    const checkedHasStateRuleMissingCount = Math.max(0, checkedHasStateRuleCandidateCount - checkedHasStateRuleRescueCount);
    const detachedCheckedHasRuleCandidateCount = parseDetachedCheckedHasRules(root).length;
    const detachedCheckedHasRuleRescueCount = Number.parseInt(root.getAttribute?.(DETACHED_CHECKED_HAS_RULE_COUNT_ATTR) || '0', 10) || 0;
    const detachedCheckedHasRuleMissingCount = Math.max(0, detachedCheckedHasRuleCandidateCount - detachedCheckedHasRuleRescueCount);
    const pairedCheckedStateCandidateCount = findPairedCheckedStateCandidates(root).length;
    const pairedCheckedStateRescueCount = Number.parseInt(root.getAttribute?.(PAIRED_CHECKED_STATE_COUNT_ATTR) || '0', 10) || 0;
    const pairedCheckedStateMissingCount = Math.max(0, pairedCheckedStateCandidateCount - pairedCheckedStateRescueCount);
    const exclusiveStackedStateCandidateCount = findExclusiveStackedStateCandidates(root).length;
    const exclusiveStackedStateRescueCount = Number.parseInt(root.getAttribute?.(EXCLUSIVE_STACKED_STATE_COUNT_ATTR) || '0', 10) || 0;
    const exclusiveStackedStateMissingCount = Math.max(0, exclusiveStackedStateCandidateCount - exclusiveStackedStateRescueCount);
    const channelDialCycleCandidateCount = findChannelDialCycleCandidates(root).length;
    const channelDialCycleRescueCount = Number.parseInt(root.getAttribute?.(CHANNEL_DIAL_CYCLE_COUNT_ATTR) || '0', 10) || 0;
    const channelDialCycleMissingCount = Math.max(0, channelDialCycleCandidateCount - channelDialCycleRescueCount);
    const oneWayCheckedResultCandidateCount = findOneWayCheckedResultCandidates(root)
        .filter(candidate => !candidate.target?.hasAttribute?.(REVERSIBLE_CHECKED_RESULT_TARGET_ATTR))
        .length;
    const reversibleCheckedResultRescueCount = Number.parseInt(root.getAttribute?.(REVERSIBLE_CHECKED_RESULT_ROOT_ATTR) || '0', 10) || 0;
    const disabledOnlyChoiceCandidateCount = findDisabledOnlyChoiceGroupCandidates(root).length;
    const inertActionButtonCandidateCount = findInertActionButtonCandidates(root).length;
    const staticChoiceSelectionCandidateCount = findStaticChoiceSelectionCandidates(root).length;
    const staticChoiceSelectionRescueCount = Number.parseInt(root.getAttribute?.(STATIC_CHOICE_SELECTION_COUNT_ATTR) || '0', 10) || 0;
    const structuredStaticDisclosureCandidateCount = otherRouteCount === 0
        && checkedDepth.meaningfulCheckedRuleCount === 0
        && pseudoDepth.meaningfulPseudoRuleCount === 0
        ? findStructuredStaticDisclosureCandidates(root).length
        : 0;
    const structuredStaticDisclosureRescueCount = Number.parseInt(root.getAttribute?.(STRUCTURED_STATIC_DISCLOSURE_COUNT_ATTR) || '0', 10) || 0;
    const fillInChoiceCandidateCount = findFillInChoiceCandidates(root)
        .reduce((sum, candidate) => sum + Number(candidate.blanks?.length || 0), 0);
    const fillInChoiceRescueCount = Number.parseInt(root.getAttribute?.(FILL_IN_CHOICE_COUNT_ATTR) || '0', 10) || 0;
    const focusWithinPersistentCandidateCount = findFocusWithinPersistentCandidates(root).length;
    const focusWithinPersistentRescueCount = Number(routeSummary.focusWithinPersistent || 0);
    const focusWithinPersistentMissingCount = Math.max(0, focusWithinPersistentCandidateCount - focusWithinPersistentRescueCount);
    // 只有选中项外观变化时，补 Hover 也不会生成缺失的第二层内容，不能误导为可修复交互。
    const touchHoverMissing = !checkedDepth.checkedSelectionOnly
        && isLikelyTouchDevice()
        // 只把真正承担第二层内容／状态变化的 Hover 视为需要触屏兜底。
        // 普通按钮变色、把手轻微位移等装饰 Hover 不应让已存在点击状态程序的作品持续报错。
        && pseudoDepth.meaningfulPseudoRuleCount > 0
        && focusWithinPersistentCandidateCount === 0
        && !root.querySelector?.(`[${TOUCH_HOVER_STYLE_ATTR}]`)
        && root.getAttribute?.('data-rabbit-mirror-touch-hover-fallback') !== 'true';
    const unscopedControls = (full.inputCount > 0 || full.buttonCount > 0)
        && root.dataset?.rabbitMirrorInteractionScoped !== 'true';
    const reachability = maintenanceReachableInteractionEvidence(root, routeSummary, checkedDepth, pseudoDepth, raw);
    return { checkedControlsLost, strippedStateProgram, lostInlineStatePrograms, recoveredInlineStatePrograms, decorativeOverlayCandidateCount, touchHoverMissing, unscopedControls, missingCheckedSubjectClassCandidateCount, missingCheckedSubjectClassRescueCount, missingCheckedSubjectClassMissingCount, radioGroupLossCandidateCount, radioGroupRescueCount, selectionOnlyRepairCandidateCount, disabledOnlyChoiceCandidateCount, inertActionButtonCandidateCount, staticChoiceSelectionCandidateCount, staticChoiceSelectionRescueCount, structuredStaticDisclosureCandidateCount, structuredStaticDisclosureRescueCount, fillInChoiceCandidateCount, fillInChoiceRescueCount, focusWithinPersistentCandidateCount, focusWithinPersistentRescueCount, focusWithinPersistentMissingCount, crossParentCheckedRuleCandidateCount, checkedHasStateRuleCandidateCount, checkedHasStateRuleRescueCount, checkedHasStateRuleMissingCount, detachedCheckedHasRuleCandidateCount, detachedCheckedHasRuleRescueCount, detachedCheckedHasRuleMissingCount, pairedCheckedStateCandidateCount, pairedCheckedStateRescueCount, pairedCheckedStateMissingCount, exclusiveStackedStateCandidateCount, exclusiveStackedStateRescueCount, exclusiveStackedStateMissingCount, channelDialCycleCandidateCount, channelDialCycleRescueCount, channelDialCycleMissingCount, oneWayCheckedResultCandidateCount, reversibleCheckedResultRescueCount, pseudoVisualOnly, raw, ...scopeEvidence, ...checkedDepth, ...pseudoDepth, ...reachability };
}

function maintenanceFallbackFullSummary(root) {
    const body = diagnosticMessageBody(root) || root;
    const snapshot = diagnosticContentSnapshot(body);
    const renderedHtml = snapshot.html;
    const renderedText = snapshot.text;
    const styleTexts = diagnosticQueryContentAll(body, 'style').map(style => String(style.textContent || '')).join('\n');
    return {
        renderedEscapedTags: /&lt;\/?[a-z]/i.test(renderedHtml) || /<toto\b/i.test(renderedText),
        structureTruncated: false,
        damagedDataUriCandidate: false,
        sourceCandidate: false,
        hostCssParserError: false,
        hostCssParserErrorText: '',
        rawUnencodedSvgDataUri: false,
        rawCssCommentCount: 0,
        rawCssIdSelectorCount: 0,
        severeStructureLoss: false,
        visibleBodyMissing: false,
        rawSourceBodyMissing: false,
        rawCssTruncated: false,
        rawBodyTagCount: 0,
        rawBodyTextLength: 0,
        rawBodyElementCount: 0,
        rawBodySemanticElementCount: 0,
        rawBodyVisualProgramCount: 0,
        rawBodyEmptyShell: false,
        sourceTruncationNoticeInstalled: false,
        renderedBodyElementCount: 0,
        renderedBodyTextLength: 0,
        renderedBodySemanticElementCount: 0,
        renderedBodyVisualProgramCount: 0,
        renderedBodyEmptyShell: false,
        rawToto: false,
        rawHtml: false,
        controlsLost: false,
        checkedCount: (styleTexts.match(/:checked\b/gi) || []).length,
        rawInlineEvents: 0,
        renderedInlineEvents: 0,
        hoverCount: (styleTexts.match(/:hover\b/gi) || []).length,
        activeCount: (styleTexts.match(/:active\b/gi) || []).length,
        inputCount: body?.querySelectorAll?.('input,select,textarea')?.length || 0,
        buttonCount: body?.querySelectorAll?.('button')?.length || 0,
    };
}

const MAINTENANCE_FINDING_STAGE_LABELS = Object.freeze({
    source: '源码',
    structure: '结构／样式',
    visibility: '显示',
    interaction: '交互',
    compatibility: '兼容',
});


function createMaintenanceFinding({ id, stage, label, evidence = [], mode, confidence = 1 }) {
    return {
        id: String(id || ''),
        stage: String(stage || 'structure'),
        label: String(label || ''),
        evidence: (Array.isArray(evidence) ? evidence : [evidence]).map(value => String(value || '')).filter(Boolean),
        mode: String(mode || ''),
        confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
    };
}

function maintenanceFindingKey(finding) {
    return `${finding?.stage || ''}:${finding?.id || ''}`;
}

function dedupeMaintenanceFindings(findings) {
    const map = new Map();
    for (const finding of findings || []) {
        if (!finding?.id || !finding?.label) continue;
        const key = maintenanceFindingKey(finding);
        const previous = map.get(key);
        if (!previous || Number(finding.confidence || 0) > Number(previous.confidence || 0)) map.set(key, finding);
    }
    return [...map.values()];
}

function buildMaintenanceFindings(root, {
    full = {},
    code = {},
    interaction = {},
    textClippingCandidateCount = 0,
    nestedDetailsPopupCandidateCount = 0,
    mobileInlineAnnotationCandidateCount = 0,
    mobileLayout = null,
} = {}) {
    const findings = [];
    const add = finding => findings.push(createMaintenanceFinding(finding));

    if (full.rawSourceBodyMissing && !full.sourceTruncationNoticeInstalled) {
        add({
            id: full.rawCssTruncated ? 'raw-css-truncated' : 'raw-body-missing',
            stage: 'source',
            mode: 'source',
            label: full.rawCssTruncated ? '原始输出在样式中途截断，正文没有生成' : '原始输出缺少可显示的正文主体',
            evidence: [`rawSourceBodyMissing=${!!full.rawSourceBodyMissing}`, `rawCssTruncated=${!!full.rawCssTruncated}`],
            confidence: 1,
        });
    }
    if (full.visibleBodyMissing) {
        add({
            id: 'visible-body-missing', stage: 'source', mode: 'source',
            label: '展开后没有显示兔子镜主体，但原始源码仍可恢复',
            evidence: ['visibleBodyMissing=true'], confidence: 1,
        });
    }
    if (full.structureTruncated || full.damagedDataUriCandidate) {
        add({
            id: 'source-structure-damaged', stage: 'source', mode: 'source',
            label: '源码结构截断或 SVG Data URI 损坏',
            evidence: [`structureTruncated=${!!full.structureTruncated}`, `damagedDataUriCandidate=${!!full.damagedDataUriCandidate}`],
            confidence: 0.98,
        });
    }
    if (full.severeStructureLoss && !full.visibleBodyMissing && full.rawToto) {
        add({
            id: 'severe-render-structure-loss', stage: 'source', mode: 'source',
            label: '渲染主体大面积缺失，原始源码仍可恢复',
            evidence: ['severeStructureLoss=true', 'rawToto=true'], confidence: 0.96,
        });
    }
    if (full.hostCssParserError) {
        add({
            id: 'host-css-parser-error', stage: 'structure', mode: 'style',
            label: '宿主 CSS 解析失败',
            evidence: [String(full.hostCssParserErrorText || 'hostCssParserError=true')], confidence: 0.98,
        });
    }
    if (!full.rawSourceBodyMissing && ((full.sourceCandidate && full.sourceObscured) || (code.strictWhole && code.strictParseOk))) {
        add({
            id: 'source-obscured-or-code-shell', stage: 'source', mode: 'source',
            label: '显示层被代码壳或源码文本接管，可从原始消息恢复',
            evidence: [
                `sourceCandidate=${!!full.sourceCandidate}`,
                `sourceObscured=${!!full.sourceObscured}`,
                `strictWhole=${!!code.strictWhole}`,
                `strictParseOk=${!!code.strictParseOk}`,
                `currentMirrorNeedsSanitize=${!!code.currentMirrorNeedsSanitize}`,
            ],
            confidence: full.sourceObscured || code.strictParseOk ? 0.97 : 0.86,
        });
    }

    if ((Number(nestedDetailsPopupCandidateCount) || 0) > 0) {
        add({
            id: 'nested-details-popup-clipped', stage: 'visibility', mode: 'text',
            label: `检测到 ${Number(nestedDetailsPopupCandidateCount) || 0} 处展开结果脱离文档流并被外层裁切`,
            evidence: [`nestedDetailsPopupCandidateCount=${Number(nestedDetailsPopupCandidateCount) || 0}`],
            confidence: 0.98,
        });
    }

    if ((Number(mobileInlineAnnotationCandidateCount) || 0) > 0) {
        add({
            id: 'mobile-inline-annotation-clipped', stage: 'visibility', mode: 'text',
            label: `检测到 ${Number(mobileInlineAnnotationCandidateCount) || 0} 处手机端行内批注被压窄、重叠或裁切`,
            evidence: [`mobileInlineAnnotationCandidateCount=${Number(mobileInlineAnnotationCandidateCount) || 0}`],
            confidence: 0.98,
        });
    }

    if ((Number(mobileLayout?.candidateCount) || 0) > 0) {
        add({
            id: 'mobile-layout-content-risk', stage: 'visibility', mode: 'text',
            label: `检测到 ${Number(mobileLayout?.candidateCount) || 0} 处手机端容器挤压、横向溢出或状态内容定高风险`,
            evidence: [
                `viewportWidth=${Number(mobileLayout?.viewportWidth) || 0}`,
                `horizontalOverflow=${Number(mobileLayout?.horizontalOverflowCount) || 0}`,
                `fixedWidth=${Number(mobileLayout?.fixedWidthCount) || 0}`,
                `grid=${Number(mobileLayout?.gridCount) || 0}`,
                `matrix=${Number(mobileLayout?.matrixCount) || 0}`,
                `flex=${Number(mobileLayout?.flexCount) || 0}`,
                `multiColumn=${Number(mobileLayout?.multiColumnCount) || 0}`,
                `media=${Number(mobileLayout?.mediaCount) || 0}`,
                `stateContent=${Number(mobileLayout?.stateContentCount) || 0}`,
            ],
            confidence: 0.93,
        });
    }

    if ((Number(textClippingCandidateCount) || 0) > 0) {
        add({
            id: 'text-clipping', stage: 'visibility', mode: 'text',
            label: `检测到 ${Number(textClippingCandidateCount) || 0} 处文字可能被裁切、限行或省略`,
            evidence: [`textClippingCandidateCount=${Number(textClippingCandidateCount) || 0}`], confidence: 0.9,
        });
    }

    if (interaction.checkedControlsLost) {
        add({
            id: 'checked-controls-lost', stage: 'interaction', mode: 'interaction',
            label: 'CSS 仍依赖 checked 状态，但对应控件已经丢失',
            evidence: ['controlsLost=true', 'checkedCount>0'], confidence: 1,
        });
    }
    if (interaction.strippedStateProgram) {
        add({
            id: 'state-program-stripped', stage: 'interaction', mode: 'interaction',
            label: '宿主删除了会推进状态的点击／变更程序',
            evidence: [
                `lostInlineStatePrograms=${Number(interaction.lostInlineStatePrograms) || 0}`,
                `recoveredInlineStatePrograms=${Number(interaction.recoveredInlineStatePrograms) || 0}`,
            ],
            confidence: 0.92,
        });
    }
    if (Number(interaction.decorativeOverlayCandidateCount) > 0) {
        add({
            id: 'decorative-overlay-blocks-touch', stage: 'interaction', mode: 'interaction',
            label: `${Number(interaction.decorativeOverlayCandidateCount)} 处全覆盖装饰层可能阻断触摸`,
            evidence: [`decorativeOverlayCandidateCount=${Number(interaction.decorativeOverlayCandidateCount)}`], confidence: 0.86,
        });
    }
    if (interaction.touchHoverMissing) {
        add({
            id: 'meaningful-hover-without-touch', stage: 'interaction', mode: 'interaction',
            label: '承担第二层内容的 Hover 在触屏环境没有等价操作',
            evidence: [`meaningfulPseudoRuleCount=${Number(interaction.meaningfulPseudoRuleCount) || 0}`], confidence: 0.94,
        });
    }
    if (Number(interaction.focusWithinPersistentMissingCount) > 0) {
        add({
            id: 'unlabeled-focus-within-not-persistent', stage: 'interaction', mode: 'interaction',
            label: '无 label 的透明 checkbox 只依赖 focus-within 显示第二层，触屏上无法稳定保持或再次关闭',
            evidence: [`focusWithinPersistentMissingCount=${Number(interaction.focusWithinPersistentMissingCount)}`], confidence: 1,
        });
    }
    if (Number(interaction.missingCheckedSubjectClassMissingCount) > 0) {
        add({
            id: 'missing-checked-control-class', stage: 'interaction', mode: 'interaction',
            label: 'CSS 的 :checked 状态引用了唯一缺失的控制 class，现有前后层无法切换',
            evidence: [`missingCheckedSubjectClassMissingCount=${Number(interaction.missingCheckedSubjectClassMissingCount)}`], confidence: 1,
        });
    }
    if (Number(interaction.radioGroupLossCandidateCount) > 0) {
        add({
            id: 'radio-group-name-stripped', stage: 'interaction', mode: 'interaction',
            label: 'radio 同组关系被宿主移除，单选节点会累积成同时选中',
            evidence: [`radioGroupLossCandidateCount=${Number(interaction.radioGroupLossCandidateCount)}`], confidence: 1,
        });
    }
    if (Number(interaction.selectionOnlyRepairCandidateCount) > 0) {
        add({
            id: 'selection-only-missing-result', stage: 'interaction', mode: 'interaction',
            label: '选择控件只有选中外观，没有可辨认的结果反馈',
            evidence: [`selectionOnlyRepairCandidateCount=${Number(interaction.selectionOnlyRepairCandidateCount)}`], confidence: 0.88,
        });
    }
    if (Number(interaction.disabledOnlyChoiceCandidateCount) > 0) {
        add({
            id: 'disabled-only-choice-group', stage: 'interaction', mode: 'interaction',
            label: '选择项具有可点击外观，但整组控件被 disabled，当前无法操作',
            evidence: [`disabledOnlyChoiceCandidateCount=${Number(interaction.disabledOnlyChoiceCandidateCount)}`], confidence: 0.96,
        });
    }
    if (Number(interaction.inertActionButtonCandidateCount) > 0) {
        add({
            id: 'inert-action-button', stage: 'interaction', mode: 'interaction',
            label: '动作按钮没有可识别的点击结果或状态推进路线',
            evidence: [`inertActionButtonCandidateCount=${Number(interaction.inertActionButtonCandidateCount)}`], confidence: 0.91,
        });
    }
    if (Number(interaction.staticChoiceSelectionCandidateCount) > 0) {
        add({
            id: 'static-choice-cards-without-selection', stage: 'interaction', mode: 'interaction',
            label: '抉择卡片具有明确选项与点击外观，但没有可保持的选择状态',
            evidence: [`staticChoiceSelectionCandidateCount=${Number(interaction.staticChoiceSelectionCandidateCount)}`], confidence: 0.97,
        });
    }
    if (Number(interaction.structuredStaticDisclosureCandidateCount) > 0) {
        add({
            id: 'structured-static-sections-without-reachable-state', stage: 'interaction', mode: 'interaction',
            label: '正文已分成多个明确层级，但所有分段仍是静态展示；可只使用现有标题与正文恢复可展开、可收起、可返回的巡览状态',
            evidence: [`structuredStaticDisclosureCandidateCount=${Number(interaction.structuredStaticDisclosureCandidateCount)}`], confidence: 0.94,
        });
    }
    if (Number(interaction.fillInChoiceCandidateCount) > 0) {
        add({
            id: 'fill-in-blanks-with-static-options', stage: 'interaction', mode: 'interaction',
            label: '填空位与候选碎片已经存在，但当前只有 Hover 提示；可只使用现有候选恢复可选择、可改选、可清除的保持状态',
            evidence: [`fillInChoiceCandidateCount=${Number(interaction.fillInChoiceCandidateCount)}`], confidence: 0.99,
        });
    }
    if (Number(interaction.crossParentCheckedRuleCandidateCount) > 0) {
        add({
            id: 'cross-parent-checked-target', stage: 'interaction', mode: 'interaction',
            label: 'checked 目标位于触发器父层之外，原生兄弟选择器无法命中',
            evidence: [`crossParentCheckedRuleCandidateCount=${Number(interaction.crossParentCheckedRuleCandidateCount)}`], confidence: 0.98,
        });
    }
    if (Number(interaction.checkedHasStateRuleMissingCount) > 0) {
        add({
            id: 'checked-has-wrong-scope', stage: 'interaction', mode: 'interaction',
            label: '全选联动绑定在错误的 :has() 作用域，完成状态无法命中',
            evidence: [`checkedHasStateRuleMissingCount=${Number(interaction.checkedHasStateRuleMissingCount)}`], confidence: 0.98,
        });
    }
    if (Number(interaction.detachedCheckedHasRuleMissingCount) > 0) {
        add({
            id: 'detached-checked-has-state', stage: 'interaction', mode: 'interaction',
            label: 'radio/checkbox 位于 :has() 内容容器之外，原始分支正文无法随选择切换',
            evidence: [`detachedCheckedHasRuleMissingCount=${Number(interaction.detachedCheckedHasRuleMissingCount)}`], confidence: 1,
        });
    }
    if (Number(interaction.pairedCheckedStateMissingCount) > 0) {
        add({
            id: 'paired-checked-state-locked', stage: 'interaction', mode: 'interaction',
            label: '进入下一画面与返回主画面由两个独立 checkbox 控制，返回后会残留状态且内联隐藏阻断显示',
            evidence: [`pairedCheckedStateMissingCount=${Number(interaction.pairedCheckedStateMissingCount)}`], confidence: 1,
        });
    }
    if (Number(interaction.exclusiveStackedStateMissingCount) > 0) {
        add({
            id: 'exclusive-stacked-state-overlap', stage: 'interaction', mode: 'interaction',
            label: '多个状态正文叠在同一画布，默认层的内联可见样式会与选中分支重叠',
            evidence: [`exclusiveStackedStateMissingCount=${Number(interaction.exclusiveStackedStateMissingCount)}`], confidence: 0.99,
        });
    }
    if (Number(interaction.channelDialCycleMissingCount) > 0) {
        add({
            id: 'channel-dial-overlap', stage: 'interaction', mode: 'interaction',
            label: '频道旋钮的重叠点击分区遮住了中间频道，无法按顺序切换全部画面',
            evidence: [`channelDialCycleMissingCount=${Number(interaction.channelDialCycleMissingCount)}`], confidence: 0.99,
        });
    }
    if (Number(interaction.oneWayCheckedResultCandidateCount) > 0) {
        add({
            id: 'checked-result-no-return', stage: 'interaction', mode: 'interaction',
            label: 'checked 分支隐藏了唯一触发器，进入下一层后没有返回上一层的操作入口',
            evidence: [`oneWayCheckedResultCandidateCount=${Number(interaction.oneWayCheckedResultCandidateCount)}`], confidence: 0.98,
        });
    }
    if (interaction.needsScopeRepair) {
        add({
            id: 'interaction-id-scope-collision', stage: 'interaction', mode: 'interaction',
            label: `交互 ID 未隔离（重复 ID=${Number(interaction.duplicateIds) || 0}，失配标签=${Number(interaction.brokenLocalLabels) || 0}）`,
            evidence: [
                `duplicateIds=${Number(interaction.duplicateIds) || 0}`,
                `brokenLocalLabels=${Number(interaction.brokenLocalLabels) || 0}`,
            ],
            confidence: 0.94,
        });
    }

    if (full.mobile3DFlipCandidate) {
        add({
            id: 'ios-3d-flip-incomplete', stage: 'compatibility', mode: 'style',
            label: 'iOS 3D 翻面缺少 WebKit 对应属性，可能镜像或双面同显',
            evidence: ['mobile3DFlipCandidate=true'], confidence: 0.96,
        });
    }

    return dedupeMaintenanceFindings(findings);
}

function maintenanceRepairModesForFindings(findings) {
    const list = findings || [];
    const plan = [];
    const push = mode => { if (mode && !plan.includes(mode)) plan.push(mode); };
    if (list.some(finding => finding.stage === 'source')) push('source');
    if (list.some(finding => finding.stage === 'structure')) push('style');
    if (list.some(finding => finding.stage === 'visibility')) push('text');
    if (list.some(finding => finding.stage === 'interaction')) push('interaction');
    if (list.some(finding => finding.stage === 'compatibility')) push('style');
    return plan;
}

function maintenanceFindingReason(findings) {
    const list = findings || [];
    if (!list.length) return '';
    return list.map((finding, index) => {
        const stage = MAINTENANCE_FINDING_STAGE_LABELS[finding.stage] || '其他';
        return `${index + 1}. ${stage}：${finding.label}`;
    }).join('；');
}

function maintenanceFindingSnapshot(findings) {
    return (findings || []).map(finding => ({
        id: finding.id,
        stage: finding.stage,
        label: finding.label,
        mode: finding.mode,
        confidence: finding.confidence,
        evidence: finding.evidence,
    }));
}

function inspectMaintenanceRabbit(root) {
    let code = {};
    let full = maintenanceFallbackFullSummary(root);
    let partialInspection = false;
    try {
        code = diagnosticCodeRescueSummary(root) || {};
    } catch (error) {
        partialInspection = true;
        console.debug('[RabbitMirror] maintenance code inspection skipped:', error);
    }
    try {
        full = { ...full, ...(diagnosticFullChainSummary(root, code) || {}) };
    } catch (error) {
        partialInspection = true;
        console.debug('[RabbitMirror] maintenance full-chain inspection skipped:', error);
    }
    let interaction;
    try {
        interaction = maintenanceKnownInteractionEvidence(root, full, code);
    } catch (error) {
        partialInspection = true;
        console.debug('[RabbitMirror] maintenance interaction inspection skipped:', error);
        interaction = { checkedControlsLost: false, strippedStateProgram: false, lostInlineStatePrograms: 0, recoveredInlineStatePrograms: 0, decorativeOverlayCandidateCount: 0, touchHoverMissing: false, unscopedControls: false, missingCheckedSubjectClassCandidateCount: 0, missingCheckedSubjectClassRescueCount: 0, missingCheckedSubjectClassMissingCount: 0, radioGroupLossCandidateCount: 0, radioGroupRescueCount: 0, duplicateIds: 0, brokenLocalLabels: 0, checkedCssIdSelectors: 0, needsScopeRepair: false, checkedSelectionOnly: false, checkedSelectionOnlyRaw: false, checkedRuleCount: 0, meaningfulCheckedRuleCount: 0, selectionStyleRuleCount: 0, selectionOnlyFallbackCount: 0, selectionOnlyRepairCandidateCount: 0, disabledOnlyChoiceCandidateCount: 0, inertActionButtonCandidateCount: 0, staticChoiceSelectionCandidateCount: 0, staticChoiceSelectionRescueCount: 0, structuredStaticDisclosureCandidateCount: 0, structuredStaticDisclosureRescueCount: 0, fillInChoiceCandidateCount: 0, fillInChoiceRescueCount: 0, focusWithinPersistentCandidateCount: 0, focusWithinPersistentRescueCount: 0, focusWithinPersistentMissingCount: 0, crossParentCheckedRuleCandidateCount: 0, checkedHasStateRuleCandidateCount: 0, checkedHasStateRuleRescueCount: 0, checkedHasStateRuleMissingCount: 0, detachedCheckedHasRuleCandidateCount: 0, detachedCheckedHasRuleRescueCount: 0, detachedCheckedHasRuleMissingCount: 0, pairedCheckedStateCandidateCount: 0, pairedCheckedStateRescueCount: 0, pairedCheckedStateMissingCount: 0, exclusiveStackedStateCandidateCount: 0, exclusiveStackedStateRescueCount: 0, exclusiveStackedStateMissingCount: 0, channelDialCycleCandidateCount: 0, channelDialCycleRescueCount: 0, channelDialCycleMissingCount: 0, oneWayCheckedResultCandidateCount: 0, reversibleCheckedResultRescueCount: 0, pseudoVisualOnly: false, pseudoRuleCount: 0, visualOnlyPseudoRuleCount: 0, meaningfulPseudoRuleCount: 0, touchHoverEligibleCount: 0, touchHoverActiveCount: 0, contentInteractiveElementCount: 0, installedInteractionRouteCount: 0, noInteractionStructure: false, raw: '' };
    }
    let textClippingCandidateCount = 0;
    try {
        textClippingCandidateCount = findMaintenanceTextClippingCandidates(root).length;
    } catch (error) {
        partialInspection = true;
        console.debug('[RabbitMirror] maintenance text clipping inspection skipped:', error);
    }
    let nestedDetailsPopupCandidateCount = 0;
    try {
        nestedDetailsPopupCandidateCount = findNestedDetailsPopupClippingCandidates(root).length;
    } catch (error) {
        partialInspection = true;
        console.debug('[RabbitMirror] maintenance nested details popup inspection skipped:', error);
    }
    let mobileInlineAnnotationCandidateCount = 0;
    try {
        mobileInlineAnnotationCandidateCount = findMobileInlineAnnotationCandidates(root).length;
    } catch (error) {
        partialInspection = true;
        console.debug('[RabbitMirror] maintenance mobile inline annotation inspection skipped:', error);
    }
    let mobileLayout = { candidateCount: 0, viewportWidth: Number(globalThis.innerWidth || 0), narrowViewport: false };
    try {
        mobileLayout = inspectMaintenanceMobileLayout(root);
    } catch (error) {
        partialInspection = true;
        console.debug('[RabbitMirror] maintenance mobile layout inspection skipped:', error);
    }

    const findings = buildMaintenanceFindings(root, {
        full,
        code,
        interaction,
        textClippingCandidateCount,
        nestedDetailsPopupCandidateCount,
        mobileInlineAnnotationCandidateCount,
        mobileLayout,
    });
    const repairPlan = maintenanceRepairModesForFindings(findings);
    if (findings.length) {
        return {
            state: MAINTENANCE_STATES.repairable,
            reason: maintenanceFindingReason(findings),
            findings,
            repairPlan,
            code,
            full,
            interaction,
            textClippingCandidateCount,
            nestedDetailsPopupCandidateCount,
            mobileInlineAnnotationCandidateCount,
            mobileLayout,
        };
    }

    const unknownReasons = [];
    if (full.sourceTruncationNoticeInstalled) unknownReasons.push('原始输出缺少正文，已显示截断说明；缺失内容需要重新生成');
    if (full.severeStructureLoss && !full.rawToto) unknownReasons.push('渲染结构明显缺失，但未命中安全修复类型');
    if (full.controlsLost && full.checkedCount === 0 && full.rawInlineEvents === 0) unknownReasons.push('交互控件丢失，无法确认原始状态逻辑');
    if (full.currentMirrorRenderedEscapedTags && !code.strictParseOk && !full.sourceCandidate) unknownReasons.push('显示层仍有源码标签，但没有可安全恢复的完整候选');
    if (interaction.checkedSelectionOnly && interaction.selectionOnlyRepairCandidateCount === 0 && Number(interaction.pairedCheckedStateRescueCount || 0) === 0) unknownReasons.push('选择控件只能改变选中样式，且没有可安全挂接的内容区；维修兔不能代写缺失体验');
    if (interaction.pseudoVisualOnly) unknownReasons.push('当前只有 Hover／Active 外观变化，没有可保持状态或第二层内容；维修兔不能代写缺失体验');
    if (interaction.noInteractionStructure) unknownReasons.push('原始输出只有静态内容或动画，没有可达的内容交互结构；维修兔不能在不编造结果的情况下自动补全');
    if (unknownReasons.length) {
        return {
            state: MAINTENANCE_STATES.unknown,
            reason: unknownReasons.join('；'),
            findings: [],
            repairPlan: [],
            code,
            full,
            interaction,
            textClippingCandidateCount,
            nestedDetailsPopupCandidateCount,
            mobileInlineAnnotationCandidateCount,
            mobileLayout,
        };
    }
    const healthyReason = partialInspection
        ? '未发现可确认异常（部分巡逻项目已安全跳过）'
        : (full.activeCount > 0 && full.checkedCount === 0 ? '原生按压／长按交互完整，未发现高置信异常' : '未发现高置信异常');
    return {
        state: MAINTENANCE_STATES.healthy,
        reason: healthyReason,
        findings: [],
        repairPlan: [],
        code,
        full,
        interaction,
        textClippingCandidateCount,
        nestedDetailsPopupCandidateCount,
        mobileInlineAnnotationCandidateCount,
        mobileLayout,
    };
}

function patrolMaintenanceRabbit(root, button) {
    if (!root?.isConnected || !button?.isConnected) return null;
    setMaintenanceRabbitState(button, MAINTENANCE_STATES.checking, '正在检查 HTML、CSS、源码与交互链');
    let result;
    try {
        result = inspectMaintenanceRabbit(root);
    } catch (error) {
        console.debug('[RabbitMirror] maintenance rabbit patrol failed:', error);
        result = { state: MAINTENANCE_STATES.idle, reason: '巡逻未完成，可点击重试；未对当前兔子镜作任何修改' };
    }
    setTimeout(() => {
        if (button.isConnected) setMaintenanceRabbitState(button, result.state, result.reason);
    }, 120);
    return result;
}

function findLiveMaintenanceRoot(root, summaryText = '', messageIndex = -1) {
    if (root?.isConnected) return exactIndependentMaintenanceRoot(root);
    const independentHost = independentMaintenanceHost(root);
    const ownerKey = String(independentHost?.dataset?.rmKey || root?.dataset?.rabbitMirrorExternalOwner || '');
    if (ownerKey) {
        const exact = [...(document.querySelectorAll?.('[data-rabbit-mirror-external-source="true"][data-rm-source="independent"]') || [])]
            .find(host => String(host.dataset?.rmKey || '') === ownerKey);
        if (exact) return exact.querySelector?.(':scope > details') || exact;
    }
    const messageElement = messageIndex >= 0 ? getRenderedMessageElement(messageIndex) : null;
    if (!messageElement) return null;
    const candidates = getRenderedRabbitMirrorInteractionRoots(messageElement);
    if (!summaryText) return candidates[0] || null;
    return candidates.find(candidate => getRabbitMirrorSummaryText(candidate).includes(summaryText)) || candidates[0] || null;
}

function getSelectedMessageSource(message, { preferDisplay = false } = {}) {
    if (!message || message?.is_user) return '';
    const swipeIndex = Number.isInteger(message?.swipe_id) ? message.swipe_id : -1;
    const displaySource = typeof message?.extra?.display_text === 'string' ? message.extra.display_text : '';
    const swipeSource = swipeIndex >= 0 && typeof message?.swipes?.[swipeIndex] === 'string'
        ? message.swipes[swipeIndex]
        : '';
    const messageSource = typeof message?.mes === 'string' ? message.mes : '';
    const candidates = preferDisplay
        ? [displaySource]
        : [swipeSource, messageSource, displaySource];

    for (const candidate of candidates) {
        const decoded = decodeHtmlEntities(String(candidate || '')).trim();
        if (!decoded) continue;
        if (needsSanitize(decoded) || /<(?:toto|details)\b/i.test(decoded)) return decoded;
    }
    return candidates.map(value => String(value || '').trim()).find(Boolean) || '';
}

function normalizeMaintenanceSummaryText(text) {
    return String(text || '')
        .replace(/🐇[⚪🟢🟡🔴]?/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function maintenanceMessageSourceCandidates(message, { displayOnly = false } = {}) {
    const candidates = [];
    const seen = new Set();
    const push = (label, value) => {
        if (typeof value !== 'string') return;
        const source = decodeHtmlEntities(value).trim();
        if (!source || seen.has(source)) return;
        seen.add(source);
        candidates.push({ label, source });
    };

    if (displayOnly) {
        push('display_text', message?.extra?.display_text);
        return candidates;
    }

    const swipeIndex = Number.isInteger(message?.swipe_id) ? message.swipe_id : -1;
    if (swipeIndex >= 0) push('当前 swipe', message?.swipes?.[swipeIndex]);
    push('mes', message?.mes);
    push('display_text', message?.extra?.display_text);
    return candidates;
}

function maintenanceMirrorBodyEvidence(candidate) {
    const empty = {
        hasDetails: false,
        textLength: 0,
        bodyElementCount: 0,
        semanticElementCount: 0,
        visualProgramCount: 0,
        highConfidenceEmptyShell: false,
    };
    if (!(candidate instanceof Element)) return empty;
    const details = candidate.matches?.('details') ? candidate : candidate.querySelector?.('details');
    if (!details) return empty;

    const clone = details.cloneNode(true);
    clone.querySelectorAll?.([
        ':scope > summary',
        'script',
        'template',
        `[${MAINTENANCE_RABBIT_ATTR}]`,
        `[${FEEDBACK_CAT_ATTR}]`,
        `[${TOOL_ENTRY_HOST_ATTR}]`,
        `[${MAINTENANCE_MENU_ATTR}]`,
        `[${INTERACTION_DIAGNOSTIC_PANEL_ATTR}]`,
        `[${FEEDBACK_CAT_MENU_ATTR}]`,
        `[${SOURCE_TRUNCATION_NOTICE_ATTR}]`,
    ].join(','))?.forEach(node => node.remove());

    const contentStyles = [...(clone.querySelectorAll?.('style') || [])]
        .filter(style => ![...style.attributes].some(attribute => /^data-rabbit-mirror-/i.test(attribute.name)))
        .map(style => String(style.textContent || ''))
        .join('\n');
    clone.querySelectorAll?.('style')?.forEach(style => style.remove());

    const textLength = decodeHtmlEntities(String(clone.textContent || ''))
        .replace(/\s+/g, ' ')
        .trim().length;
    const bodyElements = [...(clone.querySelectorAll?.('*') || [])]
        .filter(element => !['br'].includes(String(element.tagName || '').toLowerCase()));
    const semanticSelector = [
        'input', 'button', 'select', 'textarea', 'a[href]', 'label',
        'img', 'svg', 'canvas', 'video', 'audio', 'iframe', 'object', 'embed',
        'table', 'ul', 'ol', 'li', 'p', 'blockquote', 'pre', 'code',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'figure', 'figcaption',
        'details', 'meter', 'progress', '[role]', '[tabindex]', '[contenteditable="true"]',
    ].join(',');
    const semanticElementCount = clone.querySelectorAll?.(semanticSelector)?.length || 0;
    const inlineVisualProgramCount = bodyElements.filter(element => {
        const style = String(element.getAttribute?.('style') || '');
        return /(?:background(?:-image)?\s*:[^;]*(?:url\(|gradient\()|mask(?:-image)?\s*:|clip-path\s*:|filter\s*:|content\s*:)/i.test(style);
    }).length;
    const stylesheetVisualProgramCount = (contentStyles.match(/@keyframes\b|content\s*:|background(?:-image)?\s*:[^;{}]*(?:url\(|gradient\()|mask(?:-image)?\s*:|clip-path\s*:/gi) || []).length;
    const visualProgramCount = inlineVisualProgramCount + stylesheetVisualProgramCount;

    // 仅把“零文字、零语义／媒体／控件、最多两个空包装元素、也没有视觉程序”的结构判为空壳。
    // 这样可识别模型只输出外框与一条空分隔栏的失败案例，同时避免把 SVG、渐变绘景、动画或复杂纯视觉作品误删。
    const highConfidenceEmptyShell = textLength === 0
        && semanticElementCount === 0
        && bodyElements.length <= 2
        && visualProgramCount === 0;

    return {
        hasDetails: true,
        textLength,
        bodyElementCount: bodyElements.length,
        semanticElementCount,
        visualProgramCount,
        highConfidenceEmptyShell,
    };
}

function maintenanceMirrorCandidateHasBody(candidate) {
    const evidence = maintenanceMirrorBodyEvidence(candidate);
    return evidence.hasDetails && !evidence.highConfidenceEmptyShell
        && (evidence.textLength > 0
            || evidence.bodyElementCount > 0
            || evidence.semanticElementCount > 0
            || evidence.visualProgramCount > 0);
}

function findRecoverableMaintenanceMirrorSource(message, root, { displayOnly = false } = {}) {
    const wantedSummary = normalizeMaintenanceSummaryText(getRabbitMirrorSummaryText(root));
    const candidates = maintenanceMessageSourceCandidates(message, { displayOnly });
    if (!displayOnly) {
        const chat = getAvailableHostChat();
        const messageIndex = Array.isArray(chat) ? chat.lastIndexOf(message) : -1;
        const snapshot = getRabbitMirrorGenerationSnapshot(message, chat, messageIndex, wantedSummary);
        if (snapshot?.source) candidates.push({ label: '本轮完整源码临时快照', source: snapshot.source });
    }
    const seen = new Set();
    for (const candidateSource of candidates) {
        if (!candidateSource?.source || seen.has(candidateSource.source)) continue;
        seen.add(candidateSource.source);
        const isolated = extractIsolatedMaintenanceMirrorSource(candidateSource.source, root);
        if (!isolated) continue;
        const candidate = findCleanMaintenanceMirrorNode(isolated, root);
        if (!candidate || !maintenanceMirrorCandidateHasBody(candidate)) continue;
        const candidateSummary = normalizeMaintenanceSummaryText(getRabbitMirrorSummaryText(candidate));
        const titleMatches = !!wantedSummary && (
            candidateSummary === wantedSummary
            || candidateSummary.includes(wantedSummary)
            || wantedSummary.includes(candidateSummary)
        );
        if (!titleMatches) continue;
        return { ...candidateSource, source: isolated };
    }
    return null;
}


function findBalancedMaintenanceDetailsEnd(source, detailsStart) {
    const text = String(source || '');
    if (detailsStart < 0) return -1;
    const tagRe = /<\s*(\/?)\s*details\b[^>]*>/gi;
    tagRe.lastIndex = detailsStart;
    let depth = 0;
    let match;
    while ((match = tagRe.exec(text))) {
        if (match.index < detailsStart) continue;
        if (match[1]) {
            depth -= 1;
            if (depth === 0) return tagRe.lastIndex;
        } else if (!/\/\s*>$/.test(match[0])) {
            depth += 1;
        }
    }
    return -1;
}

function extractMaintenanceMirrorSourceBySummary(source, root) {
    const text = String(source || '');
    const wantedSummary = normalizeMaintenanceSummaryText(getRabbitMirrorSummaryText(root));
    if (!text || !wantedSummary) return '';

    const summaryRe = /<summary\b[^>]*>([\s\S]*?)<\/summary\s*>/gi;
    let fallback = '';
    let match;
    while ((match = summaryRe.exec(text))) {
        const candidateText = normalizeMaintenanceSummaryText(
            decodeHtmlEntities(String(match[1] || '').replace(/<[^>]*>/g, ' ')),
        );
        if (!candidateText) continue;
        const matches = candidateText === wantedSummary
            || candidateText.includes(wantedSummary)
            || wantedSummary.includes(candidateText);
        if (!matches) continue;

        const prefix = text.slice(0, match.index).toLowerCase();
        const detailsStart = prefix.lastIndexOf('<details');
        if (detailsStart < 0) continue;
        const detailsEnd = findBalancedMaintenanceDetailsEnd(text, detailsStart);
        if (detailsEnd <= detailsStart) continue;

        const isolated = text.slice(detailsStart, detailsEnd).trim();
        if (!fallback) fallback = isolated;
        if (!TRANSIENT_RERENDER_REASONING_ENVELOPE_RE.test(isolated)) return isolated;
    }
    return fallback && !TRANSIENT_RERENDER_REASONING_ENVELOPE_RE.test(fallback) ? fallback : '';
}


const MAINTENANCE_QUARANTINED_SCRIPT_ATTR = 'data-rabbit-mirror-quarantined-script';
const MAINTENANCE_STATIC_DECOR_ATTR = 'data-rabbit-mirror-static-script-fallback';
const MAINTENANCE_STATIC_DECOR_CHILD_ATTR = 'data-rabbit-mirror-static-decoration';

function quarantineMaintenanceScriptBlocks(source) {
    return String(source || '').replace(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi, (_match, body) => {
        let encoded = '';
        try {
            encoded = encodeURIComponent(String(body || ''));
        } catch {
            encoded = '';
        }
        return `<template ${MAINTENANCE_QUARANTINED_SCRIPT_ATTR}="${encoded}"></template>`;
    });
}

function decodeQuarantinedMaintenanceScript(element) {
    const encoded = String(element?.getAttribute?.(MAINTENANCE_QUARANTINED_SCRIPT_ATTR) || '');
    if (!encoded) return '';
    try {
        return decodeURIComponent(encoded);
    } catch {
        return '';
    }
}

function findMaintenanceElementByRawClass(root, rawClass) {
    const wanted = String(rawClass || '').trim();
    if (!root?.querySelectorAll || !wanted) return null;
    for (const element of root.querySelectorAll('[class]')) {
        const tokens = String(element.className || '').split(/\s+/).filter(Boolean);
        if (tokens.some(token => token === wanted || token === `custom-${wanted}` || token.endsWith(`-${wanted}`))) {
            return element;
        }
    }
    return null;
}

function resolveMaintenanceGeneratedClass(root, rawClass) {
    const wanted = String(rawClass || '').trim();
    if (!wanted) return '';
    const existing = findMaintenanceElementByRawClass(root, wanted);
    if (existing) {
        const tokens = String(existing.className || '').split(/\s+/).filter(Boolean);
        return tokens.find(token => token === wanted || token === `custom-${wanted}` || token.endsWith(`-${wanted}`)) || wanted;
    }
    for (const style of root?.querySelectorAll?.('style') || []) {
        const css = String(style.textContent || '');
        const classRe = /\.([_a-zA-Z][\w-]*)/g;
        let match;
        while ((match = classRe.exec(css))) {
            const token = String(match[1] || '');
            if (token === wanted || token === `custom-${wanted}` || token.endsWith(`-${wanted}`)) return token;
        }
    }
    return wanted;
}

function parseMaintenanceStaticDecorationPlans(scriptText) {
    const script = String(scriptText || '');
    if (!script || !/createElement\s*\(\s*['"]div['"]\s*\)/i.test(script)) return [];

    const targets = new Map();
    const childClasses = new Map();
    const plans = [];
    const targetRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*document\.querySelector\(\s*(['"])\.([A-Za-z_][\w-]*)\2\s*\)/g;
    const classRe = /([A-Za-z_$][\w$]*)\.className\s*=\s*(['"])([^'"]+)\2/g;
    const appendRe = /([A-Za-z_$][\w$]*)\.appendChild\(\s*([A-Za-z_$][\w$]*)\s*\)/g;
    let match;
    while ((match = targetRe.exec(script))) targets.set(match[1], match[3]);
    while ((match = classRe.exec(script))) childClasses.set(match[1], String(match[3] || '').trim());
    while ((match = appendRe.exec(script))) {
        const targetClass = targets.get(match[1]);
        const childClass = childClasses.get(match[2]);
        if (!targetClass || !childClass) continue;
        const signal = `${targetClass} ${childClass}`.toLowerCase();
        const kind = /(?:star|stars|spark|twinkle)/.test(signal)
            ? 'stars'
            : /(?:building|cityscape|skyline)/.test(signal) ? 'buildings' : '';
        if (kind) plans.push({ targetClass, childClass, kind });
    }
    return plans.slice(0, 4);
}

function installMaintenanceStaticDecorationFallback(root, scriptText) {
    if (!root?.querySelectorAll) return 0;
    let created = 0;
    for (const plan of parseMaintenanceStaticDecorationPlans(scriptText)) {
        const target = findMaintenanceElementByRawClass(root, plan.targetClass);
        if (!target || target.children.length > 4) continue;
        const childClass = resolveMaintenanceGeneratedClass(root, plan.childClass);
        if (!childClass) continue;
        const count = plan.kind === 'stars' ? 24 : 10;
        for (let index = 0; index < count; index += 1) {
            const child = document.createElement('div');
            child.className = childClass;
            child.setAttribute(MAINTENANCE_STATIC_DECOR_CHILD_ATTR, plan.kind);
            if (plan.kind === 'stars') {
                const size = 1 + ((index * 7) % 4) * 0.45;
                child.style.width = `${size.toFixed(2)}px`;
                child.style.height = `${size.toFixed(2)}px`;
                child.style.top = `${(index * 37 + 9) % 96}%`;
                child.style.left = `${(index * 53 + 5) % 98}%`;
                child.style.animationDelay = `${-((index * 0.47) % 5).toFixed(2)}s`;
                child.style.animationDuration = `${(3 + (index % 5) * 0.55).toFixed(2)}s`;
            } else {
                child.style.left = `${Math.min(95, index * 9.7).toFixed(1)}%`;
                child.style.height = `${14 + ((index * 17) % 47)}%`;
                child.style.width = `${3 + ((index * 5) % 6)}%`;
                child.style.opacity = `${(0.32 + (index % 5) * 0.11).toFixed(2)}`;
            }
            target.appendChild(child);
            created += 1;
        }
        target.setAttribute(MAINTENANCE_STATIC_DECOR_ATTR, `${plan.kind}:${count}`);
    }
    return created;
}

function sanitizeMaintenanceMirrorTemplate(template) {
    if (!template?.content?.querySelectorAll) return null;
    if (template.content.querySelector('iframe, object, embed, link, meta, base')) return null;

    const scriptSources = [];
    for (const placeholder of [...template.content.querySelectorAll(`template[${MAINTENANCE_QUARANTINED_SCRIPT_ATTR}]`)]) {
        scriptSources.push(decodeQuarantinedMaintenanceScript(placeholder));
        placeholder.remove();
    }
    for (const script of [...template.content.querySelectorAll('script')]) {
        scriptSources.push(String(script.textContent || ''));
        script.remove();
    }

    for (const element of template.content.querySelectorAll('*')) {
        for (const attribute of [...element.attributes]) {
            const name = String(attribute.name || '').toLowerCase();
            const value = String(attribute.value || '');
            if (/^on[a-z]+$/.test(name)) {
                element.removeAttribute(attribute.name);
                continue;
            }
            if (/^(?:href|src|xlink:href|formaction)$/i.test(name) && /^\s*javascript\s*:/i.test(value)) return null;
            if (name === 'style' && /url\(\s*(['"]?)\s*javascript\s*:/i.test(value)) return null;
        }
    }

    let decorationCount = 0;
    for (const scriptSource of scriptSources) {
        decorationCount += installMaintenanceStaticDecorationFallback(template.content, scriptSource);
    }
    return { strippedScriptCount: scriptSources.length, decorationCount };
}

function prepareMaintenanceMirrorSource(source) {
    let text = decodeHtmlEntities(String(source || ''))
        .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
        .trim();
    if (!text) return '';

    // 先把模型脚本隔离为不可执行占位符。这样既不会在重建时执行脚本，
    // 也不会让脚本正文里的 < 运算符被 HTML 紧凑器误当标签吞掉。
    text = quarantineMaintenanceScriptBlocks(text);

    // 0.32.76 能救版本的关键顺序：先在字符串层保住主体，再进入 HTML 解析。
    // 损坏的 inline SVG Data URI 会提前结束 style 属性；直接交给 template.innerHTML
    // 只会得到同样被截断的 DOM，因此必须先移除损坏背景声明。
    text = rescueDamagedDataUriRabbitMirrorOutput(text);
    text = rescuePlainTextRabbitMirrorOutput(text) || text;
    text = cleanRabbitMirrorOutput(text) || text;
    return text.trim();
}

function extractIsolatedMaintenanceMirrorSource(source, root) {
    let text = decodeHtmlEntities(String(source || ''))
        .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
        .trim();
    if (!text) return '';

    // 优先按当前 summary 在字符串层截取对应 <details>。
    // 这一步不解析整条消息，因此即使前面含 thinking/reasoning，或损坏 SVG 已破坏 HTML 属性边界，
    // 也只会拿到当前兔子镜本体，不会把思维包裹带入显示层。
    const isolatedBySummary = extractMaintenanceMirrorSourceBySummary(text, root);
    if (isolatedBySummary) {
        const repairedIsolated = rescueDamagedDataUriRabbitMirrorOutput(isolatedBySummary).trim();
        if (repairedIsolated
            && !TRANSIENT_RERENDER_REASONING_ENVELOPE_RE.test(repairedIsolated)
            && /<(?:toto|details)\b/i.test(repairedIsolated)
            && /<summary\b[^>]*>[\s\S]*?兔子镜/i.test(repairedIsolated)) {
            return repairedIsolated;
        }
    }

    // 字符串隔离未命中时，再退回脱离页面的 template 匹配。
    text = rescueDamagedDataUriRabbitMirrorOutput(text);
    const matched = chooseMatchingRawRabbitMirrorRoot(text, root);
    const isolated = String(matched?.outerHTML || '').trim();
    if (!isolated) return '';
    const wantedSummary = normalizeMaintenanceSummaryText(getRabbitMirrorSummaryText(root));
    const matchedSummary = normalizeMaintenanceSummaryText(getRabbitMirrorSummaryText(matched));
    const titleMatches = !!wantedSummary && (
        matchedSummary === wantedSummary
        || matchedSummary.includes(wantedSummary)
        || wantedSummary.includes(matchedSummary)
    );
    if (!titleMatches) return '';

    // 若畸形标签把思维包裹卷入候选内部，则宁可停止，也不冒险展示隐藏内容。
    if (TRANSIENT_RERENDER_REASONING_ENVELOPE_RE.test(isolated)) return '';
    if (!/<(?:toto|details)\b/i.test(isolated) || !/<summary\b[^>]*>[\s\S]*?兔子镜/i.test(isolated)) return '';
    return isolated;
}
function findCleanMaintenanceMirrorNode(source, root) {
    const cleaned = prepareMaintenanceMirrorSource(source);
    if (!cleaned || typeof document === 'undefined') return null;
    const wantedSummary = normalizeMaintenanceSummaryText(getRabbitMirrorSummaryText(root));

    try {
        const template = document.createElement('template');
        template.innerHTML = cleaned;

        // 直接 DOM 恢复绕过宿主 DOMPurify，因此在离线 template 中主动执行同等安全边界：
        // script 只删除不执行；其余主动嵌入内容仍整面拒绝。真实交互只允许后续安全解析器重建。
        if (!sanitizeMaintenanceMirrorTemplate(template)) return null;

        const candidates = [];
        for (const toto of template.content.querySelectorAll('toto')) {
            const cloned = toto.cloneNode(true);
            if (cloned.querySelector?.('details')) candidates.push(cloned);
        }
        // 部分显示正则只保留了裸 <details>，也允许把它作为临时显示层候选，
        // 但不会写回 mes/swipe/display_text。
        if (!candidates.length) {
            for (const details of template.content.querySelectorAll('details')) {
                const holder = document.createElement('toto');
                holder.setAttribute('data-rabbit-mirror', 'true');
                holder.style.display = 'block';
                holder.appendChild(details.cloneNode(true));
                candidates.push(holder);
            }
        }
        let fallback = null;
        for (const candidate of candidates) {
            fallback ||= candidate;
            const candidateSummary = normalizeMaintenanceSummaryText(getRabbitMirrorSummaryText(candidate));
            const titleMatches = !!wantedSummary && (
                candidateSummary === wantedSummary
                || candidateSummary.includes(wantedSummary)
                || wantedSummary.includes(candidateSummary)
            );
            if (titleMatches) return candidate;
        }
        // 有目标标题时绝不退回“唯一候选即采用”；否则可能把同一消息里另一面兔子镜错填进当前空壳。
        return !wantedSummary && candidates.length === 1 ? fallback : null;
    } catch (error) {
        console.debug('[RabbitMirror] maintenance source parse failed:', error);
        return null;
    }
}

function replaceMaintenanceMirrorDomFromSource(root, source) {
    if (!root?.isConnected || typeof document === 'undefined') return false;
    const candidate = findCleanMaintenanceMirrorNode(source, root);
    // 空 <details><summary>...</summary></details> 不是“成功恢复”。
    // 只有候选本身确实含正文元素或直接文本时才允许替换，避免用另一份空壳覆盖当前空壳并误报 changed=true。
    if (!candidate || !maintenanceMirrorCandidateHasBody(candidate)) return false;

    const currentToto = root.matches?.(MIRROR_TOTO_SELECTOR)
        ? root
        : root.closest?.(MIRROR_TOTO_SELECTOR);
    const currentDetails = root.matches?.('details') ? root : root.querySelector?.('details');
    const candidateDetails = candidate instanceof Element ? candidate.querySelector('details') : null;
    const replaceTarget = currentToto?.isConnected ? currentToto : currentDetails?.isConnected ? currentDetails : root;
    const clonedDetails = candidateDetails?.cloneNode?.(true);
    const replacement = currentToto?.isConnected
        ? candidate
        : clonedDetails instanceof Element ? clonedDetails : null;
    if (!replaceTarget?.isConnected || !replacement) return false;

    const wasOpen = !!currentDetails?.open;
    replaceTarget.replaceWith(replacement);
    const liveRoot = replacement.matches?.('details') ? replacement : replacement.querySelector?.('details') || replacement;
    const liveDetails = liveRoot.matches?.('details') ? liveRoot : liveRoot.querySelector?.('details');
    if (liveDetails instanceof HTMLDetailsElement && wasOpen) liveDetails.open = true;
    installMaintenanceRabbitForRoot(liveRoot);
    return true;
}


function installMaintenanceSourceTruncationNotice(root, inspection) {
    if (!root?.isConnected || typeof document === 'undefined') return false;
    const details = root.matches?.('details') ? root : root.querySelector?.('details');
    if (!details) return false;
    if (details.querySelector?.(`[${SOURCE_TRUNCATION_NOTICE_ATTR}]`)) return false;

    const notice = document.createElement('div');
    notice.setAttribute(SOURCE_TRUNCATION_NOTICE_ATTR, 'true');
    notice.setAttribute('role', 'status');
    notice.style.cssText = 'box-sizing:border-box;width:calc(100% - 24px);margin:16px 12px;padding:16px;border:1px dashed currentColor;border-radius:6px;background:rgba(127,127,127,.08);color:inherit;line-height:1.65;opacity:.9;';

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700;margin-bottom:6px;';
    title.textContent = inspection?.full?.rawCssTruncated ? '原始输出已截断' : '原始输出为空壳';
    const message = document.createElement('div');
    const independent = isIndependentMaintenanceRoot(root);
    message.textContent = inspection?.full?.rawCssTruncated
        ? (independent ? '副 API 输出在 <style> 中途结束，镜面正文没有生成，无法从现有内容恢复。请使用挨打猫“重说”。' : '这条兔子镜在 <style> 中途结束，正文没有出现在原始源码中，无法从现有内容恢复。请重新生成这条消息。')
        : (independent ? '副 API 返回的是空壳兔子镜，维修兔不会借用聊天正文补写。请使用挨打猫“重说”。' : '这条兔子镜的原始源码没有可显示的正文主体，无法凭空恢复缺失内容。请重新生成这条消息。');
    const detail = document.createElement('div');
    detail.style.cssText = 'margin-top:8px;font-size:.88em;opacity:.72;';
    detail.textContent = '维修兔仅显示此说明，不会改写聊天原文。';
    notice.append(title, message, detail);

    const summary = details.querySelector?.(':scope > summary') || details.querySelector?.('summary');
    if (summary) summary.insertAdjacentElement('afterend', notice);
    else details.prepend(notice);
    return true;
}

function independentMaintenanceHost(root){
 if(!root?.closest && !root?.matches) return null;
 const direct=root.matches?.('[data-rabbit-mirror-external-source="true"][data-rm-source="independent"]')?root:null;
 return direct || root.closest?.('[data-rabbit-mirror-external-source="true"][data-rm-source="independent"]') || null;
}
function isIndependentMaintenanceRoot(root){
 if(independentMaintenanceHost(root)) return true;
 const details=root?.matches?.('details')?root:root?.querySelector?.('details');
 return String(details?.dataset?.rabbitMirrorExternalSource||'')==='independent';
}
function exactIndependentMaintenanceRoot(root){
 const host=independentMaintenanceHost(root);
 return host?.querySelector?.(':scope > details') || host || root;
}
function independentMaintenanceRootHasBody(root){
 const details=exactIndependentMaintenanceRoot(root)?.matches?.('details')
  ? exactIndependentMaintenanceRoot(root)
  : exactIndependentMaintenanceRoot(root)?.querySelector?.('details');
 if(!details) return false;
 const summary=details.querySelector?.(':scope > summary');
 return [...(details.childNodes||[])].some(node=>{
  if(node===summary) return false;
  if(node.nodeType===3) return !!String(node.textContent||'').trim();
  if(node.nodeType!==1 || ['STYLE','SCRIPT','TEMPLATE','LINK','META'].includes(node.tagName)) return false;
  if(node.matches?.('[data-rabbit-mirror-tool-entry-host], [data-rabbit-mirror-source-truncation-notice]')) return false;
  if(node.hidden || String(node.getAttribute?.('aria-hidden')||'').toLowerCase()==='true') return false;
  return !!(String(node.textContent||'').trim() || node.children?.length || node.matches?.('img,svg,canvas,video,audio,input,button,select,textarea,table,ul,ol,section,article,main,figure,form'));
 });
}
function repairMaintenanceMessageSource(root, inspection) {
    if (isIndependentMaintenanceRoot(root)) {
        const blank = !independentMaintenanceRootHasBody(root);
        const localInspection = blank
            ? { ...inspection, full: { ...(inspection?.full || {}), rawSourceBodyMissing: true } }
            : inspection;
        const noticeShown = blank ? installMaintenanceSourceTruncationNotice(root, localInspection) : false;
        return { changed: false, noticeShown, unrecoverable: blank, index: getMessageIndexFromMirrorNode(root), reason: blank
            ? '副 API返回的是空壳兔子镜；维修兔已保持正文不变，请使用挨打猫“重说”。'
            : '副 API兔子镜与正文完全隔离；维修兔只处理当前镜面 DOM，不会读取、重绘或改写正文。' };
    }
    const index = getMessageIndexFromMirrorNode(root);
    if (index < 0) return { changed: false, index, reason: '无法识别所属消息' };
    const host = hostScriptModule || globalThis;
    const chat = host?.chat || globalThis.chat;
    const message = Array.isArray(chat) ? chat[index] : null;
    if (!message || message?.is_user) return { changed: false, index, reason: '未找到可维护的助手消息' };

    const hasReasoningEnvelope = messageContainsReasoningEnvelope(message);
    const distinctDisplaySource = messageUsesDistinctDisplaySource(message);
    // 存在独立 display_text 时只使用显示源本身，不回退到 mes/swipe，避免绕过用户显示正则。
    const source = getSelectedMessageSource(message, { preferDisplay: distinctDisplaySource });
    if (!source) return { changed: false, index, reason: distinctDisplaySource ? '独立显示源中没有可恢复的兔子镜源码' : '没有可恢复的消息源' };

    if (inspection?.full?.rawSourceBodyMissing) {
        // mes、当前 swipe 与非独立 display_text 偶尔会在宿主插件链中不同步。
        // 先在同一条消息的当前有效来源中按 summary 精确寻找完整镜面；只恢复同标题且确有正文的候选。
        // 不扫描历史 swipe，不跨消息回填，也不绕过独立 display_text，避免混入另一版剧情或被显示规则隐藏的内容。
        const alternate = findRecoverableMaintenanceMirrorSource(message, root, { displayOnly: distinctDisplaySource });
        if (alternate?.source) {
            const recovered = replaceMaintenanceMirrorDomFromSource(root, alternate.source);
            if (recovered) {
                return { changed: true, index, reason: `已从同一消息的${alternate.label}恢复同标题完整兔子镜；未改写聊天原文` };
            }
        }

        const noticeShown = installMaintenanceSourceTruncationNotice(root, inspection);
        const reason = inspection?.full?.rawCssTruncated
            ? '原始输出在 <style> 中途截断，正文未生成；已标记为生成失败，无法恢复不存在的内容'
            : '当前消息、当前 swipe、显示源与本轮临时快照中均没有同标题完整正文；已标记为生成失败，无法凭空补写';
        return { changed: false, noticeShown, unrecoverable: true, index, reason };
    }

    const hasSourceCandidate = inspection?.full?.sourceCandidate || inspection?.code?.strictWhole || inspection?.code?.needsSanitize;
    if (hasSourceCandidate) {
        // 先在当前有效消息来源中寻找同标题且确有正文的候选，再只重建这一面 DOM。
        // 这样即使当前 swipe 与 mes 暂时不同步，也不会先拿空壳候选误报恢复成功。
        const recoverable = findRecoverableMaintenanceMirrorSource(message, root, { displayOnly: distinctDisplaySource });
        const sourceForRecovery = recoverable?.source || source;
        const isolatedMirrorSource = extractIsolatedMaintenanceMirrorSource(sourceForRecovery, root);
        if (isolatedMirrorSource) {
            const directDomRecovered = replaceMaintenanceMirrorDomFromSource(root, isolatedMirrorSource);
            if (directDomRecovered) {
                const notes = [];
                if (recoverable?.label) notes.push(`来源=${recoverable.label}`);
                if (hasReasoningEnvelope) notes.push('已隔离思维包裹');
                if (/<script\b/i.test(isolatedMirrorSource)) notes.push('脚本已移除，静态主体已保留');
                const note = notes.length ? `（${notes.join('；')}）` : '';
                return { changed: true, index, reason: `已从当前消息源码安全重建这一面兔子镜 DOM${note}` };
            }
        }

        // 只有不存在思维包裹、且没有独立显示源时，才允许退回整条消息瞬时重绘。
        // 这保留原有隐私边界，同时不再误伤“可安全隔离当前兔子镜”的情况。
        if (!hasReasoningEnvelope && !distinctDisplaySource) {
            const directRecovered = recoverMessageSourceToDisplay(host, index, message, { force: true, sourceOverride: source });
            if (directRecovered) return { changed: true, index, reason: '已调用旧源码恢复模块重建当前消息显示层' };
        }
    }

    if (hasReasoningEnvelope) {
        return { changed: false, index, reason: '存在思维包裹；已尝试安全提取当前兔子镜，但未得到可重建片段，未执行整条重绘' };
    }
    if (distinctDisplaySource) {
        return { changed: false, index, reason: '存在独立显示源；当前兔子镜无法安全隔离，未回退到原始消息整条重绘' };
    }

    let repaired = source;
    if (inspection?.full?.damagedDataUriCandidate || inspection?.full?.structureTruncated) {
        repaired = rescueDamagedDataUriRabbitMirrorOutput(repaired);
    }
    if (inspection?.full?.sourceCandidate || inspection?.code?.strictWhole || inspection?.code?.needsSanitize) {
        repaired = rescuePlainTextRabbitMirrorOutput(repaired) || repaired;
    }
    if (!repaired || repaired === source) return { changed: false, index, reason: '消息源无需重绘' };

    const transientMessage = setTransientMessageSource(message, repaired);
    const changed = preserveAndRerenderSanitizedMessage(host, index, transientMessage);
    return { changed, index, reason: changed ? '已用临时副本恢复当前消息显示层' : '当前消息重绘失败' };
}

function maintenanceSnapshotKey(root) {
    const index = getMessageIndexFromMirrorNode(root);
    const chat = getAvailableHostChat();
    const message = index >= 0 ? chat[index] : null;
    const swipe = Number.isInteger(message?.swipe_id) ? message.swipe_id : 0;
    const host = root?.matches?.('[data-rabbit-mirror-external-source="true"]')
        ? root
        : root?.closest?.('[data-rabbit-mirror-external-source="true"]');
    const ownerKey = String(host?.dataset?.rmKey || '');
    let chatKey = 'chat';
    try { chatKey = String(getCurrentChatKey?.(chat) || 'chat'); } catch {}
    return ownerKey ? `${chatKey}:${ownerKey}` : `${chatKey}:${index}:${swipe}`;
}

function trimMaintenanceSnapshots(max = 24) {
    while (maintenancePreRepairSnapshots.size > max) {
        const oldest = [...maintenancePreRepairSnapshots.entries()].sort((a, b) => Number(a[1]?.ts || 0) - Number(b[1]?.ts || 0))[0]?.[0];
        if (!oldest) break;
        maintenancePreRepairSnapshots.delete(oldest);
    }
}

function captureMaintenancePreRepairSnapshot(root) {
    if (!root?.isConnected) return null;
    const details = root.matches?.('details') ? root : root.querySelector?.(':scope > details') || root.querySelector?.('details');
    if (!details?.parentNode) return null;
    const key = maintenanceSnapshotKey(root);
    const originalNode = details;
    const workingNode = details.cloneNode(true);
    originalNode.replaceWith(workingNode);
    const workingRoot = root === originalNode ? workingNode : root;
    try { refreshRabbitMirrorToolsInScope?.(workingRoot); } catch {}
    const workingButton = workingRoot.querySelector?.(`[${MAINTENANCE_RABBIT_ATTR}]`) || workingNode.querySelector?.(`[${MAINTENANCE_RABBIT_ATTR}]`) || null;
    maintenancePreRepairSnapshots.set(key, {
        node: originalNode,
        open: originalNode.hasAttribute('open'),
        ts: Date.now(),
    });
    trimMaintenanceSnapshots();
    return { key, root: workingRoot, button: workingButton };
}

function restoreMaintenancePreRepairSnapshot(root, button) {
    const key = maintenanceSnapshotKey(root);
    const snapshot = maintenancePreRepairSnapshots.get(key);
    if (!snapshot?.node) {
        setMaintenanceRabbitState(button, MAINTENANCE_STATES.unknown, '当前兔子镜没有可返回的修复前界面');
        return false;
    }
    const details = root.matches?.('details') ? root : root.querySelector?.(':scope > details') || root.querySelector?.('details');
    if (!details?.parentNode) return false;
    const originalNode = snapshot.node;
    if (snapshot.open) originalNode.setAttribute('open', ''); else originalNode.removeAttribute('open');
    details.replaceWith(originalNode);
    maintenancePreRepairSnapshots.delete(key);
    setTimeout(() => {
        try { refreshRabbitMirrorToolsInScope?.(originalNode); } catch {}
    }, 0);
    return true;
}

function triggerDiagnosticForMaintenanceRoot(root) {
    if (!root?.isConnected) return false;
    removeInteractionDiagnostic(root);
    const state = { events: ['maintenance-rabbit:direct'], snapshots: [], panel: null, pre: null, report: '' };
    interactionDiagnosticStates.set(root, state);
    createOneShotInteractionDiagnosticPanel(root, state);
    captureInteractionDiagnosticSnapshot(root, state, '维修兔触发前');
    scheduleMaintenanceLabeledCheckedProbe(root, state);
    setTimeout(() => captureInteractionDiagnosticSnapshot(root, state, '+100ms'), 100);
    setTimeout(() => captureInteractionDiagnosticSnapshot(root, state, '+500ms'), 500);
    setTimeout(() => finalizeOneShotInteractionDiagnostic(root, state), 650);
    return true;
}

function closeMaintenanceRabbitMenu() {
    document.querySelectorAll?.(`[${MAINTENANCE_MENU_ATTR}]`)?.forEach(panel => panel.remove());
}


function feedbackCatEscapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function closeFeedbackCatMenu() {
    document.querySelectorAll?.(`[${FEEDBACK_CAT_MENU_ATTR}]`)?.forEach(panel => panel.remove());
}

function positionFeedbackCatPanel(panel, button, preferredWidth = 300) {
    const rect = button.getBoundingClientRect();
    const width = Math.min(preferredWidth, Math.max(250, globalThis.innerWidth - 24));
    panel.style.width = `${width}px`;
    const left = Math.max(12, Math.min(rect.left, globalThis.innerWidth - width - 12));
    panel.style.left = `${left}px`;
    panel.style.top = `${Math.max(12, Math.min(rect.bottom + 6, globalThis.innerHeight - panel.offsetHeight - 12))}px`;
}

function bindFeedbackCatOutsideClose(panel, button) {
    setTimeout(() => {
        const closeOnOutside = event => {
            if (!panel.isConnected) {
                document.removeEventListener('pointerdown', closeOnOutside, true);
                return;
            }
            if (!panel.contains(event.target) && event.target !== button) {
                closeFeedbackCatMenu();
                document.removeEventListener('pointerdown', closeOnOutside, true);
            }
        };
        document.addEventListener('pointerdown', closeOnOutside, true);
    }, 0);
}

function feedbackCatSourceIdentity(root) {
    const messageId = getMessageIndexFromMirrorNode(root);
    const chat = getAvailableHostChat();
    const message = messageId >= 0 ? chat[messageId] : null;
    const swipeId = Number.isInteger(message?.swipe_id) ? message.swipe_id : -1;
    let sourceFingerprint = null;
    try {
        const renderedToto = root?.matches?.('toto') ? root : root?.closest?.('toto') || root;
        const scanned = scanRabbitMirrorHtml(String(message?.mes || renderedToto?.outerHTML || ''), renderedToto);
        sourceFingerprint = scanned && typeof scanned === 'object' ? {
            signature: scanned.signature || '',
            skeleton: scanned.skeleton || '',
            riskFlags: Array.isArray(scanned.riskFlags) ? scanned.riskFlags : [],
            paletteFingerprint: scanned.paletteFingerprint || null,
        } : null;
    } catch (error) {
        console.debug('[RabbitMirror] feedback cat source fingerprint skipped:', error);
    }
    return { messageId, swipeId, sourceFingerprint };
}

function feedbackCatButtonTitle() {
    const active = getActiveFeedbackForCurrentChat();
    return active
        ? `挨打猫：${feedbackCatStatusText(active)}；点击可修改或清除`
        : '挨打猫：反馈这面兔子镜；未选择时不会向模型追加内容';
}

function updateFeedbackCatButtonTitles() {
    const title = feedbackCatButtonTitle();
    document.querySelectorAll?.(`[${FEEDBACK_CAT_ATTR}]`)?.forEach(button => {
        button.title = title;
        button.setAttribute('aria-label', title);
        normalizeRabbitMirrorToolButton(button);
        normalizeRabbitMirrorToolHost(button.parentElement?.matches?.(`[${TOOL_ENTRY_HOST_ATTR}]`) ? button.parentElement : null);
    });
}

function saveFeedbackCatChoice(root, types, customText, rounds) {
    try {
        const source = feedbackCatSourceIdentity(root);
        const record = setActiveFeedbackForCurrentChat({
            types,
            customText,
            rounds,
            sourceMessageId: source.messageId,
            sourceSwipeId: source.swipeId,
            sourceFingerprint: source.sourceFingerprint,
        });
        updateFeedbackCatButtonTitles();
        const rangeText = Number(rounds) === 1 ? '下一轮' : `接下来 ${rounds} 轮`;
        globalThis.toastr?.success?.(`挨打猫记住了 ${types.length} 项反馈，将影响${rangeText}。`);
        return record;
    } catch (error) {
        globalThis.toastr?.warning?.(error?.message || '挨打猫没有记住，请重试。');
        return null;
    }
}

function showFeedbackCatRangeMenu(root, button, types, customText = '') {
    closeFeedbackCatMenu();
    const selectedTypes = [...new Set((Array.isArray(types) ? types : [types]).filter(type => FEEDBACK_CAT_TYPES[type]))];
    const panel = document.createElement('div');
    panel.className = 'rabbit-mirror-feedback-cat-menu';
    panel.setAttribute(FEEDBACK_CAT_MENU_ATTR, 'true');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '挨打猫反馈范围');
    panel.innerHTML = `
      <div class="rabbit-mirror-feedback-cat-menu-title">🐈‍⬛ (×﹏×)</div>
      <div class="rabbit-mirror-feedback-cat-menu-copy">已选 ${selectedTypes.length} 项：${feedbackCatEscapeHtml(selectedTypes.map(type => FEEDBACK_CAT_TYPES[type]).join('、'))}</div>
      <div class="rabbit-mirror-feedback-cat-menu-copy">这顿打要记多久？</div>
      <button type="button" data-rm-feedback-rounds="1">○ 下一轮</button>
      <button type="button" data-rm-feedback-rounds="3">○ 接下来 3 轮</button>
      <button type="button" data-rm-feedback-rounds="10">○ 接下来 10 轮</button>
      <button type="button" data-rm-feedback-action="back">返回修改</button>
      <button type="button" data-rm-feedback-action="close">取消</button>`;
    document.body.appendChild(panel);
    positionFeedbackCatPanel(panel, button);
    panel.addEventListener('click', event => {
        const roundsButton = event.target?.closest?.('[data-rm-feedback-rounds]');
        const action = event.target?.closest?.('[data-rm-feedback-action]')?.getAttribute('data-rm-feedback-action');
        if (!roundsButton && !action) return;
        event.preventDefault();
        event.stopPropagation();
        if (roundsButton) {
            const rounds = Number(roundsButton.getAttribute('data-rm-feedback-rounds'));
            const saved = saveFeedbackCatChoice(root, selectedTypes, customText, rounds);
            if (saved) closeFeedbackCatMenu();
            return;
        }
        if (action === 'back') {
            showFeedbackCatMenu(root, button, { types: selectedTypes, customText });
            return;
        }
        closeFeedbackCatMenu();
    }, true);
    bindFeedbackCatOutsideClose(panel, button);
    return true;
}

function feedbackCatIndependentOwner(root, button = null) {
    if (!root) return null;
    const details = root.matches?.('details') ? root : root.closest?.('details') || root.querySelector?.('details');
    const host = root?.matches?.('[data-rabbit-mirror-external-source="true"][data-rm-source="independent"]')
        ? root
        : root?.closest?.('[data-rabbit-mirror-external-source="true"][data-rm-source="independent"]')
          || root?.querySelector?.('[data-rabbit-mirror-external-source="true"][data-rm-source="independent"]')
          || details?.parentElement?.closest?.('[data-rabbit-mirror-external-source="true"][data-rm-source="independent"]');
    const buttonMesid = Number(button?.dataset?.rmFeedbackOwnerMesid);
    const directMesid = Number(details?.dataset?.rabbitMirrorOwnerMesid);
    const messageId = getMessageIndexFromMirrorNode(root);
    const targetMesid = Number.isInteger(directMesid) && directMesid >= 0
        ? directMesid
        : Number.isInteger(buttonMesid) && buttonMesid >= 0
            ? buttonMesid
            : messageId;
    const directKey = String(details?.dataset?.rabbitMirrorOwnerKey
        || details?.dataset?.rabbitMirrorExternalOwner
        || button?.dataset?.rmFeedbackOwnerKey
        || '');
    const directSource = String(details?.dataset?.rabbitMirrorExternalSource || button?.dataset?.rmFeedbackOwnerSource || '');
    const resolvedHost = host || (targetMesid >= 0
        ? [...(document.querySelectorAll?.('[data-rabbit-mirror-external-source="true"][data-rm-source="independent"]') || [])]
            .find(candidate => Number(candidate?.dataset?.rmOwnerMesid ?? candidate?.dataset?.rmExternalOwnerMessage) === targetMesid)
        : directKey
            ? [...(document.querySelectorAll?.('[data-rabbit-mirror-external-source="true"][data-rm-source="independent"]') || [])]
                .find(candidate => String(candidate?.dataset?.rmKey || '') === directKey)
            : null);
    if (!resolvedHost && directSource !== 'independent') return null;
    const chat = getAvailableHostChat();
    const finalMesid = Number(resolvedHost?.dataset?.rmOwnerMesid
        ?? resolvedHost?.dataset?.rmExternalOwnerMessage
        ?? targetMesid);
    if (!Number.isInteger(finalMesid) || finalMesid < 0 || chat[finalMesid]?.is_user) return null;
    const message = chat[finalMesid] || null;
    let ownerChat = '';
    try { ownerChat = String(getCurrentChatKey?.(chat) || ''); } catch {}
    return {
        chat: String(resolvedHost?.dataset?.rmOwnerChat
            || details?.dataset?.rabbitMirrorOwnerChat
            || button?.dataset?.rmFeedbackOwnerChat
            || ownerChat),
        mesid: finalMesid,
        swipe: Number(resolvedHost?.dataset?.rmOwnerSwipe
            ?? details?.dataset?.rabbitMirrorOwnerSwipe
            ?? button?.dataset?.rmFeedbackOwnerSwipe
            ?? (Number.isInteger(message?.swipe_id) ? message.swipe_id : 0)),
        key: String(resolvedHost?.dataset?.rmKey || directKey),
        sourceHash: String(resolvedHost?.dataset?.rmSourceHash
            || details?.dataset?.rabbitMirrorOwnerSourceHash
            || button?.dataset?.rmFeedbackOwnerSourceHash
            || ''),
    };
}

function invokeFeedbackMirrorAction(action, root, owner) {
    const bridge = globalThis.__rabbitMirrorIndependentActionsV1;
    if (bridge?.runtime === RUNTIME_VERSION && typeof bridge?.[action] === 'function') {
        try {
            if (bridge[action](root, owner || {})) return true;
        } catch (error) {
            console.debug('[RabbitMirror] independent action bridge failed, using event fallback:', error);
        }
    }
    const detail = { root, owner: owner || {}, handled: false };
    document.dispatchEvent(new CustomEvent(action === 'resay' ? FEEDBACK_RESAY_EVENT : FEEDBACK_HISTORY_EVENT, { detail }));
    return !!detail.handled;
}

function showFeedbackCatMenu(root, button, draft = null) {
    closeMaintenanceRabbitMenu();
    closeFeedbackCatMenu();
    if (!root?.isConnected || !button?.isConnected) return false;
    const active = getActiveFeedbackForCurrentChat();
    const lastReceipt = getFeedbackCatLastReceiptForCurrentChat();
    const initialTypes = Array.isArray(draft?.types)
        ? draft.types
        : Array.isArray(active?.types)
            ? active.types
            : active?.type
                ? [active.type]
                : [];
    const selected = new Set(initialTypes.filter(type => FEEDBACK_CAT_TYPES[type]));
    let customText = String(draft?.customText ?? active?.customText ?? '');
    const panel = document.createElement('div');
    panel.className = 'rabbit-mirror-feedback-cat-menu';
    panel.setAttribute(FEEDBACK_CAT_MENU_ATTR, 'true');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '挨打猫多选反馈');
    const receiptLine = lastReceipt
        ? `<div class="rabbit-mirror-feedback-cat-status">上一轮送达回执：${feedbackCatEscapeHtml(feedbackCatReceiptText(lastReceipt))}</div>`
        : '';
    const status = active
        ? `<div class="rabbit-mirror-feedback-cat-status">当前反馈：${feedbackCatEscapeHtml(feedbackCatStatusText(active))}</div>${receiptLine}`
        : lastReceipt
            ? `<div class="rabbit-mirror-feedback-cat-status">当前没有生效中的反馈。</div>${receiptLine}`
            : '<div class="rabbit-mirror-feedback-cat-status">可同时选择多项；关闭而未提交不会影响后续生成。</div>';
    const independentOwner = feedbackCatIndependentOwner(root, button);
    const independentActions = independentOwner
        ? `<div class="rabbit-mirror-feedback-cat-actions rabbit-mirror-feedback-cat-mirror-actions">
            <button type="button" data-rm-feedback-action="resay">↻ 重说</button>
            <button type="button" data-rm-feedback-action="history">◷ 兔子镜历史</button>
          </div>`
        : '';
    panel.innerHTML = `
      <div class="rabbit-mirror-feedback-cat-menu-title">🐈‍⬛ 挨打猫</div>
      ${status}
      <div class="rabbit-mirror-feedback-cat-menu-copy">可以多选，再统一提交。</div>
      <button type="button" data-rm-feedback-type="color">🎨 ${FEEDBACK_CAT_TYPES.color}</button>
      <button type="button" data-rm-feedback-type="structure">▦ ${FEEDBACK_CAT_TYPES.structure}</button>
      <button type="button" data-rm-feedback-type="overall">◉ ${FEEDBACK_CAT_TYPES.overall}</button>
      <button type="button" data-rm-feedback-type="interaction">✦ ${FEEDBACK_CAT_TYPES.interaction}</button>
      <button type="button" data-rm-feedback-type="language">🌐 ${FEEDBACK_CAT_TYPES.language}</button>
      <button type="button" data-rm-feedback-type="custom">✎ 其他：自己输入</button>
      <textarea class="rabbit-mirror-feedback-cat-input rabbit-mirror-feedback-cat-custom-inline" maxlength="400" rows="4" placeholder="输入其他反馈……"></textarea>
      <div class="rabbit-mirror-feedback-cat-actions">
        <button type="button" data-rm-feedback-action="reset">清空选择</button>
        <button type="button" data-rm-feedback-action="submit">提交反馈</button>
      </div>
      ${active ? '<button type="button" data-rm-feedback-action="clear-active">不打了，清除当前生效反馈</button>' : ''}
      ${independentActions}
      <button type="button" data-rm-feedback-action="close">取消</button>`;
    const textarea = panel.querySelector('.rabbit-mirror-feedback-cat-custom-inline');
    textarea.value = customText;
    const render = () => {
        panel.querySelectorAll('[data-rm-feedback-type]').forEach(item => {
            const type = item.getAttribute('data-rm-feedback-type');
            const on = selected.has(type);
            item.classList.toggle('is-selected', on);
            item.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        const customOn = selected.has('custom');
        textarea.classList.toggle('is-visible', customOn);
        textarea.hidden = !customOn;
        panel.querySelector('[data-rm-feedback-action="submit"]').disabled = selected.size === 0;
    };
    document.body.appendChild(panel);
    positionFeedbackCatPanel(panel, button, 340);
    render();
    panel.addEventListener('click', event => {
        const typeButton = event.target?.closest?.('[data-rm-feedback-type]');
        const action = event.target?.closest?.('[data-rm-feedback-action]')?.getAttribute('data-rm-feedback-action');
        if (!typeButton && !action) return;
        event.preventDefault();
        event.stopPropagation();
        if (typeButton) {
            const type = typeButton.getAttribute('data-rm-feedback-type');
            if (selected.has(type)) selected.delete(type);
            else selected.add(type);
            render();
            if (type === 'custom' && selected.has('custom')) setTimeout(() => textarea.focus(), 0);
            return;
        }
        if (action === 'reset') {
            selected.clear();
            customText = '';
            textarea.value = '';
            render();
            return;
        }
        if (action === 'submit') {
            customText = textarea.value.trim();
            if (!selected.size) {
                globalThis.toastr?.warning?.('至少选择一项反馈。');
                return;
            }
            if (selected.has('custom') && !customText) {
                globalThis.toastr?.warning?.('请填写“其他”反馈内容。');
                textarea.focus();
                return;
            }
            showFeedbackCatRangeMenu(root, button, [...selected], customText);
            return;
        }
        if (action === 'clear-active') {
            clearActiveFeedbackForCurrentChat();
            updateFeedbackCatButtonTitles();
            closeFeedbackCatMenu();
            globalThis.toastr?.success?.('挨打猫已经忘掉当前反馈。');
            return;
        }
        if (action === 'resay' || action === 'history') {
            const owner = independentOwner || feedbackCatIndependentOwner(root, button) || {};
            const handled = invokeFeedbackMirrorAction(action, root, owner);
            closeFeedbackCatMenu();
            if (!handled) globalThis.toastr?.warning?.('没有找到这条回复对应的副 API 兔子镜。');
            return;
        }
        closeFeedbackCatMenu();
    }, true);
    textarea.addEventListener('input', () => { customText = textarea.value; });
    bindFeedbackCatOutsideClose(panel, button);
    return true;
}

function rabbitMirrorExternalGenerationState(root) {
    const host = root?.matches?.('[data-rabbit-mirror-external-source="true"][data-rm-state]')
        ? root
        : root?.closest?.('[data-rabbit-mirror-external-source="true"][data-rm-state]');
    return String(host?.getAttribute?.('data-rm-state') || '');
}


function rabbitMirrorExternalGenerationNotice(root, kind = 'maintenance') {
    const state = rabbitMirrorExternalGenerationState(root);
    if (state === 'loading') {
        const message = kind === 'feedback'
            ? '兔子镜仍在生成中，挨打猫会在生成完成后启用。'
            : '兔子镜仍在生成中，请稍候。';
        globalThis.toastr?.info?.(message);
        return true;
    }
    if (state === 'error' && kind === 'maintenance') {
        globalThis.toastr?.warning?.('独立 API 生成失败，维修兔无法修复请求错误；失败原因已显示在兔子镜内。');
        return true;
    }
    return false;
}

function handleFeedbackCatClick(event, root, button) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (rabbitMirrorExternalGenerationNotice(root, 'feedback')) return;
    showFeedbackCatMenu(root, button);
}

function maintenanceMobileLayoutComputedStyle(element) {
    try {
        return typeof getComputedStyle === 'function' ? getComputedStyle(element) : null;
    } catch {
        return null;
    }
}

function maintenanceMobileLayoutRect(element) {
    try {
        const rect = element?.getBoundingClientRect?.();
        return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
    } catch {
        return null;
    }
}

function maintenanceMobileLayoutLengthPx(value, reference = 0) {
    const text = String(value || '').trim().toLowerCase();
    if (!text || text === 'auto' || text === 'none' || text === 'normal') return 0;
    const number = Number.parseFloat(text);
    if (!Number.isFinite(number)) return 0;
    if (text.endsWith('px')) return number;
    if (text.endsWith('rem')) return number * 16;
    if (text.endsWith('em')) return number * 16;
    if (text.endsWith('vw')) return number * Math.max(320, Number(globalThis.innerWidth) || reference || 0) / 100;
    if (text.endsWith('vh')) return number * Math.max(480, Number(globalThis.innerHeight) || 0) / 100;
    if (text.endsWith('%') && reference > 0) return number * reference / 100;
    return number;
}

function maintenanceMobileLayoutSplitTracks(value) {
    const text = String(value || '').trim();
    if (!text || text === 'none') return [];
    const repeat = /^repeat\(\s*(\d+)\s*,/i.exec(text);
    if (repeat) return Array.from({ length: Math.min(12, Number(repeat[1]) || 0) }, () => 'repeat-track');
    const tracks = [];
    let current = '';
    let depth = 0;
    for (const char of text) {
        if (char === '(' || char === '[') depth += 1;
        if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
        if (/\s/.test(char) && depth === 0) {
            if (current.trim()) tracks.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    if (current.trim()) tracks.push(current.trim());
    return tracks;
}

function maintenanceMobileLayoutHasFixedTrack(value) {
    const text = String(value || '').toLowerCase();
    return /(?:^|[^\w.-])\d+(?:\.\d+)?(?:px|rem|em|vw)(?:$|[^\w.-])/.test(text)
        || /(?:minmax|fit-content)\([^)]*\d+(?:\.\d+)?(?:px|rem|em|vw)/.test(text);
}

function maintenanceMobileLayoutTextLength(element) {
    return String(element?.textContent || '').replace(/\s+/g, '').length;
}

function maintenanceMobileLayoutIsInternal(element) {
    if (!element?.matches) return true;
    if (element.matches('style,script,link,meta,br,summary')) return true;
    if (element.closest?.(`[${MAINTENANCE_MENU_ATTR}], [${FEEDBACK_CAT_MENU_ATTR}], [${INTERACTION_DIAGNOSTIC_PANEL_ATTR}]`)) return true;
    if (element.matches(`[${MAINTENANCE_RABBIT_ATTR}], [${FEEDBACK_CAT_ATTR}], [${RESAY_ATTR}], [${TOOL_ENTRY_HOST_ATTR}]`)) return true;
    if (element.matches(`[${MOBILE_INLINE_ANNOTATION_ORIGINAL_ATTR}], [${MOBILE_INLINE_ANNOTATION_MIRROR_ATTR}]`)) return true;
    return false;
}

function maintenanceMobileLayoutIsPassportManaged(element) {
    if (!element?.hasAttribute) return false;
    if (element.hasAttribute(PASSPORT_DOCUMENT_HOST_ATTR)
        || element.hasAttribute(PASSPORT_DOCUMENT_COVER_ATTR)
        || element.hasAttribute(PASSPORT_DOCUMENT_PAGES_ATTR)
        || element.hasAttribute(PASSPORT_DOCUMENT_STAMP_ATTR)
        || element.hasAttribute(PASSPORT_DOCUMENT_STAMP_DETAIL_ATTR)) return true;
    return !!element.closest?.(`[${PASSPORT_DOCUMENT_COVER_ATTR}], [${PASSPORT_DOCUMENT_PAGES_ATTR}], [${PASSPORT_DOCUMENT_STAMP_ATTR}]`);
}

function maintenanceMobileLayoutSectionStackInfo(element, style = null, directChildren = null) {
    if (!element?.querySelectorAll) return null;
    const computed = style || maintenanceMobileLayoutComputedStyle(element);
    const display = String(computed?.display || '').toLowerCase();
    const direction = String(computed?.flexDirection || '').toLowerCase();
    if (!display.includes('flex') || !direction.startsWith('column')) return null;

    const signature = `${element.id || ''} ${element.className || ''} ${element.getAttribute?.('aria-label') || ''}`;
    if (!/(?:entremet|layer|layers|section|section-view|cutaway|cross-section|strata|剖面|分层|层级|夹层|切面)/i.test(signature)) return null;

    const children = Array.isArray(directChildren)
        ? directChildren
        : [...(element.children || [])].filter(child => !maintenanceMobileLayoutIsInternal(child));
    const controls = [...element.querySelectorAll('input[type="checkbox"], input[type="radio"]')]
        .filter(input => input.closest?.('label')?.parentElement === element || input.parentElement === element);
    if (controls.length < 3 || controls.length > 12) return null;

    const sections = children.filter(child => {
        if (child.matches?.('label') && child.querySelector?.('input[type="checkbox"], input[type="radio"]')) return false;
        const childSignature = `${child.id || ''} ${child.className || ''}`;
        if (!/(?:^|[\s_-])(?:layer|section|slice|stratum)(?:$|[\s_-])|层|切片/i.test(childSignature)) return false;
        return maintenanceMobileLayoutTextLength(child) >= 4;
    });
    if (sections.length < 3 || Math.abs(sections.length - controls.length) > 1) return null;
    return { controls, sections };
}

function maintenanceMobileLayoutElementInSectionStack(element, hosts) {
    return (hosts || []).some(host => host === element || host.contains?.(element));
}


function maintenanceMobileLayoutScreenShellInfo(element) {
    if (!element?.querySelectorAll || element.matches?.('details,toto,summary,style,script')) return null;
    const signature = `${element.id || ''} ${element.className || ''} ${element.getAttribute?.('aria-label') || ''}`;
    const ownMediaHint = /(?:tv|television|crt|monitor|terminal|screen-shell|电视|监控|终端|显示器)/i.test(signature);
    const descendantMediaHint = !!element.querySelector?.(
        '[class*="tv-cabinet" i], [class*="tv-screen" i], [class*="crt" i], [class*="monitor" i], [class*="terminal" i], [class*="screen-shell" i]',
    );
    if (!ownMediaHint && !descendantMediaHint) return null;
    const screens = [...element.querySelectorAll('div,section,article,main')].filter(child => {
        const childSignature = `${child.id || ''} ${child.className || ''}`;
        return /(?:tv-screen|screen|display|viewport|monitor|屏幕|画面)/i.test(childSignature);
    });
    if (!screens.length || screens.length > 6) return null;
    const controls = [...element.querySelectorAll('input[type="checkbox"], input[type="radio"]')];
    if (controls.length < 1 || controls.length > 8) return null;
    const statePanels = [...element.querySelectorAll('div,section,article')].filter(panel => {
        const panelSignature = `${panel.id || ''} ${panel.className || ''}`;
        return /(?:state|scene|channel|feedback|initial|result|panel|画面|频道|反馈|状态)/i.test(panelSignature)
            && maintenanceMobileLayoutTextLength(panel) >= 8;
    });
    if (statePanels.length < 2) return null;
    return { screens, controls, statePanels };
}

function maintenanceMobileLayoutElementInScreenShell(element, hosts) {
    return (hosts || []).some(host => host === element || host.contains?.(element));
}

function maintenanceMobileLayoutHorizontalMediaHint(element) {
    if (!element) return false;
    if (element.matches?.('table,thead,tbody,tr,canvas')) return true;
    const signature = `${element.id || ''} ${element.className || ''} ${element.getAttribute?.('role') || ''} ${element.getAttribute?.('aria-label') || ''}`;
    return /(?:table|timeline|track|chart|graph|map|board|calendar|schedule|kanban|matrix|gallery|carousel|slider|race|score|仪表|时间轴|赛道|地图|表格|棋盘|画布|日历)/i.test(signature);
}


function maintenanceMobileLayoutSemanticMatrixInfo(element, style = null, directChildren = null) {
    if (!element) return null;
    const computed = style || maintenanceMobileLayoutComputedStyle(element);
    if (!String(computed?.display || '').toLowerCase().includes('grid')) return null;
    const columnTracks = maintenanceMobileLayoutSplitTracks(computed?.gridTemplateColumns);
    const rowTracks = maintenanceMobileLayoutSplitTracks(computed?.gridTemplateRows);
    if (columnTracks.length !== 2 || rowTracks.length !== 2) return null;

    const children = Array.isArray(directChildren)
        ? directChildren
        : [...(element.children || [])].filter(child => !maintenanceMobileLayoutIsInternal(child));
    const cells = children.filter(child => {
        const childStyle = maintenanceMobileLayoutComputedStyle(child);
        const position = String(childStyle?.position || '').toLowerCase();
        if (position === 'absolute' || position === 'fixed') return false;
        if (child.matches?.('label,button,details,a,[role="button"],[tabindex]')) return true;
        return maintenanceMobileLayoutTextLength(child) >= 18;
    });
    if (cells.length !== 4) return null;

    const signature = `${element.id || ''} ${element.className || ''} ${element.getAttribute?.('aria-label') || ''} ${cells.map(cell => `${cell.id || ''} ${cell.className || ''}`).join(' ')}`;
    const axisChildren = children.filter(child => /(?:axis|轴线|坐标轴|label-(?:top|bottom|left|right))/i.test(`${child.id || ''} ${child.className || ''}`));
    const semanticHint = /(?:quadrant|matrix|四象限|象限|坐标图|坐标系|matrix-grid|四宫格)/i.test(signature)
        || axisChildren.length >= 2;
    if (!semanticHint) return null;
    return { cells };
}

function maintenanceMobileLayoutMatrixInputs(root, cells) {
    const inputs = [];
    const seen = new Set();
    for (const cell of cells || []) {
        const forId = String(cell.getAttribute?.('for') || '').trim();
        const input = cell.control || (forId ? globalThis.document?.getElementById?.(forId) : null) || null;
        if (!input || !root.contains?.(input) || !input.matches?.('input[type="checkbox"], input[type="radio"]') || seen.has(input)) continue;
        seen.add(input);
        inputs.push(input);
    }
    return inputs;
}

function refreshMaintenanceMobileMatrixStates(root) {
    const state = mobileMatrixPreserveStates.get(root);
    if (!state) return;
    for (const entry of state.entries || []) {
        if (!entry.matrix?.isConnected) continue;
        const active = (entry.inputs || []).some(input => input?.checked);
        if (active) entry.matrix.setAttribute(MOBILE_LAYOUT_MATRIX_ACTIVE_ATTR, 'true');
        else entry.matrix.removeAttribute(MOBILE_LAYOUT_MATRIX_ACTIVE_ATTR);
    }
}

function installMaintenanceMobileMatrixStateRescue(root, entries) {
    if (!root) return 0;
    let state = mobileMatrixPreserveStates.get(root);
    if (!state) {
        state = {
            entries: [],
            onStateChange: () => setTimeout(() => refreshMaintenanceMobileMatrixStates(root), 0),
        };
        root.addEventListener('input', state.onStateChange, false);
        root.addEventListener('change', state.onStateChange, false);
        mobileMatrixPreserveStates.set(root, state);
    }
    state.entries = entries || [];
    refreshMaintenanceMobileMatrixStates(root);
    return state.entries.length;
}

function maintenanceMobileLayoutIsDecorativeOverflow(element, style = null) {
    if (!element) return false;
    const computed = style || maintenanceMobileLayoutComputedStyle(element);
    const position = String(computed?.position || '').toLowerCase();
    if (position !== 'absolute' && position !== 'fixed') return false;
    if (maintenanceMobileLayoutTextLength(element) > 0 || Number(element.childElementCount || 0) > 0) return false;
    if (element.matches?.('img,video,iframe,canvas,svg,button,input,label,a,summary,[role="button"],[tabindex]')) return false;
    const opacity = Number.parseFloat(computed?.opacity || '1');
    const pointerEvents = String(computed?.pointerEvents || '').toLowerCase();
    return pointerEvents === 'none' || (Number.isFinite(opacity) && opacity <= 0.65);
}

function maintenanceMobileLayoutMark(element, attr, marked) {
    if (!element?.setAttribute || !attr) return;
    if (!element.hasAttribute(attr)) element.setAttribute(attr, 'true');
    marked?.add?.(element);
}

function maintenanceMobileLayoutCreateScopeToken() {
    mobileLayoutScopeCounter += 1;
    return `rmmobile-${Date.now().toString(36)}-${mobileLayoutScopeCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function maintenanceMobileLayoutResolveCheckedTargets(root, input, rule) {
    let targets = getSiblingTargetsForCheckedRule(input, rule.relation, rule.targetSelector);
    if (!targets.length) {
        if (rule.source === 'class-local' || rule.source === 'generic-local') {
            targets = getLocalContainerTargetsForCheckedRule(input, rule.targetSelector);
        } else {
            targets = getCrossContainerTargetsForCheckedRule(root, rule.targetSelector);
        }
    }
    return targets.filter(target => target && target !== input);
}

function maintenanceMobileLayoutFixedRevealLimit(styleMap, referenceWidth) {
    let limit = 0;
    for (const [property, value] of styleMap || []) {
        const name = String(property || '').toLowerCase();
        const clean = String(value || '').trim().toLowerCase();
        if (name !== 'height' && name !== 'max-height') continue;
        if (!clean || /^(?:auto|none|max-content|min-content|fit-content|100%)$/.test(clean)) continue;
        const px = maintenanceMobileLayoutLengthPx(clean, referenceWidth);
        if (px > 0) limit = Math.max(limit, px);
    }
    return limit;
}

function refreshMaintenanceMobileStateContents(root) {
    const state = mobileLayoutRescueStates.get(root);
    if (!state) return;
    const activeTargets = new Set();
    for (const mapping of state.mappings || []) {
        if (mapping.input?.checked && mapping.target?.isConnected) activeTargets.add(mapping.target);
    }
    for (const target of state.targets || []) {
        if (!target?.isConnected) continue;
        if (activeTargets.has(target)) target.setAttribute(MOBILE_LAYOUT_STATE_ACTIVE_ATTR, 'true');
        else target.removeAttribute(MOBILE_LAYOUT_STATE_ACTIVE_ATTR);
    }
}

function installMaintenanceMobileStateContentRescue(root, marked, referenceWidth) {
    if (!root?.querySelectorAll) return 0;
    const mappings = [];
    const targets = new Set();
    for (const input of root.querySelectorAll('input[type="checkbox"], input[type="radio"]')) {
        for (const rule of parseCheckedRulesFromText(root, input)) {
            const fixedLimit = maintenanceMobileLayoutFixedRevealLimit(rule.styleMap, referenceWidth);
            if (fixedLimit <= 0) continue;
            for (const target of maintenanceMobileLayoutResolveCheckedTargets(root, input, rule)) {
                const hasContent = maintenanceMobileLayoutTextLength(target) >= 8 || Number(target.childElementCount || 0) > 0;
                if (!hasContent) continue;
                const inlineHeight = maintenanceMobileLayoutLengthPx(target.style?.height, referenceWidth);
                const naturalHeight = Math.max(Number(target.scrollHeight || 0), Number(maintenanceMobileLayoutRect(target)?.height || 0));
                const collapsedInitially = String(target.style?.height || '').trim() === '0px'
                    || String(target.style?.height || '').trim() === '0';
                if (!collapsedInitially && naturalHeight > 0 && naturalHeight <= fixedLimit + 8) continue;
                target.setAttribute(MOBILE_LAYOUT_STATE_CONTENT_ATTR, 'true');
                targets.add(target);
                mappings.push({ input, target });
                maintenanceMobileLayoutMark(target, MOBILE_LAYOUT_STATE_CONTENT_ATTR, marked);
            }
        }
    }

    let state = mobileLayoutRescueStates.get(root);
    if (!state) {
        state = {
            mappings: [],
            targets: new Set(),
            onStateChange: () => setTimeout(() => refreshMaintenanceMobileStateContents(root), 0),
        };
        root.addEventListener('input', state.onStateChange, false);
        root.addEventListener('change', state.onStateChange, false);
        mobileLayoutRescueStates.set(root, state);
    }
    state.mappings = mappings;
    state.targets = targets;
    refreshMaintenanceMobileStateContents(root);
    return targets.size;
}


function maintenanceMobileLayoutRelationTreeInfo(element) {
    if (!element?.querySelectorAll) return null;
    const style = maintenanceMobileLayoutComputedStyle(element);
    if (!String(style?.display || '').toLowerCase().includes('grid')) return null;
    const tracks = maintenanceMobileLayoutSplitTracks(String(style?.gridTemplateColumns || ''));
    if (tracks.length !== 2) return null;
    const cells = [...(element.children || [])].filter(child => !maintenanceMobileLayoutIsInternal(child));
    if (cells.length !== 2) return null;
    const entries = [];
    for (const cell of cells) {
        const input = cell.querySelector?.('input[type="radio"], input[type="checkbox"]');
        if (!input?.id) return null;
        const label = cell.querySelector?.(`label[for="${cssEscape(input.id)}"]`);
        if (!label) return null;
        let detail = null;
        for (const sibling of [...(input.parentElement?.children || [])]) {
            if (sibling === input || sibling === label) continue;
            if (sibling.compareDocumentPosition?.(input) & Node.DOCUMENT_POSITION_FOLLOWING) continue;
        }
        detail = input.nextElementSibling;
        if (!detail || maintenanceMobileLayoutTextLength(detail) < 8) return null;
        const detailStyle = maintenanceMobileLayoutComputedStyle(detail);
        const collapsed = String(detailStyle?.opacity || '') === '0'
            || maintenanceMobileLayoutLengthPx(detailStyle?.maxHeight, 640) <= 1
            || String(detail.style?.maxHeight || '').trim() === '0';
        if (!collapsed) return null;
        entries.push({ cell, input, label, detail });
    }
    const hint = String(element.parentElement?.textContent || '').replace(/\s+/g, ' ').trim();
    const hasRelationHint = /关系|羁绊|节点|角色|人物|relationship|bond|node/i.test(hint);
    if (!hasRelationHint) return null;
    return { branch: element, entries };
}

function maintenanceMobileLayoutCollectRelationTrees(root, elements, marked) {
    const infos = [];
    for (const element of elements) {
        const info = maintenanceMobileLayoutRelationTreeInfo(element);
        if (!info) continue;
        maintenanceMobileLayoutMark(info.branch, MOBILE_LAYOUT_RELATION_BRANCH_ATTR, marked);
        const host = info.branch.parentElement || info.branch;
        maintenanceMobileLayoutMark(host, MOBILE_LAYOUT_RELATION_TREE_ATTR, marked);
        info.entries.forEach((entry, index) => {
            maintenanceMobileLayoutMark(entry.cell, MOBILE_LAYOUT_RELATION_CELL_ATTR, marked);
            maintenanceMobileLayoutMark(entry.detail, MOBILE_LAYOUT_RELATION_DETAIL_ATTR, marked);
            entry.detail.setAttribute(MOBILE_LAYOUT_RELATION_SIDE_ATTR, index === 0 ? 'left' : 'right');
            marked?.add?.(entry.detail);
        });
        infos.push(info);
    }
    return infos;
}

function maintenanceMobileLayoutElementInRelationTree(element, relationInfos) {
    return relationInfos.some(info => info.branch === element || info.branch.contains?.(element));
}

function maintenanceMobileLayoutCss(scopeToken) {
    const scope = `[${MOBILE_LAYOUT_SCOPE_ATTR}="${scopeToken}"]`;
    return `@media (max-width: ${MOBILE_LAYOUT_BREAKPOINT_PX}px) {
${scope} [${MOBILE_LAYOUT_FIT_ATTR}] { max-width: 100% !important; box-sizing: border-box !important; min-width: 0 !important; }
${scope} [${MOBILE_LAYOUT_MIN_ATTR}] { min-width: 0 !important; max-width: 100% !important; box-sizing: border-box !important; }
${scope} [${MOBILE_LAYOUT_GRID_COLLAPSE_ATTR}] { grid-template-columns: minmax(0, 1fr) !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important; box-sizing: border-box !important; }
${scope} [${MOBILE_LAYOUT_MATRIX_PRESERVE_ATTR}] { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important; box-sizing: border-box !important; }
${scope} [${MOBILE_LAYOUT_MATRIX_PRESERVE_ATTR}][${MOBILE_LAYOUT_MATRIX_ACTIVE_ATTR}] { aspect-ratio: auto !important; height: auto !important; max-height: none !important; grid-template-rows: repeat(2, minmax(0, 1fr)) !important; align-items: stretch !important; }
${scope} [${MOBILE_LAYOUT_MATRIX_CELL_ATTR}] { min-width: 0 !important; max-width: 100% !important; box-sizing: border-box !important; overflow: hidden !important; padding-left: clamp(10px, 3vw, 16px) !important; padding-right: clamp(10px, 3vw, 16px) !important; overflow-wrap: anywhere !important; word-break: break-word !important; }
${scope} [${MOBILE_LAYOUT_MATRIX_PRESERVE_ATTR}][${MOBILE_LAYOUT_MATRIX_ACTIVE_ATTR}] [${MOBILE_LAYOUT_MATRIX_CELL_ATTR}] { height: auto !important; min-height: 0 !important; }
${scope} [${MOBILE_LAYOUT_FLEX_WRAP_ATTR}] { flex-wrap: wrap !important; min-width: 0 !important; }
${scope} [${MOBILE_LAYOUT_FLEX_STACK_ATTR}] { flex-direction: column !important; align-items: stretch !important; min-width: 0 !important; }
${scope} [${MOBILE_LAYOUT_SINGLE_COLUMN_ATTR}] { column-count: 1 !important; column-width: auto !important; }
${scope} [${MOBILE_LAYOUT_FLUID_TITLE_ATTR}] { font-size: clamp(1.25rem, 7vw, 2rem) !important; line-height: 1.18 !important; overflow-wrap: anywhere !important; word-break: break-word !important; }
${scope} [${MOBILE_LAYOUT_COMPACT_PADDING_ATTR}] { padding-left: clamp(10px, 4vw, 20px) !important; padding-right: clamp(10px, 4vw, 20px) !important; }
${scope} [${MOBILE_LAYOUT_COMPACT_GAP_ATTR}] { gap: clamp(10px, 3vw, 20px) !important; }
${scope} [${MOBILE_LAYOUT_MEDIA_ATTR}] { max-width: 100% !important; box-sizing: border-box !important; }
${scope} img[${MOBILE_LAYOUT_MEDIA_ATTR}], ${scope} video[${MOBILE_LAYOUT_MEDIA_ATTR}], ${scope} canvas[${MOBILE_LAYOUT_MEDIA_ATTR}] { height: auto !important; }
${scope} iframe[${MOBILE_LAYOUT_MEDIA_ATTR}] { width: 100% !important; }
${scope} [${MOBILE_LAYOUT_SCROLL_ATTR}] { max-width: 100% !important; overflow-x: auto !important; overscroll-behavior-inline: contain; -webkit-overflow-scrolling: touch; }
${scope} table[${MOBILE_LAYOUT_SCROLL_ATTR}], ${scope} pre[${MOBILE_LAYOUT_SCROLL_ATTR}] { display: block !important; }
${scope} [${MOBILE_LAYOUT_BREAK_TEXT_ATTR}] { overflow-wrap: anywhere !important; word-break: break-word !important; min-width: 0 !important; }
${scope} [${MOBILE_LAYOUT_STATE_CONTENT_ATTR}][${MOBILE_LAYOUT_STATE_ACTIVE_ATTR}] { height: auto !important; max-height: none !important; overflow: visible !important; }
${scope} [${MOBILE_LAYOUT_RELATION_BRANCH_ATTR}] { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important; gap: clamp(8px, 3vw, 16px) !important; overflow: visible !important; }
${scope} [${MOBILE_LAYOUT_RELATION_CELL_ATTR}] { min-width: 0 !important; max-width: none !important; overflow: visible !important; }
${scope} [${MOBILE_LAYOUT_RELATION_DETAIL_ATTR}] { width: calc(200% + clamp(8px, 3vw, 16px)) !important; max-width: none !important; box-sizing: border-box !important; overflow-wrap: break-word !important; word-break: normal !important; }
${scope} [${MOBILE_LAYOUT_RELATION_DETAIL_ATTR}][${MOBILE_LAYOUT_RELATION_SIDE_ATTR}="left"] { transform: none !important; }
${scope} [${MOBILE_LAYOUT_RELATION_DETAIL_ATTR}][${MOBILE_LAYOUT_RELATION_SIDE_ATTR}="right"] { transform: translateX(calc(-50% - clamp(4px, 1.5vw, 8px))) !important; }
}`;
}

function inspectMaintenanceMobileLayout(root) {
    const empty = {
        candidateCount: 0,
        viewportWidth: Number(globalThis.innerWidth || 0),
        narrowViewport: false,
        horizontalOverflowCount: 0,
        fixedWidthCount: 0,
        gridCount: 0,
        matrixCount: 0,
        flexCount: 0,
        multiColumnCount: 0,
        mediaCount: 0,
        stateContentCount: 0,
        passportDocumentCount: 0,
        sectionStackCount: 0,
        screenShellCount: 0,
        relationTreeCount: 0,
    };
    if (!root?.querySelectorAll) return empty;
    const viewportWidth = Math.max(0, Number(globalThis.innerWidth || globalThis.document?.documentElement?.clientWidth || 0));
    const narrowViewport = viewportWidth > 0 && viewportWidth <= MOBILE_LAYOUT_BREAKPOINT_PX + 40;
    if (!narrowViewport) return { ...empty, viewportWidth, narrowViewport };

    const rootRect = maintenanceMobileLayoutRect(root);
    const referenceWidth = Math.max(280, Math.min(
        Number(rootRect?.width || 0) || Number(root.parentElement?.clientWidth || 0) || viewportWidth || MOBILE_LAYOUT_BREAKPOINT_PX,
        MOBILE_LAYOUT_BREAKPOINT_PX,
    ));
    const buckets = {
        horizontalOverflow: new Set(),
        fixedWidth: new Set(),
        grid: new Set(),
        matrix: new Set(),
        flex: new Set(),
        multiColumn: new Set(),
        media: new Set(),
        stateContent: new Set(),
        relationTree: new Set(),
    };
    const alreadyRepaired = root.hasAttribute(MOBILE_LAYOUT_SCOPE_ATTR)
        && !!root.querySelector(`style[${MOBILE_LAYOUT_RESCUE_STYLE_ATTR}]`);
    const elements = [root, ...root.querySelectorAll('*')].filter(element => !maintenanceMobileLayoutIsInternal(element));
    const sectionStackHosts = elements.filter(element => maintenanceMobileLayoutSectionStackInfo(element));
    const screenShellHosts = elements.filter(element => maintenanceMobileLayoutScreenShellInfo(element))
        .filter(host => !elements.some(other => other !== host && maintenanceMobileLayoutScreenShellInfo(other) && other.contains?.(host)));

    const relationTreeInfos = elements.map(maintenanceMobileLayoutRelationTreeInfo).filter(Boolean);
    relationTreeInfos.forEach(info => buckets.relationTree.add(info.branch));
    for (const element of elements) {
        if (maintenanceMobileLayoutElementInSectionStack(element, sectionStackHosts)
            || maintenanceMobileLayoutElementInScreenShell(element, screenShellHosts)
            || maintenanceMobileLayoutElementInRelationTree(element, relationTreeInfos)) continue;
        const style = maintenanceMobileLayoutComputedStyle(element);
        if (!style) continue;
        const rect = maintenanceMobileLayoutRect(element);
        const display = String(style.display || '').toLowerCase();
        const inlineStyle = String(element.getAttribute?.('style') || '').toLowerCase();
        const clientWidth = Number(element.clientWidth || 0);
        const scrollWidth = Number(element.scrollWidth || 0);
        const overflowsSelf = clientWidth > 0 && scrollWidth > clientWidth + 3;
        const overflowsViewport = !!rect && (rect.left < -3 || rect.right > viewportWidth + 3);
        const decorativeOverflow = maintenanceMobileLayoutIsDecorativeOverflow(element, style);
        const passportManaged = maintenanceMobileLayoutIsPassportManaged(element);
        if (!decorativeOverflow && !passportManaged && (overflowsSelf || overflowsViewport)) buckets.horizontalOverflow.add(element);

        const minWidth = maintenanceMobileLayoutLengthPx(style.minWidth, referenceWidth);
        const fixedWidth = maintenanceMobileLayoutLengthPx(style.width, referenceWidth);
        const explicitLargeWidth = /(?:^|;)\s*(?:width|min-width)\s*:\s*(?:3[6-9]\d|[4-9]\d{2}|\d{4,})(?:\.\d+)?px\b/.test(inlineStyle);
        if (!passportManaged && !element.hasAttribute(MOBILE_LAYOUT_FIT_ATTR) && (minWidth > referenceWidth + 3 || fixedWidth > referenceWidth + 3 || explicitLargeWidth)) {
            buckets.fixedWidth.add(element);
        }

        if (display.includes('grid') && !element.hasAttribute(MOBILE_LAYOUT_GRID_COLLAPSE_ATTR) && !element.hasAttribute(PASSPORT_DOCUMENT_PAGES_ATTR)) {
            const template = String(style.gridTemplateColumns || '').trim();
            const tracks = maintenanceMobileLayoutSplitTracks(template);
            const textHeavy = maintenanceMobileLayoutTextLength(element) >= 120;
            const matrixInfo = maintenanceMobileLayoutSemanticMatrixInfo(element, style);
            if (matrixInfo) {
                const matrixInputs = maintenanceMobileLayoutMatrixInputs(root, matrixInfo.cells);
                const active = matrixInputs.some(input => input.checked);
                const cellClipped = matrixInfo.cells.some(cell => Number(cell.scrollHeight || 0) > Number(cell.clientHeight || 0) + 3);
                const constrained = String(style.aspectRatio || '').toLowerCase() !== 'auto'
                    || maintenanceMobileLayoutLengthPx(style.maxHeight, referenceWidth) > 0
                    || maintenanceMobileLayoutLengthPx(style.height, referenceWidth) > 0;
                if (active && (cellClipped || constrained)) buckets.matrix.add(element);
            } else if (tracks.length > 1 && (overflowsSelf || maintenanceMobileLayoutHasFixedTrack(template) || textHeavy)) {
                buckets.grid.add(element);
            }
        }

        if (display.includes('flex') && !passportManaged && !element.hasAttribute(MOBILE_LAYOUT_FLEX_WRAP_ATTR) && !element.hasAttribute(MOBILE_LAYOUT_FLEX_STACK_ATTR)) {
            const direction = String(style.flexDirection || 'row').toLowerCase();
            if (direction.startsWith('row')) {
                const children = [...(element.children || [])].filter(child => {
                    if (maintenanceMobileLayoutIsInternal(child)) return false;
                    const childPosition = String(maintenanceMobileLayoutComputedStyle(child)?.position || '').toLowerCase();
                    return childPosition !== 'absolute' && childPosition !== 'fixed';
                });
                const wrap = String(style.flexWrap || '').toLowerCase();
                const hasLargeHeading = !!element.querySelector?.(':scope > h1, :scope > h2');
                const childOverflow = rect ? children.some(child => {
                    const childRect = maintenanceMobileLayoutRect(child);
                    return childRect && (childRect.right > rect.right + 3 || childRect.left < rect.left - 3);
                }) : false;
                const gap = maintenanceMobileLayoutLengthPx(style.columnGap || style.gap, referenceWidth);
                let nonShrinkWidth = 0;
                let nonShrinkCount = 0;
                for (const child of children) {
                    const childRect = maintenanceMobileLayoutRect(child);
                    const childStyle = maintenanceMobileLayoutComputedStyle(child);
                    if (Number.parseFloat(childStyle?.flexShrink || '1') !== 0) continue;
                    nonShrinkCount += 1;
                    nonShrinkWidth += Math.max(
                        Number(childRect?.width || 0),
                        maintenanceMobileLayoutLengthPx(childStyle?.width, referenceWidth),
                        maintenanceMobileLayoutLengthPx(childStyle?.minWidth, referenceWidth),
                    );
                }
                nonShrinkWidth += Math.max(0, nonShrinkCount - 1) * gap;
                const constrainedChildren = nonShrinkCount >= 2 && nonShrinkWidth > referenceWidth + 3;
                if (children.length > 1 && wrap === 'nowrap' && (overflowsSelf || childOverflow || hasLargeHeading || constrainedChildren)) {
                    buckets.flex.add(element);
                }
            }
        }

        const columnCount = Number.parseInt(style.columnCount || '1', 10) || 1;
        if (columnCount > 1 && !element.hasAttribute(MOBILE_LAYOUT_SINGLE_COLUMN_ATTR)) buckets.multiColumn.add(element);

        if (element.matches?.('img,video,iframe,canvas,svg,table,pre')) {
            const mediaOverflow = overflowsSelf || overflowsViewport || Number(rect?.width || 0) > referenceWidth + 3;
            if (mediaOverflow && !element.hasAttribute(MOBILE_LAYOUT_MEDIA_ATTR) && !element.hasAttribute(MOBILE_LAYOUT_SCROLL_ATTR)) {
                buckets.media.add(element);
            }
        }
    }

    if (!alreadyRepaired) {
        for (const input of root.querySelectorAll('input[type="checkbox"], input[type="radio"]')) {
            for (const rule of parseCheckedRulesFromText(root, input)) {
                const fixedLimit = maintenanceMobileLayoutFixedRevealLimit(rule.styleMap, referenceWidth);
                if (fixedLimit <= 0) continue;
                for (const target of maintenanceMobileLayoutResolveCheckedTargets(root, input, rule)) {
                    if (target.hasAttribute(MOBILE_LAYOUT_STATE_CONTENT_ATTR)) continue;
                    const hasContent = maintenanceMobileLayoutTextLength(target) >= 8 || Number(target.childElementCount || 0) > 0;
                    if (!hasContent) continue;
                    const collapsedInitially = /^(?:0|0px)$/.test(String(target.style?.height || '').trim());
                    const naturalHeight = Math.max(Number(target.scrollHeight || 0), Number(maintenanceMobileLayoutRect(target)?.height || 0));
                    if (collapsedInitially || naturalHeight === 0 || naturalHeight > fixedLimit + 8) buckets.stateContent.add(target);
                }
            }
        }
    }

    const unique = new Set(Object.values(buckets).flatMap(set => [...set]));
    return {
        candidateCount: unique.size,
        viewportWidth,
        narrowViewport,
        horizontalOverflowCount: buckets.horizontalOverflow.size,
        fixedWidthCount: buckets.fixedWidth.size,
        gridCount: buckets.grid.size,
        matrixCount: buckets.matrix.size,
        flexCount: buckets.flex.size,
        multiColumnCount: buckets.multiColumn.size,
        mediaCount: buckets.media.size,
        stateContentCount: buckets.stateContent.size,
        passportDocumentCount: findRenderedPassportDocumentCandidates(root).length,
        sectionStackCount: sectionStackHosts.length,
        screenShellCount: screenShellHosts.length,
        relationTreeCount: relationTreeInfos.length,
    };
}

function installMaintenanceMobileLayoutRescue(root) {
    if (!root?.querySelectorAll || !root?.isConnected) return 0;
    let scopeToken = root.getAttribute(MOBILE_LAYOUT_SCOPE_ATTR);
    if (!scopeToken) {
        scopeToken = maintenanceMobileLayoutCreateScopeToken();
        root.setAttribute(MOBILE_LAYOUT_SCOPE_ATTR, scopeToken);
    }

    for (const attr of MOBILE_LAYOUT_TARGET_ATTRS) {
        root.querySelectorAll(`[${attr}]`).forEach(element => element.removeAttribute(attr));
    }

    const rootRect = maintenanceMobileLayoutRect(root);
    const referenceWidth = Math.max(280, Math.min(
        Number(rootRect?.width || 0) || Number(root.parentElement?.clientWidth || 0) || Number(globalThis.innerWidth || 0) || MOBILE_LAYOUT_BREAKPOINT_PX,
        MOBILE_LAYOUT_BREAKPOINT_PX,
    ));
    const marked = new Set();
    const matrixEntries = [];
    const passportCandidates = findRenderedPassportDocumentCandidates(root);
    for (const candidate of passportCandidates) markRenderedPassportDocumentCandidate(candidate, marked);
    if (passportCandidates.length) ensurePassportDocumentRescueStyle(root);
    const elements = [...root.querySelectorAll('*')].filter(element => !maintenanceMobileLayoutIsInternal(element));
    const sectionStackHosts = elements.filter(element => maintenanceMobileLayoutSectionStackInfo(element));
    for (const host of sectionStackHosts) maintenanceMobileLayoutMark(host, MOBILE_LAYOUT_SECTION_STACK_PRESERVE_ATTR, marked);
    const screenShellHosts = elements.filter(element => maintenanceMobileLayoutScreenShellInfo(element))
        .filter(host => !elements.some(other => other !== host && maintenanceMobileLayoutScreenShellInfo(other) && other.contains?.(host)));
    for (const host of screenShellHosts) maintenanceMobileLayoutMark(host, MOBILE_LAYOUT_SCREEN_SHELL_PRESERVE_ATTR, marked);
    const relationTreeInfos = maintenanceMobileLayoutCollectRelationTrees(root, elements, marked);

    for (const element of elements) {
        if (maintenanceMobileLayoutElementInSectionStack(element, sectionStackHosts)
            || maintenanceMobileLayoutElementInScreenShell(element, screenShellHosts)
            || maintenanceMobileLayoutElementInRelationTree(element, relationTreeInfos)) continue;
        const style = maintenanceMobileLayoutComputedStyle(element);
        if (!style) continue;
        const rect = maintenanceMobileLayoutRect(element);
        const display = String(style.display || '').toLowerCase();
        const position = String(style.position || '').toLowerCase();
        const directChildren = [...(element.children || [])].filter(child => !maintenanceMobileLayoutIsInternal(child));
        const inlineStyle = String(element.getAttribute?.('style') || '').toLowerCase();
        const elementWidth = Number(rect?.width || 0);
        const clientWidth = Number(element.clientWidth || 0);
        const scrollWidth = Number(element.scrollWidth || 0);
        const overflowsSelf = clientWidth > 0 && scrollWidth > clientWidth + 3;
        const overflowsRoot = elementWidth > referenceWidth + 3;
        const minWidth = maintenanceMobileLayoutLengthPx(style.minWidth, referenceWidth);
        const inlineFixedWidth = /(?:^|;)\s*(?:width|min-width)\s*:\s*\d+(?:\.\d+)?(?:px|rem|em|vw)\b/.test(inlineStyle);
        const viewportWidthWithPadding = /(?:^|;)\s*width\s*:\s*100vw\b/.test(inlineStyle)
            && (maintenanceMobileLayoutLengthPx(style.paddingLeft, referenceWidth) + maintenanceMobileLayoutLengthPx(style.paddingRight, referenceWidth) > 0);

        const decorativeOverflow = maintenanceMobileLayoutIsDecorativeOverflow(element, style);
        const passportManaged = maintenanceMobileLayoutIsPassportManaged(element);
        if (!decorativeOverflow && !passportManaged && (overflowsRoot || minWidth > referenceWidth + 3 || inlineFixedWidth || viewportWidthWithPadding)) {
            maintenanceMobileLayoutMark(element, MOBILE_LAYOUT_FIT_ATTR, marked);
        }

        if (display.includes('grid')) {
            const template = String(style.gridTemplateColumns || '').trim();
            const tracks = maintenanceMobileLayoutSplitTracks(template);
            const matrixInfo = maintenanceMobileLayoutSemanticMatrixInfo(element, style, directChildren);
            if (element.hasAttribute(PASSPORT_DOCUMENT_PAGES_ATTR)) {
                for (const child of directChildren) maintenanceMobileLayoutMark(child, MOBILE_LAYOUT_MIN_ATTR, marked);
            } else if (matrixInfo) {
                maintenanceMobileLayoutMark(element, MOBILE_LAYOUT_MATRIX_PRESERVE_ATTR, marked);
                for (const cell of matrixInfo.cells) maintenanceMobileLayoutMark(cell, MOBILE_LAYOUT_MATRIX_CELL_ATTR, marked);
                matrixEntries.push({ matrix: element, inputs: maintenanceMobileLayoutMatrixInputs(root, matrixInfo.cells) });
            } else {
                for (const child of directChildren) maintenanceMobileLayoutMark(child, MOBILE_LAYOUT_MIN_ATTR, marked);
                if (tracks.length > 1 && (maintenanceMobileLayoutHasFixedTrack(template) || overflowsSelf || overflowsRoot)) {
                    if (maintenanceMobileLayoutHorizontalMediaHint(element)) {
                        maintenanceMobileLayoutMark(element, MOBILE_LAYOUT_SCROLL_ATTR, marked);
                    } else {
                        maintenanceMobileLayoutMark(element, MOBILE_LAYOUT_GRID_COLLAPSE_ATTR, marked);
                    }
                }
            }
        }

        if (display.includes('flex') && directChildren.length > 1 && !passportManaged) {
            const direction = String(style.flexDirection || 'row').toLowerCase();
            if (direction.startsWith('row')) {
                const flowChildren = directChildren.filter(child => {
                    const childPosition = String(maintenanceMobileLayoutComputedStyle(child)?.position || '').toLowerCase();
                    return childPosition !== 'absolute' && childPosition !== 'fixed';
                });
                const wrap = String(style.flexWrap || '').toLowerCase();
                const hasLargeHeading = !!element.querySelector?.(':scope > h1, :scope > h2');
                const childOverflow = rect ? flowChildren.some(child => {
                    const childRect = maintenanceMobileLayoutRect(child);
                    return childRect && (childRect.right > rect.right + 3 || childRect.left < rect.left - 3);
                }) : false;
                const gap = maintenanceMobileLayoutLengthPx(style.columnGap || style.gap, referenceWidth);
                let nonShrinkWidth = 0;
                let nonShrinkCount = 0;
                for (const child of flowChildren) {
                    const childRect = maintenanceMobileLayoutRect(child);
                    const childStyle = maintenanceMobileLayoutComputedStyle(child);
                    if (Number.parseFloat(childStyle?.flexShrink || '1') !== 0) continue;
                    nonShrinkCount += 1;
                    nonShrinkWidth += Math.max(
                        Number(childRect?.width || 0),
                        maintenanceMobileLayoutLengthPx(childStyle?.width, referenceWidth),
                        maintenanceMobileLayoutLengthPx(childStyle?.minWidth, referenceWidth),
                    );
                }
                nonShrinkWidth += Math.max(0, nonShrinkCount - 1) * gap;
                const constrainedChildren = nonShrinkCount >= 2 && nonShrinkWidth > referenceWidth + 3;
                if (wrap === 'nowrap' && (overflowsSelf || childOverflow || hasLargeHeading || constrainedChildren)) {
                    for (const child of flowChildren) maintenanceMobileLayoutMark(child, MOBILE_LAYOUT_MIN_ATTR, marked);
                    const textHeavyChildren = flowChildren.filter(child => maintenanceMobileLayoutTextLength(child) >= 18).length;
                    if (flowChildren.length <= 3 && textHeavyChildren >= 2) {
                        maintenanceMobileLayoutMark(element, MOBILE_LAYOUT_FLEX_STACK_ATTR, marked);
                    } else {
                        maintenanceMobileLayoutMark(element, MOBILE_LAYOUT_FLEX_WRAP_ATTR, marked);
                    }
                }
            }
        }

        const columnCount = Number.parseInt(style.columnCount || '1', 10) || 1;
        if (columnCount > 1 || /(?:^|;)\s*column-count\s*:\s*[2-9]\d*\b/.test(inlineStyle)) {
            maintenanceMobileLayoutMark(element, MOBILE_LAYOUT_SINGLE_COLUMN_ATTR, marked);
        }

        if (element.matches?.('h1,h2,h3')) {
            const fontSize = maintenanceMobileLayoutLengthPx(style.fontSize, referenceWidth);
            if (fontSize >= 28 || overflowsSelf || overflowsRoot || maintenanceMobileLayoutTextLength(element) >= 20) {
                maintenanceMobileLayoutMark(element, MOBILE_LAYOUT_FLUID_TITLE_ATTR, marked);
            }
        }

        const maxHorizontalPadding = Math.max(
            maintenanceMobileLayoutLengthPx(style.paddingLeft, referenceWidth),
            maintenanceMobileLayoutLengthPx(style.paddingRight, referenceWidth),
        );
        if (maxHorizontalPadding >= 24 && elementWidth > 0 && elementWidth <= referenceWidth + 4) {
            maintenanceMobileLayoutMark(element, MOBILE_LAYOUT_COMPACT_PADDING_ATTR, marked);
        }
        const rowGap = maintenanceMobileLayoutLengthPx(style.rowGap, referenceWidth);
        const columnGap = maintenanceMobileLayoutLengthPx(style.columnGap, referenceWidth);
        if (Math.max(rowGap, columnGap) >= 24) maintenanceMobileLayoutMark(element, MOBILE_LAYOUT_COMPACT_GAP_ATTR, marked);

        if (element.matches?.('img,video,iframe,canvas,svg')) {
            const decorativeOverlay = (position === 'absolute' || position === 'fixed')
                && String(style.pointerEvents || '').toLowerCase() === 'none';
            if (!decorativeOverlay) maintenanceMobileLayoutMark(element, MOBILE_LAYOUT_MEDIA_ATTR, marked);
        }
        if (element.matches?.('table,pre')) {
            maintenanceMobileLayoutMark(element, MOBILE_LAYOUT_SCROLL_ATTR, marked);
        }

        const compactText = String(element.textContent || '').replace(/\s+/g, ' ').trim();
        const hasLongToken = /[^\s]{28,}/.test(compactText);
        if ((overflowsSelf && maintenanceMobileLayoutTextLength(element) > 0) || hasLongToken) {
            maintenanceMobileLayoutMark(element, MOBILE_LAYOUT_BREAK_TEXT_ATTR, marked);
        }

        if ((position === 'absolute' || position === 'fixed') && maintenanceMobileLayoutTextLength(element) > 0 && rootRect && rect) {
            if (rect.left < rootRect.left - 4 || rect.right > rootRect.right + 4) {
                maintenanceMobileLayoutMark(element, MOBILE_LAYOUT_FIT_ATTR, marked);
                maintenanceMobileLayoutMark(element, MOBILE_LAYOUT_BREAK_TEXT_ATTR, marked);
            }
        }
    }

    installMaintenanceMobileMatrixStateRescue(root, matrixEntries);
    installMaintenanceMobileStateContentRescue(root, marked, referenceWidth);

    let rescueStyle = root.querySelector(`style[${MOBILE_LAYOUT_RESCUE_STYLE_ATTR}]`);
    if (!rescueStyle) {
        rescueStyle = document.createElement('style');
        rescueStyle.setAttribute(MOBILE_LAYOUT_RESCUE_STYLE_ATTR, 'true');
        root.appendChild(rescueStyle);
    }
    rescueStyle.textContent = maintenanceMobileLayoutCss(scopeToken);
    const count = marked.size;
    root.setAttribute(MOBILE_LAYOUT_RESCUE_COUNT_ATTR, String(count));
    return count;
}

function maintenanceUserRepairInspection(root, mode) {
    const inspection = inspectMaintenanceRabbit(root);
    const independent = isIndependentMaintenanceRoot(root);
    if (!independent && (mode === 'source' || mode === 'code' || mode === 'plainText' || mode === 'all')) {
        inspection.full = { ...inspection.full, sourceCandidate: true };
        inspection.code = { ...inspection.code, needsSanitize: true, strictWhole: true };
    }
    if (mode === 'style' || mode === 'source' || mode === 'all') {
        const full = diagnosticFullChainSummary(root, inspection.code || {}) || {};
        if (full.damagedDataUriCandidate || full.structureTruncated || full.hostCssParserError) {
            inspection.full = { ...inspection.full, ...full };
        }
    }
    return inspection;
}

const MAINTENANCE_RESCUE_MODULE_VERSION = 'v2.09-test';

// 维修兔内部急救登记表。这里登记的是已经存在并经过实际案例验证的旧急救能力，
// 维修兔只负责按用户选择调度，不复制、不删减各急救器原有逻辑。
const MAINTENANCE_RESCUE_LIBRARY = Object.freeze([
    { id: 'code-block-dom', modes: ['source', 'code', 'all'], bucket: 'code', run: ({ messageScope }) => sanitizeCodeBlocksInScope(messageScope, true) },
    { id: 'plain-text-dom', modes: ['source', 'plainText', 'code', 'all'], bucket: 'plainText', run: ({ messageScope }) => sanitizeWholePlainTextRabbitMirrorsInScope(messageScope, true) },
    { id: 'rendered-details-dom', modes: ['source', 'plainText', 'code', 'all'], bucket: 'plainText', run: ({ messageScope }) => sanitizeRenderedRabbitMirrorDetailsInScope(messageScope, true) },
    { id: 'css-comment-boundary', modes: ['source', 'style', 'all'], bucket: 'style', perTarget: true, run: ({ target }) => repairMarkdownCorruptedCssComments(target) },
    // “排版不适配／内容显示不全”共用同一条手动路线：先修窄屏容器关系，再复测叶级文字裁切。
    { id: 'mobile-inline-annotation-flow-repair', modes: ['text', 'all'], bucket: 'style', perTarget: true, run: ({ target }) => installMobileInlineAnnotationRescue(target) },
    { id: 'nested-details-popup-flow-repair', modes: ['text', 'all'], bucket: 'style', perTarget: true, run: ({ target }) => repairNestedDetailsPopupClipping(target) },
    { id: 'mobile-layout-rescue', modes: ['text', 'all'], bucket: 'style', perTarget: true, run: ({ root, target }) => target === root ? installMaintenanceMobileLayoutRescue(target) : 0 },
    { id: 'text-clipping-repair', modes: ['text', 'all'], bucket: 'style', perTarget: true, run: ({ target }) => repairMaintenanceTextClipping(target) },
    { id: 'webkit-3d-flip-compat', modes: ['interaction', 'style', 'all'], bucket: 'style', perTarget: true, run: ({ target }) => installWebKit3DFlipRescue(target) },
    { id: 'interaction-id-scope', modes: ['source', 'interaction', 'style', 'all'], bucket: 'scope', perTarget: true, run: ({ target }) => { scopeRabbitMirrorInteractionIds(target); return 1; } },
    { id: 'complete-interaction-library', modes: ['interaction', 'all'], bucket: 'interaction', perTarget: true, run: ({ target }) => {
        // installIntelligentInteractionRescue 内部包含旧库全部已验证路线：
        // 原始安全状态程序、自变化、checked/change、focus→checked、状态层、相邻隐藏组、
        // label 内隐藏、label 后置结果、CSS 状态兄弟、按钮/可点击后置内容、弹层、遮罩、
        // 列表详情、ID 目标显隐、叠层正文互斥、无 label focus-within 持久桥接、
        // data-active/class 状态程序、Touch Hover 与 label fallback。
        const radioGroupCountBefore = Number.parseInt(target.getAttribute?.(RADIO_GROUP_ROOT_ATTR) || '0', 10) || 0;
        scopeRabbitMirrorInteractionIds(target);
        const overlayCountBefore = target.querySelectorAll?.(`[${DECORATIVE_OVERLAY_PASS_THROUGH_ATTR}]`)?.length || 0;
        const rawHoverCountBefore = Number.parseInt(target.dataset?.rabbitMirrorRawHoverFallback || '0', 10) || 0;
        const recoveredProgramCountBefore = recoveredInlineStateProgramCount(target);
        const disabledChoiceRepairCount = installDisabledOnlyChoiceFallback(target);
        installIntelligentInteractionRescue(target);
        const overlayCountAfter = target.querySelectorAll?.(`[${DECORATIVE_OVERLAY_PASS_THROUGH_ATTR}]`)?.length || 0;
        const rawHoverCountAfter = Number.parseInt(target.dataset?.rabbitMirrorRawHoverFallback || '0', 10) || 0;
        const recoveredProgramCountAfter = recoveredInlineStateProgramCount(target);
        const radioGroupCountAfter = Number.parseInt(target.getAttribute?.(RADIO_GROUP_ROOT_ATTR) || '0', 10) || 0;
        const radioGroupRepairCount = Math.max(0, radioGroupCountAfter - radioGroupCountBefore);
        const overlayRepairCount = Math.max(0, overlayCountAfter - overlayCountBefore);
        const rawHoverRepairCount = Math.max(0, rawHoverCountAfter - rawHoverCountBefore);
        const recoveredProgramRepairCount = Math.max(0, recoveredProgramCountAfter - recoveredProgramCountBefore);
        const crossParentCheckedCount = Number.parseInt(target.getAttribute?.(CROSS_PARENT_CHECKED_ROOT_ATTR) || '0', 10) || 0;
        const labeledCheckedVerifyCount = Number.parseInt(target.getAttribute?.(LABELED_CHECKED_VERIFY_ROOT_ATTR) || '0', 10) || 0;
        const checkedHasStateCount = Number.parseInt(target.getAttribute?.(CHECKED_HAS_STATE_RULE_COUNT_ATTR) || '0', 10) || 0;
        const detachedCheckedHasCount = Number.parseInt(target.getAttribute?.(DETACHED_CHECKED_HAS_RULE_COUNT_ATTR) || '0', 10) || 0;
        const pairedCheckedStateCount = Number.parseInt(target.getAttribute?.(PAIRED_CHECKED_STATE_COUNT_ATTR) || '0', 10) || 0;
        const exclusiveStackedStateCount = Number.parseInt(target.getAttribute?.(EXCLUSIVE_STACKED_STATE_COUNT_ATTR) || '0', 10) || 0;
        const channelDialCycleCount = Number.parseInt(target.getAttribute?.(CHANNEL_DIAL_CYCLE_COUNT_ATTR) || '0', 10) || 0;
        const reversibleCheckedCount = Number.parseInt(target.getAttribute?.(REVERSIBLE_CHECKED_RESULT_ROOT_ATTR) || '0', 10) || 0;
        const focusWithinPersistentCount = Number.parseInt(target.getAttribute?.(FOCUS_WITHIN_PERSISTENT_ROOT_ATTR) || '0', 10) || 0;
        const selectionFallbackCount = installSelectionOnlyStateFallback(target);
        const inertActionRepairCount = installInertActionButtonFallback(target);
        const staticChoiceRepairCount = installStaticChoiceSelectionFallback(target);
        const structuredStaticDisclosureRepairCount = installStructuredStaticDisclosureFallback(target);
        const fillInChoiceRepairCount = installFillInChoiceFallback(target);
        const disabledChoiceCount = target.querySelectorAll?.(`[${DISABLED_ONLY_CHOICE_RESCUE_ATTR}]`)?.length || 0;
        const inertActionCount = target.querySelectorAll?.(`[${INERT_ACTION_BUTTON_RESCUE_ATTR}]`)?.length || 0;
        const staticChoiceCount = Number.parseInt(target.getAttribute?.(STATIC_CHOICE_SELECTION_COUNT_ATTR) || '0', 10) || 0;
        const structuredStaticDisclosureCount = Number.parseInt(target.getAttribute?.(STRUCTURED_STATIC_DISCLOSURE_COUNT_ATTR) || '0', 10) || 0;
        const fillInChoiceCount = Number.parseInt(target.getAttribute?.(FILL_IN_CHOICE_COUNT_ATTR) || '0', 10) || 0;
        detectInteractionCapabilities(target);
        const depthAfter = maintenanceCheckedInteractionDepth(target);
        const meaningfulCheckedRoute = depthAfter.checkedRuleCount > 0 && !depthAfter.checkedSelectionOnly;
        const genuinelyRescued = selectionFallbackCount > 0
            || disabledChoiceRepairCount > 0
            || inertActionRepairCount > 0
            || staticChoiceRepairCount > 0
            || structuredStaticDisclosureRepairCount > 0
            || fillInChoiceRepairCount > 0
            || disabledChoiceCount > 0
            || inertActionCount > 0
            || staticChoiceCount > 0
            || structuredStaticDisclosureCount > 0
            || fillInChoiceCount > 0
            || overlayRepairCount > 0
            || rawHoverRepairCount > 0
            || recoveredProgramRepairCount > 0
            || recoveredProgramCountAfter > 0
            || radioGroupRepairCount > 0
            || radioGroupCountAfter > 0
            || crossParentCheckedCount > 0
            || labeledCheckedVerifyCount > 0
            || checkedHasStateCount > 0
            || detachedCheckedHasCount > 0
            || pairedCheckedStateCount > 0
            || exclusiveStackedStateCount > 0
            || channelDialCycleCount > 0
            || reversibleCheckedCount > 0
            || focusWithinPersistentCount > 0
            || meaningfulCheckedRoute;
        if (genuinelyRescued) target.dataset.rabbitMirrorInteractionRescued = 'true';
        else delete target.dataset.rabbitMirrorInteractionRescued;
        const routes = String(target.dataset.rabbitMirrorInteractionRoutes || '')
            .split(',')
            .map(item => item.trim())
            .filter(item => item && item !== 'none');
        // 不再把“调用了总入口”冒充为“命中了一条急救路线”；选择样式专用结构只有在安全补出分支提示后才算修复。
        return genuinelyRescued ? Math.max(routes.length, disabledChoiceRepairCount, inertActionRepairCount, staticChoiceRepairCount, structuredStaticDisclosureRepairCount, fillInChoiceRepairCount, disabledChoiceCount, inertActionCount, staticChoiceCount, structuredStaticDisclosureCount, fillInChoiceCount, overlayRepairCount, rawHoverRepairCount, recoveredProgramRepairCount, recoveredProgramCountAfter, radioGroupRepairCount, radioGroupCountAfter, crossParentCheckedCount, labeledCheckedVerifyCount, checkedHasStateCount, detachedCheckedHasCount, pairedCheckedStateCount, exclusiveStackedStateCount, channelDialCycleCount, reversibleCheckedCount, focusWithinPersistentCount) : 0;
    } },
]);

function createMaintenanceLibraryResult(mode) {
    return {
        version: MAINTENANCE_RESCUE_MODULE_VERSION,
        mode,
        code: 0,
        plainText: 0,
        interaction: 0,
        style: 0,
        scope: 0,
        executed: [],
        skipped: [],
        failed: [],
    };
}

function runMaintenanceRescueModule(module, context, result) {
    try {
        const count = Number(module.run(context)) || 0;
        result[module.bucket] = (Number(result[module.bucket]) || 0) + count;
        result.executed.push({ id: module.id, count });
    } catch (error) {
        result.failed.push({ id: module.id, message: String(error?.message || error || 'unknown error') });
        console.debug(`[RabbitMirror] maintenance module ${module.id} skipped:`, error);
    }
}

function runMaintenanceLegacyRescueLibrary(root, mode = 'all') {
    const result = createMaintenanceLibraryResult(mode);
    if (!root?.isConnected) return result;
    const independent = isIndependentMaintenanceRoot(root);
    const messageScope = independent
        ? exactIndependentMaintenanceRoot(root)
        : (root.closest?.('[data-rabbit-mirror-external-shell], [data-rabbit-mirror-external-source], .mes, [mesid], [data-message-id], [data-messageid]') || root);
    const liveRoots = independent ? [exactIndependentMaintenanceRoot(root)] : getRenderedRabbitMirrorInteractionRoots(messageScope);
    // 副 API镜面永远只维修自己；不能让任何全局源码／DOM急救器扫到聊天正文。
    const targets = independent ? [exactIndependentMaintenanceRoot(root)] : (mode === 'text' ? [root] : (liveRoots.length ? liveRoots : [root]));

    for (const module of MAINTENANCE_RESCUE_LIBRARY) {
        if (!module.modes.includes(mode) || (independent && ['code-block-dom', 'plain-text-dom', 'rendered-details-dom'].includes(module.id))) {
            result.skipped.push(module.id);
            continue;
        }
        if (module.perTarget) {
            for (const target of targets) {
                if (!target?.isConnected) continue;
                runMaintenanceRescueModule(module, { root, target, messageScope, mode }, result);
            }
        } else {
            runMaintenanceRescueModule(module, { root, messageScope, mode }, result);
        }
    }
    return result;
}


function mergeMaintenanceLibraryResult(target, addition, label = '') {
    if (!target || !addition) return target;
    for (const bucket of ['code', 'plainText', 'interaction', 'style', 'scope']) {
        target[bucket] = (Number(target[bucket]) || 0) + (Number(addition[bucket]) || 0);
    }
    target.executed = [...(target.executed || []), ...(addition.executed || [])];
    target.failed = [...(target.failed || []), ...(addition.failed || [])];
    if (label) target.followup = label;
    return target;
}

function runMaintenanceSourceInteractionFollowup(root) {
    if (!root?.isConnected) return null;
    const inspection = inspectMaintenanceRabbit(root);
    const interaction = inspection?.interaction || {};
    const shouldRepair = interaction.strippedStateProgram
        || interaction.checkedControlsLost
        || interaction.decorativeOverlayCandidateCount > 0
        || interaction.touchHoverMissing
        || interaction.needsScopeRepair
        || interaction.missingCheckedSubjectClassMissingCount > 0
        || interaction.radioGroupLossCandidateCount > 0
        || interaction.selectionOnlyRepairCandidateCount > 0
        || interaction.disabledOnlyChoiceCandidateCount > 0
        || interaction.inertActionButtonCandidateCount > 0
        || interaction.staticChoiceSelectionCandidateCount > 0
        || interaction.structuredStaticDisclosureCandidateCount > 0
        || interaction.fillInChoiceCandidateCount > 0
        || interaction.focusWithinPersistentMissingCount > 0
        || interaction.oneWayCheckedResultCandidateCount > 0;
    if (!shouldRepair) return null;

    const module = MAINTENANCE_RESCUE_LIBRARY.find(item => item.id === 'complete-interaction-library');
    if (!module) return null;
    const result = createMaintenanceLibraryResult('source-interaction-followup');
    runMaintenanceRescueModule(module, { root, target: root, messageScope: root, mode: 'interaction' }, result);
    return result;
}

function scheduleMaintenanceScopedFollowups(root, summaryText, messageIndex, mode) {
    const sourceModes = new Set(['source', 'code', 'plainText', 'style', 'all']);
    for (const delay of [80, 350, 900, 1800]) {
        setTimeout(() => {
            const liveRoot = findLiveMaintenanceRoot(root, summaryText, messageIndex);
            if (!liveRoot?.isConnected) return;
            const inspection = maintenanceUserRepairInspection(liveRoot, mode);
            const sourceResult = sourceModes.has(mode)
                ? repairMaintenanceMessageSource(liveRoot, inspection)
                : { changed: false };
            const runLibrary = () => {
                const latestRoot = findLiveMaintenanceRoot(liveRoot, summaryText, messageIndex) || liveRoot;
                if (!latestRoot?.isConnected) return;
                runMaintenanceLegacyRescueLibrary(latestRoot, mode);
                if (sourceResult.changed && mode === 'source') runMaintenanceSourceInteractionFollowup(latestRoot);
                installMaintenanceRabbitForRoot(latestRoot);
                notifyIndependentRepairPersistence(latestRoot);
            };
            if (sourceResult.changed) setTimeout(runLibrary, 60);
            else runLibrary();
        }, delay);
    }
}


function maintenanceRepairPlanLabel(plan) {
    const labels = { source: '源码', style: '结构／样式', text: '排版／显示', interaction: '交互' };
    return (plan || []).map(mode => labels[mode] || mode).join(' → ');
}

function compareMaintenanceFindings(beforeFindings, afterFindings) {
    const beforeMap = new Map((beforeFindings || []).map(finding => [maintenanceFindingKey(finding), finding]));
    const afterMap = new Map((afterFindings || []).map(finding => [maintenanceFindingKey(finding), finding]));
    const resolved = [...beforeMap.entries()].filter(([key]) => !afterMap.has(key)).map(([, finding]) => finding);
    const remaining = [...afterMap.values()];
    const introduced = [...afterMap.entries()].filter(([key]) => !beforeMap.has(key)).map(([, finding]) => finding);
    return { resolved, remaining, introduced };
}

function notifyIndependentRepairPersistence(root) {
    const host = root?.closest?.('[data-rabbit-mirror-external-source="true"][data-rm-source="independent"]');
    if (!host?.isConnected || typeof document === 'undefined' || typeof CustomEvent === 'undefined') return false;
    document.dispatchEvent(new CustomEvent(INDEPENDENT_REPAIR_PERSIST_EVENT, { detail: { root, host } }));
    return true;
}

function runMaintenanceAutomaticRepairPlan(root, button) {
    if (!root?.isConnected || !button?.isConnected) return false;
    const initialInspection = inspectMaintenanceRabbit(root);
    const initialFindings = initialInspection.findings || [];
    const initialPlan = maintenanceRepairModesForFindings(initialFindings);
    if (!initialPlan.length) {
        const state = initialInspection.state === MAINTENANCE_STATES.unknown
            ? MAINTENANCE_STATES.unknown
            : initialInspection.state;
        setMaintenanceRabbitState(button, state, initialInspection.reason || '未发现可自动维修的高置信问题');
        return false;
    }
    const captured = captureMaintenancePreRepairSnapshot(root);
    if (captured) {
        root = captured.root || root;
        button = captured.button || root.querySelector?.(`[${MAINTENANCE_RABBIT_ATTR}]`) || button;
    }

    const summaryText = getRabbitMirrorSummaryText(root).replace(/🐇[⚪🟢🟡🔴]?/g, '').trim();
    const originalIndex = getMessageIndexFromMirrorNode(root);
    const aggregate = createMaintenanceLibraryResult('auto-plan');
    aggregate.repairOrder = [...initialPlan];
    aggregate.findingsBefore = maintenanceFindingSnapshot(initialFindings);
    const discoveredFindings = new Map(initialFindings.map(finding => [maintenanceFindingKey(finding), finding]));
    aggregate.stepResults = [];
    aggregate.sourceRepairs = [];
    const attemptedModes = new Set();
    let currentRoot = root;

    setMaintenanceRabbitState(
        button,
        MAINTENANCE_STATES.checking,
        `检测到 ${initialFindings.length} 项问题，正在按顺序维修：${maintenanceRepairPlanLabel(initialPlan)}`,
    );

    const locateCurrentRoot = () => findLiveMaintenanceRoot(currentRoot, summaryText, originalIndex) || currentRoot;

    const finalize = () => {
        const liveRoot = locateCurrentRoot();
        const liveButton = liveRoot?.querySelector?.(`[${MAINTENANCE_RABBIT_ATTR}]`) || button;
        if (!liveRoot?.isConnected) {
            setMaintenanceRabbitState(liveButton, MAINTENANCE_STATES.unknown, '维修后无法重新定位当前兔子镜');
            return;
        }
        const afterInspection = inspectMaintenanceRabbit(liveRoot);
        for (const finding of afterInspection.findings || []) discoveredFindings.set(maintenanceFindingKey(finding), finding);
        const comparison = compareMaintenanceFindings([...discoveredFindings.values()], afterInspection.findings || []);
        aggregate.findingsAfter = maintenanceFindingSnapshot(afterInspection.findings || []);
        aggregate.verification = {
            resolved: maintenanceFindingSnapshot(comparison.resolved),
            remaining: maintenanceFindingSnapshot(comparison.remaining),
            introduced: maintenanceFindingSnapshot(comparison.introduced),
        };
        aggregate.autoSelected = 'multi-plan';
        aggregate.mode = 'auto-plan';
        aggregate.sourceRepair = aggregate.sourceRepairs[0] || { attempted: false, changed: false, reason: '' };
        liveRoot.dataset.rabbitMirrorMaintenanceModules = JSON.stringify(aggregate);
        if (afterInspection.full?.sourceTruncationNoticeInstalled) liveButton.removeAttribute(MAINTENANCE_REPAIR_ATTR);
        else liveButton.setAttribute(MAINTENANCE_REPAIR_ATTR, 'true');

        const resolvedLabels = comparison.resolved.map(item => item.label);
        const remainingLabels = comparison.remaining.map(item => item.label);
        if (afterInspection.full?.sourceTruncationNoticeInstalled) {
            setMaintenanceRabbitState(liveButton, MAINTENANCE_STATES.unknown, '本次生成不完整，未计为修复成功；请重新生成该条');
        } else if (remainingLabels.length) {
            const resolvedText = resolvedLabels.length ? `已验证修复 ${resolvedLabels.length} 项：${resolvedLabels.join('、')}；` : '尚未验证任何问题已消失；';
            setMaintenanceRabbitState(
                liveButton,
                MAINTENANCE_STATES.repairable,
                `${resolvedText}仍有 ${remainingLabels.length} 项：${remainingLabels.join('；')}`,
            );
        } else if (afterInspection.state === MAINTENANCE_STATES.unknown) {
            setMaintenanceRabbitState(
                liveButton,
                MAINTENANCE_STATES.unknown,
                `已验证修复 ${resolvedLabels.length} 项；仍无法安全确认：${afterInspection.reason}`,
            );
        } else {
            setMaintenanceRabbitState(
                liveButton,
                MAINTENANCE_STATES.idle,
                `已按顺序维修并验证 ${resolvedLabels.length} 项：${resolvedLabels.join('、') || '未发现剩余高置信异常'}`,
            );
        }

        notifyIndependentRepairPersistence(liveRoot);

        // 宿主可能在维修后稍晚重绘；再做一次只读复核，若问题重新出现则恢复黄灯。
        setTimeout(() => {
            const verifyRoot = findLiveMaintenanceRoot(liveRoot, summaryText, originalIndex) || liveRoot;
            const verifyButton = verifyRoot?.querySelector?.(`[${MAINTENANCE_RABBIT_ATTR}]`) || liveButton;
            if (!verifyRoot?.isConnected || !verifyButton?.isConnected) return;
            const lateInspection = inspectMaintenanceRabbit(verifyRoot);
            if ((lateInspection.findings || []).length) {
                setMaintenanceRabbitState(
                    verifyButton,
                    MAINTENANCE_STATES.repairable,
                    `延迟复核仍检测到 ${(lateInspection.findings || []).length} 项：${maintenanceFindingReason(lateInspection.findings || [])}`,
                );
            }
        }, 1100);
    };

    const runNextStep = () => {
        const liveRoot = locateCurrentRoot();
        if (!liveRoot?.isConnected) {
            finalize();
            return;
        }
        currentRoot = liveRoot;
        const currentInspection = inspectMaintenanceRabbit(liveRoot);
        for (const finding of currentInspection.findings || []) discoveredFindings.set(maintenanceFindingKey(finding), finding);
        const currentPlan = maintenanceRepairModesForFindings(currentInspection.findings || []);
        const discoveredPlan = maintenanceRepairModesForFindings([...discoveredFindings.values()]);
        const candidatePlan = [...currentPlan, ...discoveredPlan.filter(mode => !currentPlan.includes(mode))];
        const nextMode = candidatePlan.find(mode => !attemptedModes.has(mode));
        if (!nextMode) {
            finalize();
            return;
        }
        attemptedModes.add(nextMode);
        if (!aggregate.repairOrder.includes(nextMode)) aggregate.repairOrder.push(nextMode);
        const stepBefore = maintenanceFindingSnapshot(currentInspection.findings || []);
        const step = { mode: nextMode, before: stepBefore, sourceRepair: null, modules: null };
        aggregate.stepResults.push(step);

        const executeLibrary = () => {
            const latestRoot = locateCurrentRoot();
            if (!latestRoot?.isConnected) {
                finalize();
                return;
            }
            currentRoot = latestRoot;
            const libraryResult = runMaintenanceLegacyRescueLibrary(latestRoot, nextMode);
            mergeMaintenanceLibraryResult(aggregate, libraryResult, nextMode);
            step.modules = {
                executed: [...(libraryResult.executed || [])],
                failed: [...(libraryResult.failed || [])],
            };
            setTimeout(() => {
                const afterStepRoot = locateCurrentRoot();
                const afterStepInspection = afterStepRoot?.isConnected ? inspectMaintenanceRabbit(afterStepRoot) : { findings: [] };
                step.after = maintenanceFindingSnapshot(afterStepInspection.findings || []);
                runNextStep();
            }, 180);
        };

        if (nextMode === 'source') {
            const sourceInspection = maintenanceUserRepairInspection(liveRoot, 'source');
            const sourceResult = repairMaintenanceMessageSource(liveRoot, sourceInspection);
            step.sourceRepair = {
                attempted: true,
                changed: !!sourceResult.changed,
                noticeShown: !!sourceResult.noticeShown,
                unrecoverable: !!sourceResult.unrecoverable,
                reason: String(sourceResult.reason || ''),
            };
            aggregate.sourceRepairs.push(step.sourceRepair);
            if (sourceResult.changed) setTimeout(executeLibrary, 220);
            else executeLibrary();
        } else {
            executeLibrary();
        }
    };

    runNextStep();
    return true;
}

function maintenanceAutoSafeCountAttribute(root, attribute) {
    return Number.parseInt(root?.getAttribute?.(attribute) || '0', 10) || 0;
}


function captureMaintenanceAutoSafeUiState(root) {
    if (!root?.querySelectorAll) return null;
    return {
        controls: [...root.querySelectorAll('input[type="checkbox"], input[type="radio"]')].map(control => ({
            control,
            checked: !!control.checked,
            defaultChecked: !!control.defaultChecked,
        })),
        details: [...root.querySelectorAll('details')].map(details => ({ details, open: !!details.open })),
    };
}

function restoreMaintenanceAutoSafeUiState(snapshot) {
    if (!snapshot) return;
    for (const item of snapshot.controls || []) {
        if (!item.control?.isConnected) continue;
        // 自动巡逻只允许补结构，不得替用户选择、取消或切换任何状态。
        item.control.checked = item.checked;
        item.control.defaultChecked = item.defaultChecked;
    }
    for (const item of snapshot.details || []) {
        if (!item.details?.isConnected) continue;
        item.details.open = item.open;
    }
}

function runMaintenanceSafeAutomaticRepairs(root, button) {
    if (!root?.isConnected || !button?.isConnected) return { repaired: 0, modules: [] };
    const uiStateSnapshot = captureMaintenanceAutoSafeUiState(root);
    const modules = [];
    const add = (id, count) => {
        const value = Math.max(0, Number(count) || 0);
        if (value > 0) modules.push({ id, count: value });
        return value;
    };
    let repaired = 0;
    setMaintenanceRabbitState(button, MAINTENANCE_STATES.checking, '自动巡逻：正在执行不改变展开状态的安全修复');

    try {
        const beforeScoped = root.dataset?.rabbitMirrorInteractionScoped === 'true';
        const beforeRadioGroups = maintenanceAutoSafeCountAttribute(root, RADIO_GROUP_ROOT_ATTR);
        const scopeResult = root.querySelector?.('input[id], label[for]')
            ? scopeRabbitMirrorInteractionIds(root, { installRescue: false })
            : null;
        const afterScoped = root.dataset?.rabbitMirrorInteractionScoped === 'true';
        const afterRadioGroups = maintenanceAutoSafeCountAttribute(root, RADIO_GROUP_ROOT_ATTR);
        if (!beforeScoped && afterScoped && Number(scopeResult?.scopedIdCount || 0) > 0) repaired += add('interaction-id-scope', 1);
        repaired += add('radio-group-local-scope', Math.max(0, afterRadioGroups - beforeRadioGroups));
    } catch (error) {
        console.debug('[RabbitMirror] auto-safe ID/radio repair skipped:', error);
    }

    // 自动模式只运行不会显隐正文、不会写入当前选择状态的结构型模块。
    // focus-within / cross-parent / :has() 等视觉状态桥接仍保留给手动维修，
    // 避免误判时把所有第二层内容提前展开或锁死交互。
    const safeInstallers = [
        ['radio-reset-local-scope', installRawMessageRadioResetProgramRescue],
        ['missing-checked-control-class', installMissingCheckedSubjectClassRescue],
        ['webkit-3d-flip-compat', installWebKit3DFlipRescue],
    ];
    for (const [id, installer] of safeInstallers) {
        try {
            repaired += add(id, installer(root));
        } catch (error) {
            console.debug(`[RabbitMirror] auto-safe module ${id} skipped:`, error);
        }
    }

    // 无论模块内部发生什么，自动巡逻结束时都恢复用户原有的 checked/open 状态。
    restoreMaintenanceAutoSafeUiState(uiStateSnapshot);

    const inspection = inspectMaintenanceRabbit(root);
    const payload = {
        version: MAINTENANCE_AUTO_SAFE_VERSION,
        runtime: RUNTIME_VERSION,
        repaired,
        modules,
        statePreserved: true,
        remaining: maintenanceFindingSnapshot(inspection.findings || []),
    };
    root.setAttribute(MAINTENANCE_AUTO_SAFE_ATTR, repaired > 0 ? 'repaired' : 'checked');
    root.setAttribute(MAINTENANCE_AUTO_SAFE_RESULT_ATTR, JSON.stringify(payload));
    if (repaired > 0) button.setAttribute(MAINTENANCE_REPAIR_ATTR, 'true');

    if ((inspection.findings || []).length) {
        const prefix = repaired > 0 ? `已自动完成 ${repaired} 项安全修复；` : '未命中可自动处理的安全项；';
        setMaintenanceRabbitState(button, MAINTENANCE_STATES.repairable, `${prefix}当前展开状态未改变；仍需手动确认：${maintenanceFindingReason(inspection.findings || [])}`);
    } else if (repaired > 0) {
        setMaintenanceRabbitState(button, MAINTENANCE_STATES.healthy, `已自动完成 ${repaired} 项安全修复，未改变当前展开状态：${modules.map(item => item.id).join('、')}`);
    } else {
        setMaintenanceRabbitState(button, inspection.state, inspection.reason || '自动巡逻未发现需要安全修复的问题');
    }
    if (repaired > 0) notifyIndependentRepairPersistence(root);
    return { repaired, modules, inspection };
}

function runMaintenanceUserRepair(root, button, mode) {
    if (!root?.isConnected || !button?.isConnected) return false;
    if (mode === 'auto') return runMaintenanceAutomaticRepairPlan(root, button);
    const captured = captureMaintenancePreRepairSnapshot(root);
    if (captured) {
        root = captured.root || root;
        button = captured.button || root.querySelector?.(`[${MAINTENANCE_RABBIT_ATTR}]`) || button;
    }
    const effectiveMode = mode;
    const labels = {
        auto: '正在自动判断并维修当前兔子镜',
        source: '正在恢复当前兔子镜的代码／纯文字显示',
        interaction: '正在尝试修复当前兔子镜的交互',
        text: '正在修复当前兔子镜的手机端排版与内容显示',
        code: '正在尝试恢复当前兔子镜的代码显示',
        plainText: '正在尝试恢复当前兔子镜的纯文字显示',
        style: '正在尝试修复当前兔子镜的显示样式',
        all: '正在对当前兔子镜执行强制维修',
    };
    setMaintenanceRabbitState(button, MAINTENANCE_STATES.checking, labels[mode] || labels[effectiveMode] || '正在维修当前兔子镜');
    const summaryText = getRabbitMirrorSummaryText(root).replace(/🐇[⚪🟢🟡🔴]?/g, '').trim();
    const originalIndex = getMessageIndexFromMirrorNode(root);
    try {
        const inspection = maintenanceUserRepairInspection(root, effectiveMode);
        const sourceResult = (effectiveMode === 'source' || effectiveMode === 'code' || effectiveMode === 'plainText' || effectiveMode === 'style' || effectiveMode === 'all')
            ? repairMaintenanceMessageSource(root, inspection)
            : { changed: false, index: originalIndex, reason: '' };
        const continueRepair = () => {
            const liveRoot = findLiveMaintenanceRoot(root, summaryText, sourceResult.index >= 0 ? sourceResult.index : originalIndex);
            if (!liveRoot) {
                setMaintenanceRabbitState(button, MAINTENANCE_STATES.unknown, '维修后未找到当前兔子镜，请生成全链路诊断');
                return;
            }
            const liveButton = liveRoot.querySelector?.(`[${MAINTENANCE_RABBIT_ATTR}]`) || button;
            const libraryResult = runMaintenanceLegacyRescueLibrary(liveRoot, effectiveMode);
            if (sourceResult.changed && effectiveMode === 'source') {
                const followupResult = runMaintenanceSourceInteractionFollowup(liveRoot);
                if (followupResult) mergeMaintenanceLibraryResult(libraryResult, followupResult, 'interaction');
            }
            libraryResult.sourceRepair = {
                attempted: effectiveMode === 'source' || effectiveMode === 'code' || effectiveMode === 'plainText' || effectiveMode === 'style' || effectiveMode === 'all',
                changed: !!sourceResult.changed,
                noticeShown: !!sourceResult.noticeShown,
                unrecoverable: !!sourceResult.unrecoverable,
                reason: String(sourceResult.reason || ''),
            };
            liveRoot.dataset.rabbitMirrorMaintenanceModules = JSON.stringify(libraryResult);
            if (sourceResult.unrecoverable) liveButton.removeAttribute(MAINTENANCE_REPAIR_ATTR);
            else liveButton.setAttribute(MAINTENANCE_REPAIR_ATTR, 'true');
            scheduleMaintenanceScopedFollowups(
                liveRoot,
                summaryText,
                sourceResult.index >= 0 ? sourceResult.index : originalIndex,
                effectiveMode,
            );
            setTimeout(() => {
                const afterRoot = findLiveMaintenanceRoot(liveRoot, summaryText, sourceResult.index >= 0 ? sourceResult.index : originalIndex);
                const afterButton = afterRoot?.querySelector?.(`[${MAINTENANCE_RABBIT_ATTR}]`) || liveButton;
                if (!afterRoot) {
                    setMaintenanceRabbitState(afterButton, MAINTENANCE_STATES.unknown, '维修后无法重新定位当前兔子镜');
                    return;
                }
                const after = inspectMaintenanceRabbit(afterRoot);
                if (after.full?.sourceTruncationNoticeInstalled) {
                    afterButton.removeAttribute(MAINTENANCE_REPAIR_ATTR);
                    setMaintenanceRabbitState(afterButton, MAINTENANCE_STATES.unknown, '本次生成不完整，未计为修复成功；请重新生成该条');
                } else if (after.state === MAINTENANCE_STATES.repairable) {
                    setMaintenanceRabbitState(afterButton, MAINTENANCE_STATES.repairable, `已尝试维修，请实际确认；仍检测到：${after.reason}`);
                } else if (after.state === MAINTENANCE_STATES.unknown) {
                    setMaintenanceRabbitState(afterButton, MAINTENANCE_STATES.unknown, `已尝试维修；仍无法安全确认：${after.reason}`);
                } else {
                    const autoNote = mode === 'auto' ? `（自动选择：${effectiveMode}）` : '';
                    setMaintenanceRabbitState(afterButton, MAINTENANCE_STATES.idle, `维修路线已执行${autoNote}，请实际确认是否恢复正常`);
                }
                notifyIndependentRepairPersistence(afterRoot);
            }, 360);
        };
        if (sourceResult.changed) setTimeout(continueRepair, 200);
        else continueRepair();
    } catch (error) {
        console.debug('[RabbitMirror] maintenance user repair failed:', error);
        setMaintenanceRabbitState(button, MAINTENANCE_STATES.unknown, '维修执行失败，请生成全链路诊断');
        return false;
    }
    return true;
}

function maintenanceRecommendationForInspection(inspection) {
    const findings = inspection?.findings || [];
    const plan = maintenanceRepairModesForFindings(findings);
    if (findings.length) {
        return {
            mode: 'auto',
            label: `✨ 自动按顺序维修 ${findings.length} 项`,
            reason: `检测结果：${maintenanceFindingReason(findings)}。维修顺序：${maintenanceRepairPlanLabel(plan)}`,
        };
    }
    if (inspection?.state === MAINTENANCE_STATES.unknown) {
        return { mode: 'diagnostic', label: '📋 生成全链路诊断', reason: '没有足够证据自动选择安全修复路线' };
    }
    return { mode: 'patrol', label: '无需维修', reason: '巡逻未发现高置信异常' };
}

function maintenanceRecommendationText(inspection) {
    const findings = inspection?.findings || [];
    if (findings.length) {
        const labels = [];
        for (const finding of findings) {
            const label = finding?.stage === 'visibility'
                ? '排版／显示'
                : (MAINTENANCE_FINDING_STAGE_LABELS[finding?.stage] || '其他');
            if (!labels.includes(label)) labels.push(label);
        }
        return `检测到 ${findings.length} 项：${labels.join('、')}`;
    }
    if (inspection?.state === MAINTENANCE_STATES.unknown) return '暂无法安全判断，可生成全链路诊断';
    return '未发现高置信异常';
}

function showMaintenanceRabbitMenu(root, button) {
    closeFeedbackCatMenu();
    closeMaintenanceRabbitMenu();
    if (!root?.isConnected || !button?.isConnected) return false;
    const panel = document.createElement('div');
    panel.className = 'rabbit-mirror-maintenance-menu';
    panel.setAttribute(MAINTENANCE_MENU_ATTR, 'true');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '维修兔');
    const patrolInspection = inspectMaintenanceRabbit(root);
    const recommendation = maintenanceRecommendationForInspection(patrolInspection);
    panel.innerHTML = `
      <div class="rabbit-mirror-maintenance-menu-title">🐇 这面兔子镜哪里不对？</div>
      <div class="rabbit-mirror-maintenance-recommendation" data-rm-recommended-action="${recommendation.mode}">${maintenanceRecommendationText(patrolInspection)}</div>
      <button type="button" data-rm-maintenance-action="auto">✨ 自动判断并维修（推荐）</button>
      <button type="button" data-rm-maintenance-action="patrol">🔍 只巡逻，不修改</button>
      <button type="button" data-rm-maintenance-action="interaction">🖱️ 点了没有反应</button>
      <button type="button" data-rm-maintenance-action="text">📱 排版不适配／内容显示不全</button>
      <button type="button" data-rm-maintenance-action="source">📄 空白或显示代码、纯文字</button>
      <button type="button" data-rm-maintenance-action="style">🎨 样子不对</button>
      <button type="button" data-rm-maintenance-action="all">🔧 全部试试（仅当前兔子镜）</button>
      <button type="button" data-rm-maintenance-action="restore-before" ${maintenancePreRepairSnapshots.has(maintenanceSnapshotKey(root)) ? '' : 'disabled'}>↩️ 返回修复前</button>
      <button type="button" data-rm-maintenance-action="diagnostic">📋 生成全链路诊断</button>
      <button type="button" data-rm-maintenance-action="close">关闭</button>`;
    document.body.appendChild(panel);
    const rect = button.getBoundingClientRect();
    const width = Math.min(300, Math.max(240, globalThis.innerWidth - 24));
    panel.style.width = `${width}px`;
    const left = Math.max(12, Math.min(rect.left, globalThis.innerWidth - width - 12));
    panel.style.left = `${left}px`;
    panel.style.top = `${Math.min(rect.bottom + 6, globalThis.innerHeight - panel.offsetHeight - 12)}px`;
    panel.addEventListener('click', event => {
        const action = event.target?.closest?.('[data-rm-maintenance-action]')?.getAttribute('data-rm-maintenance-action');
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        closeMaintenanceRabbitMenu();
        if (action === 'close') return;
        if (action === 'restore-before') {
            const restoreSummary = getRabbitMirrorSummaryText(root);
            const restoreIndex = getMessageIndexFromMirrorNode(root);
            if (restoreMaintenancePreRepairSnapshot(root, button)) {
                setTimeout(() => {
                    const restoredRoot = findLiveMaintenanceRoot(root, restoreSummary, restoreIndex);
                    if (restoredRoot) notifyIndependentRepairPersistence(restoredRoot);
                }, 40);
            }
            return;
        }
        if (action === 'patrol') {
            const inspection = inspectMaintenanceRabbit(root);
            setMaintenanceRabbitState(button, inspection.state, `${inspection.reason}；${maintenanceRecommendationText(inspection)}`);
            return;
        }
        if (action === 'diagnostic') {
            triggerDiagnosticForMaintenanceRoot(root);
            return;
        }
        runMaintenanceUserRepair(root, button, action);
    }, true);
    setTimeout(() => {
        const closeOnOutside = event => {
            if (!panel.isConnected) {
                document.removeEventListener('pointerdown', closeOnOutside, true);
                return;
            }
            if (!panel.contains(event.target) && event.target !== button) {
                closeMaintenanceRabbitMenu();
                document.removeEventListener('pointerdown', closeOnOutside, true);
            }
        };
        document.addEventListener('pointerdown', closeOnOutside, true);
    }, 0);
    return true;
}

function handleMaintenanceRabbitClick(event, root, button) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (rabbitMirrorExternalGenerationNotice(root, 'maintenance')) return;
    showMaintenanceRabbitMenu(root, button);
}

function setImportantStyle(element, property, value) {
    if (!element?.style) return false;
    if (element.style.getPropertyValue(property) === value && element.style.getPropertyPriority(property) === 'important') return false;
    element.style.setProperty(property, value, 'important');
    return true;
}

function normalizeRabbitMirrorToolHost(host) {
    if (!host) return false;
    host.hidden = false;
    host.removeAttribute?.('aria-hidden');
    host.setAttribute(TOOL_ENTRY_HOST_ATTR, 'true');
    host.setAttribute(RUNTIME_VERSION_ATTR, RUNTIME_VERSION);
    host.setAttribute('role', 'group');
    host.setAttribute('aria-label', '兔子镜工具');
    const styles = {
        all: 'initial', display: 'inline-flex', 'align-items': 'center', 'justify-content': 'flex-end', gap: '2px',
        float: 'inline-end', flex: '0 0 auto', position: 'relative', 'z-index': '2147483000', width: 'auto',
        'min-width': '0', height: 'auto', 'min-height': '0', 'max-width': 'none', 'max-height': 'none',
        margin: '0 0 0 6px', 'margin-inline-start': 'auto', padding: '0', overflow: 'visible', visibility: 'visible', opacity: '1',
        'pointer-events': 'auto', transform: 'none', filter: 'none', clip: 'auto', 'clip-path': 'none',
        'white-space': 'nowrap', 'vertical-align': 'middle', color: 'inherit', font: 'inherit', 'line-height': '1',
        isolation: 'isolate',
    };
    let changed = false;
    for (const [property, value] of Object.entries(styles)) changed = setImportantStyle(host, property, value) || changed;
    return changed;
}

function normalizeRabbitMirrorToolButton(button) {
    if (!button) return false;
    button.hidden = false;
    button.disabled = false;
    button.removeAttribute?.('aria-hidden');
    button.tabIndex = 0;
    const styles = {
        all: 'initial', display: 'inline-flex', 'align-items': 'center', 'justify-content': 'center', position: 'relative',
        'z-index': '2147483001', flex: '0 0 auto', width: 'auto', 'min-width': '0', height: 'auto',
        'min-height': '20px', 'max-width': 'none', 'max-height': 'none', margin: '0', padding: '1px 3px', border: '0',
        'border-radius': '5px', background: 'transparent', color: 'inherit', font: 'inherit', 'font-size': '14px',
        'line-height': '1', 'text-indent': '0', 'letter-spacing': 'normal', 'white-space': 'nowrap', overflow: 'visible',
        visibility: 'visible', opacity: '.94', 'pointer-events': 'auto', cursor: 'pointer', transform: 'none', filter: 'none',
        clip: 'auto', 'clip-path': 'none', 'box-shadow': 'none', appearance: 'none', '-webkit-appearance': 'none',
        'touch-action': 'manipulation', '-webkit-tap-highlight-color': 'transparent',
    };
    let changed = false;
    for (const [property, value] of Object.entries(styles)) changed = setImportantStyle(button, property, value) || changed;
    return changed;
}

function ensureRabbitMirrorToolHost(summary) {
    if (!summary?.querySelectorAll) return null;
    ensureFeedbackCatRuntimeStyle();
    const hosts = [...summary.querySelectorAll(`:scope > [${TOOL_ENTRY_HOST_ATTR}]`)];
    let host = hosts.find(item => item.getAttribute(RUNTIME_VERSION_ATTR) === RUNTIME_VERSION) || hosts[0] || null;
    hosts.filter(item => item !== host).forEach(item => item.remove());
    if (!host) {
        host = document.createElement('span');
        summary.appendChild(host);
    }
    normalizeRabbitMirrorToolHost(host);
    return host;
}

function rabbitMirrorToolRootFromButton(button) {
    if (!button?.closest) return null;
    const toto = button.closest(MIRROR_TOTO_SELECTOR);
    if (toto && isInsideChatMessage(toto)) return toto;
    const details = button.closest('details');
    if (details && isRabbitMirrorDetails(details) && isInsideChatMessage(details)) return details;
    return null;
}

function ensureMaintenanceRabbitButton(root, summary, host) {
    const existing = [...summary.querySelectorAll?.(`[${MAINTENANCE_RABBIT_ATTR}]`) || []];
    let current = existing.find(button => button.getAttribute(RUNTIME_VERSION_ATTR) === RUNTIME_VERSION) || existing[0] || null;
    existing.filter(button => button !== current).forEach(button => button.remove());
    if (!current) {
        current = document.createElement('button');
        current.type = 'button';
        current.className = 'rabbit-mirror-maintenance-rabbit';
        current.setAttribute(MAINTENANCE_RABBIT_ATTR, 'true');
        current.setAttribute(MAINTENANCE_STATE_ATTR, MAINTENANCE_STATES.idle);
    }
    current.type = 'button';
    current.className = 'rabbit-mirror-maintenance-rabbit';
    current.setAttribute(MAINTENANCE_RABBIT_ATTR, 'true');
    current.setAttribute(RUNTIME_VERSION_ATTR, RUNTIME_VERSION);
    if (current.parentElement !== host) host.appendChild(current);
    const externalState = rabbitMirrorExternalGenerationState(root);
    if (externalState === 'loading') {
        setMaintenanceRabbitState(current, MAINTENANCE_STATES.checking, '兔子镜正在生成中');
        current.setAttribute('data-rabbit-mirror-external-waiting', 'true');
    } else if (externalState === 'error') {
        setMaintenanceRabbitState(current, MAINTENANCE_STATES.unknown, '独立 API 生成失败；失败原因已显示在兔子镜内');
        current.removeAttribute('data-rabbit-mirror-external-waiting');
    } else {
        const wasWaiting = current.hasAttribute('data-rabbit-mirror-external-waiting');
        current.removeAttribute('data-rabbit-mirror-external-waiting');
        if (wasWaiting) {
            setMaintenanceRabbitState(current, MAINTENANCE_STATES.idle, '兔子镜生成完成，可点击巡逻');
        } else {
            const state = current.getAttribute(MAINTENANCE_STATE_ATTR) || MAINTENANCE_STATES.idle;
            const reason = current.getAttribute(MAINTENANCE_REASON_ATTR) || '';
            setMaintenanceRabbitState(current, state, reason);
        }
    }
    return current;
}

function stampFeedbackCatIndependentOwner(button, owner) {
    if (!button) return;
    const attributes = {
        rmFeedbackOwnerSource: owner ? 'independent' : '',
        rmFeedbackOwnerChat: String(owner?.chat || ''),
        rmFeedbackOwnerMesid: Number.isInteger(owner?.mesid) && owner.mesid >= 0 ? String(owner.mesid) : '',
        rmFeedbackOwnerSwipe: Number.isInteger(owner?.swipe) && owner.swipe >= 0 ? String(owner.swipe) : '',
        rmFeedbackOwnerKey: String(owner?.key || ''),
        rmFeedbackOwnerSourceHash: String(owner?.sourceHash || ''),
    };
    for (const [name, value] of Object.entries(attributes)) {
        if (value) button.dataset[name] = value;
        else delete button.dataset[name];
    }
}

function ensureFeedbackCatButton(root, summary, host) {
    const existing = [...summary.querySelectorAll?.(`[${FEEDBACK_CAT_ATTR}]`) || []];
    let current = existing.find(button => button.getAttribute(RUNTIME_VERSION_ATTR) === RUNTIME_VERSION) || existing[0] || null;
    existing.filter(button => button !== current).forEach(button => button.remove());
    if (!current) current = document.createElement('button');
    current.type = 'button';
    current.className = 'rabbit-mirror-feedback-cat';
    current.setAttribute(FEEDBACK_CAT_ATTR, 'true');
    current.setAttribute(RUNTIME_VERSION_ATTR, RUNTIME_VERSION);
    current.textContent = '🐈';
    const externalState = rabbitMirrorExternalGenerationState(root);
    current.title = externalState === 'loading'
        ? '挨打猫：兔子镜正在生成中，生成完成后可反馈'
        : feedbackCatButtonTitle();
    current.setAttribute('aria-label', current.title);
    if (externalState === 'loading') current.setAttribute('data-rabbit-mirror-external-waiting', 'true');
    else current.removeAttribute('data-rabbit-mirror-external-waiting');
    if (current.parentElement !== host) host.appendChild(current);
    // Keep a second copy of the independent owner identity directly on the cat
    // button. Some themes move/clone the tool host after it was installed; the
    // button metadata survives that move and lets “重说/历史” resolve the exact
    // chat + message + Swipe even when the external shell is no longer an ancestor.
    stampFeedbackCatIndependentOwner(current, feedbackCatIndependentOwner(root));
    normalizeRabbitMirrorToolButton(current);
    return current;
}

function installMaintenanceRabbitForRoot(root) {
    if (!isCurrentRuntime() || !root?.querySelector) return false;
    clearOrphanedStructuredStaticDisclosureArtifacts(root);
    const details = root.matches?.('details') ? root : root.querySelector(':scope > details') || root.querySelector('details');
    const summary = details?.querySelector?.(':scope > summary') || details?.querySelector?.('summary');
    if (!summary) return false;
    const host = ensureRabbitMirrorToolHost(summary);
    if (!host) return false;
    ensureMaintenanceRabbitButton(root, summary, host);
    return true;
}

function installFeedbackCatForRoot(root) {
    if (!isCurrentRuntime() || !root?.querySelector) return false;
    const details = root.matches?.('details') ? root : root.querySelector(':scope > details') || root.querySelector('details');
    const summary = details?.querySelector?.(':scope > summary') || details?.querySelector?.('summary');
    if (!summary) return false;
    const host = ensureRabbitMirrorToolHost(summary);
    if (!host) return false;
    ensureFeedbackCatButton(root, summary, host);
    return true;
}

function removeEmptyRabbitMirrorToolHosts(chatRoot = getChatRoot()) {
    chatRoot?.querySelectorAll?.(`[${TOOL_ENTRY_HOST_ATTR}]`)?.forEach(host => {
        if (!host.querySelector?.(`[${MAINTENANCE_RABBIT_ATTR}], [${FEEDBACK_CAT_ATTR}], [${RESAY_ATTR}]`)) host.remove();
    });
}

function removeMaintenanceRabbitsInChatDom() {
    const chatRoot = getChatRoot();
    chatRoot?.querySelectorAll?.(`[${MAINTENANCE_RABBIT_ATTR}]`)?.forEach(button => button.remove());
    removeEmptyRabbitMirrorToolHosts(chatRoot);
}

function removeFeedbackCatsInChatDom() {
    const chatRoot = getChatRoot();
    chatRoot?.querySelectorAll?.(`[${FEEDBACK_CAT_ATTR}]`)?.forEach(button => button.remove());
    removeEmptyRabbitMirrorToolHosts(chatRoot);
    closeFeedbackCatMenu();
}

function installMaintenanceRabbitsInScope(scope, { allowGlobalRemoval = false } = {}) {
    if (!isCurrentRuntime() || !scope?.querySelectorAll) return;
    const maintenanceEnabled = isMaintenanceRabbitEnabled();
    const feedbackEnabled = isFeedbackCatEnabled();
    if (allowGlobalRemoval && !maintenanceEnabled) removeMaintenanceRabbitsInChatDom();
    if (allowGlobalRemoval && !feedbackEnabled) removeFeedbackCatsInChatDom();

    getRenderedRabbitMirrorInteractionRoots(scope).forEach(root => {
        if (!isInsideChatMessage(root)) return;
        try {
            clearLegacyRabbitMirrorAutoFrameArtifacts(root);
        } catch (error) {
            console.debug('[RabbitMirror] legacy frame palette cleanup skipped for one mirror:', error);
        }
        try {
            installNestedDetailsReplacementContainment(root);
        } catch (error) {
            console.debug('[RabbitMirror] nested details containment skipped for one mirror:', error);
        }
        if (maintenanceEnabled) {
            try {
                installMaintenanceRabbitForRoot(root);
                const maintenanceButton = root.querySelector?.(`[${MAINTENANCE_RABBIT_ATTR}]`);
                if (maintenanceButton && rabbitMirrorExternalGenerationState(root) !== 'loading') {
                    scheduleMaintenanceAutoSafeForRoot(root, maintenanceButton);
                }
            } catch (error) {
                console.debug('[RabbitMirror] maintenance rabbit install recovered for one mirror:', error);
            }
        }
        if (feedbackEnabled) {
            try {
                installFeedbackCatForRoot(root);
            } catch (error) {
                console.debug('[RabbitMirror] feedback cat install recovered for one mirror:', error);
            }
        }
    });
    if (feedbackEnabled) updateFeedbackCatButtonTitles();
}

function installMaintenanceRabbitsInChatDom() {
    const chatRoot = getChatRoot();
    if (!chatRoot) return;
    installMaintenanceRabbitsInScope(chatRoot, { allowGlobalRemoval: true });
}

export function refreshMaintenanceRabbits() {
    installMaintenanceRabbitsInChatDom();
}

export function refreshFeedbackCats() {
    installMaintenanceRabbitsInChatDom();
}

export function refreshRabbitMirrorToolsInScope(scope) {
    if (!scope?.querySelectorAll) return;
    installMaintenanceRabbitsInScope(scope);
}



const DAMAGED_DATA_URI_MESSAGE_ATTR = 'data-rabbit-mirror-damaged-data-uri-rescued';
const DAMAGED_DATA_URI_ROOT_ATTR = 'data-rabbit-mirror-data-uri-rescued';
const INLINE_SVG_DATA_URI_RE = /data:image\/svg\+xml(?:;[^,)]*)?,/i;
const UI_TAG_AFTER_DATA_URI_RE = /<(?:div|section|article|label|input|button|p|span|h[1-6]|ul|ol|li|table|thead|tbody|tfoot|tr|td|th|form|details|summary|figure|figcaption|main|header|footer|nav)\b/i;
const SVG_LEAK_TAGS = new Set([
    'svg', 'defs', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
    'filter', 'feturbulence', 'fecolormatrix', 'fegaussianblur', 'feoffset', 'feblend',
    'fedisplacementmap', 'femerge', 'femergenode', 'mask', 'clippath', 'pattern', 'lineargradient',
    'radialgradient', 'stop', 'text', 'tspan', 'use', 'symbol',
]);

function findLastInlineStyleMatch(tagPrefix) {
    let last = null;
    const re = /\bstyle\s*=\s*(["'])/gi;
    let match;
    while ((match = re.exec(String(tagPrefix || '')))) last = match;
    return last;
}

function findLastBackgroundDeclarationStart(stylePrefix, absoluteStart) {
    let found = -1;
    const re = /(?:^|;)\s*background(?:-image)?\s*:/gi;
    let match;
    while ((match = re.exec(String(stylePrefix || '')))) {
        const declarationOffset = match.index + (match[0].startsWith(';') ? 1 : 0);
        found = absoluteStart + declarationOffset;
    }
    return found;
}

function findNextUiTagStart(text, fromIndex) {
    const source = String(text || '');
    const tail = source.slice(Math.max(0, fromIndex));
    const match = UI_TAG_AFTER_DATA_URI_RE.exec(tail);
    return match ? Math.max(0, fromIndex) + match.index : -1;
}


function findDamagedInlineSvgDeclarationEnd(text, propertyStart, uriIndex, styleQuote) {
    const source = String(text || '');
    const prefix = source.slice(propertyStart, uriIndex);
    const urlOpen = prefix.toLowerCase().lastIndexOf('url(');
    if (urlOpen < 0 || !styleQuote) return -1;

    let quoteIndex = propertyStart + urlOpen + 4;
    while (quoteIndex < uriIndex && /\s/.test(source[quoteIndex])) quoteIndex += 1;
    const urlQuote = source[quoteIndex] === '"' || source[quoteIndex] === "'" ? source[quoteIndex] : '';

    // 精确寻找 url(...) 结束后紧接 style 属性闭引号和标签结束符的位置。
    // 只删除 background-image 声明本身，保留其后的 <style> 与正文；找不到时才使用旧保主体兜底。
    for (let index = Math.max(uriIndex, quoteIndex + 1); index < source.length; index += 1) {
        if (urlQuote) {
            if (source[index] !== urlQuote) continue;
        } else if (source[index] !== ')') {
            continue;
        }

        let cursor = urlQuote ? index + 1 : index;
        while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
        if (source[cursor] !== ')') continue;
        cursor += 1;
        while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
        if (source[cursor] === ';') cursor += 1;
        while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
        if (source[cursor] !== styleQuote) continue;
        const styleCloseIndex = cursor;
        cursor += 1;
        while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
        if (source[cursor] === '>') return styleCloseIndex;
        if (source.slice(cursor, cursor + 4).toLowerCase() === '&gt;') return styleCloseIndex;
    }
    return -1;
}

function countRawUiTags(text) {
    return (String(text || '').match(/<(?:div|section|article|label|input|button|p|span|h[1-6]|ul|ol|li|table|form|details|summary|figure|main|header|footer|nav)\b/gi) || []).length;
}

function parsedElementCount(text) {
    try {
        if (typeof document === 'undefined') return -1;
        const template = document.createElement('template');
        template.innerHTML = String(text || '');
        return template.content.querySelectorAll('*').length;
    } catch {
        return -1;
    }
}

function isLikelyDamagedInlineSvgDataUri(text, candidate) {
    const source = String(text || '');
    const { styleQuote, styleValueStart, uriIndex, nextUiTagIndex } = candidate;
    if (!styleQuote || nextUiTagIndex <= uriIndex) return false;

    const span = source.slice(uriIndex, nextUiTagIndex);
    if (!INLINE_SVG_DATA_URI_RE.test(span)) return false;
    INLINE_SVG_DATA_URI_RE.lastIndex = 0;

    // 只有“inline style 属性中的原始 SVG 文本”才会被接管。
    // 百分号编码或 base64 的健康资源不会匹配 <svg / &lt;svg，因此保持原样。
    if (!/(?:<|&lt;)svg\b/i.test(span)) return false;

    // HTML 属性引号在 data URI 尚未结束前再次出现，说明 SVG 内部引号会提前截断 style 属性。
    // 反斜杠不能转义 HTML 属性引号，因此 \" 同样属于损坏信号。
    const lastParen = span.lastIndexOf(')');
    const quoteIndex = source.indexOf(styleQuote, uriIndex);
    const quoteInsideDataUri = quoteIndex >= 0 && quoteIndex < nextUiTagIndex
        && (lastParen < 0 || quoteIndex <= uriIndex + lastParen);
    const explicitDamageSignal = /\\["']|\\&quot;|&quot;|["']{2}|["']\s*&gt;/i.test(span);

    if (quoteInsideDataUri || explicitDamageSignal) return true;

    // 浏览器可用时再做一次保守判定：原文标签很多，但解析后主体被吞掉。
    const rawCount = countRawUiTags(source);
    const parsedCount = parsedElementCount(source);
    return rawCount >= 6 && parsedCount >= 0 && parsedCount + 4 < rawCount;
}

function removeSurplusSvgClosingTags(text, removedFragment) {
    let output = String(text || '');
    const removedNames = new Set();
    String(removedFragment || '').replace(/<\/?([a-z][\w:-]*)\b/gi, (_full, rawName) => {
        const name = String(rawName || '').toLowerCase();
        if (SVG_LEAK_TAGS.has(name)) removedNames.add(name);
        return _full;
    });

    for (const name of removedNames) {
        const escaped = escapeRegExp(name);
        const openRe = new RegExp(`<${escaped}\\b(?![^>]*\\/>)`, 'gi');
        const closeRe = new RegExp(`</${escaped}\\s*>`, 'gi');
        const opens = (output.match(openRe) || []).length;
        const closes = (output.match(closeRe) || []).length;
        let surplus = Math.max(0, closes - opens);
        if (!surplus) continue;

        output = output.replace(closeRe, match => {
            if (surplus <= 0) return match;
            surplus -= 1;
            return '';
        });
    }
    return output;
}

/**
 * 保全型 data URI 急救：只移除会截断 inline style 属性的损坏 SVG data URI 声明。
 * 不改色、不重写其余 DOM/CSS，也不处理健康的 percent-encoded/base64 资源。
 */
export function rescueDamagedDataUriRabbitMirrorOutput(responseText = '') {
    let text = String(responseText || '');
    if (!/(?:<toto\b|<details\b)/i.test(text) || !/data:image\/svg\+xml/i.test(text)) return text;

    let cursor = 0;
    let repairs = 0;
    while (repairs < 8) {
        const lower = text.toLowerCase();
        const uriIndex = lower.indexOf('data:image/svg+xml', cursor);
        if (uriIndex < 0) break;

        const tagStart = text.lastIndexOf('<', uriIndex);
        const tagEndBeforeUri = text.lastIndexOf('>', uriIndex);
        if (tagStart < 0 || tagEndBeforeUri > tagStart) {
            cursor = uriIndex + 18;
            continue;
        }

        const tagPrefix = text.slice(tagStart, uriIndex);
        const styleMatch = findLastInlineStyleMatch(tagPrefix);
        if (!styleMatch) {
            cursor = uriIndex + 18;
            continue;
        }

        const styleQuote = styleMatch[1];
        const styleValueStart = tagStart + styleMatch.index + styleMatch[0].length;
        const stylePrefix = text.slice(styleValueStart, uriIndex);
        const propertyStart = findLastBackgroundDeclarationStart(stylePrefix, styleValueStart);
        const nextUiTagIndex = findNextUiTagStart(text, uriIndex + 18);
        const candidate = { styleQuote, styleValueStart, uriIndex, nextUiTagIndex };

        if (propertyStart < styleValueStart || nextUiTagIndex < 0 || !isLikelyDamagedInlineSvgDataUri(text, candidate)) {
            cursor = uriIndex + 18;
            continue;
        }

        const preciseStyleClose = findDamagedInlineSvgDeclarationEnd(text, propertyStart, uriIndex, styleQuote);
        if (preciseStyleClose >= 0) {
            const removedFragment = text.slice(propertyStart, preciseStyleClose);
            const safePrefix = text.slice(0, propertyStart).replace(/[ \t]+$/g, '');
            let safeSuffix = text.slice(preciseStyleClose);
            if (safeSuffix.toLowerCase().startsWith(`${styleQuote}&gt;`)) {
                safeSuffix = `${styleQuote}>${safeSuffix.slice(styleQuote.length + 4)}`;
            }
            text = `${safePrefix}${safeSuffix}`;
            text = removeSurplusSvgClosingTags(text, removedFragment);
        } else {
            const removedFragment = text.slice(propertyStart, nextUiTagIndex);
            const safePrefix = text.slice(0, propertyStart).replace(/[ \t]+$/g, '');
            const safeSuffix = text.slice(nextUiTagIndex);
            text = `${safePrefix}${styleQuote}>\n${safeSuffix}`;
            text = removeSurplusSvgClosingTags(text, removedFragment);
        }
        repairs += 1;
        cursor = Math.max(0, propertyStart + 2);
    }

    return text;
}

function setTransientMessageSource(message, repaired) {
    const transientMessage = cloneMessageForTransientRerender(message);
    transientMessage.mes = repaired;

    if (Array.isArray(transientMessage.swipes)) {
        const swipeIndex = Number.isInteger(transientMessage.swipe_id)
            ? transientMessage.swipe_id
            : transientMessage.swipes.length - 1;
        if (typeof transientMessage.swipes[swipeIndex] === 'string') transientMessage.swipes[swipeIndex] = repaired;
    }
    if (typeof transientMessage?.extra?.display_text === 'string') transientMessage.extra.display_text = repaired;
    return transientMessage;
}


function stripHtmlComments(text) {
    return String(text || '').replace(HTML_COMMENT_RE, '');
}

function normalizeMirrorAttribute(text) {
    return String(text || '').replace(new RegExp('data-rabbit-' + 'h' + 'ole', 'gi'), 'data-rabbit-mirror');
}

function stripSyntaxHighlightClasses(text) {
    return String(text || '').replace(CLASS_ATTR_RE, (match, quote, classValue) => {
        const kept = String(classValue || '')
            .split(/\s+/)
            .filter(token => token && !HIGHLIGHT_CLASS_TOKEN_RE.test(token));
        return kept.length ? ` class=${quote}${kept.join(' ')}${quote}` : '';
    });
}

function stripCodeBlockTriggers(text) {
    return normalizeMirrorAttribute(stripHtmlComments(String(text || '')))
        .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
        .replace(CODE_FENCE_OPEN_RE, '')
        .replace(/```/g, '')
        .replace(TILDE_FENCE_OPEN_RE, '')
        .replace(/~~~/g, '')
        .replace(CODE_LIKE_TAG_RE, '')
        .replace(CLASS_ATTR_RE, (match, quote, classValue) => {
            const kept = String(classValue || '')
                .split(/\s+/)
                .filter(token => token && !HIGHLIGHT_CLASS_TOKEN_RE.test(token));
            return kept.length ? ` class=${quote}${kept.join(' ')}${quote}` : '';
        })
        .replace(MULTI_BLANK_LINE_RE, '\n')
        .trim();
}

function decodeHtmlEntities(text) {
    const input = String(text || '');
    if (!input.includes('&')) return input;
    try {
        if (typeof document === 'undefined') return input;
        const textarea = document.createElement('textarea');
        textarea.innerHTML = input;
        return textarea.value;
    } catch {
        return input;
    }
}

function stripOneCodeFence(text) {
    const input = String(text || '').trim();
    const match = input.match(WHOLE_FENCED_BLOCK_RE);
    return match ? String(match[1] || '').trim() : input;
}

function looksLikeCompleteHtmlBlock(text) {
    const html = String(text || '').trim();
    if (!html) return false;
    if (TOTO_BLOCK_SINGLE_RE.test(html)) return true;
    if (!/^<(?:div|section|article|details)\b[\s\S]*<\/(?:div|section|article|details)>\s*$/i.test(html)) return false;

    // 只接管“像兔子镜 UI 作品”的整段 HTML，避免误伤普通聊天里的 HTML 教程代码。
    const htmlSignal = /\bstyle\s*=|display\s*:\s*(?:grid|flex|block)|box-sizing\s*:|max-width\s*:|linear-gradient\(|box-shadow\s*:|filter\s*:|border-radius\s*:/i.test(html);
    const theaterSignal = /兔子镜|小剧场|互动区|海龟汤|剖面图|Layer|视觉|展现形式|summary|details/i.test(html);
    const enoughTags = (html.match(/<\/(?:div|p|span|h[1-6]|section|article)>/gi) || []).length >= 3;
    return htmlSignal && (theaterSignal || enoughTags);
}

function wrapNakedHtmlAsToto(html) {
    const body = compactTotoBlock(html);
    if (TOTO_BLOCK_SINGLE_RE.test(body)) return body;
    if (/<details\b/i.test(body) && /<summary\b/i.test(body)) {
        return `<toto data-rabbit-mirror="true" style="display:block;">${body}</toto>`;
    }
    return `<toto data-rabbit-mirror="true" style="display:block;"><details style="display:block;box-sizing:border-box;"><summary style="cursor:pointer;list-style:none;font-weight:700;margin:0 0 8px 0;">【兔子镜：小剧场】</summary>${body}</details></toto>`;
}

function cleanCodeFencePayload(payload) {
    const raw = stripHtmlComments(stripOneCodeFence(decodeHtmlEntities(payload)));
    if (!raw) return raw;
    if (TOTO_BLOCK_SINGLE_RE.test(raw)) return cleanRabbitMirrorOutput(raw);
    if (looksLikeCompleteHtmlBlock(raw)) return wrapNakedHtmlAsToto(raw);
    return null;
}

function unwrapCodeBlocksInsideToto(block) {
    let html = stripHtmlComments(String(block || ''));

    // 关键兜底：外层 <toto>/<details> 已经成立，但模型把正文 HTML 又塞进 ```html 代码块时，
    // 这里只拆掉内部代码块，保留原本的外层 summary，不再二次包 <toto>。
    html = html.replace(FENCED_BLOCK_RE, (match, payload) => {
        const raw = stripHtmlComments(stripOneCodeFence(decodeHtmlEntities(payload)));
        if (looksLikeCompleteHtmlBlock(raw)) return compactTotoBlock(raw);
        if (TOTO_BLOCK_SINGLE_RE.test(raw)) return compactTotoBlock(raw.replace(/^<toto\b[^>]*>/i, '').replace(/<\/toto>\s*$/i, ''));
        return match;
    });

    // 兼容已经被 Markdown 渲染成 <pre><code>&lt;div...&gt;</code></pre> 后又写回消息的情况。
    html = html.replace(PRE_CODE_RE, (match, payload) => {
        const raw = stripHtmlComments(stripOneCodeFence(decodeHtmlEntities(payload)));
        if (looksLikeCompleteHtmlBlock(raw)) return compactTotoBlock(raw);
        if (TOTO_BLOCK_SINGLE_RE.test(raw)) return compactTotoBlock(raw.replace(/^<toto\b[^>]*>/i, '').replace(/<\/toto>\s*$/i, ''));
        return match;
    });

    return stripCodeBlockTriggers(html);
}

function wrapTrailingNakedHtml(text) {
    const input = String(text || '').trim();
    if (TOTO_BLOCK_SINGLE_RE.test(input)) return input;
    if (looksLikeCompleteHtmlBlock(input)) return wrapNakedHtmlAsToto(input);

    const match = input.match(TRAILING_HTML_START_RE);
    if (!match) return input;
    const htmlStart = match.index + match[0].indexOf('<');
    const prefix = input.slice(0, htmlStart).trimEnd();
    const tail = input.slice(htmlStart).trim();
    if (!looksLikeCompleteHtmlBlock(tail)) return input;
    return `${prefix}${prefix ? '\n' : ''}${wrapNakedHtmlAsToto(tail)}`.trim();
}

const plainTextRerenderedSignatures = new Set();

function splitCssVarArguments(value) {
    const source = String(value || '');
    let depth = 0;
    let quote = '';
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (char === '\\') index += 1;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === '(') depth += 1;
        else if (char === ')') depth = Math.max(0, depth - 1);
        else if (char === ',' && depth === 0) {
            return [source.slice(0, index).trim(), source.slice(index + 1).trim()];
        }
    }
    return [source.trim(), ''];
}

function replaceCssVarFunctions(value, resolver) {
    const source = String(value || '');
    let output = '';
    let cursor = 0;

    while (cursor < source.length) {
        const match = /var\s*\(/ig.exec(source.slice(cursor));
        if (!match) {
            output += source.slice(cursor);
            break;
        }

        const start = cursor + match.index;
        const open = start + match[0].lastIndexOf('(');
        output += source.slice(cursor, start);

        let depth = 1;
        let quote = '';
        let end = open + 1;
        for (; end < source.length; end += 1) {
            const char = source[end];
            if (quote) {
                if (char === '\\') end += 1;
                else if (char === quote) quote = '';
                continue;
            }
            if (char === '"' || char === "'") {
                quote = char;
                continue;
            }
            if (char === '(') depth += 1;
            else if (char === ')') {
                depth -= 1;
                if (depth === 0) break;
            }
        }

        if (depth !== 0) {
            output += source.slice(start);
            break;
        }

        const [name, fallback] = splitCssVarArguments(source.slice(open + 1, end));
        const resolved = resolver(name, fallback);
        output += resolved;
        cursor = end + 1;
    }

    return output;
}

function collectCssCustomPropertyValuesFromHtml(htmlText) {
    const html = String(htmlText || '');
    const values = new Map();
    const collect = (cssSource) => {
        const declarationRe = /(?:^|[;{])\s*(--[^\s:;{}]+)\s*:\s*([^;{}]*?)(?=;|})/g;
        let match;
        while ((match = declarationRe.exec(String(cssSource || '')))) {
            const name = String(match[1] || '').trim();
            const value = String(match[2] || '').trim();
            if (name && value) values.set(name, value);
        }
    };

    html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (full, css = '') => {
        collect(css);
        return full;
    });
    html.replace(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (full, quote, css = '') => {
        collect(`{${css}}`);
        return full;
    });
    return values;
}

function expandUnsupportedCssCustomProperties(cssText, inheritedValues = null) {
    const source = String(cssText || '');
    if (!/(?:^|[;{])\s*--[^\s:;{}]+\s*:|var\s*\(/i.test(source)) return source;

    const values = new Map(inheritedValues instanceof Map ? inheritedValues : []);
    const declarationRe = /(^|[;{])\s*(--[^\s:;{}]+)\s*:\s*([^;{}]*?)(?=;|})/g;
    let match;
    while ((match = declarationRe.exec(source))) {
        const name = String(match[2] || '').trim();
        const value = String(match[3] || '').trim();
        if (name && value) values.set(name, value);
    }

    const resolvedCache = new Map();
    const resolveName = (name, stack = new Set()) => {
        const key = String(name || '').trim();
        if (!key.startsWith('--')) return '';
        if (resolvedCache.has(key)) return resolvedCache.get(key);
        if (stack.has(key)) return '';
        const raw = values.get(key);
        if (raw === undefined) return '';

        const nextStack = new Set(stack);
        nextStack.add(key);
        const resolved = replaceCssVarFunctions(raw, (nestedName, fallback) => {
            const nested = resolveName(nestedName, nextStack);
            if (nested) return nested;
            if (fallback) {
                return replaceCssVarFunctions(fallback, (fallbackName, nestedFallback) => {
                    const fallbackResolved = resolveName(fallbackName, nextStack);
                    return fallbackResolved || nestedFallback || `var(${fallbackName})`;
                });
            }
            return `var(${nestedName})`;
        }).trim();
        resolvedCache.set(key, resolved);
        return resolved;
    };

    // 删除宿主旧 CSS 解析器不识别的 --自定义属性声明，保留前导 { / ; 作为声明边界。
    let repaired = source.replace(declarationRe, (full, boundary) => boundary || '');
    repaired = repaired.replace(/\{\s*(?:;\s*)+/g, '{');
    repaired = replaceCssVarFunctions(repaired, (name, fallback) => {
        const resolved = resolveName(name);
        if (resolved) return resolved;
        if (fallback) {
            return replaceCssVarFunctions(fallback, (fallbackName, nestedFallback) => {
                const fallbackResolved = resolveName(fallbackName);
                return fallbackResolved || nestedFallback || `var(${fallbackName})`;
            });
        }
        // 无法可靠解析时保留原 var()，绝不再用 initial 覆盖健康 UI 的颜色与背景。
        return `var(${name})`;
    });

    return repaired;
}

function repairLikelyBareRootSelector(cssText, htmlText) {
    let css = String(cssText || '');
    const html = String(htmlText || '');
    const classTokens = [];
    const classRe = /\sclass\s*=\s*(["'])([^"']+)\1/gi;
    let classMatch;
    while ((classMatch = classRe.exec(html))) {
        String(classMatch[2] || '').split(/\s+/).forEach(token => {
            if (/^rabbit-scenery-[a-z0-9_-]+$/i.test(token)) classTokens.push(token);
        });
    }

    for (const className of classTokens) {
        if (new RegExp(`\\.${escapeRegExp(className)}\\s*\\{`, 'i').test(css)) continue;
        const suffix = className.replace(/^rabbit-scenery-/i, '');
        const candidates = [className, suffix].filter(Boolean);
        for (const candidate of candidates) {
            const bareRe = new RegExp(`(^|})\\s*${escapeRegExp(candidate)}\\s*\\{`, 'i');
            if (!bareRe.test(css)) continue;
            css = css.replace(bareRe, (full, boundary) => `${boundary || ''}.${className}{`);
            break;
        }
    }
    return css;
}

// CSS 声明级保全：模型偶尔把 filter() 错塞进 transform 值中，
// 例如 transform: scale(1.1) filter(blur(4px));。
// 某些宿主 CSS 处理器会因此放弃整份样式。这里只修复这一种可明确还原的误写；
// 若 filter( 外层括号本身无法闭合，则仅丢弃该条 transform 声明，保住其余 CSS/HTML。
function splitWrappedFilterFromTransformValue(rawValue) {
    const source = String(rawValue || '');
    const pieces = [];
    const filters = [];
    let cursor = 0;
    let index = 0;
    let depth = 0;
    let quote = '';
    let escaped = false;
    let malformed = false;

    while (index < source.length) {
        const char = source[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            index += 1;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            index += 1;
            continue;
        }
        if (char === '(') {
            depth += 1;
            index += 1;
            continue;
        }
        if (char === ')') {
            depth = Math.max(0, depth - 1);
            index += 1;
            continue;
        }

        if (depth === 0 && /[a-zA-Z_-]/.test(char)) {
            const tokenMatch = /^filter\s*\(/i.exec(source.slice(index));
            const previous = index > 0 ? source[index - 1] : '';
            if (tokenMatch && !/[a-zA-Z0-9_-]/.test(previous)) {
                const openIndex = index + tokenMatch[0].lastIndexOf('(');
                let scan = openIndex + 1;
                let filterDepth = 1;
                let filterQuote = '';
                let filterEscaped = false;
                while (scan < source.length && filterDepth > 0) {
                    const scanChar = source[scan];
                    if (filterQuote) {
                        if (filterEscaped) filterEscaped = false;
                        else if (scanChar === '\\') filterEscaped = true;
                        else if (scanChar === filterQuote) filterQuote = '';
                    } else if (scanChar === '"' || scanChar === "'") {
                        filterQuote = scanChar;
                    } else if (scanChar === '(') {
                        filterDepth += 1;
                    } else if (scanChar === ')') {
                        filterDepth -= 1;
                    }
                    scan += 1;
                }

                if (filterDepth !== 0) {
                    malformed = true;
                    break;
                }

                const closeIndex = scan - 1;
                const filterValue = source.slice(openIndex + 1, closeIndex).trim();
                if (!filterValue || /[;{}]/.test(filterValue)) {
                    malformed = true;
                    break;
                }

                pieces.push(source.slice(cursor, index));
                filters.push(filterValue);
                cursor = closeIndex + 1;
                index = cursor;
                continue;
            }
        }
        index += 1;
    }

    if (malformed) return { changed: true, malformed: true, transformValue: '', filterValue: '' };
    if (!filters.length) return { changed: false, malformed: false, transformValue: source, filterValue: '' };

    pieces.push(source.slice(cursor));
    const transformValue = pieces.join(' ').replace(/\s{2,}/g, ' ').trim();
    const filterValue = filters.join(' ').replace(/\s{2,}/g, ' ').trim();
    return { changed: true, malformed: false, transformValue, filterValue };
}

// CSS 注释剥离急救：SillyTavern/Markdown 的换行与强调解析偶尔会破坏
// <style> 内的 /* ... */ 边界，继而让宿主 CSS 解析器误报 missing '}'。
// 注释不参与最终视觉，因此在代码块急救或单条纯文字急救实际整理样式时，
// 仅删除引号外的 CSS 注释并以一个空格占位；不开对应急救时不会调用。
function stripCssComments(cssText) {
    const source = String(cssText || '');
    let output = '';
    let index = 0;
    let quote = '';
    let escaped = false;

    while (index < source.length) {
        const char = source[index];
        const next = source[index + 1] || '';

        if (quote) {
            output += char;
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            index += 1;
            continue;
        }

        if (char === '"' || char === "'") {
            quote = char;
            output += char;
            index += 1;
            continue;
        }

        if (char === '/' && next === '*') {
            const closeIndex = source.indexOf('*/', index + 2);
            // 未闭合注释已经会吞掉后续全部 CSS；急救时直接丢弃其余注释内容，
            // 至少保住注释之前已经完整的规则，而不是把损坏边界继续交给宿主解析器。
            if (closeIndex < 0) break;
            if (output && !/\s$/.test(output)) output += ' ';
            index = closeIndex + 2;
            while (index < source.length && /[ \t]/.test(source[index])) index += 1;
            continue;
        }

        output += char;
        index += 1;
    }

    return output;
}

function decodeMinimalSvgHtmlEntities(text) {
    return String(text || '')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#(?:39|x27);/gi, "'")
        .replace(/&amp;/gi, '&');
}

function percentEncodeSvgDataPayload(payload) {
    const source = decodeMinimalSvgHtmlEntities(payload);
    let output = '';
    for (let index = 0; index < source.length;) {
        if (source[index] === '%' && /^[0-9a-f]{2}$/i.test(source.slice(index + 1, index + 3))) {
            output += source.slice(index, index + 3);
            index += 3;
            continue;
        }
        const codePoint = source.codePointAt(index);
        const char = String.fromCodePoint(codePoint);
        index += char.length;
        if (/^[A-Za-z0-9._~-]$/.test(char)) {
            output += char;
            continue;
        }
        output += encodeURIComponent(char).replace(/[!'()*]/g, token => `%${token.charCodeAt(0).toString(16).toUpperCase()}`);
    }
    return output;
}

/**
 * 将 <style> 中仍携带原始 XML 的 quoted SVG data URI 转成百分号编码。
 * 浏览器原生 CSS 能接受原始 XML，但部分 SillyTavern 美化/作用域解析器会被其中的
 * <svg>、引号或内部 url(#id) 扰乱，并在后续选择器处报“property missing ':'”。
 * 仅处理明确含原始 <svg> 的 quoted data URI；base64 与已编码资源保持不变。
 */
function normalizeQuotedCssSvgDataUris(cssText) {
    let source = String(cssText || '');
    let cursor = 0;
    let repairs = 0;

    while (repairs < 24) {
        const lower = source.toLowerCase();
        const uriIndex = lower.indexOf('data:image/svg+xml', cursor);
        if (uriIndex < 0) break;

        const urlStart = lower.lastIndexOf('url(', uriIndex);
        if (urlStart < 0) {
            cursor = uriIndex + 18;
            continue;
        }

        let quoteIndex = urlStart + 4;
        while (quoteIndex < source.length && /\s/.test(source[quoteIndex])) quoteIndex += 1;
        const quote = source[quoteIndex];
        if (quote !== '"' && quote !== "'") {
            cursor = uriIndex + 18;
            continue;
        }

        let quoteEnd = quoteIndex + 1;
        let escaped = false;
        for (; quoteEnd < source.length; quoteEnd += 1) {
            const char = source[quoteEnd];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === '\\') {
                escaped = true;
                continue;
            }
            if (char === quote) break;
        }
        if (quoteEnd >= source.length) {
            cursor = uriIndex + 18;
            continue;
        }

        let closeParen = quoteEnd + 1;
        while (closeParen < source.length && /\s/.test(source[closeParen])) closeParen += 1;
        if (source[closeParen] !== ')') {
            cursor = uriIndex + 18;
            continue;
        }

        const commaIndex = source.indexOf(',', uriIndex);
        if (commaIndex < 0 || commaIndex >= quoteEnd) {
            cursor = uriIndex + 18;
            continue;
        }

        const payload = source.slice(commaIndex + 1, quoteEnd);
        if (!/(?:<|&lt;)svg\b/i.test(payload)) {
            cursor = quoteEnd + 1;
            continue;
        }

        const encodedPayload = percentEncodeSvgDataPayload(payload);
        source = `${source.slice(0, commaIndex + 1)}${encodedPayload}${source.slice(quoteEnd)}`;
        repairs += 1;
        cursor = commaIndex + 1 + encodedPayload.length;
    }

    return source;
}

function repairMalformedCssDeclarations(cssText) {
    return String(cssText || '').replace(
        /(^|[;{])(\s*)transform\s*:\s*([^;{}]+)(;|(?=}))/gi,
        (full, boundary, spacing, rawValue, terminator) => {
            const important = /\s*!important\s*$/i.test(rawValue);
            const value = String(rawValue || '').replace(/\s*!important\s*$/i, '').trim();
            const split = splitWrappedFilterFromTransformValue(value);
            if (!split.changed) return full;
            if (split.malformed) return `${boundary}${spacing}`;

            const priority = important ? ' !important' : '';
            const declarations = [];
            if (split.transformValue) declarations.push(`transform: ${split.transformValue}${priority}`);
            if (split.filterValue) declarations.push(`filter: ${split.filterValue}${priority}`);
            return `${boundary}${spacing}${declarations.join(';')}${terminator === ';' ? ';' : ''}`;
        },
    );
}

function repairPlainTextCssInHtml(htmlText) {
    const html = String(htmlText || '');
    // CSS 变量可能定义在主容器的 inline style 中、却在局部 <style> 中被引用。
    // 先从整条兔子镜收集变量，避免把原本可用的配色错误替换成 initial。
    const inheritedValues = collectCssCustomPropertyValuesFromHtml(html);
    return html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (full, attrs = '', css = '') => {
        const normalized = String(css || '')
            .replace(/<br\s*\/?>/gi, '')
            .replace(/\r\n?/g, '\n');
        const commentStripped = stripCssComments(normalized);
        const svgDataUriNormalized = normalizeQuotedCssSvgDataUris(commentStripped);
        const declarationRepaired = repairMalformedCssDeclarations(svgDataUriNormalized);
        const expanded = expandUnsupportedCssCustomProperties(declarationRepaired, inheritedValues);
        const repaired = repairLikelyBareRootSelector(expanded, html);
        return `<style${attrs}>${repaired}</style>`;
    });
}

function needsPlainTextCssRescue(text) {
    const source = decodeHtmlEntities(String(text || ''));
    if (!/<(?:toto|details)\b[\s\S]*?<style\b/i.test(source)) return false;
    return /(?:^|[;{])\s*--[^\s:;{}]+\s*:|var\s*\(/i.test(source);
}

const MALFORMED_HTML_TAG_NAMES = '(?:div|span|label|section|article|button|input|select|textarea|details|summary|h[1-6]|p|a|img|svg|path|g|ul|ol|li|table|thead|tbody|tfoot|tr|td|th|form|fieldset|legend)';
const MALFORMED_HTML_ATTR_NAMES = '(?:class|id|style|for|href|src|type|role|name|value|title|tabindex|checked|disabled|selected|multiple|placeholder|aria-[\\w-]+|data-[\\w-]+)';

export function repairMalformedRabbitMirrorMarkup(htmlText = '') {
    let html = String(htmlText || '');
    const duplicateClosing = new RegExp(
        `<\\s*\\/\\s*(${MALFORMED_HTML_TAG_NAMES})(${MALFORMED_HTML_ATTR_NAMES})\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)\\s*>\\s*<\\s*\\/\\s*\\1\\s*>`,
        'gi',
    );
    const malformedOpening = new RegExp(
        `<\\s*(${MALFORMED_HTML_TAG_NAMES})(${MALFORMED_HTML_ATTR_NAMES})(?=\\s*=)`,
        'gi',
    );
    const malformedClosing = new RegExp(
        `<\\s*\\/\\s*(${MALFORMED_HTML_TAG_NAMES})(?:${MALFORMED_HTML_ATTR_NAMES})(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?\\s*>`,
        'gi',
    );

    // 模型偶尔把“标签名 + 第一个属性”粘在一起，例如 <divclass=...>、<labelfor=...>。
    // 先折叠“损坏闭标签 + 重复标准闭标签”，避免修复后多关一层容器。
    html = html.replace(duplicateClosing, '</$1>');
    html = html.replace(malformedOpening, '<$1 $2');
    html = html.replace(malformedClosing, '</$1>');
    return html;
}

export function rescuePlainTextRabbitMirrorOutput(responseText = '') {
    let text = repairMalformedRabbitMirrorMarkup(normalizeMirrorAttribute(String(responseText || '')));
    text = repairPlainTextCssInHtml(text);
    text = text.replace(TOTO_BLOCK_RE, block => compactTotoBlock(block));
    return text.trim();
}

const RABBIT_MIRROR_CSS_SCOPE_ATTR = 'data-rabbit-mirror-css-scope';
let rabbitMirrorCssScopeCounter = 0;

function createRabbitMirrorCssScopeToken(sourceText) {
    rabbitMirrorCssScopeCounter += 1;
    const signature = hashInteractionSignature(sourceText).slice(0, 7);
    const timePart = Date.now().toString(36);
    const countPart = rabbitMirrorCssScopeCounter.toString(36);
    const randomPart = Math.random().toString(36).slice(2, 6);
    return `rmcss-${signature}-${timePart}-${countPart}-${randomPart}`;
}

function prepareRabbitMirrorCssScope(html) {
    const source = String(html || '');
    const existing = new RegExp(`${RABBIT_MIRROR_CSS_SCOPE_ATTR}\\s*=\\s*(["'])([^"']+)\\1`, 'i').exec(source);
    const scopeToken = existing?.[2] || createRabbitMirrorCssScopeToken(source);
    const scopeSelector = `[${RABBIT_MIRROR_CSS_SCOPE_ATTR}="${scopeToken}"]`;
    const classPrefix = `rmc-${scopeToken.replace(/^rmcss-/i, '')}-`;

    const markTag = (tag) => {
        const attrRe = new RegExp(`\\s${RABBIT_MIRROR_CSS_SCOPE_ATTR}\\s*=\\s*(["']).*?\\1`, 'i');
        if (attrRe.test(tag)) return tag.replace(attrRe, ` ${RABBIT_MIRROR_CSS_SCOPE_ATTR}="${scopeToken}"`);
        return tag.replace(/^<([a-z][\w:-]*)\b/i, `<$1 ${RABBIT_MIRROR_CSS_SCOPE_ATTR}="${scopeToken}"`);
    };

    let prepared = source.replace(/<toto\b[^>]*>/i, markTag);
    prepared = prepared.replace(/<(details|div|section|article)\b[^>]*>/i, markTag);
    return { html: prepared, scopeToken, scopeSelector, classPrefix };
}

function findCssTopLevelDelimiter(sourceText, startIndex = 0) {
    const source = String(sourceText || '');
    let quote = '';
    let escaped = false;
    let parentheses = 0;
    let brackets = 0;

    for (let index = startIndex; index < source.length; index += 1) {
        const char = source[index];
        const next = source[index + 1] || '';
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === '/' && next === '*') {
            const close = source.indexOf('*/', index + 2);
            if (close < 0) return { index: source.length, char: '' };
            index = close + 1;
            continue;
        }
        if (char === '(') parentheses += 1;
        else if (char === ')') parentheses = Math.max(0, parentheses - 1);
        else if (char === '[') brackets += 1;
        else if (char === ']') brackets = Math.max(0, brackets - 1);
        else if (!parentheses && !brackets && (char === '{' || char === ';')) return { index, char };
    }
    return { index: -1, char: '' };
}

function findCssMatchingBrace(sourceText, openIndex) {
    const source = String(sourceText || '');
    if (source[openIndex] !== '{') return -1;
    let depth = 1;
    let quote = '';
    let escaped = false;

    for (let index = openIndex + 1; index < source.length; index += 1) {
        const char = source[index];
        const next = source[index + 1] || '';
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === '/' && next === '*') {
            const close = source.indexOf('*/', index + 2);
            if (close < 0) return -1;
            index = close + 1;
            continue;
        }
        if (char === '{') depth += 1;
        else if (char === '}') {
            depth -= 1;
            if (!depth) return index;
        }
    }
    return -1;
}

function transformCssRuleList(cssText, selectorTransform) {
    const source = String(cssText || '');
    const recursiveAtRules = new Set(['media', 'supports', 'container', 'layer', 'document', 'starting-style', 'scope']);
    let output = '';
    let cursor = 0;

    while (cursor < source.length) {
        const delimiter = findCssTopLevelDelimiter(source, cursor);
        if (delimiter.index < 0) {
            output += source.slice(cursor);
            break;
        }
        if (delimiter.char === ';') {
            output += source.slice(cursor, delimiter.index + 1);
            cursor = delimiter.index + 1;
            continue;
        }

        const closeIndex = findCssMatchingBrace(source, delimiter.index);
        if (closeIndex < 0) {
            output += source.slice(cursor);
            break;
        }

        const rawPrelude = source.slice(cursor, delimiter.index);
        const leading = rawPrelude.match(/^\s*/)?.[0] || '';
        const trailing = rawPrelude.match(/\s*$/)?.[0] || '';
        const prelude = rawPrelude.trim();
        const body = source.slice(delimiter.index + 1, closeIndex);

        if (prelude.startsWith('@')) {
            const atName = /^@([\w-]+)/.exec(prelude)?.[1]?.toLowerCase() || '';
            const isKeyframes = atName.endsWith('keyframes');
            const transformedBody = !isKeyframes && recursiveAtRules.has(atName)
                ? transformCssRuleList(body, selectorTransform)
                : body;
            output += `${leading}${prelude}${trailing}{${transformedBody}}`;
        } else {
            const transformedPrelude = typeof selectorTransform === 'function'
                ? selectorTransform(prelude)
                : prelude;
            output += `${leading}${transformedPrelude}${trailing}{${body}}`;
        }
        cursor = closeIndex + 1;
    }
    return output;
}

function splitCssSelectorList(selectorText) {
    const source = String(selectorText || '');
    const parts = [];
    let start = 0;
    let quote = '';
    let escaped = false;
    let parentheses = 0;
    let brackets = 0;

    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === '(') parentheses += 1;
        else if (char === ')') parentheses = Math.max(0, parentheses - 1);
        else if (char === '[') brackets += 1;
        else if (char === ']') brackets = Math.max(0, brackets - 1);
        else if (char === ',' && !parentheses && !brackets) {
            parts.push(source.slice(start, index));
            start = index + 1;
        }
    }
    parts.push(source.slice(start));
    return parts;
}

function rewriteSimpleCssIdSelectorsAsAttributes(selectorText, allowedIds = null) {
    const source = String(selectorText || '');
    let output = '';
    let quote = '';
    let escaped = false;
    let brackets = 0;

    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            output += char;
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            output += char;
            continue;
        }
        if (char === '[') {
            brackets += 1;
            output += char;
            continue;
        }
        if (char === ']') {
            brackets = Math.max(0, brackets - 1);
            output += char;
            continue;
        }
        if (!brackets && char === '#' && /[A-Za-z_-]/.test(source[index + 1] || '')) {
            let end = index + 2;
            while (end < source.length && /[\w-]/.test(source[end])) end += 1;
            const id = source.slice(index + 1, end);
            if (!allowedIds || allowedIds.has(id)) output += `[id="${id}"]`;
            else output += source.slice(index, end);
            index = end - 1;
            continue;
        }
        output += char;
    }
    return output;
}

function collectRabbitMirrorCheckedStateIds(cssTexts) {
    const ids = new Set();
    for (const cssText of cssTexts || []) {
        transformCssRuleList(cssText, (prelude) => {
            for (const selector of splitCssSelectorList(prelude)) {
                if (!/:checked\b/i.test(selector)) continue;
                const rewritten = rewriteSimpleCssIdSelectorsAsAttributes(selector);
                for (const match of rewritten.matchAll(/\[id="([A-Za-z_-][\w-]*)"\]/g)) ids.add(match[1]);
            }
            return prelude;
        });
    }
    return ids;
}

function visitSimpleCssClassTokens(selectorText, visitor) {
    const source = String(selectorText || '');
    let output = '';
    let quote = '';
    let escaped = false;

    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            output += char;
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            output += char;
            continue;
        }
        if (char === '.' && /[A-Za-z_]/.test(source[index + 1] || '')) {
            let end = index + 2;
            while (end < source.length && /[\w-]/.test(source[end])) end += 1;
            const className = source.slice(index + 1, end);
            const replacement = typeof visitor === 'function' ? visitor(className) : className;
            output += `.${replacement || className}`;
            index = end - 1;
            continue;
        }
        output += char;
    }
    return output;
}

function collectRabbitMirrorCssClasses(cssTexts) {
    const names = new Set();
    for (const cssText of cssTexts || []) {
        transformCssRuleList(cssText, (prelude) => {
            visitSimpleCssClassTokens(prelude, (className) => {
                names.add(className);
                return className;
            });
            return prelude;
        });
    }
    return names;
}

function buildRabbitMirrorClassMap(cssTexts, classPrefix) {
    const map = new Map();
    for (const className of collectRabbitMirrorCssClasses(cssTexts)) {
        if (!className) continue;
        if (className.startsWith(classPrefix)) {
            map.set(className, className);
            // 旧缓存可能已经把 CSS selector 加上逐镜前缀，但损坏的
            // <divclass="rm-..."> 在此前版本中没有被修成同一个 class。
            // 为当前 scope 的已前缀 class 补一条“原始后缀 → 已前缀 class”别名，
            // 只用于重清理旧缓存，不会改变新生成兔子镜的正常 class 映射。
            const legacyClassName = className.slice(classPrefix.length);
            if (legacyClassName && !map.has(legacyClassName)) map.set(legacyClassName, className);
        } else {
            map.set(className, `${classPrefix}${className}`);
        }
    }
    return map;
}

function collectRabbitMirrorKeyframeNames(cssTexts) {
    const names = new Set();
    const pattern = /@(?:-webkit-)?keyframes\s+(?:(["'])([^"']+)\1|([^\s{]+))/gi;
    for (const cssText of cssTexts || []) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(String(cssText || '')))) {
            const name = String(match[2] || match[3] || '').trim();
            if (name) names.add(name);
        }
    }
    pattern.lastIndex = 0;
    return names;
}

function buildRabbitMirrorKeyframeMap(cssTexts, scopeToken) {
    const map = new Map();
    const prefix = `rmkf-${String(scopeToken || '').replace(/^rmcss-/i, '')}-`;
    for (const name of collectRabbitMirrorKeyframeNames(cssTexts)) {
        if (!name || name.startsWith(prefix)) {
            map.set(name, name);
            continue;
        }
        const identifierSafe = /^-?[_a-zA-Z][\w-]*$/.test(name);
        const safeName = identifierSafe
            ? name
            : `animation-${hashInteractionSignature(name).slice(0, 7)}`;
        map.set(name, `${prefix}${safeName}`);
    }
    return map;
}

function rewriteRabbitMirrorAnimationNameTokens(valueText, keyframeMap) {
    let value = String(valueText || '');
    if (!keyframeMap?.size) return value;
    for (const [oldName, newName] of keyframeMap.entries()) {
        if (!oldName || oldName === newName) continue;
        const escaped = escapeRegExp(oldName);
        value = value
            .replace(new RegExp(`(["'])${escaped}\\1`, 'g'), `$1${newName}$1`)
            .replace(new RegExp(`(^|[^\\w-])${escaped}(?![\\w-])`, 'g'), `$1${newName}`);
    }
    return value;
}

function rewriteRabbitMirrorAnimationDeclarations(cssText, keyframeMap) {
    if (!keyframeMap?.size) return String(cssText || '');
    return String(cssText || '').replace(
        /(^|[;{])(\s*(?:-webkit-)?animation(?:-name)?\s*:\s*)([^;{}]*)(?=;|}|$)/gi,
        (match, boundary, property, value) => `${boundary}${property}${rewriteRabbitMirrorAnimationNameTokens(value, keyframeMap)}`,
    );
}

function rewriteRabbitMirrorKeyframeDefinitions(cssText, keyframeMap) {
    if (!keyframeMap?.size) return String(cssText || '');
    return String(cssText || '').replace(
        /(@(?:-webkit-)?keyframes\s+)(?:(["'])([^"']+)\2|([^\s{]+))/gi,
        (match, prefix, quote, quotedName, bareName) => {
            const oldName = String(quotedName || bareName || '').trim();
            const newName = keyframeMap.get(oldName) || oldName;
            return quote ? `${prefix}${quote}${newName}${quote}` : `${prefix}${newName}`;
        },
    );
}

function rewriteRabbitMirrorInlineAnimationStyles(htmlText, keyframeMap) {
    if (!keyframeMap?.size) return String(htmlText || '');
    return String(htmlText || '').replace(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (match, quote, styleText) => {
        const rewritten = rewriteRabbitMirrorAnimationDeclarations(styleText, keyframeMap);
        return ` style=${quote}${rewritten}${quote}`;
    });
}

function scopeRabbitMirrorSelectorList(selectorText, scopeSelector, classMap, checkedStateIds) {
    return splitCssSelectorList(selectorText).map((rawSelector) => {
        // 部分宿主 CSS 作用域解析链会在原始资源解析受扰后，于 checkbox/radio 的 #id
        // 状态规则附近中断。只改写明确参与 :checked 的状态 ID，避免扩大影响范围；
        // label/控件语义不变，后续 ID 隔离也会继续同步 [id="..."] 引用。
        const idSafeSelector = rewriteSimpleCssIdSelectorsAsAttributes(rawSelector.trim(), checkedStateIds);
        let selector = visitSimpleCssClassTokens(idSafeSelector, className => classMap.get(className) || className);
        selector = selector
            .replace(/:root\b/gi, scopeSelector)
            .replace(/:host\b/gi, scopeSelector)
            .replace(/^html(?:\s+body)?(?=\s|[.#[:])/i, scopeSelector)
            .replace(/^body(?=\s|[.#[:])/i, scopeSelector);
        if (!selector || selector.includes(RABBIT_MIRROR_CSS_SCOPE_ATTR)) return selector;
        return `${scopeSelector} ${selector}`;
    }).join(',');
}

function scopeRabbitMirrorCssText(cssText, scopeSelector, classMap, checkedStateIds, keyframeMap) {
    const scoped = transformCssRuleList(cssText, prelude => scopeRabbitMirrorSelectorList(prelude, scopeSelector, classMap, checkedStateIds));
    const definitionsRewritten = rewriteRabbitMirrorKeyframeDefinitions(scoped, keyframeMap);
    return rewriteRabbitMirrorAnimationDeclarations(definitionsRewritten, keyframeMap);
}

function rewriteRabbitMirrorClassAttributes(htmlText, classMap) {
    if (!classMap?.size) return String(htmlText || '');
    return String(htmlText || '').replace(CLASS_ATTR_RE, (match, quote, classValue) => {
        const tokens = String(classValue || '').split(/\s+/).filter(Boolean);
        const rewritten = tokens.map(token => classMap.get(token) || token);
        return rewritten.length ? ` class=${quote}${rewritten.join(' ')}${quote}` : '';
    });
}

export function compactTotoBlock(block) {
    const preparedScope = prepareRabbitMirrorCssScope(repairMalformedRabbitMirrorMarkup(normalizeMirrorAttribute(stripCodeBlockTriggers(block))));
    let html = preparedScope.html;
    const rawStyleTexts = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
        .map(match => stripCssComments(String(match[1] || '').replace(/<br\s*\/?>/gi, '')));
    const classMap = buildRabbitMirrorClassMap(rawStyleTexts, preparedScope.classPrefix);
    const keyframeMap = buildRabbitMirrorKeyframeMap(rawStyleTexts, preparedScope.scopeToken);
    const checkedStateIds = collectRabbitMirrorCheckedStateIds(rawStyleTexts);
    const styleSlots = [];

    // 1. 保护 <style>...</style>，避免 CSS 文本被误插入 <br>。
    html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (match) => {
        const key = `%%RHT_STYLE_${styleSlots.length}%%`;
        const compactedStyle = match
            // 清理宿主换行转换残留；这是代码块与纯文字急救共用的样式整理底层。
            .replace(/<br\s*\/?>/gi, '')
            .replace(/\r\n?/g, '\n')
            .replace(/^[ \t]+/gm, '')
            .replace(/[ \t]+$/gm, '')
            .replace(/\n+/g, '')
            .replace(/>\s+</g, '><')
            .trim();
        styleSlots.push(compactedStyle.replace(
            /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/i,
            (full, openTag, css, closeTag) => {
                const commentStripped = stripCssComments(css);
                const svgDataUriNormalized = normalizeQuotedCssSvgDataUris(commentStripped);
                const repairedCss = repairMalformedCssDeclarations(svgDataUriNormalized);
                const scopedCss = scopeRabbitMirrorCssText(repairedCss, preparedScope.scopeSelector, classMap, checkedStateIds, keyframeMap);
                return `${openTag}${scopedCss}${closeTag}`;
            },
        ));
        return key;
    });

    // 2. 核心：清除每一行行首缩进，破坏 Markdown-it 的“行首 4 空格代码块”识别条件。
    html = html
        .replace(/\r\n?/g, '\n')
        .replace(/^[ \t]+/gm, '')
        .replace(/[ \t]+$/gm, '');

    // 3. 只删除标签之间的结构空白，尽量不碰属性文案。
    html = html
        .replace(/>\s+</g, '><')
        .replace(/\n(?=<)/g, '')
        .replace(/>\n/g, '>');

    // 4. 按标签切开：标签内换行压成空格；纯结构空白删除；真实文案里的换行转 <br>。
    html = html
        .split(/(<[^>]+>)/g)
        .map((part) => {
            if (!part) return '';
            if (part.startsWith('<')) {
                return part
                    .replace(/\s*\n\s*/g, ' ')
                    .replace(/[ \t]{2,}/g, ' ');
            }
            if (!part.trim()) return '';
            return part
                .replace(/[ \t]*\n[ \t]*/g, '<br>')
                .replace(/(?:<br>){3,}/g, '<br><br>');
        })
        .join('')
        .trim();

    // 5. 将当前兔子镜本地 CSS 使用的 class 与动画名改成逐镜唯一名称，
    // 阻断旧消息同名样式或 @keyframes 串入；只改 style 属性中的 animation 声明。
    html = rewriteRabbitMirrorClassAttributes(html, classMap);
    html = rewriteRabbitMirrorInlineAnimationStyles(html, keyframeMap);

    // 6. 还原 <style>。
    styleSlots.forEach((style, index) => {
        html = html.replace(`%%RHT_STYLE_${index}%%`, style);
    });

    return html
        .replace(CLASS_ATTR_RE, (match, quote, classValue) => {
            const kept = String(classValue || '')
                .split(/\s+/)
                .filter(token => token && !HIGHLIGHT_CLASS_TOKEN_RE.test(token));
            return kept.length ? ` class=${quote}${kept.join(' ')}${quote}` : '';
        })
        .replace(MULTI_BLANK_LINE_RE, '\n')
        .trim();
}

export function cleanRabbitMirrorOutput(responseText = '') {
    let text = repairMalformedRabbitMirrorMarkup(normalizeMirrorAttribute(stripHtmlComments(String(responseText || ''))))
        .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
        .replace(/\r\n?/g, '\n')
        .trim();

    // 1. 如果整个回复被一层 ```html 包住，先扒掉最外层。
    const wholeFence = text.match(WHOLE_FENCED_BLOCK_RE);
    if (wholeFence) {
        const payload = decodeHtmlEntities(wholeFence[1]).trim();
        if (TOTO_BLOCK_SINGLE_RE.test(payload) || looksLikeCompleteHtmlBlock(payload)) text = payload;
    }

    // 2. 先处理已经有 <toto> 外壳的块：拆掉内部 ```html / <pre><code>，再压缩。
    text = text.replace(TOTO_BLOCK_RE, (block) => compactTotoBlock(unwrapCodeBlocksInsideToto(block)));

    // 3. 再处理外层裸露的代码块：如果整块是兔子镜或裸 HTML，则补边界。
    text = text.replace(FENCED_BLOCK_RE, (match, payload) => {
        const cleaned = cleanCodeFencePayload(payload);
        return cleaned || match;
    }).trim();

    // 4. 兜底：残留的首尾三反引号。
    text = text
        .replace(/^\s*```(?:html|HTML|xml|XML)?\s*\n?/i, '')
        .replace(/\n?\s*```\s*$/i, '')
        .trim();

    // 5. 如果模型漏掉 <toto>，接管消息末尾的完整裸 HTML 小剧场并补上边界。
    text = wrapTrailingNakedHtml(text);

    // 6. 补完边界后再处理/压缩一次，确保内部代码块也被拆掉。
    text = text.replace(TOTO_BLOCK_RE, (block) => compactTotoBlock(unwrapCodeBlocksInsideToto(block)));

    return text.trim();
}

function needsSanitize(text) {
    const decoded = decodeHtmlEntities(String(text || ''));
    if (TOTO_BLOCK_SINGLE_RE.test(decoded)) return true;
    if (/```(?:html|HTML|xml|XML)?[\s\S]*?<toto\b/i.test(decoded)) return true;
    if (FENCED_BLOCK_RE.test(decoded)) {
        FENCED_BLOCK_RE.lastIndex = 0;
        let match;
        while ((match = FENCED_BLOCK_RE.exec(decoded))) {
            const raw = stripOneCodeFence(decodeHtmlEntities(match[1]));
            if (looksLikeCompleteHtmlBlock(raw) || TOTO_BLOCK_SINGLE_RE.test(raw)) {
                FENCED_BLOCK_RE.lastIndex = 0;
                return true;
            }
        }
        FENCED_BLOCK_RE.lastIndex = 0;
    }
    return wrapTrailingNakedHtml(decoded) !== decoded.trim();
}

function findRecentAssistantMessages(mod) {
    const chat = mod?.chat || globalThis.chat;
    if (!Array.isArray(chat) || !chat.length) return [];
    const start = Math.max(0, chat.length - 8);
    return chat
        .slice(start)
        .map((message, offset) => ({ message, index: start + offset }))
        .filter(({ message }) => !message?.is_user && typeof message?.mes === 'string');
}

function getRenderedMessageElement(index) {
    if (typeof document === 'undefined') return null;
    // SillyTavern 的 mesid 是聊天数组下标，只会是非负整数。
    const safeIndex = Number.isInteger(Number(index)) ? String(Number(index)) : '';
    return safeIndex ? document.querySelector(`#chat [mesid="${safeIndex}"]`) : null;
}

function renderedMessageHasCssError(index) {
    const messageElement = getRenderedMessageElement(index);
    if (!messageElement) return false;
    const text = messageElement.querySelector('.mes_text')?.textContent || messageElement.textContent || '';
    return /CSS\s+ERROR\s*:/i.test(text) && !!messageElement.querySelector('details, toto');
}

function preserveAndRerenderSanitizedMessage(mod, index, message) {
    try {
        const updater = mod?.updateMessageBlock || globalThis.updateMessageBlock;
        if (typeof updater !== 'function' || typeof document === 'undefined') return false;

        const messageElement = getRenderedMessageElement(index);
        const detailsOpenStates = messageElement
            ? [...messageElement.querySelectorAll('details')].map(details => details.open)
            : [];

        updater(index, message);

        // updateMessageBlock 会重建消息正文。恢复用户当时已展开的兔子镜，避免急救时突然收起。
        const restoredElement = getRenderedMessageElement(index);
        if (restoredElement && detailsOpenStates.length) {
            [...restoredElement.querySelectorAll('details')].forEach((details, detailsIndex) => {
                if (detailsOpenStates[detailsIndex]) details.open = true;
            });
        }
        return true;
    } catch (error) {
        console.debug('[RabbitMirror] rerender after sanitizer failed:', error);
        return false;
    }
}


const SOURCE_RECOVERY_COOLDOWN_MS = 1800;
const sourceRecoveryLastRun = new Map();
let codeShellRecoveryObserver = null;

function getMessageIndexFromElement(node) {
    const externalIndex = getExternalOwnerMessageIndex(node);
    if (externalIndex >= 0) return externalIndex;
    const messageElement = node?.closest?.('#chat [mesid], .mes[mesid]');
    const value = Number(messageElement?.getAttribute?.('mesid'));
    return Number.isInteger(value) && value >= 0 ? value : -1;
}

function getSourceRecoveryCandidate(message) {
    if (!message || message?.is_user) return '';
    const swipeIndex = Number.isInteger(message?.swipe_id) ? message.swipe_id : -1;
    const sources = [];
    if (typeof message?.extra?.display_text === 'string') sources.push(message.extra.display_text);
    if (swipeIndex >= 0 && typeof message?.swipes?.[swipeIndex] === 'string') sources.push(message.swipes[swipeIndex]);
    if (typeof message?.mes === 'string') sources.push(message.mes);

    for (const source of sources) {
        const decoded = decodeHtmlEntities(source);
        if (needsSanitize(decoded)) return decoded;
    }
    return '';
}

function recoverMessageSourceToDisplay(mod, index, message, { force = false, sourceOverride = '' } = {}) {
    if (!force || !message || message?.is_user) return false;
    const source = String(sourceOverride || getSourceRecoveryCandidate(message) || '');
    if (!source) return false;

    // 与思维链隔离保持一致：不得用含 reasoning 包裹的原始源瞬时重绘整条消息。
    if (TRANSIENT_RERENDER_REASONING_ENVELOPE_RE.test(source)) return false;

    const cleaned = cleanRabbitMirrorOutput(source);
    if (!cleaned || cleaned === source) return false;

    const signature = `${index}:${source.length}:${cleaned.length}`;
    const now = Date.now();
    const previous = sourceRecoveryLastRun.get(signature) || 0;
    if (!force && now - previous < SOURCE_RECOVERY_COOLDOWN_MS) return false;
    sourceRecoveryLastRun.set(signature, now);

    const transientMessage = cloneMessageForTransientRerender(message);
    transientMessage.mes = cleaned;
    if (Array.isArray(transientMessage.swipes)) {
        const swipeIndex = Number.isInteger(transientMessage.swipe_id)
            ? transientMessage.swipe_id
            : transientMessage.swipes.length - 1;
        if (typeof transientMessage.swipes[swipeIndex] === 'string') transientMessage.swipes[swipeIndex] = cleaned;
    }
    if (typeof transientMessage?.extra?.display_text === 'string') transientMessage.extra.display_text = cleaned;

    const rerendered = preserveAndRerenderSanitizedMessage(mod, index, transientMessage);
    return rerendered;
}


function parseHtmlFragment(html) {
    try {
        const template = document.createElement('template');
        template.innerHTML = html;
        return template.content.childNodes.length ? template.content.cloneNode(true) : null;
    } catch {
        return null;
    }
}

function parseTotoFragment(html) {
    try {
        const template = document.createElement('template');
        template.innerHTML = html;
        const toto = template.content.querySelector('toto[data-rabbit-mirror="true"], toto');
        return toto ? toto.cloneNode(true) : null;
    } catch {
        return null;
    }
}

const CODE_SHELL_SELECTOR = 'pre, code, .hljs, .code_block, .code-block, .codeblock, [class*="codeblock"], [class*="code-block"]';

function isCodeShellNode(node) {
    return !!node?.matches?.(CODE_SHELL_SELECTOR);
}

function findCodeReplaceTarget(node) {
    // 只替换真正的代码块节点；绝不根据父层文字或样式向上吞掉普通容器。
    // 因而主容器的 background / border / padding / radius / shadow / layout 会原样保留。
    if (!node?.closest) return null;
    const pre = node.closest('pre');
    if (pre) return pre;
    return isCodeShellNode(node) ? node : null;
}

function getChatRoot() {
    if (typeof document === 'undefined') return null;
    return document.querySelector('#chat')
        || document.querySelector('#chat_block')
        || document.querySelector('.chat')
        || document.querySelector('[id*=chat]');
}

function isInsideChatMessage(node) {
    const root = getChatRoot();
    if (!root || !node || !root.contains(node)) return false;
    // 只允许修聊天区，绝不碰扩展设置页/弹窗，避免再次影响其他插件勾选。
    // 注意：不要用 .drawer-content 做全局排除，部分主题/插件会把聊天消息也包在 drawer 类容器里。
    if (node.closest('#extensions_settings, #extensions_settings2, #rm_extensions_block, #extensionsMenu, .popup, .modal, .ui-dialog')) return false;
    const messageScope = node.closest('.mes, [mesid], .mes_text, [data-message-id], [data-messageid], .swipe_right, .swipe_left');
    return !!messageScope || root === node.closest('#chat') || root === node.closest('#chat_block');
}

function getCodeCandidateText(node) {
    const clone = node.cloneNode(true);
    // 去掉代码块工具栏文字，避免“隐藏代码块/复制”等字样影响 HTML 判断。
    for (const el of [...clone.querySelectorAll('button, .copy_code, .code-copy, .codeblock-header, .code_block_header, .toolbar, .hljs-button')]) el.remove();
    return clone.textContent || '';
}


function extractLikelyHtmlFromText(text) {
    let raw = stripOneCodeFence(decodeHtmlEntities(String(text || '')))
        .replace(/\u00a0/g, ' ')
        .trim();
    if (!raw) return '';

    // 去掉“隐藏代码块/复制”等代码块工具栏文字；有些主题会把它们混进 textContent。
    raw = raw
        .replace(/^(?:隐藏代码块|显示代码块|Hide code|Show code|Copy|Copied|复制|复制代码|代码块|Code)\s*/i, '')
        .trim();

    const startMatch = raw.match(/<\s*(?:toto|div|section|article|details)\b/i);
    if (!startMatch) return '';
    raw = raw.slice(startMatch.index).trim();

    // 如果末尾混入了复制按钮/提示文字，从最后一个可信闭合标签截断。
    const closingTags = ['</toto>', '</details>', '</article>', '</section>', '</div>'];
    let end = -1;
    for (const tag of closingTags) {
        const index = raw.toLowerCase().lastIndexOf(tag);
        if (index >= 0) end = Math.max(end, index + tag.length);
    }
    if (end >= 0) raw = raw.slice(0, end).trim();

    return raw;
}

function isRabbitMirrorDetails(details) {
    if (!details?.querySelector) return false;
    const summary = details.querySelector(':scope > summary') || details.querySelector('summary');
    const title = (summary?.textContent || '').replace(/\s+/g, ' ').trim();
    return /^【兔子镜[:：]/.test(title) || /兔子镜/.test(title);
}

function sanitizeRenderedRabbitMirrorDetailsInScope(root, force = false) {
    if (!force) return 0;
    if (!root?.querySelectorAll) return 0;
    let repairedCount = 0;
    const detailsList = [...root.querySelectorAll('toto details, details')].filter(isRabbitMirrorDetails);

    for (const details of detailsList) {
        if (!isInsideChatMessage(details)) continue;

        // 以 summary 为锚点修复：标题已经被渲染成功时，说明外层兔子镜成立；
        // 这时只要把 summary 后面被当成源码显示的 HTML 正文拆回真实 DOM。
        const candidates = [...details.querySelectorAll('pre, code, .hljs, .code_block, .code-block, .codeblock, [class*="codeblock"], [class*="code-block"]')]
            .filter(node => node !== details && !node.closest('summary'))
            .sort((a, b) => (b.querySelectorAll('*').length - a.querySelectorAll('*').length));

        for (const node of candidates) {
            if (!node?.isConnected || !details.contains(node)) continue;
            if (node.querySelector?.('toto, details')) continue;

            const raw = extractLikelyHtmlFromText(getCodeCandidateText(node));
            if (!raw) continue;

            let replacement = null;
            if (TOTO_BLOCK_SINGLE_RE.test(raw)) {
                const cleaned = cleanRabbitMirrorOutput(raw);
                const inner = cleaned
                    .replace(/^\s*<toto\b[^>]*>/i, '')
                    .replace(/<\/toto>\s*$/i, '')
                    .trim();
                replacement = parseHtmlFragment(compactTotoBlock(inner));
            } else if (looksLikeCompleteHtmlBlock(raw)) {
                replacement = parseHtmlFragment(compactTotoBlock(raw));
            }

            if (!replacement) continue;
            const target = findCodeReplaceTarget(node);
            if (target?.isConnected && details.contains(target) && isInsideChatMessage(target) && isCodeShellNode(target)) {
                target.replaceWith(replacement);
                repairedCount += 1;
                break;
            }
        }
    }
    return repairedCount;
}


function extractStrictWholeRabbitMirrorText(node) {
    if (!node) return '';
    const decoded = decodeHtmlEntities(String(node.textContent || ''))
        .replace(/\u00a0/g, ' ')
        .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
        .trim();
    if (!decoded) return '';

    const match = decoded.match(/^\s*(<toto\b[\s\S]*?<\/toto>)\s*$/i);
    if (!match) return '';
    const raw = match[1].trim();
    if (!/<toto\b[^>]*data-rabbit-mirror\s*=\s*["']true["']/i.test(raw)) return '';
    if (!/<details\b/i.test(raw) || !/<summary\b[^>]*>[\s\S]*?兔子镜/i.test(raw)) return '';
    return raw;
}

function sanitizeWholePlainTextRabbitMirrorsInScope(root, force = false) {
    if (!force) return 0;
    if (!root?.querySelectorAll) return 0;
    let repairedCount = 0;
    const messageBodies = root.matches?.('.mes_text') ? [root] : [...root.querySelectorAll('.mes_text')];
    for (const body of messageBodies) {
        if (!body?.isConnected || !isInsideChatMessage(body)) continue;
        if (body.querySelector('toto, details')) continue;

        const raw = extractStrictWholeRabbitMirrorText(body);
        if (!raw) continue;
        const cleaned = cleanRabbitMirrorOutput(raw);
        const match = cleaned.match(TOTO_BLOCK_SINGLE_RE);
        const replacement = match ? parseTotoFragment(match[0]) : null;
        if (!replacement) continue;

        // 只修当前显示层，不写回 mes/swipe/display_text，也不触发保存。
        body.replaceChildren(replacement);
        repairedCount += 1;
    }
    return repairedCount;
}


function sanitizeCodeBlocksInScope(root, force = false) {
    if (!force) return 0;
    if (!root?.querySelectorAll) return 0;
    let repairedCount = 0;
    const candidates = [...new Set([...root.querySelectorAll(CODE_SHELL_SELECTOR)])]
        .filter(node => !node.querySelector?.('pre, code') || node.matches('pre, code, .hljs'));

    for (const node of candidates) {
        if (!node?.isConnected || !isInsideChatMessage(node)) continue;
        const raw = stripOneCodeFence(decodeHtmlEntities(getCodeCandidateText(node)));
        if (!raw) continue;

        let replacement = null;
        const ownerDetails = node.closest('details');
        const insideRabbitMirror = !!node.closest(MIRROR_TOTO_SELECTOR) || !!(ownerDetails && isRabbitMirrorDetails(ownerDetails));

        if (TOTO_BLOCK_SINGLE_RE.test(raw)) {
            const cleaned = cleanRabbitMirrorOutput(raw);
            const match = cleaned.match(TOTO_BLOCK_SINGLE_RE);
            replacement = match ? parseTotoFragment(match[0]) : null;
        } else if (looksLikeCompleteHtmlBlock(raw)) {
            // 已经在兔子镜 details 里面时，只把代码块内容变成真实 HTML，避免再套一层小剧场。
            replacement = insideRabbitMirror
                ? parseHtmlFragment(compactTotoBlock(raw))
                : parseTotoFragment(wrapNakedHtmlAsToto(raw));
        }

        if (!replacement) continue;
        const target = findCodeReplaceTarget(node);
        if (target?.isConnected && isInsideChatMessage(target) && isCodeShellNode(target)) {
            target.replaceWith(replacement);
            repairedCount += 1;
        }
    }
    return repairedCount;
}










export function triggerInteractionDiagnosticOnce() {
    try {
        const chatRoot = getChatRoot();
        if (!chatRoot) return false;
        stopOneShotInteractionDiagnosticSession();
        removeAllInteractionDiagnosticPanels();

        const session = { chatRoot, root: null, state: null, handlers: {}, timers: [] };
        for (const type of ['click', 'input', 'change']) {
            const handler = event => handleOneShotInteractionDiagnosticEvent(session, event);
            session.handlers[type] = handler;
            chatRoot.addEventListener(type, handler, true);
        }
        session.timers.push(setTimeout(() => stopOneShotInteractionDiagnosticSession(), DIAGNOSTIC_WAIT_TIMEOUT_MS));
        oneShotInteractionDiagnosticSession = session;
        return true;
    } catch (error) {
        console.debug('[RabbitMirror] one-shot full diagnostic failed:', error);
        stopOneShotInteractionDiagnosticSession();
        return false;
    }
}






function getMessageIndexFromMirrorNode(node) {
    const externalIndex = getExternalOwnerMessageIndex(node);
    if (externalIndex >= 0) return externalIndex;
    const messageNode = node?.closest?.('.mes, [mesid], [data-message-id], [data-messageid]');
    if (!messageNode) return -1;
    const raw = messageNode.getAttribute('mesid')
        ?? messageNode.dataset?.messageId
        ?? messageNode.dataset?.messageid;
    const index = Number(raw);
    return Number.isInteger(index) && index >= 0 ? index : -1;
}

function cloneMessageForTransientRerender(message) {
    try {
        if (typeof structuredClone === 'function') return structuredClone(message);
    } catch {
        // fallback below
    }
    try {
        return JSON.parse(JSON.stringify(message));
    } catch {
        return { ...message };
    }
}

const TRANSIENT_RERENDER_REASONING_ENVELOPE_RE = /<\s*\/?\s*(?:thinking|think|analysis|reasoning|thought)\b[^>]*>/i;

function messageContainsReasoningEnvelope(message) {
    const candidates = [];
    const swipeIndex = Number.isInteger(message?.swipe_id) ? message.swipe_id : -1;
    if (swipeIndex >= 0 && typeof message?.swipes?.[swipeIndex] === 'string') candidates.push(message.swipes[swipeIndex]);
    if (typeof message?.mes === 'string') candidates.push(message.mes);
    if (typeof message?.extra?.display_text === 'string') candidates.push(message.extra.display_text);
    return candidates.some(source => TRANSIENT_RERENDER_REASONING_ENVELOPE_RE.test(decodeHtmlEntities(source)));
}

function messageUsesDistinctDisplaySource(message) {
    if (typeof message?.extra?.display_text !== 'string') return false;
    const displayText = decodeHtmlEntities(message.extra.display_text).trim();
    if (!displayText) return false;

    const swipeIndex = Number.isInteger(message?.swipe_id) ? message.swipe_id : -1;
    const rawSource = swipeIndex >= 0 && typeof message?.swipes?.[swipeIndex] === 'string'
        ? message.swipes[swipeIndex]
        : message?.mes;
    if (typeof rawSource !== 'string') return false;
    return displayText !== decodeHtmlEntities(rawSource).trim();
}










let chatInstallObserver = null;
let chatRootReadyObserver = null;
let observedChatInstallRoot = null;
let chatInstallDebounceTimer = 0;
const pendingObservedMessageRoots = new Set();
let toolEntryDelegationRoot = null;
let toolEntryDelegatedClickHandler = null;
let toolEntryDelegatedPointerHandler = null;

const maintenanceInstallTimers = new Set();

const maintenanceAutoSafePendingRoots = new Map();
const maintenanceAutoSafeBaselineSignatures = new Set();
const maintenanceAutoSafeAttemptedRoots = new WeakMap();
const maintenanceAutoSafeStartupCaptureTimers = new Set();
let maintenanceAutoSafeReady = false;
let maintenanceAutoSafeStartupTimer = 0;

function isMaintenanceAutoSafeEnabled() {
    const settings = getSettings();
    return settings.maintenanceRabbitEnabled !== false && settings.maintenanceRabbitAutoSafeEnabled === true;
}

function maintenanceAutoSafeSignature(root) {
    if (!root) return '';
    const chatKey = (() => {
        try { return String(getCurrentChatKey?.() || 'chat'); } catch { return 'chat'; }
    })();
    const messageIndex = getMessageIndexFromMirrorNode(root);
    const summary = getRabbitMirrorSummaryText(root).replace(/🐇[⚪🟢🟡🔴]?|🐈/g, '').trim();
    const source = getRawAssistantMessageForRenderedRoot(root) || root.outerHTML || root.textContent || '';
    return `${chatKey}:${messageIndex}:${hashInteractionSignature(`${summary}\n${source}`)}`;
}

function trimMaintenanceAutoSafeSet(set, max = 600) {
    while (set.size > max) set.delete(set.values().next().value);
}

function captureMaintenanceAutoSafeBaseline() {
    const chatRoot = getChatRoot();
    if (!chatRoot) return;
    for (const root of getRenderedRabbitMirrorInteractionRoots(chatRoot)) {
        const signature = maintenanceAutoSafeSignature(root);
        if (signature) maintenanceAutoSafeBaselineSignatures.add(signature);
    }
    trimMaintenanceAutoSafeSet(maintenanceAutoSafeBaselineSignatures);
}

function cancelMaintenanceAutoSafeTimers() {
    for (const [root, entry] of maintenanceAutoSafePendingRoots.entries()) {
        clearTimeout(entry.timer);
        if (root?.getAttribute?.(MAINTENANCE_AUTO_SAFE_ATTR) === 'pending') root.removeAttribute(MAINTENANCE_AUTO_SAFE_ATTR);
    }
    maintenanceAutoSafePendingRoots.clear();
    for (const timer of maintenanceAutoSafeStartupCaptureTimers) clearTimeout(timer);
    maintenanceAutoSafeStartupCaptureTimers.clear();
    if (maintenanceAutoSafeStartupTimer) clearTimeout(maintenanceAutoSafeStartupTimer);
    maintenanceAutoSafeStartupTimer = 0;
}

function initializeMaintenanceAutoSafeStartupGuard() {
    cancelMaintenanceAutoSafeTimers();
    maintenanceAutoSafeBaselineSignatures.clear();
    maintenancePreRepairSnapshots.clear();
    maintenanceAutoSafeReady = false;
    if (!isMaintenanceAutoSafeEnabled()) return;
    captureMaintenanceAutoSafeBaseline();
    for (const delay of [220, 760]) {
        const timer = setTimeout(() => {
            maintenanceAutoSafeStartupCaptureTimers.delete(timer);
            captureMaintenanceAutoSafeBaseline();
        }, delay);
        maintenanceAutoSafeStartupCaptureTimers.add(timer);
    }
    maintenanceAutoSafeStartupTimer = setTimeout(() => {
        for (const timer of maintenanceAutoSafeStartupCaptureTimers) clearTimeout(timer);
        maintenanceAutoSafeStartupCaptureTimers.clear();
        captureMaintenanceAutoSafeBaseline();
        maintenanceAutoSafeReady = true;
        maintenanceAutoSafeStartupTimer = 0;
    }, 1100);
}

export function configureMaintenanceAutoSafeMode(enabled) {
    cancelMaintenanceAutoSafeTimers();
    maintenanceAutoSafeBaselineSignatures.clear();
    maintenanceAutoSafeReady = !!enabled;
    if (enabled) captureMaintenanceAutoSafeBaseline();
}

function scheduleMaintenanceAutoSafeForRoot(root, button) {
    if (!isMaintenanceAutoSafeEnabled() || !root?.isConnected || !button?.isConnected) return false;
    const signature = maintenanceAutoSafeSignature(root);
    if (!signature) return false;
    if (!maintenanceAutoSafeReady) {
        maintenanceAutoSafeBaselineSignatures.add(signature);
        return false;
    }
    if (maintenanceAutoSafeBaselineSignatures.has(signature)) return false;
    if (maintenanceAutoSafeAttemptedRoots.get(root) === signature) return false;

    const pending = maintenanceAutoSafePendingRoots.get(root);
    if (pending?.signature === signature) return false;
    if (pending?.timer) clearTimeout(pending.timer);

    root.setAttribute(MAINTENANCE_AUTO_SAFE_ATTR, 'pending');
    const timer = setTimeout(() => {
        maintenanceAutoSafePendingRoots.delete(root);
        if (!isMaintenanceAutoSafeEnabled() || !maintenanceAutoSafeReady) return;
        if (!root?.isConnected || !button?.isConnected) return;
        const liveSignature = maintenanceAutoSafeSignature(root);
        if (liveSignature !== signature) {
            scheduleMaintenanceAutoSafeForRoot(root, button);
            return;
        }
        maintenanceAutoSafeAttemptedRoots.set(root, signature);
        root.setAttribute(MAINTENANCE_AUTO_SAFE_ATTR, 'attempted');
        runMaintenanceSafeAutomaticRepairs(root, button);
    }, 720);
    maintenanceAutoSafePendingRoots.set(root, { signature, timer });
    return true;
}

function scheduleMaintenanceRabbitInstall() {
    if (!isCurrentRuntime()) return;
    // One coalesced pass is enough. The old 120ms + 900ms pair multiplied full-chat
    // scans when several SillyTavern events fired for the same render on mobile.
    if (maintenanceInstallTimers.size) return;
    const timer = setTimeout(() => {
        maintenanceInstallTimers.delete(timer);
        installMaintenanceRabbitsInChatDom();
    }, 180);
    maintenanceInstallTimers.add(timer);
}

function scheduleObservedChatInstall(messageRoots = []) {
    if (!isCurrentRuntime()) return;
    for (const root of messageRoots) if (root?.isConnected) pendingObservedMessageRoots.add(root);
    if (chatInstallDebounceTimer) return;
    chatInstallDebounceTimer = setTimeout(() => {
        chatInstallDebounceTimer = 0;
        const roots = [...pendingObservedMessageRoots];
        pendingObservedMessageRoots.clear();
        for (const root of roots) {
            try { installMaintenanceRabbitsInScope(root); }
            catch (error) { console.debug('[RabbitMirror] scoped tool install skipped:', error); }
        }
    }, 120);
}

function removeToolEntryDelegation() {
    if (toolEntryDelegationRoot && toolEntryDelegatedClickHandler) {
        toolEntryDelegationRoot.removeEventListener('click', toolEntryDelegatedClickHandler, true);
    }
    if (toolEntryDelegationRoot && toolEntryDelegatedPointerHandler) {
        toolEntryDelegationRoot.removeEventListener('pointerdown', toolEntryDelegatedPointerHandler, true);
    }
    toolEntryDelegationRoot = null;
    toolEntryDelegatedClickHandler = null;
    toolEntryDelegatedPointerHandler = null;
}

function installToolEntryDelegation(chatRoot = getChatRoot()) {
    if (!isCurrentRuntime() || !chatRoot?.addEventListener) return false;
    if (toolEntryDelegationRoot === chatRoot && toolEntryDelegatedClickHandler) return true;
    removeToolEntryDelegation();
    toolEntryDelegationRoot = chatRoot;
    toolEntryDelegatedPointerHandler = event => {
        const button = event.target?.closest?.(`[${MAINTENANCE_RABBIT_ATTR}], [${FEEDBACK_CAT_ATTR}]`);
        if (!button || !chatRoot.contains(button)) return;
        event.stopPropagation();
    };
    toolEntryDelegatedClickHandler = event => {
        const button = event.target?.closest?.(`[${MAINTENANCE_RABBIT_ATTR}], [${FEEDBACK_CAT_ATTR}]`);
        if (!button || !chatRoot.contains(button)) return;
        const root = rabbitMirrorToolRootFromButton(button);
        if (!root) return;
        if (button.matches(`[${MAINTENANCE_RABBIT_ATTR}]`)) {
            handleMaintenanceRabbitClick(event, root, button);
            return;
        }
        handleFeedbackCatClick(event, root, button);
    };
    chatRoot.addEventListener('pointerdown', toolEntryDelegatedPointerHandler, true);
    chatRoot.addEventListener('click', toolEntryDelegatedClickHandler, true);
    return true;
}

function installChatMutationObserver() {
    if (!isCurrentRuntime() || typeof MutationObserver === 'undefined') return false;
    const chatRoot = getChatRoot();
    if (!chatRoot) return false;
    installToolEntryDelegation(chatRoot);
    if (chatInstallObserver && observedChatInstallRoot === chatRoot) return true;
    chatInstallObserver?.disconnect?.();
    observedChatInstallRoot = chatRoot;
    chatInstallObserver = new MutationObserver(mutations => {
        const messageRoots = new Set();
        for (const mutation of mutations) {
            if (mutation.type !== 'childList') continue;
            const targetElement = mutation.target?.nodeType === 1 ? mutation.target : mutation.target?.parentElement;
            // External mirrors install their tools synchronously. Never observe their internal
            // replacement, animation or tool DOM, otherwise the two observers can ping-pong.
            if (targetElement?.closest?.(`[${TOOL_ENTRY_HOST_ATTR}], [${MAINTENANCE_RABBIT_ATTR}], [${FEEDBACK_CAT_ATTR}], [data-rabbit-mirror-external-source]`)) continue;
            const added = [...(mutation.addedNodes || [])].filter(node => node?.nodeType === 1);
            const relevant = added.some(node => {
                if (node.matches?.(`[${TOOL_ENTRY_HOST_ATTR}], [${MAINTENANCE_RABBIT_ATTR}], [${FEEDBACK_CAT_ATTR}], [data-rabbit-mirror-external-source]`)) return false;
                return node.matches?.('toto, details, .mes, .mes_text')
                    || !!node.querySelector?.('toto, details');
            });
            if (!relevant) continue;
            const message = targetElement?.closest?.('.mes, [mesid]');
            if (message) messageRoots.add(message);
            for (const node of added) {
                const ownMessage = node.matches?.('.mes, [mesid]') ? node : node.closest?.('.mes, [mesid]');
                if (ownMessage) messageRoots.add(ownMessage);
            }
        }
        if (messageRoots.size) scheduleObservedChatInstall(messageRoots);
    });
    // Tool installation only needs structural insertions. Watching class/style/hidden and
    // characterData reacts to CSS animation and generated UI updates and can saturate Safari.
    chatInstallObserver.observe(chatRoot, { childList: true, subtree: true });
    return true;
}

function installChatRootReadyObserver() {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined' || !document.body) return;
    chatRootReadyObserver?.disconnect?.();
    chatRootReadyObserver = null;
    if (installChatMutationObserver()) return;
    chatRootReadyObserver = new MutationObserver(() => {
        if (!installChatMutationObserver()) return;
        chatRootReadyObserver?.disconnect?.();
        chatRootReadyObserver = null;
        scheduleMaintenanceRabbitInstall();
    });
    chatRootReadyObserver.observe(document.body, { childList: true, subtree: true });
}

function unsubscribeOutputHostEvents() {
    for (const { eventSource, eventName, handler } of outputHostSubscriptions) {
        try { eventSource?.off?.(eventName, handler); } catch {}
    }
    outputHostSubscriptions = [];
}

export async function initOutputSanitizer() {
    if (!isCurrentRuntime()) return;
    try { globalThis.__rabbitMirrorOutputSanitizerCleanup?.(); } catch {}
    globalThis.__rabbitMirrorOutputSanitizerCleanup = destroyOutputSanitizer;
    unsubscribeOutputHostEvents();
    ensureFeedbackCatRuntimeStyle();
    initializeMaintenanceAutoSafeStartupGuard();
    // DOM 安装链不依赖宿主事件模块是否成功导入：即使热重载或宿主事件名变化，
    // 维修兔与挨打猫仍会通过聊天区观察器安装到现有和后续兔子镜标题。
    installChatRootReadyObserver();
    installToolEntryDelegation();
    installChatMutationObserver();
    scheduleMaintenanceRabbitInstall();
    installMaintenanceRabbitsInChatDom();

    try {
        const mod = await import('../../../../../script.js');
        hostScriptModule = mod;
        const eventSource = mod?.eventSource;
        const eventTypes = mod?.event_types || {};
        if (eventSource?.on) {
            const installEvents = [
                eventTypes.GENERATION_STOPPED,
                eventTypes.GENERATION_ENDED,
                eventTypes.CHARACTER_MESSAGE_RENDERED,
                eventTypes.CHAT_CHANGED,
                eventTypes.MESSAGE_SWIPED,
                eventTypes.MESSAGE_UPDATED,
                eventTypes.MESSAGE_EDITED,
            ].filter(Boolean);
            for (const eventName of [...new Set(installEvents)]) {
                const handler = () => {
                    installChatMutationObserver();
                    scheduleMaintenanceRabbitInstall();
                };
                eventSource.on(eventName, handler);
                outputHostSubscriptions.push({ eventSource, eventName, handler });
            }
        }
        console.debug('[RabbitMirror] output sanitizer initialized (maintenance rabbit + feedback cat)');
    } catch (error) {
        console.debug('[RabbitMirror] host event integration unavailable; DOM observer fallback remains active:', error);
    }
}


export function destroyOutputSanitizer() {
    unsubscribeOutputHostEvents();
    chatInstallObserver?.disconnect?.();
    chatInstallObserver = null;
    chatRootReadyObserver?.disconnect?.();
    chatRootReadyObserver = null;
    removeToolEntryDelegation();
    observedChatInstallRoot = null;
    if (chatInstallDebounceTimer) {
        clearTimeout(chatInstallDebounceTimer);
        chatInstallDebounceTimer = 0;
    }
    pendingObservedMessageRoots.clear();
    for (const timer of maintenanceInstallTimers) clearTimeout(timer);
    maintenanceInstallTimers.clear();
    cancelMaintenanceAutoSafeTimers();
    maintenanceAutoSafeBaselineSignatures.clear();
    maintenancePreRepairSnapshots.clear();
    maintenanceAutoSafeReady = false;
    removeMaintenanceRabbitsInChatDom();
    removeFeedbackCatsInChatDom();
    closeMaintenanceRabbitMenu();
    closeFeedbackCatMenu();
    document?.getElementById?.(FEEDBACK_CAT_RUNTIME_STYLE_ID)?.remove?.();
    if (globalThis.__rabbitMirrorOutputSanitizerCleanup === destroyOutputSanitizer) delete globalThis.__rabbitMirrorOutputSanitizerCleanup;
}
