import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const values = new Map();
globalThis.localStorage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
};

class FakeElement {
    constructor(attributes = {}, children = []) {
        this.attributes = new Map(Object.entries(attributes));
        this.children = children;
        this.dataset = {};
    }
    hasAttribute(name) { return this.attributes.has(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    matches(selector) {
        return String(selector).split(',').some(part => {
            const match = part.trim().match(/^\[([^\]]+)\]$/);
            return !!match && this.hasAttribute(match[1]);
        });
    }
    querySelectorAll(selector) {
        const result = [];
        const visit = node => {
            for (const child of node.children || []) {
                if (child.matches(selector)) result.push(child);
                visit(child);
            }
        };
        visit(this);
        return result;
    }
}

const { rearmRabbitMirrorSerializedInteractionRoot } = await import('../src/outputSanitizer.js');
const child = new FakeElement({
    'data-rabbit-mirror-change-pseudo-rescue': 'true',
    'data-rabbit-mirror-direct-id-click-rescue': 'true',
    'data-rabbit-mirror-interaction-scoped': 'true',
});
const root = new FakeElement({ 'data-rabbit-mirror-raw-script-timeline-count': '1' }, [child]);
root.dataset.rabbitMirrorTargetFallback = 'true';
root.dataset.rabbitMirrorRawHoverFallback = 'true';

assert.equal(rearmRabbitMirrorSerializedInteractionRoot(root), 2);
assert.equal(child.hasAttribute('data-rabbit-mirror-change-pseudo-rescue'), false);
assert.equal(child.hasAttribute('data-rabbit-mirror-direct-id-click-rescue'), false);
assert.equal(child.hasAttribute('data-rabbit-mirror-interaction-scoped'), true);
assert.equal(root.hasAttribute('data-rabbit-mirror-raw-script-timeline-count'), false);
assert.equal(root.dataset.rabbitMirrorTargetFallback, undefined);

// Guard the exact follow-main regression: the live branch may clone a rollback
// snapshot, but it must not replace the live details before repair.
const source = await readFile(new URL('../src/outputSanitizer.js', import.meta.url), 'utf8');
const resetRestoreStart = source.indexOf('function restoreRabbitMirrorInteractionResetSnapshot');
const resetRestoreEnd = source.indexOf('\nfunction ', resetRestoreStart + 1);
const resetRestoreSource = source.slice(resetRestoreStart, resetRestoreEnd > resetRestoreStart ? resetRestoreEnd : undefined);
assert.match(
    resetRestoreSource,
    /rearmRabbitMirrorSerializedInteractionRoot\(restoredDetails\);[\s\S]*details\.replaceWith\(restoredDetails\);/,
    'interaction reset must clear serialized listener markers before replacing the live node',
);

const captureStart = source.indexOf('function captureMaintenancePreRepairSnapshot');
const restoreStart = source.indexOf('function restoreMaintenancePreRepairSnapshot', captureStart);
const captureBlock = source.slice(captureStart, restoreStart);
const followBranch = captureBlock.slice(captureBlock.indexOf('// The follow-main-API mirror'));
assert.ok(followBranch.includes('const snapshotNode = originalNode.cloneNode(true)'));
assert.ok(!followBranch.includes('originalNode.replaceWith'));
assert.ok(!followBranch.includes('details.replaceWith'));

delete globalThis.localStorage;
console.log('interactionRearm tests passed');
