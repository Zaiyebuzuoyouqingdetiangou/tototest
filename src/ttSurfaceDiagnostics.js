// TT ChatSurface 仅诊断增量。
//
// 设计约束（全部为硬约束，改动时不得放宽）：
//   · 关闭时唯一开销是每个记录点首行的一次布尔判断；不新增 Observer、轮询、
//     DOM 写入或额外调度。
//   · 绝不为诊断额外读取 offsetHeight / getBoundingClientRect —— 强制 layout
//     会污染我们正在测量的 TT 性能。只复用 RabbitMirror 本来就算好的数值。
//   · entries 只保存数字与短字符串；不保存正文、HTML、节点引用、Prompt、
//     API Key、响应正文或任何大对象。
//   · 手动开启、20 秒自动停止、最多 1200 条；stop 后释放全部临时 listener /
//     timer / 引用，只保留最终报告所需的轻量数据。

const MAX_ENTRIES = 1200;
const AUTO_STOP_MS = 20000;
const MAX_TEXT = 48;

let enabled = false;
let entries = [];
let startedAt = 0;
let autoStopTimer = 0;
let stoppedAt = 0;
let cleanup = [];
let clickSeq = 0;
let onStateChange = null;

const shortText = value => String(value ?? '').slice(0, MAX_TEXT);
const round2 = value => Math.round(Number(value || 0) * 100) / 100;

export function isTtSurfaceDiagnosticsActive() {
    return enabled;
}

export function ttSurfaceDiagnosticsHasReport() {
    return entries.length > 0;
}

/**
 * 唯一记录入口。
 *
 * meta 只接受数字、布尔与短字符串；调用方不得传入节点、事件对象或正文。
 * 关闭时立即返回，不做任何拷贝或序列化。
 */
export function recordTtSurface(kind, meta) {
    if (!enabled) return;
    const row = { t: round2(performance.now() - startedAt), kind: shortText(kind) };
    if (meta) {
        for (const key of Object.keys(meta)) {
            const value = meta[key];
            if (value === undefined || value === null) continue;
            if (typeof value === 'number') row[key] = Number.isFinite(value) ? round2(value) : 0;
            else if (typeof value === 'boolean') row[key] = value;
            else row[key] = shortText(value);
        }
    }
    entries.push(row);
    if (entries.length >= MAX_ENTRIES) stopTtSurfaceDiagnostics();
}

/** 计时辅助：关闭时返回 0，调用方据此跳过 performance.now()。 */
export function ttSurfaceNow() {
    return enabled ? performance.now() : 0;
}

export function nextTtSurfaceClickSeq() {
    if (!enabled) return 0;
    clickSeq += 1;
    return clickSeq;
}

/** 诊断期间才存在的临时监听器由此登记，stop 时统一释放。 */
export function registerTtSurfaceCleanup(dispose) {
    if (typeof dispose === 'function') cleanup.push(dispose);
}

export function startTtSurfaceDiagnostics(options = {}) {
    stopTtSurfaceDiagnostics();
    entries = [];
    clickSeq = 0;
    stoppedAt = 0;
    startedAt = performance.now();
    enabled = true;
    onStateChange = typeof options.onStateChange === 'function' ? options.onStateChange : null;
    // 单个一次性定时器，不是轮询；期间不刷新任何 UI。
    autoStopTimer = setTimeout(() => { autoStopTimer = 0; stopTtSurfaceDiagnostics(); }, AUTO_STOP_MS);
    onStateChange?.(true);
    return true;
}

export function stopTtSurfaceDiagnostics() {
    if (autoStopTimer) { clearTimeout(autoStopTimer); autoStopTimer = 0; }
    if (!enabled) { cleanup = []; return false; }
    enabled = false;
    stoppedAt = performance.now();
    for (const dispose of cleanup) { try { dispose(); } catch { /* 释放失败不得影响宿主 */ } }
    cleanup = [];
    const notify = onStateChange;
    onStateChange = null;
    notify?.(false);
    return true;
}

function group(kinds) {
    const rows = new Map();
    for (const entry of entries) {
        if (!kinds.includes(entry.kind)) continue;
        const key = entry.sub ? `${entry.sub}/${entry.kind2 || entry.kind}` : (entry.source || entry.what || entry.kind);
        const row = rows.get(key) || { key, n: 0, total: 0, max: 0, changed: 0 };
        row.n += 1;
        row.total += Number(entry.ms || 0);
        row.max = Math.max(row.max, Number(entry.ms || 0));
        if (entry.changed === true) row.changed += 1;
        rows.set(key, row);
    }
    return [...rows.values()].sort((a, b) => b.n - a.n);
}

