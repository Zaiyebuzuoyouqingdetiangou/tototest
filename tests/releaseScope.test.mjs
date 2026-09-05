import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

// Captured from the untouched uploaded baseline, not current-source self hashes.
// Only cache queries and release identity constants may differ in protected files.
// The generated presentation/theme indexes and their mother-library data are explicit build inputs and are
// guarded by libraryDataIntegrity instead of current-source self hashes.
const baseline = JSON.parse(fs.readFileSync(new URL('./protected-baseline-hashes.json', import.meta.url), 'utf8'));
const normalize = text => text.replace(/\?rmv=[a-z\d._-]+/gi, '').replace(/(const (?:RABBIT_MIRROR_RUNTIME_VERSION|GOLDEN_MERGE_VERSION|RUNTIME_VERSION|RELEASE_VERSION|VERSION)\s*=\s*')1\.5\.(?:[5-9]|1[0-9])'/g, "$1<release>'");
assert.equal(baseline.allowedFunctional.length, 20);
assert.equal(baseline.entries.length, 33, 'cover every unchanged production module and mother-library source after the explicitly authorized security and token accounting fixes joined this release');
assert.equal(baseline.entries.some(item => baseline.allowedFunctional.includes(item.file)), false, 'authorized functional files must be explicit exclusions, never self-hashed current-source approvals');
for (const item of baseline.entries) {
    const source = fs.readFileSync(new URL(`../${item.file}`, import.meta.url), 'utf8');
    const digest = createHash('sha256').update(normalize(source)).digest('hex');
    assert.equal(digest, item.normalizedSha256, `${item.file}: unrelated behavior must remain byte-identical after exact cache/release removal`);
}
console.log(`releaseScope passed: ${baseline.entries.length} protected files match uploaded source after only cache/release-identity removal`);
