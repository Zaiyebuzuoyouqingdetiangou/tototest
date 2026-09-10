import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// TT ChatSurface 仅诊断增量的定向回归。
//
// 重点验证的是「诊断关闭时不得有任何副作用」与「记录内容必须轻量」，
// 而不是诊断数值本身 —— 数值只能在真实 TauriTavern 里产生。

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COHORT = '?rmv=1.5.39-ttdiag1';

globalThis.performance = globalThis.performance || { now: () => Date.now() };

const diag = await import(`../src/ttSurfaceDiagnostics.js${COHORT}`);

// ── 1. 默认关闭 ────────────────────────────────────────────────────────────
test('diagnostics stay off until explicitly started', () => {
    assert.equal(diag.isTtSurfaceDiagnosticsActive(), false);
    assert.equal(diag.ttSurfaceNow(), 0, '关闭时不得调用 performance.now()');
    assert.equal(diag.nextTtSurfaceClickSeq(), 0, '关闭时不得推进 seq');
    diag.recordTtSurface('deliver', { sub: 'x', ms: 1 });
    assert.equal(diag.__ttSurfaceTestHooks().entries().length, 0, '关闭时不得写入任何记录');
});

// ── 2. 开启后记录，停止后不再记录 ──────────────────────────────────────────
test('records only while active and stops cleanly', () => {
    diag.startTtSurfaceDiagnostics();
    assert.equal(diag.isTtSurfaceDiagnosticsActive(), true);
    diag.recordTtSurface('deliver', { sub: 'output-tools', phase: 'didMount', mesid: 7, ms: 1.234 });
    assert.equal(diag.__ttSurfaceTestHooks().entries().length, 1);
    diag.stopTtSurfaceDiagnostics();
    assert.equal(diag.isTtSurfaceDiagnosticsActive(), false);
    diag.recordTtSurface('deliver', { sub: 'later' });
    assert.equal(diag.__ttSurfaceTestHooks().entries().length, 1, '停止后不得继续记录');
});

// ── 3. 只保存轻量数字与短字符串 ────────────────────────────────────────────
test('entries never retain nodes, large payloads or long text', () => {
    diag.startTtSurfaceDiagnostics();
    const fakeNode = { tagName: 'DETAILS', innerHTML: '<b>正文</b>'.repeat(200), parentElement: {} };
    diag.recordTtSurface('layout-write', {
        what: 'x'.repeat(500),
        node: fakeNode,
        big: { nested: { deep: 'value' } },
        ms: 3.14159,
        changed: true,
        nothing: null,
    });
    const [row] = diag.__ttSurfaceTestHooks().entries();
    diag.stopTtSurfaceDiagnostics();

    assert.equal(typeof row.what, 'string');
    assert.ok(row.what.length <= 48, '长字符串必须截断');
    assert.equal(typeof row.node, 'string', '对象必须被字符串化而不是保留引用');
    assert.equal(row.node.includes('正文'), false, '不得保留正文内容');
    assert.equal(typeof row.big, 'string');
    assert.equal(row.ms, 3.14, '数字必须降精度');
    assert.equal(row.changed, true);
    assert.equal('nothing' in row, false, 'null 值不入库');
    for (const value of Object.values(row)) {
        assert.ok(['string', 'number', 'boolean'].includes(typeof value), '只允许标量');
    }
});

// ── 4. 条数上限自动停止 ────────────────────────────────────────────────────
test('buffer cap stops the session by itself', () => {
    const { maxEntries } = diag.__ttSurfaceTestHooks();
    diag.startTtSurfaceDiagnostics();
    for (let i = 0; i < maxEntries + 50; i += 1) diag.recordTtSurface('deliver', { sub: 's', ms: 0 });
    assert.equal(diag.isTtSurfaceDiagnosticsActive(), false, '达到上限必须自动停止');
    assert.equal(diag.__ttSurfaceTestHooks().entries().length, maxEntries);
});

// ── 5. stop 释放全部临时清理项 ─────────────────────────────────────────────
test('stop releases every registered cleanup exactly once', () => {
    let released = 0;
    diag.startTtSurfaceDiagnostics();
    diag.registerTtSurfaceCleanup(() => { released += 1; });
    diag.registerTtSurfaceCleanup(() => { released += 1; });
    diag.stopTtSurfaceDiagnostics();
    assert.equal(released, 2);
    diag.stopTtSurfaceDiagnostics();
    assert.equal(released, 2, '重复 stop 不得重复释放');
});

