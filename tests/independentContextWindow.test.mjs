
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const independentSource = readFileSync(resolve(ROOT, 'src/independentApi.js'), 'utf8');
const settingsSource = readFileSync(resolve(ROOT, 'src/settings.js'), 'utf8');
const uiSource = readFileSync(resolve(ROOT, 'src/ui.js'), 'utf8');
const tokenSource = readFileSync(resolve(ROOT, 'src/tokenMeter.js'), 'utf8');

const tagSettingStart = settingsSource.indexOf('export const INDEPENDENT_CONTEXT_EXCLUDED_TAG_MAX_COUNT');
const tagSettingEnd = settingsSource.indexOf('const LEGACY_FORMAT_ID_ALIASES', tagSettingStart);
assert.ok(tagSettingStart >= 0 && tagSettingEnd > tagSettingStart, 'tag-setting normalizer block must exist');
const tagSettingSandbox = { Object, String, Array, Set, globalThis: {} };
vm.createContext(tagSettingSandbox);
vm.runInContext(`${settingsSource.slice(tagSettingStart, tagSettingEnd).replace(/^export /gm, '')}
globalThis.__normalize=normalizeIndependentContextExcludedTags;`, tagSettingSandbox);
const normalizeTags = tagSettingSandbox.globalThis.__normalize;
assert.deepEqual([...normalizeTags(' <Thinking>, </UpdateVariable>；<UpdateVarible/> invalid[] thinking ')], ['thinking', 'updatevariable', 'updatevarible']);
assert.equal(normalizeTags(Array.from({ length: 50 }, (_, index) => `tag-${index}`)).length, 32);

const helperStart = independentSource.indexOf('const HISTORICAL_RABBIT_MIRROR_BLOCK_RE=');
const helperEnd = independentSource.indexOf('// 1.3.91:', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'context filter/contextBundle block must exist');
const helperSource = independentSource.slice(helperStart, helperEnd);

let currentSettings = { independentContextMaxLayers: 20, independentContextExcludedTags: ['thinking', 'updatevariable', 'updatevarible'] };
const sandbox = {
    getSettings: () => currentSettings,
    normalizeIndependentContextExcludedTags: value => [...new Set((Array.isArray(value) ? value : []).map(item => String(item || '').toLowerCase()).filter(item => /^[a-z][a-z0-9._:-]{0,63}$/.test(item)))].slice(0, 32),
    safeJson: (value, max) => JSON.stringify(value ?? null).slice(0, max),
    globalWorldInfoContextView: () => ({ block: '' }),
    independentContextChatMetadata: () => ({}),
    CONTEXT_TRANSCRIPT_BUDGET: 12000,
    CONTEXT_TOTAL_BUDGET: 20000,
    GLOBAL_WORLD_INFO_CONTEXT_BUDGET: 6000,
    INDEPENDENT_VISIBLE_TEXT_CACHE_LIMIT: 12,
    globalThis: {},
};
vm.createContext(sandbox);
vm.runInContext(`${helperSource}
globalThis.__strip = stripHistoricalRabbitMirrorBlocks;
globalThis.__bundle = contextBundle;
globalThis.__reader = createIndependentVisibleTextReader;
globalThis.__stripConfigured = stripConfiguredIndependentTagBlocks;
globalThis.__discoverTags = discoverIndependentContextTagsFromMessage;
globalThis.__verifiedSourceTags = verifiedSourceTagFilteringForLiveText;`, sandbox);

const strip = sandbox.globalThis.__strip;
const bundle = sandbox.globalThis.__bundle;
const createReader = sandbox.globalThis.__reader;
const stripConfigured = sandbox.globalThis.__stripConfigured;
const discoverTags = sandbox.globalThis.__discoverTags;
const verifiedSourceTags = sandbox.globalThis.__verifiedSourceTags;

{
    const source = '正文A<toto data-x="1"><style>.x{}</style>镜子1</toto>正文B<TOTO>镜子2</TOTO>正文C';
    const result = strip(source);
    assert.equal(result.text, '正文A正文B正文C');
    assert.ok(result.filteredRabbitMirrorChars > 20);
}

{
    currentSettings = { independentContextMaxLayers: 3, independentContextExcludedTags: [] };
    const chat = Array.from({ length: 8 }, (_, i) => ({ is_user: i % 2 === 0, mes: `M${i}` }));
    const result = bundle({ chat }, 7);
    assert.equal(result.layers, 3, 'must read at most the user configured recent layers');
    assert.match(result.text, /\[5 ASSISTANT\]\nM5/);
    assert.match(result.text, /\[6 USER\]\nM6/);
    assert.match(result.text, /\[7 ASSISTANT\]\nM7/);
    assert.doesNotMatch(result.text, /\[4 USER\]/);
}

