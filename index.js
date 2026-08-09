import { initRabbitMirrorUI, destroyRabbitMirrorUI } from './src/ui.js?rmv=1.3.7';
import { rabbitMirrorGenerateInterceptor, clearRabbitMirrorPrompt } from './src/injector.js?rmv=1.3.7';
import { clearLastCombo } from './src/storage.js?rmv=1.3.7';
import { initVisualScanner, destroyVisualScanner } from './src/visualScanner.js?rmv=1.3.7';
import { initOutputSanitizer, destroyOutputSanitizer } from './src/outputSanitizer.js?rmv=1.3.7';
import { clearAllFeedbackCatState, destroyFeedbackCatPromptSync, initFeedbackCatPromptSync } from './src/feedbackCat.js?rmv=1.3.7';
import { getSettings } from './src/settings.js?rmv=1.3.7';
import { clearRabbitMirrorGenerationSnapshots } from './src/generationGuard.js?rmv=1.3.7';
import { initIndependentRabbitMirror, destroyIndependentRabbitMirror } from './src/independentApi.js?rmv=1.3.7';

const RABBIT_MIRROR_RUNTIME_VERSION = '1.3.7';

// Claim the active runtime before UI/DOM initialization. Versioned module URLs ensure this file and its internal graph cannot be satisfied by a stale hot-reload cache.
try { globalThis.__rabbitMirrorFeedbackCatSyncCleanup?.(); } catch {}
globalThis.__rabbitMirrorRuntimeVersion = RABBIT_MIRROR_RUNTIME_VERSION;

// SillyTavern reads this global function name from manifest.json -> generate_interceptor.
globalThis.rabbitMirrorGenerateInterceptor = rabbitMirrorGenerateInterceptor;

jQuery(async () => {
    initFeedbackCatPromptSync(() => getSettings().feedbackCatEnabled !== false);
    globalThis.__rabbitMirrorFeedbackCatSyncCleanup = destroyFeedbackCatPromptSync;
    initRabbitMirrorUI();
    initOutputSanitizer();
    initVisualScanner();
    initIndependentRabbitMirror();
    console.log(`[RabbitMirror] runtime ${RABBIT_MIRROR_RUNTIME_VERSION} loaded`);
});

export function onDisable() {
    destroyFeedbackCatPromptSync();
    clearRabbitMirrorPrompt();
    destroyRabbitMirrorUI();
    destroyOutputSanitizer();
    destroyVisualScanner();
    destroyIndependentRabbitMirror();
    clearRabbitMirrorGenerationSnapshots();
}

export function onClean() {
    destroyFeedbackCatPromptSync();
    destroyRabbitMirrorUI();
    destroyOutputSanitizer();
    destroyVisualScanner();
    destroyIndependentRabbitMirror();
    clearRabbitMirrorPrompt();
    clearLastCombo();
    clearAllFeedbackCatState();
    clearRabbitMirrorGenerationSnapshots();
}
