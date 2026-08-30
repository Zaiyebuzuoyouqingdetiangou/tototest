import { DEFAULT_INDEPENDENT_CONTEXT_EXCLUDED_TAGS, DEFAULT_VISUAL_PROMPT, INDEPENDENT_CONTEXT_EXCLUDED_TAG_MAX_COUNT, VISUAL_AVOID_PROMPT_MAX_CHARS, VISUAL_EXTRA_PROMPT_MAX_CHARS, VISUAL_PROMPT_MAX_CHARS, getSettings, normalizeIndependentContextExcludedTags, updateSettings, resetSettings } from './settings.js?rmv=1.5-varietyfix1';
import { clearLastCombo } from './storage.js?rmv=1.5-varietyfix1';
import { clearRabbitMirrorPrompt } from './injector.js?rmv=1.5-varietyfix1';
import { clearFeedbackCatExtensionPrompt, getActiveFeedbackForCurrentChat, syncFeedbackCatExtensionPrompt } from './feedbackCat.js?rmv=1.5-varietyfix1';
import { configureMaintenanceAutoSafeMode, refreshFeedbackCats, refreshMaintenanceRabbits, refreshRecipeButtons } from './outputSanitizer.js?rmv=1.5-varietyfix1';
import { scanMemoryPlugins, testMemoryProvider } from './memoryScanner.js?rmv=1.4.30.17';
import { getLastRabbitMirrorTokenRecordForSource, TOKEN_METER_EVENT } from './tokenMeter.js?rmv=1.5-varietyfix1';
import { API_REQUEST_DIAGNOSTIC_EVENT, WORLD_INFO_BOOKS_CHANGED_EVENT, fetchIndependentModels, fetchWorldInfoBooks, getIndependentConnectionProfiles, getIndependentSavedModels, getLastIndependentApiRequestDiagnostic, getLastIndependentModelListDiagnostic, getObservedWorldInfoBooks, importCurrentSillyTavernConnection, refreshRabbitMirrorGenerationMode, scanCurrentChatIndependentContextTags, testIndependentConnection } from './independentApi.js?rmv=1.5-varietyfix1';
import { BLACKLIST_CHANGED_EVENT, blacklistEntries, blacklistPoolStats, clearBlacklist, removeBlacklistItem, setBlacklistEnabled, favoriteEntries, removeFavoriteItem, setFavoriteMultiplier, clearFavorites } from './blacklist.js?rmv=1.5-varietyfix1';

const SETTINGS_UI_VERSION = '1.5';
const RUNTIME_VERSION = '1.5.5';

function isCurrentRuntime() {
    return globalThis.__rabbitMirrorRuntimeVersion === RUNTIME_VERSION;
}
let uiMountRetryTimer = 0;
let uiMountRetryCount = 0;
let pulledWorldInfoBooks = [];
let worldInfoBookRenderTimer = 0;
let worldInfoBookVisibilityObserver = null;
let worldInfoBookCurrentVisible = false;
let worldInfoBookCurrentDirty = true;
let retainedExternalDiagnosticReport = '';
let retainedExternalDiagnosticStatus = null;
const WORLD_INFO_BOOK_RENDER_DEBOUNCE_MS = 140;

function scheduleUiMountRetry() {
    if (!isCurrentRuntime() || uiMountRetryTimer || uiMountRetryCount >= 20) return;
    uiMountRetryCount += 1;
    globalThis.__rabbitMirrorPerfDiag?.mark?.('ui.mountRetryScheduled', { retry: uiMountRetryCount });
    uiMountRetryTimer = setTimeout(() => {
        uiMountRetryTimer = 0;
        initRabbitMirrorUI();
    }, Math.min(1000, 120 + uiMountRetryCount * 40));
}

function checked(id, value) {
    $(id).prop('checked', !!value);
}

function renderVisualPromptStatus(settings = getSettings()) {
    const target = $('#rh_visual_prompt_status');
    if (!target.length) return;
    const enabled = !!settings?.visualPromptEditingEnabled;
    const official = String(settings?.visualPrompt ?? DEFAULT_VISUAL_PROMPT).replace(/\r\n?/g, '\n');
    const extra = String(settings?.visualExtraPrompt || '').trim();
    const avoid = String(settings?.visualAvoidPrompt || '').trim();
    const parts = [];
    if (official !== DEFAULT_VISUAL_PROMPT) parts.push('通用视觉规则已修改');
    if (extra) parts.push('额外视觉偏好已保存');
    if (avoid) parts.push('视觉避雷已保存');
    // 1.3.69: 开启编辑后，「通用视觉审美规则」这一栏就是整套配色组织与反通用面板规则的
    // 唯一来源（关闭时走 legacyPresentationEmbodimentRule 内置同样内容）。清空它不会报错，
    // 但下一面开始这些规则会整体消失，只有画面变差能看出来，因此这里明确提示。
    if (enabled && !official.trim()) {
        target.text('当前：编辑注入已启用，但「通用视觉审美规则」为空。配色组织与反通用面板规则这一整层不会发送；如非刻意，请点「恢复默认通用视觉规则」。');
        return;
    }
    if (!enabled) {
        target.text(parts.length
            ? `当前：编辑注入未启用，仍走 1.3.20 原版视觉流程；已保存内容不会发送（${parts.join(' / ')}）。`
            : '当前：编辑注入未启用，下一面仍走 1.3.20 原版视觉流程。');
        return;
    }
    target.text(parts.length
        ? `当前：编辑注入已启用（${parts.join(' / ')}）`
        : '当前：编辑注入已启用；使用可编辑的通用视觉规则。');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}


function renderBlacklistSettings() {
    const target = $('#rh_blacklist_summary');
    if (!target.length) return;
    const settings = getSettings();
    const themes = blacklistEntries('theme');
    const formats = blacklistEntries('format');
    const stats = blacklistPoolStats();
    const row = item => `<div style="display:flex;align-items:center;gap:7px;padding:5px 0;border-bottom:1px solid color-mix(in srgb,currentColor 10%,transparent);">
      <span style="min-width:0;flex:1;overflow-wrap:anywhere;">${escapeHtml(item.id)} ${escapeHtml(item.title)}</span>
      <button type="button" class="menu_button rh-blacklist-remove" data-kind="${escapeHtml(item.kind)}" data-id="${escapeHtml(item.id)}" style="padding:2px 7px;min-height:24px;">解除</button>
    </div>`;
    const section = (title, items) => `<div style="margin-top:7px;"><div style="font-weight:700;font-size:11px;opacity:.74;margin-bottom:2px;">${title}（${items.length}）</div>${items.length ? items.map(row).join('') : '<div style="opacity:.55;font-size:11px;padding:3px 0;">暂无</div>'}</div>`;
    const warnings = [];
    if (stats.themePoolEmpty) warnings.push('主题 / 元素候选已全部加入黑名单，随机主题将没有候选。');
    if (stats.formatPoolEmpty) warnings.push('展现形式候选已全部加入黑名单，随机形式将没有候选。');
    target.html(`<div style="font-size:11px;line-height:1.5;opacity:.78;">当前${settings.blacklistEnabled !== false ? '启用' : '暂停'}；主题 / 元素 ${themes.length}/${stats.themeTotal}，展现形式 ${formats.length}/${stats.formatTotal}。黑名单只过滤随机抽取，不向模型追加任何 Prompt。</div>
      ${warnings.length ? `<div style="margin-top:5px;color:#d97706;font-size:11px;line-height:1.45;">${warnings.map(escapeHtml).join('<br>')}</div>` : ''}
      ${section('主题 / 元素', themes)}
      ${section('展现形式', formats)}`);
}

function renderFavoriteSettings() {
    const target = $('#rh_favorite_summary');
    if (!target.length) return;
    const themes = favoriteEntries('theme');
    const formats = favoriteEntries('format');
    const row = item => `<div style="display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:7px;padding:6px 0;border-bottom:1px solid color-mix(in srgb,currentColor 10%,transparent);">
      <span style="min-width:0;overflow-wrap:anywhere;">${escapeHtml(item.id)} ${escapeHtml(item.title)}</span>
      <label style="display:flex;align-items:center;gap:4px;font-size:11px;white-space:nowrap;">倍率 ×<input class="text_pole rh-favorite-multiplier" type="number" min="1" max="50" step="0.5" value="${escapeHtml(item.multiplier)}" data-kind="${escapeHtml(item.kind)}" data-id="${escapeHtml(item.id)}" style="width:66px;min-height:28px;padding:2px 5px;"></label>
      <button type="button" class="menu_button rh-favorite-remove" data-kind="${escapeHtml(item.kind)}" data-id="${escapeHtml(item.id)}" style="padding:2px 7px;min-height:28px;">取消</button>
    </div>`;
    const section = (title, items) => `<div style="margin-top:7px;"><div style="font-weight:700;font-size:11px;opacity:.74;margin-bottom:2px;">${title}（${items.length}）</div>${items.length ? items.map(row).join('') : '<div style="opacity:.55;font-size:11px;padding:3px 0;">暂无收藏</div>'}</div>`;
    target.html(`<div style="font-size:11px;line-height:1.5;opacity:.78;">收藏室只调整本地随机权重，不向模型追加 Prompt；每项倍率可设为 ×1～×50。</div>${section('主题 / 元素', themes)}${section('展现形式', formats)}`);
}

function worldInfoSourceLabel(value) {
    return ({ characterLore: '角色', chatLore: '当前聊天', personaLore: 'Persona', globalLore: '当前全局' })[String(value || '')] || String(value || '');
}
function renderWorldInfoRows(target, books, disabled, emptyText) {
    if (!target.length) return;
    const rows = books.map((item, index) => {
        const enabled = !disabled.has(item.id);
        const identity = item.label !== item.id ? `<br><span style="opacity:.55;font-size:10px;">${escapeHtml(item.id)}</span>` : '';
        const sourceText = Array.isArray(item.sources) && item.sources.length
            ? item.sources.map(worldInfoSourceLabel).filter(Boolean).join(' / ')
            : item.note || '';
        return `<label class="checkbox_label" style="display:flex;align-items:flex-start;gap:7px;margin:4px 0;">
          <input class="rh-world-info-book-toggle" type="checkbox" data-book-index="${index}" data-book-id="${escapeHtml(item.id)}" ${enabled ? 'checked' : ''}>
          <span style="min-width:0;flex:1;overflow-wrap:anywhere;"><b>${escapeHtml(item.label)}</b>${identity}${sourceText ? `<br><span style="opacity:.6;font-size:10px;">${escapeHtml(sourceText)}</span>` : ''}</span>
        </label>`;
    }).join('');
    target.data('rm-world-info-books', books.map(item => item.id));
    target.html(books.length ? rows : `<div style="font-size:11px;line-height:1.4;opacity:.66;">${escapeHtml(emptyText)}</div>`);
}
function clearWorldInfoBookRenderTimer() {
    if (!worldInfoBookRenderTimer) return;
    clearTimeout(worldInfoBookRenderTimer);
    worldInfoBookRenderTimer = 0;
}
function renderWorldInfoBookSettings({ current = true, all = false } = {}) {
    const currentTarget = $('#rh_world_info_book_filters');
    const allTarget = $('#rh_world_info_all_book_filters');
    if (!currentTarget.length && !allTarget.length) return;
    const settings = getSettings();
    const disabled = new Set(Array.isArray(settings.independentWorldInfoDisabledBooks) ? settings.independentWorldInfoDisabledBooks : []);

    if (current && currentTarget.length) {
        const currentBooks = getObservedWorldInfoBooks().map(item => ({
            id: String(item?.name || '').trim(),
            label: String(item?.name || '').trim(),
            sources: item?.sources || [],
        })).filter(item => item.id);
        renderWorldInfoRows(
            currentTarget,
            currentBooks,
            disabled,
            '当前聊天还没有观察到酒馆加载的世界书。进入角色聊天并正常生成后会自动显示当前聊天相关世界书；不会为了列表重新扫描条目。',
        );
        worldInfoBookCurrentDirty = false;
    }

    const allDetails = document.getElementById('rh_world_info_all_books');
    if (!all || !allTarget.length || !allDetails?.open) return;
    const byId = new Map();
    for (const item of pulledWorldInfoBooks) {
        const id = String(item?.id || item?.name || '').trim(); if (!id) continue;
        byId.set(id, { id, label: String(item?.label || id).trim() || id, sources: [], note: '全部世界书' });
    }
    for (const id of disabled) {
        if (!byId.has(id)) byId.set(id, { id, label: id, sources: [], note: '已保存为关闭' });
    }
    const allBooks = [...byId.values()].sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id), 'zh-Hans-CN'));
    renderWorldInfoRows(allTarget, allBooks, disabled, '尚未拉取全部世界书。');
}
function scheduleWorldInfoBookSettingsRender(delay = WORLD_INFO_BOOK_RENDER_DEBOUNCE_MS) {
    worldInfoBookCurrentDirty = true;
    clearWorldInfoBookRenderTimer();
    // When the extension drawer is closed, do not build even the current-chat checkbox DOM.
    // IntersectionObserver will render it when the user actually exposes this settings area.
    if (worldInfoBookVisibilityObserver && !worldInfoBookCurrentVisible) return;
    worldInfoBookRenderTimer = setTimeout(() => {
        worldInfoBookRenderTimer = 0;
        if (!isCurrentRuntime() || !worldInfoBookCurrentDirty) return;
        renderWorldInfoBookSettings({ current: true, all: false });
    }, Math.max(0, Number(delay) || 0));
}
function disconnectWorldInfoBookVisibilityObserver() {
    try { worldInfoBookVisibilityObserver?.disconnect?.(); } catch {}
    worldInfoBookVisibilityObserver = null;
    worldInfoBookCurrentVisible = false;
}
function installWorldInfoBookVisibilityObserver() {
    disconnectWorldInfoBookVisibilityObserver();
    const target = document.getElementById('rh_world_info_book_filters');
    if (!target) return;
    if (typeof IntersectionObserver !== 'function') {
        worldInfoBookCurrentVisible = true;
        scheduleWorldInfoBookSettingsRender(0);
        return;
    }
    worldInfoBookVisibilityObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (entry.target !== target) continue;
            worldInfoBookCurrentVisible = entry.isIntersecting === true;
            if (worldInfoBookCurrentVisible && worldInfoBookCurrentDirty) scheduleWorldInfoBookSettingsRender(0);
        }
    }, { root: null, threshold: 0 });
    worldInfoBookVisibilityObserver.observe(target);
}
function clearCollapsedAllWorldInfoBookRows() {
    const target = $('#rh_world_info_all_book_filters');
    if (!target.length) return;
    target.removeData('rm-world-info-books');
    target.html('<div style="font-size:11px;line-height:1.4;opacity:.66;">折叠时不创建完整世界书列表；展开后按需渲染。</div>');
}

function independentApiProfileLabel(diagnostic) {
    if (!diagnostic?.profile) return '暂无记录';
    const numericStatus = Number(diagnostic.status || 0);
    const status = diagnostic.ok
        ? '成功'
        : numericStatus > 0
            ? `失败 HTTP ${numericStatus}`
            : diagnostic.transportCause === 'connection-interrupted'
                ? '连接中断（未收到完整响应）'
                : '未收到 HTTP 响应';
    const temp = diagnostic.temperatureSent ? `温度 ${Number(diagnostic.configuredTemperature ?? 0.8)}` : '默认温度';
    const stream = diagnostic.streamSent ? '流式' : '非流式';
    return `${status}｜${temp}｜${stream}`;
}

