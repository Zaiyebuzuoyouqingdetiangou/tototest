import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeIndexedDBFactory } from './helpers/fakeIndexedDb.mjs';
import {
    EXTERNAL_WORLD_BOOK_DB_VERSION,
    deleteExternalLibrary,
    getExternalPoolHydrationStatus,
    getSelectedExternalEntries,
    hydrateExternalPoolMetadata,
    openExternalLibraryDatabase,
    rebuildExternalPoolMetadata,
    saveExternalLibrarySnapshot,
    setExternalLibraryEnabled,
} from '../src/externalWorldBook/store.js';
import * as pool from '../src/externalWorldBook/externalPool.js?rmv=1.5.18-audit1c2';

test('blocked database opens cannot leak a late connection or perform a delayed upgrade', async () => {
    let closed = 0, aborted = 0;
    const request = { result: { close() { closed += 1; } }, transaction: { abort() { aborted += 1; } } };
    const opening = openExternalLibraryDatabase({ indexedDBFactory: { open: () => request } });
    request.onblocked();
    await assert.rejects(opening, { code: 'WORLD_BOOK_STORAGE_UNAVAILABLE' });
    request.onupgradeneeded();
    assert.equal(aborted, 1);
    request.onsuccess();
    assert.equal(closed, 1);
});

// Only the IndexedDB boundary is doubled. The production repository, migration,
// validation, metadata builder and snapshot mutation code execute unchanged.
// This extends the repository's transactional fake with real index-shaped APIs;
// it measures calls, not the fake Map's own search cost or real browser latency.
class IndexedFactory extends FakeIndexedDBFactory {
    constructor() {
        super();
        this.calls = [];
        this.opens = 0;
        this.failRead = null;
        this.instrumented = new WeakSet();
    }
    resetCalls() { this.calls.length = 0; this.opens = 0; }
    instrument(db) {
        if (this.instrumented.has(db)) return;
        this.instrumented.add(db);
        const transact = db.transaction.bind(db);
        db.transaction = (names, mode) => {
            const tx = transact(names, mode);
            this.calls.push({ type: 'transaction', names: [...tx.names], mode });
            const openStore = tx.objectStore.bind(tx);
            tx.objectStore = name => {
                const store = openStore(name);
                const get = store.get.bind(store);
                const getAll = store.getAll.bind(store);
                store.get = key => { this.calls.push({ type: 'get', store: name, key }); return get(key); };
                store.getAll = () => { this.calls.push({ type: 'getAll', store: name }); return getAll(); };
                store.index = indexName => {
                    const definition = store.data.indexes.get(indexName);
                    if (!definition) throw new Error(`Index absent: ${indexName}`);
                    const matches = (record, key) => record[definition.keyPath] === (key?.only ?? key);
                    const read = (method, key, selector) => {
                        const call = { type: 'index.' + method, store: name, index: indexName, key };
                        this.calls.push(call);
                        return tx.request(() => {
                            if (this.failRead?.(call)) throw new Error('Injected indexed read failure');
                            return structuredClone(selector([...store.data.records.entries()].filter(([, record]) => matches(record, key))));
                        });
                    };
                    return {
                        get: key => read('get', key, rows => rows[0]?.[1]),
                        getAll: key => read('getAll', key, rows => rows.map(([, row]) => row)),
                        getAllKeys: key => read('getAllKeys', key, rows => rows.map(([rowKey]) => rowKey)),
                    };
                };
                return store;
            };
            return tx;
        };
    }
    open(name, version) {
        this.opens += 1;
        const request = super.open(name, version);
        let onUpgrade;
        let onSuccess;
        Object.defineProperty(request, 'onupgradeneeded', {
            get: () => event => {
                const db = request.result;
                this.instrument(db);
                // The original helper only exercises first creation, so expose
                // the IDB versionchange transaction for the v1 -> v2 branch.
                request.transaction = { objectStore: storeName => {
                    const data = db.stores.get(storeName);
                    if (!data) throw new Error('Missing upgrade store');
                    return {
                        indexNames: { contains: indexName => data.indexes.has(indexName) },
                        createIndex: (indexName, keyPath, options) => data.indexes.set(indexName, { keyPath, options }),
                    };
                } };
                onUpgrade?.(event);
            },
            set: handler => { onUpgrade = handler; },
        });
        Object.defineProperty(request, 'onsuccess', {
            get: () => event => { this.instrument(request.result); onSuccess?.(event); },
            set: handler => { onSuccess = handler; },
        });
        return request;
    }
}

