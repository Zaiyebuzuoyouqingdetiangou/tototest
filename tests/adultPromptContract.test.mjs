import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
};

const { defaultSettings } = await import('../src/settings.js');
const { buildRabbitMirrorPromptDetails } = await import('../src/promptBuilder.js');

const settings = {
    ...structuredClone(defaultSettings),
    samplingMode: 'format_only',
    rawPolicy: 'compact',
    userDirectivePriority: true,
    avoidRepeat: false,
    forceVisualScenery: false,
    themesMin: 1,
    themesMax: 1,
    formatsMin: 1,
    formatsMax: 2,
};

let sequence = 0;
function build(formatQuery, generationType = 'normal') {
    sequence += 1;
    return buildRabbitMirrorPromptDetails(
        settings,
        generationType,
        null,
        `adult-contract:${generationType}:${sequence}`,
        { chat: [{ is_user: true, is_system: false, mesid: sequence, mes: `兔子镜展现形式：${formatQuery}` }] },
    );
}

function occurrenceCount(text, fragment) {
    return String(text).split(fragment).length - 1;
}

for (const [query, expectedId] of [
    ['X黄推', '1.1.1.5'],
    ['P站等成人视频网站', '1.3.3.1.2'],
]) {
    const details = build(query);
    assert.deepEqual(details.metadata.formatIds, [expectedId]);
    assert.equal(occurrenceCount(details.prompt, '成人条目内部执行边界【'), 1, `${expectedId} must receive one full hidden adult lock`);
    assert.match(details.prompt, /仅本轮抽中 adult 条目时生效；不是可见文案/);
    assert.match(details.prompt, /当前虚构角色扮演正文的番外/);
    assert.match(details.prompt, /已经成立的成年角色、关系与情境边界/);
    assert.match(details.prompt, /必须忠实兑现抽中的成人主题／媒介及其内容强度/);
    assert.match(details.prompt, /最终兔子镜不得出现年龄核验、免责声明、安全说教或跳出角色的说明/);
    assert.equal(occurrenceCount(details.executionLock, '成人条目内部锁：'), 1, `${expectedId} independent execution lock must retain one compact adult boundary`);
    assert.match(details.executionLock, /不降级成无关暧昧或拒答模板/);
}

const existingAdultGame = build('成人游戏');
assert.deepEqual(existingAdultGame.metadata.formatIds, ['6.2.3']);
assert.equal(occurrenceCount(existingAdultGame.prompt, '成人条目内部执行边界【'), 1, 'the existing unambiguous adult-game parent must carry adult metadata');

const independentAdult = build('X黄推', 'independent');
assert.deepEqual(independentAdult.metadata.formatIds, ['1.1.1.5']);
assert.doesNotMatch(independentAdult.prompt, /成人条目内部执行边界/, 'independent generation must not duplicate the full adult rule in its base prompt');
assert.equal(occurrenceCount(independentAdult.executionLock, '成人条目内部锁：'), 1, 'independent generation keeps one compact near-output adult lock');

const nonAdult = build('豆瓣');
assert.deepEqual(nonAdult.metadata.formatIds, ['1.1.1.4']);
assert.doesNotMatch(nonAdult.prompt, /成人条目内部执行边界/);
assert.doesNotMatch(nonAdult.executionLock, /成人条目内部锁/);

const adultAsMain = build('X黄推 + 豆瓣');
assert.deepEqual(adultAsMain.metadata.formatIds, ['1.1.1.5', '1.1.1.4']);
assert.match(adultAsMain.prompt, /- 【1\.1\.1\.5 X 黄推 \/ 成人向推文】[^\n]*执行：本轮唯一主展现形式/);
assert.match(adultAsMain.prompt, /- 【1\.1\.1\.4 豆瓣】[^\n]*执行：辅助展现形式/);
assert.match(adultAsMain.prompt, /主形式 1\.1\.1\.5 X 黄推 \/ 成人向推文/);
assert.match(adultAsMain.prompt, /辅助形式 1\.1\.1\.4 豆瓣/);

const adultAsAuxiliary = build('豆瓣 + X黄推');
assert.deepEqual(adultAsAuxiliary.metadata.formatIds, ['1.1.1.4', '1.1.1.5']);
assert.match(adultAsAuxiliary.prompt, /- 【1\.1\.1\.4 豆瓣】[^\n]*执行：本轮唯一主展现形式/);
assert.match(adultAsAuxiliary.prompt, /- 【1\.1\.1\.5 X 黄推 \/ 成人向推文】[^\n]*执行：辅助展现形式/);
assert.match(adultAsAuxiliary.prompt, /主形式 1\.1\.1\.4 豆瓣/);
assert.match(adultAsAuxiliary.prompt, /辅助形式 1\.1\.1\.5 X 黄推 \/ 成人向推文/);
assert.equal(occurrenceCount(adultAsAuxiliary.prompt, '成人条目内部执行边界【'), 1, 'an adult auxiliary format must still activate exactly one hidden lock');

delete globalThis.localStorage;
console.log('adultPromptContract: adult-only hidden lock, non-adult absence and ordered main/auxiliary roles passed');
