// User-triggered only. The host owns Git/permissions; never reset, delete or reinstall.
let pending = null;
export function ownExtensionFolder(moduleUrl = import.meta.url) {
    const match = new URL(moduleUrl).pathname.match(/\/scripts\/extensions\/third-party\/([^/]+)\/src\/extensionUpdater\.js$/);
    if (!match) throw new Error('无法确认当前安装目录，未发送更新请求。请在扩展管理中检查安装。');
    const folder = decodeURIComponent(match[1]);
    if (!folder || /[\\/\u0000-\u001f]/.test(folder) || folder === '.' || folder === '..') throw new Error('安装目录无效，未发送更新请求。');
    return folder;
}
function failure(status) {
    if (status === 401 || status === 403) return '酒馆拒绝更新权限。全局安装可能需要管理员操作；此按钮不能绕过权限。';
    if (status === 404 || status === 405) return '当前酒馆没有提供此更新接口，或安装目录不存在。请使用宿主更新功能或安装包。';
    return '宿主更新失败。可能是仓库连接失败、非 Git 安装或本地文件冲突；请检查宿主日志。没有自动重试或重装。';
}
export function requestRabbitMirrorUpdate({ fetchImpl = globalThis.fetch.bind(globalThis), getHeaders, moduleUrl = import.meta.url } = {}) {
    if (pending) return pending;
    pending = (async () => {
        const folder = ownExtensionFolder(moduleUrl);
        const discovery = await fetchImpl('/api/extensions/discover', { cache: 'no-store' });
        if (!discovery.ok) throw new Error(failure(discovery.status));
        const entries = await discovery.json();
        if (!Array.isArray(entries)) throw new Error('宿主未返回有效安装列表，未发送更新请求。');
        const matches = entries.filter(e => e?.name === `third-party/${folder}` && ['local', 'global'].includes(e.type));
        // SillyTavern resolves a same-named local extension before the global one.
        const entry = matches.find(e => e.type === 'local') || matches.find(e => e.type === 'global');
        if (!entry) throw new Error('宿主未识别当前兔子镜安装，未发送更新请求。不会改动其他扩展。');
        const headers = getHeaders ? await getHeaders() : (await import('../../../../../script.js')).getRequestHeaders();
        const response = await fetchImpl('/api/extensions/update', {
            method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ extensionName: folder, global: entry.type === 'global' }),
        });
        if (!response.ok) throw new Error(failure(response.status));
        const result = await response.json();
        if (typeof result?.isUpToDate !== 'boolean') throw new Error('宿主返回了未识别的更新结果，请检查扩展版本后再操作；不会自动重复更新。');
        return { status: result.isUpToDate ? 'current' : 'updated' };
    })().finally(() => { pending = null; });
    return pending;
}
