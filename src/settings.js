import { extension_settings } from '../../../../extensions.js';
import { saveSettingsDebounced } from '../../../../../script.js';

export const MODULE_NAME = 'rabbit_mirror_theater';

export const DEFAULT_VISUAL_PROMPT = String.raw`兔子镜默认视觉规则:
  - 不得以通用圆角面板、卡片列表、数据仪表盘或信息框作为默认主体，再向其中填入本轮内容。
  - 当展现形式本身属于平面媒介时，其纸面、印刷面、画布、版式、纹理、边缘与承载内容可以直接构成主要视觉本体，不视为通用面板。
  - 主背景、主要承载面、文字、边界、阴影、发光和强调色，必须配合该形式实际采用的材质、环境和光线；不得预设固定的界面配色组合。
  - 标题和情绪词只能影响已经成立的画面本体，不能单独触发预设的界面底盘、警报结构或科技仪表盘。
  - 仅替换标题和正文就能直接用于其他题材的通用界面，属于不合格输出。

色彩组织:
  - 配色必须形成明确的主次关系，由主要色彩关系统领画面，再用有限的辅助色与局部强调色建立层次；不得让所有颜色平均分布或同时抢眼。
  - 不得为了避免重复或追求独特强行改变色相，也不得加入不属于媒介的霓虹、光晕或高饱和强调色。
  - 主背景、承载面、正文、装饰与交互状态须通过明度、饱和度、冷暖、透明度和材质差异清晰分层，并保持相互呼应。
  - 强调色只用于真正需要聚焦的主体、关系节点或状态变化，数量与面积必须克制。
  - 材质色、环境光与阴影必须共同作用，不能只给不同区域机械填充不同色块。
  - 视觉质感应由比例、留白、层次、材质、光影与色彩关系共同成立，不得依靠堆叠渐变、发光、阴影或高饱和色制造表面效果。
  - 当展现形式适合单色、低彩度或有限色域时，可以保持克制，但仍须依靠明度、纹理、材质与空间层次形成完整视觉。`;

function cloneDefaultSettings() {
    return typeof structuredClone === 'function'
        ? structuredClone(defaultSettings)
        : JSON.parse(JSON.stringify(defaultSettings));
}

export const defaultSettings = Object.freeze({
    enabled: true,
    autoRabbitMirrorInjection: true,
    mode: 'integrated',
    generationSource: 'follow',
    followDisplayMode: 'inline',
    independentApiBaseUrl: '',
    independentApiKey: '',
    independentApiModel: '',
    independentApiTemperature: 0.8,
    independentApiMaxTokens: 12000,
    independentDisplayMode: 'external',
    samplingMode: 'classic',
    rawPolicy: 'balanced',
    showCot: false,
    includeSafetyPatch: false,
    avoidRepeat: true,
    cooldownRounds: 10,
    richFormatBias: false,
    maintenanceRabbitEnabled: true,
    maintenanceRabbitAutoSafeEnabled: false,
    feedbackCatEnabled: true,
    visualPrompt: DEFAULT_VISUAL_PROMPT,
    visualExtraPrompt: '',
    visualAvoidPrompt: '',

    hardStartup: true,
    hardChineseLock: true,
    userDirectivePriority: true,
    creativeExpansionMode: false,
    forceVisualScenery: false,
    memoryScanEnabled: false,
    memoryProviderIds: [],
    memoryMaxChars: 2200,
    themesMin: 1,
    themesMax: 3,
    formatsMin: 1,
    formatsMax: 2,
    depth: 0,
    role: 'system',
    skipQuiet: true,
    skipImpersonate: true,
    debug: false,
});

