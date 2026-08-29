import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    analyzeStylelessControlKinds,
    collectBoundedElementDescendants,
    countMeaningfulStateVisualRules,
    detectMissingVisualProgram,
    semanticEnsembleScalePlan,
} from '../src/presentationQuality.js';

function linkedTree(width, depth = 1) {
    const root = { firstElementChild: null, parentElement: null, nextElementSibling: null };
    let parent = root;
    for (let level = 0; level < depth; level += 1) {
        let previous = null;
        for (let index = 0; index < width; index += 1) {
            const node = { firstElementChild: null, parentElement: parent, nextElementSibling: null };
            if (!previous) parent.firstElementChild = node;
            else previous.nextElementSibling = node;
            previous = node;
        }
        parent = parent.firstElementChild;
    }
    return root;
}

const withinBudgetTree = collectBoundedElementDescendants(linkedTree(3, 2), 6);
assert.equal(withinBudgetTree.exceeded, false);
assert.equal(withinBudgetTree.visited, 6);
assert.equal(withinBudgetTree.elements.length, 6);
const overBudgetTree = collectBoundedElementDescendants(linkedTree(6), 5);
assert.equal(overBudgetTree.exceeded, true);
assert.equal(overBudgetTree.visited, 6);
assert.equal(overBudgetTree.elements.length, 0);
const overBudgetDepth = collectBoundedElementDescendants(linkedTree(1, 6), 5);
assert.equal(overBudgetDepth.exceeded, true);
assert.equal(overBudgetDepth.visited, 6);
assert.equal(overBudgetDepth.elements.length, 0);

const choiceOnly = analyzeStylelessControlKinds([
    { tagName: 'INPUT', type: 'radio' },
    { tagName: 'INPUT', type: 'radio' },
    { tagName: 'INPUT', type: 'radio' },
]);
assert.equal(choiceOnly.safeChoiceOnly, true);
assert.equal(choiceOnly.choiceCount, 3);
assert.equal(choiceOnly.nonChoiceCount, 0);

const realForm = analyzeStylelessControlKinds([
    { tagName: 'INPUT', type: 'radio' },
    { tagName: 'INPUT', type: 'text' },
    { tagName: 'BUTTON', type: 'button' },
]);
assert.equal(realForm.safeChoiceOnly, false);
assert.equal(realForm.nonChoiceCount, 2);

const tooManyChoices = analyzeStylelessControlKinds(Array.from({ length: 9 }, () => ({ tagName: 'input', type: 'checkbox' })));
assert.equal(tooManyChoices.safeChoiceOnly, false);

assert.equal(countMeaningfulStateVisualRules('.choice:checked ~ .panel { display:block; opacity:1; }'), 1);
assert.equal(countMeaningfulStateVisualRules('.unused { color:red; }'), 0);
assert.equal(countMeaningfulStateVisualRules('@media(max-width:640px){.choice:checked + label { background:#fff; }}'), 1);

const plainNarrative = `<div><h2>标题</h2>${'<p>一段没有视觉程序的长文本内容</p>'.repeat(8)}<input type="radio"><input type="radio"><input type="radio"></div>`;
assert.equal(detectMissingVisualProgram(plainNarrative, '纯文字内容'.repeat(50)), true);
const designedNarrative = `<style>.stage{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;background:#111;padding:12px}</style>${plainNarrative}`;
assert.equal(detectMissingVisualProgram(designedNarrative, '纯文字内容'.repeat(50)), false);
const visualMedia = `<div><svg viewBox="0 0 400 200"><path d="M0 0L1 1"/></svg>${'<p>视觉内容</p>'.repeat(8)}</div>`;
assert.equal(detectMissingVisualProgram(visualMedia, '视觉内容'.repeat(50)), false);

const fourActors = semanticEnsembleScalePlan({
    naturalWidth: 520,
    availableWidth: 360,
    unitCount: 4,
    totalTextLength: 16,
});
assert.equal(fourActors.candidate, true);
assert.ok(fourActors.scale >= 0.68 && fourActors.scale < 0.70);

assert.equal(semanticEnsembleScalePlan({ naturalWidth: 760, availableWidth: 360, unitCount: 4 }).candidate, false);
assert.equal(semanticEnsembleScalePlan({ naturalWidth: 640, availableWidth: 360, unitCount: 4, totalTextLength: 24 }).candidate, true);
assert.equal(semanticEnsembleScalePlan({ naturalWidth: 640, availableWidth: 360, unitCount: 4, totalTextLength: 120 }).candidate, false);
assert.equal(semanticEnsembleScalePlan({ naturalWidth: 520, availableWidth: 360, unitCount: 2 }).candidate, false);
assert.equal(semanticEnsembleScalePlan({ naturalWidth: 520, availableWidth: 360, unitCount: 4, hasComplexControls: true }).candidate, false);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const promptBuilder = fs.readFileSync(path.join(root, 'src', 'promptBuilder.js'), 'utf8');
const sanitizer = fs.readFileSync(path.join(root, 'src', 'outputSanitizer.js'), 'utf8');
const visualScanner = fs.readFileSync(path.join(root, 'src', 'visualScanner.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(root, 'src', 'ui.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

assert.match(promptBuilder, /最终成品短检/);
assert.match(promptBuilder, /compactPresentationExecutionContract\(combo\?\.formats\)/);
assert.match(promptBuilder, /对象→操作→第二状态→明确反馈→返回或继续/);
assert.match(promptBuilder, /按 360px 检查人物、关系节点、图例等数量群组/);
assert.match(sanitizer, /controlKinds\.safeChoiceOnly/);
assert.doesNotMatch(sanitizer, /formControlCount <= 1/);
assert.match(sanitizer, /semantic-ensemble-fit/);
assert.match(sanitizer, /zoom:var\(--rm-hclip-ensemble-scale\)/);
assert.match(sanitizer, /STYLELESS_STRUCTURED_MAX_DESCENDANTS = 320/);
assert.match(sanitizer, /HCLIP_ENSEMBLE_MAX_ROOT_DESCENDANTS = 720/);
assert.match(sanitizer, /if \(rootTraversal\.exceeded\) return stats/);
assert.match(visualScanner, /missing_visual_program/);
// multiface-step1 起 ui / injector / independentApi 全部进入本阶段 cache cohort。
// 这里只断言链路仍然闭合在同一 cohort；完整闭包校验见 cacheBustClosure.test.mjs。
assert.match(indexSource, /\.\/src\/ui\.js\?rmv=1\.4\.9-subapitag2-advancedui1/);
assert.match(uiSource, /\.\/injector\.js\?rmv=1\.4\.9-subapitag2-advancedui1/);
assert.match(uiSource, /\.\/independentApi\.js\?rmv=1\.4\.9-subapitag2-advancedui1/);
assert.equal(manifest.version, '1.4.9-test-multiface-step1-externaldiag1-securityfix6-subapitag2-advancedui1-stability1-repairemoji1-cleanui1-widthfix1-apifix2-modelselectfix1-streamfix1-variety1');

console.log('presentationQuality tests passed');
