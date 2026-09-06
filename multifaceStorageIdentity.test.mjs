import assert from 'node:assert/strict';

// Real production storage with failures injected only at the localStorage boundary.
// Run with the repository host loader; no DOM, network or model is involved.
const values = new Map();
const operations = [];
const get = key => {
    operations.push(['get', key]);
    return values.has(key) ? values.get(key) : null;
};
const set = (key, value) => {
    operations.push(['set', key]);
    values.set(key, String(value));
};
const remove = key => {
    operations.push(['remove', key]);
    values.delete(key);
};
globalThis.localStorage = { getItem: get, setItem: set, removeItem: remove };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.dispatchEvent = () => true;
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };
const storage = await import('../src/storage.js');
const settingsModule = await import('../src/settings.js');
const { extension_settings } = await import('../../../../extensions.js');
const HISTORY = 'rabbit_mirror_theater:last_combo:v11';
const SINGLE = 'rabbit_mirror_theater:pending_combo:v11';
const BATCH = 'rabbit_mirror_theater:pending_batch:v1';
const combo = name => ({ themeIds: [`T.${name}`], formatIds: [`F.${name}`], themeGroups: ['A'], formatGroups: ['G'], samplingMode: 'classic' });
const identity = (overrides = {}) => ({
    chatKey: 'chat:storage-test', generationScopeKey: 'generation:one', mesid: 7, swipeId: 1,
    sourceHash: 'final-body-hash', settingsKey: '{"mode":"all"}', ...overrides,
});
const expectedFor = pending => ({ batchId: pending.batchId, identity: pending.identity });
const commit = (index, expected) => storage.commitPendingBatchFace(index, `visual:${index}`, '', [], null, null, expected);
const history = () => storage.getComboHistory(20);
const snapshot = () => [...values.entries()];
const writes = () => operations.filter(([kind]) => kind !== 'get');
let groups = 0;
function check(name, fn) {
    values.clear();
    operations.length = 0;
    Object.assign(globalThis.localStorage, { getItem: get, setItem: set, removeItem: remove });
    try { fn(); groups += 1; }
    catch (error) { error.message = `${name}: ${error.message}`; throw error; }
    finally { Object.assign(globalThis.localStorage, { getItem: get, setItem: set, removeItem: remove }); }
}

check('strict numeric face count and unchanged visual setting', () => {
    const cases = [
        [1, 1], [2, 2], [3, 3], ['2', 1], ['3', 1], [2.7, 1], [3.1, 1],
        [null, 1], [undefined, 1], [true, 1], [false, 1], [NaN, 1], [Infinity, 1],
        [0, 1], [-1, 1], [4, 4], [5, 5], [6, 1], [[2], 1], [{ valueOf: () => 2 }, 1],
    ];
    for (const [value, expected] of cases) {
        const liveSettings = settingsModule.getSettings();
        settingsModule.updateSettings({ rabbitMirrorFaceCount: value, enhancedVisualDrawing: true });
        assert.equal(liveSettings.rabbitMirrorFaceCount, expected, 'update must normalize before scheduling save');
        const serialized = JSON.stringify(liveSettings);
        assert.equal(JSON.parse(serialized).rabbitMirrorFaceCount, expected, 'saved shape is already strict');
        extension_settings[settingsModule.MODULE_NAME] = JSON.parse(serialized);
        assert.equal(settingsModule.getSettings().rabbitMirrorFaceCount, expected);
        assert.equal(settingsModule.getSettings().enhancedVisualDrawing, true, 'C must preserve B setting');
    }
    extension_settings[settingsModule.MODULE_NAME].rabbitMirrorFaceCount = '3';
    assert.equal(settingsModule.getSettings().rabbitMirrorFaceCount, 1, 'invalid legacy serialized value migrates to single');
    settingsModule.resetSettings();
    assert.equal(settingsModule.getSettings().rabbitMirrorFaceCount, 1, 'reset preserves the single default');
});