export function getSettings() {
    if (!extension_settings[MODULE_NAME] || typeof extension_settings[MODULE_NAME] !== 'object') {
        extension_settings[MODULE_NAME] = cloneDefaultSettings();
    }
    const settings = extension_settings[MODULE_NAME];
    const legacyRescueWasEnabled = !!(settings.plainTextRescueMode || settings.codeBlockRescueMode || settings.interactionRescueMode);
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (settings[key] === undefined) settings[key] = value;
    }

    if (settings.mode === 'canon' || settings.mode === 'off') {
        settings.mode = settings.mode === 'off' ? 'off' : 'integrated';
    }
    if (!['follow', 'independent'].includes(settings.generationSource)) settings.generationSource = 'follow';
    if (!['inline', 'external'].includes(settings.followDisplayMode)) settings.followDisplayMode = 'inline';
    if (!['external', 'external_then_inline'].includes(settings.independentDisplayMode)) settings.independentDisplayMode = 'external';
    settings.independentApiBaseUrl = String(settings.independentApiBaseUrl || '').trim();
    settings.independentApiKey = String(settings.independentApiKey || '').trim();
    settings.independentApiModel = String(settings.independentApiModel || '').trim();
    {
        const temperature = Number(settings.independentApiTemperature);
        settings.independentApiTemperature = Math.max(0, Math.min(2, Number.isFinite(temperature) ? temperature : 0.8));
    }
    settings.independentApiMaxTokens = Math.max(512, Math.min(32000, Number(settings.independentApiMaxTokens) || 12000));

    if (settings.showCot === undefined && settings.showWonderland !== undefined) {
        settings.showCot = !!settings.showWonderland;
    }
    if (settings.showWonderland !== undefined) delete settings.showWonderland;
    if (settings.forceInteractiveMode !== undefined) delete settings.forceInteractiveMode;
    if (settings.uiAudit !== undefined) delete settings.uiAudit;

    // Remove settings left by features that no longer exist in this build.
    for (const key of Object.keys(settings)) {
        if (!(key in defaultSettings)) delete settings[key];
    }

    settings.themesMin = Number(settings.themesMin) || defaultSettings.themesMin;
    settings.themesMax = Number(settings.themesMax) || defaultSettings.themesMax;
    settings.formatsMin = Number(settings.formatsMin) || defaultSettings.formatsMin;
    settings.formatsMax = Number(settings.formatsMax) || defaultSettings.formatsMax;
    settings.cooldownRounds = Math.max(1, Number(settings.cooldownRounds) || defaultSettings.cooldownRounds);
    if (settings.autoRabbitMirrorInjection === undefined) settings.autoRabbitMirrorInjection = settings.enabled !== false;
    if (settings.maintenanceRabbitEnabled === undefined) {
        settings.maintenanceRabbitEnabled = legacyRescueWasEnabled || defaultSettings.maintenanceRabbitEnabled;
    }
    settings.maintenanceRabbitEnabled = !!settings.maintenanceRabbitEnabled;
    settings.maintenanceRabbitAutoSafeEnabled = !!settings.maintenanceRabbitAutoSafeEnabled;
    if (!settings.maintenanceRabbitEnabled) settings.maintenanceRabbitAutoSafeEnabled = false;
    settings.feedbackCatEnabled = settings.feedbackCatEnabled !== false;
    const normalizeVisualSetting = (value, fallback, maxChars) => {
        const raw = typeof value === 'string' ? value : String(value ?? fallback);
        if (raw.length <= maxChars && raw.indexOf('\r') < 0) return raw;
        return raw.replace(/\r\n?/g, '\n').slice(0, maxChars);
    };
    settings.visualPrompt = normalizeVisualSetting(settings.visualPrompt, DEFAULT_VISUAL_PROMPT, 8000);
    settings.visualExtraPrompt = normalizeVisualSetting(settings.visualExtraPrompt, '', 4000);
    settings.visualAvoidPrompt = normalizeVisualSetting(settings.visualAvoidPrompt, '', 4000);

    delete settings.plainTextRescueMode;
    delete settings.codeBlockRescueMode;
    delete settings.interactionRescueMode;
    if (!['classic', 'format_only'].includes(settings.samplingMode)) settings.samplingMode = defaultSettings.samplingMode;
    if (!['compact', 'balanced', 'full'].includes(settings.rawPolicy)) settings.rawPolicy = defaultSettings.rawPolicy;
    if (!Array.isArray(settings.memoryProviderIds)) settings.memoryProviderIds = [];
    settings.memoryProviderIds = settings.memoryProviderIds.map(value => {
        const id = String(value || '');
        return id === 'baibai-book' ? 'global:STBaiBaiBook' : id;
    });
    settings.memoryProviderIds = [...new Set(settings.memoryProviderIds.filter(Boolean))].slice(0, 12);
    settings.memoryScanEnabled = !!settings.memoryScanEnabled;
    settings.memoryMaxChars = Math.max(600, Math.min(6000, Number(settings.memoryMaxChars) || defaultSettings.memoryMaxChars));
    settings.richFormatBias = false;
    settings.depth = Number(settings.depth) || 0;
    return settings;
}

export function updateSettings(patch) {
    Object.assign(getSettings(), patch);
    saveSettingsDebounced();
}

export function resetSettings() {
    extension_settings[MODULE_NAME] = cloneDefaultSettings();
    saveSettingsDebounced();
}
