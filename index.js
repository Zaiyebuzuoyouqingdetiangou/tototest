import { initRabbitMirrorUI, destroyRabbitMirrorUI } from './src/ui.js?rmv=1.4.9-chatsafety1';
import { rabbitMirrorGenerateInterceptor, clearRabbitMirrorPrompt } from './src/injector.js?rmv=1.4.9-chatsafety1';
import { clearLastCombo } from './src/storage.js?rmv=1.4.9-chatsafety1';
import { initVisualScanner, destroyVisualScanner } from './src/visualScanner.js?rmv=1.4.9-chatsafety1';
import { initOutputSanitizer, destroyOutputSanitizer } from './src/outputSanitizer.js?rmv=1.4.9-chatsafety1';
import { clearAllFeedbackCatState, destroyFeedbackCatPromptSync, initFeedbackCatPromptSync } from './src/feedbackCat.js?rmv=1.4.9-chatsafety1';
import { getSettings, updateSettings } from './src/settings.js?rmv=1.4.9-chatsafety1';
import { clearRabbitMirrorGenerationSnapshots } from './src/generationGuard.js?rmv=1.4.9-chatsafety1';
import { initIndependentRabbitMirror, destroyIndependentRabbitMirror, getIndependentConnectionProfiles, refreshRabbitMirrorGenerationMode } from './src/independentApi.js?rmv=1.4.9-chatsafety1';
import { initTouchTheaterBridge, destroyTouchTheaterBridge } from './src/touchTheater.js?rmv=1.4.9-chatsafety1';
import { initRabbitMirrorIndependentSecurityGuard, destroyRabbitMirrorIndependentSecurityGuard } from './src/independentSecurityGuard.js?rmv=1.4.9-chatsafety1';

// GoldenMerge2 keeps the proven 1.4.30.14 core boot shape. Compatibility layers
// are no longer loaded on a timer after first paint: they are imported only when
// the user first enters the UI surface that needs them.
const GOLDEN_MERGE_VERSION = '1.4.9-goldenmerge2';
const RABBIT_MIRROR_RUNTIME_VERSION = '1.4.30.17';
let runtimeCancelled = false;
const optionalModules = new Map();
const optionalPromises = new Map();
let lazyPointerHandler = null;
let lazyFocusHandler = null;
let lazyToggleHandler = null;

try { globalThis.__rabbitMirrorFeedbackCatSyncCleanup?.(); } catch {}
globalThis.__rabbitMirrorRuntimeVersion = RABBIT_MIRROR_RUNTIME_VERSION;
globalThis.rabbitMirrorGenerateInterceptor = rabbitMirrorGenerateInterceptor;
globalThis.__rabbitMirrorGoldenMerge = {
    version: GOLDEN_MERGE_VERSION,
    optionalLoaded: () => [...optionalModules.keys()],
};

function initCoreRuntime() {
    if (runtimeCancelled) return false;
    initFeedbackCatPromptSync(() => getSettings().feedbackCatEnabled !== false);
    globalThis.__rabbitMirrorFeedbackCatSyncCleanup = destroyFeedbackCatPromptSync;
    initRabbitMirrorIndependentSecurityGuard({ getSettings, updateSettings });
    initRabbitMirrorUI();
    initOutputSanitizer();
    initVisualScanner();
    initIndependentRabbitMirror();
    initTouchTheaterBridge();
    return true;
}

function loadOptional(name, specifier, init) {
    if (runtimeCancelled) return Promise.resolve(null);
    if (optionalModules.has(name)) return Promise.resolve(optionalModules.get(name));
    if (optionalPromises.has(name)) return optionalPromises.get(name);
    const promise = import(specifier).then(mod => {
        optionalPromises.delete(name);
        if (runtimeCancelled) return null;
        optionalModules.set(name, mod);
        try { init?.(mod); } catch (error) { console.warn(`[RabbitMirror] ${name} init failed:`, error); }
        return mod;
    }).catch(error => {
        optionalPromises.delete(name);
        console.warn(`[RabbitMirror] optional ${name} failed to load:`, error);
        return null;
    });
    optionalPromises.set(name, promise);
    return promise;
}

function loadProfileSelector() {
    return loadOptional('profileSelector', './src/independentProfileSelectorHotfix.js?rmv=1.4.7-test', mod => {
        mod.initRabbitMirrorIndependentProfileSelectorHotfix?.({
            getSettings,
            updateSettings,
            getIndependentConnectionProfiles,
            refreshRabbitMirrorGenerationMode,
        });
    });
}