check('identity stored exactly and full expected required for new batch commit', () => {
    const owner = identity();
    const batchId = storage.setPendingComboBatch([combo('0'), combo('1')], owner);
    assert.ok(batchId);
    const pending = storage.readPendingComboBatch();
    assert.deepEqual(pending.identity, owner);
    const before = snapshot();
    operations.length = 0;
    assert.equal(commit(0), false);
    assert.equal(commit(0, { batchId }), false);
    assert.equal(commit(0, { identity: owner }), false);
    assert.equal(commit(0, { batchId: `${batchId}:old`, identity: owner }), false);
    assert.deepEqual(snapshot(), before);
    assert.deepEqual(writes(), []);
    assert.equal(commit(0, expectedFor(pending)), true);
    assert.equal(history()[0].batchId, batchId);
});

for (const [field, value] of [
    ['chatKey', 'chat:other'], ['generationScopeKey', 'generation:two'], ['mesid', 8],
    ['swipeId', 2], ['sourceHash', 'different-final-body'], ['settingsKey', '{"mode":"sfw"}'],
]) {
    check(`different ${field} cannot read, commit or clear`, () => {
        storage.setPendingComboBatch([combo('0'), combo('1')], identity());
        const pending = storage.readPendingComboBatch();
        const wrong = { batchId: pending.batchId, identity: { ...pending.identity, [field]: value } };
        const before = snapshot();
        operations.length = 0;
        assert.equal(storage.readPendingComboBatch(wrong), null);
        assert.equal(commit(0, wrong), false);
        assert.equal(storage.clearPendingComboBatch(wrong), false);
        assert.deepEqual(snapshot(), before);
        assert.deepEqual(writes(), []);
    });
}

check('invalid identity cannot disturb either pending slot', () => {
    storage.setPendingComboBatch([combo('old0'), combo('old1')], identity());
    storage.setPendingCombo(combo('single'));
    const before = snapshot();
    for (const bad of [
        {}, identity({ chatKey: '' }), identity({ generationScopeKey: 'x'.repeat(1025) }),
        identity({ sourceHash: '' }), identity({ sourceHash: 'x'.repeat(513) }),
        identity({ settingsKey: 'x'.repeat(8193) }), identity({ mesid: '7' }),
        identity({ mesid: -1 }), identity({ swipeId: 1.2 }), identity({ swipeId: NaN }),
    ]) {
        operations.length = 0;
        assert.equal(storage.setPendingComboBatch([combo('new0'), combo('new1')], bad), '');
        assert.deepEqual(snapshot(), before);
        assert.deepEqual(writes(), []);
    }
});

check('single and empty legacy operations do not clear a foreign batch', () => {
    storage.setPendingComboBatch([combo('other0'), combo('other1')], identity({ chatKey: 'chat:other' }));
    const batchRaw = values.get(BATCH);
    storage.setPendingComboBatch([combo('single')]);
    assert.equal(values.get(BATCH), batchRaw);
    assert.ok(values.has(SINGLE));
    storage.setPendingComboBatch([]);
    assert.equal(values.get(BATCH), batchRaw);
    storage.clearPendingCombo();
    assert.equal(values.get(BATCH), batchRaw);
});

check('invalid face counts, holes and nulls never silently change a plan', () => {
    storage.setPendingComboBatch([combo('old0'), combo('old1')], identity());
    storage.setPendingCombo(combo('single'));
    const before = snapshot();
    for (const bad of [null, {}, [], [combo('0'), null, combo('1')], [combo('0'), , combo('1')],
        [combo('0'), combo('1'), combo('2'), combo('3'), combo('4'), combo('5')], [combo('0'), 'invalid'],
        [combo('0'), { ...combo('1'), themeIds: ['T.same', 'T.same'] }]]) {
        operations.length = 0;
        assert.equal(storage.setPendingComboBatch(bad, identity()), '');
        assert.deepEqual(snapshot(), before);
        assert.deepEqual(writes(), []);
    }
});