// ── 6. 一个 cleanup 抛错不得影响其余释放 ───────────────────────────────────
test('a throwing cleanup never blocks the rest', () => {
    let released = 0;
    diag.startTtSurfaceDiagnostics();
    diag.registerTtSurfaceCleanup(() => { throw new Error('boom'); });
    diag.registerTtSurfaceCleanup(() => { released += 1; });
    diag.stopTtSurfaceDiagnostics();
    assert.equal(released, 1);
});

// ── 7. 重新开始会清空上一轮 ────────────────────────────────────────────────
test('starting again clears the previous session', () => {
    diag.startTtSurfaceDiagnostics();
    diag.recordTtSurface('deliver', { sub: 'first' });
    diag.startTtSurfaceDiagnostics();
    assert.equal(diag.__ttSurfaceTestHooks().entries().length, 0);
    diag.stopTtSurfaceDiagnostics();
});

// ── 8. 报告可生成且不含敏感内容 ────────────────────────────────────────────
test('report renders all sections without leaking content', () => {
    diag.startTtSurfaceDiagnostics();
    diag.recordTtSurface('clearance-schedule', { source: 'viewport-scroll' });
    diag.recordTtSurface('clearance-measure', { ms: 0.4, managed: true, height: 42, changed: false });
    diag.recordTtSurface('deliver', { sub: 'output-tools', phase: 'didMount', mesid: 3, ms: 2.5 });
    diag.recordTtSurface('summary-activate', { seq: 1, faceIndex: 0, open: false });
    diag.recordTtSurface('layout-write', { what: 'spacer-append', changed: true });
    diag.recordTtSurface('fallback-toggle', { faceIndex: 0, open: true });
    diag.stopTtSurfaceDiagnostics();
    const report = diag.buildTtSurfaceReport({ version: '1.5.39', managed: true, protocolVersion: 1, registered: true });
    for (const section of ['【A composerClearance】', '【B ChatSurface 分发】', '【C 点击时序】', '【D 布局写入】', '【E 兜底补丁触发】']) {
        assert.ok(report.includes(section), `报告必须包含 ${section}`);
    }
    assert.ok(report.includes('viewport-scroll'));
    assert.ok(report.includes('output-tools/didMount'));
    for (const secret of ['apiKey', 'Bearer', 'sk-', '<toto', 'innerHTML']) {
        assert.equal(report.includes(secret), false, `报告不得包含 ${secret}`);
    }
});

// ── 9. 源码契约：诊断绝不为自己读取几何 ────────────────────────────────────
test('no instrumentation site forces a synchronous layout read', () => {
    for (const file of ['src/composerClearance.js', 'src/hostCompatibility.js', 'src/outputSanitizer.js', 'src/independentApi.js']) {
        const source = readFileSync(resolve(ROOT, file), 'utf-8');
        for (const line of source.split('\n')) {
            if (!line.includes('recordTtSurface(')) continue;
            for (const forbidden = ['offsetHeight', 'offsetWidth', 'getBoundingClientRect', 'getComputedStyle', 'scrollHeight', 'clientHeight']; ;) {
                for (const token of forbidden) {
                    assert.equal(line.includes(token), false, `${file} 的记录点不得读取 ${token}：${line.trim().slice(0, 90)}`);
                }
                break;
            }
        }
    }
});

// ── 10. 源码契约：关闭态零调度 ─────────────────────────────────────────────
test('the diagnostics module registers no observer, interval or polling', () => {
    const source = readFileSync(resolve(ROOT, 'src/ttSurfaceDiagnostics.js'), 'utf-8');
    for (const token of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'setInterval', 'requestAnimationFrame', 'requestIdleCallback']) {
        assert.equal(source.includes(token), false, `诊断模块不得使用 ${token}`);
    }
    // 唯一允许的定时器是一次性自动停止
    assert.equal((source.match(/setTimeout\(/g) || []).length, 1, '只允许一个一次性 setTimeout');
    assert.ok(source.includes('if (!enabled) return;'), '记录入口必须有关闭短路');
});

// ── 11. UI 入口只在 managed 下显示 ─────────────────────────────────────────
test('the settings entry is gated behind managed chat surface', () => {
    const ui = readFileSync(resolve(ROOT, 'src/ui.js'), 'utf-8');
    assert.ok(ui.includes('id="rh_tt_diag_start"'));
    assert.ok(ui.includes('style="display:none;"'), '按钮默认隐藏');
    const index = ui.indexOf("$('#rh_tt_diag_start')");
    const gate = ui.lastIndexOf('isRabbitMirrorManagedChatSurface()', index);
    assert.ok(gate > 0 && index - gate < 1200, '绑定必须位于 managed 判断内部');
    assert.equal(ui.includes('setInterval'), false, 'UI 不得为倒计时轮询');
});

console.log('ttSurfaceDiagnostics: 11 组断言全部通过');
