const LOADER_DIAG_VERSION = '1.4.9-loaderdiag1';
const RABBIT_MIRROR_RUNTIME_VERSION = '1.4.30.17';
const loaderStartedAt = (() => { try { return performance.now(); } catch { return Date.now(); } })();
const loaderEntries = [];

function loaderNow() {
    try { return performance.now(); } catch { return Date.now(); }
}

function loaderPush(name, start, extra = {}) {
    const end = loaderNow();
    const row = {
        order: loaderEntries.length + 1,
        name: String(name || ''),
        startMs: Math.round((start - loaderStartedAt) * 10) / 10,
        ms: Math.round((end - start) * 10) / 10,
        endMs: Math.round((end - loaderStartedAt) * 10) / 10,
        ...extra,
    };
    loaderEntries.push(row);
    if (row.ms >= 1000) console.warn(`[RM LOADER] ${row.name} ${row.ms}ms`, extra);
    else console.info(`[RM LOADER] ${row.name} ${row.ms}ms`, extra);
    return row;
}

async function timedImport(name, specifier) {
    const start = loaderNow();
    try {
        const mod = await import(specifier);
        loaderPush(`module.${name}.import`, start, { ok: true });
        return mod;
    } catch (error) {
        loaderPush(`module.${name}.import`, start, {
            ok: false,
            error: String(error?.message || error).slice(0, 180),
        });
        throw error;
    }
}

globalThis.__rabbitMirrorLoaderDiag = {
    version: LOADER_DIAG_VERSION,
    dump: () => loaderEntries.map(row => ({ ...row })),
};
globalThis.rabbitMirrorLoaderSummary = () => {
    const rows = loaderEntries.map(row => ({ ...row }));
    try { console.table(rows); } catch { console.log('[RM LOADER] summary', rows); }
    return rows;
};

// Sequential imports are intentional in this diagnostic build. They isolate first-load
// download + dependency resolution + parse/compile + top-level execution cost per root module.
// This build is NOT a final performance candidate and may load differently from the normal build.
const performanceDiagnosticsMod = await timedImport('performanceDiagnostics', './src/performanceDiagnostics.js?rmv=1.4.9-loaderdiag1');
const settingsMod = await timedImport('settings', './src/settings.js?rmv=1.4.9-loaderdiag1');
const storageMod = await timedImport('storage', './src/storage.js?rmv=1.4.9-loaderdiag1');
const generationGuardMod = await timedImport('generationGuard', './src/generationGuard.js?rmv=1.4.9-loaderdiag1');
const feedbackCatMod = await timedImport('feedbackCat', './src/feedbackCat.js?rmv=1.4.9-loaderdiag1');
const independentSecurityGuardMod = await timedImport('independentSecurityGuard', './src/independentSecurityGuard.js?rmv=1.4.9-loaderdiag1');
const injectorMod = await timedImport('injector', './src/injector.js?rmv=1.4.9-loaderdiag1');
const visualScannerMod = await timedImport('visualScanner', './src/visualScanner.js?rmv=1.4.9-loaderdiag1');
const outputSanitizerMod = await timedImport('outputSanitizer', './src/outputSanitizer.js?rmv=1.4.9-loaderdiag1');
const independentApiMod = await timedImport('independentApi', './src/independentApi.js?rmv=1.4.9-loaderdiag1');
const touchTheaterMod = await timedImport('touchTheater', './src/touchTheater.js?rmv=1.4.9-loaderdiag1');
const mobileModalHotfixMod = await timedImport('mobileModalHotfix', './src/mobileModalHotfix.js?rmv=1.4.30.19');
const independentProfileSelectorHotfixMod = await timedImport('profileSelectorHotfix', './src/independentProfileSelectorHotfix.js?rmv=1.4.7-test');
const maintenanceRecommendationHotfixMod = await timedImport('maintenanceRecommendationHotfix', './src/maintenanceRecommendationHotfix.js?rmv=1.4.5');
const renderedVisualFeedbackHotfixMod = await timedImport('renderedVisualFeedbackHotfix', './src/renderedVisualFeedbackHotfix.js?rmv=1.4.9-loaderdiag1');
const checkedSelectorRepairMod = await timedImport('checkedSelectorRepair', './src/checkedSelectorRepair.js?rmv=1.4.30.26');
const uiMod = await timedImport('ui', './src/ui.js?rmv=1.4.9-loaderdiag1');

loaderPush('moduleGraph.total', loaderStartedAt, { ok: true, modules: 17 });

const { initRabbitMirrorUI, destroyRabbitMirrorUI } = uiMod;
const { rabbitMirrorGenerateInterceptor, clearRabbitMirrorPrompt } = injectorMod;
const { clearLastCombo } = storageMod;
const { initVisualScanner, destroyVisualScanner } = visualScannerMod;
const { initOutputSanitizer, destroyOutputSanitizer } = outputSanitizerMod;
const { clearAllFeedbackCatState, destroyFeedbackCatPromptSync, initFeedbackCatPromptSync } = feedbackCatMod;
const { getSettings, updateSettings } = settingsMod;
const { clearRabbitMirrorGenerationSnapshots } = generationGuardMod;
const { initIndependentRabbitMirror, destroyIndependentRabbitMirror, getIndependentConnectionProfiles, refreshRabbitMirrorGenerationMode } = independentApiMod;
const { initTouchTheaterBridge, destroyTouchTheaterBridge } = touchTheaterMod;
const { initRabbitMirrorMobileModalHotfix, destroyRabbitMirrorMobileModalHotfix } = mobileModalHotfixMod;
const { initRabbitMirrorIndependentSecurityGuard, destroyRabbitMirrorIndependentSecurityGuard } = independentSecurityGuardMod;
const { initRabbitMirrorIndependentProfileSelectorHotfix, destroyRabbitMirrorIndependentProfileSelectorHotfix } = independentProfileSelectorHotfixMod;
const { initRabbitMirrorMaintenanceRecommendationHotfix, destroyRabbitMirrorMaintenanceRecommendationHotfix } = maintenanceRecommendationHotfixMod;
const { initRabbitMirrorRenderedVisualFeedbackHotfix, destroyRabbitMirrorRenderedVisualFeedbackHotfix } = renderedVisualFeedbackHotfixMod;
const { initRabbitMirrorCheckedSelectorRepair, destroyRabbitMirrorCheckedSelectorRepair } = checkedSelectorRepairMod;
const { initRabbitMirrorPerformanceDiagnostics, destroyRabbitMirrorPerformanceDiagnostics } = performanceDiagnosticsMod;

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
    console.log(`[RabbitMirror] runtime ${RABBIT_MIRROR_RUNTIME_VERSION} loaded; loader diagnostic ${LOADER_DIAG_VERSION}`);
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
