import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import {
    EXTERNAL_WORLD_BOOK_SELECTION_MODE,
    createEmptySelection,
    createFilteredSelection,
    createWholeBookSelection,
    entryIdentity,
    toggleEntrySelection,
} from '../src/externalWorldBook/selectionState.js';
import {
    normalizeFileWorldBook,
    normalizeHostWorldBook,
    searchNormalizedWorldBookEntries,
} from '../src/externalWorldBook/normalize.js';

const smallFixture = JSON.parse(fs.readFileSync(new URL('./fixtures/worldbook/synthetic-object.json', import.meta.url), 'utf8'));
const largeFixture = JSON.parse(fs.readFileSync(new URL('./fixtures/worldbook/synthetic-large.json', import.meta.url), 'utf8'));
const wizardSource = fs.readFileSync(new URL('../src/externalWorldBook/importWizard.js', import.meta.url), 'utf8');

function functionBlock(name) {
    const marker = `function ${name}(`;
    const start = wizardSource.indexOf(marker);
    assert.ok(start >= 0, `${name} must exist`);
    const brace = wizardSource.indexOf('{', start);
    assert.ok(brace > start, `${name} body must exist`);
    let depth = 0;
    for (let index = brace; index < wizardSource.length; index += 1) {
        if (wizardSource[index] === '{') depth += 1;
        else if (wizardSource[index] === '}') {
            depth -= 1;
            if (depth === 0) return wizardSource.slice(start, index + 1);
        }
    }
    throw new Error(`${name} body is not balanced`);
}

function largeHostBook(sourceId = 'large-host') {
    return normalizeHostWorldBook(largeFixture, { sourceId, sourceName: `Large ${sourceId}` });
}

function largeFileBook(sourceId = 'large-file') {
    return normalizeFileWorldBook(largeFixture, { sourceId, fileName: `${sourceId}.json` });
}

test('whole-book selection includes every normalized entry across three pages', () => {
    const book = largeHostBook();
    const selection = createWholeBookSelection(book);
    assert.equal(book.entryCount, 130);
    assert.equal(selection.mode, EXTERNAL_WORLD_BOOK_SELECTION_MODE.WHOLE);
    assert.equal(selection.selectedIds.size, 130);
    for (const entry of book.entries) assert.equal(selection.selectedIds.has(entryIdentity(entry)), true);
});

test('host and file sources share the same whole-book selection behavior', () => {
    const host = createWholeBookSelection(largeHostBook('same-source'));
    const file = createWholeBookSelection(largeFileBook('same-source'));
    assert.equal(host.selectedIds.size, 130);
    assert.equal(file.selectedIds.size, 130);
    assert.deepEqual([...host.selectedIds], [...file.selectedIds]);
});

test('filtered selection replaces the selection with every matching entry, not the current page', () => {
    const book = largeHostBook();
    const matches = searchNormalizedWorldBookEntries(book, '论坛测试');
    assert.equal(matches.length, 70, 'synthetic fixture must span more than one 50-row page');
    const selection = createFilteredSelection(matches);
    assert.equal(selection.mode, EXTERNAL_WORLD_BOOK_SELECTION_MODE.FILTERED);
    assert.equal(selection.selectedIds.size, 70);
    assert.equal(selection.selectedIds.has(entryIdentity(matches[69])), true, 'a match beyond page one must remain selected');
});

test('manual exclusions remain stable across unrelated search and pagination operations', () => {
    const book = largeHostBook();
    const whole = createWholeBookSelection(book);
    const excluded = entryIdentity(book.entries[7]);
    const manualIds = toggleEntrySelection(whole.selectedIds, excluded, false);
    const matches = searchNormalizedWorldBookEntries(book, '论坛测试');
    assert.equal(matches.length, 70);
    // Search and paging are read-only with respect to selection. The same set survives.
    assert.equal(manualIds.size, 129);
    assert.equal(manualIds.has(excluded), false);
    assert.equal(manualIds.has(entryIdentity(book.entries[69])), true);
});

test('clear and restore whole-book selection are pure data operations', () => {
    const book = largeHostBook();
    const cleared = createEmptySelection();
    assert.equal(cleared.mode, EXTERNAL_WORLD_BOOK_SELECTION_MODE.MANUAL);
    assert.equal(cleared.selectedIds.size, 0);
    const restored = createWholeBookSelection(book);
    assert.equal(restored.selectedIds.size, 130);
});