check('sparse ID fields cannot serialize into invalid null IDs or clear pending', () => {
    storage.setPendingComboBatch([combo('old0'), combo('old1')], identity());
    storage.setPendingCombo(combo('single'));
    const before = snapshot();
    for (const field of ['themeIds', 'formatIds']) {
        for (const ids of [new Array(1), ['valid', , 'another']]) {
            operations.length = 0;
            assert.equal(storage.setPendingComboBatch([combo('0'), { ...combo('1'), [field]: ids }], identity()), '');
            assert.deepEqual(snapshot(), before);
            assert.deepEqual(writes(), []);
        }
    }
});

check('batch transition verifies its full payload before removing original single', () => {
    storage.setPendingCombo(combo('original'));
    const original = values.get(SINGLE);
    let sawVerifiedBatch = false;
    globalThis.localStorage.getItem = key => {
        const raw = get(key);
        if (key === BATCH && raw?.includes('"identity"')) sawVerifiedBatch = true;
        return raw;
    };
    globalThis.localStorage.removeItem = key => {
        if (key === SINGLE) {
            assert.equal(values.get(SINGLE), original);
            assert.equal(sawVerifiedBatch, true);
        }
        remove(key);
    };
    assert.ok(storage.setPendingComboBatch([combo('0'), combo('1')], identity()));
    assert.equal(values.has(SINGLE), false);
});

for (const mode of ['silent', 'truncated', 'throw', 'truncated-then-throw']) {
    check(`initial ${mode} write restores old batch and preserves original single`, () => {
        storage.setPendingComboBatch([combo('old0'), combo('old1')], identity({ generationScopeKey: 'previous' }));
        storage.setPendingCombo(combo('original'));
        const original = snapshot();
        let fault = true;
        globalThis.localStorage.setItem = (key, value) => {
            if (key === BATCH && fault) {
                fault = false;
                if (mode.startsWith('truncated')) set(key, String(value).slice(0, Math.floor(String(value).length / 2)));
                if (mode.includes('throw')) throw new Error('injected pending write failure');
                return;
            }
            set(key, value);
        };
        assert.equal(storage.setPendingComboBatch([combo('new0'), combo('new1')], identity()), '');
        assert.deepEqual(snapshot(), original);
    });
}

check('truncated initial batch without previous slot is removed', () => {
    storage.setPendingCombo(combo('original'));
    const original = values.get(SINGLE);
    globalThis.localStorage.setItem = (key, value) => {
        set(key, key === BATCH ? String(value).slice(0, Math.floor(String(value).length / 2)) : value);
    };
    assert.equal(storage.setPendingComboBatch([combo('0'), combo('1')], identity()), '');
    assert.equal(values.has(BATCH), false);
    assert.equal(values.get(SINGLE), original);
});

check('read-back exception does not strand the new batch or clear single', () => {
    storage.setPendingCombo(combo('original'));
    const original = values.get(SINGLE);
    let armed = false;
    globalThis.localStorage.setItem = (key, value) => { set(key, value); if (key === BATCH) armed = true; };
    globalThis.localStorage.getItem = key => {
        if (key === BATCH && armed) { armed = false; throw new Error('injected read failure'); }
        return get(key);
    };
    assert.equal(storage.setPendingComboBatch([combo('0'), combo('1')], identity()), '');
    assert.equal(values.has(BATCH), false);
    assert.equal(values.get(SINGLE), original);
});

for (const mode of ['silent-remove', 'remove-then-throw']) {
    check(`${mode} of single rolls back the new batch`, () => {
        storage.setPendingCombo(combo('original'));
        const original = values.get(SINGLE);
        globalThis.localStorage.removeItem = key => {
            if (key === SINGLE) {
                if (mode === 'remove-then-throw') { remove(key); throw new Error('injected removal failure'); }
                return;
            }
            remove(key);
        };
        assert.equal(storage.setPendingComboBatch([combo('0'), combo('1')], identity()), '');
        assert.equal(values.has(BATCH), false);
        assert.equal(values.get(SINGLE), original);
    });
}

