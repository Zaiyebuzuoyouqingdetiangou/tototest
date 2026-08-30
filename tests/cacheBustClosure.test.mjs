import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 模块缓存键闭包回归。
//
// 背景：子模块改了 ?rmv 键、父模块还用旧键时，热更新会直接命中父模块的旧缓存，
// 父模块内部新的 import 根本不会执行，形成新旧模块图混装。
// 本测试静态保证：本阶段 cohort 内的模块，其所有入站 URL 都在同一 cohort，
// 且任何模块都不会被两种不同的 ?rmv 键引用。

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_COHORT = '1.5-varietyfix1';
const RELEASE_RUNTIME = '1.5.5';
const RETIRED_RELEASE_COHORTS = new Set(['1.5-qualityfix1', '1.5-qualityfix2', '1.5-qualityfix3', '1.5-qualityfix4', '1.5-qualityfix5']);
const REQUIRED_RELEASE_MODULES = [
    'src/settings.js',
    'src/tokenMeter.js',
    'src/independentApi.js',
    'src/independentQualityGate.js',
    'src/ui.js',
    'src/outputSanitizer.js',
    'src/injector.js',
    'src/independentProfileSelectorHotfix.js',
    'src/promptBuilder.js',
    'src/visualScanner.js',
    'src/blacklist.js',
    'src/storage.js',
    'src/picker.js',
    'src/mobileModalHotfix.js',
    'src/renderedVisualFeedbackHotfix.js',
    'data/structured/thematicIndex.js',
    'data/structured/presentationIndex.js',
    'data/raw/rawSegmentLookup.js',
    'data/raw/rawThematicCategories.js',
    'data/raw/rawPresentationFormats.js',
];

function collectJsFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '.git' || entry === 'tests') continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...collectJsFiles(full));
        else if (entry.endsWith('.js')) out.push(full);
    }
    return out;
}

const IMPORT_RES = [
    /from\s+'(\.[^'?]+)(?:\?rmv=([\w.\-]+))?'/g,
    /import\(\s*'(\.[^'?]+)(?:\?rmv=([\w.\-]+))?'\s*\)/g,
    /loadOptional\([^,]+,\s*'(\.[^'?]+)(?:\?rmv=([\w.\-]+))?'/g,
    /:\s*'(\.[^'?]+)(?:\?rmv=([\w.\-]+))?'/g,
];
const edges = [];
for (const file of collectJsFiles(ROOT)) {
    const rel = relative(ROOT, file).split('\\').join('/');
    const source = readFileSync(file, 'utf-8');
    for (const IMPORT_RE of IMPORT_RES) {
        for (const match of source.matchAll(IMPORT_RE)) {
            const target = normalize(join(dirname(rel), match[1])).split('\\').join('/');
            edges.push({ from: rel, target, rmv: match[2] || null });
        }
    }
}

assert.ok(edges.length > 0, 'import graph must not be empty');
assert.equal(RETIRED_RELEASE_COHORTS.has(RELEASE_COHORT), false, 'current release cohort must advance beyond every retired published cohort');

// 1. 本次所有 1.5 系列 JS 发布边使用同一个完整 cohort，避免热更新混装。
const releaseEdges = edges.filter(edge => /^1\.5(?:-|$)/.test(String(edge.rmv || '')));
const stale = releaseEdges.filter(edge => edge.rmv !== RELEASE_COHORT);
assert.deepEqual(
    stale.map(edge => `${edge.from} -> ${edge.target}?rmv=${edge.rmv}`),
    [],
    `所有 1.5 发布边必须使用 ?rmv=${RELEASE_COHORT}，否则父模块会命中旧缓存`,
);

for (const target of REQUIRED_RELEASE_MODULES) {
    const fixEdges = edges.filter(edge => edge.target === target);
    assert.ok(fixEdges.length > 0, `${target} must have an inbound runtime edge`);
    assert.deepEqual(
        [...new Set(fixEdges.map(edge => edge.rmv))],
        [RELEASE_COHORT],
        `${target} must use exactly one VarietyFix1 cache key`,
    );
}

// 2. 任何模块都不得被两种不同的 ?rmv 键引用
const keysByTarget = new Map();
for (const edge of edges) {
    if (!keysByTarget.has(edge.target)) keysByTarget.set(edge.target, new Set());
    keysByTarget.get(edge.target).add(edge.rmv || '(none)');
}
const conflicting = [...keysByTarget.entries()]
    .filter(([, keys]) => keys.size > 1)
    .map(([target, keys]) => `${target}: ${[...keys].sort().join(' / ')}`);
assert.deepEqual(conflicting, [], '同一模块不得被多种 ?rmv 键引用');

// 3. 各模块内部的 RUNTIME_VERSION 不是带内部后缀的发布缓存键。
const runtimeVersions = new Set();
for (const file of collectJsFiles(ROOT)) {
    for (const match of readFileSync(file, 'utf-8').matchAll(/RUNTIME_VERSION\s*=\s*'([\w.\-]+)'/g)) {
        runtimeVersions.add(match[1]);
    }
}
assert.equal(runtimeVersions.has(RELEASE_COHORT), false, 'RUNTIME_VERSION 不得包含内部 cache cohort 后缀');

// 4. Runtime guards and watermark repair modules must agree with the entrypoint.
// Persistent storage/schema versions and unchanged data-module versions are not
// release identities and intentionally remain outside this check.
const identityPatterns = new Map([
    ['index.js', /const RABBIT_MIRROR_RUNTIME_VERSION\s*=\s*'([^']+)'/],
    ['src/independentApi.js', /const RUNTIME_VERSION\s*=\s*'([^']+)'/],
    ['src/outputSanitizer.js', /const RUNTIME_VERSION\s*=\s*'([^']+)'/],
    ['src/ui.js', /const RUNTIME_VERSION\s*=\s*'([^']+)'/],
    ['src/independentProfileSelectorHotfix.js', /const RELEASE_VERSION\s*=\s*'([^']+)'/],
    ['src/mobileModalHotfix.js', /const RELEASE_VERSION\s*=\s*'([^']+)'/],
    ['src/renderedVisualFeedbackHotfix.js', /const VERSION\s*=\s*'([^']+)'/],
]);
for (const [file, pattern] of identityPatterns) {
    assert.equal(readFileSync(join(ROOT, file), 'utf8').match(pattern)?.[1], RELEASE_RUNTIME, `${file} runtime identity must match the release`);
}
assert.ok(readFileSync(join(ROOT, 'src/ui.js'), 'utf8').includes(`TOTOv${RELEASE_RUNTIME}`), 'the visible watermark must match the runtime');
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
assert.equal(manifest.js, `index.js?rmv=${RELEASE_COHORT}`, 'the manifest entrypoint must use the release cohort');
assert.equal(manifest.css, `style.css?rmv=${RELEASE_RUNTIME}`);
assert.equal(manifest.version, RELEASE_RUNTIME, 'the manifest version must match the runtime');

console.log(`cacheBustClosure: ${edges.length} 条 import 边，VarietyFix1 单一 cache cohort 通过`);
