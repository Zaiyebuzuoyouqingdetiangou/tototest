import { rabbitMirrorGenerateInterceptor, clearRabbitMirrorPrompt, destroyIndependentGenerationIntentBridge, initIndependentGenerationIntentBridge, prewarmRabbitMirrorGenerationRuntime } from './src/injector.js?rmv=1.4.9-subapitag2';
import { clearLastCombo } from './src/storage.js?rmv=1.4.9-subapitag2';
import { clearAllFeedbackCatState, destroyFeedbackCatPromptSync, initFeedbackCatPromptSync } from './src/feedbackCat.js?rmv=1.4.9-subapitag2';
import { getSettings, updateSettings } from './src/settings.js?rmv=1.4.9-subapitag2';
import { initRabbitMirrorIndependentSecurityGuard, destroyRabbitMirrorIndependentSecurityGuard } from './src/independentSecurityGuard.js?rmv=1.4.9-subapitag2';

// SecurityFix2 leaves only the prompt interceptor and request guard in the parser-critical
// graph. The 1.8 MiB UI/sanitizer/independent runtime graph is imported after the host has
// received a paint/idle opportunity, or immediately after explicit RabbitMirror intent.
const GOLDEN_MERGE_VERSION = '1.4.9-externaldiag1-securityfix6-subapitag2';
const RABBIT_MIRROR_RUNTIME_VERSION = '1.4.30.22';
let runtimeCancelled = false;
let deferredRuntimePromise = null;
let deferredRuntimeModules = null;
let deferredBootTimer = 0;
let deferredIdleHandle = 0;
let deferredLoadHandler = null;
let deferredChatWakeObserver = null;
let deferredHostSignature = '';
let deferredHostStableSince = 0;
let generationPrewarmStarted = false;
let generationPrewarmDone = false;
let externalDiagnosticsPromise = null;
let externalDiagnosticsModule = null;
let externalDiagnosticsApi = null;
const optionalModules = new Map();
const optionalPromises = new Map();
let lazyPointerHandler = null;
let lazyFocusHandler = null;
let lazyClickHandler = null;

try { globalThis.__rabbitMirrorFeedbackCatSyncCleanup?.(); } catch {}
globalThis.__rabbitMirrorRuntimeVersion = RABBIT_MIRROR_RUNTIME_VERSION;
globalThis.rabbitMirrorGenerateInterceptor = rabbitMirrorGenerateInterceptor;
globalThis.__rabbitMirrorGoldenMerge = {
    version: GOLDEN_MERGE_VERSION,
    deferredReady: () => !!deferredRuntimeModules,
    optionalLoaded: () => [...optionalModules.keys()],
};
// The lightweight generation interceptor calls this without awaiting it when
// independent mode is selected. That closes the cold-start event gap without
// making the host's main generation wait for the 1.8 MiB UI/runtime graph.
globalThis.__rabbitMirrorEnsureDeferredCoreRuntime = ensureDeferredCoreRuntime;

function captureDeferredBootBoundary() {
    try {
        const context = globalThis.SillyTavern?.getContext?.();
        const chat = Array.isArray(context?.chat) ? context.chat : [];
        globalThis.__rabbitMirrorDeferredBootBoundary = Object.freeze({
            chatLength: chat.length,
            maxExistingIndex: chat.length - 1,
            capturedAt: Date.now(),
        });
    } catch {}
}

