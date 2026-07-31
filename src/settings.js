import { extension_settings } from '../../../../extensions.js';
import { saveSettingsDebounced } from '../../../../../script.js';

export const MODULE_NAME = 'rabbit_mirror_theater';

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
    settings.independentApiTemperature = Math.max(0, Math.min(2, Number(settings.independentApiTemperature) || 0.8));
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
