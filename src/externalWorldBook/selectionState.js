export const EXTERNAL_WORLD_BOOK_SELECTION_MODE = Object.freeze({
    WHOLE: 'whole',
    FILTERED: 'filtered',
    MANUAL: 'manual',
});

export function entryIdentity(entry) {
    return `${entry?.sourceEntryUid ?? ''}:${entry?.sourceEntryId ?? ''}`;
}

export function entryIdentities(entries) {
    return new Set(Array.isArray(entries) ? entries.map(entryIdentity) : []);
}

export function createWholeBookSelection(book) {
    return Object.freeze({
        mode: EXTERNAL_WORLD_BOOK_SELECTION_MODE.WHOLE,
        selectedIds: entryIdentities(book?.entries),
    });
}

export function createFilteredSelection(entries) {
    return Object.freeze({
        mode: EXTERNAL_WORLD_BOOK_SELECTION_MODE.FILTERED,
        selectedIds: entryIdentities(entries),
    });
}

export function createEmptySelection() {
    return Object.freeze({
        mode: EXTERNAL_WORLD_BOOK_SELECTION_MODE.MANUAL,
        selectedIds: new Set(),
    });
}

export function toggleEntrySelection(selectedIds, identity, checked) {
    const next = new Set(selectedIds instanceof Set ? selectedIds : []);
    const key = String(identity || '');
    if (!key) return next;
    if (checked) next.add(key);
    else next.delete(key);
    return next;
}