async function ensureDeferredCoreRuntime(reason = 'scheduled-idle') {
    if (runtimeCancelled) return null;
    if (deferredRuntimeModules) return deferredRuntimeModules;
    if (deferredRuntimePromise) return deferredRuntimePromise;
    deferredRuntimePromise = Promise.all([
        import('./src/outputSanitizer.js?rmv=1.4.9-subapitag2'),
        import('./src/visualScanner.js?rmv=1.4.9-subapitag2'),
        import('./src/independentApi.js?rmv=1.4.9-subapitag2'),
        import('./src/touchTheater.js?rmv=1.4.9-subapitag2'),
        import('./src/ui.js?rmv=1.4.9-subapitag2'),
    ]).then(async ([output, visual, independent, touch, ui]) => {
        if (runtimeCancelled) return null;
        deferredRuntimeModules = { output, visual, independent, touch, ui };
        output.initOutputSanitizer?.();
        visual.initVisualScanner?.();
        await independent.initIndependentRabbitMirror?.();
        touch.initTouchTheaterBridge?.();
        ui.initRabbitMirrorUI?.();
        console.log(`[RabbitMirror] deferred core ready (${reason}) via ${GOLDEN_MERGE_VERSION}`);
        return deferredRuntimeModules;
    }).catch(error => {
        deferredRuntimePromise = null;
        console.error('[RabbitMirror] deferred core failed to load:', error);
        return null;
    });
    return deferredRuntimePromise;
}

function hostLooksBusy() {
    try {
        const context = globalThis.SillyTavern?.getContext?.();
        if ([context?.isGenerating, context?.is_generating, context?.is_send_press, globalThis.is_send_press, globalThis.is_group_generating].some(value => value === true)) return true;
        return !!document?.querySelector?.('#chat .mes.streaming, #chat .mes[data-is-streaming="true"], #chat .mes[is_generating="true"], #chat .mes[data-generating="true"], #stop_but:not(.displayNone):not([hidden])');
    } catch { return true; }
}

function stableHostChatSignature() {
    try {
        const chatRoot = document?.querySelector?.('#chat');
        if (!chatRoot?.isConnected || document?.readyState !== 'complete') return '';
        const context = globalThis.SillyTavern?.getContext?.();
        const chat = Array.isArray(context?.chat) ? context.chat : [];
        if (chat.length) {
            const tail = chat.length - 1;
            const renderedTail = chatRoot.querySelector?.(`.mes[mesid="${tail}"], [mesid="${tail}"].mes`);
            if (!renderedTail?.isConnected) return '';
            return `${chat.length}:${tail}:${renderedTail.getAttribute?.('mesid') || ''}:${String(chat[tail]?.mes || '').length}`;
        }
        // An empty context is indistinguishable from a chat that has not finished
        // loading. Fail closed; a genuinely new empty chat needs no background DOM runtime.
        return '';
    } catch { return ''; }
}

function requestDeferredIdleCheck(delay = 1400) {
    if (runtimeCancelled || deferredRuntimeModules || deferredRuntimePromise) return;
    deferredBootTimer = setTimeout(() => {
        deferredBootTimer = 0;
        if (typeof globalThis.requestIdleCallback === 'function') {
            // Deliberately no timeout: a timeout used to force the 1.8 MiB runtime graph
            // onto the main thread while SillyTavern was still loading a long chat.
            deferredIdleHandle = globalThis.requestIdleCallback(runDeferredBoot);
        } else {
            runDeferredBoot();
        }
    }, Math.max(600, Number(delay) || 1400));
}

function beginGenerationRuntimePrewarm() {
    if (generationPrewarmStarted || generationPrewarmDone || runtimeCancelled) return false;
    generationPrewarmStarted = true;
    const settings = getSettings();
    const task = settings.enabled !== false && settings.autoRabbitMirrorInjection !== false && settings.generationSource !== 'independent'
        ? prewarmRabbitMirrorGenerationRuntime()
        : Promise.resolve(true);
    void task.catch(error => console.debug('[RabbitMirror] generation prewarm skipped:', error)).finally(() => {
        generationPrewarmDone = true;
        requestDeferredIdleCheck(1800);
    });
    return true;
}

