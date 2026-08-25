const LIGHT_BOOT_VERSION = '1.4.9-subapifix1';
const RABBIT_MIRROR_RUNTIME_VERSION = '1.4.30.17';
const bootStartedAt = (() => { try { return performance.now(); } catch { return Date.now(); } })();
const bootEntries = [];
const loadedModules = new Map();
const modulePromises = new Map();
let runtimePromise = null;
let runtimeStarted = false;
let runtimeReady = false;
let runtimeCancelled = false;

function now() {
    try { return performance.now(); } catch { return Date.now(); }
}

function pushBoot(name, start, extra = {}) {
    const end = now();
    const row = {
        order: bootEntries.length + 1,
        name: String(name || ''),
        startMs: Math.round((start - bootStartedAt) * 10) / 10,
        ms: Math.round((end - start) * 10) / 10,
        endMs: Math.round((end - bootStartedAt) * 10) / 10,
        ...extra,
    };
    bootEntries.push(row);
    if (row.ms >= 1000) console.warn(`[RM LIGHTBOOT] ${row.name} ${row.ms}ms`, extra);
    else console.info(`[RM LIGHTBOOT] ${row.name} ${row.ms}ms`, extra);
    return row;
}

function markBoot(name, extra = {}) {
    const t = now();
    return pushBoot(name, t, extra);
}

function idleYield(timeout = 250) {
    return new Promise(resolve => {
        try {
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(() => resolve(), { timeout: Math.max(50, Number(timeout) || 250) });
                return;
            }
        } catch {}
        setTimeout(resolve, 0);
    });
}

async function loadModule(name, specifier) {
    if (loadedModules.has(name)) return loadedModules.get(name);
    if (modulePromises.has(name)) return modulePromises.get(name);
    const start = now();
    const promise = import(specifier).then(mod => {
        loadedModules.set(name, mod);
        pushBoot(`module.${name}.import`, start, { ok: true });
        return mod;
    }, error => {
        pushBoot(`module.${name}.import`, start, {
            ok: false,
            error: String(error?.message || error).slice(0, 180),
        });
        modulePromises.delete(name);
        throw error;
    });
    modulePromises.set(name, promise);
    return promise;
}

const SPECS = Object.freeze({
    performanceDiagnostics: './src/performanceDiagnostics.js?rmv=1.4.9-subapifix1',
    settings: './src/settings.js?rmv=1.4.9-subapifix1',
    storage: './src/storage.js?rmv=1.4.9-subapifix1',
    generationGuard: './src/generationGuard.js?rmv=1.4.9-subapifix1',
    feedbackCat: './src/feedbackCat.js?rmv=1.4.9-subapifix1',
    independentSecurityGuard: './src/independentSecurityGuard.js?rmv=1.4.9-subapifix1',
    injector: './src/injector.js?rmv=1.4.9-subapifix1',
    outputSanitizer: './src/outputSanitizer.js?rmv=1.4.9-subapifix1',
    checkedSelectorRepair: './src/checkedSelectorRepair.js?rmv=1.4.30.26',
    visualScanner: './src/visualScanner.js?rmv=1.4.9-subapifix1',
    renderedVisualFeedbackHotfix: './src/renderedVisualFeedbackHotfix.js?rmv=1.4.9-subapifix1',
    independentApi: './src/independentApi.js?rmv=1.4.9-subapifix1',
    touchTheater: './src/touchTheater.js?rmv=1.4.9-subapifix1',
    mobileModalHotfix: './src/mobileModalHotfix.js?rmv=1.4.30.19',
    profileSelectorHotfix: './src/independentProfileSelectorHotfix.js?rmv=1.4.7-test',
    maintenanceRecommendationHotfix: './src/maintenanceRecommendationHotfix.js?rmv=1.4.5',
    ui: './src/ui.js?rmv=1.4.9-subapifix1',
});

globalThis.__rabbitMirrorRuntimeVersion = RABBIT_MIRROR_RUNTIME_VERSION;
globalThis.__rabbitMirrorLightBoot = {
    version: LIGHT_BOOT_VERSION,
    dump: () => bootEntries.map(row => ({ ...row })),
    state: () => ({ runtimeStarted, runtimeReady, runtimeCancelled, loaded: [...loadedModules.keys()] }),
};
globalThis.rabbitMirrorLightBootSummary = () => {
    const rows = bootEntries.map(row => ({ ...row }));
    try { console.table(rows); } catch { console.log('[RM LIGHTBOOT] summary', rows); }
    return rows;
};

async function ensureInjector() {
    return loadModule('injector', SPECS.injector);
}

// SillyTavern resolves manifest.generate_interceptor through globalThis at generation time.
// Register a tiny bridge immediately so the 4 KB injector (and its direct host script.js
// dependency) no longer blocks extension/module startup. The real injector is loaded only
// when generation actually needs it, or later during the idle runtime bootstrap.
export async function rabbitMirrorGenerateInterceptor(...args) {
    // If the user starts generation before the idle bootstrap finished, finish the
    // runtime first. This preserves Security Guard / independent-API semantics at
    // the cost of delaying only that unusually-early first generation, never the
    // tavern first paint.
    if (!runtimeReady && !runtimeCancelled) await bootstrapRuntime();
    const mod = await ensureInjector();
    return mod.rabbitMirrorGenerateInterceptor(...args);
}
globalThis.rabbitMirrorGenerateInterceptor = rabbitMirrorGenerateInterceptor;

