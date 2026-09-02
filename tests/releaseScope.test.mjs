import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

// Captured from the untouched uploaded baseline, not current-source self hashes.
// Only cache queries and the explicitly named 1.5.5/1.5.6/1.5.7/1.5.8 release constants may
// differ in protected files. No whitespace/comment/logic normalization is used.
const baseline = JSON.parse(fs.readFileSync(new URL('./protected-baseline-hashes.json', import.meta.url), 'utf8'));
const normalize = text => text.replace(/\?rmv=[a-z\d._-]+/gi, '').replace(/(const (?:RABBIT_MIRROR_RUNTIME_VERSION|GOLDEN_MERGE_VERSION|RUNTIME_VERSION|RELEASE_VERSION|VERSION)\s*=\s*')1\.5\.[5678]'/g, "$1<release>'");
assert.equal(baseline.allowedFunctional.length, 17);
assert.equal(baseline.entries.length, 36, 'cover every unchanged production module and mother-library source after the explicitly authorized security and token accounting fixes joined this release');
assert.equal(baseline.entries.some(item => baseline.allowedFunctional.includes(item.file)), false, 'authorized multiface files must be explicit exclusions, never self-hashed current-source approvals');
for (const item of baseline.entries) {
    const source = fs.readFileSync(new URL(`../${item.file}`, import.meta.url), 'utf8');
    const digest = createHash('sha256').update(normalize(source)).digest('hex');
    assert.equal(digest, item.normalizedSha256, `${item.file}: unrelated behavior must remain byte-identical after exact cache/release removal`);
}
console.log(`releaseScope passed: ${baseline.entries.length} protected files match uploaded source after only cache/release-identity removal`);
