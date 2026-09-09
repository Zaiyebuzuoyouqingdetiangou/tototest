import { EXTERNAL_WORLD_BOOK_ERROR_CODES, ExternalWorldBookError } from './errors.js?rmv=1.5.36-update1';
import { EXTERNAL_WORLD_BOOK_MAX_FILE_BYTES } from './schema.js?rmv=1.5.36-update1';
import { normalizeFileWorldBook } from './normalize.js?rmv=1.5.36-update1';

async function readFileText(file) {
    if (typeof file?.text === 'function') return file.text();
    if (typeof FileReader === 'undefined') {
        throw new ExternalWorldBookError(EXTERNAL_WORLD_BOOK_ERROR_CODES.READ_FAILED, '当前浏览器无法读取本地文件。');
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new ExternalWorldBookError(EXTERNAL_WORLD_BOOK_ERROR_CODES.READ_FAILED, '本地文件读取失败。'));
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.readAsText(file);
    });
}

function fileIdentity(file) {
    const name = String(file?.name || 'worldbook.json');
    const size = Number(file?.size || 0);
    const lastModified = Number(file?.lastModified || 0);
    return `${name}:${size}:${lastModified}`;
}

export function readPlainTextWorldBook(text, options = {}) {
    if (typeof text !== 'string' || !text.trim()) throw new ExternalWorldBookError(EXTERNAL_WORLD_BOOK_ERROR_CODES.ENTRY_CONTENT_INVALID, '请填写要导入的小剧场文字。');
    if (text.length > 1000000 || new TextEncoder().encode(text).byteLength > EXTERNAL_WORLD_BOOK_MAX_FILE_BYTES) {
        throw new ExternalWorldBookError(EXTERNAL_WORLD_BOOK_ERROR_CODES.FILE_TOO_LARGE, '单份纯文字最多 100 万字符、8 MiB；请分成较小的内容，不会自动截断。');
    }
    const name = String(options.name || '我的小剧场文字').trim().slice(0, 1000) || '我的小剧场文字';
    // A bounded identity only; never put the pasted body into light source metadata.
    let fingerprint = 2166136261, second = 5381;
    for (let i = 0; i < text.length; i++) { const code = text.charCodeAt(i); fingerprint = Math.imul(fingerprint ^ code, 16777619); second = Math.imul(second, 33) ^ code; }
    return normalizeFileWorldBook({ name, entries: [{ uid: 0, comment: name, content: text }] }, {
        sourceId: options.sourceId || `plain-text:${(fingerprint >>> 0).toString(36)}-${(second >>> 0).toString(36)}:${name}`,
        sourceName: name,
    });
}

export async function readLocalWorldBookFile(file) {
    if (!file || typeof file !== 'object') {
        throw new ExternalWorldBookError(EXTERNAL_WORLD_BOOK_ERROR_CODES.READ_FAILED, '没有选择世界书文件。');
    }
    const name = String(file.name || '').trim();
    if (name && !/\.(?:json|txt|md)$/i.test(name)) {
        throw new ExternalWorldBookError(EXTERNAL_WORLD_BOOK_ERROR_CODES.FILE_TYPE_UNSUPPORTED, '支持 JSON 世界书，以及 TXT / MD 纯文字文件。');
    }
    const size = Number(file.size || 0);
    if (size > EXTERNAL_WORLD_BOOK_MAX_FILE_BYTES) {
        throw new ExternalWorldBookError(
            EXTERNAL_WORLD_BOOK_ERROR_CODES.FILE_TOO_LARGE,
            `世界书文件超过 ${Math.round(EXTERNAL_WORLD_BOOK_MAX_FILE_BYTES / 1024 / 1024)} MB 安全上限。`,
            { size },
        );
    }
    const text = await readFileText(file);
    if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > EXTERNAL_WORLD_BOOK_MAX_FILE_BYTES) {
        throw new ExternalWorldBookError(EXTERNAL_WORLD_BOOK_ERROR_CODES.FILE_TOO_LARGE, '本地文件超过 8 MiB 安全上限。');
    }
    if (/\.(?:txt|md)$/i.test(name)) return readPlainTextWorldBook(text, { name: name.replace(/\.(?:txt|md)$/i, ''), sourceId: fileIdentity(file) });
    let raw;
    try {
        raw = JSON.parse(text);
    } catch (cause) {
        throw new ExternalWorldBookError(EXTERNAL_WORLD_BOOK_ERROR_CODES.JSON_INVALID, '世界书 JSON 无法解析。', undefined, { cause });
    }
    return normalizeFileWorldBook(raw, {
        fileName: name || 'worldbook.json',
        fileFingerprint: fileIdentity(file),
    });
}