{
    currentSettings = { independentContextMaxLayers: 3, independentContextExcludedTags: [] };
    const chat = [
        { is_user: true, mes: 'M0' },
        { is_user: false, mes: 'M1' },
        { is_user: false, mes: '<toto><div>only mirror</div></toto>' },
        { is_user: true, mes: 'M3' },
        { is_user: false, mes: 'M4<toto><div>old mirror</div></toto>' },
    ];
    const result = bundle({ chat }, 4);
    assert.equal(result.layers, 3, 'a mirror-only historical message must not consume a useful context layer');
    assert.match(result.text, /\[1 ASSISTANT\]\nM1/);
    assert.match(result.text, /\[3 USER\]\nM3/);
    assert.match(result.text, /\[4 ASSISTANT\]\nM4/);
    assert.doesNotMatch(result.text, /old mirror|only mirror|<toto/i);
    assert.ok(result.filteredRabbitMirrorChars > 0);
}

{
    currentSettings = { independentContextMaxLayers: 20, independentContextExcludedTags: [] };
    const chat = Array.from({ length: 20 }, (_, i) => ({ is_user: i % 2 === 0, mes: `M${i}-` + '甲'.repeat(10000) }));
    const result = bundle({ chat }, 19);
    assert.ok(result.layers < 20, '12k transcript character ceiling must stop a large context before the layer limit');
    assert.ok(result.transcriptChars <= 12000, `transcript must remain under 12k, got ${result.transcriptChars}`);
    assert.ok(result.text.length <= 20000, `total context must remain under 20k, got ${result.text.length}`);
}


{
    currentSettings = { independentContextMaxLayers: 5, independentContextExcludedTags: [] };
    const chat = Array.from({ length: 5 }, (_, i) => ({
        is_user: i % 2 === 0,
        mes: `BODY${i}-` + '正文'.repeat(120),
        reasoning: `SECRET_REASONING_${i}_` + '推理'.repeat(12000),
        extra: { reasoning_content: `SECRET_EXTRA_${i}`, thoughts: `SECRET_THOUGHT_${i}` },
    }));
    const result = bundle({ chat }, 4);
    assert.equal(result.layers, 5);
    assert.doesNotMatch(result.text, /SECRET_REASONING|SECRET_EXTRA|SECRET_THOUGHT|可用推理内容/);
    assert.ok(result.transcriptChars < 5000, `reasoning must not inflate five visible-body layers, got ${result.transcriptChars}`);
}


{
    currentSettings = { independentContextMaxLayers: 1, independentContextExcludedTags: [] };
    const ctx = {
        chat: [{ is_user: false, mes: 'ONE_VISIBLE_LAYER' }],
        characterId: 0,
        characters: [{ name: 'A', description: 'D'.repeat(5000), personality: 'P'.repeat(4000), scenario: 'S'.repeat(3000) }],
        name1: 'U',
        powerUserSettings: { persona_description: 'PERSONA'.repeat(2000) },
        authorNote: 'AUTHOR_NOTE_SHOULD_NOT_LEAK'.repeat(500),
        extensionPrompts: { secret: 'EXTENSION_PROMPT_SHOULD_NOT_LEAK'.repeat(2000) },
        chatMetadata: { secret: 'CHAT_METADATA_SHOULD_NOT_LEAK'.repeat(2000) },
        worldInfo: { secret: 'WORLD_INFO_SHOULD_NOT_LEAK'.repeat(2000) },
    };
    const result = bundle(ctx, 0);
    assert.equal(result.layers, 1);
    assert.match(result.text, /ONE_VISIBLE_LAYER/);
    assert.doesNotMatch(result.text, /AUTHOR_NOTE_SHOULD_NOT_LEAK|EXTENSION_PROMPT_SHOULD_NOT_LEAK|CHAT_METADATA_SHOULD_NOT_LEAK|WORLD_INFO_SHOULD_NOT_LEAK/);
    assert.ok(result.text.length < 12000, `one-layer compact context should stay small, got ${result.text.length}`);
    assert.ok(result.referenceContextChars < 9000);
}

{
    currentSettings = { independentContextMaxLayers: 1, independentContextExcludedTags: [] };
    const result = bundle({ chat: [{ is_user: false, mes: 'RAW_FALLBACK', extra: { display_text: '<div>VISIBLE</div><div hidden>HIDDEN_SECRET</div><script>CODE_SECRET</script>' } }] }, 0);
    assert.match(result.text, /VISIBLE/);
    assert.doesNotMatch(result.text, /HIDDEN_SECRET|CODE_SECRET|RAW_FALLBACK/);
}

