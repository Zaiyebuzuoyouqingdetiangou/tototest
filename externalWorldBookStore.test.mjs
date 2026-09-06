import assert from 'node:assert/strict';
import test from 'node:test';

import {
    deleteExternalLibrary,
    externalEntryId,
    externalLibraryIdForBook,
    getExternalLibraryEntries,
    listExternalLibraries,
    prepareExternalLibrarySnapshot,
    saveExternalLibrarySnapshot,
    setExternalLibraryEnabled,
} from '../src/externalWorldBook/store.js';
import { createExternalWorldBookClassificationDraft, updateExternalWorldBookDraftItem } from '../src/externalWorldBook/classifier.js';
import { normalizeHostWorldBook } from '../src/externalWorldBook/normalize.js';
import { createWholeBookSelection } from '../src/externalWorldBook/selectionState.js';
import { FakeIndexedDBFactory } from './helpers/fakeIndexedDb.mjs';

const raw = {
    name: '原创存储测试世界书',
    entries: {
        0: { uid: 0, comment: '测试论坛体', key: ['论坛'], keysecondary: [], content: '主楼、回帖、楼层。', disable: false, order: 2 },
        1: { uid: 1, comment: '测试末日主题', key: ['末日'], keysecondary: [], content: '末日、生存、救赎。', disable: false, order: 1 },
        2: { uid: 2, comment: '无法判断测试', key: [], keysecondary: [], content: '普通原创内容。', disable: false, order: 0 },
    },
};

function buildSnapshot() {
    const book = normalizeHostWorldBook(raw, { sourceId: 'disk_test_01', sourceName: '原创存储测试世界书' });
    const selected = createWholeBookSelection(book);
    let draft = createExternalWorldBookClassificationDraft(book, selected.selectedIds);
    const pending = draft.find(item => item.sourceEntryUid === '2');
    draft = updateExternalWorldBookDraftItem(draft, pending.entryIdentity, { classification: 'ignore', userConfirmed: true });
    return { book, draft, snapshot: prepareExternalLibrarySnapshot(book, draft, { now: 1000 }) };
}

test('snapshot creates namespaced library/entry identities and keeps one source entry per record', () => {
    const { book, snapshot } = buildSnapshot();
    assert.match(snapshot.library.libraryId, /^extlib:/);
    assert.equal(snapshot.entries.length, 3);
    assert.equal(new Set(snapshot.entries.map(item => item.storageKey)).size, 3);
    assert.equal(new Set(snapshot.entries.map(item => item.externalId)).size, 3);
    assert.equal(snapshot.library.themeCount, 1);
    assert.equal(snapshot.library.formatCount, 1);
    assert.equal(snapshot.library.ignoredCount, 1);
    assert.equal(snapshot.library.enabled, false, 'new libraries must not auto-enable');
    assert.equal(snapshot.entries.find(item => item.classification === 'ignore').enabled, false);
    assert.equal(externalLibraryIdForBook(book), snapshot.library.libraryId);
    assert.match(externalEntryId(snapshot.library.libraryId, book.entries[0], 'format'), /^ext:/);
});





test('pending review entries are stored disabled until a user classifies them', () => {
    const book = normalizeHostWorldBook(raw, { sourceId: 'pending-book', sourceName: 'Pending Book' });
    const selected = createWholeBookSelection(book);
    const draft = createExternalWorldBookClassificationDraft(book, selected.selectedIds);
    const snapshot = prepareExternalLibrarySnapshot(book, draft, { now: 1000 });
    const pending = snapshot.entries.find(item => item.classification === 'pending');
    assert.ok(pending, 'fixture must contain one uncertain entry');
    assert.equal(pending.enabled, false);
    assert.equal(pending.userConfirmed, false);
});

