import { initRabbitMirrorUI, destroyRabbitMirrorUI } from './src/ui.js?rmv=1.4.6-ms1';
import { rabbitMirrorGenerateInterceptor, clearRabbitMirrorPrompt } from './src/injector.js?rmv=1.4.6-ms1';
import { clearLastCombo } from './src/storage.js?rmv=1.4.6-ms1';
import { initVisualScanner, destroyVisualScanner } from './src/visualScanner.js?rmv=1.4.6-ms1';
import { initOutputSanitizer, destroyOutputSanitizer } from './src/outputSanitizer.js?rmv=1.4.6-ms1';
import { clearAllFeedbackCatState, destroyFeedbackCatPromptSync, initFeedbackCatPromptSync } from './src/feedbackCat.js?rmv=1.4.30.17';
import { getSettings, updateSettings } from './src/settings.js?rmv=1.4.6-ms1';
import { clearRabbitMirrorGenerationSnapshots } from './src/generationGuard.js?rmv=1.4.6-ms1';
import { initIndependentRabbitMirror, destroyIndependentRabbitMirror, getIndependentConnectionProfiles, refreshRabbitMirrorGenerationMode } from './src/independentApi.js?rmv=1.4.6-ms1';
import { initTouchTheaterBridge, destroyTouchTheaterBridge } from './src/touchTheater.js?rmv=1.4.30.17';
import { initRabbitMirrorMobileModalHotfix, destroyRabbitMirrorMobileModalHotfix } from './src/mobileModalHotfix.js?rmv=1.4.30.19';
import { initRabbitMirrorIndependentSecurityGuard, destroyRabbitMirrorIndependentSecurityGuard } from './src/independentSecurityGuard.js?rmv=1.4.30.24';
import { initRabbitMirrorIndependentProfileSelectorHotfix, destroyRabbitMirrorIndependentProfileSelectorHotfix } from './src/independentProfileSelectorHotfix.js?rmv=1.4.6-test';
import { initRabbitMirrorMaintenanceRecommendationHotfix, destroyRabbitMirrorMaintenanceRecommendationHotfix } from './src/maintenanceRecommendationHotfix.js?rmv=1.4.5';
import { initRabbitMirrorRenderedVisualFeedbackHotfix, destroyRabbitMirrorRenderedVisualFeedbackHotfix } from './src/renderedVisualFeedbackHotfix.js?rmv=1.4.6-ms1';
import { initRabbitMirrorCheckedSelectorRepair, destroyRabbitMirrorCheckedSelectorRepair } from './src/checkedSelectorRepair.js?rmv=1.4.30.26';

const RABBIT_MIRROR_RUNTIME_VERSION = '1.4.30.17';

try { globalThis.__rabbitMirrorFeedbackCatSyncCleanup?.(); } catch {}
globalThis.__rabbitMirrorRuntimeVersion = RABBIT_MIRROR_RUNTIME_VERSION;
globalThis.rabbitMirrorGenerateInterceptor = rabbitMirrorGenerateInterceptor;

jQuery(async () => {
    initFeedbackCatPromptSync(() => getSettings().feedbackCatEnabled !== false);
    globalThis.__rabbitMirrorFeedbackCatSyncCleanup = destroyFeedbackCatPromptSync;
    initRabbitMirrorIndependentSecurityGuard({ getSettings, updateSettings });
    initRabbitMirrorUI();
    initRabbitMirrorMobileModalHotfix();
    initRabbitMirrorIndependentProfileSelectorHotfix({
        getSettings,
        updateSettings,
        getIndependentConnectionProfiles,
        refreshRabbitMirrorGenerationMode,
    });
    initRabbitMirrorMaintenanceRecommendationHotfix();
    initOutputSanitizer();
    initRabbitMirrorCheckedSelectorRepair();
    initVisualScanner();
    initRabbitMirrorRenderedVisualFeedbackHotfix();
    initIndependentRabbitMirror();
    initTouchTheaterBridge();
    console.log(`[RabbitMirror] runtime ${RABBIT_MIRROR_RUNTIME_VERSION} loaded`);
});

export function onDisable() {
    destroyFeedbackCatPromptSync();
    destroyRabbitMirrorIndependentProfileSelectorHotfix();
    destroyRabbitMirrorMaintenanceRecommendationHotfix();
    clearRabbitMirrorPrompt();
    destroyRabbitMirrorUI();
    destroyRabbitMirrorCheckedSelectorRepair();
    destroyOutputSanitizer();
    destroyRabbitMirrorRenderedVisualFeedbackHotfix();
    destroyVisualScanner();
    destroyIndependentRabbitMirror();
    destroyTouchTheaterBridge();
    destroyRabbitMirrorIndependentSecurityGuard();
    clearRabbitMirrorGenerationSnapshots();
    destroyRabbitMirrorMobileModalHotfix();
}

export function onClean() {
    destroyFeedbackCatPromptSync();
    destroyRabbitMirrorIndependentProfileSelectorHotfix();
    destroyRabbitMirrorMaintenanceRecommendationHotfix();
    destroyRabbitMirrorUI();
    destroyRabbitMirrorCheckedSelectorRepair();
    destroyOutputSanitizer();
    destroyRabbitMirrorRenderedVisualFeedbackHotfix();
    destroyVisualScanner();
    destroyIndependentRabbitMirror();
    destroyTouchTheaterBridge();
    destroyRabbitMirrorIndependentSecurityGuard();
    clearRabbitMirrorPrompt();
    clearLastCombo();
    clearAllFeedbackCatState();
    clearRabbitMirrorGenerationSnapshots();
    destroyRabbitMirrorMobileModalHotfix();
}
