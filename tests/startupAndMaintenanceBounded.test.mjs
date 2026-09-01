import assert from 'node:assert/strict';
import fs from 'node:fs';

const independent = fs.readFileSync(new URL('../src/independentApi.js', import.meta.url), 'utf8');
const sanitizer = fs.readFileSync(new URL('../src/outputSanitizer.js', import.meta.url), 'utf8');
const touch = fs.readFileSync(new URL('../src/touchTheater.js', import.meta.url), 'utf8');
const external = fs.readFileSync(new URL('../src/externalDiagnostics.js', import.meta.url), 'utf8');
const prompt = fs.readFileSync(new URL('../src/promptBuilder.js', import.meta.url), 'utf8');
const visual = fs.readFileSync(new URL('../src/visualScanner.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');

const startup = independent.slice(independent.indexOf('function installStartupHistoryLazySync'), independent.indexOf('let queuedIndices='));
assert.doesNotMatch(startup, /assistantMessages\(|IntersectionObserver|querySelectorAll/, 'cold history restore must not enumerate/register all history');
assert.match(startup, /recentAssistantMessages\(ctx,STARTUP_SYNC_IMMEDIATE_MESSAGES\)/);
assert.doesNotMatch(independent, /buildHistoricalColdDetails/, 'missing cold-cache helper must not survive');
assert.match(independent, /function independentStoredHtmlLightRestorable\(/, 'cold cache helper must be defined');

const install = sanitizer.slice(sanitizer.indexOf('function installMaintenanceRabbitsDeferredInChatDom'), sanitizer.indexOf('export function refreshMaintenanceRabbits'));
assert.doesNotMatch(install, /querySelectorAll\?\.\('\.mes|IntersectionObserver|historical/, 'maintenance startup must stay bounded');
assert.match(install, /recent\.length < 6/);
const followups = sanitizer.slice(sanitizer.indexOf('function scheduleMaintenanceScopedFollowups'), sanitizer.indexOf('function maintenanceRepairPlanLabel'));
assert.doesNotMatch(followups, /\[80, 350, 900, 1800\]|repairMaintenanceMessageSource|runMaintenanceLegacyRescueLibrary/);
assert.match(followups, /replayFollowMaintenanceRepair/);
assert.match(sanitizer, /const targets = \[independent \? exactIndependentMaintenanceRoot\(root\) : root\]/, 'manual repair must stay on the clicked live mirror');
assert.match(sanitizer, /MAINTENANCE_MIRROR_IDENTITY_ATTR/);
assert.match(sanitizer, /followMaintenanceMirrorIdentity\(root\)/, 'follow repair cache keys must identify the exact mirror, not only its message');
assert.match(sanitizer, /function maintenanceRepairRootBudget\(/);
assert.match(sanitizer, /rejectOversizedMaintenanceRepair\(root, button, mode === 'interaction'/, 'interaction repair must fail closed before heavy inspection');
assert.match(sanitizer, /validateRabbitMirrorMarkupLexicalBudget\(html\)[\s\S]{0,120}template\.innerHTML = html/, 'maintenance fragment parsing needs a lexical preflight');
const sanitizeEntry = sanitizer.slice(sanitizer.indexOf('export function sanitizeRabbitMirrorUntrustedTemplate'), sanitizer.indexOf('function sanitizeMaintenanceMirrorTemplate'));
assert.match(sanitizer, /export function validateRabbitMirrorTemplateStructuralBudget/);
assert.ok(sanitizeEntry.indexOf('validateRabbitMirrorTemplateStructuralBudget(template)') < sanitizeEntry.indexOf('querySelectorAll('), 'structural budget must run before broad sanitizer selector walks');

const normalize = touch.slice(touch.indexOf('function normalizeExistingTouchTheaters'), touch.indexOf('const TOUCH_RUNTIME_MUTATION_SELECTOR'));
assert.doesNotMatch(normalize, /document\.querySelectorAll\(TOUCH_THEATER_SELECTOR\)/);
assert.match(normalize, /examined < 6/);

assert.match(external, /CHAT_SAMPLE_DELAYS = \[0, 500, 2000\]/);
assert.match(external, /if \(!hasNativeLongTask\)/, 'stall interval is fallback-only');
assert.doesNotMatch(external, /target\?\.textContent|target\.textContent/);
assert.match(prompt, /String\(generationType \|\| 'normal'\) !== 'independent' &&[\s\S]{0,120}hasSharedMemoryTheme/, 'memory setting remains but independent generation cannot read plugin memory');

assert.doesNotMatch(visual.slice(visual.indexOf('const captureEvents'), visual.indexOf('const generationEvents')), /MESSAGE_UPDATED/);
const outputEvents = sanitizer.slice(sanitizer.indexOf('const currentMessageEvents'), sanitizer.indexOf('const generationFinishedEvents'));
assert.doesNotMatch(outputEvents, /MESSAGE_UPDATED/);
const queuedSync = independent.slice(independent.indexOf('function queueMessageSync'), independent.indexOf('function nodeMessageIndex'));
assert.doesNotMatch(queuedSync, /withExternalHostSyncIndex/, 'token/message scoped sync must not enumerate every external host');
assert.match(index, /requestIdleCallback\(runDeferredBoot\)/);
assert.doesNotMatch(index, /requestIdleCallback\(runDeferredBoot,\s*\{\s*timeout/);
assert.match(index, /if \(!deferredRuntimeModules\) return Promise\.resolve\(null\)/, 'ordinary content clicks stay native until heavy runtime is already ready');

const migration = independent.slice(independent.indexOf('function migratePersistedInteractionStateRecords'), independent.indexOf('function sanitizeIndependentReadyFragment'));
assert.ok(migration.indexOf('independentStoredHtmlLightRestorable(record.html)') < migration.search(/normalizeSavedInteractionRecord\(safeRecord,\s*slot\)/), 'old cache must be gated before template parsing');

console.log('bounded startup, touch, maintenance follow-up and opt-in diagnostic invariants passed');
