import { EXTERNAL_WORLD_BOOK_ERROR_CODES, ExternalWorldBookError } from './errors.js?rmv=1.5.18-audit1c2';
import { EXTERNAL_WORLD_BOOK_MAX_FILE_BYTES } from './schema.js?rmv=1.5.18-audit1c2';
import { normalizeFileWorldBook } from './normalize.js?rmv=1.5.18-audit1c2';

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

export async function readLocalWorldBookFile(file) {
    if (!file || typeof file !== 'object') {
        throw new ExternalWorldBookError(EXTERNAL_WORLD_BOOK_ERROR_CODES.READ_FAILED, '没有选择世界书文件。');
    }
    const name = String(file.name || '').trim();
    if (name && !/\.json$/i.test(name)) {
        throw new ExternalWorldBookError(EXTERNAL_WORLD_BOOK_ERROR_CODES.FILE_TYPE_UNSUPPORTED, '第一版只支持 JSON 世界书文件。');
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
