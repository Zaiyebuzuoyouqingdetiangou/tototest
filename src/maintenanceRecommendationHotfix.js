const VERSION = '1.4.6';
const BUTTON_SELECTOR = '[data-rabbit-mirror-maintenance-rabbit="true"]';
const MENU_RECOMMENDATION_SELECTOR = '.rabbit-mirror-maintenance-recommendation[data-rm-recommended-action="manual"]';
const STATE_ATTR = 'data-rabbit-mirror-maintenance-state';
const REASON_ATTR = 'data-rabbit-mirror-maintenance-reason';
const RECOMMENDATION_ATTR = 'data-rabbit-mirror-maintenance-recommendation';

let pointerHandler = null;
let focusHandler = null;
let clickHandler = null;
let menuTimer = 0;

const ROUTES = Object.freeze([
    {
        id: 'source',
        label: '📄 空白或显示代码、纯文字',
        pattern: /(?:源码|空白|显示代码|纯文字|代码块|转义标签|toto\s*标签|原始源|source\s*truncation)/i,
    },
    {
        id: 'style',
        label: '🎨 样子不对',
        pattern: /(?:结构／样式|结构\/样式|样式|CSS|data\s*URI|3D\s*翻面|WebKit|兼容)/i,
    },
    {
        id: 'text',
        label: '📱 排版不适配／内容显示不全',
        pattern: /(?:显示：|排版|内容显示不全|手机端|窄屏|裁切|溢出|overflow|低对比|文字可能被裁切|横向|压窄)/i,
    },
    {
        id: 'interaction',
        label: '🖱️ 点了没有反应',
        pattern: /(?:交互：|交互|checked|checkbox|radio|label|点击|触发器|第二层|Hover|Active|focus|控件)/i,
    },
]);

function baseTitle(value = '') {
    return String(value || '').replace(/；?推荐使用：[^：\n]*(?: → [^：\n]*)*$/u, '').trim();
}

export function getRabbitMirrorMaintenanceRecommendation(stateValue = '', reasonValue = '') {
    const state = String(stateValue || '');
    const reason = String(reasonValue || '').trim();
    if (!reason || state === 'idle' || state === 'healthy' || state === 'checking') return '';

    const labels = [];
    for (const route of ROUTES) {
        if (!route.pattern.test(reason) || labels.includes(route.label)) continue;
        labels.push(route.label);
    }
    if (labels.length) return `推荐使用：${labels.join(' → ')}`;

    if (state === 'unknown' && !/独立\s*API\s*生成失败|兔子镜正在生成中/i.test(reason)) {
        return '推荐使用：📋 生成全链路诊断';
    }
    return '';
}

function recommendationForButton(button) {
    if (!button?.getAttribute) return '';
    return getRabbitMirrorMaintenanceRecommendation(
        button.getAttribute(STATE_ATTR),
        button.getAttribute(REASON_ATTR),
    );
}

function mergeMaintenanceProblemAndRecommendation(problemText = '', recommendation = '') {
    const problem = String(problemText || '').trim();
    const suggestion = String(recommendation || '').trim();
    if (!suggestion) return problem;
    if (!problem) return suggestion;
    if (problem.split(/\r?\n/u).some(line => line.trim() === suggestion)) return problem;
    return `${problem}\n${suggestion}`;
}

function decorateButton(button) {
    if (!button?.matches?.(BUTTON_SELECTOR)) return '';
    const recommendation = recommendationForButton(button);
    if (recommendation) button.setAttribute(RECOMMENDATION_ATTR, recommendation);
    else button.removeAttribute(RECOMMENDATION_ATTR);

    const cleanTitle = baseTitle(button.getAttribute('title') || '');
    const title = recommendation ? `${cleanTitle}${cleanTitle ? '；' : ''}${recommendation}` : cleanTitle;
    if (title && button.getAttribute('title') !== title) button.setAttribute('title', title);
    if (title && button.getAttribute('aria-label') !== title) button.setAttribute('aria-label', title);
    return recommendation;
}

function buttonFromEvent(event) {
    const target = event?.target;
    return target?.closest?.(BUTTON_SELECTOR) || null;
}

function updateOpenMenu(button) {
    if (menuTimer) clearTimeout(menuTimer);
    menuTimer = setTimeout(() => {
        menuTimer = 0;
        if (!button?.isConnected) return;
        const recommendation = decorateButton(button);
        if (!recommendation) return;
        const panel = document.querySelector(MENU_RECOMMENDATION_SELECTOR);
        if (!panel) return;
        panel.textContent = mergeMaintenanceProblemAndRecommendation(panel.textContent, recommendation);
        panel.setAttribute('data-rm-recommended-action', 'detected');
    }, 0);
}

export function initRabbitMirrorMaintenanceRecommendationHotfix() {
    destroyRabbitMirrorMaintenanceRecommendationHotfix();
    if (typeof document === 'undefined') return;
    pointerHandler = event => decorateButton(buttonFromEvent(event));
    focusHandler = event => decorateButton(buttonFromEvent(event));
    clickHandler = event => {
        const button = buttonFromEvent(event);
        if (!button) return;
        decorateButton(button);
        updateOpenMenu(button);
    };
    document.addEventListener('pointerover', pointerHandler, true);
    document.addEventListener('focusin', focusHandler, true);
    document.addEventListener('click', clickHandler, true);
}

export function destroyRabbitMirrorMaintenanceRecommendationHotfix() {
    if (typeof document !== 'undefined') {
        if (pointerHandler) document.removeEventListener('pointerover', pointerHandler, true);
        if (focusHandler) document.removeEventListener('focusin', focusHandler, true);
        if (clickHandler) document.removeEventListener('click', clickHandler, true);
    }
    pointerHandler = null;
    focusHandler = null;
    clickHandler = null;
    if (menuTimer) clearTimeout(menuTimer);
    menuTimer = 0;
}

export const MAINTENANCE_RECOMMENDATION_VERSION = VERSION;
