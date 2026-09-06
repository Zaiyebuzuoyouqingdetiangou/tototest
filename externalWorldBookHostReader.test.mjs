import assert from 'node:assert/strict';
import test from 'node:test';

import { detectWorldBookCapabilities } from '../src/externalWorldBook/capabilities.js';
import { listHostWorldBooks, readHostWorldBook } from '../src/externalWorldBook/hostReader.js';

const headers = async () => ({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'synthetic' });

function response(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() { return structuredClone(payload); },
    };
}

test('capability detection is feature-based and never needs a version string', async () => {
    const withContext = await detectWorldBookCapabilities({
        contextProvider: () => ({ getWorldInfoNames: () => ['Book A', 'Book B'] }),
        headerProvider: headers,
    });
    assert.equal(withContext.source, 'context-api');
    assert.equal(withContext.canListWorldBooks, true);
    assert.equal(withContext.canReadWorldBook, true);

    const endpointOnly = await detectWorldBookCapabilities({ contextProvider: () => ({}), headerProvider: headers });
    assert.equal(endpointOnly.source, 'endpoint');

    const unavailable = await detectWorldBookCapabilities({ contextProvider: () => ({}), headerProvider: async () => null });
    assert.equal(unavailable.source, null);
    assert.equal(unavailable.canReadWorldBook, false);
});


test('host import fails closed when names are visible but the read request capability is unavailable', async () => {
    await assert.rejects(() => listHostWorldBooks({
        contextProvider: () => ({ getWorldInfoNames: () => ['Visible But Unreadable'] }),
        headerProvider: async () => null,
    }), error => error?.code === 'WORLD_BOOK_CAPABILITY_UNAVAILABLE');
});

test('host list preserves file_id for reading and name only for display', async () => {
    const calls = [];
    const books = await listHostWorldBooks({
        contextProvider: () => ({ getWorldInfoNames: () => ['fallback-name'] }),
        headerProvider: headers,
        fetchFn: async (path, options) => {
            calls.push([path, options]);
            return response([{ file_id: 'disk_file_01', name: '显示名称', extensions: {} }]);
        },
    });
    assert.deepEqual(books, [{ fileId: 'disk_file_01', displayName: '显示名称', extensions: {} }]);
    assert.equal(calls[0][0], '/api/worldinfo/list');
});

test('host reader POSTs /get with the file_id and normalizes the returned raw worldbook', async () => {
    const calls = [];
    const book = await readHostWorldBook({ fileId: 'disk_file_01', displayName: '显示名称' }, {
        headerProvider: headers,
        fetchFn: async (path, options) => {
            calls.push([path, options]);
            return response({ entries: { '0': { uid: 0, comment: '测试条目', key: [], keysecondary: [], content: '原创正文', disable: false, constant: true, order: 1 } } });
        },
    });
    assert.equal(calls[0][0], '/api/worldinfo/get');
    assert.deepEqual(JSON.parse(calls[0][1].body), { name: 'disk_file_01' });
    assert.equal(book.sourceId, 'disk_file_01');
    assert.equal(book.sourceName, '显示名称');
    assert.equal(book.entryCount, 1);
});

test('context names provide a fallback list if endpoint listing fails, without version gating', async () => {
    const books = await listHostWorldBooks({
        contextProvider: () => ({ getWorldInfoNames: () => ['Fallback Book'] }),
        headerProvider: headers,
        fetchFn: async () => response({ error: true }, 500),
    });
    assert.deepEqual(books, [{ fileId: 'Fallback Book', displayName: 'Fallback Book', extensions: {} }]);
});