{
    currentSettings = { independentContextMaxLayers: 4, independentContextExcludedTags: ['thinking', 'updatevariable', 'updatevarible'] };
    const chat = [
        { is_user: true, extra: { display_text: 'A&lt;!--&lt;thinking&gt;COMMENT_SECRET&lt;/thinking&gt;--&gt;&lt;Thinking data-note=&quot;&gt;&quot;&gt;SECRET_A&lt;Thinking&gt;SECRET_NESTED&lt;/Thinking&gt;TAIL&lt;/Thinking&gt;B' } },
        { is_user: false, extra: { display_text: '<UPDATEVARIABLE mode="x">SECRET_B</UPDATEVARIABLE>VISIBLE_B' } },
        { is_user: true, extra: { display_text: '<UpdateVarible>SECRET_C</UpdateVarible><ordinary>VISIBLE_C</ordinary>' } },
        { is_user: false, extra: { display_text: 'VISIBLE_D&lt;thinking&gt;SECRET_UNCLOSED' } },
    ];
    const result = bundle({ chat }, 3);
    assert.match(result.text, /AB|VISIBLE_B|VISIBLE_C|VISIBLE_D/);
    assert.doesNotMatch(result.text, /COMMENT_SECRET|SECRET_A|SECRET_NESTED|TAIL|SECRET_B|SECRET_C|SECRET_UNCLOSED/);
    assert.ok(result.filteredExcludedTagChars > 0);
    assert.deepEqual([...result.filteredExcludedTags].sort(), ['thinking', 'updatevariable', 'updatevarible']);
}

{
    const selected = ['thinking'];
    assert.equal(stripConfigured('&lt;thinking&gt;ONE&lt;/thinking&gt;VISIBLE', selected).text, 'VISIBLE');
    assert.equal(stripConfigured('&amp;lt;thinking&amp;gt;TWO&amp;lt;/thinking&amp;gt;VISIBLE', selected).text, 'VISIBLE');
    assert.equal(stripConfigured('BEFORE<thinking note="unterminated>SECRET', selected).text, 'BEFORE', 'recognized malformed selected-tag prefix must fail closed');
    assert.equal(stripConfigured('&lt;ordinary&gt;KEEP&lt;/ordinary&gt;', selected).text, '&lt;ordinary&gt;KEEP&lt;/ordinary&gt;', 'unselected encoded tags must remain ordinary visible text');
}

{
    const discovered = discoverTags({
        mes: '<thinking>隐去</thinking><UpdateVariable name="x">1</UpdateVariable>\n`<fake>示例</fake>`',
        extra: { display_text: '<content>正文</content><UpdateVarible>2</UpdateVarible>\n```html\n<demo>示例</demo>\n```' },
        reasoning: '<reasoningsecret>绝不扫描</reasoningsecret>',
    }, {}, 256000);
    const names = [...discovered.counts.keys()].sort();
    assert.deepEqual(names, ['content', 'thinking', 'updatevariable', 'updatevarible']);
    assert.equal(discovered.counts.has('fake'), false, 'inline code examples must not become filter candidates');
    assert.equal(discovered.counts.has('demo'), false, 'fenced code examples must not become filter candidates');
    assert.equal(discovered.counts.has('reasoningsecret'), false, 'reasoning fields must never be scanned');
}

{
    const selected = vm.runInContext('new Set(["thinking"])', sandbox);
    const verified = verifiedSourceTags({ mes: 'A<thinking>SECRET</thinking>B' }, 'ASECRETB', selected);
    assert.equal(verified.text, 'AB', 'a stripped wrapper may be recovered only when raw and live visible projections match exactly');
    assert.deepEqual([...verified.filteredExcludedTags], ['thinking']);
    assert.equal(verifiedSourceTags({ mes: 'A<thinking>SECRET</thinking>B' }, 'DIFFERENT', selected), null, 'source markup must not replace a mismatched live正文');
}

{
    currentSettings = { independentContextMaxLayers: 1, independentContextExcludedTags: ['analysis'] };
    const result = bundle({ chat: [{ is_user: false, mes: '<analysis private="yes">DROP</analysis><thinking>KEEP</thinking>VISIBLE' }] }, 0);
    assert.doesNotMatch(result.text, /DROP/);
    assert.match(result.text, /KEEP/);
}

{
    currentSettings = { independentContextMaxLayers: 2, independentContextExcludedTags: [] };
    const history = { is_user: true, mes: 'HISTORY_A' };
    const target = { is_user: false, mes: 'TARGET_A' };
    const reader = createReader(1, currentSettings);
    assert.equal(reader(history, 0).text, 'HISTORY_A');
    history.mes = 'HISTORY_B';
    assert.equal(reader(history, 0).text, 'HISTORY_A', 'history may use the request-local cache');
    assert.equal(reader(target, 1).text, 'TARGET_A');
    target.mes = 'TARGET_B';
    assert.equal(reader(target, 1).text, 'TARGET_B', 'target正文 must bypass the request-local cache');
}

