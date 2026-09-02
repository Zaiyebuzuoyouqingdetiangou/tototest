import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

register(new URL('./hostLoader.mjs', import.meta.url));

const values = new Map();
globalThis.localStorage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
};
globalThis.sessionStorage = globalThis.localStorage;
globalThis.dispatchEvent = () => true;
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };

const chat = [{ is_user: true, send_date: 10, mes: '第一条用户正文' }];
const context = { chatId: 'follow-multiface-lifecycle', chat };
globalThis.SillyTavern = { getContext: () => context };

const storage = await import('../src/storage.js');
const guard = await import('../src/generationGuard.js');
const combo = name => ({
    themeIds: [`T.${name}`], formatIds: [`F.${name}`], themeGroups: ['A'], formatGroups: ['G'], samplingMode: 'classic',
});
const face = (ordinal, label) => `<toto data-rabbit-mirror="true" data-rm-face="${ordinal}"><details><summary>【兔子镜：${label}】</summary><section><button>按钮 ${ordinal}</button><p>正文 ${ordinal}</p></section></details></toto>`;
const output = label => `正文结束。${face(1, `${label}一`)}${face(2, `${label}二`)}`;
const scans = label => [0, 1].map(faceIndex => ({
    faceIndex, signature: `${label}-${faceIndex}`, skeleton: `s-${faceIndex}`, riskFlags: [],
    paletteFingerprint: null, interactionFamily: { key: `i-${faceIndex}`, label: `i ${faceIndex}`, confidence: 1 },
}));
const makePlan = operationId => storage.createPendingComboBatchPlan(
    [combo(`${operationId}-0`), combo(`${operationId}-1`)],
    {
        kind: 'generation-operation',
        chatKey: storage.getCurrentChatKey(chat),
        generationScopeKey: operationId,
        operationId,
        generationType: 'normal',
        settingsKey: '{"mode":"all","faces":2}',
        preview: false,
    },
    { eligibleFormatIds: [], selectedFormatIds: [], validFormatIds: [`F.${operationId}-0`, `F.${operationId}-1`] },
);

// Registration accepts the real storage plan contract, occurs only after explicit
// dispatch marking, and keeps its identity immutable across the async render gap.
const firstPlan = makePlan('op-one');
assert.equal(firstPlan.kind, 'rabbit-mirror-multiface-plan');
assert.equal(storage.markPendingBatchAttempt(firstPlan), true);
assert.equal(guard.registerRabbitMirrorFollowBatch(chat, 'op-one', firstPlan, {
    faces: [0, 1].map(faceIndex => ({ faceIndex, themeIds: [`T.op-one-${faceIndex}`], formatIds: [`F.op-one-${faceIndex}`] })),
}), true);
assert.equal(guard.registerRabbitMirrorFollowBatch(chat, 'op-one', firstPlan, {
    faces: [0, 1].map(faceIndex => ({ faceIndex, themeIds: [`T.op-one-${faceIndex}`], formatIds: [`F.op-one-${faceIndex}`] })),
}), true, 'duplicate host interceptor registration is idempotent and must not release its storage owner');
firstPlan.identity.operationId = 'forged-after-register';
chat.push({ is_user: false, mes: output('甲'), swipe_id: 0, swipes: [output('甲')] });
let sets = guard.getRabbitMirrorFollowBatchSources(chat);
assert.equal(sets.length, 1);
assert.equal(sets[0].identity.operationId, 'op-one');
assert.equal(Object.isFrozen(sets[0].plan), true);
assert.deepEqual(sets[0].faces.map(item => item.index), [0, 1]);
assert.match(guard.getRabbitMirrorGenerationSnapshot(chat[1], chat, 1, '【兔子镜：甲二】', 1).source, /正文 2/);

// A later same-chat operation at another message has its own bounded owner. It
// must neither replace nor consume the first operation.
chat.push({ is_user: true, send_date: 11, mes: '第二条用户正文' });
const secondPlan = makePlan('op-two');
assert.equal(storage.markPendingBatchAttempt(secondPlan), true);
assert.equal(guard.registerRabbitMirrorFollowBatch(chat, 'op-two', secondPlan), true);
chat.push({ is_user: false, mes: output('乙'), swipe_id: 0, swipes: [output('乙')] });
sets = guard.getRabbitMirrorFollowBatchSources(chat);
assert.deepEqual(sets.map(set => set.owner.messageIndex), [1, 3]);

