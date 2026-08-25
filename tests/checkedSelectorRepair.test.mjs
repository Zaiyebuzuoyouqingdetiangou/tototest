import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(rootDir, 'src', 'checkedSelectorRepair.js'), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const mod = await import(moduleUrl);

const target = {};
const root = {
    getAttribute(name) { return name === 'data-rabbit-mirror-css-scope' ? 'scope-a' : ''; },
    contains(node) { return node === target || node === this; },
    querySelectorAll(selector) {
        if (selector.includes('.rm-body .rc-2')) return [target];
        return [];
    },
};
const broken = '[data-rabbit-mirror-css-scope="scope-a"] [id="step-2"]:checked ~ .rm-body.rc-2';
const fixed = '[data-rabbit-mirror-css-scope="scope-a"] [id="step-2"]:checked ~ .rm-body .rc-2';
assert.equal(mod.findSafeCheckedDescendantSelectorRepair(root, broken), fixed);
assert.equal(mod.findSafeCheckedDescendantSelectorRepair(root, fixed), null, 'already-valid selector must not be rewritten');
assert.equal(mod.findSafeCheckedDescendantSelectorRepair(root, broken.replace('scope-a','scope-b')), null, 'wrong mirror scope must be rejected');

const validCompoundRoot = {
    ...root,
    querySelectorAll(selector) {
        if (selector.includes('.rm-body.rc-2')) return [target];
        return [];
    },
};
assert.equal(mod.findSafeCheckedDescendantSelectorRepair(validCompoundRoot, broken), null, 'valid compound selectors must not be split');
console.log('checkedSelectorRepair tests passed');