assert.doesNotMatch(independentSource, /message\?\.reasoning\s*\?\?|m\?\.reasoning\s*\?\?|reasoning_content\s*\?\?|extra\?\.thoughts\s*\?\?/, 'independent runtime must not read reasoning/thought fields');
assert.match(independentSource, /MAX_INDEPENDENT_REQUEST_CHARS = 32000/);
assert.match(independentSource, /const directiveStart=Math\.max\(0,index-3\)/);
assert.match(independentSource, /mes:directiveStart\+offset===index\?targetVisibleAtStart\.text:readVisible\(message,directiveStart\+offset\)\.text/);
assert.match(independentSource, /const targetVisibleAtStart=readVisible\(msg,index\);[\s\S]{0,220}本次未发送副 API 请求/, 'target正文 must be freshly checked before prompt selection and network dispatch');
assert.match(independentSource, /if\(live\.available\)[\s\S]{0,2200}source:'live-dom'/, 'browser context must prefer the rendered DOM');
assert.match(independentSource, /normalizedIndependentVisibleComparison\(unfiltered\.text\)!==expected/, 'source tag boundaries may be used only after exact live-visible equivalence');
assert.match(independentSource, /discoverIndependentContextTagsFromMessage\(chat\[messageIndex\]/, 'tag scan must map each mounted current-chat body back to its current message正文 source');
assert.match(independentSource, /if\(typeof document!=='undefined'\) return \{text:'',filteredRabbitMirrorChars:0,filteredExcludedTagChars:0,filteredExcludedTags:\[\],source:'not-rendered'\}/, 'non-rendered browser history must fail closed');
assert.match(independentSource, /DETAILS' && !node\.open/, 'closed details bodies must not enter independent context');
assert.match(independentSource, /\.displayNone, \.display-none, \.hidden, \.invisible/, 'common host hidden classes must be excluded');

assert.match(settingsSource, /independentContextMaxLayers:\s*20/);
assert.match(settingsSource, /independentContextExcludedTags:\s*\[\.\.\.DEFAULT_INDEPENDENT_CONTEXT_EXCLUDED_TAGS\]/);
assert.match(settingsSource, /INDEPENDENT_CONTEXT_EXCLUDED_TAG_MAX_COUNT\s*=\s*32/);
assert.match(settingsSource, /memoryScanEnabled:\s*false/);
assert.match(settingsSource, /memoryProviderIds:\s*\[\]/);
assert.match(settingsSource, /memoryMaxChars:\s*2200/);
assert.match(settingsSource, /Math\.max\(1,\s*Math\.min\(200,/);
assert.match(uiSource, /id="rh_independent_context_layers"/);
assert.match(uiSource, /id="rh_independent_tag_filter_modal"/);
assert.match(uiSource, /扫描与管理正文标签/);
assert.match(uiSource, /id="rh_independent_api_section"/);
assert.match(uiSource, /独立 API 生成方式/);
assert.match(uiSource, /自动读取最近 X 层/);
assert.match(uiSource, /检索与过滤 &lt;&gt; 正文标签/);
assert.match(uiSource, /id="rh_independent_tag_filter_scan"/);
assert.match(uiSource, /扫描当前聊天已加载的正文源与可见正文/);
assert.match(uiSource, /\$\('#rh_independent_api_fields'\)\.show\(\)/, 'independent settings must remain visible and preconfigurable in follow mode');
assert.doesNotMatch(uiSource, /\$\('#rh_independent_api_fields'\)\.toggle\(independent\)/, 'generation source must no longer hide the independent settings section');
const scanHandlerStart = uiSource.indexOf("$('#rh_independent_tag_filter_scan').on('click'");
const scanHandlerEnd = uiSource.indexOf("$('#rh_independent_tag_filter_save').on('click'", scanHandlerStart);
assert.ok(scanHandlerStart >= 0 && scanHandlerEnd > scanHandlerStart, 'tag scan and explicit save handlers must both exist');
assert.doesNotMatch(uiSource.slice(scanHandlerStart, scanHandlerEnd), /updateSettings\(/, 'scanning must not auto-select or persist any tag');
assert.match(uiSource, /不接受正则/);
assert.match(uiSource, /先过滤历史兔子镜/);
assert.match(uiSource, /不读取模型 reasoning \/ reasoning_content \/ thoughts/);
assert.match(uiSource, /12,000 字符聊天正文、20,000 字符上下文和 32,000 字符完整请求上限保护/);
assert.match(tokenSource, /independentContextLayers/);
assert.match(tokenSource, /filteredRabbitMirrorChars/);
assert.match(tokenSource, /filteredContextTagChars/);

console.log('independentContextWindow: 可选层数保留；作者注释/推理/扩展提示/聊天元数据不进入独立 API；记忆插件设置保留');
