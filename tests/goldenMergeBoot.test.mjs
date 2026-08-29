import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const index = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const independent = fs.readFileSync(path.join(root, 'src', 'independentApi.js'), 'utf8');

assert.match(index, /GOLDEN_MERGE_VERSION\s*=\s*'1\.5'/);
assert.doesNotMatch(index, /performanceDiagnostics\.js/);
assert.doesNotMatch(index, /^import .*outputSanitizer|^import .*independentApi|^import .*ui\.js/m, 'heavy runtime must not be in the static bootstrap graph');
assert.match(index, /import\('\.\/src\/ui\.js\?rmv=1\.5-qualityfix1'\)/);
assert.match(index, /import\('\.\/src\/externalDiagnostics\.js\?rmv=1\.5-qualityfix1'\)/);
assert.match(index, /initRabbitMirrorIndependentSecurityGuard\(\{ getSettings, updateSettings \}\);/);
assert.match(index, /output\.initOutputSanitizer[\s\S]*visual\.initVisualScanner[\s\S]*independent\.initIndependentRabbitMirror[\s\S]*touch\.initTouchTheaterBridge[\s\S]*ui\.initRabbitMirrorUI/);
assert.match(index, /requestDeferredIdleCheck\(3500\)/, 'heavy runtime must wait through the fixed host startup window');
assert.match(index, /deferredBootTimer\s*=\s*setTimeout\(/, 'deferred checks must remain timer-backed and cancellable');
assert.match(index, /requestIdleCallback\(runDeferredBoot\)/);
assert.doesNotMatch(index, /requestIdleCallback\(runDeferredBoot,\s*\{\s*timeout/);
assert.match(index, /genuinely new empty chat needs no background DOM runtime[\s\S]{0,120}return '';/);
assert.match(index, /prewarmRabbitMirrorGenerationRuntime/);
assert.doesNotMatch(index, /host-send-intent|host-send-focus/, 'send must not trigger the heavy module graph');
assert.match(index, /installOnDemandCompatTriggers\(\)/);
assert.match(index, /loadProfileSelector\(\)/);
assert.match(index, /loadMirrorVisualCompat\(\)/);
assert.match(index, /loadMaintenanceCompat\(\)/);
assert.doesNotMatch(index, /addEventListener\(['\"]toggle['\"]/);
assert.doesNotMatch(index, /void ensureExternalDiagnostics\(/, 'external diagnostics must remain opt-in');

// PerfFix must stay: syncAll exists only as a dormant/manual helper, not a normal lifecycle call.
const syncAllExecutableCalls = independent.split('\n').filter(line => !line.trim().startsWith('//') && /\bsyncAll\s*\(/.test(line));
assert.equal(syncAllExecutableCalls.length, 1, 'normal lifecycle must not reintroduce syncAll() calls');
assert.match(syncAllExecutableCalls[0], /function syncAll/);

// ChatSafety must stay in the merged candidate.
const independentExecutable = independent.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
assert.doesNotMatch(independentExecutable, /\.saveMetadata\s*\(/);
assert.doesNotMatch(independentExecutable, /\/api\/chats\/(?:save|delete)/);

console.log('goldenMergeBoot tests passed');
