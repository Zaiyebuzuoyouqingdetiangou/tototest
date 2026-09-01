import assert from 'node:assert/strict';

// 单请求多面 第一阶段：picker 层专项回归。
// 覆盖批次计划幂等、单面零回归、批内互斥与 faceCount 归一化。
// 需要 --loader ./tests/hostLoader.mjs 提供宿主模块桩。

const values = new Map();
globalThis.localStorage = {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
};
globalThis.sessionStorage = globalThis.localStorage;
globalThis.dispatchEvent = () => true;
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };

const settingsModule = await import('../src/settings.js');
const picker = await import('../src/picker.js');

const PENDING_KEY = 'rabbit_mirror_theater:pending_combo:v11';
const BATCH_KEY = 'rabbit_mirror_theater:pending_batch:v1';

function freshSettings(overrides = {}) {
    values.clear();
    const settings = settingsModule.getSettings();
    settings.mode = 'all';
    Object.assign(settings, overrides);
    return settings;
}
const shape = face => `${(face?.combo?.themeIds || []).join(',')}|${(face?.combo?.formatIds || []).join(',')}`;
// C1 requires explicit current-target identity; no body scanning or guessed owner.
const batchContext = () => ({ batchIdentity: { mesid: 7, swipeId: 0, sourceHash: 'batch-plan-fixture' } });

// ── 1. 同 scope 批次幂等：重复调用必须返回同一批计划 ────────────────────
{
    const settings = freshSettings();
    const first = picker.pickCombinationBatch(settings, 'scope-idem', batchContext(), 3);
    const second = picker.pickCombinationBatch(settings, 'scope-idem', batchContext(), 3);
    assert.equal(first.length, 3, '三面规划应产生三面');
    assert.deepEqual(first.map(shape), second.map(shape), '同 scope 重复调用必须返回同一批次计划');
    const third = picker.pickCombinationBatch(settings, 'scope-idem', batchContext(), 3);
    assert.deepEqual(first.map(shape), third.map(shape), '第三次调用仍应命中同一计划');
}

// ── 2. 不同 scope 必须重新规划 ────────────────────────────────────────
{
    const settings = freshSettings();
    const a = picker.pickCombinationBatch(settings, 'scope-a', batchContext(), 3);
    const b = picker.pickCombinationBatch(settings, 'scope-b', batchContext(), 3);
    assert.equal(a.length, 3);
    assert.equal(b.length, 3);
    assert.notDeepEqual(a.map(shape), b.map(shape), '不同 scope 应各自规划');
}

// ── 3. 批内互斥：三面主题与展现形式不得重复 ────────────────────────────
{
    let duplicateThemeBatches = 0;
    let duplicateFormatBatches = 0;
    const rounds = 120;
    for (let index = 0; index < rounds; index += 1) {
        const settings = freshSettings();
        const faces = picker.pickCombinationBatch(settings, `batch-${index}`, batchContext(), 3);
        const themes = faces.flatMap(face => face?.combo?.themeIds || []);
        const formats = faces.flatMap(face => face?.combo?.formatIds || []);
        if (new Set(themes).size !== themes.length) duplicateThemeBatches += 1;
        if (new Set(formats).size !== formats.length) duplicateFormatBatches += 1;
    }
    assert.equal(duplicateThemeBatches, 0, `${rounds} 批中出现重复主题的批次数应为 0`);
    assert.equal(duplicateFormatBatches, 0, `${rounds} 批中出现重复展现形式的批次数应为 0`);
}

// ── 4. 三面规划不污染单面 pending，批次槽成为权威状态 ───────────────────
{
    const settings = freshSettings();
    picker.pickCombinationBatch(settings, 'scope-authority', batchContext(), 3);
    assert.ok(values.has(BATCH_KEY), '三面规划应建立批次槽');
    assert.equal(values.has(PENDING_KEY), false, '三面规划不得留下单面 pending');
    const batch = JSON.parse(values.get(BATCH_KEY));
    assert.equal(batch.faces.length, 3, '批次槽应记录三面完整计划');
    const planned = new Set(batch.faces.map(face => `${face.themeIds.join(',')}|${face.formatIds.join(',')}`));
    assert.equal(planned.size, 3, '批次槽内三面不得互相覆盖');
}

