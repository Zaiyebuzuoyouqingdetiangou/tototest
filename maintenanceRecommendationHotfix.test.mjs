import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'maintenanceRecommendationHotfix.js'), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const mod = await import(moduleUrl);
const recommend = mod.getRabbitMirrorMaintenanceRecommendation;

assert.equal(recommend('repairable', '显示：检测到手机端容器挤压、横向溢出或文字可能被裁切'), '推荐使用：📱 排版不适配／内容显示不全');
assert.equal(recommend('repairable', '交互：checked 目标位于触发器父层之外'), '推荐使用：🖱️ 点了没有反应');
assert.equal(recommend('repairable', '原始源码显示为代码块或纯文字'), '推荐使用：📄 空白或显示代码、纯文字');
assert.equal(recommend('repairable', 'CSS / WebKit 兼容导致样式异常'), '推荐使用：🎨 样子不对');
assert.equal(recommend('repairable', '显示：手机端裁切；交互：checkbox 点击无反应'), '推荐使用：📱 排版不适配／内容显示不全 → 🖱️ 点了没有反应');
assert.equal(recommend('unknown', '无法分类的未知维修异常'), '推荐使用：📋 生成全链路诊断');
assert.equal(recommend('unknown', '独立 API 生成失败 HTTP 500'), '', 'independent API transport failure must not be misrouted to manual mirror repair');
assert.equal(recommend('healthy', '显示：手机端裁切'), '', 'healthy mirrors must not show a repair recommendation');

function extractFunction(name) {
    const start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `missing ${name}`);
    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        else if (source[index] === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(start, index + 1);
        }
    }
    throw new Error(`unterminated ${name}`);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`${extractFunction('mergeMaintenanceProblemAndRecommendation')}\nglobalThis.merge=mergeMaintenanceProblemAndRecommendation;`, sandbox);
assert.equal(sandbox.merge('📄 原始源码显示为代码块', '推荐使用：📄 空白或显示代码、纯文字'), '📄 原始源码显示为代码块\n推荐使用：📄 空白或显示代码、纯文字');
assert.equal(sandbox.merge('📄 原始源码显示为代码块\n推荐使用：📄 空白或显示代码、纯文字', '推荐使用：📄 空白或显示代码、纯文字'), '📄 原始源码显示为代码块\n推荐使用：📄 空白或显示代码、纯文字', 'menu recommendation merge must be idempotent');
assert.equal(sandbox.merge('未发现需要维修的问题', ''), '未发现需要维修的问题');
assert.doesNotMatch(source, /panel\.textContent\s*=\s*recommendation\s*;/, 'hotfix must never overwrite the real problem text');
console.log('maintenanceRecommendationHotfix tests passed');
