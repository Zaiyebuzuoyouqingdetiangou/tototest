import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.SillyTavern = { getContext: () => ({ chatId: 'original-visual-contract', chat: [] }) };
globalThis.fetch = () => { throw new Error('No provider or remote resource is part of this test'); };
const { defaultSettings } = await import('../src/settings.js');
const { buildRabbitMirrorPromptDetails } = await import('../src/promptBuilder.js');
const settings = { ...structuredClone(defaultSettings), rabbitMirrorFaceCount: 5, forceVisualScenery: true,
    themesMin: 1, themesMax: 1, formatsMin: 1, formatsMax: 1, enhancedVisualDrawing: true };
for (const route of ['normal', 'independent']) {
    values.clear();
    const result = buildRabbitMirrorPromptDetails(settings, route, null, `scene-contract-${route}`, {
        chat: [], batchIdentity: { mesid: 2, swipeId: 0, sourceHash: 'original-scenery-body' },
    });
    assert.equal(result.metadata.faceCount, 5);
    assert.ok(result.metadata.faces.every(face => face.visualSceneryMode));
    assert.doesNotMatch(result.prompt, /复杂交互视觉核心/, 'all-scenery batch must not receive the non-scene page construction core');
    assert.doesNotMatch(result.prompt, /后续正文与交互可在画面外承载/, 'later mother rule must not override scene-local interaction');
    assert.match(result.prompt, /操作后先改变画面中对象的关系或状态/);
    assert.match(result.prompt, /标题句式与语气由各自媒介决定/);
    assert.equal(result.prompt.split('增强视觉绘制：').length - 1, 1, 'drawing permission stays shared once');
    assert.equal(result.prompt.split('【Visual Scenery 动态画面本体】').length - 1, 1, 'scene mother stays shared once');
    assert.match(result.prompt, /1 条主连续动画 \+ 1 条辅助连续动画/);
    assert.match(result.prompt, /正常文档流/);
}
// Keep an ordinary non-scene medium's existing richer interaction instructions.
values.clear();
const plain = buildRabbitMirrorPromptDetails({ ...settings, forceVisualScenery: false, rabbitMirrorFaceCount: 1,
    userDirectivePriority: true }, 'normal', null, 'plain-contract', {
    chat: [{ is_user: true, mes: '兔子镜展现形式：7.2.1' }],
});
assert.match(plain.prompt, /复杂交互视觉核心/);
const source = readFileSync(new URL('../src/promptBuilder.js', import.meta.url), 'utf8');
assert.match(source, /nonVisualFaces/, 'mixed batches must scope the page core to their non-scene faces');
console.log('runtimeVisualContract passed: both API prompts, five scenes, one shared permission, ordinary medium retained');