// ── 5. faceCount = 1 与 1.4.5-test 行为完全一致 ───────────────────────
{
    const settings = freshSettings();
    const single = picker.pickCombinationBatch(settings, 'scope-single', null, 1);
    assert.equal(Array.isArray(single), true, '单面也返回数组');
    assert.equal(single.length, 1, '单面只返回一面');
    assert.equal(values.has(BATCH_KEY), false, '单面不得建立批次槽');
    assert.ok(values.has(PENDING_KEY), '单面必须仍走既有 PENDING_KEY');

    // 与直接调用 pickCombination 的结果结构一致
    const direct = picker.pickCombination(settings, 'scope-single', null);
    assert.deepEqual(shape(single[0]), shape(direct), '同 scope 下单面批次应与既有单面调用命中同一结果');
}

// ── 6. 未传 faceCount 时默认单面 ──────────────────────────────────────
{
    const settings = freshSettings();
    const implicit = picker.pickCombinationBatch(settings, 'scope-implicit', null);
    assert.equal(implicit.length, 1, '省略 faceCount 应按单面处理');
    assert.equal(values.has(BATCH_KEY), false);
}

// ── 7. faceCount 归一化：异常值不得意外开启多面 ────────────────────────
{
    const cases = [
        [undefined, 1], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5],
        [0, 1], [6, 1], [-1, 1], ['2', 1], [2.7, 1],
        [Number.NaN, 1], [Number.POSITIVE_INFINITY, 1], [null, 1],
    ];
    for (const [input, expected] of cases) {
        values.clear();
        settingsModule.getSettings();
        settingsModule.updateSettings({ rabbitMirrorFaceCount: input });
        const actual = settingsModule.getSettings().rabbitMirrorFaceCount;
        assert.equal(actual, expected, `rabbitMirrorFaceCount=${String(input)} 应归一化为 ${expected}，实际 ${actual}`);
    }
}

// ── 8. 批次计划不得越过黑名单等更高优先级过滤 ──────────────────────────
{
    const settings = freshSettings();
    const faces = picker.pickCombinationBatch(settings, 'scope-pool', batchContext(), 3);
    for (const face of faces) {
        assert.ok((face?.combo?.themeIds || []).length > 0, '每面都应抽到主题');
        assert.ok((face?.combo?.formatIds || []).length > 0, '每面都应抽到展现形式');
    }
}

// ── 9. 批次存储失败 → 固定首面；同身份稳定，新 scope 存储恢复 ──────────
{
    const settings = freshSettings();
    const realSet = globalThis.localStorage.setItem;
    globalThis.localStorage.setItem = (key, value) => {
        if (key === BATCH_KEY) return; // 静默失败
        return realSet(key, value);
    };
    const degraded = picker.pickCombinationBatch(settings, 'scope-degrade', batchContext(), 3);
    globalThis.localStorage.setItem = realSet;

    assert.equal(degraded.length, 1, '批次存储失败必须降级为单面');
    assert.equal(values.has(BATCH_KEY), false, '失败后不得留下批次槽');
    assert.ok(values.has(PENDING_KEY), '降级后应回到既有单面 PENDING_KEY');

    // C1：不得缓存失败的三面半成品，也不能同 scope 偷偷重新抽签。
    const stable = picker.pickCombinationBatch(settings, 'scope-degrade', batchContext(), 3);
    assert.equal(stable.length, 1, '存储恢复后同身份 / scope 必须保持首面');
    assert.deepEqual(stable.map(shape), degraded.map(shape), '降级首面不得被重新抽签');
    const recovered = picker.pickCombinationBatch(settings, 'scope-degrade-recovered', batchContext(), 3);
    assert.equal(recovered.length, 3, '存储恢复后新 scope 应重新规划三面');
    assert.ok(values.has(BATCH_KEY), '恢复后应建立批次槽');
}

console.log('multifaceBatchPlan: 9 组断言全部通过');