function installDeferredChatWakeObserver() {
    if (deferredChatWakeObserver || typeof MutationObserver !== 'function') return false;
    const chatRoot = document?.querySelector?.('#chat');
    if (!chatRoot?.isConnected) return false;
    deferredChatWakeObserver = new MutationObserver(records => {
        if (!records?.some(record => Number(record?.addedNodes?.length || 0) > 0)) return;
        deferredChatWakeObserver?.disconnect?.();
        deferredChatWakeObserver = null;
        requestDeferredIdleCheck(1200);
    });
    deferredChatWakeObserver.observe(chatRoot, { childList: true, subtree: true });
    return true;
}

function runDeferredBoot() {
    deferredBootTimer = 0;
    deferredIdleHandle = 0;
    const signature = stableHostChatSignature();
    if (hostLooksBusy()) {
        deferredHostSignature = '';
        deferredHostStableSince = 0;
        requestDeferredIdleCheck(1600);
        return;
    }
    if (!signature) {
        // Empty chat and not-yet-loaded chat are intentionally indistinguishable for
        // the heavy DOM graph. A no-timeout idle slot may still prewarm only the much
        // smaller generation graph so the first send does not pay its parse cost.
        if (!generationPrewarmDone && beginGenerationRuntimePrewarm()) return;
        if (!generationPrewarmDone && generationPrewarmStarted) return;
        // Stay dormant in a genuinely empty chat; one direct-child observer wakes
        // the idle gate when SillyTavern mounts a message. No permanent polling.
        installDeferredChatWakeObserver();
        return;
    }
    deferredChatWakeObserver?.disconnect?.();
    deferredChatWakeObserver = null;
    const current = Date.now();
    if (signature !== deferredHostSignature) {
        deferredHostSignature = signature;
        deferredHostStableSince = current;
        requestDeferredIdleCheck(1600);
        return;
    }
    if (!deferredHostStableSince || current - deferredHostStableSince < 3000) {
        requestDeferredIdleCheck(1400);
        return;
    }
    if (!generationPrewarmDone) {
        beginGenerationRuntimePrewarm();
        return;
    }
    void ensureDeferredCoreRuntime('post-paint-idle');
}

function scheduleDeferredCoreRuntime() {
    const schedule = () => {
        if (runtimeCancelled || deferredRuntimeModules || deferredRuntimePromise) return;
        // Require a real host chat boundary plus three continuously stable seconds.
        // Idle callbacks are never given a force timeout, so RabbitMirror cannot seize
        // the main thread during an unfinished SillyTavern chat load.
        requestDeferredIdleCheck(3500);
    };
    if (document?.readyState === 'complete') schedule();
    else {
        deferredLoadHandler = () => { deferredLoadHandler = null; schedule(); };
        window.addEventListener('load', deferredLoadHandler, { once: true });
    }
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
    return ensureDeferredCoreRuntime('settings-intent').then(modules => loadOptional('profileSelector', './src/independentProfileSelectorHotfix.js?rmv=1.4.7-test', mod => {
        mod.initRabbitMirrorIndependentProfileSelectorHotfix?.({
            getSettings,
            updateSettings,
            getIndependentConnectionProfiles: modules?.independent?.getIndependentConnectionProfiles,
            refreshRabbitMirrorGenerationMode: modules?.independent?.refreshRabbitMirrorGenerationMode,
        });
    }));
}

function loadMirrorVisualCompat() {
    // A normal details/label/radio click must never bootstrap the whole heavy graph.
    // Compatibility helpers may join only after the runtime was already loaded at a
    // stable idle boundary or by an explicit RabbitMirror settings/maintenance action.
    if (!deferredRuntimeModules) return Promise.resolve(null);
    return Promise.all([
        loadOptional('checkedSelectorRepair', './src/checkedSelectorRepair.js?rmv=1.4.30.26', mod => mod.initRabbitMirrorCheckedSelectorRepair?.()),
        loadOptional('renderedVisualFeedback', './src/renderedVisualFeedbackHotfix.js?rmv=1.4.9-subapitag2', mod => mod.initRabbitMirrorRenderedVisualFeedbackHotfix?.()),
    ]);
}