check('another batch discovered after a write is not deleted by rollback', () => {
    storage.setPendingComboBatch([combo('foreign0'), combo('foreign1')], identity({ chatKey: 'chat:foreign' }));
    const foreign = values.get(BATCH);
    values.delete(BATCH);
    storage.setPendingCombo(combo('original'));
    const original = values.get(SINGLE);
    globalThis.localStorage.setItem = (key, value) => set(key, key === BATCH ? foreign : value);
    assert.equal(storage.setPendingComboBatch([combo('0'), combo('1')], identity()), '');
    assert.equal(values.get(BATCH), foreign);
    assert.equal(values.get(SINGLE), original);
});

check('newer single discovered during transition is not deleted', () => {
    storage.setPendingCombo(combo('original'));
    const newer = JSON.stringify({ themeIds: ['T.newer'], formatIds: ['F.newer'] });
    globalThis.localStorage.setItem = (key, value) => {
        set(key, value);
        if (key === BATCH) set(SINGLE, newer);
    };
    assert.equal(storage.setPendingComboBatch([combo('0'), combo('1')], identity()), '');
    assert.equal(values.has(BATCH), false);
    assert.equal(values.get(SINGLE), newer);
});

for (const mode of ['silent', 'truncated', 'throw', 'truncated-then-throw']) {
    check(`history ${mode} failure cannot commit a face or destroy previous history`, () => {
        storage.setPendingCombo(combo('earlier-success'));
        storage.commitPendingCombo('earlier');
        const previousHistory = values.get(HISTORY);
        storage.setPendingComboBatch([combo('0'), combo('1')], identity());
        const pending = storage.readPendingComboBatch();
        const originalBatch = values.get(BATCH);
        let fault = true;
        globalThis.localStorage.setItem = (key, value) => {
            if (key === HISTORY && fault) {
                fault = false;
                if (mode.startsWith('truncated')) set(key, String(value).slice(0, Math.floor(String(value).length / 2)));
                if (mode.includes('throw')) throw new Error('injected history write failure');
                return;
            }
            set(key, value);
        };
        assert.equal(commit(0, expectedFor(pending)), false);
        assert.equal(values.get(HISTORY), previousHistory);
        assert.equal(values.get(BATCH), originalBatch);
        assert.equal(commit(0, expectedFor(pending)), true, 'recovery retries the same face, not another request');
        assert.equal(history().length, 2);
        assert.equal(history().filter(item => item.batchId === pending.batchId && item.faceIndex === 0).length, 1);
    });
}

for (const failureRead of [1, 2, 3]) {
    check(`history read ${failureRead} failure preserves earlier successes and pending face`, () => {
        storage.setPendingCombo(combo('earlier-success'));
        storage.commitPendingCombo('earlier');
        const previousHistory = values.get(HISTORY);
        storage.setPendingComboBatch([combo('0'), combo('1')], identity());
        const pending = storage.readPendingComboBatch();
        const originalBatch = values.get(BATCH);
        let historyReads = 0;
        globalThis.localStorage.getItem = key => {
            if (key === HISTORY && ++historyReads === failureRead) throw new Error('injected history read failure');
            return get(key);
        };
        operations.length = 0;
        assert.equal(commit(0, expectedFor(pending)), false);
        assert.equal(values.get(HISTORY), previousHistory);
        assert.equal(values.get(BATCH), originalBatch);
        if (failureRead < 3) assert.deepEqual(writes(), [], 'a failed pre-write read must not mutate either slot');
        globalThis.localStorage.getItem = get;
        assert.equal(commit(0, expectedFor(pending)), true);
        assert.equal(history().length, 2);
        assert.equal(history().filter(item => item.batchId === pending.batchId && item.faceIndex === 0).length, 1);
    });
}