function measureInit(name, fn) {
    const start = now();
    try {
        const result = fn();
        const isPromise = !!result && typeof result.then === 'function';
        if (isPromise) {
            void Promise.resolve(result).then(
                () => pushBoot(`init.${name}`, start, { async: true, ok: true }),
                error => pushBoot(`init.${name}`, start, { async: true, ok: false, error: String(error?.message || error).slice(0, 180) }),
            );
        } else {
            pushBoot(`init.${name}`, start, { async: false, ok: true });
        }
        return result;
    } catch (error) {
        pushBoot(`init.${name}`, start, { async: false, ok: false, error: String(error?.message || error).slice(0, 180) });
        throw error;
    }
}

async function bootstrapRuntime() {
    if (runtimePromise) return runtimePromise;
    runtimePromise = (async () => {
        if (runtimeCancelled) return false;
        runtimeStarted = true;
        const totalStart = now();
        markBoot('runtime.bootstrap.start', { readyState: String(document?.readyState || '') });

        // Diagnostic + small state modules first. Yield between groups so SillyTavern can
        // paint/accept input instead of making RabbitMirror one long startup task.
        const performanceDiagnosticsMod = await loadModule('performanceDiagnostics', SPECS.performanceDiagnostics);
        if (runtimeCancelled) return false;
        performanceDiagnosticsMod.initRabbitMirrorPerformanceDiagnostics?.();
        await idleYield();

        const settingsMod = await loadModule('settings', SPECS.settings);
        const storageMod = await loadModule('storage', SPECS.storage);
        const generationGuardMod = await loadModule('generationGuard', SPECS.generationGuard);
        const feedbackCatMod = await loadModule('feedbackCat', SPECS.feedbackCat);
        const independentSecurityGuardMod = await loadModule('independentSecurityGuard', SPECS.independentSecurityGuard);
        if (runtimeCancelled) return false;
        await idleYield();

        // Load injector only after the host page has completed its own startup. This avoids
        // making the extension loader wait on injector -> SillyTavern script.js during boot.
        const injectorMod = await ensureInjector();
        if (runtimeCancelled) return false;
        await idleYield();

        // Heavy visual/runtime modules are deliberately split by yields. Their behavior is
        // unchanged; only first-load timing moves behind the host's first usable paint.
        const outputSanitizerMod = await loadModule('outputSanitizer', SPECS.outputSanitizer);
        if (runtimeCancelled) return false;
        await idleYield();
        const visualScannerMod = await loadModule('visualScanner', SPECS.visualScanner);
        const renderedVisualFeedbackHotfixMod = await loadModule('renderedVisualFeedbackHotfix', SPECS.renderedVisualFeedbackHotfix);
        if (runtimeCancelled) return false;
        await idleYield();
        const independentApiMod = await loadModule('independentApi', SPECS.independentApi);
        if (runtimeCancelled) return false;
        await idleYield();
        const touchTheaterMod = await loadModule('touchTheater', SPECS.touchTheater);
        if (runtimeCancelled) return false;
        await idleYield();

        const [mobileModalHotfixMod, profileSelectorHotfixMod, maintenanceRecommendationHotfixMod, checkedSelectorRepairMod] = await Promise.all([
            loadModule('mobileModalHotfix', SPECS.mobileModalHotfix),
            loadModule('profileSelectorHotfix', SPECS.profileSelectorHotfix),
            loadModule('maintenanceRecommendationHotfix', SPECS.maintenanceRecommendationHotfix),
            loadModule('checkedSelectorRepair', SPECS.checkedSelectorRepair),
        ]);
        if (runtimeCancelled) return false;
        await idleYield();
        const uiMod = await loadModule('ui', SPECS.ui);
        if (runtimeCancelled) return false;

        try { globalThis.__rabbitMirrorFeedbackCatSyncCleanup?.(); } catch {}
        globalThis.__rabbitMirrorFeedbackCatSyncCleanup = feedbackCatMod.destroyFeedbackCatPromptSync;

        measureInit('feedbackCatPromptSync', () => feedbackCatMod.initFeedbackCatPromptSync(() => settingsMod.getSettings().feedbackCatEnabled !== false));
        measureInit('independentSecurityGuard', () => independentSecurityGuardMod.initRabbitMirrorIndependentSecurityGuard({
            getSettings: settingsMod.getSettings,
            updateSettings: settingsMod.updateSettings,
        }));
        measureInit('ui', () => uiMod.initRabbitMirrorUI());
        measureInit('mobileModalHotfix', () => mobileModalHotfixMod.initRabbitMirrorMobileModalHotfix());
        measureInit('profileSelectorHotfix', () => profileSelectorHotfixMod.initRabbitMirrorIndependentProfileSelectorHotfix({
            getSettings: settingsMod.getSettings,
            updateSettings: settingsMod.updateSettings,
            getIndependentConnectionProfiles: independentApiMod.getIndependentConnectionProfiles,
            refreshRabbitMirrorGenerationMode: independentApiMod.refreshRabbitMirrorGenerationMode,
        }));
        measureInit('maintenanceRecommendationHotfix', () => maintenanceRecommendationHotfixMod.initRabbitMirrorMaintenanceRecommendationHotfix());
        measureInit('outputSanitizer', () => outputSanitizerMod.initOutputSanitizer());
        measureInit('checkedSelectorRepair', () => checkedSelectorRepairMod.initRabbitMirrorCheckedSelectorRepair());
        measureInit('visualScanner', () => visualScannerMod.initVisualScanner());
        measureInit('renderedVisualFeedbackHotfix', () => renderedVisualFeedbackHotfixMod.initRabbitMirrorRenderedVisualFeedbackHotfix());
        measureInit('independentApi', () => independentApiMod.initIndependentRabbitMirror());
        measureInit('touchTheater', () => touchTheaterMod.initTouchTheaterBridge());

        runtimeReady = true;
        pushBoot('runtime.bootstrap.total', totalStart, { ok: true, modules: loadedModules.size });
        console.log(`[RabbitMirror] runtime ${RABBIT_MIRROR_RUNTIME_VERSION} ready via light boot ${LIGHT_BOOT_VERSION}`);
        return true;
    })().catch(error => {
        console.error('[RabbitMirror] light boot failed:', error);
        return false;
    });
    return runtimePromise;
}

