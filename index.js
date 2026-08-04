import { initRabbitMirrorUI, destroyRabbitMirrorUI } from './src/ui.js?rmv=1.2.25';
import { rabbitMirrorGenerateInterceptor, clearRabbitMirrorPrompt } from './src/injector.js?rmv=1.2.25';
import { clearLastCombo } from './src/storage.js?rmv=1.2.25';
import { clearAllFeedbackCatState, destroyFeedbackCatPromptSync, initFeedbackCatPromptSync } from './src/feedbackCat.js?rmv=1.2.25';
import { getSettings } from './src/settings.js?rmv=1.2.25';
import { clearRabbitMirrorGenerationSnapshots } from './src/generationGuard.js?rmv=1.2.25';

const RABBIT_MIRROR_RUNTIME_VERSION = '1.2.25';

let outputSanitizerModule = null;
let visualScannerModule = null;
let independentApiModule = null;
let heavyRuntimePromise = null;
let heavyRuntimeInitialized = false;
let runtimeEnabled = true;

async function loadHeavyRuntimeModules() {
    const [outputMod, visualMod, independentMod] = await Promise.all([
        import('./src/outputSanitizer.js?rmv=1.2.25'),
        import('./src/visualScanner.js?rmv=1.2.25'),
        import('./src/independentApi.js?rmv=1.2.25'),
    ]);
    outputSanitizerModule = outputMod;
    visualScannerModule = visualMod;
    independentApiModule = independentMod;
    return { outputMod, visualMod, independentMod };
}

async function ensureHeavyRuntimeInitialized() {
    if (!runtimeEnabled || globalThis.__rabbitMirrorRuntimeVersion !== RABBIT_MIRROR_RUNTIME_VERSION) return null;
    if (!heavyRuntimePromise) {
        heavyRuntimePromise = loadHeavyRuntimeModules().then(modules => {
            if (!runtimeEnabled || globalThis.__rabbitMirrorRuntimeVersion !== RABBIT_MIRROR_RUNTIME_VERSION) return null;
            if (!heavyRuntimeInitialized) {
                modules.outputMod.initOutputSanitizer?.();
                modules.visualMod.initVisualScanner?.();
                modules.independentMod.initIndependentRabbitMirror?.();
                heavyRuntimeInitialized = true;
            }
            return modules;
        }).catch(error => {
            heavyRuntimePromise = null;
            throw error;
        });
    }
    return heavyRuntimePromise;
}

// UI actions can request the same deferred runtime without creating a second
// initialization path. The function is version-owned and removed on disable.
globalThis.__rabbitMirrorEnsureHeavyRuntime = ensureHeavyRuntimeInitialized;

// Claim the active runtime before UI/DOM initialization. Versioned module URLs ensure this file and its internal graph cannot be satisfied by a stale hot-reload cache.
try { globalThis.__rabbitMirrorFeedbackCatSyncCleanup?.(); } catch {}
globalThis.__rabbitMirrorRuntimeVersion = RABBIT_MIRROR_RUNTIME_VERSION;

// SillyTavern reads this global function name from manifest.json -> generate_interceptor.
globalThis.rabbitMirrorGenerateInterceptor = rabbitMirrorGenerateInterceptor;

let deferredCompatibilityInitHandle = 0;
let deferredCompatibilityInitKind = '';

function cancelDeferredCompatibilityInit() {
    if (!deferredCompatibilityInitHandle) return;
    try {
        if (deferredCompatibilityInitKind === 'idle') globalThis.cancelIdleCallback?.(deferredCompatibilityInitHandle);
        else clearTimeout(deferredCompatibilityInitHandle);
    } catch {}
    deferredCompatibilityInitHandle = 0;
    deferredCompatibilityInitKind = '';
}

function scheduleDeferredCompatibilityInit() {
    cancelDeferredCompatibilityInit();
    const run = () => {
        deferredCompatibilityInitHandle = 0;
        deferredCompatibilityInitKind = '';
        if (globalThis.__rabbitMirrorRuntimeVersion !== RABBIT_MIRROR_RUNTIME_VERSION) return;
        void ensureHeavyRuntimeInitialized()
            .catch(error => console.error('[RabbitMirror] compatibility runtime init failed:', error));
    };
    if (typeof globalThis.requestIdleCallback === 'function') {
        deferredCompatibilityInitKind = 'idle';
        deferredCompatibilityInitHandle = globalThis.requestIdleCallback(run, { timeout: 900 });
    } else {
        deferredCompatibilityInitKind = 'timeout';
        deferredCompatibilityInitHandle = setTimeout(run, 180);
    }
}

jQuery(async () => {
    initFeedbackCatPromptSync(() => getSettings().feedbackCatEnabled !== false);
    globalThis.__rabbitMirrorFeedbackCatSyncCleanup = destroyFeedbackCatPromptSync;
    initRabbitMirrorUI();
    // Heavy DOM repair, visual scanning and independent generation modules are
    // loaded together in the first idle slice so ST 1.16.x can finish its own
    // large-chat render before RabbitMirror parses the extension's largest files.
    scheduleDeferredCompatibilityInit();
    console.log(`[RabbitMirror] runtime ${RABBIT_MIRROR_RUNTIME_VERSION} loaded`);
});

export function onDisable() {
    runtimeEnabled = false;
    cancelDeferredCompatibilityInit();
    destroyFeedbackCatPromptSync();
    clearRabbitMirrorPrompt();
    destroyRabbitMirrorUI();
    outputSanitizerModule?.destroyOutputSanitizer?.();
    visualScannerModule?.destroyVisualScanner?.();
    independentApiModule?.destroyIndependentRabbitMirror?.();
    clearRabbitMirrorGenerationSnapshots();
    if (globalThis.__rabbitMirrorEnsureHeavyRuntime === ensureHeavyRuntimeInitialized) delete globalThis.__rabbitMirrorEnsureHeavyRuntime;
}

export function onClean() {
    runtimeEnabled = false;
    cancelDeferredCompatibilityInit();
    destroyFeedbackCatPromptSync();
    destroyRabbitMirrorUI();
    outputSanitizerModule?.destroyOutputSanitizer?.();
    visualScannerModule?.destroyVisualScanner?.();
    independentApiModule?.destroyIndependentRabbitMirror?.();
    clearRabbitMirrorPrompt();
    clearLastCombo();
    clearAllFeedbackCatState();
    clearRabbitMirrorGenerationSnapshots();
    if (globalThis.__rabbitMirrorEnsureHeavyRuntime === ensureHeavyRuntimeInitialized) delete globalThis.__rabbitMirrorEnsureHeavyRuntime;
}