function loadMaintenanceCompat() {
    return ensureDeferredCoreRuntime('maintenance-intent').then(() => loadOptional('maintenanceRecommendation', './src/maintenanceRecommendationHotfix.js?rmv=1.4.5', mod => mod.initRabbitMirrorMaintenanceRecommendationHotfix?.()));
}

function mobileLike() {
    try { return globalThis.matchMedia?.('(max-width: 900px), (pointer: coarse)')?.matches === true; }
    catch { return false; }
}

function loadMobileModalCompat() {
    if (!mobileLike()) return Promise.resolve(null);
    return ensureDeferredCoreRuntime('mobile-settings-intent').then(() => loadOptional('mobileModal', './src/mobileModalHotfix.js?rmv=1.4.9-subapitag2', mod => mod.initRabbitMirrorMobileModalHotfix?.()));
}

function isRabbitMirrorSurface(target) {
    return !!target?.closest?.('[data-rabbit-mirror-external-source="true"], toto[data-rabbit-mirror], toto, .rabbit-mirror-maintenance-toolbar');
}

function isRabbitMirrorSettingsSurface(target) {
    return !!target?.closest?.('#rabbit_mirror_theater_settings, #rh_independent_api_fields, #rh_generation_independent, [data-extension-name="兔子镜"]');
}

function installOnDemandCompatTriggers() {
    if (typeof document === 'undefined') return;
    lazyPointerHandler = event => {
        const target = event?.target;
        if (!target?.closest || event?.isTrusted === false) return;
        if (isRabbitMirrorSettingsSurface(target)) {
            void ensureDeferredCoreRuntime('settings-intent');
            void loadProfileSelector();
            void loadMobileModalCompat();
        }
        if (target.closest?.('[data-rabbit-mirror-maintenance-rabbit="true"]')) void loadMaintenanceCompat();
    };
    lazyFocusHandler = event => {
        const target = event?.target;
        if (!target?.closest || event?.isTrusted === false) return;
        if (isRabbitMirrorSettingsSurface(target)) {
            void ensureDeferredCoreRuntime('settings-focus');
            void loadProfileSelector();
            void loadMobileModalCompat();
        }
        if (target.closest?.('[data-rabbit-mirror-maintenance-rabbit="true"]')) void loadMaintenanceCompat();
    };
    lazyClickHandler = event => {
        const target = event?.target;
        if (!target?.closest || event?.isTrusted === false || !isRabbitMirrorSurface(target)) return;
        // Native details/label/radio interaction completes first. If the heavy runtime
        // is not already ready, this click stays entirely native and performs no import.
        setTimeout(() => { if (deferredRuntimeModules) void loadMirrorVisualCompat(); }, 700);
    };
    document.addEventListener('pointerover', lazyPointerHandler, true);
    document.addEventListener('pointerdown', lazyPointerHandler, true);
    document.addEventListener('focusin', lazyFocusHandler, true);
    document.addEventListener('click', lazyClickHandler, false);
}

function removeOnDemandCompatTriggers() {
    if (typeof document === 'undefined') return;
    if (lazyPointerHandler) {
        document.removeEventListener('pointerover', lazyPointerHandler, true);
        document.removeEventListener('pointerdown', lazyPointerHandler, true);
    }
    if (lazyFocusHandler) document.removeEventListener('focusin', lazyFocusHandler, true);
    if (lazyClickHandler) document.removeEventListener('click', lazyClickHandler, false);
    lazyPointerHandler = null;
    lazyFocusHandler = null;
    lazyClickHandler = null;
}

