
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
const styleSource = readFileSync(resolve(ROOT, 'style.css'), 'utf8');

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
    isRabbitMirrorEligibleAssistantMessage: message => !!message
        && message.is_user !== true
        && message.is_system !== true
        && message?.extra?.isSmallSys !== true
        && !Object.prototype.hasOwnProperty.call(message?.extra || {}, 'tool_invocations')
        && typeof message.mes === 'string',
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
globalThis.__discoverText = discoverIndependentContextTagNamesInText;
globalThis.__discoverTags = discoverIndependentContextTagsFromMessage;
globalThis.__verifiedSourceTags = verifiedSourceTagFilteringForLiveText;`, sandbox);

const strip = sandbox.globalThis.__strip;
const bundle = sandbox.globalThis.__bundle;
const createReader = sandbox.globalThis.__reader;
const stripConfigured = sandbox.globalThis.__stripConfigured;
const discoverText = sandbox.globalThis.__discoverText;
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
    currentSettings = { independentContextMaxLayers: 4, independentContextExcludedTags: [] };
    const chat = [
        { is_user: true, mes: 'USER' },
        { is_user: false, mes: 'PRE_TOOL_ASSISTANT' },
        { is_user: false, is_system: true, mes: 'TOOL_RESULT_SECRET', extra: { isSmallSys: true, tool_invocations: [{}] } },
        { is_user: false, mes: 'FINAL_ASSISTANT' },
    ];
    const result = bundle({ chat }, 3);
    assert.match(result.text, /USER|PRE_TOOL_ASSISTANT|FINAL_ASSISTANT/);
    assert.doesNotMatch(result.text, /TOOL_RESULT_SECRET/, 'tool-result system rows must never become assistant正文 context or a target');
    assert.equal(result.layers, 3);
}

{
    currentSettings = { independentContextMaxLayers: 3, independentContextExcludedTags: [] };
    const chat = Array.from({ length: 10000 }, (_, i) => ({ is_user: i % 2 === 0, mes: `M${i}` }));
    const calls = [];
    const reader = (message, index) => {
        calls.push(index);
        return { text: message.mes, filteredRabbitMirrorChars: 0, filteredExcludedTagChars: 0, filteredExcludedTags: [] };
    };
    reader.renderedIndexes = [9999, 9997, 9995, 42];
    const result = bundle({ chat }, 9999, null, null, 20000, reader);
    assert.deepEqual(calls, [9999, 9997, 9995], 'long-chat context must visit only recent loaded message indexes needed for X visible layers');
    assert.equal(result.layers, 3);
    assert.doesNotMatch(result.text, /\[42 USER\]/);
}

{
    const chatRoot = { querySelectorAll: selector => {
        assert.equal(selector, '.mes[mesid]');
        return owners;
    } };
    const makeOwner = (mesid, parentElement = chatRoot) => ({
        parentElement,
        getAttribute: name => name === 'mesid' ? String(mesid) : null,
    });
    const wrapper = { closest: () => null };
    const nestedInsideMessage = { closest: () => ({ getAttribute: () => 'outer-message' }) };
    const owners = [makeOwner(9999), makeOwner(9997), makeOwner(9997), makeOwner(10001), makeOwner(3, wrapper), makeOwner(5, nestedInsideMessage)];
    sandbox.document = { querySelector: selector => selector === '#chat' ? chatRoot : null };
    const indexed = createReader(9999, currentSettings);
    assert.deepEqual([...indexed.renderedIndexes], [9999, 9997, 3], 'actual DOM index construction accepts wrapped top-level rows but rejects nested message clones');

    sandbox.document = { querySelector: () => { throw new Error('host DOM unavailable'); } };
    const fallback = createReader(7, currentSettings);
    assert.equal(fallback.renderedIndexes, undefined, 'DOM index failure must retain the legacy bounded fallback walk');
    delete sandbox.document;
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
    assert.match(result.text, /【当前角色卡摘要】/);
    assert.match(result.text, /【当前 Persona 摘要】/);
    assert.doesNotMatch(result.text, /AUTHOR_NOTE_SHOULD_NOT_LEAK|EXTENSION_PROMPT_SHOULD_NOT_LEAK|CHAT_METADATA_SHOULD_NOT_LEAK|WORLD_INFO_SHOULD_NOT_LEAK/);
    assert.ok(result.text.length < 12000, `one-layer compact context should stay small, got ${result.text.length}`);
    assert.ok(result.referenceContextChars < 9000);
}

{
    currentSettings = {
        independentContextMaxLayers: 1,
        independentContextExcludedTags: [],
        independentReadCharacterCardSummary: false,
        independentReadPersonaSummary: false,
    };
    const ctx = {
        chat: [{ is_user: false, mes: 'VISIBLE_WITHOUT_REFERENCES' }],
        characterId: 0,
        characters: [{ name: 'CHARACTER_NAME', description: 'CHARACTER_DESCRIPTION' }],
        name1: 'PERSONA_NAME',
        powerUserSettings: { persona_description: 'PERSONA_DESCRIPTION' },
    };
    const result = bundle(ctx, 0);
    assert.match(result.text, /VISIBLE_WITHOUT_REFERENCES/);
    assert.doesNotMatch(result.text, /CHARACTER_NAME|CHARACTER_DESCRIPTION|PERSONA_NAME|PERSONA_DESCRIPTION/);
    assert.equal(result.referenceContextChars, 0, 'disabling both optional summaries must keep visible chat while removing references');
}

for (const optionCase of [
    { character: false, persona: true, absent: /CHARACTER_ONLY_SECRET/, present: /PERSONA_ONLY_SECRET/ },
    { character: true, persona: false, absent: /PERSONA_ONLY_SECRET/, present: /CHARACTER_ONLY_SECRET/ },
]) {
    currentSettings = {
        independentContextMaxLayers: 1,
        independentContextExcludedTags: [],
        independentReadCharacterCardSummary: optionCase.character,
        independentReadPersonaSummary: optionCase.persona,
    };
    const result = bundle({
        chat: [{ is_user: false, mes: 'VISIBLE_OPTION_MATRIX' }],
        characterId: 0,
        characters: [{ name: 'CHARACTER_ONLY_SECRET' }],
        name1: 'PERSONA_ONLY_SECRET',
    }, 0);
    assert.match(result.text, /VISIBLE_OPTION_MATRIX/);
    assert.match(result.text, optionCase.present);
    assert.doesNotMatch(result.text, optionCase.absent);
}

{
    const chat = Array.from({ length: 18 }, (_, index) => ({
        is_user: index % 2 === 0,
        mes: `LAYER_${index}_` + '正文'.repeat(700),
    }));
    const ctx = {
        chat,
        characterId: 0,
        characters: [{ name: 'A', description: 'D'.repeat(5000), personality: 'P'.repeat(4000), scenario: 'S'.repeat(3000) }],
        name1: 'U',
        powerUserSettings: { persona_description: 'PERSONA'.repeat(2000) },
    };
    currentSettings = { independentContextMaxLayers: 18, independentContextExcludedTags: [] };
    const preparedWorldInfo = { block: `\n\n【本轮已激活世界书】\n${'W'.repeat(5800)}` };
    const enabled = bundle(ctx, chat.length - 1, null, preparedWorldInfo);
    currentSettings = {
        independentContextMaxLayers: 18,
        independentContextExcludedTags: [],
        independentReadCharacterCardSummary: false,
        independentReadPersonaSummary: false,
    };
    const disabled = bundle(ctx, chat.length - 1, null, preparedWorldInfo);
    assert.ok(disabled.transcriptChars > enabled.transcriptChars, 'when the 20k context budget is shared with world info, disabling optional summaries should release budget to more recent visible chat正文');
    assert.ok(disabled.transcriptChars <= 12000 && disabled.text.length <= 20000);
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
        { is_user: false, mes: 'RAW_B', extra: { display_text: '<UPDATEVARIABLE mode="x">SECRET_B</UPDATEVARIABLE>VISIBLE_B' } },
        { is_user: true, extra: { display_text: '<UpdateVarible>SECRET_C</UpdateVarible><ordinary>VISIBLE_C</ordinary>' } },
        { is_user: false, mes: 'RAW_D', extra: { display_text: 'VISIBLE_D&lt;thinking&gt;SECRET_UNCLOSED' } },
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
    const state = {};
    const counts = discoverText('<Thinking data-x="1">A</Thinking>&lt;UpdateVariable&gt;B&lt;/UpdateVariable&gt;&amp;lt;UpdateVarible&amp;gt;C&amp;lt;/UpdateVarible&amp;gt;<analysis/><ANALYSIS>X</ANALYSIS>', new Map(), state);
    assert.deepEqual([...counts.entries()], [
        ['thinking', 1],
        ['updatevariable', 1],
        ['updatevarible', 1],
        ['analysis', 2],
    ], 'scan parser must count real, escaped and double-escaped custom opening tags case-insensitively');
}

{
    const counts = discoverText('<div><span>LAYOUT</span></div><details><summary>X</summary></details><toto><private-tag>OLD_MIRROR</private-tag></toto><script><secret-tag>CODE</secret-tag></script><!-- <comment-tag> -->');
    assert.deepEqual([...counts.entries()], [], 'ordinary layout, reserved RabbitMirror, executable subtrees and comments must not become scan candidates');
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
assert.match(independentSource, /filter\(\(\{message\}\)=>message\?\.is_user===true \|\| isRabbitMirrorEligibleAssistantMessage\(message\)\)[\s\S]{0,240}mes:realIndex===index\?targetVisibleAtStart\.text:readVisible\(message,realIndex\)\.text/, 'directive sampling must preserve exact indexes while excluding tool-result system rows');
assert.match(independentSource, /const targetVisibleAtStart=readVisible\(msg,index\);[\s\S]{0,220}本次未发送副 API 请求/, 'target正文 must be freshly checked before prompt selection and network dispatch');
assert.match(independentSource, /const independentUserLead='请根据以下当前聊天可见正文、紧凑角色卡、Persona 与本轮已激活世界书生成兔子镜：';/, 'independent user lead must retain the protected baseline wording');
assert.match(independentSource, /if\(live\.available\)[\s\S]{0,2200}source:'live-dom'/, 'browser context must prefer the rendered DOM');
assert.match(independentSource, /normalizedIndependentVisibleComparison\(unfiltered\.text\)!==expected/, 'source tag boundaries may be used only after exact live-visible equivalence');
assert.match(independentSource, /discoverIndependentContextTagsFromMessage\(chat\[messageIndex\]/, 'tag scan must map each mounted current-chat body back to its current message正文 source');
assert.match(independentSource, /if\(typeof document!=='undefined'\) return \{text:'',filteredRabbitMirrorChars:0,filteredExcludedTagChars:0,filteredExcludedTags:\[\],source:'not-rendered'\}/, 'non-rendered browser history must fail closed');
assert.match(independentSource, /DETAILS' && !node\.open/, 'closed details bodies must not enter independent context');
assert.match(independentSource, /\.displayNone, \.display-none, \.hidden, \.invisible/, 'common host hidden classes must be excluded');
const tagScanStart = independentSource.indexOf('async function scanCurrentChatIndependentContextTags');
const tagScanEnd = independentSource.indexOf('function stripInvisibleIndependentContextMarkup', tagScanStart);
assert.ok(tagScanStart >= 0 && tagScanEnd > tagScanStart, 'bounded current-chat tag scanner must exist');
const tagScanSource = independentSource.slice(tagScanStart, tagScanEnd);
assert.match(tagScanSource, /querySelectorAll\('\.mes\[mesid\] \.mes_text'\)/, 'scanner must stay inside rendered message bodies');
assert.match(tagScanSource, /owner\.parentElement===chatRoot && owner\.querySelector\?\.\('\.mes_text'\)===body/, 'scanner must accept only the primary body of direct current-chat messages');
assert.match(tagScanSource, /INDEPENDENT_TAG_SCAN_MAX_MESSAGES/);
assert.match(tagScanSource, /INDEPENDENT_TAG_SCAN_MAX_NODES/);
assert.match(tagScanSource, /INDEPENDENT_TAG_SCAN_MAX_TEXT_CHARS/);
assert.match(independentSource, /INDEPENDENT_TAG_SCAN_SKIP_CODE_SUBTREES=new Set\(\['code','pre','textarea','kbd','samp'\]\)/, 'code examples must not become scan candidates');
assert.match(tagScanSource, /await maybeYield/, 'large scans must yield between bounded slices');
assert.match(tagScanSource, /signal\?\.aborted/);
assert.doesNotMatch(tagScanSource, /reasoning_content|\.reasoning\b|\.thoughts\b/, 'scanner may map mounted bodies to chat records but must never read reasoning fields');
assert.doesNotMatch(tagScanSource, /innerHTML|insertAdjacentHTML|querySelector\(`[^`]*\$\{(?:tag|name)/, 'discovered names must not enter HTML or dynamic selectors');

assert.match(settingsSource, /independentContextMaxLayers:\s*20/);
assert.match(settingsSource, /independentContextExcludedTags:\s*\[\.\.\.DEFAULT_INDEPENDENT_CONTEXT_EXCLUDED_TAGS\]/);
assert.match(settingsSource, /independentReadCharacterCardSummary:\s*true/);
assert.match(settingsSource, /independentReadPersonaSummary:\s*true/);
assert.match(settingsSource, /independentReadCharacterCardSummary\s*=\s*settings\.independentReadCharacterCardSummary\s*!==\s*false/);
assert.match(settingsSource, /independentReadPersonaSummary\s*=\s*settings\.independentReadPersonaSummary\s*!==\s*false/);
assert.match(settingsSource, /INDEPENDENT_CONTEXT_EXCLUDED_TAG_MAX_COUNT\s*=\s*32/);
assert.match(settingsSource, /memoryScanEnabled:\s*false/);
assert.match(settingsSource, /memoryProviderIds:\s*\[\]/);
assert.match(settingsSource, /memoryMaxChars:\s*2200/);
assert.match(settingsSource, /Math\.max\(1,\s*Math\.min\(200,/);
assert.match(uiSource, /id="rh_independent_context_layers"/);
assert.match(uiSource, /id="rh_independent_include_character_summary"/);
assert.match(uiSource, /id="rh_independent_include_persona_summary"/);
assert.match(uiSource, /checked\('#rh_independent_include_character_summary',\s*settings\.independentReadCharacterCardSummary\s*!==\s*false\)/);
assert.match(uiSource, /checked\('#rh_independent_include_persona_summary',\s*settings\.independentReadPersonaSummary\s*!==\s*false\)/);
assert.match(uiSource, /\$\('#rh_independent_include_character_summary'\)\.on\('change',[\s\S]{0,180}independentReadCharacterCardSummary/);
assert.match(uiSource, /\$\('#rh_independent_include_persona_summary'\)\.on\('change',[\s\S]{0,180}independentReadPersonaSummary/);
assert.match(uiSource, /id="rh_independent_tag_filter_modal"/);
assert.match(uiSource, /扫描与管理正文标签/);
assert.match(uiSource, /id="rh_independent_api_section"/);
assert.match(uiSource, /id="rh_independent_advanced_open"/);
assert.match(uiSource, /data-page="worldinfo"[^>]*>[\s\S]{0,220}🔌 独立 API/);
assert.match(uiSource, /id="rh_advanced_page_worldinfo"[^>]*data-title="独立 API"/);
assert.match(uiSource, /独立 API 生成方式/);
assert.match(uiSource, /读取范围/);
assert.match(uiSource, /正文标签过滤/);
assert.match(uiSource, /id="rh_independent_tag_filter_scan"/);
assert.match(uiSource, /扫描当前聊天已加载的正文源与可见正文/);
const advancedLauncherMatches = uiSource.match(/id="rh_advanced_open"/g) || [];
assert.equal(advancedLauncherMatches.length, 1, 'CleanUI must move, not duplicate, the global advanced launcher');
assert.match(uiSource, /class="rabbit-mirror-primary-row"[\s\S]{0,900}id="rh_advanced_open"[^>]*aria-controls="rh_advanced_modal"/, 'the same advanced launcher must remain visible beside the primary toggle');
assert.match(uiSource, /<details id="rh_token_meter" class="rabbit-mirror-token-meter"[^>]*>[\s\S]{0,260}<summary class="rabbit-mirror-token-meter-head">/, 'Token details must retain a compact always-visible summary');
assert.ok(uiSource.indexOf('id="rh_advanced_open"') < uiSource.indexOf('id="rh_token_meter"'), 'advanced launcher must sit in the primary row above Token');
assert.ok(uiSource.indexOf('id="rh_token_meter"') < uiSource.indexOf('<span>生成方式<\/span>'), 'Token meter must sit below auto injection and above generation mode');
assert.match(uiSource, /<details class="rabbit-mirror-section">\s*<summary><span>生成方式<\/span>/, 'generation details must start collapsed to keep the main panel compact');
assert.match(uiSource, /<details class="rabbit-mirror-section" id="rh_independent_api_section">/, 'independent API details must start collapsed but remain directly available');
assert.match(uiSource, /class="rabbit-mirror-independent-advanced-row"[\s\S]{0,500}id="rh_independent_advanced_open"/, 'independent context/privacy shortcut must remain available');
assert.match(styleSource, /rabbit-mirror-token-meter\[open\][\s\S]{0,320}transform:\s*rotate\(90deg\)/);
assert.match(styleSource, /button\.menu_button\.rabbit-mirror-advanced-launch/);
assert.doesNotMatch(styleSource, /#f7f1e7|#cdbda8/, 'Token meter must inherit the active SillyTavern theme instead of forcing the old beige card');
const independentMainStart = uiSource.indexOf('id="rh_independent_api_section"');
const advancedModalStart = uiSource.indexOf('id="rh_advanced_modal"', independentMainStart);
assert.ok(independentMainStart >= 0 && advancedModalStart > independentMainStart);
const independentMain = uiSource.slice(independentMainStart, advancedModalStart);
assert.doesNotMatch(independentMain, /id="rh_independent_context_layers"|id="rh_independent_tag_filter_open"/, 'context range and tag filtering belong in independent advanced settings');
assert.match(uiSource, /\$\('#rh_independent_api_fields'\)\.show\(\)/, 'independent settings must remain visible and preconfigurable in follow mode');
assert.doesNotMatch(uiSource, /\$\('#rh_independent_api_fields'\)\.toggle\(independent\)/, 'generation source must no longer hide the independent settings section');
const scanHandlerStart = uiSource.indexOf("$('#rh_independent_tag_filter_scan').on('click'");
const scanHandlerEnd = uiSource.indexOf("$('#rh_independent_tag_filter_save').on('click'", scanHandlerStart);
assert.ok(scanHandlerStart >= 0 && scanHandlerEnd > scanHandlerStart, 'tag scan and explicit save handlers must both exist');
assert.doesNotMatch(uiSource.slice(scanHandlerStart, scanHandlerEnd), /updateSettings\(/, 'scanning must not auto-select or persist any tag');
assert.match(uiSource.slice(scanHandlerEnd, scanHandlerEnd + 320), /normalizeIndependentContextExcludedTags/, 'explicit save must revalidate selected tag names');
const completenessStart = uiSource.indexOf('const currentPanels = existing.filter');
const completenessEnd = uiSource.indexOf('if (existing.length === 1', completenessStart);
const completeness = uiSource.slice(completenessStart, completenessEnd);
for (const id of [
    'rh_advanced_open',
    'rh_independent_advanced_open',
    'rh_independent_context_layers',
    'rh_independent_include_character_summary',
    'rh_independent_include_persona_summary',
    'rh_independent_tag_filter_open',
    'rh_independent_tag_filter_scan',
    'rh_independent_tag_filter_save',
]) assert.match(completeness, new RegExp(`#${id}\\b`), `same-version DOM completeness must require #${id}`);
assert.match(completeness, /rabbit-mirror-primary-row/, 'same-version DOM completeness must require the CleanUI primary row');
assert.match(completeness, /#rh_token_meter > summary/, 'same-version DOM completeness must require the compact Token summary');
assert.match(uiSource, /不接受正则/);
assert.match(uiSource, /副 API 只读取你允许的可见内容/);
assert.match(uiSource, /历史兔子镜、隐藏推理和你勾选过滤的标签不会发送/);
assert.match(uiSource, /聊天正文 12,000 \/ 上下文 20,000 \/ 完整请求 32,000 字符/);
assert.match(tokenSource, /independentContextLayers/);
assert.match(tokenSource, /filteredRabbitMirrorChars/);
assert.match(tokenSource, /filteredContextTagChars/);

console.log('independentContextWindow: 可选层数保留；作者注释/推理/扩展提示/聊天元数据不进入独立 API；记忆插件设置保留');
