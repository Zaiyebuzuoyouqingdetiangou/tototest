import assert from 'node:assert/strict';

import { RAW_PRESENTATION_FORMATS } from '../data/raw/rawPresentationFormats.js';
import { RAW_THEMATIC_CATEGORIES } from '../data/raw/rawThematicCategories.js';
import { resolveRawForItem } from '../data/raw/rawSegmentLookup.js';
import { PRESENTATION_FORMATS } from '../data/structured/presentationIndex.js';
import { THEMATIC_CATEGORIES } from '../data/structured/thematicIndex.js';

const expected = [
    { kind: 'presentation', id: '4.3.11', group: '4', title: '走近科学式调查节目', tags: ['independent', 'media', 'mystery'], phrases: ['三条证据', '两种假设', '一次揭晓'] },
    { kind: 'presentation', id: '6.5.8', group: '6', title: '按钮游戏', tags: ['independent', 'game', 'interactive', 'choice'], phrases: ['可保持状态', '三阶段递进或互斥分支'] },
    { kind: 'presentation', id: '7.2.1.1', group: '7', title: '古早的天涯论坛 / 莲蓬鬼话体', tags: ['independent', 'forum', 'retro'], phrases: ['楼层时间跨度', '不得只套现代评论区'] },
    { kind: 'presentation', id: '1.1.1.4', group: '1', title: '豆瓣', tags: ['independent', 'digital', 'social', 'review'], phrases: ['广播', '小组帖子', '书影音'] },
    { kind: 'presentation', id: '7.2.1.2', group: '7', title: '百度贴吧', tags: ['independent', 'forum', 'digital'], phrases: ['楼中楼', '只看楼主'] },
    { kind: 'presentation', id: '7.2.3', group: '7', title: '匿名提问箱', tags: ['independent', 'forum', 'qa', 'anonymous'], phrases: ['不得凭空揭露匿名者身份', '不得变成普通问卷'] },
    { kind: 'presentation', id: '1.3.3.1.1', group: '1', title: 'XX 来临，十二星座决定你的 XX', tags: ['independent', 'digital', 'video', 'meme'], phrases: ['十二星座', '不得只替换星座名'] },
    { kind: 'presentation', id: '2.4.2', group: '2', title: '翻各种物品 / 窥探式翻找', tags: ['independent', 'physical', 'object', 'interactive'], phrases: ['一项误导物', '一项改变理解的关键物'] },
    { kind: 'presentation', id: '5.2.2.1', group: '5', title: '脑内 BGM', tags: ['independent', 'music', 'inner-voice'], phrases: ['只有其本人能听见', '不得伪装成真实音频播放器'] },
    { kind: 'presentation', id: '5.1.1.6', group: '5', title: '各类画作 / 绘画展陈', tags: ['independent', 'visual', 'art', 'painting'], phrases: ['构图', '笔触与材质', '不得声称实际生成'] },
    { kind: 'presentation', id: '3.6', group: '3', title: '图鉴 / 分类志', tags: ['independent', 'analysis', 'academic', 'catalog'], phrases: ['识别特征', '相同字段体系'] },
    { kind: 'presentation', id: '10.2.8', group: '10', title: '七彩 XX / 七彩××', tags: ['independent', 'visual', 'css', 'color'], phrases: ['七种可辨认的色彩状态', '可读对比度'] },
    { kind: 'presentation', id: '10.2.9', group: '10', title: '四季流转 / 春夏秋冬', tags: ['independent', 'visual', 'css', 'season'], phrases: ['同一地点', '不得做四张同构信息卡'] },
    { kind: 'presentation', id: '2.1.7.1', group: '2', title: '颜文字简笔画', tags: ['independent', 'visual', 'text-art', 'kaomoji'], phrases: ['HTML 转义', '不得只是散列颜文字'] },
    { kind: 'presentation', id: '1.1.1.5', group: '1', title: 'X 黄推 / 成人向推文', tags: ['independent', 'adult', 'fictional'], phrases: ['当前虚构世界', '不提供现实发布或运营指引'] },
    { kind: 'presentation', id: '1.3.3.1.2', group: '1', title: 'P站等成人视频网站', tags: ['independent', 'adult', 'fictional'], phrases: ['虚构成人视频网站观看页', '不使用现实人物'] },
    { kind: 'theme', id: 'B.7.4', group: 'B', title: '“活在过去也有错吗”', tags: ['emotion', 'memory', 'time', 'thematic'], phrases: ['留下', '向前', '不得写成空泛鸡汤'] },
    { kind: 'theme', id: 'E.8', group: 'E', title: '一场被精心制造出来的梦', tags: ['surreal', 'dream', 'mystery', 'constructed'], phrases: ['进入—相信—发现裂缝', '选择是否醒来'] },
    { kind: 'theme', id: 'B.7.5', group: 'B', title: '哀伤研究', tags: ['emotion', 'grief', 'loss', 'thematic'], phrases: ['三个不同时间点或观察维度', '不冒充医学诊断'] },
    { kind: 'theme', id: 'G.7.19', group: 'G', title: '三根火柴回到过去', tags: ['if', 'situation', 'time-travel', 'limited-resource'], phrases: ['三根不可补充的火柴', '不能把前三次后果重置'] },
    { kind: 'theme', id: 'C.2.2', group: 'C', title: '当前世界观节日', tags: ['daily', 'festival', 'canon', 'worldview'], phrases: ['当前世界观和篇章时间', '不借节日跳入 IF 线'] },
    { kind: 'theme', id: 'C.1.6', group: 'C', title: '许愿柳', tags: ['warm', 'ritual', 'wish', 'folklore'], phrases: ['愿望生效规则与代价', '不得只把许愿柳当背景装饰'] },
];

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function duplicateIds(items) {
    const seen = new Set();
    const duplicates = [];
    for (const item of items) {
        if (seen.has(item.id)) duplicates.push(item.id);
        seen.add(item.id);
    }
    return duplicates;
}