function independentModelPullSnapshotMatches(snapshot,state) {
    state=state||{};
    if(!snapshot || Number(snapshot.epoch)!==Number(state.epoch)) return false;
    if(Number(snapshot.profileRevision)!==Number(state.profileRevision)) return false;
    if(String(snapshot.activeProfileId||'').trim()!==String(state.activeProfileId||'').trim()) return false;
    if(snapshot.source?.mode==='profile') return String(snapshot.source.profileId||'').trim()===String(state.activeProfileId||'').trim();
    if(snapshot.source?.mode==='manual') return String(snapshot.source.baseUrl||'').trim()===String(state.manualBaseUrl||'').trim()
        && String(snapshot.source.apiKey||'')===String(state.manualApiKey||'');
    return false;
}

let independentModelPullEpoch = 0;

function invalidateIndependentModelPull() {
    independentModelPullEpoch += 1;
}

function beginIndependentConnectionOperation() {
    const next = Number(globalThis.__rabbitMirrorIndependentConnectionOperationRevision || 0) + 1;
    globalThis.__rabbitMirrorIndependentConnectionOperationRevision = next;
    return next;
}

function independentConnectionOperationIsCurrent(revision) {
    return isCurrentRuntime()
        && Number(globalThis.__rabbitMirrorIndependentConnectionOperationRevision || 0) === Number(revision);
}

function renderIndependentApiDiagnostic(diagnostic = getLastIndependentApiRequestDiagnostic()) {
    const target = $('#rh_independent_api_diagnostic');
    if (!target.length) return;
    const text = independentApiProfileLabel(diagnostic);
    const attempts = '';
    const themes = Array.isArray(diagnostic?.themeLabels) ? diagnostic.themeLabels.join('＋') : '';
    const formats = Array.isArray(diagnostic?.formatLabels) ? diagnostic.formatLabels.join('＋') : '';
    const requestedModel = String(diagnostic?.model || '').trim();
    const model = requestedModel ? `<br><b>请求指定模型：</b>${escapeHtml(requestedModel)}` : '';
    const selection = themes || formats ? `<br><b>抽到：</b>${escapeHtml(themes || '仅当前语境')}｜${escapeHtml(formats || '未记录')}` : '';
    const worldInfo = diagnostic?.globalWorldInfoEnabled
        ? `<br><b>世界书：</b>${diagnostic.globalWorldInfoCaptured ? `已带入 ${formatMeterNumber(diagnostic.globalWorldInfoEntries)}／${formatMeterNumber(diagnostic.globalWorldInfoTotalEntries || diagnostic.globalWorldInfoEntries)} 条，${formatMeterNumber(diagnostic.globalWorldInfoChars)} 字符${diagnostic.globalWorldInfoTruncated ? '（已按独立预算裁剪）' : ''}` : '本轮无可用条目'}`
        : '<br><b>世界书：</b>关闭';
    target.html(`<b>最近请求：</b>${escapeHtml(text)}${escapeHtml(attempts)}${model}${selection}${worldInfo}`);
}


function formatMeterNumber(value) {
    return Math.max(0, Number(value) || 0).toLocaleString('zh-CN');
}

function tokenMeterNoInjectionLabel(reason) {
    const labels = {
        disabled: '本轮未注入：兔子镜已关闭',
        'quiet-skipped': '本轮未注入：静默生成已跳过',
        'impersonate-skipped': '本轮未注入：角色扮演生成已跳过',
        'directive-skipped': '本轮未注入：用户指令要求跳过',
        'independent-api': '本轮未注入：兔子镜由独立 API 生成',
        'mode-change': '当前注入已按生成方式切换清空',
        empty: '本轮未注入：没有形成有效 Prompt',
        cleared: '当前注入已清空',
        manual: '当前注入已手动清空',
    };
    return labels[String(reason || '')] || '本轮未注入';
}

function renderTokenMeter(record = getLastRabbitMirrorTokenRecordForSource(getSettings().generationSource)) {
    const root = $('#rh_token_meter');
    if (!root.length) return;
    const main = root.find('[data-rh-token-meter-main]');
    const exact = root.find('[data-rh-token-meter-exact]');
    const detail = root.find('[data-rh-token-meter-detail]');
    if (!record) {
        main.text('尚无生成记录');
        exact.text('下一轮生成后更新。');
        detail.text('只统计兔子镜自己的 Prompt。');
        return;
    }
    if (record.status === 'independent') {
        const tokens = record.tokens || {};
        const chars = record.chars || {};
        main.text(`兔子镜规则约 ${formatMeterNumber(tokens.estimated)} Token`);
        const layerText = chars.independentContextLayers
            ? ` · 最近 ${formatMeterNumber(chars.independentContextLayers)}/${formatMeterNumber(chars.independentContextMaxLayers || chars.independentContextLayers)} 层`
            : '';
        const filteredText = [
            chars.filteredRabbitMirrorChars ? `历史兔子镜 ${formatMeterNumber(chars.filteredRabbitMirrorChars)} 字符` : '',
            chars.filteredContextTagChars ? `指定标签 ${formatMeterNumber(chars.filteredContextTagChars)} 字符` : '',
        ].filter(Boolean).join(' · ');
        exact.text(`规则约 ${formatMeterNumber(tokens.min)}–${formatMeterNumber(tokens.max)} Token；上下文 ${formatMeterNumber(chars.independentContext)} 字符${layerText}${filteredText ? ` · 已过滤 ${filteredText}` : ''}。`);
        const parts = [
            `基础约 ${formatMeterNumber(tokens.baseEstimated)}`,
            chars.feedback ? `反馈约 ${formatMeterNumber(tokens.feedbackEstimated)}` : '反馈 0',
            chars.executionLock ? `输出保护约 ${formatMeterNumber(tokens.executionLockEstimated)}` : '',
            `参考内容 ${formatMeterNumber(chars.motherLibrary)} 字符`,
            chars.sharedMemory ? `回忆资料 ${formatMeterNumber(chars.sharedMemory)} 字符` : '',
            chars.editableVisual ? `自定义视觉 ${formatMeterNumber(chars.editableVisual)} 字符` : '',
        ].filter(Boolean);
        detail.text(parts.join('；'));
        return;
    }
    if (record.status !== 'injected') {
        main.text('0 Token');
        exact.text(tokenMeterNoInjectionLabel(record.reason));
        detail.text('本轮没有追加兔子镜 Prompt。');
        return;
    }

    const tokens = record.tokens || {};
    const chars = record.chars || {};
    main.text(`约 ${formatMeterNumber(tokens.estimated)} Token`);
    exact.text(`保守范围 ${formatMeterNumber(tokens.min)}–${formatMeterNumber(tokens.max)}；精确字符数 ${formatMeterNumber(chars.total)}`);
    const parts = [
        `基础约 ${formatMeterNumber(tokens.baseEstimated)}`,
        chars.feedback ? `反馈约 ${formatMeterNumber(tokens.feedbackEstimated)}` : '反馈 0',
        `参考内容 ${formatMeterNumber(chars.motherLibrary)} 字符`,
        chars.sharedMemory ? `回忆资料 ${formatMeterNumber(chars.sharedMemory)} 字符` : '',
        chars.editableVisual ? `自定义视觉 ${formatMeterNumber(chars.editableVisual)} 字符` : '',
    ].filter(Boolean);
    detail.text(parts.join('；'));
}

function attachTokenMeterListener() {
    try { globalThis.__rabbitMirrorTokenMeterUiCleanup?.(); } catch {}
    try { globalThis.__rabbitMirrorBlacklistUiCleanup?.(); } catch {}
    globalThis.__rabbitMirrorBlacklistUiCleanup = null;
    // Select the record for the currently visible generation mode. A host-side
    // "main API 0 Token" bookkeeping event must not hide the latest independent
    // API measurement.
    const handler = () => renderTokenMeter();
    globalThis.addEventListener?.(TOKEN_METER_EVENT, handler);
    globalThis.__rabbitMirrorTokenMeterUiCleanup = () => globalThis.removeEventListener?.(TOKEN_METER_EVENT, handler);
}

function renderMemoryScanResults(results) {
    const settings = getSettings();
    const selected = new Set(settings.memoryProviderIds || []);
    const container = $('#rh_memory_scan_results');
    if (!container.length) return;

    const list = Array.isArray(results) ? results : [];
    const readable = list.filter(item => item?.readable && item?.selectedAllowed);
    const pending = list.filter(item => !item?.readable);

    const contextBlock = `<div class="rh-memory-context" style="padding:8px 0 9px 0;">
      <div style="font-size:12px;"><b>当前模型上下文</b> <span style="font-size:11px;opacity:.82;">[已可用]</span></div>
      <div style="margin-top:3px;opacity:.68;font-size:11px;line-height:1.45;">近期对话、已注入世界书，以及模型当前已经获得的摘要或总结；无需由兔子镜重复读取。</div>
    </div>`;

    const readableRows = readable.map(item => {
        const checkedAttr = selected.has(item.id) ? ' checked' : '';
        return `<div class="rh-memory-provider" style="padding:8px 0;border-top:1px solid color-mix(in srgb, var(--SmartThemeBorderColor) 65%, transparent);">
          <label class="checkbox_label" style="align-items:flex-start;">
            <input class="rh-memory-provider-check" type="checkbox" data-provider-id="${escapeHtml(item.id)}"${checkedAttr}>
            <span><b>${escapeHtml(item.name)}</b> <span style="font-size:11px;opacity:.82;">[可读取]</span><br><span style="opacity:.7;font-size:11px;line-height:1.45;">来源类型：公开资料接口</span></span>
          </label>
          ${item.details ? `<div style="margin:3px 0 0 26px;opacity:.62;font-size:11px;line-height:1.4;word-break:break-word;">${escapeHtml(item.details)}</div>` : ''}
          <button class="menu_button rh-memory-test" type="button" data-provider-id="${escapeHtml(item.id)}" style="margin:6px 0 0 26px;padding:3px 8px;min-height:unset;font-size:12px;">测试读取</button>
        </div>`;
    }).join('');

    const readableBlock = readableRows || '<div style="opacity:.75;font-size:12px;line-height:1.5;padding:6px 0;">未检测到可额外读取的资料来源。</div>';

    let pendingBlock = '';
    if (pending.length) {
        const visiblePending = pending.slice(0, 10);
        const pendingRows = visiblePending.map(item => `<div style="padding:5px 0;border-top:1px solid color-mix(in srgb, var(--SmartThemeBorderColor) 45%, transparent);">
          <div style="font-size:12px;"><b>${escapeHtml(item.name)}</b> <span style="opacity:.58;font-size:11px;">[待适配]</span></div>
          <div style="opacity:.6;font-size:11px;line-height:1.4;word-break:break-word;">${escapeHtml(item.source || item.status || '')}</div>
        </div>`).join('');
        const omitted = pending.length > visiblePending.length
            ? `<div style="padding-top:5px;opacity:.58;font-size:11px;">另有 ${pending.length - visiblePending.length} 个候选未展开显示。</div>`
            : '';
        pendingBlock = `<details class="rh-memory-pending" style="margin-top:8px;border-top:1px dashed color-mix(in srgb, var(--SmartThemeBorderColor) 60%, transparent);padding-top:7px;">
          <summary style="cursor:pointer;font-size:12px;opacity:.72;">其他候选（${pending.length}）</summary>
          <div style="padding:4px 0 0 10px;">${pendingRows}${omitted}</div>
        </details>`;
    }

    if (!readable.length && !pending.length) {
        container.html(`${contextBlock}<div style="opacity:.75;font-size:12px;line-height:1.5;padding:6px 0;">未扫描到可额外读取的资料来源。</div>`);
        return;
    }
    container.html(`${contextBlock}${readableBlock}${pendingBlock}`);
}

function memoryTestMessage(result) {
    if (!result?.ok) return `读取失败：${result?.error || '未知错误'}`;
    const parts = [
        `${result.providerName || '资料来源'}读取成功`,
        `资料正文 ${result.chars} 字符`,
        result.characterName ? `角色：${result.characterName}` : '',
        result.chatId ? `聊天：${result.chatId}` : '',
        result.coverageComplete === false ? `覆盖不完整（缺失 ${result.missingFloors || 0} 个 AI 楼层）` : '',
        `耗时 ${result.elapsed || 0}ms`,
    ].filter(Boolean);
    return parts.join('；');
}