test('switching books creates a fresh selection even when UIDs overlap', () => {
    const bookA = largeHostBook('book-a');
    const bookB = normalizeHostWorldBook(smallFixture, { sourceId: 'book-b', sourceName: 'Book B' });
    const selectionA = createWholeBookSelection(bookA);
    const firstA = entryIdentity(bookA.entries[0]);
    const modifiedA = toggleEntrySelection(selectionA.selectedIds, firstA, false);
    assert.equal(modifiedA.has(firstA), false);
    const selectionB = createWholeBookSelection(bookB);
    assert.equal(selectionB.selectedIds.size, bookB.entryCount);
    assert.equal(selectionB.selectedIds.has(entryIdentity(bookB.entries[0])), true, 'book B must initialize independently even with uid 0');
});


test('selection identity follows the normalized source uid/id rather than pagination or original order', () => {
    const book = largeHostBook('identity-source');
    const entry = book.entries[17];
    const expected = `${entry.sourceEntryUid ?? ''}:${entry.sourceEntryId ?? ''}`;
    assert.equal(entryIdentity(entry), expected);
    const reordered = { ...entry, originalOrder: Number(entry.originalOrder || 0) + 999 };
    assert.equal(entryIdentity(reordered), expected, 'reordering must not change the selection identity');
});

test('production showNormalizedBook initializes a fresh whole-book state for every source', () => {
    const bookA = largeHostBook('vm-a');
    const bookB = normalizeHostWorldBook(smallFixture, { sourceId: 'vm-b', sourceName: 'VM B' });
    let renders = 0;
    const state = {
        currentBook: null,
        page: 9,
        selectedIds: new Set(['stale']),
        selectionMode: EXTERNAL_WORLD_BOOK_SELECTION_MODE.MANUAL,
        entrySearch: { value: 'old query' },
        fullText: { checked: true },
    };
    const sandbox = {
        state,
        createWholeBookSelection,
        renderEntries() { renders += 1; },
        invalidateClassification() {},
        globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(`${functionBlock('showNormalizedBook')}\nglobalThis.run=showNormalizedBook;`, sandbox);
    sandbox.globalThis.run(bookA);
    assert.equal(state.currentBook, bookA);
    assert.equal(state.page, 0);
    assert.equal(state.entrySearch.value, '');
    assert.equal(state.fullText.checked, false);
    assert.equal(state.selectedIds.size, 130);
    assert.equal(state.selectionMode, EXTERNAL_WORLD_BOOK_SELECTION_MODE.WHOLE);
    state.selectedIds.delete(entryIdentity(bookA.entries[0]));
    sandbox.globalThis.run(bookB);
    assert.equal(state.currentBook, bookB);
    assert.equal(state.selectedIds.size, 2);
    assert.equal(state.selectedIds.has(entryIdentity(bookB.entries[0])), true, 'book switch must discard the previous source selection');
    assert.equal(renders, 2);
});

test('production selectCurrentFilter replaces selection with the full search result', () => {
    const book = largeHostBook('vm-filter');
    let rendered = 0;
    let updated = 0;
    let status = '';
    const state = {
        currentBook: book,
        entrySearch: { value: '论坛测试' },
        fullText: { checked: false },
        selectedIds: createWholeBookSelection(book).selectedIds,
        selectionMode: EXTERNAL_WORLD_BOOK_SELECTION_MODE.WHOLE,
        filteredEntries: [],
    };
    const sandbox = {
        state,
        searchNormalizedWorldBookEntries,
        createFilteredSelection,
        updateSelectionMeta() { updated += 1; },
        renderEntries() { rendered += 1; },
        setStatus(value) { status = value; },
        invalidateClassification() {},
        globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(`${functionBlock('selectCurrentFilter')}\nglobalThis.run=selectCurrentFilter;`, sandbox);
    sandbox.globalThis.run();
    assert.equal(state.filteredEntries.length, 70);
    assert.equal(state.selectedIds.size, 70);
    assert.equal(state.selectionMode, EXTERNAL_WORLD_BOOK_SELECTION_MODE.FILTERED);
    assert.equal(updated, 1);
    assert.equal(rendered, 1);
    assert.match(status, /70/);
});

test('1B keeps selection labels accurate while making classification/save explicit', () => {
    assert.match(wizardSource, /button\('全选整本',\s*selectWholeBook/);
    assert.match(wizardSource, /button\('只选筛选结果',\s*selectCurrentFilter/);
    assert.match(wizardSource, /button\('清空选择',\s*clearSelection/);
    assert.doesNotMatch(wizardSource, /button\('整本导入'/);
    assert.doesNotMatch(wizardSource, /button\('只导入筛选结果'/);
    assert.match(wizardSource, /进入分类确认/);
    assert.match(wizardSource, /确认分类并保存到本地/);
    assert.match(wizardSource, /新库保存后默认停用，不会自动参与抽签/);
});
