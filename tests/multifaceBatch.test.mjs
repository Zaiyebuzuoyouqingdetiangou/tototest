import assert from 'node:assert/strict';

// 单请求多面 第一阶段专项回归。
// 只覆盖基础层：批次规划、批次待提交、按面落史。
// 不涉及 Prompt 多 <toto>、visualScanner 多面、outputSanitizer、多 host、feedbackCat。

const values = new Map();
globalThis.localStorage = {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
};
globalThis.sessionStorage = globalThis.localStorage;
globalThis.dispatchEvent = () => true;
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };

const storage = await import('../src/storage.js');

const HISTORY_KEY = 'rabbit_mirror_theater:last_combo:v11';
const PENDING_KEY = 'rabbit_mirror_theater:pending_combo:v11';
const BATCH_KEY = 'rabbit_mirror_theater:pending_batch:v1';

const combo = name => ({
    themeIds: [`T.${name}`],
    formatIds: [`F.${name}`],
    themeGroups: ['A'],
    formatGroups: ['G'],
    samplingMode: 'classic',
});
const visual = brightness => ({
    brightness,
    hueFamily: 'blue',
    temperature: 'cool',
    saturation: 'low',
    confidence: 0.6,
    darkAreaRatio: 0.4,
    lightAreaRatio: 0.5,
    averageLuminance: 130,
});
const history = () => storage.getComboHistory(20);
const reset = () => values.clear();

// ── 1. 三面规划不污染单面 pending ───────────────────────────────────────
reset();
storage.setPendingComboBatch([combo('a'), combo('b'), combo('c')]);
assert.ok(values.has(BATCH_KEY), '批次槽应写入');
assert.equal(values.has(PENDING_KEY), false, '三面规划不得留下单面 pending');

// ── 2. 单面走原路径：只写 PENDING_KEY，不建批次 ────────────────────────
reset();
storage.setPendingComboBatch([combo('solo')]);
assert.ok(values.has(PENDING_KEY), '单面应回落到既有 PENDING_KEY');
assert.equal(values.has(BATCH_KEY), false, '单面不得建立批次槽');

// ── 3. 按面独立落史，未提交的面不入史 ──────────────────────────────────
reset();
storage.setPendingComboBatch([combo('1'), combo('2'), combo('3')]);
assert.equal(storage.commitPendingBatchFace(0, 's1', 'k1', [], visual('dark'), null), true);
assert.equal(storage.commitPendingBatchFace(1, 's2', 'k2', [], visual('light'), null), true);
assert.equal(history().length, 2, '提交两面应得两条历史');
assert.equal(history().some(item => item.themeIds[0] === 'T.3'), false, '未提交的面不得入史');
assert.equal(storage.commitPendingBatchFace(2, 's3', 'k3', [], visual('mid'), null), true);
assert.deepEqual(history().map(item => item.themeIds[0]), ['T.1', 'T.2', 'T.3'], '三面顺序应与提交顺序一致');
assert.equal(values.has(BATCH_KEY), false, '三面全部提交后批次槽应清空');

// ── 4. 同一面重复提交必须被拒 ──────────────────────────────────────────
reset();
storage.setPendingComboBatch([combo('x'), combo('y')]);
assert.equal(storage.commitPendingBatchFace(0, 's', 'k', [], visual('dark'), null), true);
assert.equal(storage.commitPendingBatchFace(0, 's', 'k', [], visual('dark'), null), false, '重复提交同一面必须返回 false');
assert.equal(history().length, 1, '重复提交不得产生第二条历史');

// ── 5. face 只在真正 commit 成功后才置 committed ───────────────────────
reset();
storage.setPendingComboBatch([combo('p'), combo('q')]);
const realSetItem = globalThis.localStorage.setItem;
globalThis.localStorage.setItem = (key, value) => {
    if (key === HISTORY_KEY) throw new Error('simulated quota failure');
    return realSetItem(key, value);
};
assert.equal(storage.commitPendingBatchFace(0, 's', 'k', [], visual('dark'), null), false, '历史写入失败必须返回 false');
globalThis.localStorage.setItem = realSetItem;
const afterFailure = JSON.parse(values.get(BATCH_KEY));
assert.equal(afterFailure.faces[0].committed, undefined, '写入失败的 face 不得被标记 committed');
assert.equal(storage.commitPendingBatchFace(0, 's', 'k', [], visual('dark'), null), true, '恢复后同一面应可重试成功');
assert.equal(history().length, 1);

