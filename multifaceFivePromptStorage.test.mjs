import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const values = new Map();
const writes = [];
let context = { chatId: 'five-face-contract', chat: [] };
let entropy = 987654321;
globalThis.localStorage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem(key, value) { writes.push(key); values.set(key, String(value)); },
    removeItem: key => values.delete(key),
};
globalThis.sessionStorage = globalThis.localStorage;
globalThis.SillyTavern = { getContext: () => context };
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues(array) {
    for (let index = 0; index < array.length; index += 1) {
        entropy = (Math.imul(entropy, 1664525) + 1013904223) >>> 0;
        array[index] = entropy;
    }
    return array;
} } });

function importedUrl(source, owner, fileName) {
    const path = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1])
        .find(value => value.split('?')[0].endsWith(`/${fileName}`));
    assert.ok(path, `missing production import ${fileName}`);
    return new URL(path, owner);
}
const promptUrl = new URL('../src/promptBuilder.js', import.meta.url);
const promptSource = readFileSync(promptUrl, 'utf8');
const pickerUrl = importedUrl(promptSource, promptUrl, 'picker.js');
const pickerSource = readFileSync(pickerUrl, 'utf8');
const storageUrl = importedUrl(pickerSource, pickerUrl, 'storage.js');
const blacklistUrl = importedUrl(pickerSource, pickerUrl, 'blacklist.js');
const settingsUrl = importedUrl(readFileSync(blacklistUrl, 'utf8'), blacklistUrl, 'settings.js');
const { defaultSettings } = await import(settingsUrl.href);
const { PRESENTATION_FORMATS } = await import(importedUrl(pickerSource, pickerUrl, 'presentationIndex.js').href);
const { THEMATIC_CATEGORIES } = await import(importedUrl(pickerSource, pickerUrl, 'thematicIndex.js').href);
const { buildRabbitMirrorPromptDetails } = await import(promptUrl.href);
const { sanitizeRabbitMirrorCompletionBody } = await import(new URL('../src/independentSecurityGuard.js', import.meta.url).href);
const storage = await import(storageUrl.href);
const HISTORY = 'rabbit_mirror_theater:last_combo:v11';
const BATCH_V1 = 'rabbit_mirror_theater:pending_batch:v1';
const REGISTRY = 'rabbit_mirror_theater:pending_batch_registry:v2';
const ATTEMPTS = 'rabbit_mirror_theater:generation_attempts:v1';

function config(extra = {}) {
    return { ...structuredClone(defaultSettings), enabled: true, autoRabbitMirrorInjection: true,
        mode: 'all', rabbitMirrorFaceCount: 5, userDirectivePriority: true,
        themesMin: 1, themesMax: 1, formatsMin: 1, formatsMax: 1,
        blacklistEnabled: true, blacklistedThemeIds: [], blacklistedFormatIds: [],
        favoriteThemeIds: [], favoriteFormatIds: [], favoriteThemeMultipliers: {}, favoriteFormatMultipliers: {}, ...extra };
}
function operation(scope, preview = false) {
    return { chat: context.chat, batchOperation: { operationId: scope, generationType: 'normal', preview } };
}
function build(settings, scope, preview = false) {
    return buildRabbitMirrorPromptDetails(settings, 'normal', null, scope, operation(scope, preview));
}

