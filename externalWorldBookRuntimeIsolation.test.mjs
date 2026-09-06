import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const indexSource = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const uiSource = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
const pickerSource = fs.readFileSync(new URL('../src/picker.js', import.meta.url), 'utf8');
const promptSource = fs.readFileSync(new URL('../src/promptBuilder.js', import.meta.url), 'utf8');
const poolSource = fs.readFileSync(new URL('../src/externalWorldBook/externalPool.js', import.meta.url), 'utf8');
const wizardSource = fs.readFileSync(new URL('../src/externalWorldBook/importWizard.js', import.meta.url), 'utf8');
const hostSource = fs.readFileSync(new URL('../src/externalWorldBook/hostReader.js', import.meta.url), 'utf8');
const classifierSource = fs.readFileSync(new URL('../src/externalWorldBook/classifier.js', import.meta.url), 'utf8');
const storeSource = fs.readFileSync(new URL('../src/externalWorldBook/store.js', import.meta.url), 'utf8');

test('external pool stays ID-only; importer/store IO stays outside synchronous prompt planning/rendering', () => {
    assert.doesNotMatch(indexSource, /externalWorldBook/i, 'startup index must not directly load importer/store modules');
    assert.doesNotMatch(uiSource, /^import .*externalWorldBook/m, 'settings UI must not statically import the importer');
    assert.equal((uiSource.match(/import\('\.\/externalWorldBook\/importWizard\.js\?rmv=/g) || []).length, 1, 'one explicit-intent dynamic import only');
    assert.match(pickerSource, /externalWorldBook\/externalPool\.js\?rmv=/, 'picker may load only the tiny ID-only external pool');
    assert.doesNotMatch(pickerSource, /rawContent|indexedDB|hostReader|fileReader|importWizard/, 'picker must not read raw/store/import sources');
    assert.doesNotMatch(poolSource, /rawContent|indexedDB|fetch\s*\(|XMLHttpRequest|WebSocket/, 'pool must stay light and offline');
    assert.doesNotMatch(promptSource, /^import .*externalWorldBook\/(?:store|hostReader|fileReader|importWizard)/m,
        'synchronous prompt code must receive selected rows, not open the importer/store');
    assert.doesNotMatch(promptSource, /\bfetch\s*\(|\bindexedDB\b|XMLHttpRequest|WebSocket/);
    assert.match(promptSource, /export function planRabbitMirrorPromptDetails\(/);
    assert.match(promptSource, /export function renderRabbitMirrorPromptPlan\(/);
    assert.doesNotMatch(promptSource, /export async function (?:build|plan|render)RabbitMirrorPrompt/);
});

test('import preview and classification UI never render external data with executable HTML', () => {
    assert.doesNotMatch(wizardSource, /\.innerHTML\b|insertAdjacentHTML|document\.write|\beval\s*\(|new Function\b/);
    assert.match(wizardSource, /textContent/);
});

test('host reader uses only read endpoints and does not contain worldbook write endpoints', () => {
    assert.match(hostSource, /\/api\/worldinfo\/list/);
    assert.match(hostSource, /\/api\/worldinfo\/get/);
    assert.doesNotMatch(hostSource, /\/api\/worldinfo\/(?:edit|import|delete|create|rename)/);
});

test('local classifier is offline-only and IndexedDB remains isolated from picker/prompt', () => {
    assert.doesNotMatch(classifierSource, /\bglobalThis\.fetch\b|callIndependentApi|requestIndependentCompletion|XMLHttpRequest|WebSocket/);
    assert.match(storeSource, /globalThis\.indexedDB/);
    assert.doesNotMatch(indexSource + '\n' + pickerSource + '\n' + promptSource + '\n' + poolSource, /indexedDB/i);
});
