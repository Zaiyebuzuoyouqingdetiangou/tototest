import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'index.js'), 'utf8');

assert.match(source, /GOLDEN_MERGE_VERSION/);
assert.doesNotMatch(source, /^import .*ui\.js|^import .*outputSanitizer|^import .*independentApi/m, 'heavy runtime must stay outside the parser-critical graph');
assert.match(source, /Promise\.all\(\[[\s\S]*import\('\.\/src\/outputSanitizer\.js/);
assert.match(source, /^import \{ rabbitMirrorGenerateInterceptor/m);
assert.match(source, /initRabbitMirrorIndependentSecurityGuard\(\{ getSettings, updateSettings \}\);/);
assert.match(source, /requestIdleCallback\(runDeferredBoot\)/, 'core runtime must wait for a no-timeout idle boundary');
assert.doesNotMatch(source, /requestIdleCallback\(runDeferredBoot,\s*\{\s*timeout/, 'heavy runtime must never be forced into an unfinished host load');
assert.match(source, /if \(!deferredRuntimeModules\) return Promise\.resolve\(null\)/, 'ordinary mirror interaction cannot bootstrap the heavy graph');
assert.match(source, /prewarmRabbitMirrorGenerationRuntime/, 'the smaller generation graph must be prewarmed off the first-send path');
assert.match(source, /installOnDemandCompatTriggers\(\)/, 'optional compatibility must be activated by user-facing demand');
assert.match(source, /loadOptional\('checkedSelectorRepair'/);
assert.match(source, /loadOptional\('renderedVisualFeedback'/);
assert.doesNotMatch(source, /rabbitMirrorLightBootSummary|async function loadModule|async function bootstrapRuntime|idleYield\(/, 'serialized LightBoot loader must not return');
assert.doesNotMatch(source, /performanceDiagnostics\.js/, 'performance diagnostics must not participate in runtime boot');
assert.doesNotMatch(source, /request\.body|response\.body|sessionStorage/, 'boot entry must not inspect user request/response data');
console.log('golden merge loader tests passed');
