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

// GoldenMerge1 deliberately returns to the proven 1.4.30.14 boot shape:
// one host-aligned core module graph + one initialization pass. The newer safety,
// bounded-history, independent-API and UI implementations remain unchanged.
const GOLDEN_MERGE_VERSION = '1.4.9-goldenmerge1';
const RABBIT_MIRROR_RUNTIME_VERSION = '1.4.30.17';
let runtimeCancelled = false;
let optionalCompatPromise = null;
let optionalCompat = null;

try { globalThis.__rabbitMirrorFeedbackCatSyncCleanup?.(); } catch {}
globalThis.__rabbitMirrorRuntimeVersion = RABBIT_MIRROR_RUNTIME_VERSION;
globalThis.rabbitMirrorGenerateInterceptor = rabbitMirrorGenerateInterceptor;
globalThis.__rabbitMirrorGoldenMerge = {
    version: GOLDEN_MERGE_VERSION,
    optionalReady: () => !!optionalCompat,
};

function initCoreRuntime() {
    if (runtimeCancelled) return false;
    initFeedbackCatPromptSync(() => getSettings().feedbackCatEnabled !== false);
    globalThis.__rabbitMirrorFeedbackCatSyncCleanup = destroyFeedbackCatPromptSync;

    // Guard is installed before UI/independent API can initiate an independent request.
    initRabbitMirrorIndependentSecurityGuard({ getSettings, updateSettings });

    // Keep the compact 1.4.30.14 initialization order. PerfFix inside independentApi
    // keeps startup bounded (latest 6 + visibility-lazy history), so no full-chat sync returns.
    initRabbitMirrorUI();
    initOutputSanitizer();
    initVisualScanner();
    initIndependentRabbitMirror();
    initTouchTheaterBridge();
    return true;
}

async function loadOptionalCompat() {
    if (optionalCompatPromise) return optionalCompatPromise;
    optionalCompatPromise = Promise.all([
        import('./src/mobileModalHotfix.js?rmv=1.4.30.19'),
        import('./src/independentProfileSelectorHotfix.js?rmv=1.4.7-test'),
        import('./src/maintenanceRecommendationHotfix.js?rmv=1.4.5'),
        import('./src/checkedSelectorRepair.js?rmv=1.4.30.26'),
        import('./src/renderedVisualFeedbackHotfix.js?rmv=1.4.9-chatsafety1'),
    ]).then(([mobile, profile, maintenance, checked, rendered]) => {
        if (runtimeCancelled) return null;
        optionalCompat = { mobile, profile, maintenance, checked, rendered };
        mobile.initRabbitMirrorMobileModalHotfix?.();
        profile.initRabbitMirrorIndependentProfileSelectorHotfix?.({
            getSettings,
            updateSettings,
            getIndependentConnectionProfiles,
            refreshRabbitMirrorGenerationMode,
        });
        maintenance.initRabbitMirrorMaintenanceRecommendationHotfix?.();
        checked.initRabbitMirrorCheckedSelectorRepair?.();
        rendered.initRabbitMirrorRenderedVisualFeedbackHotfix?.();
        return optionalCompat;
    }).catch(error => {
        console.warn('[RabbitMirror] optional compatibility layer failed to load:', error);
        return null;
    });
    return optionalCompatPromise;
}

function scheduleOptionalCompat() {
    const run = () => { if (!runtimeCancelled) void loadOptionalCompat(); };
    try {
        if (typeof requestIdleCallback === 'function') {
            // Optional layers are only ~50 KiB and their heavy dependencies are already in the
            // core graph. Let the first usable paint/chat win, but do not leave fixes unloaded.
            requestIdleCallback(run, { timeout: 3500 });
            return;
        }
    } catch {}
    setTimeout(run, 1200);
}

jQuery(async () => {
    if (!initCoreRuntime()) return;
    scheduleOptionalCompat();
    console.log(`[RabbitMirror] runtime ${RABBIT_MIRROR_RUNTIME_VERSION} loaded via golden merge ${GOLDEN_MERGE_VERSION}`);
});

function destroyOptionalCompat() {
    const mods = optionalCompat;
    if (!mods) return;
    try { mods.profile?.destroyRabbitMirrorIndependentProfileSelectorHotfix?.(); } catch {}
    try { mods.maintenance?.destroyRabbitMirrorMaintenanceRecommendationHotfix?.(); } catch {}
    try { mods.checked?.destroyRabbitMirrorCheckedSelectorRepair?.(); } catch {}
    try { mods.rendered?.destroyRabbitMirrorRenderedVisualFeedbackHotfix?.(); } catch {}
    try { mods.mobile?.destroyRabbitMirrorMobileModalHotfix?.(); } catch {}
    optionalCompat = null;
}

export function onDisable() {
    runtimeCancelled = true;
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