export function initRabbitMirrorUI() {
    if (!isCurrentRuntime()) return;
    const finishUiInit = globalThis.__rabbitMirrorPerfDiag?.begin?.('ui.initCall', { retry: uiMountRetryCount }, 0);
    const settings = getSettings();
    const noSendRegex = '/<toto\\b[^>]*>[\\s\\S]*?<\\/toto>\\s*/gi';
    const existing = $('#rabbit_mirror_theater_settings');
    if (existing.length) {
        const currentPanels = existing.filter(`[data-rabbit-mirror-ui-version="${SETTINGS_UI_VERSION}"][data-rabbit-mirror-runtime-version="${RUNTIME_VERSION}"]`)
            .filter((_, panel) => {
                const $panel = $(panel);
                const $advanced = $('body > #rh_advanced_modal');
                const $worldPrompt = $('body > #rh_world_info_prompt_modal');
                const $tagFilter = $('body > #rh_independent_tag_filter_modal');
                return $panel.attr('data-rabbit-mirror-ui-ready') === 'true'
                    && $advanced.length === 1
                    && $worldPrompt.length === 1
                    && $tagFilter.length === 1
                    && $panel.find('#rh_enabled').length === 1
                    && $panel.find('#rh_advanced_open').length === 1
                    && $panel.find('#rh_independent_advanced_open').length === 1
                    && $panel.find('.rabbit-mirror-primary-row').length === 1
                    && $panel.find('#rh_token_meter > summary').length === 1
                    && $panel.find('#rh_token_meter #rh_independent_api_diagnostic').length === 1
                    && $panel.find('#rh_independent_api_section #rh_independent_api_diagnostic').length === 0
                    && $panel.find('#rh_external_diag_status').length === 1
                    && $panel.find('#rh_external_diag_start').length === 1
                    && $panel.find('#rh_external_diag_stop').length === 1
                    && $panel.find('#rh_external_diag_report').length === 1
                    && $panel.find('#rh_external_diag_copy').length === 1
                    && $panel.find('#rh_external_diag_reset').length === 1
                    && $panel.find('#rh_external_diag_output').length === 1
                    && $panel.find('#rh_blacklist_enabled').length
                    && $panel.find('#rh_favorite_summary').length
                    && $advanced.find('#rh_feedback_cat').length
                    && $advanced.find('#rh_maintenance_rabbit').length
                    && $advanced.find('#rh_visual_extra_prompt').length
                    && $advanced.find('#rh_visual_avoid_prompt').length
                    && $advanced.find('#rh_visual_prompt_save').length
                    && $advanced.find('#rh_worldview_lock').length
                    && $advanced.find('#rh_advanced_back_top').length
                    && $advanced.find('#rh_advanced_page_worldinfo').length
                    && $advanced.find('#rh_independent_context_layers').length
                    && $advanced.find('#rh_independent_include_character_summary').length
                    && $advanced.find('#rh_independent_include_persona_summary').length
                    && $advanced.find('#rh_independent_tag_filter_open').length
                    && $advanced.find('#rh_independent_read_global_world_info').length
                    && $advanced.find('#rh_world_info_book_filters').length
                    && $advanced.find('#rh_world_info_books_fetch').length
                    && $advanced.find('#rh_world_info_all_book_filters').length
                    && $panel.find('#rh_independent_api_section').length
                    && $worldPrompt.find('#rh_world_info_prompt_close').length
                    && $worldPrompt.find('#rh_world_info_prompt_enable').length
                    && $worldPrompt.find('#rh_world_info_prompt_disable').length
                    && $tagFilter.find('#rh_independent_tag_filter_scan').length
                    && $tagFilter.find('#rh_independent_tag_filter_save').length;
            });
        if (existing.length === 1 && currentPanels.length === 1) { finishUiInit?.({ outcome: 'already-mounted' }); return; }
        // A hot reload may leave the old settings DOM alive even after manifest.json has updated.
        // Remove every stale/duplicate panel so the claimed runtime becomes the only UI owner.
        try { globalThis.__rabbitMirrorTagFilterScanUiCleanup?.(); } catch {}
        globalThis.__rabbitMirrorTagFilterScanUiCleanup = null;
        existing.remove();
        $('body > #rh_advanced_modal, body > #rh_world_info_prompt_modal, body > #rh_independent_tag_filter_modal').remove();
    }

    const settingsMount = $('#extensions_settings2');
    if (!settingsMount.length) {
        scheduleUiMountRetry();
        finishUiInit?.({ outcome: 'mount-missing' });
        return;
    }
    uiMountRetryCount = 0;

    const html = `
<div id="rabbit_mirror_theater_settings" class="rabbit-mirror-settings" data-rabbit-mirror-ui-version="${SETTINGS_UI_VERSION}" data-rabbit-mirror-runtime-version="${RUNTIME_VERSION}" data-rabbit-mirror-ui-ready="false">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header rabbit-mirror-drawer-header">
      <b>兔子镜小剧场</b><span class="rabbit-mirror-toto-watermark">TOTOv1.5.5</span>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div class="rabbit-mirror-primary-toggle">
        <div class="rabbit-mirror-primary-row">
          <label class="checkbox_label rabbit-mirror-enable-control">
            <input id="rh_enabled" type="checkbox">
            <span class="rabbit-mirror-enable-copy"><b>兔子镜自动注入</b><small>随回复生成；首次使用请配置不发送正则。</small></span>
          </label>
          <button id="rh_advanced_open" class="menu_button rabbit-mirror-advanced-launch" type="button" aria-haspopup="dialog" aria-controls="rh_advanced_modal">高级设置</button>
        </div>
      </div>

      <details id="rh_token_meter" class="rabbit-mirror-token-meter" aria-live="polite">
        <summary class="rabbit-mirror-token-meter-head">
          <span class="rabbit-mirror-token-meter-label">本轮 Token</span>
          <span data-rh-token-meter-main>尚无生成记录</span>
        </summary>
        <div class="rabbit-mirror-token-meter-body">
          <div data-rh-token-meter-exact class="rabbit-mirror-token-meter-exact">下一轮生成后更新。</div>
          <div data-rh-token-meter-detail class="rabbit-mirror-token-meter-detail">只统计兔子镜自己的 Prompt。</div>
          <div id="rh_independent_api_diagnostic" style="padding:7px 9px;border-left:2px solid color-mix(in srgb, var(--SmartThemeBorderColor) 65%, transparent);opacity:.78;font-size:11px;line-height:1.5;word-break:break-word;">最近请求：暂无记录</div>
          <div class="rabbit-mirror-token-meter-note">Token 是估算值。</div>
        </div>
      </details>

      <details class="rabbit-mirror-section">
        <summary><span>生成方式</span><span class="rabbit-mirror-section-note">跟随 / 独立</span></summary>
        <div class="rabbit-mirror-section-content">
          <label class="checkbox_label"><input name="rh_generation_source" id="rh_generation_follow" type="radio" value="follow"> 跟随当前 API</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 8px 26px;opacity:.72;font-size:12px;line-height:1.45;">跟着当前回复一起生成兔子镜。</div>
          <div id="rh_follow_display_row" style="margin-left:26px;padding:7px 10px;border-left:2px solid color-mix(in srgb, var(--SmartThemeBorderColor) 60%, transparent);">
            <label><input name="rh_follow_display" type="radio" value="inline"> 正文下方</label>
            <label style="margin-left:14px;"><input name="rh_follow_display" type="radio" value="external"> 外置弹窗</label>
          </div>
          <label class="checkbox_label" style="margin-top:12px;"><input name="rh_generation_source" id="rh_generation_independent" type="radio" value="independent"> 使用独立 API</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 8px 26px;opacity:.72;font-size:12px;line-height:1.45;">正文先生成，回复结束后再用独立 API 单独生成兔子镜；具体配置在下面的独立分区。</div>
        </div>
      </details>

      <details class="rabbit-mirror-section" id="rh_independent_api_section">
        <summary><span>独立 API</span><span class="rabbit-mirror-section-note">连接 · 模型 · 上下文</span></summary>
        <div class="rabbit-mirror-section-content">
          <div id="rh_independent_mode_status" aria-live="polite" style="padding:7px 9px;border-left:2px solid color-mix(in srgb,var(--SmartThemeBorderColor) 65%,transparent);opacity:.78;font-size:11px;line-height:1.45;">正在读取当前生成模式……</div>
          <div id="rh_independent_api_fields" style="display:grid;gap:9px;">
            <div style="padding:10px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:10px;">
              <div style="font-weight:700;font-size:12px;margin-bottom:7px;">独立 API 生成方式</div>
            <div id="rh_independent_display_row" class="flex-container" style="gap:14px;flex-wrap:wrap;align-items:center;">
              <label><input name="rh_independent_display" type="radio" value="external"> ① 轻壳外置（标题有壳）</label>
              <label><input name="rh_independent_display" type="radio" value="external_then_inline"> ② 外置后内嵌</label>
            </div>
              <div style="opacity:.66;font-size:11px;line-height:1.45;margin-top:6px;">只决定副 API 成品显示在哪里，不改变提示词、美化规则或模型。</div>
            </div>
            <div style="padding:9px 10px;border:1px solid color-mix(in srgb, currentColor 16%, transparent);border-radius:9px;">
              <div style="font-weight:700;font-size:12px;margin-bottom:7px;">连接与模型</div>
              <div class="flex-container" style="gap:7px;flex-wrap:wrap;align-items:center;">
                <button id="rh_independent_import_current" class="menu_button" type="button" style="font-weight:700;">从酒馆当前连接一键配置</button>
                <span id="rh_independent_connection_status" style="opacity:.72;font-size:11px;line-height:1.4;">尚未配置</span>
              </div>
              <div style="opacity:.78;font-size:11px;line-height:1.45;margin-top:5px;">仅“酒馆 Connection Profile 一键配置”需要 SillyTavern 1.18.0 及以上版本；旧版仍可使用兔子镜及下方“手动 OpenAI 兼容接口”。</div>
              <button id="rh_independent_models" class="menu_button" type="button" style="margin-top:8px;">从此酒馆连接拉取模型</button>
            </div>
            <div class="flex-container" style="gap:7px;flex-wrap:wrap;">
              <button id="rh_independent_test" class="menu_button" type="button">测试连接</button>
            </div>
            <select id="rh_independent_model_select" class="text_pole" aria-label="已拉取模型列表">
              <option value="">请从酒馆连接或手动接口拉取模型</option>
            </select>
            <input id="rh_independent_model" class="text_pole" type="text" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="模型 ID；可从上方完整列表选择，也可直接手动填写">
            <div id="rh_independent_model_list_source" aria-live="polite" style="opacity:.7;font-size:11px;line-height:1.45;">模型列表尚未拉取。列表来源与当前实际模型会分别标明。</div>
            <details id="rh_independent_manual_legacy" style="margin-top:2px;">
              <summary style="cursor:pointer;font-size:11px;opacity:.7;">高级：手动 OpenAI 兼容接口（旧配置兼容）</summary>
              <div style="display:grid;gap:6px;padding-top:7px;">
                <input id="rh_independent_base" class="text_pole" type="text" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="API 地址">
                <input id="rh_independent_key" class="text_pole" type="password" autocomplete="off" placeholder="API Key">
                <div class="flex-container" style="gap:7px;flex-wrap:wrap;">
                  <button id="rh_independent_manual_models" class="menu_button" type="button">从此手动接口拉取模型</button>
                  <button id="rh_independent_use_manual" class="menu_button" type="button">改用这组手动接口</button>
                </div>
              </div>
            </details>
            <div class="flex-container" style="gap:8px;flex-wrap:wrap;align-items:center;padding:9px 10px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:9px;">
              <label>温度 <input id="rh_independent_temperature" class="text_pole" type="number" min="0" max="2" step="0.1" style="width:82px;"></label>
              <label>最大输出 <input id="rh_independent_max_tokens" class="text_pole" type="number" min="512" max="32000" step="256" style="width:110px;"></label>
            </div>
            <div class="rabbit-mirror-independent-advanced-row">
              <div class="rabbit-mirror-independent-advanced-copy"><b>读取内容与隐私</b><span>聊天层数、角色卡 / Persona、世界书与正文标签过滤</span></div>
              <button id="rh_independent_advanced_open" class="menu_button" type="button">管理读取内容</button>
            </div>
            <div style="opacity:.72;font-size:11px;line-height:1.45;">温度建议 <b>1.0</b>。</div>
            <div style="opacity:.66;font-size:11px;line-height:1.45;">一键配置时不保存 API Key；旧手动模式仍按原逻辑保存在当前 SillyTavern 扩展设置里。</div>
          </div>
        </div>
      </details>

      <details class="rabbit-mirror-section rabbit-mirror-tools">
        <summary><span>工具与维护</span><span class="rabbit-mirror-section-note">正则 · 诊断 · 重置</span></summary>
        <div class="rabbit-mirror-section-content">
          <div class="rabbit-mirror-regex-helper">
            <div style="font-weight:600;margin-bottom:6px;">不发送小剧场正则</div>
            <div style="opacity:.82;font-size:12px;margin-bottom:8px;">设置：替换留空／勾选 AI输出／勾选 仅格式提示词</div>
            <button id="rh_copy_regex" class="menu_button" type="button">复制推荐正则</button>
          </div>
          <div class="rabbit-mirror-actions">
            <button id="rh_clear_last" class="menu_button">清除抽签历史与冷却记录</button>
            <button id="rh_clear_injection" class="menu_button">清空当前注入</button>
            <button id="rh_reset" class="menu_button">恢复默认设置</button>
          </div>
          <div style="margin-top:12px;padding:10px 11px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:10px;">
            <div style="font-weight:700;">🛰 外部代码／宿主性能诊断（测试版）</div>
            <div style="opacity:.74;font-size:11px;line-height:1.5;margin-top:4px;">只诊断 <b>SillyTavern 本体、其他扩展、浏览器主线程和网络</b>：聊天为什么空白、发送为什么迟滞、AI 请求何时真正发出、维修兔点击后是否被外部脚本/网络阻塞。<br><b>不读取兔子镜内部生成或维修状态。</b> 兔子镜内部问题仍请使用对应兔子镜里的「📋 生成全链路诊断」，两份报告互不合并。</div>
            <div id="rh_external_diag_status" style="margin-top:7px;opacity:.82;font-size:11px;line-height:1.45;">默认关闭（零常驻监听）；需要复现问题时再手动开启。</div>
            <div class="flex-container" style="gap:7px;flex-wrap:wrap;margin-top:8px;">
              <button id="rh_external_diag_start" class="menu_button" type="button" style="font-weight:700;">开始新诊断</button>
              <button id="rh_external_diag_stop" class="menu_button" type="button">结束并生成报告</button>
              <button id="rh_external_diag_report" class="menu_button" type="button" style="font-weight:700;">查看当前／最后报告</button>
              <button id="rh_external_diag_copy" class="menu_button" type="button">复制外部报告</button>
              <button id="rh_external_diag_reset" class="menu_button" type="button">清空外部记录</button>
            </div>
            <textarea id="rh_external_diag_output" class="text_pole" readonly spellcheck="false" style="display:none;width:100%;min-height:240px;resize:vertical;box-sizing:border-box;margin-top:8px;font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;"></textarea>
          </div>
        </div>
      </details>

      <details id="rh_random_preference_section" class="rabbit-mirror-section">
        <summary><span>收藏与黑名单</span><span class="rabbit-mirror-section-note">随机偏好</span></summary>
        <div class="rabbit-mirror-section-content">
          <div style="padding-bottom:10px;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent);">
            <label class="checkbox_label" style="font-weight:700;"><input id="rh_blacklist_enabled" type="checkbox"> 🚫 启用抽签黑名单</label>
            <div class="rabbit-mirror-subnote" style="margin:-2px 0 7px 26px;opacity:.76;font-size:12px;line-height:1.5;">加入黑名单后，从下一轮随机抽取开始直接从候选池排除；不增加 Token。明确点菜和固定动态视觉场景仍可覆盖随机黑名单。</div>
            <div id="rh_blacklist_summary" class="rabbit-mirror-blacklist-summary" style="padding:8px 9px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:8px;font-size:11px;line-height:1.45;"><div style="opacity:.6;">展开后显示黑名单。</div></div>
            <button id="rh_blacklist_clear" class="menu_button" type="button" style="margin-top:7px;">清空全部黑名单</button>
          </div>
          <div style="margin-top:11px;">
            <div style="font-weight:700;margin-bottom:6px;">⭐ 收藏室</div>
            <div id="rh_favorite_summary" style="padding:8px 9px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:8px;font-size:11px;line-height:1.45;"><div style="opacity:.6;">展开后显示收藏室。</div></div>
            <button id="rh_favorite_clear" class="menu_button" type="button" style="margin-top:7px;">清空全部收藏</button>
          </div>
        </div>
      </details>

      <div id="rh_advanced_modal" class="rabbit-mirror-advanced-modal" role="dialog" aria-modal="true" aria-label="兔子镜高级设置" aria-hidden="true" style="display:none;position:fixed;inset:0;z-index:2147483000;background:rgba(8,10,14,.62);box-sizing:border-box;padding-top:max(24px,calc(env(safe-area-inset-top) + 14px));padding-right:max(12px,calc(env(safe-area-inset-right) + 8px));padding-bottom:max(24px,calc(env(safe-area-inset-bottom) + 14px));padding-left:max(12px,calc(env(safe-area-inset-left) + 8px));align-items:center;justify-content:center;overflow:hidden;pointer-events:auto;">
        <div id="rh_advanced_modal_card" style="width:min(760px,calc(100vw - 24px));max-width:100%;max-height:88vh;max-height:calc(100dvh - 76px - env(safe-area-inset-top) - env(safe-area-inset-bottom));display:flex;flex-direction:column;min-height:0;overflow:hidden;background:var(--SmartThemeBlurTintColor,#202226);color:var(--SmartThemeBodyColor,#ddd);border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:18px;box-shadow:0 22px 70px rgba(0,0,0,.42);box-sizing:border-box;pointer-events:auto;">
          <div id="rh_advanced_modal_header" style="display:grid;grid-template-columns:auto minmax(0,1fr) 40px;align-items:center;gap:8px;flex:0 0 auto;padding:11px 12px;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent);background:var(--SmartThemeBlurTintColor,#202226);">
            <button id="rh_advanced_back_top" class="menu_button" type="button" aria-label="返回高级选项" title="返回高级选项" style="display:none;min-width:84px;height:38px;padding:0 10px;border-radius:12px;font-size:12px;line-height:1;">← 高级选项</button>
            <div style="min-width:0;text-align:left;"><b id="rh_advanced_modal_title" style="font-size:15px;">高级设置</b><div id="rh_advanced_modal_hint" style="opacity:.65;font-size:11px;line-height:1.35;margin-top:2px;white-space:normal;">选择要调整的项目</div></div>
            <button id="rh_advanced_close" class="menu_button" type="button" aria-label="关闭高级设置" title="关闭" style="width:38px;min-width:38px;height:38px;padding:0;border-radius:12px;font-size:20px;line-height:1;">×</button>
          </div>
          <div id="rh_advanced_scroll" style="flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;padding:14px 14px max(18px,env(safe-area-inset-bottom));box-sizing:border-box;">
          <div id="rh_advanced_menu" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:9px;">
            <button class="menu_button rh-advanced-choice" type="button" data-page="generation" style="min-height:66px;text-align:left;padding:11px 12px;border-radius:12px;"><span style="display:block;font-weight:700;font-size:13px;">🎛️ 生成与抽取</span><span style="display:block;opacity:.64;font-size:10px;line-height:1.4;margin-top:3px;">抽取模式、参考内容、世界观锁与冷却</span></button>
            <button class="menu_button rh-advanced-choice" type="button" data-page="visual" style="min-height:66px;text-align:left;padding:11px 12px;border-radius:12px;"><span style="display:block;font-weight:700;font-size:13px;">🎨 个性化视觉提示词</span><span style="display:block;opacity:.64;font-size:10px;line-height:1.4;margin-top:3px;">额外视觉偏好、避雷与通用视觉规则</span></button>
            <button class="menu_button rh-advanced-choice" type="button" data-page="memory" style="min-height:66px;text-align:left;padding:11px 12px;border-radius:12px;"><span style="display:block;font-weight:700;font-size:13px;">🧠 共同回忆资料来源</span><span style="display:block;opacity:.64;font-size:10px;line-height:1.4;margin-top:3px;">扫描并选择可读取的记忆资料接口</span></button>
            <button class="menu_button rh-advanced-choice" type="button" data-page="worldinfo" style="min-height:66px;text-align:left;padding:11px 12px;border-radius:12px;"><span style="display:block;font-weight:700;font-size:13px;">🔌 独立 API</span><span style="display:block;opacity:.64;font-size:10px;line-height:1.4;margin-top:3px;">读取范围、角色 / Persona、世界书与正文标签</span></button>
            <button class="menu_button rh-advanced-choice" type="button" data-page="repair" style="min-height:66px;text-align:left;padding:11px 12px;border-radius:12px;"><span style="display:block;font-weight:700;font-size:13px;">🐈‍⬛🐇 挨打猫与维修兔</span><span style="display:block;opacity:.64;font-size:10px;line-height:1.4;margin-top:3px;">美化反馈、维修兔与自动巡逻</span></button>
          </div>

          <div id="rh_advanced_page_generation" class="rh-advanced-page" data-title="生成与抽取" style="display:none;">
            <label for="rh_sampling_mode" class="flex-container alignitemscenter" style="gap:8px;flex-wrap:wrap;margin:8px 0;">
              <span>抽取模式</span>
              <select id="rh_sampling_mode" class="text_pole" style="max-width:300px;">
                <option value="classic">主题元素 + 展现形式（经典模式）</option>
                <option value="format_only">仅展现形式</option>
              </select>
            </label>
            <label for="rh_raw_policy" class="flex-container alignitemscenter" style="gap:8px;flex-wrap:wrap;margin:8px 0;">
              <span>参考内容</span>
              <select id="rh_raw_policy" class="text_pole" style="max-width:320px;">
                <option value="compact">精简：Prompt 较短，Token 较少</option>
                <option value="balanced">均衡：Prompt 长度适中（默认）</option>
                <option value="full">完整：Prompt 较长，参考内容更多</option>
              </select>
            </label>
            <div class="rabbit-mirror-subnote" style="margin:-4px 0 8px 0;opacity:.72;font-size:12px;line-height:1.45;">控制随机生成时使用的参考内容多少。默认使用“均衡”。</div>
            <label class="checkbox_label"><input id="rh_creative_expansion" type="checkbox"> 发散孵化模式</label>
            <div class="rabbit-mirror-subnote" style="margin:-2px 0 6px 26px;opacity:.72;font-size:12px;line-height:1.45;">开启后会探索更随机、更跳脱的内容组合。</div>
            <label class="checkbox_label"><input id="rh_force_visual_scenery" type="checkbox"> 动态视觉场景</label>
            <div class="rabbit-mirror-subnote" style="margin:-2px 0 6px 26px;opacity:.72;font-size:12px;line-height:1.45;">开启后，展现形式将固定为动态视觉场景图，每轮兔子镜都会按此形式生成。</div>
            <label class="checkbox_label"><input id="rh_user_directive" type="checkbox"> 用户指令优先</label>
            <div class="rabbit-mirror-subnote" style="margin:-2px 0 6px 26px;opacity:.72;font-size:12px;line-height:1.45;">开启后，可以自由点菜自己喜欢的任意内容。</div>
            <label class="checkbox_label"><input id="rh_worldview_lock" type="checkbox"> 展现形式世界观锁</label>
            <div class="rabbit-mirror-subnote" style="margin:-2px 0 6px 26px;opacity:.72;font-size:12px;line-height:1.45;">保留展现形式功能与结构，只转换不合当前世界观的具体载体；开启时会提示把抽取模式切换为“仅展现形式”。</div>
            <label class="checkbox_label"><input id="rh_avoid_repeat" type="checkbox"> 10轮冷却：避免重复主题/展现形式/整体观感</label>
            <div class="rabbit-mirror-subnote" style="margin:-2px 0 2px 26px;opacity:.72;font-size:12px;line-height:1.45;">仅记录已经实际生成成功的兔子镜；用于避免连续复用相近的结构骨架与整体视觉家族。</div>
          </div>

          <div id="rh_advanced_page_visual" class="rh-advanced-page" data-title="个性化视觉提示词" style="display:none;">
            <div style="opacity:.82;font-size:12px;line-height:1.55;margin-bottom:9px;">这里可以直接写你喜欢或不喜欢的画面感觉。只有勾选下面的“启用视觉提示词编辑注入”后，保存的内容才会随生成兔子镜的请求发送。</div>
            <label class="checkbox_label" style="font-weight:700;"><input id="rh_visual_prompt_enabled" type="checkbox"> 启用视觉提示词编辑注入</label>
            <div class="rabbit-mirror-subnote" style="margin:-2px 0 8px 26px;opacity:.76;font-size:12px;line-height:1.5;">默认关闭。关闭时已编辑内容仍保存在本地，但不会注入模型；下一面继续使用 1.3.20 原版视觉规则。开启后才切换到可编辑视觉层。</div>
            <div id="rh_visual_prompt_status" style="padding:7px 9px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:8px;opacity:.82;font-size:11px;line-height:1.45;margin-bottom:10px;">当前：正在读取视觉提示词状态……</div>
            <label for="rh_visual_extra_prompt" style="display:block;font-weight:700;margin:8px 0 5px;">额外视觉偏好（可选）</label>
            <textarea id="rh_visual_extra_prompt" class="text_pole" rows="5" maxlength="${VISUAL_EXTRA_PROMPT_MAX_CHARS}" spellcheck="false" placeholder="例如：像真实纸张拼贴的小剧场，左上方来光，标题压在图像边缘，正文像杂志内页，近看能看到印刷网点和轻微裁切毛边。" style="width:100%;min-height:100px;resize:vertical;box-sizing:border-box;line-height:1.5;"></textarea>
            <div style="opacity:.68;font-size:11px;line-height:1.45;margin:5px 0 10px;">可以只写“毛玻璃”“粉嫩清新”这类简单偏好，系统会把它当作设计种子并自动补足构图、层级、光线、排版、材质细节与交互第二状态；想更可控时，也可以像占位示例那样写一条完整但不冗长的视觉句子。开启注入后会作为本轮明确视觉要求执行，未指定的部分仍由兔子镜原有视觉规则补足。上限 ${VISUAL_EXTRA_PROMPT_MAX_CHARS} 字符。</div>
            <label for="rh_visual_avoid_prompt" style="display:block;font-weight:700;margin:10px 0 5px;">不希望出现的视觉（可选）</label>
            <textarea id="rh_visual_avoid_prompt" class="text_pole" rows="4" maxlength="${VISUAL_AVOID_PROMPT_MAX_CHARS}" spellcheck="false" placeholder="例如：不要荧光渐变、蓝白系统 UI、统一圆角卡片、廉价塑料感……" style="width:100%;min-height:88px;resize:vertical;box-sizing:border-box;line-height:1.5;"></textarea>
            <div style="opacity:.68;font-size:11px;line-height:1.45;margin:5px 0 10px;">可以直接写你不喜欢的颜色、质感、排版方式、光线感觉、UI 套路或整体风格。开启注入后会作为明确避用项处理。上限 ${VISUAL_AVOID_PROMPT_MAX_CHARS} 字符。</div>
            <details style="margin-top:10px;"><summary style="cursor:pointer;font-weight:700;">高级：修改通用视觉规则 <span style="font-weight:400;opacity:.62;font-size:11px;">通常无需修改</span></summary><div style="padding-top:9px;">
              <div style="opacity:.72;font-size:11px;line-height:1.5;margin-bottom:7px;">只有想直接改兔子镜原本的通用画面规则时才需要这里。普通用户只填写上面的“额外视觉偏好 / 不希望出现”即可。</div>
              <label for="rh_visual_prompt" style="display:block;font-weight:700;margin:8px 0 5px;">通用视觉审美规则（高级，可编辑）</label>
              <textarea id="rh_visual_prompt" class="text_pole" rows="14" maxlength="${VISUAL_PROMPT_MAX_CHARS}" spellcheck="false" style="width:100%;min-height:230px;resize:vertical;box-sizing:border-box;line-height:1.5;"></textarea>
              <div style="opacity:.68;font-size:11px;line-height:1.45;margin:5px 0 8px;">修改后会替换兔子镜原本的通用画面规则；上限 ${VISUAL_PROMPT_MAX_CHARS} 字符。核心结构与兼容规则仍不可覆盖。</div>
              <button id="rh_visual_prompt_reset" class="menu_button" type="button">恢复默认通用视觉规则</button>
            </div></details>
            <div class="flex-container" style="gap:8px;flex-wrap:wrap;margin-top:12px;"><button id="rh_visual_prompt_save" class="menu_button" type="button">保存并从下一面生效</button></div>
            <div style="opacity:.66;font-size:11px;line-height:1.45;margin-top:7px;">为避免重新引入移动端设置页卡顿，三个输入框都不会在键入时写设置；只有点击上面的保存按钮才会持久化。</div>
          </div>

          <div id="rh_advanced_page_memory" class="rh-advanced-page" data-title="共同回忆资料来源" style="display:none;">
            <label class="checkbox_label"><input id="rh_memory_scan_enabled" type="checkbox"> 启用额外资料来源（实验性）</label>
            <div class="rabbit-mirror-subnote" style="margin:-2px 0 8px 26px;opacity:.76;font-size:12px;line-height:1.45;">开启后，兔子镜可能生成回忆杀；仅在实际出现回忆杀时增加额外 Token。</div>
            <button id="rh_memory_scan_now" class="menu_button" type="button">扫描可用资料来源</button>
            <div style="margin-top:6px;opacity:.68;font-size:11px;line-height:1.45;">扫描公开、正规的记忆插件接口 API。</div>
            <div id="rh_memory_scan_results" style="margin-top:8px;"></div>
          </div>

          <div id="rh_advanced_page_worldinfo" class="rh-advanced-page" data-title="独立 API" style="display:none;">
            <div style="padding:10px 11px;margin-bottom:12px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:12px;background:color-mix(in srgb,currentColor 5%,transparent);">
              <div style="font-weight:700;font-size:12px;margin-bottom:7px;">读取范围</div>
              <label>最近 <input id="rh_independent_context_layers" class="text_pole" type="number" min="1" max="200" step="1" inputmode="numeric" style="width:76px;"> 层可见聊天正文</label>
              <div class="rabbit-mirror-subnote" style="margin:6px 0 0;opacity:.72;font-size:11px;line-height:1.5;">只读取最近 X 层可见正文。历史兔子镜和隐藏推理始终不会发送；小缓存只在本次请求内复用，完成后立即销毁。</div>
            </div>
            <div style="padding:10px 11px;margin-bottom:12px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:12px;background:color-mix(in srgb,currentColor 5%,transparent);">
              <div style="font-weight:700;font-size:12px;margin-bottom:7px;">附加资料</div>
              <label class="checkbox_label"><input id="rh_independent_include_character_summary" type="checkbox"> 角色卡摘要（推荐开启）</label>
              <label class="checkbox_label"><input id="rh_independent_include_persona_summary" type="checkbox"> Persona 摘要（推荐开启）</label>
              <div class="rabbit-mirror-subnote" style="margin:4px 0 0 26px;opacity:.72;font-size:11px;line-height:1.5;">只带入紧凑摘要，不会把整张角色卡或其它隐藏提示整包塞给副 API。</div>
            </div>
            <div style="padding:10px 11px;margin-bottom:12px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:12px;background:color-mix(in srgb,currentColor 5%,transparent);">
              <div style="font-weight:700;font-size:12px;margin-bottom:7px;">正文标签过滤／隔离</div>
              <div class="flex-container" style="gap:8px;flex-wrap:wrap;align-items:center;">
                <button id="rh_independent_tag_filter_open" class="menu_button" type="button">扫描与管理正文标签</button>
                <span id="rh_independent_tag_filter_summary" style="opacity:.72;font-size:11px;line-height:1.4;">尚未设置</span>
              </div>
              <label class="checkbox_label" style="margin-top:8px;"><input id="rh_follow_tag_isolation" type="checkbox"> 跟随当前 API：禁止兔子镜参考所选标签</label>
              <div class="rabbit-mirror-subnote" style="margin:3px 0 0 26px;opacity:.72;font-size:11px;line-height:1.5;">仅要求兔子镜跳过所选标签内容；如需彻底过滤，请使用独立 API。</div>
              <div class="rabbit-mirror-subnote" style="margin:6px 0 0;opacity:.72;font-size:11px;line-height:1.5;">独立 API 会在发送前从副 API 临时上下文副本中过滤并跳过所选标签内容；原酒馆正文始终不修改。</div>
            </div>
            <div style="padding:10px 11px;margin-bottom:12px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:12px;background:color-mix(in srgb,currentColor 5%,transparent);">
              <label class="checkbox_label" style="font-weight:700;"><input id="rh_independent_read_global_world_info" type="checkbox"> 读取本轮已激活的世界书</label>
              <div class="rabbit-mirror-subnote" style="margin:2px 0 0 26px;opacity:.72;font-size:11px;line-height:1.5;">进入当前角色聊天后，优先显示酒馆为当前聊天加载过的角色／聊天／Persona／当前全局世界书；真正发送时仍只复用主生成本轮实际激活的条目，不会重新扫描或重掷概率。</div>
            </div>
            <div style="margin:7px 0 4px;font-size:12px;font-weight:700;opacity:.86;">当前聊天相关世界书</div>
            <div id="rh_world_info_book_filters" style="margin:4px 0 10px;padding:8px 9px;border:1px solid color-mix(in srgb,var(--SmartThemeBorderColor) 45%,transparent);border-radius:10px;max-height:190px;overflow:auto;-webkit-overflow-scrolling:touch;"><div style="font-size:11px;line-height:1.4;opacity:.66;">打开此高级选项时自动显示当前聊天相关世界书。</div></div>
            <details id="rh_world_info_all_books" style="margin:5px 0 8px;">
              <summary style="cursor:pointer;font-size:11px;opacity:.78;">更多：从全部世界书中选择（折叠）</summary>
              <div class="flex-container" style="gap:7px;flex-wrap:wrap;align-items:center;margin:8px 0 0;">
                <button id="rh_world_info_books_fetch" class="menu_button" type="button">拉取全部世界书</button>
                <span id="rh_world_info_books_fetch_status" style="opacity:.66;font-size:11px;">未拉取</span>
              </div>
              <div id="rh_world_info_all_book_filters" style="margin-top:7px;padding:8px 9px;border:1px solid color-mix(in srgb,var(--SmartThemeBorderColor) 45%,transparent);border-radius:10px;max-height:260px;overflow:auto;-webkit-overflow-scrolling:touch;"><div style="font-size:11px;line-height:1.4;opacity:.66;">折叠时不创建完整世界书列表；展开后按需渲染。</div></div>
            </details>
          </div>

          <div id="rh_advanced_page_repair" class="rh-advanced-page" data-title="挨打猫与维修兔" style="display:none;">
            <label class="checkbox_label" style="font-weight:700;"><input id="rh_feedback_cat" type="checkbox"> 🐈 启用挨打猫</label>
            <div class="rabbit-mirror-subnote" style="margin:-2px 0 8px 26px;opacity:.78;font-size:12px;line-height:1.5;">用于纠正兔子镜的美化效果；仅在实际提交美化反馈时增加额外 Token。</div>
            <label class="checkbox_label" style="font-weight:700;"><input id="rh_maintenance_rabbit" type="checkbox"> 🐇 启用维修兔</label>
            <div class="rabbit-mirror-subnote" style="margin:-2px 0 6px 26px;opacity:.78;font-size:12px;line-height:1.5;">兔子镜出问题时，可使用维修兔进行检查和修复；维修兔本身不会增加模型 Token。</div>
            <label class="checkbox_label" style="font-weight:700;"><input id="rh_maintenance_auto_safe" type="checkbox"> 🧪 维修兔自动巡逻（实验性）</label>
            <div class="rabbit-mirror-subnote" style="margin:-2px 0 8px 26px;opacity:.78;font-size:12px;line-height:1.5;">新生成的兔子镜会自动修常见小问题；复杂问题仍需手动修。</div>
          </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</div>`;

    $('body > #rh_advanced_modal, body > #rh_world_info_prompt_modal, body > #rh_independent_tag_filter_modal').remove();
    settingsMount.append(html);
    // The settings root uses CSS layout containment and a scroll container. Move the
    // advanced dialog to <body> so it is a real viewport modal instead of being clipped
    // inside the extension drawer; all setting controls keep their existing IDs/events.
    $('#rh_advanced_modal').appendTo(document.body);
    const worldInfoPromptHtml = `
<div id="rh_world_info_prompt_modal" role="dialog" aria-modal="true" aria-label="独立 API 世界书设置" aria-hidden="true" style="display:none;position:fixed;inset:0;z-index:2147483001;background:rgba(8,10,14,.62);box-sizing:border-box;padding-top:max(24px,calc(env(safe-area-inset-top) + 14px));padding-right:max(12px,calc(env(safe-area-inset-right) + 8px));padding-bottom:max(24px,calc(env(safe-area-inset-bottom) + 14px));padding-left:max(12px,calc(env(safe-area-inset-left) + 8px));align-items:center;justify-content:center;overflow:hidden;pointer-events:auto;">
  <div style="width:min(520px,calc(100vw - 24px));max-height:calc(100dvh - 76px - env(safe-area-inset-top) - env(safe-area-inset-bottom));overflow:hidden;background:var(--SmartThemeBlurTintColor,#202226);color:var(--SmartThemeBodyColor,#ddd);border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:18px;box-shadow:0 22px 70px rgba(0,0,0,.42);display:flex;flex-direction:column;">
    <div style="display:grid;grid-template-columns:minmax(0,1fr) 40px;align-items:center;gap:8px;padding:11px 12px;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent);">
      <div><b style="font-size:15px;">独立 API 是否读取世界书？</b><div style="opacity:.65;font-size:11px;line-height:1.35;margin-top:2px;">之后也可以在「高级设置 → 独立 API」随时修改</div></div>
      <button id="rh_world_info_prompt_close" class="menu_button" type="button" aria-label="关闭" style="width:38px;min-width:38px;height:38px;padding:0;border-radius:12px;font-size:20px;line-height:1;">×</button>
    </div>
    <div style="padding:15px;overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;">
      <div style="padding:12px 13px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:12px;background:color-mix(in srgb,currentColor 5%,transparent);font-size:12px;line-height:1.6;">
        <div style="font-weight:700;margin-bottom:5px;">📚 读取世界书</div>
        <div style="opacity:.78;">进入当前角色聊天后，优先显示酒馆为当前聊天加载过的角色／聊天／Persona／当前全局世界书；真正发送时仍只复用主生成本轮实际激活的条目，不会重新扫描或重掷概率。</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:14px;">
        <button id="rh_world_info_prompt_disable" class="menu_button" type="button" style="min-height:44px;">暂不启用</button>
        <button id="rh_world_info_prompt_enable" class="menu_button" type="button" style="min-height:44px;font-weight:700;">启用世界书</button>
      </div>
    </div>
  </div>
</div>`;
    $(worldInfoPromptHtml).appendTo(document.body);
    const tagFilterModalHtml = `
<div id="rh_independent_tag_filter_modal" role="dialog" aria-modal="true" aria-label="兔子镜正文标签管理" aria-hidden="true" style="display:none;position:fixed;inset:0;z-index:2147483002;background:rgba(8,10,14,.62);box-sizing:border-box;padding:18px 12px;align-items:center;justify-content:center;overflow:hidden;pointer-events:auto;">
  <div style="width:min(560px,calc(100vw - 24px));max-height:min(720px,calc(100dvh - 36px));overflow:hidden;background:var(--SmartThemeBlurTintColor,#202226);color:var(--SmartThemeBodyColor,#ddd);border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:18px;box-shadow:0 22px 70px rgba(0,0,0,.42);display:flex;flex-direction:column;">
    <div style="display:grid;grid-template-columns:minmax(0,1fr) 40px;align-items:center;gap:8px;padding:11px 12px;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent);">
      <div><b style="font-size:15px;">兔子镜正文标签管理</b><div style="opacity:.65;font-size:11px;line-height:1.35;margin-top:2px;">独立 API 发送前过滤；跟随当前 API 仅在开关启用时要求兔子镜跳过所选标签，原正文与美化规则保持不变</div></div>
      <button id="rh_independent_tag_filter_close" class="menu_button" type="button" aria-label="关闭" style="width:38px;min-width:38px;height:38px;padding:0;border-radius:12px;font-size:20px;line-height:1;">×</button>
    </div>
    <div style="padding:14px;overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;">
      <div style="font-size:12px;line-height:1.55;opacity:.82;">勾选要整段过滤／隔离的标签。标签名不区分大小写；可填写 <code>thinking</code>、<code>&lt;thinking&gt;</code> 或自定义标签名。最多 ${INDEPENDENT_CONTEXT_EXCLUDED_TAG_MAX_COUNT} 项，不接受正则。预设内尚未出现在聊天正文的标签，请手动添加。</div>
      <div style="display:grid;grid-template-columns:auto minmax(0,1fr);gap:9px;align-items:center;margin-top:12px;padding:10px;border:1px solid color-mix(in srgb,currentColor 13%,transparent);border-radius:11px;background:color-mix(in srgb,currentColor 4%,transparent);">
        <button id="rh_independent_tag_filter_scan" class="menu_button" type="button">扫描当前聊天标签</button>
        <div id="rh_independent_tag_filter_scan_status" aria-live="polite" style="min-width:0;opacity:.72;font-size:11px;line-height:1.45;">扫描当前聊天已加载的正文源与可见正文；结果不会自动勾选或保存。</div>
      </div>
      <div id="rh_independent_tag_filter_list" style="display:grid;gap:7px;margin-top:12px;"></div>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:12px;">
        <input id="rh_independent_tag_filter_input" class="text_pole" type="text" autocapitalize="off" autocomplete="off" spellcheck="false" maxlength="80" placeholder="添加标签，例如 &lt;analysis&gt;">
        <button id="rh_independent_tag_filter_add" class="menu_button" type="button">添加并勾选</button>
      </div>
      <div id="rh_independent_tag_filter_error" aria-live="polite" style="min-height:18px;margin-top:5px;color:#ef9a9a;font-size:11px;line-height:1.4;"></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;padding:11px 14px 14px;border-top:1px solid color-mix(in srgb,currentColor 12%,transparent);">
      <button id="rh_independent_tag_filter_cancel" class="menu_button" type="button">取消</button>
      <button id="rh_independent_tag_filter_save" class="menu_button" type="button" style="font-weight:700;">保存并从下一轮生效</button>
    </div>
  </div>
</div>`;
    $(tagFilterModalHtml).appendTo(document.body);
    attachTokenMeterListener();
    renderTokenMeter();

    checked('#rh_enabled', settings.autoRabbitMirrorInjection !== false && settings.enabled !== false);
    $(`input[name="rh_generation_source"][value="${settings.generationSource || 'follow'}"]`).prop('checked', true);
    $(`input[name="rh_follow_display"][value="${settings.followDisplayMode || 'inline'}"]`).prop('checked', true);
    $(`input[name="rh_independent_display"][value="${settings.independentDisplayMode || 'external'}"]`).prop('checked', true);
    $('#rh_independent_base').val(settings.independentApiBaseUrl || '');
    $('#rh_independent_key').val(settings.independentApiKey || '');
    $('#rh_independent_temperature').val(settings.independentApiTemperature ?? 0.8);
    $('#rh_independent_max_tokens').val(settings.independentApiMaxTokens ?? 30000);
    $('#rh_independent_context_layers').val(settings.independentContextMaxLayers ?? 20);
    checked('#rh_follow_tag_isolation', settings.followTagIsolationEnabled === true);
    $('#rh_independent_model').val(settings.independentApiModel || '');
    const tagFilterPresetLabels = new Map([
        ['thinking', 'thinking'],
        ['updatevariable', 'UpdateVariable'],
        ['updatevarible', 'UpdateVarible'],
    ]);
    let tagFilterDraft = new Set();
    let tagFilterDetected = new Map();
    let tagFilterScanController = null;
    let tagFilterScanEpoch = 0;
    const renderTagFilterSummary = () => {
        const current = getSettings();
        const tags = normalizeIndependentContextExcludedTags(current.independentContextExcludedTags);
        const followHint = current.followTagIsolationEnabled === true ? '跟随隔离已开' : '跟随隔离未开';
        const summary = tags.length
            ? `已选 ${tags.length} 项：${tags.slice(0, 3).map(tag => tagFilterPresetLabels.get(tag) || tag).join('、')}${tags.length > 3 ? '…' : ''}；${followHint}`
            : `未选择标签；${followHint}`;
        $('#rh_independent_tag_filter_summary').text(summary);
    };
    const renderTagFilterDraft = () => {
        const list = $('#rh_independent_tag_filter_list').empty();
        const knownTags = [...new Set([...DEFAULT_INDEPENDENT_CONTEXT_EXCLUDED_TAGS, ...tagFilterDraft, ...tagFilterDetected.keys()])];
        for (const tag of knownTags) {
            const row = $('<div>').css({ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '8px', alignItems: 'center', padding: '8px 9px', border: '1px solid color-mix(in srgb,currentColor 13%,transparent)', borderRadius: '10px' });
            const label = $('<label>').addClass('checkbox_label').css({ minWidth: 0, overflowWrap: 'anywhere' });
            const checkbox = $('<input>').attr({ type: 'checkbox', 'data-rh-context-tag': tag }).prop('checked', tagFilterDraft.has(tag));
            label.append(checkbox, document.createTextNode(` <${tagFilterPresetLabels.get(tag) || tag}>`));
            row.append(label);
            const detectedCount = Number(tagFilterDetected.get(tag) || 0);
            if (detectedCount > 0) row.append($('<span>').text(`扫描到 ${detectedCount} 次`).css({ opacity: .68, fontSize: '10px', whiteSpace: 'nowrap' }));
            else if (tagFilterPresetLabels.has(tag)) row.append($('<span>').text('常用').css({ opacity: .62, fontSize: '10px' }));
            else row.append($('<button>').attr({ type: 'button', 'data-rh-remove-context-tag': tag }).addClass('menu_button').text('移除').css({ minWidth: '64px' }));
            list.append(row);
        }
        if (!knownTags.length) list.append($('<div>').text('当前没有可选标签。').css({ opacity: .65, fontSize: '11px' }));
    };
    const cancelTagFilterScan = () => {
        tagFilterScanEpoch += 1;
        try { tagFilterScanController?.abort?.(); } catch {}
        tagFilterScanController = null;
        $('#rh_independent_tag_filter_scan').prop('disabled', false).text('扫描当前聊天标签');
        $('#rh_independent_tag_filter_save').prop('disabled', false);
    };
    try { globalThis.__rabbitMirrorTagFilterScanUiCleanup?.(); } catch {}
    globalThis.__rabbitMirrorTagFilterScanUiCleanup = cancelTagFilterScan;
    const setTagFilterOpen = open => {
        const modal = $('#rh_independent_tag_filter_modal');
        cancelTagFilterScan();
        if (open) {
            tagFilterDraft = new Set(normalizeIndependentContextExcludedTags(getSettings().independentContextExcludedTags));
            tagFilterDetected = new Map();
            $('#rh_independent_tag_filter_input').val('');
            $('#rh_independent_tag_filter_error').text('');
            $('#rh_independent_tag_filter_scan_status').text('扫描当前聊天已加载的正文源与可见正文；结果不会自动勾选或保存。');
            renderTagFilterDraft();
        }
        modal.attr('aria-hidden', open ? 'false' : 'true').css('display', open ? 'flex' : 'none');
        if (open) setTimeout(() => $('#rh_independent_tag_filter_input').trigger('focus'), 0);
    };
    renderTagFilterSummary();
    const renderIndependentConnectionStatus = () => {
        const currentSettings=getSettings();
        const currentId=String(currentSettings.independentConnectionProfileId||'').trim();
        const actualModel=String(currentSettings.independentApiModel||'').trim();
        const profile=getIndependentConnectionProfiles().find(item=>item.id===currentId);
        const target=$('#rh_independent_connection_status');
        if(!currentId){ target.text(`当前连接：手动接口；兔子镜请求模型：${actualModel||'尚未填写'}`); return; }
        if(!profile){ target.text('当前连接已失效，请重新一键配置'); return; }
        const profileDefault=String(profile.model||'').trim();
        const defaultHint=profileDefault && profileDefault!==actualModel ? `（Profile 默认：${profileDefault}）` : '';
        target.text(`当前连接：${profile.name}；兔子镜请求模型：${actualModel||profileDefault||'尚未选择'}${defaultHint}`);
    };
    renderIndependentConnectionStatus();
    checked('#rh_independent_read_global_world_info', settings.independentReadGlobalWorldInfo === true);
    checked('#rh_independent_include_character_summary', settings.independentReadCharacterCardSummary !== false);
    checked('#rh_independent_include_persona_summary', settings.independentReadPersonaSummary !== false);
    installWorldInfoBookVisibilityObserver();
    const syncGenerationModeFields = () => {
        const current = getSettings();
        const independent = current.generationSource === 'independent';
        $('#rh_independent_api_fields').show();
        $('#rh_follow_display_row').toggle(!independent);
        $('#rh_independent_mode_status').text(independent
            ? '当前已启用独立 API；以下设置会用于下一轮副 API 生成。'
            : `当前使用“跟随当前 API”；标签隔离${current.followTagIsolationEnabled === true ? '已开启' : '未开启'}，其余独立 API 设置可提前配置。`);
    };
    syncGenerationModeFields();
    renderIndependentApiDiagnostic();
    try { globalThis.__rabbitMirrorIndependentApiDiagnosticUiCleanup?.(); } catch {}
    const independentDiagnosticListener = event => { renderIndependentApiDiagnostic(event?.detail || null); };
    globalThis.addEventListener?.(API_REQUEST_DIAGNOSTIC_EVENT, independentDiagnosticListener);
    globalThis.__rabbitMirrorIndependentApiDiagnosticUiCleanup = () => globalThis.removeEventListener?.(API_REQUEST_DIAGNOSTIC_EVENT, independentDiagnosticListener);
    try { globalThis.__rabbitMirrorWorldInfoBooksUiCleanup?.(); } catch {}
    const worldInfoBooksListener = () => scheduleWorldInfoBookSettingsRender();
    globalThis.addEventListener?.(WORLD_INFO_BOOKS_CHANGED_EVENT, worldInfoBooksListener);
    globalThis.__rabbitMirrorWorldInfoBooksUiCleanup = () => globalThis.removeEventListener?.(WORLD_INFO_BOOKS_CHANGED_EVENT, worldInfoBooksListener);
    try { globalThis.__rabbitMirrorBlacklistUiCleanup?.(); } catch {}
    const blacklistListener = event => { checked('#rh_blacklist_enabled', getSettings().blacklistEnabled !== false); if (event?.detail?.action === 'enabled') refreshRecipeButtons(); if (document.getElementById('rh_random_preference_section')?.open) { renderBlacklistSettings(); renderFavoriteSettings(); } };
    globalThis.addEventListener?.(BLACKLIST_CHANGED_EVENT, blacklistListener);
    globalThis.__rabbitMirrorBlacklistUiCleanup = () => globalThis.removeEventListener?.(BLACKLIST_CHANGED_EVENT, blacklistListener);
    checked('#rh_feedback_cat', settings.feedbackCatEnabled);
    checked('#rh_maintenance_rabbit', settings.maintenanceRabbitEnabled);
    checked('#rh_maintenance_auto_safe', settings.maintenanceRabbitAutoSafeEnabled === true && settings.maintenanceRabbitAutoSafeConsent === true);
    $('#rh_sampling_mode').val(settings.samplingMode || 'classic');
    $('#rh_raw_policy').val(settings.rawPolicy || 'balanced');
    checked('#rh_user_directive', settings.userDirectivePriority);
    checked('#rh_worldview_lock', settings.presentationWorldviewLock === true);
    checked('#rh_creative_expansion', settings.creativeExpansionMode);
    checked('#rh_force_visual_scenery', settings.forceVisualScenery);
    checked('#rh_avoid_repeat', settings.avoidRepeat);
    checked('#rh_blacklist_enabled', settings.blacklistEnabled !== false);
    checked('#rh_memory_scan_enabled', settings.memoryScanEnabled);
    checked('#rh_visual_prompt_enabled', settings.visualPromptEditingEnabled);
    $('#rh_visual_prompt').val(settings.visualPrompt ?? DEFAULT_VISUAL_PROMPT);
    $('#rh_visual_extra_prompt').val(settings.visualExtraPrompt || '');
    $('#rh_visual_avoid_prompt').val(settings.visualAvoidPrompt || '');
    renderVisualPromptStatus(settings);

    const showAdvancedMenu = () => {
        $('.rh-advanced-page').hide();
        $('#rh_advanced_menu').css('display', 'grid');
        $('#rh_advanced_back_top').hide();
        $('#rh_advanced_modal_title').text('高级设置');
        $('#rh_advanced_modal_hint').text('选择要调整的项目');
        const scroll = document.getElementById('rh_advanced_scroll');
        if (scroll) scroll.scrollTop = 0;
    };
    const setAdvancedOpen = open => {
        const modal = $('#rh_advanced_modal');
        modal.attr('aria-hidden', open ? 'false' : 'true');
        modal.css('display', open ? 'flex' : 'none');
    };
    const closeAdvancedModal = () => {
        setAdvancedOpen(false);
        showAdvancedMenu();
    };
    $('#rh_advanced_open').on('click', () => {
        showAdvancedMenu();
        setAdvancedOpen(true);
    });
    $('#rh_advanced_close').on('click', closeAdvancedModal);
    $('#rh_advanced_back_top').on('click', showAdvancedMenu);
    $('#rh_advanced_modal').on('click', function (event) {
        if (event.target === this) closeAdvancedModal();
    });
    const showAdvancedPage = page => {
        const target = $(`#rh_advanced_page_${page}`);
        if (!target.length) return false;
        $('#rh_advanced_menu').hide();
        $('.rh-advanced-page').hide();
        target.show();
        $('#rh_advanced_back_top').show();
        $('#rh_advanced_modal_title').text(String(target.data('title') || '高级设置'));
        $('#rh_advanced_modal_hint').text('修改后按原有规则保存并从后续生成生效');
        const scroll = document.getElementById('rh_advanced_scroll');
        if (scroll) scroll.scrollTop = 0;
        if (page === 'worldinfo') renderWorldInfoBookSettings({ current: true, all: false });
        return true;
    };
    $('.rh-advanced-choice').on('click', function () {
        showAdvancedPage(String($(this).data('page') || ''));
    });
    $('#rh_independent_advanced_open').on('click', () => {
        showAdvancedMenu();
        setAdvancedOpen(true);
        showAdvancedPage('worldinfo');
    });

    const setWorldInfoPromptOpen = open => {
        const modal = $('#rh_world_info_prompt_modal');
        modal.attr('aria-hidden', open ? 'false' : 'true');
        modal.css('display', open ? 'flex' : 'none');
    };
    const applyIndependentWorldInfoChoice = enabled => {
        updateSettings({ independentReadGlobalWorldInfo: enabled === true });
        checked('#rh_independent_read_global_world_info', enabled === true);
        setWorldInfoPromptOpen(false);
        toastr?.info?.(enabled ? '已开启世界书读取，从下一轮独立 API 生成生效。' : '暂不读取世界书；之后可在高级设置中随时开启。');
    };
    $('#rh_world_info_prompt_enable').on('click', () => applyIndependentWorldInfoChoice(true));
    $('#rh_world_info_prompt_disable').on('click', () => applyIndependentWorldInfoChoice(false));
    $('#rh_world_info_prompt_close').on('click', () => setWorldInfoPromptOpen(false));
    $('#rh_world_info_prompt_modal').on('click', function (event) { if (event.target === this) setWorldInfoPromptOpen(false); });
    $('#rh_independent_tag_filter_open').on('click', () => setTagFilterOpen(true));
    $('#rh_independent_tag_filter_close, #rh_independent_tag_filter_cancel').on('click', () => setTagFilterOpen(false));
    $('#rh_independent_tag_filter_modal').on('click', function (event) { if (event.target === this) setTagFilterOpen(false); });
    $('#rh_independent_tag_filter_list').on('change', '[data-rh-context-tag]', function () {
        const tag = String($(this).attr('data-rh-context-tag') || '');
        if (!tag) return;
        if (this.checked && !tagFilterDraft.has(tag) && tagFilterDraft.size >= INDEPENDENT_CONTEXT_EXCLUDED_TAG_MAX_COUNT) {
            this.checked = false;
            $('#rh_independent_tag_filter_error').text(`最多只能过滤 ${INDEPENDENT_CONTEXT_EXCLUDED_TAG_MAX_COUNT} 个标签。`);
            return;
        }
        if (this.checked) tagFilterDraft.add(tag); else tagFilterDraft.delete(tag);
        $('#rh_independent_tag_filter_error').text('');
    });
    $('#rh_independent_tag_filter_list').on('click', '[data-rh-remove-context-tag]', function () {
        tagFilterDraft.delete(String($(this).attr('data-rh-remove-context-tag') || ''));
        renderTagFilterDraft();
    });
    const addTagFilterDraft = () => {
        const raw = String($('#rh_independent_tag_filter_input').val() || '').trim();
        const normalized = normalizeIndependentContextExcludedTags([raw]);
        if (!normalized.length) {
            $('#rh_independent_tag_filter_error').text('请输入普通标签名；只允许字母开头以及字母、数字、点、下划线、冒号或连字符。');
            return;
        }
        if (!tagFilterDraft.has(normalized[0]) && tagFilterDraft.size >= INDEPENDENT_CONTEXT_EXCLUDED_TAG_MAX_COUNT) {
            $('#rh_independent_tag_filter_error').text(`最多只能过滤 ${INDEPENDENT_CONTEXT_EXCLUDED_TAG_MAX_COUNT} 个标签。`);
            return;
        }
        tagFilterDraft.add(normalized[0]);
        $('#rh_independent_tag_filter_input').val('');
        $('#rh_independent_tag_filter_error').text('');
        renderTagFilterDraft();
    };
    $('#rh_independent_tag_filter_add').on('click', addTagFilterDraft);
    $('#rh_independent_tag_filter_input').on('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        addTagFilterDraft();
    });
    $('#rh_independent_tag_filter_scan').on('click', async () => {
        cancelTagFilterScan();
        const controller = new AbortController();
        tagFilterScanController = controller;
        const epoch = ++tagFilterScanEpoch;
        $('#rh_independent_tag_filter_scan').prop('disabled', true).text('正在扫描…');
        $('#rh_independent_tag_filter_save').prop('disabled', true);
        $('#rh_independent_tag_filter_scan_status').text('正在分批扫描当前聊天已加载的正文源与可见正文…');
        $('#rh_independent_tag_filter_error').text('');
        try {
            const result = await scanCurrentChatIndependentContextTags({ signal: controller.signal });
            if (epoch !== tagFilterScanEpoch || $('#rh_independent_tag_filter_modal').attr('aria-hidden') !== 'false') return;
            tagFilterDetected = new Map((result?.tags || [])
                .map(item => [String(item?.name || ''), Number(item?.count || 0)])
                .filter(([name, count]) => name && count > 0));
            renderTagFilterDraft();
            const total = [...tagFilterDetected.values()].reduce((sum, count) => sum + count, 0);
            const base = result?.available === false
                ? '当前没有可扫描的聊天正文。'
                : (tagFilterDetected.size
                    ? `扫描到 ${tagFilterDetected.size} 种、${total} 个自定义标签；尚未自动勾选。`
                    : '当前聊天已加载正文中没有发现可选自定义标签。');
            $('#rh_independent_tag_filter_scan_status').text(`${base}${result?.truncated ? ' 已达到安全上限，结果可能不完整。' : ''}`);
        } catch (error) {
            if (epoch !== tagFilterScanEpoch || controller.signal.aborted) return;
            $('#rh_independent_tag_filter_scan_status').text(error?.name === 'AbortError' ? String(error?.message || '扫描已取消，请重新扫描。') : '扫描失败，请稍后重试。');
        } finally {
            if (epoch === tagFilterScanEpoch) {
                tagFilterScanController = null;
                $('#rh_independent_tag_filter_scan').prop('disabled', false).text('扫描当前聊天标签');
                $('#rh_independent_tag_filter_save').prop('disabled', false);
            }
        }
    });
    $('#rh_independent_tag_filter_save').on('click', () => {
        const selectedTags = normalizeIndependentContextExcludedTags([...tagFilterDraft]);
        updateSettings({ independentContextExcludedTags: selectedTags });
        renderTagFilterSummary();
        setTagFilterOpen(false);
        toastr?.success?.('标签设置已保存：独立 API 下一轮发送前过滤；跟随当前 API 按隔离开关执行。');
    });
    $('#rh_follow_tag_isolation').on('change', e => {
        const enabled = e.target.checked === true;
        updateSettings({ followTagIsolationEnabled: enabled });
        renderTagFilterSummary();
        syncGenerationModeFields();
        toastr?.info?.(enabled
            ? '跟随标签隔离已开启，从下一轮兔子镜生效；正文与主预设不会被删除。'
            : '跟随标签隔离已关闭；独立 API 的发送前标签过滤设置不受影响。');
    });

    $('input[name="rh_generation_source"]').on('change', e => {
        const generationSource = e.target.value === 'independent' ? 'independent' : 'follow';
        updateSettings({ generationSource });
        clearRabbitMirrorPrompt(generationSource === 'independent' ? 'independent-api' : 'mode-change');
        syncGenerationModeFields();
        refreshRabbitMirrorGenerationMode();
        renderTokenMeter();
        toastr?.info?.(generationSource === 'independent' ? '已切换为独立 API。' : '已切换为跟随当前 API。');
        if (generationSource === 'independent') setWorldInfoPromptOpen(true);
    });
    $('input[name="rh_follow_display"]').on('change', e => { updateSettings({ followDisplayMode: e.target.value === 'external' ? 'external' : 'inline' }); refreshRabbitMirrorGenerationMode(); });
    $('input[name="rh_independent_display"]').on('change', e => { updateSettings({ independentDisplayMode: e.target.value === 'external_then_inline' ? 'external_then_inline' : 'external' }); refreshRabbitMirrorGenerationMode(); });
    $('#rh_independent_read_global_world_info').on('change', e => {
        updateSettings({ independentReadGlobalWorldInfo: e.target.checked === true });
        toastr?.info?.(e.target.checked ? '已开启世界书读取，从下一轮生效。' : '已关闭世界书读取，从下一轮生效。');
    });
    $('#rh_independent_include_character_summary').on('change', e => {
        updateSettings({ independentReadCharacterCardSummary: e.target.checked === true });
    });
    $('#rh_independent_include_persona_summary').on('change', e => {
        updateSettings({ independentReadPersonaSummary: e.target.checked === true });
    });
    $('#rh_world_info_all_books').on('toggle', function () {
        if (this.open) renderWorldInfoBookSettings({ current: false, all: true });
        else clearCollapsedAllWorldInfoBookRows();
    });
    $('#rh_world_info_books_fetch').on('click', async function () {
        const button = $(this);
        const status = $('#rh_world_info_books_fetch_status');
        button.prop('disabled', true);
        status.text('正在拉取…');
        try {
            pulledWorldInfoBooks = await fetchWorldInfoBooks();
            renderWorldInfoBookSettings({ current: false, all: true });
            status.text(`已拉取 ${pulledWorldInfoBooks.length} 本`);
            toastr?.success?.(`已拉取 ${pulledWorldInfoBooks.length} 本世界书；列表保留在折叠区内`);
        } catch (error) {
            pulledWorldInfoBooks = [];
            renderWorldInfoBookSettings({ current: false, all: true });
            const message = String(error?.message || error);
            status.text(message.includes('超时') ? '拉取超时' : '拉取失败');
            toastr?.warning?.(message);
        } finally {
            button.prop('disabled', false);
        }
    });
    $('#rh_world_info_book_filters, #rh_world_info_all_book_filters').on('change', '.rh-world-info-book-toggle', function () {
        const index = Number($(this).attr('data-book-index'));
        const container = $(this).closest('#rh_world_info_book_filters, #rh_world_info_all_book_filters');
        const books = container.data('rm-world-info-books') || [];
        const name = String(books[index] || '').trim();
        if (!name) return;
        const nextDisabled = new Set(getSettings().independentWorldInfoDisabledBooks || []);
        if (this.checked) nextDisabled.delete(name);
        else nextDisabled.add(name);
        updateSettings({ independentWorldInfoDisabledBooks: [...nextDisabled] });
        $('.rh-world-info-book-toggle').each(function () {
            if (String($(this).attr('data-book-id') || '') === name) $(this).prop('checked', !nextDisabled.has(name));
        });
        const safeName = escapeHtml(name);
        toastr?.info?.(this.checked ? `已开启「${safeName}」。` : `已关闭「${safeName}」。`);
    });
    $('#rh_independent_import_current').on('click', async function () {
        const connectionRevision=beginIndependentConnectionOperation();
        invalidateIndependentModelPull();
        const button=$(this); button.prop('disabled',true);
        try {
            const imported=await importCurrentSillyTavernConnection({
                isCurrent:()=>independentConnectionOperationIsCurrent(connectionRevision),
            });
            if(!independentConnectionOperationIsCurrent(connectionRevision)) return;
            const fresh=getSettings();
            document.getElementById('rh_independent_profile_refresh')?.click?.();
            syncIndependentProfileSelector(String(fresh.independentConnectionProfileId||''));
            $('#rh_independent_model').val(fresh.independentApiModel||imported?.model||'');
            renderIndependentConnectionStatus();
            const savedModels=getIndependentSavedModels();
            const source={mode:'profile',profileId:String(fresh.independentConnectionProfileId||''),label:String(imported?.name||'当前酒馆连接')};
            renderIndependentModelSelect(savedModels,String($('#rh_independent_model').val()||''),source,{
                statusText:savedModels.length?`已载入 ${savedModels.length} 个酒馆已保存模型；点击“从此酒馆连接拉取模型”可刷新完整列表。`:`已启用酒馆连接「${source.label}」；请点击按钮拉取模型。`,
            });
            refreshRabbitMirrorGenerationMode();
            toastr?.success?.(`已一键配置酒馆连接：${String(imported?.name||'当前连接')}`);
        } catch(error) {
            if(error?.code==='INDEPENDENT_CONNECTION_SELECTION_SUPERSEDED' || !isCurrentRuntime()) return;
            toastr?.error?.(`一键配置失败：${String(error?.message||error)}`);
        } finally { button.prop('disabled',false); }
    });
    $('#rh_independent_use_manual').on('click', () => {
        beginIndependentConnectionOperation();
        invalidateIndependentModelPull();
        const temperature=Number($('#rh_independent_temperature').val());
        const maxTokens=Number($('#rh_independent_max_tokens').val());
        const contextLayers=Number($('#rh_independent_context_layers').val());
        updateSettings({
            independentConnectionProfileId:'',
            independentApiBaseUrl:$('#rh_independent_base').val(),
            independentApiKey:$('#rh_independent_key').val(),
            independentApiModel:$('#rh_independent_model').val(),
            independentApiTemperature:Number.isFinite(temperature)?temperature:0.8,
            independentApiMaxTokens:Number.isFinite(maxTokens)&&maxTokens>0?maxTokens:30000,
            independentContextMaxLayers:Number.isFinite(contextLayers)&&contextLayers>0?contextLayers:20,
        });
        syncIndependentProfileSelector('');
        const source={mode:'manual',baseUrl:String($('#rh_independent_base').val()||'').trim(),apiKey:String($('#rh_independent_key').val()||''),label:'手动 OpenAI 兼容接口'};
        renderIndependentModelSelect([],String($('#rh_independent_model').val()||''),source,{selectCurrent:false,statusText:'已切换为手动接口；请从此手动接口拉取模型，或继续使用手填模型 ID。'});
        renderIndependentConnectionStatus();
        refreshRabbitMirrorGenerationMode();
        toastr?.info?.('已切换为旧手动 OpenAI 兼容接口。');
    });
    const saveIndependentFields = () => {
        const temperature = Number($('#rh_independent_temperature').val());
        const maxTokens = Number($('#rh_independent_max_tokens').val());
        const contextLayers = Number($('#rh_independent_context_layers').val());
        updateSettings({
            independentApiBaseUrl: $('#rh_independent_base').val(),
            independentApiKey: $('#rh_independent_key').val(),
            independentApiModel: $('#rh_independent_model').val(),
            independentApiTemperature: Number.isFinite(temperature) ? temperature : 0.8,
            independentApiMaxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 30000,
            independentContextMaxLayers: Number.isFinite(contextLayers) && contextLayers > 0 ? contextLayers : 20,
        });
    };
    // Do not serialize the whole extension settings object on every mobile input event.
    // Safari may emit repeated input/autofill events as the drawer opens, which made the UI stutter.
    $('#rh_independent_base, #rh_independent_key, #rh_independent_model').on('change blur', saveIndependentFields);
    $('#rh_independent_temperature, #rh_independent_max_tokens, #rh_independent_context_layers').on('change', saveIndependentFields);
    let independentModelListSource=null;
    const independentProfileSourceRevision = () => Number(globalThis.__rabbitMirrorIndependentProfileSourceRevision||0);
    const syncIndependentProfileSelector = profileId => {
        const select=$('#rh_independent_profile_select');
        if(!select.length) return;
        select.val(String(profileId||'').trim());
    };
    const independentModelSourceKey = source => {
        if(source?.mode==='profile') return `profile:${String(source.profileId||'').trim()}`;
        if(source?.mode==='manual') return `manual:${String(source.baseUrl||'').trim()}`;
        return '';
    };
    const independentModelSourceIsActive = source => {
        const current=getSettings();
        if(source?.mode==='profile') return String(current.independentConnectionProfileId||'').trim()===String(source.profileId||'').trim();
        if(source?.mode==='manual') return !String(current.independentConnectionProfileId||'').trim()
            && String(current.independentApiBaseUrl||'').trim()===String(source.baseUrl||'').trim();
        return false;
    };
    const beginIndependentModelPull = source => ({
        epoch:++independentModelPullEpoch,
        profileRevision:independentProfileSourceRevision(),
        activeProfileId:String(getSettings().independentConnectionProfileId||'').trim(),
        source:{...source},
    });
    const independentModelPullIsCurrent = snapshot => {
        return independentModelPullSnapshotMatches(snapshot,{
            epoch:independentModelPullEpoch,
            profileRevision:independentProfileSourceRevision(),
            activeProfileId:String(getSettings().independentConnectionProfileId||'').trim(),
            manualBaseUrl:String($('#rh_independent_base').val()||'').trim(),
            manualApiKey:String($('#rh_independent_key').val()||''),
        });
    };
    const renderIndependentModelSelect = (models, currentModel='', source=null, options={}) => {
        const select=$('#rh_independent_model_select');
        const current=String(currentModel||'').trim();
        const safeModels=Array.isArray(models)?models:[];
        independentModelListSource=source&&independentModelSourceKey(source)?{...source}:null;
        const sourceKey=independentModelSourceKey(independentModelListSource);
        select.attr('data-rh-model-source',sourceKey);
        const placeholder=options.placeholderText || (safeModels.length
            ? `已从${source?.label||'当前来源'}拉取 ${safeModels.length} 个模型，请选择`
            : '请从酒馆连接或手动接口拉取模型');
        select.empty().append($('<option>').val('').text(placeholder));
        for(const id of safeModels){
            select.append($('<option>').val(id).text(id));
        }
        // 只有当前手动模型确实存在于列表时才选中；自定义 ID 保持在文本框，不伪装成列表项。
        const selectCurrent=options.selectCurrent!==false && independentModelSourceIsActive(independentModelListSource);
        select.val(selectCurrent && safeModels.includes(current) ? current : '');
        const sourceText=options.statusText || (independentModelListSource
            ? `模型列表来源：${independentModelListSource.label||'当前来源'}。选择列表模型时，会同时锁定这个连接来源。`
            : '模型列表尚未拉取。列表来源与当前实际模型会分别标明。');
        $('#rh_independent_model_list_source').text(sourceText);
    };
    // Keystrokes only invalidate an in-flight list result; settings are still
    // saved on change/blur, so mobile input keeps the existing low-work path.
    $('#rh_independent_base, #rh_independent_key, #rh_independent_model').on('input', invalidateIndependentModelPull);
    $('#rh_independent_base, #rh_independent_key').on('change blur', () => {
        if(independentModelListSource?.mode!=='manual') return;
        const baseUrl=String($('#rh_independent_base').val()||'').trim();
        const apiKey=String($('#rh_independent_key').val()||'');
        if(baseUrl===String(independentModelListSource.baseUrl||'').trim() && apiKey===String(independentModelListSource.apiKey||'')) return;
        invalidateIndependentModelPull();
        const source={mode:'manual',baseUrl,apiKey,label:'手动 OpenAI 兼容接口'};
        renderIndependentModelSelect([],String($('#rh_independent_model').val()||''),source,{
            selectCurrent:false,
            statusText:'手动 API 地址或 Key 已改变；旧模型列表已清空，请重新拉取。',
        });
    });
    $('#rh_independent_model_select').on('change', e => {
        const model=String(e.target.value||'').trim();
        if(!model) return;
        const source=independentModelListSource;
        if(!source || String($(e.target).attr('data-rh-model-source')||'')!==independentModelSourceKey(source)) {
            toastr?.warning?.('这份模型列表的连接来源已失效，请重新拉取后再选择。');
            $(e.target).val('');
            return;
        }
        beginIndependentConnectionOperation();
        invalidateIndependentModelPull();
        $('#rh_independent_model').val(model);
        if(source.mode==='profile') {
            updateSettings({independentConnectionProfileId:String(source.profileId||'').trim(),independentApiKey:'',independentApiModel:model});
            syncIndependentProfileSelector(String(source.profileId||'').trim());
        } else {
            updateSettings({
                independentConnectionProfileId:'',
                independentApiBaseUrl:String(source.baseUrl||'').trim(),
                independentApiKey:String(source.apiKey||''),
                independentApiModel:model,
            });
            syncIndependentProfileSelector('');
        }
        renderIndependentConnectionStatus();
        refreshRabbitMirrorGenerationMode();
        $('#rh_independent_model_list_source').text(`已选择：${source.label||'当前来源'} / ${model}。下一次兔子镜请求将使用此连接与模型。`);
    });
    $('#rh_independent_model').on('change blur', () => {
        invalidateIndependentModelPull();
        const current=String($('#rh_independent_model').val()||'').trim();
        const select=$('#rh_independent_model_select');
        const exists=select.find('option').toArray().some(option=>String(option.value||'')===current);
        select.val(exists ? current : '');
        renderIndependentConnectionStatus();
    });
    $('#rh_independent_models').on('click', async function () {
        const button=$(this); const originalText=button.text();
        const currentSettings=getSettings();
        const profileId=String(currentSettings.independentConnectionProfileId||'').trim();
        const profile=getIndependentConnectionProfiles().find(item=>item.id===profileId);
        if(!profileId || !profile){ toastr?.warning?.('请先一键配置或选择一个酒馆 Connection Profile。'); return; }
        const source={mode:'profile',profileId,label:String(profile.name||'当前酒馆连接')};
        const pullSnapshot=beginIndependentModelPull(source);
        const current=String($('#rh_independent_model').val() || currentSettings.independentApiModel || '').trim();
        const savedModels=getIndependentSavedModels();
        button.prop('disabled',true).text('正在拉取…');
        renderIndependentModelSelect(savedModels,current,source,{statusText:`正在从酒馆连接「${source.label}」刷新模型列表；较慢中转最多等待 30 秒…`});
        try {
            const models=await fetchIndependentModels({mode:'profile',profileId});
            if(!isCurrentRuntime() || !independentModelPullIsCurrent(pullSnapshot)) return;
            renderIndependentModelSelect(models,current,source);
            if(current) {
                $('#rh_independent_model').val(current);
            } else if(models[0]) {
                $('#rh_independent_model').val(models[0]);
                $('#rh_independent_model_select').val(models[0]);
                updateSettings({independentApiModel:models[0]});
            }
            const diagnostic=getLastIndependentModelListDiagnostic();
            if(diagnostic?.mode==='saved-fallback') {
                toastr?.warning?.(`远端模型列表不可用；已显示酒馆连接中保存的 ${models.length} 个模型。${diagnostic.error||''}`);
            } else {
                toastr?.success?.(`已从酒馆连接「${source.label}」拉取 ${models.length} 个模型；选择后兔子镜会使用该模型，正文连接不会切换。`);
            }
        } catch(error) {
            if(!isCurrentRuntime() || !independentModelPullIsCurrent(pullSnapshot)) return;
            // 远端 /models 卡住或失败时保留酒馆已保存模型与手动 ID，不让设置页无限等待。
            renderIndependentModelSelect(savedModels,current,source,{statusText:savedModels.length?`远端拉取失败；已保留「${source.label}」的 ${savedModels.length} 个酒馆已保存模型。`:`从酒馆连接「${source.label}」拉取失败。`});
            if(current) $('#rh_independent_model').val(current);
            const fallbackText=savedModels.length ? `；已保留酒馆中已保存的 ${savedModels.length} 个模型` : '';
            toastr?.warning?.(`模型列表拉取失败${fallbackText}。${String(error?.message||error)}`);
        } finally {
            button.prop('disabled',false).text(originalText);
        }
    });
    $('#rh_independent_manual_models').on('click', async function () {
        const button=$(this); const originalText=button.text();
        const baseUrl=String($('#rh_independent_base').val()||'').trim();
        const apiKey=String($('#rh_independent_key').val()||'');
        if(!baseUrl){ toastr?.warning?.('请先填写手动 API 地址。'); return; }
        const source={mode:'manual',baseUrl,apiKey,label:'手动 OpenAI 兼容接口'};
        const pullSnapshot=beginIndependentModelPull(source);
        const current=String($('#rh_independent_model').val()||getSettings().independentApiModel||'').trim();
        const sourceWasActive=independentModelSourceIsActive(source);
        button.prop('disabled',true).text('正在拉取…');
        renderIndependentModelSelect([],current,source,{selectCurrent:false,statusText:'正在从手动 API 地址拉取模型；不会借用当前酒馆 Profile。'});
        try {
            const models=await fetchIndependentModels({mode:'manual',baseUrl,apiKey});
            if(!isCurrentRuntime() || !independentModelPullIsCurrent(pullSnapshot)) return;
            renderIndependentModelSelect(models,current,source,{selectCurrent:sourceWasActive});
            if(sourceWasActive && !current && models[0]){
                $('#rh_independent_model').val(models[0]);
                $('#rh_independent_model_select').val(models[0]);
                updateSettings({independentConnectionProfileId:'',independentApiBaseUrl:baseUrl,independentApiKey:apiKey,independentApiModel:models[0]});
                renderIndependentConnectionStatus();
            }
            toastr?.success?.(`已从手动接口拉取 ${models.length} 个模型；选择任一模型后会同时切换到这组手动连接。`);
        } catch(error) {
            if(!isCurrentRuntime() || !independentModelPullIsCurrent(pullSnapshot)) return;
            renderIndependentModelSelect([],current,source,{selectCurrent:false,statusText:'从手动 API 地址拉取失败；手填模型 ID 仍会保留。'});
            toastr?.warning?.(`手动接口模型列表拉取失败。${String(error?.message||error)}`);
        } finally {
            button.prop('disabled',false).text(originalText);
        }
    });
    $('#rh_independent_test').on('click', async () => {
        saveIndependentFields();
        const result=await testIndependentConnection();
        if(result.verified) {
            toastr?.success?.(`模型列表端点可用；检测到 ${result.models.length} 个模型`);
            return;
        }
        if(result.code==='MODEL_LIST_SAVED_FALLBACK') {
            toastr?.warning?.(`远端模型列表不可用；已确认兔子镜仍保留该酒馆连接中保存的 ${result.models.length} 个模型。${result.error||''}`);
            return;
        }
        const manualModel=String($('#rh_independent_model').val() || result.manualModel || '').trim();
        toastr?.[manualModel ? 'warning' : 'error']?.(manualModel
            ? `无法用 /models 验证；已保留模型「${manualModel}」。可直接生成测试。${result.error}`
            : `连接检测未通过：${result.error}`);
    });

    $('#rh_enabled').on('change', e => { updateSettings({ enabled: e.target.checked, autoRabbitMirrorInjection: e.target.checked, mode: e.target.checked ? 'integrated' : 'off' }); if (e.target.checked) syncFeedbackCatExtensionPrompt(getActiveFeedbackForCurrentChat()); else clearFeedbackCatExtensionPrompt(); refreshRabbitMirrorGenerationMode(); });
    $('#rh_feedback_cat').on('change', e => {
        updateSettings({ feedbackCatEnabled: e.target.checked });
        if (e.target.checked) syncFeedbackCatExtensionPrompt(getActiveFeedbackForCurrentChat());
        else clearFeedbackCatExtensionPrompt();
        refreshFeedbackCats();
        toastr?.[e.target.checked ? 'info' : 'success']?.(e.target.checked
            ? '挨打猫已启用：每条兔子镜会显示独立的 🐈，没有反馈时不会追加 Prompt。'
            : '挨打猫已关闭：标题入口已移除，已保存反馈暂停注入。');
    });
    $('#rh_maintenance_rabbit').on('change', e => {
        const enabled = !!e.target.checked;
        updateSettings({
            maintenanceRabbitEnabled: enabled,
            ...(enabled ? {} : { maintenanceRabbitAutoSafeEnabled: false, maintenanceRabbitAutoSafeConsent: false }),
        });
        if (!enabled) {
            checked('#rh_maintenance_auto_safe', false);
            configureMaintenanceAutoSafeMode(false);
        }
        refreshMaintenanceRabbits();
        toastr?.[enabled ? 'info' : 'success']?.(enabled
            ? '维修兔已启用：每条兔子镜会显示独立的 🐇⚪；默认仍为手动巡逻。'
            : '维修兔已关闭：自动巡逻同时关闭，标题入口已移除。');
    });
    $('#rh_maintenance_auto_safe').on('change', e => {
        const enabled = !!e.target.checked;
        if (enabled) checked('#rh_maintenance_rabbit', true);
        updateSettings({
            maintenanceRabbitEnabled: enabled ? true : getSettings().maintenanceRabbitEnabled,
            maintenanceRabbitAutoSafeEnabled: enabled,
            maintenanceRabbitAutoSafeConsent: enabled,
        });
        configureMaintenanceAutoSafeMode(enabled);
        refreshMaintenanceRabbits();
        toastr?.[enabled ? 'info' : 'success']?.(enabled
            ? '自动巡逻已开启，只自动修简单问题。'
            : '自动巡逻已关闭：维修兔恢复为纯手动模式。');
    });

    $('#rh_visual_prompt_enabled').on('change', e => {
        const enabled = !!e.target.checked;
        updateSettings({ visualPromptEditingEnabled: enabled });
        renderVisualPromptStatus(getSettings());
        toastr?.[enabled ? 'info' : 'success']?.(enabled
            ? '视觉提示词编辑注入已启用：从下一面兔子镜开始使用已保存的可编辑视觉层。'
            : '自定义视觉已关闭；从下一面恢复默认规则。');
    });

    $('#rh_visual_prompt_save').on('click', () => {
        const visualPrompt = String($('#rh_visual_prompt').val() ?? '').replace(/\r\n?/g, '\n').slice(0, VISUAL_PROMPT_MAX_CHARS);
        const visualExtraPrompt = String($('#rh_visual_extra_prompt').val() ?? '').replace(/\r\n?/g, '\n').slice(0, VISUAL_EXTRA_PROMPT_MAX_CHARS);
        const visualAvoidPrompt = String($('#rh_visual_avoid_prompt').val() ?? '').replace(/\r\n?/g, '\n').slice(0, VISUAL_AVOID_PROMPT_MAX_CHARS);
        updateSettings({ visualPrompt, visualExtraPrompt, visualAvoidPrompt });
        renderVisualPromptStatus(getSettings());
        const total = visualPrompt.length + visualExtraPrompt.length + visualAvoidPrompt.length;
        if (getSettings().visualPromptEditingEnabled && !visualPrompt.trim()) {
            toastr?.warning?.(`已保存（${total} 字符），但默认视觉规则是空的；建议恢复默认。`);
        } else {
            toastr?.success?.(getSettings().visualPromptEditingEnabled
                ? `视觉提示词已保存（${total} 字符），编辑注入已开启，将从下一面兔子镜开始生效。`
                : `视觉提示词已保存（${total} 字符），但编辑注入当前关闭；不会发送给模型。`);
        }
    });
    $('#rh_visual_prompt_reset').on('click', () => {
        $('#rh_visual_prompt').val(DEFAULT_VISUAL_PROMPT);
        updateSettings({ visualPrompt: DEFAULT_VISUAL_PROMPT });
        renderVisualPromptStatus(getSettings());
        toastr?.success?.('已恢复默认视觉规则；额外视觉偏好与避雷内容保持不变。');
    });

    $('#rh_memory_scan_enabled').on('change', e => {
        updateSettings({ memoryScanEnabled: e.target.checked });
        toastr?.[e.target.checked ? 'info' : 'success']?.(e.target.checked
            ? '已开启共同回忆额外资料读取：只有抽中 I.1 时才会读取已勾选来源。'
            : '已关闭额外资料读取；扫描结果和勾选记录会保留。');
    });
    $('#rh_memory_scan_now').on('click', () => {
        const results = scanMemoryPlugins();
        renderMemoryScanResults(results);
        const readableCount = results.filter(item => item.readable).length;
        const pendingCount = results.length - readableCount;
        toastr?.info?.(`扫描完成：${readableCount} 个可读取${pendingCount ? `，${pendingCount} 个其他候选已收起` : ''}。`);
    });
    $('#rh_memory_scan_results').on('change', '.rh-memory-provider-check', function () {
        const id = String($(this).data('provider-id') || '');
        const current = new Set(getSettings().memoryProviderIds || []);
        if (this.checked) current.add(id); else current.delete(id);
        updateSettings({ memoryProviderIds: [...current] });
    });
    $('#rh_memory_scan_results').on('click', '.rh-memory-test', function () {
        const id = String($(this).data('provider-id') || '');
        const result = testMemoryProvider(id);
        if (result.ok) toastr?.success?.(memoryTestMessage(result));
        else toastr?.error?.(memoryTestMessage(result));
    });

    $('#rh_sampling_mode').on('change', e => updateSettings({ samplingMode: e.target.value }));
    $('#rh_raw_policy').on('change', e => updateSettings({ rawPolicy: e.target.value }));
    $('#rh_user_directive').on('change', e => updateSettings({ userDirectivePriority: e.target.checked }));
    $('#rh_worldview_lock').on('change', e => {
        const enabled = !!e.target.checked;
        if (!enabled) {
            updateSettings({ presentationWorldviewLock: false });
            toastr?.info?.('展现形式世界观锁已关闭。');
            return;
        }
        const currentMode = String(getSettings().samplingMode || 'classic');
        if (currentMode !== 'format_only') {
            const accepted = globalThis.confirm?.('开启“展现形式世界观锁”时，建议把抽取模式改为“仅展现形式”，这样不会再随机抽取主题元素。\n\n是否现在切换为“仅展现形式”？') !== false;
            if (!accepted) {
                e.target.checked = false;
                return;
            }
            updateSettings({ presentationWorldviewLock: true, samplingMode: 'format_only' });
            $('#rh_sampling_mode').val('format_only');
            toastr?.info?.('展现形式世界观锁已开启，并已把抽取模式切换为“仅展现形式”。');
            return;
        }
        updateSettings({ presentationWorldviewLock: true });
        toastr?.info?.('展现形式世界观锁已开启。');
    });
    $('#rh_creative_expansion').on('change', e => updateSettings({ creativeExpansionMode: e.target.checked }));
    $('#rh_force_visual_scenery').on('change', e => updateSettings({ forceVisualScenery: e.target.checked }));
    $('#rh_avoid_repeat').on('change', e => updateSettings({ avoidRepeat: e.target.checked }));
    $('#rh_random_preference_section').on('toggle', function () {
        if (!this.open) return;
        renderBlacklistSettings();
        renderFavoriteSettings();
    });
    $('#rh_blacklist_enabled').on('change', e => {
        setBlacklistEnabled(e.target.checked);
        renderBlacklistSettings();
        toastr?.info?.(e.target.checked ? '黑名单已开启。' : '黑名单已暂停，名单仍保留。');
    });
    $('#rh_blacklist_summary').on('click', '.rh-blacklist-remove', function () {
        const kind = String($(this).data('kind') || '') === 'format' ? 'format' : 'theme';
        const id = String($(this).data('id') || '');
        if (removeBlacklistItem(kind, id)) toastr?.success?.(`已解除黑名单：${id}`);
        renderBlacklistSettings();
        refreshRecipeButtons();
    });
    $('#rh_blacklist_clear').on('click', () => {
        clearBlacklist('all');
        renderBlacklistSettings();
        refreshRecipeButtons();
        toastr?.success?.('已清空全部抽签黑名单');
    });
    $('#rh_favorite_summary').on('change', '.rh-favorite-multiplier', function () {
        const kind = String($(this).data('kind') || '') === 'format' ? 'format' : 'theme';
        const id = String($(this).data('id') || '');
        const multiplier = setFavoriteMultiplier(kind, id, $(this).val());
        if (multiplier == null) toastr?.warning?.(`收藏倍率没有修改：${id}`);
        else toastr?.success?.(`收藏倍率已更新：${id} ×${multiplier}`);
        renderFavoriteSettings();
        refreshRecipeButtons();
    });
    $('#rh_favorite_summary').on('click', '.rh-favorite-remove', function () {
        const kind = String($(this).data('kind') || '') === 'format' ? 'format' : 'theme';
        const id = String($(this).data('id') || '');
        if (removeFavoriteItem(kind, id)) toastr?.success?.(`已取消收藏：${id}`);
        renderFavoriteSettings();
        refreshRecipeButtons();
    });
    $('#rh_favorite_clear').on('click', () => {
        clearFavorites('all');
        renderFavoriteSettings();
        refreshRecipeButtons();
        toastr?.success?.('已清空全部收藏');
    });

    $('#rh_copy_regex').on('click', async () => {
        try {
            await navigator.clipboard.writeText(noSendRegex);
            toastr?.success?.('已复制推荐正则');
        } catch (error) {
            const textarea = document.createElement('textarea');
            textarea.value = noSendRegex;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            document.execCommand('copy');
            textarea.remove();
            toastr?.success?.('已复制推荐正则');
        }
    });

    $('#rh_clear_last').on('click', () => {
        clearLastCombo();
        toastr?.success?.('已清除抽签历史与冷却记录');
    });
    $('#rh_clear_injection').on('click', () => {
        clearRabbitMirrorPrompt('manual');
        toastr?.success?.('已清空当前兔子镜注入');
    });
    // Memory-provider discovery can be expensive on mobile. Never rescan merely because
    // the settings drawer was mounted/opened; scan only from the explicit button.
    if (settings.memoryScanEnabled || (settings.memoryProviderIds || []).length) {
        $('#rh_memory_scan_results').html('<div style="padding:8px 0;opacity:.68;font-size:11px;line-height:1.45;">已保存资料来源设置。需要刷新列表时请点击“扫描可用资料来源”。</div>');
    }

    let externalDiagnosticUiRevision = 0;
    const externalDiagnosticStatusText = (state, prefix = '诊断中') => `${prefix}｜原始事件 ${Number(state?.entries || 0)} 条（不是报告数）｜分类：外部资源 ${Number(state?.externalResources || 0)}｜外部长帧 ${Number(state?.externalLoaf || 0)}｜主线程阻塞 ${Number(state?.stalls || 0)}｜网络 ${Number(state?.network || 0)}｜维修点击窗口 ${Number(state?.maintenanceWindows || 0)}`;
    const renderExternalDiagnosticStatus = () => {
        const api = globalThis.__rabbitMirrorExternalDiag;
        const target = $('#rh_external_diag_status');
        if (!target.length) return;
        if (!api?.status) {
            target.text(retainedExternalDiagnosticReport && retainedExternalDiagnosticStatus
                ? externalDiagnosticStatusText(retainedExternalDiagnosticStatus, '已结束并保留最后报告')
                : '默认关闭（零常驻监听）；需要复现问题时再手动开启。');
            return;
        }
        const state = api.status();
        target.text(externalDiagnosticStatusText(state));
    };
    const ensureExternalDiagnosticApi = async () => {
        const existing = globalThis.__rabbitMirrorExternalDiag;
        if (existing?.status) return existing;
        return await globalThis.__rabbitMirrorEnsureExternalDiag?.();
    };
    const renderExternalDiagnosticReport = async () => {
        const api = globalThis.__rabbitMirrorExternalDiag;
        const output = $('#rh_external_diag_output');
        const text = api?.report ? String(api.report() || '') : retainedExternalDiagnosticReport;
        if (!text) { toastr?.error?.('请先开始外部诊断，复现问题后再结束并生成报告'); return ''; }
        output.val(text).show();
        renderExternalDiagnosticStatus();
        return text;
    };
    $('#rh_external_diag_start').on('click', async () => {
        const revision = ++externalDiagnosticUiRevision;
        const api = await ensureExternalDiagnosticApi();
        if (revision !== externalDiagnosticUiRevision) return;
        if (!api) { toastr?.error?.('外部诊断模块启动失败'); return; }
        retainedExternalDiagnosticReport = '';
        retainedExternalDiagnosticStatus = null;
        api.reset?.('user-start');
        $('#rh_external_diag_output').hide().val('');
        renderExternalDiagnosticStatus();
        toastr?.success?.('外部诊断已开始；请复现问题，再点击“结束并生成报告”');
    });
    $('#rh_external_diag_stop').on('click', () => {
        externalDiagnosticUiRevision += 1;
        const api = globalThis.__rabbitMirrorExternalDiag;
        const report = api?.report?.();
        const status = api?.status?.();
        if (report) retainedExternalDiagnosticReport = String(report);
        if (status) retainedExternalDiagnosticStatus = { ...status };
        globalThis.__rabbitMirrorDisableExternalDiag?.();
        if (retainedExternalDiagnosticReport) $('#rh_external_diag_output').val(retainedExternalDiagnosticReport).show();
        renderExternalDiagnosticStatus();
        toastr?.success?.(retainedExternalDiagnosticReport
            ? '外部诊断已结束并保留报告；常驻监听和定时器已移除'
            : '外部诊断未在运行；没有可生成的记录');
    });
    $('#rh_external_diag_report').on('click', async () => { await renderExternalDiagnosticReport(); });
    $('#rh_external_diag_copy').on('click', async () => {
        const text = await renderExternalDiagnosticReport();
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            toastr?.success?.('已复制外部代码／宿主性能诊断报告');
        } catch {
            const output = document.getElementById('rh_external_diag_output');
            output?.focus?.(); output?.select?.();
            try { document.execCommand('copy'); toastr?.success?.('已复制外部代码／宿主性能诊断报告'); }
            catch { toastr?.error?.('复制失败，请手动复制报告'); }
        }
    });
    $('#rh_external_diag_reset').on('click', () => {
        const api = globalThis.__rabbitMirrorExternalDiag;
        api?.reset?.('settings-button');
        retainedExternalDiagnosticReport = '';
        retainedExternalDiagnosticStatus = null;
        $('#rh_external_diag_output').hide().val('');
        renderExternalDiagnosticStatus();
        toastr?.success?.(api ? '已清空外部诊断记录，从现在重新记录' : '已清空最后保留的外部诊断报告');
    });
    renderExternalDiagnosticStatus();

    $('#rh_reset').on('click', () => {
        resetSettings();
        location.reload();
    });
    $('#rabbit_mirror_theater_settings').attr('data-rabbit-mirror-ui-ready', 'true');
    finishUiInit?.({ outcome: 'mounted' });
}