function assertOrder(items, ids) {
    const positions = ids.map(id => items.findIndex(item => item.id === id));
    assert.ok(positions.every(position => position >= 0), `missing ordered item in ${ids.join(' -> ')}`);
    for (let index = 1; index < positions.length; index += 1) {
        assert.ok(positions[index - 1] < positions[index], `expected order ${ids.join(' -> ')}`);
    }
}

assert.equal(PRESENTATION_FORMATS.length, 208, 'the expanded presentation pool must contain 208 entries');
assert.equal(THEMATIC_CATEGORIES.length, 165, 'the expanded theme pool must contain 165 entries');
assert.deepEqual(duplicateIds(PRESENTATION_FORMATS), [], 'presentation ids must remain unique');
assert.deepEqual(duplicateIds(THEMATIC_CATEGORIES), [], 'theme ids must remain unique');
assert.ok(PRESENTATION_FORMATS.length < 512 && THEMATIC_CATEGORIES.length < 512, 'both pools must remain within saved selection limits');

for (const spec of expected) {
    const items = spec.kind === 'presentation' ? PRESENTATION_FORMATS : THEMATIC_CATEGORIES;
    const mother = spec.kind === 'presentation' ? RAW_PRESENTATION_FORMATS : RAW_THEMATIC_CATEGORIES;
    const matches = items.filter(item => item.id === spec.id);
    assert.equal(matches.length, 1, `${spec.id} must occur exactly once in its random index`);
    const item = matches[0];
    assert.equal(item.group, spec.group, `${spec.id} group must match the approved taxonomy`);
    assert.equal(item.title, spec.title, `${spec.id} title must remain stable for recipes and point-order matching`);
    assert.equal(item.id.split('.')[0], item.group, `${spec.id} group must agree with its id prefix`);
    assert.ok(item.summary.trim().length > 0, `${spec.id} must have a non-empty compact-policy summary`);
    assert.ok(Array.isArray(item.tags), `${spec.id} tags must be an array`);
    for (const tag of spec.tags) assert.ok(item.tags.includes(tag), `${spec.id} must retain tag ${tag}`);
    const contractText = `${item.summary}\n${item.raw}`;
    for (const phrase of spec.phrases) assert.ok(contractText.includes(phrase), `${spec.id} must retain contract phrase: ${phrase}`);

    assert.ok(mother.includes(item.raw), `${spec.id} structured raw line must exist byte-for-byte in the mother library`);
    const marker = new RegExp(`\\*\\*\\s*${escapeRegExp(spec.id)}(?:\\s|[：:(（])`, 'g');
    assert.equal((mother.match(marker) || []).length, 1, `${spec.id} must have exactly one mother-library marker`);
    const resolved = resolveRawForItem(item, spec.kind === 'presentation' ? 'presentation' : 'theme');
    assert.ok(resolved.includes(spec.id) && resolved.includes(spec.title), `${spec.id} raw lookup must resolve its own segment`);
}