function scheduleRuntimeBootstrap() {
    const schedule = () => {
        const start = now();
        const run = () => {
            pushBoot('runtime.bootstrap.scheduledDelay', start, {});
            void bootstrapRuntime();
        };
        try {
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(run, { timeout: 1500 });
                return;
            }
        } catch {}
        setTimeout(run, 250);
    };

    try {
        if (document.readyState === 'complete') {
            setTimeout(schedule, 0);
        } else {
            window.addEventListener('load', () => setTimeout(schedule, 0), { once: true });
        }
    } catch {
        setTimeout(schedule, 250);
    }
}

scheduleRuntimeBootstrap();

function callIfLoaded(moduleName, exportName, ...args) {
    try {
        const mod = loadedModules.get(moduleName);
        const fn = mod?.[exportName];
        if (typeof fn === 'function') return fn(...args);
    } catch (error) {
        console.warn(`[RabbitMirror] cleanup failed: ${moduleName}.${exportName}`, error);
    }
}

export function onDisable() {
    runtimeCancelled = true;
    callIfLoaded('performanceDiagnostics', 'destroyRabbitMirrorPerformanceDiagnostics');
    callIfLoaded('feedbackCat', 'destroyFeedbackCatPromptSync');
    callIfLoaded('profileSelectorHotfix', 'destroyRabbitMirrorIndependentProfileSelectorHotfix');
    callIfLoaded('maintenanceRecommendationHotfix', 'destroyRabbitMirrorMaintenanceRecommendationHotfix');
    callIfLoaded('injector', 'clearRabbitMirrorPrompt');
    callIfLoaded('ui', 'destroyRabbitMirrorUI');
    callIfLoaded('checkedSelectorRepair', 'destroyRabbitMirrorCheckedSelectorRepair');
    callIfLoaded('outputSanitizer', 'destroyOutputSanitizer');
    callIfLoaded('renderedVisualFeedbackHotfix', 'destroyRabbitMirrorRenderedVisualFeedbackHotfix');
    callIfLoaded('visualScanner', 'destroyVisualScanner');
    callIfLoaded('independentApi', 'destroyIndependentRabbitMirror');
    callIfLoaded('touchTheater', 'destroyTouchTheaterBridge');
    callIfLoaded('independentSecurityGuard', 'destroyRabbitMirrorIndependentSecurityGuard');
    callIfLoaded('generationGuard', 'clearRabbitMirrorGenerationSnapshots');
    callIfLoaded('mobileModalHotfix', 'destroyRabbitMirrorMobileModalHotfix');
}

export async function onClean() {
    onDisable();
    // Explicit clean is allowed to load the small state modules so historical local state is
    // actually removed even if the idle runtime never finished loading.
    try {
        const [injectorMod, storageMod, feedbackCatMod, generationGuardMod] = await Promise.all([
            ensureInjector(),
            loadModule('storage', SPECS.storage),
            loadModule('feedbackCat', SPECS.feedbackCat),
            loadModule('generationGuard', SPECS.generationGuard),
        ]);
        injectorMod.clearRabbitMirrorPrompt?.();
        storageMod.clearLastCombo?.();
        feedbackCatMod.clearAllFeedbackCatState?.();
        generationGuardMod.clearRabbitMirrorGenerationSnapshots?.();
    } catch (error) {
        console.warn('[RabbitMirror] clean state fallback failed:', error);
    }
}
