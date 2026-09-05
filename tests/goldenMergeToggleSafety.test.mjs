import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = fs.readFileSync(path.join(root, 'index.js'), 'utf8');

assert.match(source, /GOLDEN_MERGE_VERSION\s*=\s*'1\.5\.18'/);
assert.doesNotMatch(source, /addEventListener\(['"]toggle['"]/, 'bootstrap must never install a global toggle loader');
assert.doesNotMatch(source, /dispatchEvent\(new Event\(['"]toggle['"]\)\)/, 'bootstrap must never synthesize toggle to replay lazy loading');
assert.doesNotMatch(source, /lazyToggleHandler/, 'recursive toggle loader state must be absent');
assert.match(source, /event\?\.isTrusted === false/, 'synthetic user-intent events must not activate optional loaders');
assert.match(source, /addEventListener\(['"]pointerover['"], lazyPointerHandler, true\)/);
assert.match(source, /addEventListener\(['"]pointerdown['"], lazyPointerHandler, true\)/);
assert.match(source, /loadMirrorVisualCompat\(\)/);
assert.match(source, /loadMaintenanceCompat\(\)/);

console.log('GoldenMerge toggle recursion safety checks passed.');
