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

assert.doesNotMatch(profile, /\[0, 180, 700, 1800\]/);
assert.doesNotMatch(profile, /scheduleEnsures\(\)/);
assert.match(profile, /inline-drawer-toggle/);
assert.match(profile, /rabbitMirrorProfilesReady/);

const startupGuard = sanitizer.match(/function initializeMaintenanceAutoSafeStartupGuard\(\) \{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(startupGuard);
assert.doesNotMatch(startupGuard, /captureMaintenanceAutoSafeBaseline\(\)/, 'startup guard must not rescan the full chat');
assert.match(sanitizer, /captureStartupBaseline[\s\S]*maintenanceAutoSafeSignature\(root\)/);
assert.equal(manifest.version, '1.4.30.24');

console.log('performance lifecycle tests passed');