check('malformed history snapshot never becomes an empty successful batch history', () => {
    storage.setPendingComboBatch([combo('0'), combo('1')], identity());
    const pending = storage.readPendingComboBatch();
    const originalBatch = values.get(BATCH);
    for (const raw of ['', '[{"truncated":', 'null', 'false', '7', '"wrong-shape"']) {
        values.set(HISTORY, raw);
        operations.length = 0;
        assert.equal(commit(0, expectedFor(pending)), false);
        assert.equal(values.get(HISTORY), raw);
        assert.equal(values.get(BATCH), originalBatch);
        assert.deepEqual(writes(), []);
    }
});

check('batch strict history parser preserves the legacy object history entry', () => {
    const earlier = { ...combo('legacy-success'), signature: 'legacy', ts: Date.now() };
    values.set(HISTORY, JSON.stringify(earlier));
    storage.setPendingComboBatch([combo('0'), combo('1')], identity());
    const pending = storage.readPendingComboBatch();
    assert.equal(commit(0, expectedFor(pending)), true);
    assert.equal(history().length, 2);
    assert.deepEqual(history()[0], earlier);
    assert.equal(history()[1].batchId, pending.batchId);
});

check('unrelated history value discovered after write is not overwritten by rollback', () => {
    storage.setPendingComboBatch([combo('0'), combo('1')], identity());
    const pending = storage.readPendingComboBatch();
    const foreign = JSON.stringify([{ ...combo('foreign-success'), ts: Date.now() }]);
    globalThis.localStorage.setItem = (key, value) => set(key, key === HISTORY ? foreign : value);
    assert.equal(commit(0, expectedFor(pending)), false);
    assert.equal(values.get(HISTORY), foreign);
    assert.equal(storage.readPendingComboBatch().faces[0].committed, undefined);
});

for (const mode of ['silent', 'truncated', 'throw']) {
    check(`marker ${mode} failure keeps successful history authoritative`, () => {
        storage.setPendingComboBatch([combo('0'), combo('1')], identity());
        const pending = storage.readPendingComboBatch();
        const guard = expectedFor(pending);
        const original = values.get(BATCH);
        let fault = true;
        globalThis.localStorage.setItem = (key, value) => {
            if (key === BATCH && fault) {
                fault = false;
                if (mode === 'truncated') set(key, String(value).slice(0, Math.floor(String(value).length / 2)));
                if (mode === 'throw') throw new Error('injected marker failure');
                return;
            }
            set(key, value);
        };
        assert.equal(commit(0, guard), true);
        assert.equal(history().length, 1);
        assert.equal(values.get(BATCH), original);
        assert.equal(commit(0, guard), true, 'lost marker can be recovered from the history key');
        assert.equal(history().length, 1);
        assert.equal(commit(1, guard), true);
        assert.equal(history().length, 2);
        assert.equal(values.has(BATCH), false);
    });
}

check('face index order is stable even when persisted array and commit order differ', () => {
    storage.setPendingComboBatch([combo('0'), combo('1'), combo('2')], identity());
    const pending = storage.readPendingComboBatch();
    const guard = expectedFor(pending);
    pending.faces.reverse();
    values.set(BATCH, JSON.stringify(pending));
    assert.deepEqual(storage.readPendingComboBatch(guard).faces.map(face => face.faceIndex), [0, 1, 2]);
    assert.equal(commit(2, guard), true);
    assert.equal(commit(0, guard), true);
    assert.equal(commit(2, guard), false);
    assert.equal(commit(1, guard), true);
    assert.deepEqual(history().map(face => face.faceIndex), [2, 0, 1], 'global history retains existing actual commit order');
    assert.equal(new Set(history().map(face => `${face.batchId}:${face.faceIndex}`)).size, 3);
});

