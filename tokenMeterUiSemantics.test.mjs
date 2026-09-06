import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
const start = source.indexOf('function formatMeterNumber(');
const end = source.indexOf('\nfunction attachTokenMeterListener(', start);
assert.ok(start >= 0 && end > start, 'Token meter render seam must remain extractable');
const renderSource = source.slice(start, end);

const text = { main: '', exact: '', detail: '' };
const targets = {
    '[data-rh-token-meter-main]': { text(value) { text.main = String(value); } },
    '[data-rh-token-meter-exact]': { text(value) { text.exact = String(value); } },
    '[data-rh-token-meter-detail]': { text(value) { text.detail = String(value); } },
};
let generationSource = 'follow';
const now = Date.now();
const records = {
    follow: {
        status: 'injected',
        recordedAt: now,
        chars: { total: 1234, feedback: 0, motherLibrary: 12, sharedMemory: 0, editableVisual: 0 },
        tokens: { estimated: 456, min: 300, max: 620, baseEstimated: 456, feedbackEstimated: 0 },
    },
    independent: {
        status: 'independent',
        recordedAt: now,
        chars: {
            total: 2345,
            totalRequest: 7777,
            independentContext: 4321,
            independentContextLayers: 3,
            independentContextMaxLayers: 6,
            feedback: 0,
            executionLock: 20,
            motherLibrary: 10,
            sharedMemory: 0,
            editableVisual: 0,
        },
        tokens: { estimated: 789, min: 600, max: 1000, baseEstimated: 700, feedbackEstimated: 0, executionLockEstimated: 9 },
    },
};
const sandbox = {
    Date,
    Number,
    String,
    Math,
    getSettings: () => ({ generationSource }),
    getLastRabbitMirrorTokenRecordForSource: sourceName => records[sourceName],
    $: selector => selector === '#rh_token_meter'
        ? { length: 1, find: childSelector => targets[childSelector] }
        : { length: 0 },
    globalThis: {},
};
vm.createContext(sandbox);
vm.runInContext(`${renderSource}\nglobalThis.renderTokenMeter = renderTokenMeter;`, sandbox);

sandbox.globalThis.renderTokenMeter();
assert.match(text.main, /跟随正文 API/);
assert.match(text.main, /最近记录/);
assert.match(text.main, /兔子镜待注入 Prompt 估算约 456 Token（非账单）/);
assert.doesNotMatch(text.main + text.exact + text.detail, /账单 Token(?!。)/);

generationSource = 'independent';
sandbox.globalThis.renderTokenMeter();
assert.match(text.main, /独立 API/);
assert.match(text.main, /请求前规则估算约 789 Token（非账单）/);
assert.match(text.exact, /请求消息内容合计 7,777 字符/);
assert.match(text.exact, /规则 2,345；上下文 4,321/);

generationSource = 'follow';
records.follow = { ...records.follow, recordedAt: now - 31 * 60 * 1000 };
sandbox.globalThis.renderTokenMeter();
assert.match(text.main, /跟随正文 API · 历史记录/);
assert.doesNotMatch(text.main + text.exact + text.detail, /本轮|成功/);

assert.match(source, /rabbit-mirror-token-meter-label">Prompt 估算</);
assert.doesNotMatch(source, /rabbit-mirror-token-meter-label">本轮 Token</);
assert.match(source, /不是服务商账单 Token；记录在请求发送前生成/);

console.log('tokenMeter UI semantics tests passed');