const visualNovel = PRESENTATION_FORMATS.filter(item => item.id === '6.2.1');
assert.equal(visualNovel.length, 1, 'visual novel must reuse the existing 6.2.1 candidate, not add a duplicate child');
assert.deepEqual(visualNovel[0].aliases, ['视觉小说', 'Visual Novel'], 'visual novel aliases must remain non-random lookup metadata');
assert.equal(PRESENTATION_FORMATS.filter(item => item.id === '3.5').length, 1, 'pseudo-history must reuse existing 3.5 exactly once');
assert.equal(PRESENTATION_FORMATS.filter(item => item.title.includes('伪史论')).length, 1, 'pseudo-history must not gain a synonym duplicate in the random pool');

assertOrder(PRESENTATION_FORMATS, ['10.2.7', '10.2.8', '10.2.9', '1.1']);
assertOrder(PRESENTATION_FORMATS, ['1.1.1.3', '1.1.1.4', '1.1.1.5', '1.1.2']);
assertOrder(PRESENTATION_FORMATS, ['1.3.3.1', '1.3.3.1.1', '1.3.3.1.2', '1.3.3.2']);
assertOrder(PRESENTATION_FORMATS, ['2.1.7', '2.1.7.1', '2.1.8']);
assertOrder(PRESENTATION_FORMATS, ['2.4.1', '2.4.2', '2.5']);
assertOrder(PRESENTATION_FORMATS, ['3.5', '3.6', '4.1']);
assertOrder(PRESENTATION_FORMATS, ['4.3.10', '4.3.11', '4.4']);
assertOrder(PRESENTATION_FORMATS, ['5.1.1.5', '5.1.1.6', '5.1.2']);
assertOrder(PRESENTATION_FORMATS, ['5.2.2', '5.2.2.1', '5.2.3']);
assertOrder(PRESENTATION_FORMATS, ['6.5.7', '6.5.8', '6.5.bingo']);
assertOrder(PRESENTATION_FORMATS, ['7.2.1', '7.2.1.1', '7.2.1.2', '7.2.2', '7.2.3', '7.3']);

assertOrder(THEMATIC_CATEGORIES, ['B.7.3', 'B.7.4', 'B.7.5', 'C.0']);
assertOrder(THEMATIC_CATEGORIES, ['C.1.5', 'C.1.6', 'C.2']);
assertOrder(THEMATIC_CATEGORIES, ['C.2.1', 'C.2.2', 'C.3']);
assertOrder(THEMATIC_CATEGORIES, ['E.7', 'E.8', 'F.0']);
assertOrder(THEMATIC_CATEGORIES, ['G.7.18', 'G.7.19', 'G.8']);

console.log('libraryDataIntegrity: 22 new ids, dual-library markers, canonical reuse and taxonomy order passed');