// One local plan, one shared Prompt, five different random selections.
values.clear(); writes.length = 0;
const settings = config({ enhancedVisualDrawing: true });
const details = build(settings, 'five-main');
assert.equal(details.metadata.faceCount, 5);
assert.equal(details.metadata.faces.length, 5);
assert.equal(details.batchPlan.requestedFaceCount, 5);
assert.equal(Object.isFrozen(details.batchPlan), true);
assert.equal(Object.isFrozen(details.batchPlan.faces), true);
assert.equal(details.batchPlan.identity.kind, 'generation-operation');
assert.equal('sourceHash' in details.batchPlan.identity, false, 'main API must not invent a final-body hash');
assert.deepEqual(details.metadata.faces.map(face => face.faceIndex), [0, 1, 2, 3, 4]);
assert.match(details.executionLock, /^<兔子镜近输出短锁 data-source="independent-api-near-output">/);
assert.match(details.executionLock, /<\/兔子镜近输出短锁>$/);
assert.doesNotMatch(details.executionLock, /兔子镜多面近输出短锁/);
const guardedMultiface = sanitizeRabbitMirrorCompletionBody(JSON.stringify({
    model: 'fixture',
    messages: [
        { role: 'system', content: details.prompt },
        { role: 'user', content: `请生成多面兔子镜：\n\n【当前聊天逐轮正文】\n[59 ASSISTANT]\n正文已经完整结束。\n\n【当前角色卡摘要】\n{"name":"A"}\n\n${details.executionLock}\n\n现在完成所有面。` },
    ],
    stream: true,
}));
assert.equal(guardedMultiface.rabbitMirror, true,
    'the production multiface execution lock must pass the production independent-request guard');
assert.equal(guardedMultiface.changed, false,
    'modern multiface context must not require a legacy-sensitive-section rewrite');
assert.equal(new Set(details.metadata.faces.flatMap(face => face.themeIds)).size,
    details.metadata.faces.flatMap(face => face.themeIds).length, 'random themes are exact-distinct across faces');
assert.equal(new Set(details.metadata.faces.flatMap(face => face.formatIds)).size,
    details.metadata.faces.flatMap(face => face.formatIds).length, 'random formats are exact-distinct across faces');
assert.match(details.prompt, /5 个互相平级、各自完整闭合的 <toto>/);
assert.match(details.prompt, /禁止把多面塞进同一个 <toto>/);
assert.match(details.prompt, /summary 的中文短标题必须互不相同/);
assert.doesNotMatch(details.prompt, /faceIndex 0|第 0 面/, 'model-facing numbering must never expose the internal zero-based index');
for (let ordinal = 1; ordinal <= 5; ordinal += 1) assert.match(details.prompt, new RegExp(`第 ${ordinal} 面`));
for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
    assert.match(details.prompt, new RegExp(`<toto data-rabbit-mirror="true" data-rm-face="${ordinal}"`));
}
assert.doesNotMatch(details.prompt, /data-rabbit-mirror-face/);
assert.match(details.prompt, /主体轮廓与阅读焦点.*前中后景.*材质.*可逆/);
assert.match(details.prompt, /亮度.*色系.*材质.*轮廓.*阅读路径.*交互家族/s,
    'one shared response must freeze distinct visual dimensions for sibling faces');
assert.match(details.prompt, /至少一面.*明亮.*内容.*硬要求/s,
    'a multiface batch needs one bright face unless the selected content truly requires darkness');
assert.match(details.prompt, /深黑.*矩形.*系统卡/s,
    'dark rectangular system cards must not become the multiface fallback');
assert.match(details.prompt, /最多.*1.*主.*1.*辅.*连续动画/s,
    'dynamic multiface work must keep a bounded continuous-animation budget per face');
assert.match(details.prompt, /粒子群.*blur.*filter/s,
    'dynamic scenery must forbid particle swarms and large-area filters on mobile');
assert.equal(values.has(BATCH_V1), false);
assert.equal(values.has(REGISTRY), false, 'Prompt construction and Token preview do not register an attempt');