// ── 6. 批次提交不得借道旧 PENDING_KEY 的内容 ───────────────────────────
reset();
storage.setPendingCombo(combo('STALE'));
storage.setPendingComboBatch([combo('m'), combo('n')]);
assert.equal(values.has(PENDING_KEY), false, '建立批次时应清掉单面 pending');
storage.commitPendingBatchFace(0, 's', 'k', [], visual('dark'), null);
assert.equal(history().length, 1);
assert.equal(history()[0].themeIds[0], 'T.m', '提交的必须是批次面本身，不能是旧 PENDING_KEY 内容');

// ── 7. clearLastCombo 必须清批次槽 ─────────────────────────────────────
reset();
storage.setPendingComboBatch([combo('u'), combo('v')]);
assert.ok(values.has(BATCH_KEY));
storage.clearLastCombo();
assert.equal(values.has(BATCH_KEY), false, 'clearLastCombo 必须清除 PENDING_BATCH_KEY');
assert.equal(storage.commitPendingBatchFace(0, 's', 'k', [], visual('dark'), null), false, '清除后不得还能提交旧批次');

// ── 8. 跨页面会话的批次不得补写历史 ────────────────────────────────────
reset();
storage.setPendingComboBatch([combo('s1'), combo('s2')]);
const stale = JSON.parse(values.get(BATCH_KEY));
stale.pendingSession = 'previous-page-session';
values.set(BATCH_KEY, JSON.stringify(stale));
assert.equal(storage.commitPendingBatchFace(0, 's', 'k', [], visual('dark'), null), false, '跨会话批次必须被拒绝');
assert.equal(history().length, 0, '跨会话批次不得写入任何历史');

// ── 9. 超龄批次同样被拒 ────────────────────────────────────────────────
reset();
storage.setPendingComboBatch([combo('o1'), combo('o2')]);
const aged = JSON.parse(values.get(BATCH_KEY));
aged.pendingTs = Date.now() - 13 * 60 * 60 * 1000;
values.set(BATCH_KEY, JSON.stringify(aged));
assert.equal(storage.commitPendingBatchFace(0, 's', 'k', [], visual('dark'), null), false, '超龄批次必须被拒绝');
assert.equal(history().length, 0);

// ── 10. 单面 commitPendingCombo 行为不变（共享底层未改变既有语义）─────
reset();
storage.setPendingCombo(combo('legacy'));
storage.commitPendingCombo('sig', 'skel', ['flag'], visual('light'), null);
assert.equal(history().length, 1, '单面提交仍应写入一条历史');
assert.equal(history()[0].themeIds[0], 'T.legacy');
assert.equal(history()[0].visualSignature, 'sig');
assert.equal(values.has(PENDING_KEY), false, '单面提交成功后应清空 PENDING_KEY');

// ── 11. 批次上限为 3，超界计划整体拒绝而非静默改变计划 ────────────────
reset();
assert.equal(storage.setPendingComboBatch([combo('1'), combo('2'), combo('3'), combo('4'), combo('5')]), '', '超过三面应拒绝而非截断');
assert.equal(values.has(BATCH_KEY), false, '拒绝超界批次不得留下部分计划');

// ── 12. 空批次不得留下残留槽 ───────────────────────────────────────────
reset();
storage.setPendingComboBatch([]);
assert.equal(values.has(BATCH_KEY), false, '空批次不得写入批次槽');

// ── 13. 提交幂等：history 成功 → 批次状态落盘失败 → 重试不得重复入史 ────
// 场景：face0 写史成功但 pending_batch 的 committed 落盘失败 → face1 成功
//       → 重试 face0，必须幂等，history 仍只有两条。
reset();
storage.setPendingComboBatch([combo('i0'), combo('i1')]);
const okSetItem = globalThis.localStorage.setItem;

