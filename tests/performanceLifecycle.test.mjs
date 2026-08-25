import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const guard = read('src/independentSecurityGuard.js');
const independent = read('src/independentApi.js');
const profile = read('src/independentProfileSelectorHotfix.js');
const sanitizer = read('src/outputSanitizer.js');
const manifest = JSON.parse(read('manifest.json'));

assert.doesNotMatch(guard, /globalThis\.fetch\s*=(?!=)/, 'security guard must not wrap ordinary global fetch');
assert.match(guard, /export async function fetchRabbitMirrorIndependentCompletion/);
assert.match(guard, /boundedStreamingBody\(response\.body, safeMax\)/);
assert.doesNotMatch(guard, /const chunks = \[\][\s\S]{0,500}while \(true\)/);

const guardedGenerateCalls = independent.match(/fetchRabbitMirrorIndependentCompletion\(ST_CUSTOM_GENERATE_ENDPOINT/g) || [];
assert.equal(guardedGenerateCalls.length, 2, 'both independent Chat Completion transports must use the guard');
assert.doesNotMatch(independent, /return await fetch\(ST_CUSTOM_GENERATE_ENDPOINT/);
assert.doesNotMatch(independent, /payload\.zai_endpoint=apiUrl|payload\.siliconflow_endpoint=apiUrl|payload\.workers_ai_account_id=apiUrl/, 'api-url must not be copied into provider enum/account fields');
assert.match(independent, /if\(apiMap\.source==='custom'\) payload\.custom_url=apiUrl/);
assert.match(independent, /payload\.reverse_proxy=apiUrl/);
assert.match(independent, /saved-fallback/);


assert.doesNotMatch(profile, /\[0, 180, 700, 1800\]/);
assert.doesNotMatch(profile, /scheduleEnsures\(\)/);
assert.match(profile, /inline-drawer-toggle/);
assert.match(profile, /rabbitMirrorProfilesReady/);

const startupGuard = sanitizer.match(/function initializeMaintenanceAutoSafeStartupGuard\(\) \{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(startupGuard);
assert.doesNotMatch(startupGuard, /captureMaintenanceAutoSafeBaseline\(\)/, 'startup guard must not rescan the full chat');
assert.match(sanitizer, /captureStartupBaseline[\s\S]*maintenanceAutoSafeSignature\(root\)/);

assert.match(independent, /const STARTUP_SYNC_IMMEDIATE_MESSAGES=6/);
assert.doesNotMatch(independent, /STARTUP_SYNC_CHUNK_MESSAGES/, 'cold startup must not pump the entire history');
assert.match(independent, /IntersectionObserver/);
assert.match(independent, /installStartupHistoryLazySync/);
assert.doesNotMatch(independent, /syncAll\('(?:reconfigureRuntime|background-resume|passive-recovery|host:CHAT_CHANGED|host:MESSAGE_SWIPED:fallback|host:render-event:fallback|host:generation-finished:fallback)'/, 'normal lifecycle must never fall back to an all-chat sync');
assert.match(independent, /function resolveHostEventMessageIndex\(/);
assert.match(independent, /scheduleStartupHistorySync\(runtimeConfigSequence\)/);
assert.match(independent, /const hotUpdate=typeof previousCleanup==='function';/);
const sanitizerInit = sanitizer.slice(sanitizer.indexOf('export async function initOutputSanitizer()'), sanitizer.indexOf('export function destroyOutputSanitizer()'));
assert.match(sanitizerInit, /installMaintenanceRabbitsDeferredInChatDom\(\)/);
assert.doesNotMatch(sanitizerInit, /\n\s*installMaintenanceRabbitsInChatDom\(\);/, 'cold startup must not synchronously scan all historical mirrors');

const index = read('index.js');
// multiface-step1 起 ui.js 进入本阶段 cache cohort：不再断言旧的 1.4.30.25 键，
// 改为断言 cohort 完整性（详见 cacheBustClosure.test.mjs）。
assert.match(index, /\.\/src\/ui\.js\?rmv=1\.4\.9-lightboot1/, 'ui.js must load from the multiface-step1 cache cohort');
assert.doesNotMatch(index, /\.\/src\/ui\.js\?rmv=1\.4\.30\.2[0-9]/, 'stale 1.4.30.x UI cache key must not survive');
assert.match(index, /\.\/src\/checkedSelectorRepair\.js\?rmv=1\.4\.30\.26/, 'formal checked-selector repair must be present in the test baseline');
assert.match(index, /\.\/src\/maintenanceRecommendationHotfix\.js\?rmv=1\.4\.5/, 'formal maintenance recommendation must be present in the test baseline');
assert.equal(manifest.js, 'index.js?rmv=1.4.9-test-multiface-step1-lightboot1');
assert.equal(manifest.version, '1.4.9-test-multiface-step1-lightboot1');

console.log('performance lifecycle tests passed');
