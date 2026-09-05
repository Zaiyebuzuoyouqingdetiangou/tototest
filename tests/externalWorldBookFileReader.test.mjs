import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { readLocalWorldBookFile } from '../src/externalWorldBook/fileReader.js';
import { EXTERNAL_WORLD_BOOK_MAX_FILE_BYTES } from '../src/externalWorldBook/schema.js';

const fixtureText = fs.readFileSync(new URL('./fixtures/worldbook/synthetic-object.json', import.meta.url), 'utf8');
const fakeFile = (name, text, extra = {}) => ({
    name,
    size: Buffer.byteLength(text, 'utf8'),
    lastModified: 123,
    type: extra.type || '',
    async text() { return text; },
    ...extra,
});

test('local reader accepts a valid JSON worldbook even when MIME is blank or text/plain', async () => {
    for (const type of ['', 'text/plain', 'application/octet-stream']) {
        const book = await readLocalWorldBookFile(fakeFile('fixture.json', fixtureText, { type }));
        assert.equal(book.entryCount, 2);
        assert.equal(book.sourceType, 'file');
    }
});

test('local reader rejects unsupported extensions, invalid JSON and missing entries', async () => {
    await assert.rejects(() => readLocalWorldBookFile(fakeFile('fixture.yaml', fixtureText)), error => error.code === 'WORLD_BOOK_FILE_TYPE_UNSUPPORTED');
    await assert.rejects(() => readLocalWorldBookFile(fakeFile('fixture.json', '{no')), error => error.code === 'WORLD_BOOK_JSON_INVALID');
    await assert.rejects(() => readLocalWorldBookFile(fakeFile('fixture.json', JSON.stringify({ hello: 'world' }))), error => error.code === 'WORLD_BOOK_ENTRIES_MISSING');
});

test('local reader rejects files over the bounded first-phase size limit before reading them', async () => {
    let read = false;
    const file = {
        name: 'huge.json',
        size: EXTERNAL_WORLD_BOOK_MAX_FILE_BYTES + 1,
        lastModified: 1,
        async text() { read = true; return fixtureText; },
    };
    await assert.rejects(() => readLocalWorldBookFile(file), error => error.code === 'WORLD_BOOK_FILE_TOO_LARGE');
    assert.equal(read, false);
});