test('same source uid in different libraries gets a different namespaced external id', () => {
    const bookA = normalizeHostWorldBook(raw, { sourceId: 'book-a', sourceName: 'A' });
    const bookB = normalizeHostWorldBook(raw, { sourceId: 'book-b', sourceName: 'B' });
    const idA = externalEntryId(externalLibraryIdForBook(bookA), bookA.entries[0], 'format');
    const idB = externalEntryId(externalLibraryIdForBook(bookB), bookB.entries[0], 'format');
    assert.notEqual(idA, idB);
});



test('duplicate source UIDs inside one malformed book still remain separate stored candidates', () => {
    const duplicateUidRaw = structuredClone(raw);
    duplicateUidRaw.entries[1].uid = 0;
    const book = normalizeHostWorldBook(duplicateUidRaw, { sourceId: 'duplicate-uid', sourceName: 'Duplicate UID' });
    const selected = createWholeBookSelection(book);
    const draft = createExternalWorldBookClassificationDraft(book, selected.selectedIds);
    const snapshot = prepareExternalLibrarySnapshot(book, draft, { now: 1000 });
    assert.equal(snapshot.entries.length, 3);
    assert.equal(new Set(snapshot.entries.map(item => item.storageKey)).size, 3);
    assert.equal(new Set(snapshot.entries.map(item => item.externalId)).size, 3);
});

test('IndexedDB repository atomically saves, lists, toggles and deletes a library', async () => {
    const factory = new FakeIndexedDBFactory();
    const options = { indexedDBFactory: factory, keyRangeFactory: null };
    const { snapshot } = buildSnapshot();
    const saved = await saveExternalLibrarySnapshot(snapshot, options);
    assert.equal(saved.enabled, false);
    let libraries = await listExternalLibraries(options);
    assert.equal(libraries.length, 1);
    assert.equal(libraries[0].entryCount, 3);
    let entries = await getExternalLibraryEntries(saved.libraryId, options);
    assert.equal(entries.length, 3);

    const enabled = await setExternalLibraryEnabled(saved.libraryId, true, options);
    assert.equal(enabled.enabled, true);
    libraries = await listExternalLibraries(options);
    assert.equal(libraries[0].enabled, true);
    await saveExternalLibrarySnapshot(snapshot, options);
    libraries = await listExternalLibraries(options);
    assert.equal(libraries[0].enabled, true, 're-import/save must preserve an existing library enable state');

    await deleteExternalLibrary(saved.libraryId, options);
    assert.deepEqual(await listExternalLibraries(options), []);
    assert.deepEqual(await getExternalLibraryEntries(saved.libraryId, options), []);
});

test('a failed replacement transaction keeps the previously saved library intact', async () => {
    const factory = new FakeIndexedDBFactory();
    const options = { indexedDBFactory: factory, keyRangeFactory: null };
    const { snapshot } = buildSnapshot();
    await saveExternalLibrarySnapshot(snapshot, options);
    const beforeLibraries = await listExternalLibraries(options);
    const beforeEntries = await getExternalLibraryEntries(snapshot.library.libraryId, options);

    const changed = structuredClone(snapshot);
    changed.library.displayName = '不应提交的新名称';
    changed.entries[0].summary = '不应提交的新摘要';
    factory.failNextPut();
    await assert.rejects(() => saveExternalLibrarySnapshot(changed, options), error => error?.code === 'WORLD_BOOK_STORAGE_WRITE_FAILED');
    factory.clearFailure();

    const afterLibraries = await listExternalLibraries(options);
    const afterEntries = await getExternalLibraryEntries(snapshot.library.libraryId, options);
    assert.equal(afterLibraries[0].displayName, beforeLibraries[0].displayName);
    assert.equal(afterEntries[0].summary, beforeEntries[0].summary);
});

test('quota failures surface a specific local-storage error code', async () => {
    const factory = new FakeIndexedDBFactory();
    const options = { indexedDBFactory: factory, keyRangeFactory: null };
    const { snapshot } = buildSnapshot();
    factory.failNextPut('QuotaExceededError');
    await assert.rejects(() => saveExternalLibrarySnapshot(snapshot, options), error => error?.code === 'WORLD_BOOK_STORAGE_QUOTA');
});