function fixture(count = 4, name = 'selected', enabled = true) {
    const libraryId = `extlib:fixture:${name}`;
    return {
        library: { libraryId, schemaVersion: 1, displayName: name, enabled, createdAt: 1, updatedAt: 1, entryCount: count },
        entries: Array.from({ length: count }, (_, index) => {
            const classification = index % 2 ? 'format' : 'theme';
            return {
                storageKey: `${libraryId}\u0000source-${index}`,
                libraryId,
                externalId: `ext:${libraryId}:${classification}:h${index}:source-${index}`,
                classification,
                enabled: true,
                userConfirmed: true,
                localTitle: `LOCAL_TITLE_${index}`,
                summary: `LOCAL_SUMMARY_${index}`,
                rawContent: `LOCAL_RAW_${index} <context>original {{unknown}} remains unchanged</context>`,
                contentHash: `content-hash-${index}`,
                createdAt: 1, updatedAt: 1,
            };
        }),
    };
}

function optionsFor(factory) { return { indexedDBFactory: factory, keyRangeFactory: { only: value => ({ only: value }) } }; }
function rawReads(factory) { return factory.calls.filter(call => call.store === 'entries' && ['get', 'getAll', 'index.get', 'index.getAll'].includes(call.type)); }
function rowsSnapshot(factory) { return structuredClone([...factory.db.stores.get('entries').records]); }
function assertIdOnly(value) {
    assert.doesNotMatch(JSON.stringify(value), /LOCAL_RAW|LOCAL_TITLE|LOCAL_SUMMARY|rawContent|localTitle|"summary"/);
}
async function installed(snapshot = fixture()) {
    const factory = new IndexedFactory();
    const options = optionsFor(factory);
    pool.clearExternalPoolSnapshot();
    await saveExternalLibrarySnapshot(snapshot, options);
    factory.resetCalls();
    return { factory, options, snapshot };
}

test('empty and all-builtin selected IDs return an operation-local empty Map without opening IDB', async () => {
    const factory = new IndexedFactory();
    const options = optionsFor(factory);
    const empty = await getSelectedExternalEntries([], options);
    const builtin = await getSelectedExternalEntries(['A.1', '3.3.2'], options);
    assert.ok(empty instanceof Map);
    assert.ok(builtin instanceof Map);
    assert.notEqual(empty, builtin);
    assert.equal(empty.size + builtin.size, 0);
    assert.equal(factory.opens, 0);
    assert.equal(factory.db, null);
    assert.deepEqual(factory.calls, []);
});

test('invalid selected-ID inputs reject before any IndexedDB access', async () => {
    const factory = new IndexedFactory();
    const options = optionsFor(factory);
    for (const ids of [null, 'ext:one', [null], ['ext:one '], ['ext:' + 'x'.repeat(2048)]]) {
        await assert.rejects(getSelectedExternalEntries(ids, options), error => error.code === 'WORLD_BOOK_ENTRY_STATE_CONFLICT');
    }
    assert.equal(factory.opens, 0);
});

test('selected duplicate IDs use one readonly transaction and exactly one byExternalId.get per unique ID', async () => {
    const { factory, options, snapshot } = await installed();
    const ids = [snapshot.entries[0].externalId, snapshot.entries[3].externalId];
    const result = await getSelectedExternalEntries([ids[0], ids[1], ids[0], '3.3.2', ids[1]], options);
    assert.deepEqual([...result.keys()], ids);
    assert.deepEqual(rawReads(factory).map(({ type, index, key }) => ({ type, index, key })), ids.map(key => ({ type: 'index.get', index: 'byExternalId', key })));
    assert.deepEqual(factory.calls.filter(call => call.type === 'transaction'), [{ type: 'transaction', names: ['entries', 'libraries'], mode: 'readonly' }]);
    assert.equal(factory.calls.filter(call => call.store === 'libraries' && call.type === 'get').length, 1);
    assert.equal(result.get(ids[0]).rawContent, snapshot.entries[0].rawContent, 'only the later send-copy seam may escape/truncate originals');
    assert.equal(result.get(ids[0]).summary, snapshot.entries[0].summary);
    result.get(ids[0]).rawContent = 'LOCAL_OPERATION_EDIT';
    assert.notEqual((await getSelectedExternalEntries(ids, options)).get(ids[0]).rawContent, 'LOCAL_OPERATION_EDIT', 'operation rows must not alias stored records');
    assertIdOnly(pool.getExternalPoolSnapshot());
});

