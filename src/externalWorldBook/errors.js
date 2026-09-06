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

// Fixed, local diagnostics only: never forward an exception's message/details,
// which may contain an imported title, source body or provider response.
const PREFLIGHT_MESSAGES = Object.freeze({
    RABBIT_MIRROR_EXTERNAL_PREFETCH_STALE: '读取期间聊天或本轮输入已变化。请等当前正文完成后重试；不必重新分类外部库。',
    RABBIT_MIRROR_EXTERNAL_METADATA_REBUILD_REQUIRED: '旧外部库缺少抽签索引。请到“管理已保存内容”点击“重建抽签索引”。',
    RABBIT_MIRROR_EXTERNAL_MATERIAL_MISSING: '本轮抽中的条目没有读到。请检查已保存的外部库是否仍存在且已启用。',
    RABBIT_MIRROR_EXTERNAL_MATERIAL_INVALID: '本轮抽中的条目内容或分类与抽签记录不一致。请检查该本地库后重试。',
    WORLD_BOOK_NOT_FOUND: '本轮抽中的条目或本地库已不存在。请检查已保存内容后重试。',
    WORLD_BOOK_ENTRY_STATE_CONFLICT: '本轮抽中的条目已停用或分类已改变。请检查已保存内容后重试。',
    WORLD_BOOK_ENTRY_CONTENT_INVALID: '本轮抽中的条目没有可用正文。请检查原 JSON 后重新导入。',
    WORLD_BOOK_STORAGE_UNAVAILABLE: '浏览器本地数据库不可用或被其它酒馆页面占用。请关闭其它同站页面并检查浏览器存储权限。',
    WORLD_BOOK_STORAGE_QUOTA: '浏览器本地存储空间不足。请先备份并整理该站点的存储空间。',
    WORLD_BOOK_STORAGE_WRITE_FAILED: '无法打开或更新本地数据库。请检查浏览器存储权限；不要直接清除站点数据。',
    WORLD_BOOK_READ_FAILED: '浏览器读取本轮外部条目失败。请稍后重试，并保留诊断码。',
});

export function describeExternalWorldBookPreflightFailure(error) {
    const candidate = typeof error?.code === 'string' ? error.code : '';
    const code = Object.hasOwn(PREFLIGHT_MESSAGES, candidate) ? candidate : 'RABBIT_MIRROR_EXTERNAL_PREFLIGHT_UNKNOWN';
    return Object.freeze({ code, message: PREFLIGHT_MESSAGES[code] || '外部母本准备失败，原因尚未确认。请保留诊断码，不要删除已导入的库。' });
}
