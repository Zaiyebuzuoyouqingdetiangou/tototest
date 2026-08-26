import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const index = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const independent = fs.readFileSync(path.join(root, 'src', 'independentApi.js'), 'utf8');

assert.match(index, /GOLDEN_MERGE_VERSION\s*=\s*'1\.4\.9-goldenmerge2'/);
assert.doesNotMatch(index, /performanceDiagnostics\.js/);
assert.doesNotMatch(index, /async function bootstrapRuntime|modulePromises|idleYield\(/);
assert.match(index, /import \{ initRabbitMirrorUI/);
assert.match(index, /initRabbitMirrorIndependentSecurityGuard\(\{ getSettings, updateSettings \}\);/);
assert.match(index, /initRabbitMirrorUI\(\);[\s\S]*initOutputSanitizer\(\);[\s\S]*initVisualScanner\(\);[\s\S]*initIndependentRabbitMirror\(\);[\s\S]*initTouchTheaterBridge\(\);/);
assert.doesNotMatch(index, /requestIdleCallback\(|setTimeout\(run,\s*1200\)|scheduleOptionalCompat/, 'no timer-driven optional compatibility batch may run after startup');
assert.match(index, /installOnDemandCompatTriggers\(\)/);
assert.match(index, /loadProfileSelector\(\)/);
assert.match(index, /loadMirrorInteractionCompat\(event\)/);

// PerfFix must stay: syncAll exists only as a dormant/manual helper, not a normal lifecycle call.
const syncAllExecutableCalls = independent.split('\n').filter(line => !line.trim().startsWith('//') && /\bsyncAll\s*\(/.test(line));
assert.equal(syncAllExecutableCalls.length, 1, 'normal lifecycle must not reintroduce syncAll() calls');
assert.match(syncAllExecutableCalls[0], /function syncAll/);

// ChatSafety must stay in the merged candidate.
const independentExecutable = independent.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
assert.doesNotMatch(independentExecutable, /\.saveMetadata\s*\(/);
assert.doesNotMatch(independentExecutable, /\/api\/chats\/(?:save|delete)/);

console.log('goldenMergeBoot tests passed');
