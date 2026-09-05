import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
};

globalThis.sessionStorage = globalThis.localStorage;

const settingsModule = await import('../src/settings.js');
const {
  defaultSettings,
  normalizeRabbitMirrorBannedWords,
  RABBIT_MIRROR_BANNED_WORD_MAX_COUNT,
} = settingsModule;
const {
  filterRabbitMirrorVisibleTextValue,
  applyRabbitMirrorBannedWordsToDom,
} = await import('../src/bannedWords.js');
const regex = await import('../src/regexConfigurator.js');
const { buildRabbitMirrorPromptDetails } = await import('../src/promptBuilder.js');

function text(value) {
  return { nodeType: 3, nodeValue: value, textContent: value, parentNode: null, parentElement: null };
}
function element(tagName, children = [], attrs = {}) {
  const node = { nodeType: 1, tagName, childNodes: children, attrs: { ...attrs } };
  for (const child of children) { child.parentNode = node; child.parentElement = node; }
  return node;
}
function fragment(children = []) {
  const node = { nodeType: 11, childNodes: children };
  for (const child of children) child.parentNode = node;
  return node;
}

test('banned word settings normalize line input, de-duplicate case-insensitively, and stay bounded', () => {
  const value = normalizeRabbitMirrorBannedWords('  宝贝  \nBAD\nbad\n\u0000测试\n\n');
  assert.deepEqual(value, ['宝贝', 'BAD', '测试']);
  const many = normalizeRabbitMirrorBannedWords(Array.from({ length: 400 }, (_, i) => `词${i}`));
  assert.equal(many.length, RABBIT_MIRROR_BANNED_WORD_MAX_COUNT);
  assert.deepEqual(defaultSettings.rabbitMirrorBannedWords, []);
});

test('banned words delete visible text only and leave style text / attributes untouched', () => {
  const visible = text('宝贝 BAD bad 保留');
  const svgText = text('SVG宝贝');
  const styleText = text('.宝贝{content:"BAD"}');
  const div = element('DIV', [visible], { class: '宝贝-card', style: 'color:red' });
  const svg = element('text', [svgText], { id: '宝贝-svg' });
  const style = element('STYLE', [styleText]);
  const root = fragment([div, svg, style]);
  const hits = applyRabbitMirrorBannedWordsToDom(root, ['宝贝', 'bad']);
  assert.equal(hits, 4);
  assert.equal(visible.nodeValue, '   保留');
  assert.equal(svgText.nodeValue, 'SVG');
  assert.equal(styleText.nodeValue, '.宝贝{content:"BAD"}', 'CSS/style text must never be filtered');
  assert.equal(div.attrs.class, '宝贝-card', 'attributes must never be filtered');
  assert.equal(svg.attrs.id, '宝贝-svg', 'SVG attributes must never be filtered');
});

test('empty banned list is a zero-work fast path', () => {
  const root = {};
  Object.defineProperty(root, 'childNodes', { get() { throw new Error('must not traverse'); } });
  assert.equal(applyRabbitMirrorBannedWordsToDom(root, []), 0);
  assert.deepEqual(filterRabbitMirrorVisibleTextValue('ABC', []), { text: 'ABC', hits: 0 });
});

test('no-send regex upsert is idempotent and never overwrites a same-name user edit', () => {
  const created = regex.upsertRabbitMirrorNoSendRegexScripts([]);
  assert.equal(created.changed, true);
  assert.equal(created.status, 'created');
  assert.equal(created.scripts.length, 1);
  const script = created.scripts[0];
  assert.equal(script.findRegex, regex.RABBIT_MIRROR_NO_SEND_REGEX_PATTERN);
  assert.deepEqual(script.placement, [2]);
  assert.equal(script.promptOnly, true);
  assert.equal(script.replaceString, '');
  assert.equal(script.disabled, false);

  const repeated = regex.upsertRabbitMirrorNoSendRegexScripts(created.scripts);
  assert.equal(repeated.changed, false);
  assert.equal(repeated.status, 'configured');
  assert.equal(repeated.scripts.length, 1);

  const modifiedManaged = [{ ...script, findRegex: '/user-edited/g' }];
  const updated = regex.upsertRabbitMirrorNoSendRegexScripts(modifiedManaged);
  assert.equal(updated.changed, true);
  assert.equal(updated.status, 'updated');
  assert.equal(updated.scripts[0].findRegex, regex.RABBIT_MIRROR_NO_SEND_REGEX_PATTERN);

  const conflict = [{ ...script, id: 'user-owned', findRegex: '/user-edited/g' }];
  const conflicted = regex.upsertRabbitMirrorNoSendRegexScripts(conflict);
  assert.equal(conflicted.changed, false);
  assert.equal(conflicted.status, 'conflict');
  assert.equal(conflicted.scripts[0].findRegex, '/user-edited/g');
});

test('an equivalent user regex with a different name/id is recognized and not duplicated', () => {
  const equivalent = { ...regex.rabbitMirrorNoSendRegexScript(), id: 'different-id', scriptName: '用户自己的名称' };
  const result = regex.upsertRabbitMirrorNoSendRegexScripts([equivalent]);
  assert.equal(result.changed, false);
  assert.equal(result.status, 'configured');
  assert.equal(result.scripts.length, 1);
});

test('banned words remain local-only and do not change RabbitMirror Prompt bytes', () => {
  const base = {
    ...structuredClone(defaultSettings),
    samplingMode: 'format_only',
    rawPolicy: 'compact',
    userDirectivePriority: true,
    avoidRepeat: false,
    themesMin: 1,
    themesMax: 1,
    formatsMin: 1,
    formatsMax: 1,
    generationSource: 'follow',
  };
  const context = { chat: [{ is_user: true, is_system: false, mes: '兔子镜展现形式：豆瓣' }] };
  for (const generationType of ['normal','independent']) {
    const before = buildRabbitMirrorPromptDetails({ ...base, rabbitMirrorBannedWords: [] }, generationType, null, 'ban-prompt-a', context);
    for (const count of [2,50,256]) {
      const words=Array.from({length:count},(_,i)=>`SYNTHETIC_LOCAL_ONLY_${i}`);
      const after = buildRabbitMirrorPromptDetails({ ...base, rabbitMirrorBannedWords: words }, generationType, null, 'ban-prompt-b', context);
      assert.equal(after.prompt, before.prompt, `${generationType}: ${count} local words must have zero Prompt bytes`);
      assert.equal(after.executionLock, before.executionLock, `${generationType}: ${count} local words must have zero lock bytes`);
    }
  }
});

test('production integration filters after template sanitization and UI exposes one-click regex setup', () => {
  const sanitizer = readFileSync(new URL('../src/outputSanitizer.js', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  const regexSource = readFileSync(new URL('../src/regexConfigurator.js', import.meta.url), 'utf8');
  assert.match(sanitizer, /sanitizeLocalGeneratedPopoverRoutes\(template\);[\s\S]*applyRabbitMirrorBannedWordsToDom\(template\.content, bannedWords\)/);
  assert.match(ui, /禁词表（本地过滤）/);
  assert.match(ui, /一键配置正则/);
  assert.match(ui, /查看酒馆正则/);
  assert.match(regexSource, /getScriptsByType\(engine\.SCRIPT_TYPES\.GLOBAL\)/);
  assert.match(regexSource, /saveScriptsByType\(result\.scripts, engine\.SCRIPT_TYPES\.GLOBAL\)/);
  assert.doesNotMatch(regexSource, /SCRIPT_TYPES\.SCOPED|SCRIPT_TYPES\.PRESET/);
});

console.log('bannedWordsRegexSetup tests passed');