function loadMirrorInteractionCompat(sourceEvent = null) {
    const checked = loadOptional('checkedSelectorRepair', './src/checkedSelectorRepair.js?rmv=1.4.30.26', mod => mod.initRabbitMirrorCheckedSelectorRepair?.());
    const rendered = loadOptional('renderedVisualFeedback', './src/renderedVisualFeedbackHotfix.js?rmv=1.4.9-chatsafety1', mod => mod.initRabbitMirrorRenderedVisualFeedbackHotfix?.());
    const maintenance = loadOptional('maintenanceRecommendation', './src/maintenanceRecommendationHotfix.js?rmv=1.4.5', mod => mod.initRabbitMirrorMaintenanceRecommendationHotfix?.());
    // If the first action already opened a details element before the small module finished,
    // replay only the harmless toggle notification so rendered feedback sees that open state.
    void rendered.then(() => {
        const details = sourceEvent?.target?.closest?.('details');
        if (details?.isConnected && details.open) {
            try { details.dispatchEvent(new Event('toggle')); } catch {}
        }
    });
    return Promise.all([checked, rendered, maintenance]);
}

function mobileLike() {
    try {
        return globalThis.matchMedia?.('(max-width: 900px), (pointer: coarse)')?.matches === true;
    } catch { return false; }
}

function loadMobileModalCompat() {
    if (!mobileLike()) return Promise.resolve(null);
    return loadOptional('mobileModal', './src/mobileModalHotfix.js?rmv=1.4.30.19', mod => mod.initRabbitMirrorMobileModalHotfix?.());
}

function isRabbitMirrorSurface(target) {
    return !!target?.closest?.('[data-rabbit-mirror-external-source="true"], toto[data-rabbit-mirror], toto, .rabbit-mirror-maintenance-toolbar');
}

function isRabbitMirrorSettingsSurface(target) {
    return !!target?.closest?.('#rabbit_mirror_theater_settings, #rh_independent_api_fields, #rh_generation_independent');
}

function installOnDemandCompatTriggers() {
    if (typeof document === 'undefined') return;
    lazyPointerHandler = event => {
        const target = event?.target;
        if (!target?.closest) return;
        if (isRabbitMirrorSettingsSurface(target)) {
            void loadProfileSelector();
            void loadMobileModalCompat();
        }
        if (isRabbitMirrorSurface(target)) void loadMirrorInteractionCompat(event);
    };
    lazyFocusHandler = event => {
        const target = event?.target;
        if (!target?.closest) return;
        if (isRabbitMirrorSettingsSurface(target)) void loadProfileSelector();
        if (target.closest?.('[data-rabbit-mirror-maintenance-rabbit="true"]')) void loadMirrorInteractionCompat(event);
    };
    lazyToggleHandler = event => {
        const details = event?.target;
        if (details?.closest?.('[data-rabbit-mirror-external-source="true"], toto[data-rabbit-mirror], toto')) void loadMirrorInteractionCompat(event);
    };
    document.addEventListener('pointerdown', lazyPointerHandler, true);
    document.addEventListener('focusin', lazyFocusHandler, true);
    document.addEventListener('toggle', lazyToggleHandler, true);
}

function removeOnDemandCompatTriggers() {
    if (typeof document === 'undefined') return;
    if (lazyPointerHandler) document.removeEventListener('pointerdown', lazyPointerHandler, true);
    if (lazyFocusHandler) document.removeEventListener('focusin', lazyFocusHandler, true);
    if (lazyToggleHandler) document.removeEventListener('toggle', lazyToggleHandler, true);
    lazyPointerHandler = null;
    lazyFocusHandler = null;
    lazyToggleHandler = null;
}

jQuery(async () => {
    if (!initCoreRuntime()) return;
    installOnDemandCompatTriggers();
    console.log(`[RabbitMirror] runtime ${RABBIT_MIRROR_RUNTIME_VERSION} loaded via golden merge ${GOLDEN_MERGE_VERSION}`);
});

function destroyOptionalCompat() {
    for (const [name, mod] of optionalModules) {
        try {
            if (name === 'profileSelector') mod.destroyRabbitMirrorIndependentProfileSelectorHotfix?.();
            else if (name === 'maintenanceRecommendation') mod.destroyRabbitMirrorMaintenanceRecommendationHotfix?.();
            else if (name === 'checkedSelectorRepair') mod.destroyRabbitMirrorCheckedSelectorRepair?.();
            else if (name === 'renderedVisualFeedback') mod.destroyRabbitMirrorRenderedVisualFeedbackHotfix?.();
            else if (name === 'mobileModal') mod.destroyRabbitMirrorMobileModalHotfix?.();
        } catch {}
    }
    optionalModules.clear();
    optionalPromises.clear();
}

export function onDisable() {
    runtimeCancelled = true;
    removeOnDemandCompatTriggers();
    destroyOptionalCompat();
    destroyFeedbackCatPromptSync();
    clearRabbitMirrorPrompt();
    destroyRabbitMirrorUI();
    destroyOutputSanitizer();
    destroyVisualScanner();
    destroyIndependentRabbitMirror();
    destroyTouchTheaterBridge();
    destroyRabbitMirrorIndependentSecurityGuard();
    clearRabbitMirrorGenerationSnapshots();
}

export function onClean() {
    onDisable();
    clearRabbitMirrorPrompt();
    clearLastCombo();
    clearAllFeedbackCatState();
    clearRabbitMirrorGenerationSnapshots();
}