test('5000 stored entries do not increase a two-selected-ID raw read count', async () => {
    const { factory, options, snapshot } = await installed(fixture(5000, 'large'));
    const ids = [snapshot.entries[17].externalId, snapshot.entries[4998].externalId];
    const result = await getSelectedExternalEntries([...ids, ...ids], options);
    assert.equal(result.size, 2);
    assert.deepEqual(rawReads(factory).map(call => call.key), ids);
    assert.equal(factory.calls.filter(call => call.type === 'transaction').length, 1);
    assert.equal(factory.calls.some(call => call.type === 'getAll' || call.type === 'index.getAll'), false);
});

const invalidSelections = [
    ['disabled entry', entry => { entry.enabled = false; }, 'WORLD_BOOK_ENTRY_STATE_CONFLICT'],
    ['unconfirmed entry', entry => { entry.userConfirmed = false; }, 'WORLD_BOOK_ENTRY_STATE_CONFLICT'],
    ['pending classification', entry => { entry.classification = 'pending'; }, 'WORLD_BOOK_ENTRY_STATE_CONFLICT'],
    ['auxiliary classification', entry => { entry.classification = 'auxiliary'; }, 'WORLD_BOOK_ENTRY_STATE_CONFLICT'],
    ['changed classification with old ID', entry => { entry.classification = 'format'; }, 'WORLD_BOOK_ENTRY_STATE_CONFLICT'],
    ['missing raw', entry => { delete entry.rawContent; }, 'WORLD_BOOK_ENTRY_CONTENT_INVALID'],
    ['empty raw', entry => { entry.rawContent = '   '; }, 'WORLD_BOOK_ENTRY_CONTENT_INVALID'],
];
for (const [name, mutate, code] of invalidSelections) {
    test(`${name} fails the complete selected material operation without replacing the ID`, async () => {
        const snapshot = fixture();
        mutate(snapshot.entries[0]);
        const { factory, options } = await installed(snapshot);
        const selected = [snapshot.entries[1].externalId, snapshot.entries[0].externalId];
        await assert.rejects(getSelectedExternalEntries(selected, options), error => error.code === code && error.details.externalId === selected[1]);
        assert.deepEqual(rawReads(factory).map(call => call.key), selected, 'do not redraw, read another entry, or fall back to all rows');
    });
}

test('disabled or deleted library blocks otherwise eligible selected entries', async () => {
    for (const missing of [false, true]) {
        const { factory, options, snapshot } = await installed(fixture(2, missing ? 'deleted' : 'disabled', !missing));
        const records = factory.db.stores.get('libraries').records;
        if (missing) records.delete(snapshot.library.libraryId);
        else records.get(snapshot.library.libraryId).enabled = false;
        await assert.rejects(getSelectedExternalEntries([snapshot.entries[0].externalId], options), error => error.code === (missing ? 'WORLD_BOOK_NOT_FOUND' : 'WORLD_BOOK_ENTRY_STATE_CONFLICT'));
        assert.equal(rawReads(factory).length, 1);
    }
});

test('missing selected ID fails without returning the other successful row', async () => {
    const { factory, options, snapshot } = await installed();
    const missing = `ext:${snapshot.library.libraryId}:theme:missing`;
    const ids = [snapshot.entries[0].externalId, missing];
    await assert.rejects(getSelectedExternalEntries(ids, options), error => error.code === 'WORLD_BOOK_NOT_FOUND' && error.details.externalId === missing);
    assert.deepEqual(rawReads(factory).map(call => call.key), ids);
});

test('index failures never fall back to getAll raw reads', async () => {
    for (const absentIndex of [false, true]) {
        const { factory, options, snapshot } = await installed();
        if (absentIndex) factory.db.stores.get('entries').indexes.delete('byExternalId');
        else factory.failRead = call => call.index === 'byExternalId';
        await assert.rejects(getSelectedExternalEntries([snapshot.entries[0].externalId], options), error => error.code === 'WORLD_BOOK_READ_FAILED');
        assert.equal(factory.calls.some(call => call.type === 'getAll' || call.type === 'index.getAll'), false);
    }
});

