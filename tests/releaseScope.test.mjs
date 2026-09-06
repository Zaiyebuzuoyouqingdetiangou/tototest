import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

// Captured from the untouched uploaded baseline, not current-source self hashes.
// Only cache queries and release identity constants may differ in protected files.
// The generated presentation/theme indexes and their mother-library data are explicit build inputs and are
// guarded by libraryDataIntegrity instead of current-source self hashes.
const baseline = JSON.parse(fs.readFileSync(new URL('./protected-baseline-hashes.json', import.meta.url), 'utf8'));
const normalize = text => text.replace(/\?rmv=[a-z\d._-]+/gi, '').replace(/(const (?:RABBIT_MIRROR_RUNTIME_VERSION|GOLDEN_MERGE_VERSION|RUNTIME_VERSION|RELEASE_VERSION|VERSION)\s*=\s*')1\.5\.(?:[5-9]|1[0-9]|20)'/g, "$1<release>'");
assert.equal(baseline.allowedFunctional.length, 20);
assert.equal(baseline.entries.length, 33, 'cover every unchanged production module and mother-library source after the explicitly authorized security and token accounting fixes joined this release');
assert.equal(baseline.entries.some(item => baseline.allowedFunctional.includes(item.file)), false, 'authorized functional files must be explicit exclusions, never self-hashed current-source approvals');
for (const item of baseline.entries) {
    let source = fs.readFileSync(new URL(`../${item.file}`, import.meta.url), 'utf8');
    // 1.5.20 removes exactly the conflicting outside-scene interaction permission.
    if (item.file === 'data/raw/visualSceneryRules.js') source = source.replace(
        '操作后先改变画面中对象的关系或状态，文字只作辅助反馈。不得让画面停留原状，只在下方展开大段文字来代替交互。',
        '文字只作题签、坐标或极短画内标注，后续正文与交互可在画面外承载。');
    // 1.5.19 user explicitly requested a coherent human figure. Reverse only
    // this exact authorized wording before comparing the untouched baseline hash.
    if (item.file === 'data/raw/touchTheaterRules.js') source = source.replace(
        '视觉中心是当前 {{char}} 的近距离人物舞台，默认至少到膝盖／小腿的 3/4 身构图。无真实图片时可用 CSS／安全 SVG 线稿或剪影，但必须有轮廓连贯的头颈、躯干、肩臂与腿部，以及可辨认的发型、服装和姿态；禁止散落圆点、三角形与矩形拼成无法辨认的人体。热点贴合人物实际部位，不代替人物本体。构图随剧情变化，禁止编造图片 URL 或 Base64 假立绘。',
        '视觉中心是当前 {{char}} 的近距离人物舞台，默认尽量保持至少到膝盖／小腿的 3/4 身构图；不要无理由只剩上半身。人物舞台由本轮剧情自行构图，不存在固定图床套数；无真实图片时可用纯 CSS／SVG 线稿、剪影或抽象人形，禁止编造图片 URL 或 Base64 假立绘。');
    const digest = createHash('sha256').update(normalize(source)).digest('hex');
    assert.equal(digest, item.normalizedSha256, `${item.file}: unrelated behavior must remain byte-identical after exact cache/release removal`);
}
console.log(`releaseScope passed: ${baseline.entries.length} protected files match uploaded source after only cache/release-identity removal`);