// face0：history 写入成功，但批次状态落盘失败（committed 标记丢失）
globalThis.localStorage.setItem = (key, value) => {
    if (key === BATCH_KEY) throw new Error('simulated batch persist failure');
    return okSetItem(key, value);
};
assert.equal(storage.commitPendingBatchFace(0, 'v0', 'k0', [], visual('dark'), null), true, 'face0 写史应成功');
globalThis.localStorage.setItem = okSetItem;

const lost = JSON.parse(values.get(BATCH_KEY));
assert.equal(lost.faces[0].committed, undefined, '批次状态落盘失败后 committed 标记确实丢失');
assert.equal(history().length, 1, 'face0 已进入 history');

// face1：正常提交
assert.equal(storage.commitPendingBatchFace(1, 'v1', 'k1', [], visual('light'), null), true, 'face1 应正常提交');
assert.equal(history().length, 2);

// 重试 face0：committed 标记已丢失，但 history 里有 batchId+faceIndex，必须幂等
assert.equal(storage.commitPendingBatchFace(0, 'v0', 'k0', [], visual('dark'), null), true, '重试应报告成功（幂等）');
assert.equal(history().length, 2, '重试 face0 绝不能产生第三条历史');
assert.deepEqual(history().map(item => item.themeIds[0]), ['T.i0', 'T.i1'], '历史内容与顺序不得改变');

// ── 14. history 条目携带 batchId + faceIndex 幂等键 ────────────────────
reset();
storage.setPendingComboBatch([combo('k0'), combo('k1')]);
const activeBatchId = JSON.parse(values.get(BATCH_KEY)).batchId;
assert.ok(activeBatchId, '批次应生成 batchId');
storage.commitPendingBatchFace(0, '', '', [], null, null);
storage.commitPendingBatchFace(1, '', '', [], null, null);
const keyed = history();
assert.equal(keyed[0].batchId, activeBatchId, '历史条目应带 batchId');
assert.equal(keyed[0].faceIndex, 0);
assert.equal(keyed[1].faceIndex, 1);

// ── 15. 不同批次的相同 faceIndex 互不干扰 ──────────────────────────────
reset();
storage.setPendingComboBatch([combo('b1f0'), combo('b1f1')]);
storage.commitPendingBatchFace(0, '', '', [], null, null);
storage.setPendingComboBatch([combo('b2f0'), combo('b2f1')]);
storage.commitPendingBatchFace(0, '', '', [], null, null);
assert.equal(history().length, 2, '不同 batchId 的 face0 应各自入史');
assert.deepEqual(history().map(item => item.themeIds[0]), ['T.b1f0', 'T.b2f0']);

// ── 16. 单面提交不带幂等键，语义完全不变 ───────────────────────────────
reset();
storage.setPendingCombo(combo('plain'));
storage.commitPendingCombo('s', 'k', [], null, null);
assert.equal(history()[0].batchId, undefined, '单面历史条目不得混入 batchId');
assert.equal(history()[0].faceIndex, undefined);

// ── 17. 批次初始写入失败：setPendingComboBatch 必须返回失败 ─────────────
reset();
const realSet = globalThis.localStorage.setItem;
globalThis.localStorage.setItem = (key, value) => {
    if (key === BATCH_KEY) return; // 静默失败：写不进去但不抛错
    return realSet(key, value);
};
const failedId = storage.setPendingComboBatch([combo('f1'), combo('f2'), combo('f3')]);
globalThis.localStorage.setItem = realSet;
assert.equal(failedId, '', '批次写入失败必须返回空 batchId');
assert.equal(values.has(BATCH_KEY), false, '失败后不得留下半成品批次槽');
assert.equal(storage.commitPendingBatchFace(0, '', '', [], null, null), false, '失败的批次不得可提交');

console.log('multifaceBatch: 17 项断言全部通过');