// Dispatch registration is explicit, bounded and idempotent. Partial scans cannot commit.
assert.equal(storage.markPendingBatchAttempt(details.batchPlan), true);
const registryOnce = values.get(REGISTRY);
const attemptsOnce = values.get(ATTEMPTS);
const attemptItems = JSON.parse(attemptsOnce)[details.batchPlan.identity.chatKey];
assert.equal(attemptItems.length, 5, 'one dispatched batch records every selected face in exact attempt cooldown');
assert.deepEqual(attemptItems.map(item => item.attemptId), details.batchPlan.faces.map(face => `${details.batchPlan.batchId}:${face.faceIndex}`));
assert.equal(storage.markPendingBatchAttempt(details.batchPlan), true);
assert.equal(values.get(REGISTRY), registryOnce, 'same dispatch plan ages/registers once');
assert.equal(values.get(ATTEMPTS), attemptsOnce, 'idempotent mark does not age exact attempts twice');
const expected = { batchId: details.batchPlan.batchId, identity: details.batchPlan.identity };
assert.equal(storage.commitPendingComboBatch(Array(4).fill({ signature: 'partial' }), expected), false);
assert.equal(values.get(REGISTRY), registryOnce);
assert.equal(values.has(HISTORY), false);
const scans = details.batchPlan.faces.map((face, faceIndex) => ({ faceIndex,
    signature: `face-${faceIndex}`, skeleton: `skeleton-${faceIndex}`,
    riskFlags: faceIndex ? [] : ['fixture'], paletteFingerprint: null,
    interactionFamily: { key: `family-${faceIndex}`, label: `family ${faceIndex}`, confidence: 1 } }));
assert.equal(storage.commitPendingComboBatch(scans, expected), true);
const history = JSON.parse(values.get(HISTORY));
assert.equal(history.filter(item => item.batchId === details.batchPlan.batchId).length, 5);
assert.deepEqual(history.slice(-5).map(item => item.faceIndex), [0, 1, 2, 3, 4]);
assert.equal(storage.releasePendingComboBatch(expected), true, 'finally release is idempotent after aggregate commit');

// Local re-say keeps the original face IDs and never creates/marks another batch.
writes.length = 0;
const resayFace = 3;
const resay = buildRabbitMirrorPromptDetails({ ...settings, rabbitMirrorFaceCount: 1 }, 'independent', null, 'resay-one', {
    multifaceResay: { faceIndex: resayFace, faces: details.metadata.faces },
});
assert.equal(resay.metadata.faceCount, 1);
assert.equal(resay.metadata.resayFaceIndex, resayFace);
assert.deepEqual(resay.metadata.themeIds, details.metadata.faces[resayFace].themeIds);
assert.deepEqual(resay.metadata.formatIds, details.metadata.faces[resayFace].formatIds);
assert.equal('batchPlan' in resay, false);
assert.doesNotMatch(resay.prompt, /多面输出顺序/);
assert.equal(writes.includes(REGISTRY), false);
const customFaceRecords = structuredClone(details.metadata.faces);
customFaceRecords[resayFace].customRequestCount = 1;
assert.throws(() => buildRabbitMirrorPromptDetails({ ...settings, rabbitMirrorFaceCount: 1 }, 'independent', null, 'resay-custom', {
    multifaceResay: { faceIndex: resayFace, faces: customFaceRecords },
}), error => error?.code === 'MULTIFACE_PLAN_UNAVAILABLE' && /自定义点菜/.test(error.message));

// A fixed tarot form may repeat; random themes remain different and image embodiment is explicit.
values.clear(); writes.length = 0;
context.chat = [{ is_user: true, send_date: 10, mes: '兔子镜形式：5.3.1' }];
const tarot = build(config({ rabbitMirrorFaceCount: 2 }), 'tarot-fixed');
assert.equal(tarot.metadata.faceCount, 2);
assert.equal(tarot.metadata.faces.every(face => face.formatIds.includes('5.3.1')), true);
assert.equal(new Set(tarot.metadata.faces.flatMap(face => face.themeIds)).size,
    tarot.metadata.faces.flatMap(face => face.themeIds).length);
