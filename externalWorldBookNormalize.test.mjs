import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { normalizeFileWorldBook, normalizeHostWorldBook, searchNormalizedWorldBookEntries } from '../src/externalWorldBook/normalize.js';

const objectFixture = JSON.parse(fs.readFileSync(new URL('./fixtures/worldbook/synthetic-object.json', import.meta.url), 'utf8'));
const arrayFixture = JSON.parse(fs.readFileSync(new URL('./fixtures/worldbook/synthetic-array.json', import.meta.url), 'utf8'));

test('object entries normalize one source entry into one independent candidate', () => {
    const book = normalizeHostWorldBook(objectFixture, { sourceId: 'synthetic-object', sourceName: 'Synthetic Object', sourceTransport: 'endpoint' });
    assert.equal(book.entryCount, 2);
    assert.equal(book.entries[0].sourceEntryUid, '0');
    assert.equal(book.entries[0].sourceEntryId, '0');
    assert.equal(book.entries[0].title, '测试论坛玩法');
    assert.deepEqual(book.entries[0].primaryKeywords, ['论坛', '帖子']);
    assert.deepEqual(book.entries[0].secondaryKeywords, ['回复']);
    assert.equal(book.entries[0].disabled, false);
    assert.equal(book.entries[1].constant, true);
    assert.equal(book.entries[1].primaryKeywords.length, 0, 'keyword-less constant entries are a normal supported boundary');
});

test('array entries normalize to the same downstream shape and enabled maps to disabled', () => {
    const book = normalizeFileWorldBook(arrayFixture, { fileName: 'synthetic-array.json', fileFingerprint: 'fixture-array' });
    assert.equal(book.entryCount, 2);
    assert.equal(book.entries[0].sourceEntryId, '0');
    assert.deepEqual(book.entries[0].primaryKeywords, ['日记']);
    assert.equal(book.entries[0].disabled, false);
    assert.equal(book.entries[1].disabled, true);
});

test('search uses title/keywords/content and does not depend on trigger keywords existing', () => {
    const book = normalizeHostWorldBook(objectFixture, { sourceId: 'synthetic-object', sourceName: 'Synthetic Object' });
    assert.deepEqual(searchNormalizedWorldBookEntries(book, '论坛').map(item => item.sourceEntryId), ['0']);
    assert.deepEqual(searchNormalizedWorldBookEntries(book, '常驻玩法').map(item => item.sourceEntryId), ['1']);
    assert.deepEqual(searchNormalizedWorldBookEntries(book, '没有触发关键词').map(item => item.sourceEntryId), ['1']);
    assert.deepEqual(searchNormalizedWorldBookEntries(book, 'HTML').map(item => item.sourceEntryId), ['0']);
});

test('HTML and SillyTavern macros remain inert text data in the normalized entry', () => {
    const book = normalizeHostWorldBook(objectFixture, { sourceId: 'synthetic-object', sourceName: 'Synthetic Object' });
    const content = book.entries[0].content;
    assert.match(content, /<section>/);
    assert.match(content, /\{\{user\}\}/);
    assert.match(content, /\{\{char\}\}/);
});

test('the same uid in two books cannot imply the same library identity', () => {
    const a = normalizeHostWorldBook(objectFixture, { sourceId: 'book-A', sourceName: 'A' });
    const b = normalizeHostWorldBook(objectFixture, { sourceId: 'book-B', sourceName: 'B' });
    assert.equal(a.entries[0].sourceEntryUid, b.entries[0].sourceEntryUid);
    assert.notEqual(a.sourceId, b.sourceId);
    assert.notEqual(a.sourceHash, b.sourceHash);
});

test('non-string content and conflicting enabled/disable fail closed', () => {
    const invalidContent = structuredClone(objectFixture);
    invalidContent.entries['0'].content = { bad: true };
    assert.throws(() => normalizeFileWorldBook(invalidContent, { fileName: 'bad.json' }), error => error?.code === 'WORLD_BOOK_ENTRY_CONTENT_INVALID');

    const conflict = structuredClone(objectFixture);
    conflict.entries['0'].disable = false;
    conflict.entries['0'].enabled = false;
    assert.throws(() => normalizeFileWorldBook(conflict, { fileName: 'conflict.json' }), error => error?.code === 'WORLD_BOOK_ENTRY_STATE_CONFLICT');
});

test('duplicate display names are retained as separate source entries', () => {
    const duplicate = structuredClone(objectFixture);
    duplicate.entries['1'].comment = duplicate.entries['0'].comment;
    const book = normalizeFileWorldBook(duplicate, { fileName: 'duplicate.json' });
    assert.equal(book.entries.length, 2);
    assert.equal(book.entries[0].title, book.entries[1].title);
    assert.notEqual(book.entries[0].sourceEntryId, book.entries[1].sourceEntryId);
});