export function destroyRabbitMirrorUI() {
    invalidateIndependentModelPull();
    beginIndependentConnectionOperation();
    try { globalThis.__rabbitMirrorTagFilterScanUiCleanup?.(); } catch {}
    globalThis.__rabbitMirrorTagFilterScanUiCleanup = null;
    $('#rh_advanced_modal, #rh_world_info_prompt_modal, #rh_independent_tag_filter_modal').remove();
    if (uiMountRetryTimer) {
        clearTimeout(uiMountRetryTimer);
        uiMountRetryTimer = 0;
    }
    uiMountRetryCount = 0;
    try { globalThis.__rabbitMirrorTokenMeterUiCleanup?.(); } catch {}
    try { globalThis.__rabbitMirrorBlacklistUiCleanup?.(); } catch {}
    globalThis.__rabbitMirrorBlacklistUiCleanup = null;
    globalThis.__rabbitMirrorTokenMeterUiCleanup = null;
    try { globalThis.__rabbitMirrorIndependentApiDiagnosticUiCleanup?.(); } catch {}
    globalThis.__rabbitMirrorIndependentApiDiagnosticUiCleanup = null;
    try { globalThis.__rabbitMirrorWorldInfoBooksUiCleanup?.(); } catch {}
    globalThis.__rabbitMirrorWorldInfoBooksUiCleanup = null;
    clearWorldInfoBookRenderTimer();
    disconnectWorldInfoBookVisibilityObserver();
    worldInfoBookCurrentDirty = true;
    $('#rabbit_mirror_theater_settings').remove();
}
