
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

const helperStart = independentSource.indexOf('const HISTORICAL_RABBIT_MIRROR_BLOCK_RE=');
const helperEnd = independentSource.indexOf('// 1.3.91:', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'context filter/contextBundle block must exist');
const helperSource = independentSource.slice(helperStart, helperEnd);

let currentSettings = { independentContextMaxLayers: 20 };
const sandbox = {
    getSettings: () => currentSettings,
    safeJson: (value, max) => JSON.stringify(value ?? null).slice(0, max),
    globalWorldInfoContextView: () => ({ block: '' }),
    independentContextChatMetadata: () => ({}),
    reasoningOf: m => String(m?.reasoning || ''),
    CONTEXT_TRANSCRIPT_BUDGET: 52000,
    CONTEXT_TOTAL_BUDGET: 76000,
    globalThis: {},
};
vm.createContext(sandbox);
vm.runInContext(`${helperSource}
globalThis.__strip = stripHistoricalRabbitMirrorBlocks;
globalThis.__bundle = contextBundle;`, sandbox);

const strip = sandbox.globalThis.__strip;
const bundle = sandbox.globalThis.__bundle;

{
    const source = '正文A<toto data-x="1"><style>.x{}</style>镜子1</toto>正文B<TOTO>镜子2</TOTO>正文C';
    const result = strip(source);
    assert.equal(result.text, '正文A正文B正文C');
    assert.ok(result.filteredRabbitMirrorChars > 20);
}

{
    currentSettings = { independentContextMaxLayers: 3 };
    const chat = Array.from({ length: 8 }, (_, i) => ({ is_user: i % 2 === 0, mes: `M${i}` }));
    const result = bundle({ chat }, 7);
    assert.equal(result.layers, 3, 'must read at most the user configured recent layers');
    assert.match(result.text, /\[5 ASSISTANT\]\nM5/);
    assert.match(result.text, /\[6 USER\]\nM6/);
    assert.match(result.text, /\[7 ASSISTANT\]\nM7/);
    assert.doesNotMatch(result.text, /\[4 USER\]/);
}

{
    currentSettings = { independentContextMaxLayers: 3 };
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
    currentSettings = { independentContextMaxLayers: 20 };
    const chat = Array.from({ length: 20 }, (_, i) => ({ is_user: i % 2 === 0, mes: `M${i}-` + '甲'.repeat(10000) }));
    const result = bundle({ chat }, 19);
    assert.ok(result.layers < 20, '52k transcript character ceiling must still stop a large context before the layer limit');
    assert.ok(result.transcriptChars <= 52000, `transcript must remain under 52k, got ${result.transcriptChars}`);
    assert.ok(result.text.length <= 76000, `total context must remain under 76k, got ${result.text.length}`);
}


{
    currentSettings = { independentContextMaxLayers: 5 };
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

assert.match(settingsSource, /independentContextMaxLayers:\s*20/);
assert.match(settingsSource, /Math\.max\(1,\s*Math\.min\(200,/);
assert.match(uiSource, /id="rh_independent_context_layers"/);
assert.match(uiSource, /先过滤历史兔子镜/);
assert.match(uiSource, /不读取模型 reasoning \/ reasoning_content \/ thoughts/);
assert.match(uiSource, /52,000 字符聊天与 76,000 字符总上下文上限保护/);
assert.match(tokenSource, /independentContextLayers/);
assert.match(tokenSource, /filteredRabbitMirrorChars/);

console.log('independentContextWindow: 历史兔子镜过滤、可选读取层数、52k/76k字符兜底全部通过');
