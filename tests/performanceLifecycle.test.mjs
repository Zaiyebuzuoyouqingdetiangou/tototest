import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const guard = read('src/independentSecurityGuard.js');
const independent = read('src/independentApi.js');
const profile = read('src/independentProfileSelectorHotfix.js');
const sanitizer = read('src/outputSanitizer.js');
const visual = read('src/visualScanner.js');
const manifest = JSON.parse(read('manifest.json'));

assert.doesNotMatch(guard, /globalThis\.fetch\s*=(?!=)/, 'security guard must not wrap ordinary global fetch');
assert.match(guard, /export async function fetchRabbitMirrorIndependentCompletion/);
assert.match(guard, /boundedStreamingBody\(response\.body, safeMax\)/);
assert.doesNotMatch(guard, /const chunks = \[\][\s\S]{0,500}while \(true\)/);

const guardedGenerateCalls = independent.match(/fetchRabbitMirrorIndependentCompletion\(ST_CUSTOM_GENERATE_ENDPOINT/g) || [];
assert.equal(guardedGenerateCalls.length, 2, 'manual Chat Completion transports must keep using the fetch guard');
assert.doesNotMatch(independent, /return await fetch\(ST_CUSTOM_GENERATE_ENDPOINT/);
assert.match(independent, /if\(apiMap\.source==='zai'\) payload\.zai_endpoint=apiUrl/);
assert.match(independent, /if\(apiMap\.source==='siliconflow'\) payload\.siliconflow_endpoint=apiUrl/);
assert.doesNotMatch(independent, /payload\.workers_ai_account_id=apiUrl/, 'Profile api-url is not a Workers AI account ID');
assert.match(independent, /ConnectionManagerRequestService/);
assert.match(independent, /requestIndependentConnectionProfileCompletion/);
assert.match(independent, /authorizeRabbitMirrorIndependentServiceRequest/);
assert.match(independent, /service\.sendRequest\(profileId,messages,maxTokens/);
const profileStatusPayload = independent.slice(independent.indexOf('function independentConnectionPayload'), independent.indexOf('function independentDiagnosticBase'));
assert.doesNotMatch(profileStatusPayload, /chatCompletionSettings|oai_settings|selected_proxy/, 'Profile B diagnostics must not inherit active正文 Profile A transport settings');
assert.match(profileStatusPayload, /profile\?\.proxy/);
assert.match(profileStatusPayload, /payload\.reverse_proxy=proxyUrl/);
assert.match(independent, /saved-fallback/);


assert.doesNotMatch(profile, /\[0, 180, 700, 1800\]/);
assert.doesNotMatch(profile, /scheduleEnsures\(\)/);
assert.match(profile, /inline-drawer-toggle/);
assert.match(profile, /rabbitMirrorProfilesReady/);

const startupGuard = sanitizer.match(/function initializeMaintenanceAutoSafeStartupGuard\(\) \{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(startupGuard);
assert.doesNotMatch(startupGuard, /captureMaintenanceAutoSafeBaseline\(\)/, 'startup guard must not rescan the full chat');
assert.doesNotMatch(sanitizer, /captureStartupBaseline/, 'startup must not retain a hidden full-chat maintenance baseline pass');
assert.doesNotMatch(sanitizer, /function captureMaintenanceAutoSafeBaseline/, 'full-chat automatic-repair baseline helper must stay removed');
const autoSafeMessageScheduler = sanitizer.slice(
    sanitizer.indexOf('function scheduleMaintenanceAutoSafeForMessageIndex'),
    sanitizer.indexOf('function installMaintenanceAutoSafeOpenPatrol'),
);
assert.ok(autoSafeMessageScheduler, 'current-message automatic patrol scheduler must exist');
assert.match(autoSafeMessageScheduler, /if \(!isMaintenanceAutoSafeEnabled\(\)\) return false;/, 'automatic patrol must be a no-op until the user explicitly opts in');

assert.match(independent, /const STARTUP_SYNC_IMMEDIATE_MESSAGES=6/);
assert.doesNotMatch(independent, /STARTUP_SYNC_CHUNK_MESSAGES/, 'cold startup must not pump the entire history');
const startupSync = independent.slice(independent.indexOf('function installStartupHistoryLazySync'), independent.indexOf('let queuedIndices='));
assert.doesNotMatch(startupSync, /IntersectionObserver|assistantMessages\(|querySelectorAll/, 'startup history sync must remain bounded and observer-light');
assert.match(independent, /installStartupHistoryLazySync/);
assert.doesNotMatch(independent, /syncAll\('(?:reconfigureRuntime|background-resume|passive-recovery|host:CHAT_CHANGED|host:MESSAGE_SWIPED:fallback|host:render-event:fallback|host:generation-finished:fallback)'/, 'normal lifecycle must never fall back to an all-chat sync');
assert.match(independent, /function resolveHostEventMessageIndex\(/);
assert.match(independent, /scheduleStartupHistorySync\(runtimeConfigSequence\)/);
assert.match(independent, /const hotUpdate=typeof previousCleanup==='function';/);
assert.match(independent, /const FINAL_RENDER_SOURCE_STABLE_WAIT_MS = 520/);
assert.match(independent, /const FINAL_RENDER_POLL_INTERVAL_MS = 120/);
const hostActivity = independent.slice(independent.indexOf('function hostGenerationActivity()'), independent.indexOf('function hostGenerationLooksActive()'));
assert.match(hostActivity, /if\(eventHint\) return \{active:true,strong:true/, 'the strong START-event latch must skip global DOM generation queries on streaming token mutations');
assert.ok(hostActivity.indexOf('if(eventHint)') < hostActivity.indexOf('externalHostGenerationActivity()'), 'the cheap event latch must run before the document-wide fallback selector');
assert.match(independent, /function confirmFinalRenderedGeneration\(index\)/);
assert.match(independent, /function deferredIndependentIntentCompletedAt\(ctx,index\)/, 'cold recovery must expose the captured completion timestamp');
assert.match(independent, /scheduleMessageGeneration\(index,recoveredDelay,true,finalRendered,false,completedAt\)/, 'cold recovery must reuse completedAt instead of restarting the source-stability wait');
const mutationObserver = independent.slice(independent.indexOf('observer=new MutationObserver'), independent.indexOf('observer.observe(chat'));
assert.match(mutationObserver, /if\(hostGenerationLooksActive\(\)\)/, 'all external modes must skip token-by-token synchronization while the host is streaming');
assert.doesNotMatch(mutationObserver, /mode===['"]independent['"]\s*&&\s*hostGenerationLooksActive/, 'follow-external must share the streaming skip gate');
const followExternalize = independent.slice(independent.indexOf('function externalizeFollowMirror'), independent.indexOf('function restoreFollowInline'));
assert.match(followExternalize, /getSanitizedRabbitMirrorFaceProof/, 'follow multiface externalization must wait for every face sanitizer proof');
assert.match(visual, /commitRabbitMirrorFollowBatch\(set\.batchId, chat, scans, set\.owner\)[\s\S]{0,500}FOLLOW_MULTIFACE_COMMITTED_EVENT/, 'successful proof+commit must emit one exact-owner local event');
const followCommitHandlerStart = independent.indexOf('function handleFollowMultifaceCommitted(');
const followCommitHandlerEnd = independent.indexOf('\nfunction installFollowMultifaceCommitListener', followCommitHandlerStart);
const followCommitHandler = independent.slice(followCommitHandlerStart, followCommitHandlerEnd);
assert.ok(followCommitHandlerStart >= 0 && followCommitHandlerEnd > followCommitHandlerStart);
assert.doesNotMatch(followCommitHandler, /hostGenerationLooksActive/, 'proof-backed commit sync must not trust a stale weak generating flag');
let exactSync = null;
const commitSandbox = {
    runtimeMode: () => 'follow-external',
    getContext: () => ({ chat: [{ is_user: false, mes: 'COMMITTED SOURCE' }] }),
    isRabbitMirrorEligibleAssistantMessage: message => message?.is_user === false,
    messageSourceFingerprint: () => 'source-hash',
    queueMessageSync: indices => { exactSync = [...indices]; },
    Number, String, globalThis: {},
    hostGenerationLooksActive: () => true,
};
vm.createContext(commitSandbox);
vm.runInContext(`${followCommitHandler}\nglobalThis.handle=handleFollowMultifaceCommitted;`, commitSandbox);
assert.equal(commitSandbox.globalThis.handle({ detail: { messageIndex: 0, sourceHash: 'source-hash', batchId: 'batch-1' } }), true);
assert.deepEqual(exactSync, [0], 'a committed exact owner must sync even while the host weak flag remains stale true');
assert.match(independent, /state\.finalRenderHash===live\.sourceHash[\s\S]{0,220}state\.finalRenderRevision===live\.revision/, 'fast path must bind to the exact正文 fingerprint and revision');
assert.match(independent, /const finalRenderEvents=\[et\.CHARACTER_MESSAGE_RENDERED\]/);
assert.match(independent, /if\(!confirmFinalRenderedGeneration\(id\)[\s\S]{0,220}scheduleMessageGeneration\(id,FINAL_RENDER_POLL_INTERVAL_MS,true,true\)/, 'final render event may only schedule the guarded generation path');
assert.doesNotMatch(independent.slice(independent.indexOf('for(const event of new Set(finalRenderEvents))'), independent.indexOf('function independentRequestConfigSignature')), /fetchIndependentUrl|requestIndependentCompletion|callIndependentApi/, 'final render event must not dispatch a paid request directly');
const sanitizerInit = sanitizer.slice(sanitizer.indexOf('export async function initOutputSanitizer()'), sanitizer.indexOf('export function destroyOutputSanitizer()'));
assert.match(sanitizerInit, /installMaintenanceRabbitsDeferredInChatDom\(\)/);
assert.doesNotMatch(sanitizerInit, /\n\s*installMaintenanceRabbitsInChatDom\(\);/, 'cold startup must not synchronously scan all historical mirrors');

const index = read('index.js');
// multiface-step1 起 ui.js 进入本阶段 cache cohort：不再断言旧的 1.4.30.25 键，
// 改为断言 cohort 完整性（详见 cacheBustClosure.test.mjs）。
assert.match(index, /\.\/src\/ui\.js\?rmv=1\.5\.8-visualstream8-boundary1/, '1.5 UI parent must use its dedicated cache key');
assert.doesNotMatch(index, /\.\/src\/ui\.js\?rmv=1\.4\.30\.2[0-9]/, 'stale 1.4.30.x UI cache key must not survive');
assert.match(index, /\.\/src\/checkedSelectorRepair\.js\?rmv=1\.4\.30\.26/, 'formal checked-selector repair must be present in the test baseline');
assert.match(index, /\.\/src\/maintenanceRecommendationHotfix\.js\?rmv=1\.4\.6/, 'formal maintenance recommendation must be present in the test baseline');
assert.equal(manifest.js, 'index.js?rmv=1.5.8-visualstream8-boundary1');
assert.equal(manifest.version, '1.5.8');

console.log('performance lifecycle tests passed');
