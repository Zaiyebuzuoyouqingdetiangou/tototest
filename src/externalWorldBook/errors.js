export const EXTERNAL_WORLD_BOOK_ERROR_CODES = Object.freeze({
    CAPABILITY_UNAVAILABLE: 'WORLD_BOOK_CAPABILITY_UNAVAILABLE',
    LIST_FAILED: 'WORLD_BOOK_LIST_FAILED',
    NOT_FOUND: 'WORLD_BOOK_NOT_FOUND',
    READ_FAILED: 'WORLD_BOOK_READ_FAILED',
    SCHEMA_UNSUPPORTED: 'WORLD_BOOK_SCHEMA_UNSUPPORTED',
    ENTRIES_MISSING: 'WORLD_BOOK_ENTRIES_MISSING',
    ENTRY_CONTENT_INVALID: 'WORLD_BOOK_ENTRY_CONTENT_INVALID',
    ENTRY_STATE_CONFLICT: 'WORLD_BOOK_ENTRY_STATE_CONFLICT',
    FILE_TOO_LARGE: 'WORLD_BOOK_FILE_TOO_LARGE',
    JSON_INVALID: 'WORLD_BOOK_JSON_INVALID',
    FILE_TYPE_UNSUPPORTED: 'WORLD_BOOK_FILE_TYPE_UNSUPPORTED',
    STORAGE_UNAVAILABLE: 'WORLD_BOOK_STORAGE_UNAVAILABLE',
    STORAGE_QUOTA: 'WORLD_BOOK_STORAGE_QUOTA',
    STORAGE_WRITE_FAILED: 'WORLD_BOOK_STORAGE_WRITE_FAILED',
});

export class ExternalWorldBookError extends Error {
    constructor(code, message, details = undefined, options = undefined) {
        super(String(message || code), options);
        this.name = 'ExternalWorldBookError';
        this.code = String(code || EXTERNAL_WORLD_BOOK_ERROR_CODES.SCHEMA_UNSUPPORTED);
        if (details !== undefined) this.details = details;
    }
}

export function isExternalWorldBookError(error, code = '') {
    return error instanceof ExternalWorldBookError && (!code || error.code === code);
}
