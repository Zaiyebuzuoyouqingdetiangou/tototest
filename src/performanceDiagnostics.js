const PERF_DIAG_VERSION = '1.4.9-subapifix1';
const MAX_ENTRIES = 600;
let cleanup = [];
let entries = [];
let startedAt = 0;

function perfNow(){
    try { return performance.now(); } catch { return Date.now(); }
}
function safeMeta(value = {}) {
    const out = {};
    if (!value || typeof value !== 'object') return out;
    for (const [key, raw] of Object.entries(value)) {
        if (raw === undefined || raw === null) continue;
        if (typeof raw === 'number' || typeof raw === 'boolean') out[key] = raw;
        else if (typeof raw === 'string') out[key] = raw.length > 180 ? `${raw.slice(0, 177)}...` : raw;
    }
    return out;
}
function push(kind, name, duration = 0, meta = {}) {
    const item = {
        t: Math.round((perfNow() - startedAt) * 10) / 10,
        kind: String(kind || 'event'),
        name: String(name || ''),
        ms: Math.round((Number(duration) || 0) * 10) / 10,
        ...safeMeta(meta),
    };
    entries.push(item);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    const prefix = item.ms ? `[RM PERF] ${item.name} ${item.ms}ms` : `[RM PERF] ${item.name}`;
    if (item.kind === 'stall' || item.kind === 'longtask' || item.ms >= 1000) console.warn(prefix, safeMeta(meta));
    else console.info(prefix, safeMeta(meta));
    return item;
}

export function initRabbitMirrorPerformanceDiagnostics() {
    try { globalThis.__rabbitMirrorPerfDiagCleanup?.(); } catch {}
    startedAt = perfNow();
    entries = [];
    cleanup = [];

    const api = {
        version: PERF_DIAG_VERSION,
        mark(name, meta = {}) { return push('mark', name, 0, meta); },
        begin(name, meta = {}, minMs = 0) {
            const start = perfNow();
            let done = false;
            return (extra = {}) => {
                if (done) return 0;
                done = true;
                const duration = perfNow() - start;
                if (duration >= Math.max(0, Number(minMs) || 0)) push('measure', name, duration, { ...safeMeta(meta), ...safeMeta(extra) });
                return duration;
            };
        },
        dump() { return entries.map(item => ({ ...item })); },
        summary() {
            const measures = entries.filter(item => item.ms > 0);
            const grouped = new Map();
            for (const item of measures) {
                const row = grouped.get(item.name) || { name: item.name, count: 0, totalMs: 0, maxMs: 0 };
                row.count += 1; row.totalMs += item.ms; row.maxMs = Math.max(row.maxMs, item.ms); grouped.set(item.name, row);
            }
            return [...grouped.values()].map(row => ({ ...row, totalMs: Math.round(row.totalMs * 10) / 10, maxMs: Math.round(row.maxMs * 10) / 10 })).sort((a,b)=>b.totalMs-a.totalMs);
        },
    };
    globalThis.__rabbitMirrorPerfDiag = api;
    globalThis.rabbitMirrorPerfDump = () => api.dump();
    globalThis.rabbitMirrorPerfSummary = () => {
        const rows = api.summary();
        try { console.table(rows); } catch { console.log('[RM PERF] summary', rows); }
        return rows;
    };
    globalThis.rabbitMirrorStartupSummary = () => {
        const timings = api.summary().filter(item =>
            item.name.startsWith('startup.')
            || item.name.startsWith('ui.')
            || item.name.startsWith('touchTheater.')
            || item.name.startsWith('visualScanner.')
        );
        const activity = api.dump().filter(item =>
            item.name === 'settings.update'
            || item.name === 'settings.saveScheduled'
            || item.name === 'feedbackCat.promptSync'
            || item.name === 'feedbackCat.promptClear'
            || item.name === 'visualScanner.scheduleScan'
        );
        try {
            console.log('[RM STARTUP] 模块耗时');
            console.table(timings);
            console.log('[RM STARTUP] 启动副作用标记');
            console.table(activity);
        } catch {
            console.log('[RM STARTUP]', { timings, activity });
        }
        return { timings, activity };
    };

    push('mark', 'diagnostic.init', 0, {
        version: PERF_DIAG_VERSION,
        path: (() => { try { return location.pathname; } catch { return ''; } })(),
    });

    // Browser long tasks: does not inspect user content.
    try {
        if (typeof PerformanceObserver === 'function') {
            const supported = PerformanceObserver.supportedEntryTypes || [];
            if (supported.includes('longtask')) {
                const observer = new PerformanceObserver(list => {
                    for (const entry of list.getEntries()) push('longtask', 'browser.longtask', entry.duration, { start: Math.round(entry.startTime) });
                });
                observer.observe({ type: 'longtask', buffered: true });
                cleanup.push(() => observer.disconnect());
            }
            if (supported.includes('resource')) {
                const observer = new PerformanceObserver(list => {
                    for (const entry of list.getEntries()) {
                        let path = '';
                        try { path = new URL(entry.name, location.href).pathname; } catch { continue; }
                        if (!path.includes('/api/') && entry.duration < 500) continue;
                        push('resource', 'network.resource', entry.duration, {
                            path,
                            initiator: String(entry.initiatorType || ''),
                        });
                    }
                });
                observer.observe({ type: 'resource', buffered: true });
                cleanup.push(() => observer.disconnect());
            }
        }
    } catch (error) {
        push('mark', 'diagnostic.performanceObserverUnavailable', 0, { error: String(error?.message || error) });
    }

    // Event-loop lag makes white-screen main-thread blocking visible even when LongTask is unavailable.
    try {
        const intervalMs = 250;
        let expected = perfNow() + intervalMs;
        const timer = setInterval(() => {
            const now = perfNow();
            const lag = now - expected;
            expected = now + intervalMs;
            if (lag >= 150) push('stall', 'browser.eventLoopStall', lag, {});
        }, intervalMs);
        cleanup.push(() => clearInterval(timer));
    } catch {}

    const domReady = () => push('mark', 'browser.DOMContentLoaded');
    const loaded = () => push('mark', 'browser.load');
    try {
        document.addEventListener('DOMContentLoaded', domReady, { once: true });
        window.addEventListener('load', loaded, { once: true });
        cleanup.push(() => document.removeEventListener('DOMContentLoaded', domReady));
        cleanup.push(() => window.removeEventListener('load', loaded));
    } catch {}

    globalThis.__rabbitMirrorPerfDiagCleanup = destroyRabbitMirrorPerformanceDiagnostics;
    console.info('[RM PERF] 诊断已开启。复现卡顿后在 Console 运行 rabbitMirrorPerfSummary()；需要完整记录时运行 rabbitMirrorPerfDump()。不会记录聊天正文、Prompt 或 API Key。');
}

export function destroyRabbitMirrorPerformanceDiagnostics() {
    for (const fn of cleanup.splice(0)) { try { fn(); } catch {} }
    if (globalThis.__rabbitMirrorPerfDiag?.version === PERF_DIAG_VERSION) delete globalThis.__rabbitMirrorPerfDiag;
    try { delete globalThis.rabbitMirrorPerfDump; } catch {}
    try { delete globalThis.rabbitMirrorPerfSummary; } catch {}
    try { delete globalThis.rabbitMirrorStartupSummary; } catch {}
    if (globalThis.__rabbitMirrorPerfDiagCleanup === destroyRabbitMirrorPerformanceDiagnostics) delete globalThis.__rabbitMirrorPerfDiagCleanup;
}
