import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'index.js'), 'utf8');

assert.match(source, /GOLDEN_MERGE_VERSION/);
assert.match(source, /^import \{ initRabbitMirrorUI/m, 'core runtime should use one host-aligned static module graph');
assert.match(source, /^import \{ rabbitMirrorGenerateInterceptor/m);
assert.match(source, /initRabbitMirrorIndependentSecurityGuard\(\{ getSettings, updateSettings \}\);/);
assert.doesNotMatch(source, /requestIdleCallback\(|scheduleOptionalCompat|setTimeout\(run,\s*1200\)/, 'optional compatibility must not be timer-loaded after startup');
assert.match(source, /installOnDemandCompatTriggers\(\)/, 'optional compatibility must be activated by user-facing demand');
assert.match(source, /loadOptional\('checkedSelectorRepair'/);
assert.match(source, /loadOptional\('renderedVisualFeedback'/);
assert.doesNotMatch(source, /rabbitMirrorLightBootSummary|async function loadModule|async function bootstrapRuntime|idleYield\(/, 'serialized LightBoot loader must not return');
assert.doesNotMatch(source, /performanceDiagnostics\.js/, 'performance diagnostics must not participate in runtime boot');
assert.doesNotMatch(source, /request\.body|response\.body|sessionStorage/, 'boot entry must not inspect user request/response data');
console.log('golden merge loader tests passed');