async function ensureExternalDiagnostics() {
    if (runtimeCancelled) return null;
    if (externalDiagnosticsApi) return externalDiagnosticsApi;
    if (externalDiagnosticsPromise) return externalDiagnosticsPromise;
    externalDiagnosticsPromise = import('./src/externalDiagnostics.js?rmv=1.4.9-subapitag2').then(mod => {
        if (runtimeCancelled) return null;
        externalDiagnosticsModule = mod;
        externalDiagnosticsApi = mod.initRabbitMirrorExternalDiagnostics?.() || null;
        externalDiagnosticsApi?.mark?.('externalDiag.userEnabled', { readyState: String(document?.readyState || '') });
        return externalDiagnosticsApi;
    }).finally(() => { externalDiagnosticsPromise = null; });
    return externalDiagnosticsPromise;
}

function disableExternalDiagnostics() {
    try { externalDiagnosticsModule?.destroyRabbitMirrorExternalDiagnostics?.(); } catch {}
    externalDiagnosticsApi = null;
}

function clearDeferredGenerationSnapshots() {
    void import('./src/generationGuard.js?rmv=1.4.9-subapitag2')
        .then(mod => mod.clearRabbitMirrorGenerationSnapshots?.())
        .catch(() => {});
}

globalThis.__rabbitMirrorEnsureExternalDiag = ensureExternalDiagnostics;
globalThis.__rabbitMirrorDisableExternalDiag = disableExternalDiagnostics;

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

jQuery(() => {
    if (runtimeCancelled) return;
    captureDeferredBootBoundary();
    initFeedbackCatPromptSync(() => getSettings().feedbackCatEnabled !== false);
    globalThis.__rabbitMirrorFeedbackCatSyncCleanup = destroyFeedbackCatPromptSync;
    initIndependentGenerationIntentBridge();
    initRabbitMirrorIndependentSecurityGuard({ getSettings, updateSettings });
    installOnDemandCompatTriggers();
    scheduleDeferredCoreRuntime();
    console.log(`[RabbitMirror] lightweight bootstrap ${RABBIT_MIRROR_RUNTIME_VERSION} ready; heavy runtime deferred`);
});

export function onDisable() {
    runtimeCancelled = true;
    if (deferredBootTimer) clearTimeout(deferredBootTimer);
    deferredBootTimer = 0;
    if (deferredIdleHandle && typeof globalThis.cancelIdleCallback === 'function') globalThis.cancelIdleCallback(deferredIdleHandle);
    deferredIdleHandle = 0;
    if (deferredLoadHandler) window.removeEventListener('load', deferredLoadHandler);
    deferredLoadHandler = null;
    deferredChatWakeObserver?.disconnect?.();
    deferredChatWakeObserver = null;
    deferredHostSignature = '';
    deferredHostStableSince = 0;
    generationPrewarmStarted = false;
    generationPrewarmDone = false;
    removeOnDemandCompatTriggers();
    destroyOptionalCompat();
    destroyFeedbackCatPromptSync();
    destroyIndependentGenerationIntentBridge({ clearIntents: true });
    clearRabbitMirrorPrompt();
    deferredRuntimeModules?.ui?.destroyRabbitMirrorUI?.();
    deferredRuntimeModules?.output?.destroyOutputSanitizer?.();
    deferredRuntimeModules?.visual?.destroyVisualScanner?.();
    deferredRuntimeModules?.independent?.destroyIndependentRabbitMirror?.();
    deferredRuntimeModules?.touch?.destroyTouchTheaterBridge?.();
    destroyRabbitMirrorIndependentSecurityGuard();
    clearDeferredGenerationSnapshots();
    disableExternalDiagnostics();
    if (globalThis.__rabbitMirrorEnsureDeferredCoreRuntime === ensureDeferredCoreRuntime) {
        try { delete globalThis.__rabbitMirrorEnsureDeferredCoreRuntime; } catch {}
    }
    try { delete globalThis.__rabbitMirrorEnsureExternalDiag; } catch {}
    try { delete globalThis.__rabbitMirrorDisableExternalDiag; } catch {}
}

export function onClean() {
    onDisable();
    clearRabbitMirrorPrompt();
    clearLastCombo();
    clearAllFeedbackCatState();
    clearDeferredGenerationSnapshots();
}