check('strict face index rejects coercion without writes', () => {
    storage.setPendingComboBatch([combo('0'), combo('1')], identity());
    const guard = expectedFor(storage.readPendingComboBatch());
    const before = snapshot();
    operations.length = 0;
    for (const index of ['0', 0.5, -1, 3, NaN, Infinity, null]) assert.equal(commit(index, guard), false);
    assert.deepEqual(snapshot(), before);
    assert.deepEqual(writes(), []);
});

for (const mutate of [
    batch => { batch.pendingSession = ''; },
    batch => { batch.pendingSession = 'previous-page'; },
    batch => { batch.pendingTs = Date.now() - 13 * 60 * 60 * 1000; },
    batch => { batch.pendingTs = Date.now() + 60 * 1000; },
    batch => { batch.faces[1].faceIndex = 0; },
    batch => { batch.faces[1].faceIndex = '1'; },
    batch => { batch.faces[1].batchId = 'other-batch'; },
    batch => { batch.faces[1].formatIds = ['F.modified-without-a-new-plan']; },
    batch => { batch.faces.push({ ...batch.faces[0], faceIndex: 2 }, { ...batch.faces[0], faceIndex: 3 },
        { ...batch.faces[0], faceIndex: 4 }, { ...batch.faces[0], faceIndex: 5 }); },
]) {
    check('damaged or stale batch is rejected without history', () => {
        storage.setPendingComboBatch([combo('0'), combo('1')], identity());
        const pending = storage.readPendingComboBatch();
        const guard = expectedFor(pending);
        mutate(pending);
        values.set(BATCH, JSON.stringify(pending));
        const damagedRaw = values.get(BATCH);
        operations.length = 0;
        assert.equal(storage.readPendingComboBatch(guard), null);
        assert.equal(commit(0, guard), false);
        assert.deepEqual(writes(), [], 'guarded cache reads and rejected commits are always read-only');
        assert.equal(values.get(BATCH), damagedRaw, 'guarded reads do not perform cleanup');
        assert.equal(history().length, 0);
        assert.equal(storage.readPendingComboBatch(), null);
        assert.equal(values.has(BATCH), false, 'explicit diagnostic read may clean the damaged slot');
    });
}

check('foreign expired record is not cleared by guarded read', () => {
    storage.setPendingComboBatch([combo('0'), combo('1')], identity());
    const pending = storage.readPendingComboBatch();
    pending.pendingTs = Date.now() - 13 * 60 * 60 * 1000;
    values.set(BATCH, JSON.stringify(pending));
    const before = snapshot();
    operations.length = 0;
    assert.equal(storage.readPendingComboBatch({ batchId: pending.batchId, identity: identity({ chatKey: 'chat:different' }) }), null);
    assert.deepEqual(snapshot(), before);
    assert.deepEqual(writes(), []);
});

check('new batch cannot inherit committed or caller-supplied face ownership', () => {
    storage.setPendingComboBatch([{ ...combo('0'), committed: true, batchId: 'forged', faceIndex: 9 }, combo('1')], identity());
    const pending = storage.readPendingComboBatch();
    assert.equal(pending.faces[0].committed, undefined);
    assert.equal(pending.faces[0].batchId, pending.batchId);
    assert.equal(pending.faces[0].faceIndex, 0);
});

check('single commit has original storage call sequence and no batch metadata', () => {
    storage.setPendingCombo(combo('single'));
    operations.length = 0;
    storage.commitPendingCombo('single-visual');
    assert.deepEqual(operations, [['get', SINGLE], ['get', HISTORY], ['set', HISTORY], ['remove', SINGLE]]);
    const entry = history()[0];
    assert.equal(entry.batchId, undefined);
    assert.equal(entry.faceIndex, undefined);
    assert.equal(entry.identity, undefined);
    assert.equal(values.has(BATCH), false);
});

console.log(`multifaceStorageIdentity: ${groups} production boundary groups passed`);
