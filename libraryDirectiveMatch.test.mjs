import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
};

const { defaultSettings } = await import('../src/settings.js');
const { pickCombination } = await import('../src/picker.js');

const formatCases = [
    ['走近科学', '4.3.11'],
    ['按钮游戏', '6.5.8'],
    ['莲蓬鬼话', '7.2.1.1'],
    ['豆瓣', '1.1.1.4'],
    ['视觉小说', '6.2.1'],
    ['Visual Novel', '6.2.1'],
    ['百度贴吧', '7.2.1.2'],
    ['匿名提问箱', '7.2.3'],
    ['十二星座决定你的 XX', '1.3.3.1.1'],
    ['窥探式翻找', '2.4.2'],
    ['脑内 BGM', '5.2.2.1'],
    ['绘画展陈', '5.1.1.6'],
    ['伪史论', '3.5'],
    ['图鉴', '3.6'],
    ['七彩XX', '10.2.8'],
    ['春夏秋冬', '10.2.9'],
    ['颜文字简笔画', '2.1.7.1'],
    ['X黄推', '1.1.1.5'],
    ['P站等成人视频网站', '1.3.3.1.2'],
];

const themeCases = [
    ['活在过去也有错吗', 'B.7.4'],
    ['一场被精心制造出来的梦', 'E.8'],
    ['哀伤研究', 'B.7.5'],
    ['三根火柴回到过去', 'G.7.19'],
    ['当前世界观节日', 'C.2.2'],
    ['许愿柳', 'C.1.6'],
];

function settingsFor(kind) {
    return {
        ...structuredClone(defaultSettings),
        samplingMode: kind === 'format' ? 'format_only' : 'classic',
        userDirectivePriority: true,
        avoidRepeat: false,
        themesMin: 1,
        themesMax: 1,
        formatsMin: 1,
        formatsMax: 1,
    };
}

let sequence = 0;
for (const [query, expectedId] of formatCases) {
    sequence += 1;
    const result = pickCombination(
        settingsFor('format'),
        `library-directive:format:${sequence}`,
        { chat: [{ is_user: true, is_system: false, mesid: sequence, mes: `兔子镜展现形式：${query}` }] },
    );
    assert.equal(result.directive?.customFormats?.length, 0, `${query} must not fall back to a custom format`);
    assert.deepEqual(result.combo.formatIds, [expectedId], `${query} must resolve to ${expectedId}`);
}

for (const [query, expectedId] of themeCases) {
    sequence += 1;
    const result = pickCombination(
        settingsFor('theme'),
        `library-directive:theme:${sequence}`,
        { chat: [{ is_user: true, is_system: false, mesid: sequence, mes: `兔子镜主题：${query}` }] },
    );
    assert.equal(result.directive?.customThemes?.length, 0, `${query} must not fall back to a custom theme`);
    assert.deepEqual(result.combo.themeIds, [expectedId], `${query} must resolve to ${expectedId}`);
}

sequence += 1;
const aliasDedup = pickCombination(
    settingsFor('format'),
    `library-directive:alias-dedup:${sequence}`,
    { chat: [{ is_user: true, is_system: false, mesid: sequence, mes: '兔子镜展现形式：视觉小说 + Visual Novel' }] },
);
assert.deepEqual(aliasDedup.combo.formatIds, ['6.2.1'], 'two aliases of the existing visual-novel item must collapse to one canonical random candidate');

delete globalThis.localStorage;
console.log(`libraryDirectiveMatch: ${formatCases.length} format names/aliases and ${themeCases.length} theme names passed through public picker`);