test('metadata persists IDs only and refresh hydration is lazy, deduplicated, and raw-free', async () => {
    const { factory, options } = await installed();
    assertIdOnly([...factory.db.stores.get('poolMetadata').records.values()]);
    pool.clearExternalPoolSnapshot();
    const first = hydrateExternalPoolMetadata(options);
    const second = hydrateExternalPoolMetadata(options);
    assert.equal(first, second, 'concurrent callers share only metadata hydration');
    const refreshed = await first;
    assert.equal(refreshed.themeCount, 2);
    assert.equal(refreshed.formatCount, 2);
    assert.equal(factory.opens, 1);
    assert.deepEqual(rawReads(factory), []);
    assert.deepEqual(factory.calls.filter(call => call.type === 'getAll').map(call => call.store), ['libraries', 'poolMetadata']);
    assertIdOnly(refreshed);
    assert.deepEqual(getExternalPoolHydrationStatus(), { hydrated: true, metadataRebuildRequired: [], enabledMetadataRebuildRequired: [] });
    await hydrateExternalPoolMetadata(options);
    assert.equal(factory.opens, 1, 'already hydrated unchanged snapshot needs no extra transaction');
});

test('save, enable, disable, delete update persisted light metadata and pool without toggle raw reads', async () => {
    const { factory, options, snapshot } = await installed(fixture(4, 'toggle', false));
    const libraryId = snapshot.library.libraryId;
    assert.equal(pool.getExternalPoolSnapshot().themeCount, 0, 'import does not auto-enable a library');
    await setExternalLibraryEnabled(libraryId, true, options);
    assert.equal(pool.getExternalPoolSnapshot().themeCount, 2);
    assert.equal(factory.db.stores.get('poolMetadata').records.get(libraryId).enabled, true);
    await setExternalLibraryEnabled(libraryId, false, options);
    assert.equal(pool.getExternalPoolSnapshot().themeCount, 0);
    assert.equal(factory.db.stores.get('poolMetadata').records.get(libraryId).enabled, false);
    assert.deepEqual(rawReads(factory), []);
    await deleteExternalLibrary(libraryId, options);
    assert.equal(factory.db.stores.get('poolMetadata').records.has(libraryId), false);
    assert.equal(factory.db.stores.get('entries').records.size, 0);
    assert.deepEqual(rawReads(factory), [], 'deletion enumerates keys, not raw content');
    pool.clearExternalPoolSnapshot();
    assert.equal((await hydrateExternalPoolMetadata(options)).themeCount, 0);
});

test('reimport replaces only that library metadata while preserving its user-enabled state', async () => {
    const { factory, options, snapshot } = await installed(fixture(4, 'reimport', false));
    await setExternalLibraryEnabled(snapshot.library.libraryId, true, options);
    const smaller = fixture(2, 'reimport', false);
    await saveExternalLibrarySnapshot(smaller, options);
    const metadata = factory.db.stores.get('poolMetadata').records.get(smaller.library.libraryId);
    assert.equal(metadata.enabled, true);
    assert.equal(metadata.themeIds.length + metadata.formatIds.length, 2);
    assertIdOnly(metadata);
    pool.clearExternalPoolSnapshot();
    factory.resetCalls();
    const refreshed = await hydrateExternalPoolMetadata(options);
    assert.equal(refreshed.themeCount + refreshed.formatCount, 2);
    assert.deepEqual(rawReads(factory), []);
});

test('metadata write failure aborts replacement without losing prior rows or changing the pool', async () => {
    const { factory, options, snapshot } = await installed();
    const originals = rowsSnapshot(factory);
    const metadata = structuredClone([...factory.db.stores.get('poolMetadata').records]);
    const previousPool = pool.getExternalPoolSnapshot();
    const changed = fixture(2, 'selected');
    factory.failPutAt = factory.putCount + 2; // library put, then metadata put
    await assert.rejects(saveExternalLibrarySnapshot(changed, options), error => error.code === 'WORLD_BOOK_STORAGE_WRITE_FAILED');
    assert.deepEqual(rowsSnapshot(factory), originals);
    assert.deepEqual([...factory.db.stores.get('poolMetadata').records], metadata);
    assert.equal(pool.getExternalPoolSnapshot(), previousPool);
    assert.equal(factory.db.stores.get('libraries').records.get(snapshot.library.libraryId).entryCount, 4);
});

