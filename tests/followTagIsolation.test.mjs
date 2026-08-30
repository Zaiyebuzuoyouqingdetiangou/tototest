import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const values = new Map();
globalThis.localStorage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
};

const originalRandom = Math.random;
const originalCrypto = globalThis.crypto;
Object.defineProperty(globalThis, 'crypto', {
    value: { getRandomValues(array) { for (let i = 0; i < array.length; i += 1) array[i] = 0x456789ab; return array; } },
    configurable: true,
});
Math.random = () => 0.271828;

const { defaultSettings, normalizeIndependentContextExcludedTags } = await import('../src/settings.js');
const { buildRabbitMirrorPromptDetails } = await import('../src/promptBuilder.js');
const { estimatePromptTokens } = await import('../src/tokenMeter.js');

assert.equal(defaultSettings.followTagIsolationEnabled, false, 'follow isolation must be opt-in so existing follow mode has zero permanent prompt cost');

const baseSettings = {
    ...structuredClone(defaultSettings),
    generationSource: 'follow',
    followTagIsolationEnabled: false,
    independentContextExcludedTags: ['thinking', 'mini_theater', '<stage-scene>'],
    themesMin: 1,
    themesMax: 1,
    formatsMin: 1,
    formatsMax: 1,
};

const off = buildRabbitMirrorPromptDetails(baseSettings, 'normal', null, 'follow-tag:shared', { chat: [] });
assert.doesNotMatch(off.prompt, /跟随当前 API 的兔子镜标签隔离/);
assert.equal(off.metadata.followTagIsolationEnabled, false);
assert.deepEqual(off.metadata.followTagIsolationTags, []);
assert.equal(off.metadata.followTagIsolationChars, 0);
const offWithDifferentTagList = buildRabbitMirrorPromptDetails(
    { ...baseSettings, independentContextExcludedTags: ['different_tag', 'another_tag'] },
    'normal',
    null,
    'follow-tag:shared',
    { chat: [] },
);
assert.equal(offWithDifferentTagList.prompt, off.prompt, 'when follow isolation is off, changing its tag list must add zero prompt content');

const enabledSettings = {
    ...baseSettings,
    followTagIsolationEnabled: true,
};
const enabled = buildRabbitMirrorPromptDetails(enabledSettings, 'normal', null, 'follow-tag:shared', { chat: [] });
assert.match(enabled.prompt, /跟随当前 API 的兔子镜标签隔离【仅约束 <toto>，正文照常】/);
assert.match(enabled.prompt, /<thinking>/);
assert.match(enabled.prompt, /<mini_theater>/);
assert.match(enabled.prompt, /<stage-scene>/);
assert.match(enabled.prompt, /隔离标签：/);
assert.match(enabled.prompt, /不新增请求|不得复述|不得复述、摘要、仿写/);
assert.equal(enabled.metadata.followTagIsolationEnabled, true);
assert.deepEqual(enabled.metadata.followTagIsolationTags, ['thinking', 'mini_theater', 'stage-scene']);
assert.ok(enabled.metadata.followTagIsolationChars > 0);

const independent = buildRabbitMirrorPromptDetails(
    { ...enabledSettings, generationSource: 'independent' },
    'independent',
    null,
    'follow-tag:independent',
    { chat: [] },
);
assert.doesNotMatch(independent.prompt, /跟随当前 API 的兔子镜标签隔离/);
assert.equal(independent.metadata.followTagIsolationEnabled, false, 'independent mode keeps using its real context-copy filtering path');

const safeTags = normalizeIndependentContextExcludedTags(['<toto>', '<mini-theater onload=alert(1)>', 'bad"><script', '<Scene_1>']);
const guarded = buildRabbitMirrorPromptDetails(
    { ...enabledSettings, independentContextExcludedTags: safeTags },
    'normal',
    null,
    'follow-tag:safe',
    { chat: [] },
);
assert.deepEqual(guarded.metadata.followTagIsolationTags, ['mini-theater', 'scene_1'], '<toto> must never become an excluded source tag and malformed names must be rejected');
assert.doesNotMatch(guarded.prompt, /bad"><script/);

const deltaTokens = estimatePromptTokens(enabled.prompt).estimatedTokens - estimatePromptTokens(off.prompt).estimatedTokens;
assert.ok(deltaTokens > 0 && deltaTokens <= 120, `follow isolation must stay a compact near-output lock, got +${deltaTokens} estimated tokens`);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const promptSource = fs.readFileSync(path.join(root, 'src/promptBuilder.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(root, 'src/ui.js'), 'utf8');
const settingsSource = fs.readFileSync(path.join(root, 'src/settings.js'), 'utf8');
assert.doesNotMatch(promptSource, /scanCurrentChatIndependentContextTags|querySelector|MutationObserver|fetch\(/, 'follow isolation must not add scanning, observers or network activity to prompt construction');
assert.match(uiSource, /id="rh_follow_tag_isolation"/);
assert.match(uiSource, /仅要求兔子镜跳过所选标签内容；如需彻底过滤，请使用独立 API。/);
assert.match(uiSource, /独立 API 会在发送前从副 API 临时上下文副本中过滤并跳过所选标签内容/);
assert.match(uiSource, /预设内尚未出现在聊天正文的标签，请手动添加/);
assert.match(settingsSource, /followTagIsolationEnabled:\s*false/);

Math.random = originalRandom;
Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true });
delete globalThis.localStorage;
console.log(`follow tag isolation tests passed (+${deltaTokens} estimated tokens when explicitly enabled)`);