assert.match(tarot.prompt, /塔罗实体牌图硬锁/);
assert.match(tarot.prompt, /必须实际使用.*<img> 实体牌图/);
assert.match(tarot.prompt, /https:\/\/gfx\.tarot\.com\/images\/site\/decks\/rider\/full_size\//);
assert.doesNotMatch(tarot.prompt, /第 0 ?面/, '西方神秘学的塔罗图片锁 must use the same 1-based face numbering as data-rm-face');
assert.equal(tarot.metadata.faces.every(face => face.tarotRules === true), true);

// 东方神秘学不应因为泛称“神秘学/占卜”被误判为塔罗实体牌图任务。
context.chat = [{ is_user: true, send_date: 10.5, mes: '兔子镜形式：5.3.2' }];
const easternMysticism = build(config({ rabbitMirrorFaceCount: 2 }), 'eastern-mysticism-fixed');
assert.equal(easternMysticism.metadata.faces.every(face => face.formatIds.includes('5.3.2')), true);
assert.equal(easternMysticism.metadata.faces.every(face => face.tarotRules === false), true);
assert.doesNotMatch(easternMysticism.prompt, /塔罗实体牌图硬锁/);

// Shared rules stay single-copy even when an explicit adult format repeats.
context.chat = [{ is_user: true, send_date: 11, mes: '兔子镜形式：1.1.1.5' }];
const adult = build(config({ rabbitMirrorFaceCount: 3 }), 'adult-fixed');
assert.equal(adult.metadata.faces.every(face => face.formatIds.includes('1.1.1.5')), true);
assert.equal(adult.prompt.split('成人条目内部执行边界【').length - 1, 1, '共享 Prompt 不得按面重复大段通用边界');

// Pool exhaustion is a pre-dispatch error, never a silent short batch.
values.clear();
context.chat = [];
const narrow = config({
    blacklistedThemeIds: THEMATIC_CATEGORIES.slice(1).map(item => item.id),
    blacklistedFormatIds: PRESENTATION_FORMATS.slice(1).map(item => item.id),
});
assert.throws(() => build(narrow, 'narrow-five'), error =>
    error?.code === 'MULTIFACE_PLAN_UNAVAILABLE' && /尚未发送请求/.test(error.message));
assert.equal(values.has(REGISTRY), false);

// Preview plans are useful for diagnostics but can never become paid attempts.
values.clear();
const preview = build(config({ rabbitMirrorFaceCount: 2 }), 'preview-two', true);
assert.equal(preview.batchPlan.identity.preview, true);
assert.equal(storage.markPendingBatchAttempt(preview.batchPlan), false);
assert.equal(values.has(REGISTRY), false);
const malformedOperation = structuredClone(preview.batchPlan);
delete malformedOperation.identity.preview;
assert.equal(storage.markPendingBatchAttempt(malformedOperation), false, 'operation identity requires an explicit boolean preview flag');
assert.equal(values.has(REGISTRY), false);

// Eight active operations are preserved; the ninth is rejected rather than evicting one.
values.clear();
const active = [];
for (let index = 0; index < 9; index += 1) {
    const item = build(config({ rabbitMirrorFaceCount: 2 }), `capacity-${index}`);
    active.push(item.batchPlan);
    assert.equal(storage.markPendingBatchAttempt(item.batchPlan), index < 8);
}
const fullRegistry = JSON.parse(values.get(REGISTRY));
assert.equal(fullRegistry.length, 8);
assert.deepEqual(fullRegistry.map(item => item.plan.batchId), active.slice(0, 8).map(plan => plan.batchId));
fullRegistry[0].createdAt = Date.now() - (12 * 60 * 60 * 1000) - 1;
values.set(REGISTRY, JSON.stringify(fullRegistry));
assert.equal(storage.markPendingBatchAttempt(active[8]), true, 'an expired crashed record is reclaimed only at a later real dispatch');
const reclaimedRegistry = JSON.parse(values.get(REGISTRY));
assert.equal(reclaimedRegistry.length, 8);
assert.equal(reclaimedRegistry.some(item => item.plan.batchId === active[0].batchId), false);
assert.equal(reclaimedRegistry.some(item => item.plan.batchId === active[8].batchId), true);
for (const plan of active) assert.equal(storage.releasePendingComboBatch({ batchId: plan.batchId, identity: plan.identity }), true);

const readableGetItem = globalThis.localStorage.getItem;
globalThis.localStorage.getItem = () => { throw new Error('blocked storage'); };
assert.equal(storage.markPendingBatchAttempt(active[0]), false, 'disabled storage fails closed before dispatch');
assert.equal(storage.commitPendingComboBatch(scans, expected), false, 'disabled storage cannot report a false commit');
globalThis.localStorage.getItem = readableGetItem;

console.log('multifaceFivePromptStorage: 8 contract groups passed');
