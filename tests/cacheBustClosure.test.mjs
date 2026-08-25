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
const COHORT = '1.4.9-ms1';

// 本阶段 cache cohort：源码内容变化的模块（settings/storage/picker）
// 加上所有直接或间接 import 它们的父模块。
const COHORT_MODULES = [
    'index.js',
    'src/blacklist.js',
    'src/generationGuard.js',
    'src/independentApi.js',
    'src/independentSecurityGuard.js',
    'src/injector.js',
    'src/outputSanitizer.js',
    'src/paletteCooldown.js',
    'src/picker.js',
    'src/promptBuilder.js',
    'src/renderedVisualFeedbackHotfix.js',
    'src/settings.js',
    'src/tokenMeter.js',
    'src/storage.js',
    'src/ui.js',
    'src/visualScanner.js',
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

const IMPORT_RE = /from\s+'(\.[^'?]+)(?:\?rmv=([\w.\-]+))?'/g;
const edges = [];
for (const file of collectJsFiles(ROOT)) {
    const rel = relative(ROOT, file).split('\\').join('/');
    const source = readFileSync(file, 'utf-8');
    for (const match of source.matchAll(IMPORT_RE)) {
        const target = normalize(join(dirname(rel), match[1])).split('\\').join('/');
        edges.push({ from: rel, target, rmv: match[2] || null });
    }
}

assert.ok(edges.length > 0, 'import graph must not be empty');

// 1. cohort 内模块的所有入站 URL 必须落在同一 cohort
const stale = edges.filter(edge => COHORT_MODULES.includes(edge.target) && edge.rmv !== COHORT);
assert.deepEqual(
    stale.map(edge => `${edge.from} -> ${edge.target}?rmv=${edge.rmv}`),
    [],
    `cohort 内模块必须全部使用 ?rmv=${COHORT}，否则父模块会命中旧缓存`,
);

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

// 3. cohort 必须是 import 闭包：cohort 内模块的父模块也必须在 cohort 内
const parentsOf = new Map();
for (const edge of edges) {
    if (!parentsOf.has(edge.target)) parentsOf.set(edge.target, new Set());
    parentsOf.get(edge.target).add(edge.from);
}
const leaks = [];
for (const target of COHORT_MODULES) {
    for (const parent of parentsOf.get(target) || []) {
        if (!COHORT_MODULES.includes(parent)) leaks.push(`${parent} imports cohort module ${target}`);
    }
}
assert.deepEqual(leaks, [], 'cohort 必须闭合：引用 cohort 模块的父模块也必须在 cohort 内');

// 4. cohort 外模块不得被误改成本阶段 cohort 键
const overreach = edges.filter(edge => !COHORT_MODULES.includes(edge.target) && edge.rmv === COHORT);
assert.deepEqual(
    overreach.map(edge => `${edge.from} -> ${edge.target}`),
    [],
    'cohort 外模块不应被改成本阶段缓存键',
);

// 5. 各模块内部的 RUNTIME_VERSION 不是发布缓存键，本轮不得被改动
const runtimeVersions = new Set();
for (const file of collectJsFiles(ROOT)) {
    for (const match of readFileSync(file, 'utf-8').matchAll(/RUNTIME_VERSION\s*=\s*'([\w.\-]+)'/g)) {
        runtimeVersions.add(match[1]);
    }
}
assert.equal(runtimeVersions.has(COHORT), false, 'RUNTIME_VERSION 不是发布缓存键，不得改成 cohort 串');

console.log(`cacheBustClosure: ${edges.length} 条 import 边，cohort ${COHORT_MODULES.length} 个模块，5 组断言全部通过`);