export function buildTtSurfaceReport(context = {}) {
    const duration = ((stoppedAt || performance.now()) - startedAt) / 1000;
    const lines = [];
    lines.push('RabbitMirror TT ChatSurface 诊断');
    lines.push(`版本 ${shortText(context.version || '')} | 时长 ${duration.toFixed(1)}s | 记录 ${entries.length} 条`);
    lines.push(`managed=${context.managed === true} protocolVersion=${shortText(context.protocolVersion ?? '')} registered=${context.registered === true}`);
    lines.push(entries.length >= MAX_ENTRIES ? '（已达 1200 条上限提前停止，数值为截断样本）' : '');

    lines.push('', '【A composerClearance】');
    const schedules = group(['clearance-schedule']);
    lines.push('  触发来源'.padEnd(26) + '次数');
    for (const row of schedules) lines.push(`  ${row.key.padEnd(24)}${row.n}`);
    const measures = group(['clearance-measure']);
    for (const row of measures) {
        lines.push(`  measure  次数 ${row.n}  总 ${row.total.toFixed(1)}ms  最大 ${row.max.toFixed(2)}ms  均 ${(row.total / Math.max(1, row.n)).toFixed(3)}ms`);
        lines.push(`  measure 实际改变高度: ${row.changed} / ${row.n}`);
    }

    lines.push('', '【B ChatSurface 分发】');
    const delivers = new Map();
    for (const entry of entries) {
        if (entry.kind !== 'deliver') continue;
        const key = `${entry.sub}/${entry.phase}`;
        const row = delivers.get(key) || { key, n: 0, total: 0, max: 0 };
        row.n += 1; row.total += Number(entry.ms || 0); row.max = Math.max(row.max, Number(entry.ms || 0));
        delivers.set(key, row);
    }
    lines.push('  订阅者/阶段'.padEnd(44) + '次数   总ms   最大ms');
    for (const row of [...delivers.values()].sort((a, b) => b.n - a.n)) {
        lines.push(`  ${row.key.padEnd(42)}${String(row.n).padEnd(7)}${row.total.toFixed(1).padEnd(7)}${row.max.toFixed(2)}`);
    }
    const leaseDispose = entries.filter(e => e.kind === 'lease-dispose').length;
    const leaseAbort = entries.filter(e => e.kind === 'lease-abort').length;
    lines.push(`  lease-dispose ${leaseDispose} | lease-abort ${leaseAbort}`);
    for (const row of group(['install'])) {
        lines.push(`  install ${row.key.padEnd(34)}次数 ${row.n}  总 ${row.total.toFixed(1)}ms  最大 ${row.max.toFixed(2)}ms`);
    }

    lines.push('', '【C 点击时序】');
    lines.push('  按采集顺序列出本次全部输入/补丁记录（共享 1200 条总上限），+ms 从诊断开始计。');
    lines.push('  phase=capture-before-default：捕获阶段、原生默认动作之前；open/defaultPrevented 是当时值，可能早于后续拦截，不能单独认定最终切换结果。');
    lines.push('  seq 仅为诊断关联；迟到 click 请结合 pointerId、node 与快速展开/拦截记录，不按最近一组手势推断。');
    const inputKinds = ['pointerdown', 'pointerup', 'pointercancel', 'click', 'toggle', 'summary-activate',
        'tt-fast-toggle', 'tt-delayed-click-suppressed', 'fallback-toggle', 'intent-restore'];
    let inputCount = 0;
    for (const row of entries) {
        if (!row.seq && !inputKinds.includes(row.kind)) continue;
        inputCount += 1;
        const extra = ['seq', 'pointerId', 'pointerType', 'detail', 'eventTime', 'phase', 'node', 'mesid',
            'faceIndex', 'open', 'sameDetails', 'connected', 'defaultPrevented', 'suppressed', 'match', 'ms']
            .filter(key => row[key] !== undefined)
            .map(key => `${key}=${row[key]}`).join(',');
        lines.push(`  +${row.t.toFixed(0)}ms ${row.kind}${extra ? `(${extra})` : ''}`);
    }
    if (!inputCount) lines.push('  （本次未记录到点击）');

    lines.push('', '【D 布局写入】（仅复用既有数值，未额外触发 layout）');
    const writes = group(['layout-write']);
    if (!writes.length) lines.push('  （本次未记录到写入）');
    for (const row of writes) {
        lines.push(`  ${row.key.padEnd(34)}次数 ${row.n}  其中数值实际变化 ${row.changed}`);
    }

    lines.push('', '【E 兜底补丁触发】');
    for (const kind of ['tt-fast-toggle', 'tt-delayed-click-suppressed', 'fallback-toggle', 'intent-restore']) {
        lines.push(`  ${kind.padEnd(20)}${entries.filter(e => e.kind === kind).length} 次`);
    }
    return lines.filter(line => line !== undefined).join('\n');
}

/** 仅供定向测试使用；生产路径不调用。 */
export function __ttSurfaceTestHooks() {
    return { entries: () => entries.map(row => ({ ...row })), maxEntries: MAX_ENTRIES, autoStopMs: AUTO_STOP_MS };
}
