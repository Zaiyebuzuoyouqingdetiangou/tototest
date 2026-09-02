import assert from 'node:assert/strict';

const values = new Map();
globalThis.localStorage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
};

const originalRandom = Math.random;
Math.random = () => 0.314159;

const { defaultSettings } = await import('../src/settings.js');
const { buildRabbitMirrorPromptDetails } = await import('../src/promptBuilder.js');
const { estimatePromptTokens } = await import('../src/tokenMeter.js');

const settings = {
    ...structuredClone(defaultSettings),
    forceVisualScenery: true,
    rawPolicy: 'balanced',
    visualPromptEditingEnabled: false,
    themesMin: 1,
    themesMax: 1,
    formatsMin: 1,
    formatsMax: 1,
};

const baseDetails = buildRabbitMirrorPromptDetails(settings, 'normal', null, 'budget:base', { chat: [] });
const baseTokens = estimatePromptTokens(baseDetails.prompt).estimatedTokens;
assert.ok(baseDetails.prompt.includes('最终成品短检'));
assert.ok(baseDetails.prompt.includes('对象→操作→第二状态→明确反馈→媒介内自然返回'));
assert.ok(!baseDetails.prompt.includes('internal_check_format'));
assert.ok(baseTokens <= 4000, `base Visual Scenery prompt should stay <= 4000, got ${baseTokens}`);

const skeleton = 'surface_family:深色系统面板；contrast_family:低明度；contour_family:纵向圆角框；reading_family:自上而下；unit_family:卡片；space_family:平面';
values.set('rabbit_mirror_theater:last_combo:v11', JSON.stringify([
    { visualSkeleton: skeleton, ts: 1 },
    { visualSkeleton: skeleton, ts: 2 },
]));
const cooledDetails = buildRabbitMirrorPromptDetails(settings, 'normal', null, 'budget:cooled', { chat: [] });
const cooledTokens = estimatePromptTokens(cooledDetails.prompt).estimatedTokens;
assert.ok(cooledDetails.prompt.includes('视觉短冷却【仅处理连续重复项】'));
assert.ok(!cooledDetails.prompt.includes('近期实际视觉家族【由插件扫描真实 HTML/CSS；越近权重越高】'));
assert.ok(cooledTokens <= 4200, `cooled Visual Scenery prompt should stay <= 4200, got ${cooledTokens}`);

const adultIndependentSettings = {
    ...settings,
    userDirectivePriority: true,
    themesMin: 3,
    themesMax: 3,
};
const adultIndependent = buildRabbitMirrorPromptDetails(
    adultIndependentSettings,
    'independent',
    null,
    'budget:adult-independent',
    { chat: [{ is_user: true, is_system: false, mesid: 1, mes: '兔子镜主题：心理操纵 + 官能色情 + 春梦' }] },
);
assert.deepEqual(adultIndependent.metadata.themeIds, ['A.2.3', 'A.1', 'E.1']);
assert.doesNotMatch(adultIndependent.prompt, /成人条目内部执行边界/, 'independent base prompt must not duplicate its near-output adult lock');
assert.match(adultIndependent.executionLock, /成人条目内部锁/);
const adultIndependentTokens = estimatePromptTokens(`${adultIndependent.prompt}\n${adultIndependent.executionLock}`).estimatedTokens;
assert.ok(adultIndependent.prompt.length + adultIndependent.executionLock.length <= 7000, 'three-theme adult independent prompt and lock must remain far below the 20,000-character context budget');
assert.ok(adultIndependentTokens <= 4500, `three-theme adult independent payload should stay <= 4500 estimated tokens, got ${adultIndependentTokens}`);

Math.random = originalRandom;
delete globalThis.localStorage;
console.log(`promptBudget tests passed (base=${baseTokens}, cooled=${cooledTokens}, adult-independent=${adultIndependentTokens})`);
