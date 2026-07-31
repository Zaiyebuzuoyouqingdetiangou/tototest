import { initRabbitMirrorUI, destroyRabbitMirrorUI } from './src/ui.js?rmv=1.1.0b14h25t';
import { rabbitMirrorGenerateInterceptor, clearRabbitMirrorPrompt } from './src/injector.js?rmv=1.1.0b14h25t';
import { clearLastCombo } from './src/storage.js?rmv=1.1.0b14h25t';
import { initVisualScanner } from './src/visualScanner.js?rmv=1.1.0b14h25t';
import { initOutputSanitizer, destroyOutputSanitizer } from './src/outputSanitizer.js?rmv=1.1.0b14h25t';
import { clearAllFeedbackCatState, destroyFeedbackCatPromptSync, initFeedbackCatPromptSync } from './src/feedbackCat.js?rmv=1.1.0b14h25t';
import { getSettings } from './src/settings.js?rmv=1.1.0b14h25t';
import { clearRabbitMirrorGenerationSnapshots } from './src/generationGuard.js?rmv=1.1.0b14h25t';
import { initIndependentRabbitMirror, destroyIndependentRabbitMirror } from './src/independentApi.js?rmv=1.1.0b14h25t';

const RABBIT_MIRROR_RUNTIME_VERSION = '1.1.0-beta.14.25-test';

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
    destroyIndependentRabbitMirror();
    clearRabbitMirrorGenerationSnapshots();
}

export function onClean() {
    destroyFeedbackCatPromptSync();
    destroyRabbitMirrorUI();
    destroyOutputSanitizer();
    destroyIndependentRabbitMirror();
    clearRabbitMirrorPrompt();
    clearLastCombo();
    clearAllFeedbackCatState();
    clearRabbitMirrorGenerationSnapshots();
}