// Aggregate commit requires the exact owner snapshot used for the scans. A
// source/swipe change during sanitization cannot commit scans from the old face.
const firstSet = sets.find(set => set.batchId === firstPlan.batchId);
const staleOwner = firstSet.owner;
chat[1].swipe_id = 1;
chat[1].swipes.push(output('甲改'));
chat[1].mes = output('甲改');
assert.equal(guard.commitRabbitMirrorFollowBatch(firstPlan.batchId, chat, scans('old'), staleOwner), false);
const refreshedFirst = guard.getRabbitMirrorFollowBatchSources(chat).find(set => set.batchId === firstPlan.batchId);
assert.equal(guard.commitRabbitMirrorFollowBatch(firstPlan.batchId, chat, scans('new'), refreshedFirst.owner), true);
const secondSet = guard.getRabbitMirrorFollowBatchSources(chat).find(set => set.batchId === secondPlan.batchId);
assert.equal(guard.commitRabbitMirrorFollowBatch(secondPlan.batchId, chat, scans('second'), secondSet.owner), true);
assert.equal(guard.getRabbitMirrorFollowBatchSources(chat).length, 0);

// Incomplete terminal output never enters history and exact cancellation only
// releases the intended message owner.
chat.push({ is_user: true, send_date: 12, mes: '第三条用户正文' });
const thirdPlan = makePlan('op-three');
assert.equal(storage.markPendingBatchAttempt(thirdPlan), true);
assert.equal(guard.registerRabbitMirrorFollowBatch(chat, 'op-three', thirdPlan), true);
chat.push({ is_user: false, mes: `${face(1, '丙一')}<toto data-rabbit-mirror="true" data-rm-face="2"><details>`, swipe_id: 0 });
assert.equal(guard.getRabbitMirrorFollowBatchSources(chat).some(set => set.batchId === thirdPlan.batchId), false);
assert.equal(guard.releaseRabbitMirrorFollowBatchAtMessage(chat, 5), true);

// Static integration contract: real prompt install precedes the paid-attempt
// marker; token accounting follows successful owner registration. The scanner
// uses no polling/observer and sanitizes every detached clone before any replace.
const injector = readFileSync(new URL('../src/injector.js', import.meta.url), 'utf8');
const visual = readFileSync(new URL('../src/visualScanner.js', import.meta.url), 'utf8');
const setAt = injector.lastIndexOf('setExtensionPrompt(');
const markAt = injector.indexOf('markPendingBatchAttempt(promptDetails.batchPlan)');
const registerAt = injector.indexOf('registerRabbitMirrorFollowBatch(');
const meterAt = injector.indexOf('recordRabbitMirrorInjection({', registerAt);
assert.ok(setAt >= 0 && setAt < markAt && markAt < registerAt && registerAt < meterAt);
assert.match(injector, /batchOperation:\s*\{[\s\S]*operationId:\s*generationScopeKey[\s\S]*generationType:/);
assert.match(visual, /import\('\.\/outputSanitizer\.js\?rmv=/);
assert.match(visual, /sanitizeRabbitMirrorUntrustedTemplate\(template\)/);
assert.ok(visual.indexOf('sanitizeRabbitMirrorUntrustedTemplate(template)') < visual.indexOf('item.parent.replaceChild(item.newRoot, item.oldRoot)'));
assert.match(visual, /isolateRabbitMirrorInteractionIds\(item\.newRoot\)/);
assert.match(visual, /refreshRabbitMirrorToolsInScope\(item\.newRoot\)/);
assert.match(visual, /markSanitizedRabbitMirrorFace\(item\.newRoot/);
assert.match(visual, /commitRabbitMirrorFollowBatch\(set\.batchId, chat, scans, set\.owner\)/);
assert.match(visual, /export const FOLLOW_MULTIFACE_COMMITTED_EVENT/);
assert.match(visual, /detail:\{messageIndex:Number\(set\.owner\.messageIndex\),sourceHash:String\(set\.owner\.sourceHash\|\|''\),batchId:String\(set\.batchId\|\|''\)\}/);
assert.doesNotMatch(visual, /setInterval\s*\(/);
assert.doesNotMatch(visual, /new\s+MutationObserver\s*\(/);

guard.clearRabbitMirrorGenerationSnapshots();
console.log('followMultifaceLifecycle: owner, aggregate commit, release and sanitizer transaction contracts passed');
