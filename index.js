import { initRabbitMirrorUI, destroyRabbitMirrorUI } from './src/ui.js?rmv=1.4.9-startupdiag1';
import { rabbitMirrorGenerateInterceptor, clearRabbitMirrorPrompt } from './src/injector.js?rmv=1.4.9-startupdiag1';
import { clearLastCombo } from './src/storage.js?rmv=1.4.9-startupdiag1';
import { initVisualScanner, destroyVisualScanner } from './src/visualScanner.js?rmv=1.4.9-startupdiag1';
import { initOutputSanitizer, destroyOutputSanitizer } from './src/outputSanitizer.js?rmv=1.4.9-startupdiag1';
import { clearAllFeedbackCatState, destroyFeedbackCatPromptSync, initFeedbackCatPromptSync } from './src/feedbackCat.js?rmv=1.4.9-startupdiag1';
import { getSettings, updateSettings } from './src/settings.js?rmv=1.4.9-startupdiag1';
import { clearRabbitMirrorGenerationSnapshots } from './src/generationGuard.js?rmv=1.4.9-startupdiag1';
import { initIndependentRabbitMirror, destroyIndependentRabbitMirror, getIndependentConnectionProfiles, refreshRabbitMirrorGenerationMode } from './src/independentApi.js?rmv=1.4.9-startupdiag1';
import { initTouchTheaterBridge, destroyTouchTheaterBridge } from './src/touchTheater.js?rmv=1.4.9-startupdiag1';
import { initRabbitMirrorMobileModalHotfix, destroyRabbitMirrorMobileModalHotfix } from './src/mobileModalHotfix.js?rmv=1.4.30.19';
import { initRabbitMirrorIndependentSecurityGuard, destroyRabbitMirrorIndependentSecurityGuard } from './src/independentSecurityGuard.js?rmv=1.4.9-startupdiag1';
import { initRabbitMirrorIndependentProfileSelectorHotfix, destroyRabbitMirrorIndependentProfileSelectorHotfix } from './src/independentProfileSelectorHotfix.js?rmv=1.4.7-test';
import { initRabbitMirrorMaintenanceRecommendationHotfix, destroyRabbitMirrorMaintenanceRecommendationHotfix } from './src/maintenanceRecommendationHotfix.js?rmv=1.4.5';
import { initRabbitMirrorRenderedVisualFeedbackHotfix, destroyRabbitMirrorRenderedVisualFeedbackHotfix } from './src/renderedVisualFeedbackHotfix.js?rmv=1.4.9-startupdiag1';
import { initRabbitMirrorCheckedSelectorRepair, destroyRabbitMirrorCheckedSelectorRepair } from './src/checkedSelectorRepair.js?rmv=1.4.30.26';
import { initRabbitMirrorPerformanceDiagnostics, destroyRabbitMirrorPerformanceDiagnostics } from './src/performanceDiagnostics.js?rmv=1.4.9-startupdiag1';

const RABBIT_MIRROR_RUNTIME_VERSION = '1.4.30.17';

try { globalThis.__rabbitMirrorFeedbackCatSyncCleanup?.(); } catch {}
globalThis.__rabbitMirrorRuntimeVersion = RABBIT_MIRROR_RUNTIME_VERSION;
globalThis.rabbitMirrorGenerateInterceptor = rabbitMirrorGenerateInterceptor;

function measureStartupStep(name, fn) {
    const total = globalThis.__rabbitMirrorPerfDiag?.begin?.(`startup.${name}`, {}, 0);
    const sync = globalThis.__rabbitMirrorPerfDiag?.begin?.(`startup.${name}.sync`, {}, 0);
    try {
        const result = fn();
        const isPromise = !!result && typeof result.then === 'function';
        sync?.({ returnedPromise: isPromise });
        if (isPromise) {
            void Promise.resolve(result).then(
                () => total?.({ async: true }),
                error => total?.({ async: true, error: String(error?.message || error).slice(0, 160) }),
            );
        } else {
            total?.({ async: false });
        }
        return result;
    } catch (error) {
        const meta = { error: String(error?.message || error).slice(0, 160) };
        sync?.(meta);
        total?.(meta);
        console.error(`[RabbitMirror] startup step failed: ${name}`, error);
        throw error;
    }
}


jQuery(async () => {
    initRabbitMirrorPerformanceDiagnostics();
    const total = globalThis.__rabbitMirrorPerfDiag?.begin?.('startup.total', {}, 0);
    measureStartupStep('feedbackCatPromptSync', () => initFeedbackCatPromptSync(() => getSettings().feedbackCatEnabled !== false));
    globalThis.__rabbitMirrorFeedbackCatSyncCleanup = destroyFeedbackCatPromptSync;
    measureStartupStep('independentSecurityGuard', () => initRabbitMirrorIndependentSecurityGuard({ getSettings, updateSettings }));
    measureStartupStep('ui', () => initRabbitMirrorUI());
    measureStartupStep('mobileModalHotfix', () => initRabbitMirrorMobileModalHotfix());
    measureStartupStep('profileSelectorHotfix', () => initRabbitMirrorIndependentProfileSelectorHotfix({
        getSettings,
        updateSettings,
        getIndependentConnectionProfiles,
        refreshRabbitMirrorGenerationMode,
    }));
    measureStartupStep('maintenanceRecommendationHotfix', () => initRabbitMirrorMaintenanceRecommendationHotfix());
    measureStartupStep('outputSanitizer', () => initOutputSanitizer());
    measureStartupStep('checkedSelectorRepair', () => initRabbitMirrorCheckedSelectorRepair());
    measureStartupStep('visualScanner', () => initVisualScanner());
    measureStartupStep('renderedVisualFeedbackHotfix', () => initRabbitMirrorRenderedVisualFeedbackHotfix());
    measureStartupStep('independentApi', () => initIndependentRabbitMirror());
    measureStartupStep('touchTheater', () => initTouchTheaterBridge());
    total?.();
    console.log(`[RabbitMirror] runtime ${RABBIT_MIRROR_RUNTIME_VERSION} loaded`);
});

export function onDisable() {
    destroyRabbitMirrorPerformanceDiagnostics();
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
    destroyRabbitMirrorPerformanceDiagnostics();
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