test('v1 upgrade preserves all originals and explicitly requires metadata rebuild instead of startup raw scan', async () => {
    const { factory, options, snapshot } = await installed();
    // This is persisted v1 state, not a mock of the production migration:
    // keep existing rows and byLibrary, remove only structures absent in v1.
    factory.version = 1;
    factory.db.stores.delete('poolMetadata');
    factory.db.stores.get('entries').indexes.delete('byExternalId');
    delete factory.db.stores.get('libraries').records.get(snapshot.library.libraryId).poolMetadataVersion;
    const originals = rowsSnapshot(factory);
    pool.clearExternalPoolSnapshot();
    factory.resetCalls();
    const beforeRebuild = await hydrateExternalPoolMetadata(options);
    assert.equal(EXTERNAL_WORLD_BOOK_DB_VERSION, 2);
    assert.equal(factory.version, 2);
    assert.equal(factory.db.stores.get('entries').indexes.has('byExternalId'), true);
    assert.equal(factory.db.stores.has('poolMetadata'), true);
    assert.deepEqual(rowsSnapshot(factory), originals);
    assert.deepEqual(rawReads(factory), []);
    assert.equal(beforeRebuild.themeCount + beforeRebuild.formatCount, 0);
    assert.deepEqual(getExternalPoolHydrationStatus().metadataRebuildRequired, [snapshot.library.libraryId]);
    await assert.rejects(setExternalLibraryEnabled(snapshot.library.libraryId, true, options), error => error.details?.reason === 'metadata-rebuild-required');
    assert.deepEqual(rawReads(factory), []);
    factory.resetCalls();
    const rebuilt = await rebuildExternalPoolMetadata(snapshot.library.libraryId, options);
    assert.deepEqual(rawReads(factory).map(call => [call.type, call.index, call.key]), [['index.getAll', 'byLibrary', snapshot.library.libraryId]], 'explicit rebuild may read only this one library');
    assert.deepEqual(rowsSnapshot(factory), originals);
    assertIdOnly(rebuilt);
    factory.resetCalls();
    pool.clearExternalPoolSnapshot();
    const afterRebuild = await hydrateExternalPoolMetadata(options);
    assert.equal(afterRebuild.themeCount + afterRebuild.formatCount, 4);
    assert.deepEqual(getExternalPoolHydrationStatus().metadataRebuildRequired, []);
    assert.deepEqual(rawReads(factory), []);
});

test('stale metadata hydration cannot overwrite an intervening pool revision', async () => {
    const { factory, options, snapshot } = await installed();
    pool.clearExternalPoolSnapshot();
    const pending = hydrateExternalPoolMetadata(options);
    // Deterministically invalidate while the lazy IDB open is still pending.
    factory.db.stores.get('libraries').records.get(snapshot.library.libraryId).enabled = false;
    pool.removeExternalPoolLibrary(snapshot.library.libraryId);
    assert.equal((await pending).themeCount, 0);
    assert.equal(pool.getExternalPoolSnapshot().themeCount, 0);
    assert.equal((await hydrateExternalPoolMetadata(options)).themeCount, 0);
    assert.deepEqual(rawReads(factory), []);
});

test('malformed legacy metadata stays out of the pool and disabling remains possible without raw reads', async () => {
    const { factory, options, snapshot } = await installed();
    factory.db.stores.get('poolMetadata').records.set(snapshot.library.libraryId, { libraryId: snapshot.library.libraryId, schemaVersion: 1, themeIds: 'invalid', formatIds: [] });
    pool.clearExternalPoolSnapshot();
    assert.equal((await hydrateExternalPoolMetadata(options)).themeCount, 0);
    assert.deepEqual(getExternalPoolHydrationStatus().metadataRebuildRequired, [snapshot.library.libraryId]);
    assert.deepEqual(getExternalPoolHydrationStatus().enabledMetadataRebuildRequired, [snapshot.library.libraryId]);
    await setExternalLibraryEnabled(snapshot.library.libraryId, false, options);
    await hydrateExternalPoolMetadata(options);
    assert.deepEqual(getExternalPoolHydrationStatus().metadataRebuildRequired, [snapshot.library.libraryId]);
    assert.deepEqual(getExternalPoolHydrationStatus().enabledMetadataRebuildRequired, [], 'disabled legacy libraries do not block unrelated generation');
    assert.equal(pool.getExternalPoolSnapshot().themeCount, 0);
    assert.deepEqual(rawReads(factory), []);
});
