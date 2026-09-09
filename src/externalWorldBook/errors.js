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

const BATCH_PLAN_MESSAGES = Object.freeze({
    BATCH_PLAN_INPUT_INVALID: '面数或计划输入不合法。',
    BATCH_PLAN_IDENTITY_INVALID: '本轮聊天、回复或 Swipe 身份不完整。',
    BATCH_PLAN_DUPLICATE_ID: '同一面的抽取记录包含重复编号。',
    BATCH_PLAN_COMBO_INVALID: '某一面的主题或展现形式记录不合法。',
    BATCH_PLAN_INVALID: '本轮计划校验未通过，具体原因尚未确认。',
    BATCH_PLAN_TOO_LARGE: '多面计划体积超过本地保存上限。',
    BATCH_SETTINGS_TOO_LARGE: '抽取设置记录过长，无法建立本轮计划。',
    BATCH_CANDIDATE_POOL_EXHAUSTED: '当前可抽取的不同主题或展现形式不足以组成所选面数。',
    BATCH_SELECTION_INCOMPLETE: '某一面没有抽到完整的主题或展现形式。',
    BATCH_PREVIEW_NOT_DISPATCHABLE: '预览计划不能作为正式生成请求发送。',
    BATCH_REGISTRY_UNREADABLE: '本地生成任务登记无法读取；请保留数据，不要清缓存。',
    BATCH_ID_CONFLICT: '同一任务编号对应的计划发生冲突。',
    BATCH_REGISTRY_CAPACITY: '本地仍保留 8 项生成任务登记，暂不能新增。这不是 API 额度不足，也不代表当前真的有 8 个网络请求。',
    BATCH_REGISTRY_TOO_LARGE: '本地生成任务登记体积达到上限。',
    BATCH_STORAGE_UNAVAILABLE: '浏览器暂时无法访问抽取记录存储。',
    BATCH_FAIRNESS_STATE_INVALID: '本地随机冷却记录无法校验；请保留数据。',
    BATCH_FAIRNESS_PLAN_MISMATCH: '本轮计划与随机冷却候选记录不一致。',
    BATCH_ATTEMPT_ALREADY_RECORDED: '这份计划已经登记过尝试，不能重复消费同一计划。',
    BATCH_STORAGE_CHANGED: '保存期间另一操作更新了本地抽取记录。',
    BATCH_STORAGE_WRITE_FAILED: '本地抽取记录写入失败。',
    BATCH_STORAGE_READBACK_MISMATCH: '本地抽取记录写入后复核不一致。',
    BATCH_STORAGE_QUOTA_EXCEEDED: '浏览器本地存储空间不足；请先备份，不要直接清除站点数据。',
});

export function describeBatchPlanFailure(reasonCode) {
    const code = typeof reasonCode === 'string' && Object.hasOwn(BATCH_PLAN_MESSAGES, reasonCode)
        ? reasonCode : 'BATCH_PLAN_INVALID';
    return Object.freeze({ code, message: BATCH_PLAN_MESSAGES[code] });
}

// Fixed, local diagnostics only: never forward an exception's message/details,
// which may contain an imported title, source body or provider response.
const PREFLIGHT_MESSAGES = Object.freeze({
    MULTIFACE_PLAN_UNAVAILABLE: '本轮多面抽取计划无法建立。请检查可用条目数、面数和抽取设置；这不表示已保存的外部库损坏。',
    RABBIT_MIRROR_DISPATCH_LEASE_REJECTED: '准备期间本轮消息或生成归属已变化，本轮已停止。请等目标正文完成后手动重试；不必重新分类外部库。',
    RABBIT_MIRROR_EXTERNAL_PREFETCH_STALE: '读取期间聊天或本轮输入已变化。请等当前正文完成后重试；不必重新分类外部库。',
    RABBIT_MIRROR_EXTERNAL_METADATA_REBUILD_REQUIRED: '旧外部库缺少抽签索引。请到“管理母本库”点击“重建抽签索引”。',
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
    if (code === 'MULTIFACE_PLAN_UNAVAILABLE' && typeof error?.reasonCode === 'string') {
        const reason = describeBatchPlanFailure(error.reasonCode);
        return Object.freeze({ code, reasonCode: reason.code,
            message: `本轮多面抽取计划无法建立：${reason.message} 诊断原因：${reason.code}。这不表示已保存的外部库损坏。` });
    }
    return Object.freeze({ code, message: PREFLIGHT_MESSAGES[code] || '外部母本准备失败，原因尚未确认。请保留诊断码，不要删除已导入的库。' });
}
