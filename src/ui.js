import { getSettings, updateSettings, resetSettings } from './settings.js?rmv=1.1.0b14h52t';
import { clearLastCombo } from './storage.js?rmv=1.1.0b14h52t';
import { clearRabbitMirrorPrompt } from './injector.js?rmv=1.1.0b14h52t';
import { clearFeedbackCatExtensionPrompt, getActiveFeedbackForCurrentChat, syncFeedbackCatExtensionPrompt } from './feedbackCat.js?rmv=1.1.0b14h52t';
import { configureMaintenanceAutoSafeMode, refreshFeedbackCats, refreshMaintenanceRabbits } from './outputSanitizer.js?rmv=1.1.0b14h52t';
import { scanMemoryPlugins, testMemoryProvider } from './memoryScanner.js?rmv=1.1.0b14h52t';
import { getLastRabbitMirrorTokenRecord, TOKEN_METER_EVENT } from './tokenMeter.js?rmv=1.1.0b14h52t';
import { fetchIndependentModels, refreshRabbitMirrorGenerationMode, testIndependentConnection } from './independentApi.js?rmv=1.1.0b14h52t';

const SETTINGS_UI_VERSION = '1.1.0-beta.14.52-test';
const RUNTIME_VERSION = '1.1.0-beta.14.52-test';

function isCurrentRuntime() {
    return globalThis.__rabbitMirrorRuntimeVersion === RUNTIME_VERSION;
}
let uiMountRetryTimer = 0;
let uiMountRetryCount = 0;

function scheduleUiMountRetry() {
    if (!isCurrentRuntime() || uiMountRetryTimer || uiMountRetryCount >= 20) return;
    uiMountRetryCount += 1;
    uiMountRetryTimer = setTimeout(() => {
        uiMountRetryTimer = 0;
        initRabbitMirrorUI();
    }, Math.min(1000, 120 + uiMountRetryCount * 40));
}

function checked(id, value) {
    $(id).prop('checked', !!value);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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

function renderTokenMeter(record = getLastRabbitMirrorTokenRecord()) {
    const root = $('#rh_token_meter');
    if (!root.length) return;
    const main = root.find('[data-rh-token-meter-main]');
    const exact = root.find('[data-rh-token-meter-exact]');
    const detail = root.find('[data-rh-token-meter-detail]');
    if (!record) {
        main.text('尚无生成记录');
        exact.text('发送下一轮消息后自动更新。');
        detail.text('只统计 RabbitMirror 自己写入的 Prompt。');
        return;
    }
    if (record.status !== 'injected') {
        main.text('0 Token');
        exact.text(tokenMeterNoInjectionLabel(record.reason));
        detail.text('未向模型追加 RabbitMirror Prompt。');
        return;
    }

    const tokens = record.tokens || {};
    const chars = record.chars || {};
    main.text(`约 ${formatMeterNumber(tokens.estimated)} Token`);
    exact.text(`保守范围 ${formatMeterNumber(tokens.min)}–${formatMeterNumber(tokens.max)}；精确字符数 ${formatMeterNumber(chars.total)}`);
    const parts = [
        `基础约 ${formatMeterNumber(tokens.baseEstimated)}`,
        chars.feedback ? `挨打猫追加约 ${formatMeterNumber(tokens.feedbackEstimated)}` : '挨打猫追加 0',
        `其中母本补充 ${formatMeterNumber(chars.motherLibrary)} 字符`,
        chars.sharedMemory ? `共同回忆资料 ${formatMeterNumber(chars.sharedMemory)} 字符` : '',
    ].filter(Boolean);
    detail.text(parts.join('；'));
}

function attachTokenMeterListener() {
    try { globalThis.__rabbitMirrorTokenMeterUiCleanup?.(); } catch {}
    const handler = event => renderTokenMeter(event?.detail || getLastRabbitMirrorTokenRecord());
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
    const settings = getSettings();
    const noSendRegex = '/<toto\\b[^>]*>[\\s\\S]*?<\\/toto>\\s*/gi';
    const existing = $('#rabbit_mirror_theater_settings');
    if (existing.length) {
        const currentPanels = existing.filter(`[data-rabbit-mirror-ui-version="${SETTINGS_UI_VERSION}"][data-rabbit-mirror-runtime-version="${RUNTIME_VERSION}"]`)
            .filter((_, panel) => $(panel).find('#rh_feedback_cat').length && $(panel).find('#rh_maintenance_rabbit').length);
        if (existing.length === 1 && currentPanels.length === 1) return;
        // A hot reload may leave the old settings DOM alive even after manifest.json has updated.
        // Remove every stale/duplicate panel so the claimed runtime becomes the only UI owner.
        existing.remove();
    }

    const settingsMount = $('#extensions_settings2');
    if (!settingsMount.length) {
        scheduleUiMountRetry();
        return;
    }
    uiMountRetryCount = 0;

    const html = `
<div id="rabbit_mirror_theater_settings" class="rabbit-mirror-settings" data-rabbit-mirror-ui-version="${SETTINGS_UI_VERSION}" data-rabbit-mirror-runtime-version="${RUNTIME_VERSION}">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>兔子镜小剧场 / Rabbit Mirror Theater <span style="font-size:11px;opacity:.72;">[TEST・生成方式切换・维修兔 v2.09-test]</span></b><span class="rabbit-mirror-toto-watermark">Toto Beta v1.1</span>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div class="rabbit-mirror-primary-toggle">
        <label class="checkbox_label"><input id="rh_enabled" type="checkbox"> 兔子镜自动注入</label>
        <div class="rabbit-mirror-subnote" style="margin:-2px 0 0 26px;opacity:.72;font-size:12px;line-height:1.45;">开启后每轮自动追加兔子镜规则。</div>
      </div>


      <details class="rabbit-mirror-section" open>
        <summary><span>兔子镜生成方式</span><span class="rabbit-mirror-section-note">二选一</span></summary>
        <div class="rabbit-mirror-section-content">
          <label class="checkbox_label"><input name="rh_generation_source" id="rh_generation_follow" type="radio" value="follow"> 跟随当前 API</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 8px 26px;opacity:.72;font-size:12px;line-height:1.45;">沿用当前生成链。可选择显示在正文下方，或抽离为消息级外置弹窗。</div>
          <div id="rh_follow_display_row" style="margin-left:26px;padding:7px 10px;border-left:2px solid color-mix(in srgb, var(--SmartThemeBorderColor) 60%, transparent);">
            <label><input name="rh_follow_display" type="radio" value="inline"> 正文下方</label>
            <label style="margin-left:14px;"><input name="rh_follow_display" type="radio" value="external"> 外置弹窗</label>
          </div>
          <label class="checkbox_label" style="margin-top:12px;"><input name="rh_generation_source" id="rh_generation_independent" type="radio" value="independent"> 使用独立 API</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 8px 26px;opacity:.72;font-size:12px;line-height:1.45;">当前 API 只生成正文，不注入兔子镜 Prompt。回复完成后，独立 API 读取当前聊天正文、可用推理、角色卡、Persona、世界书与作者注释，生成唯一的兔子镜。</div>
          <div id="rh_independent_api_fields" style="margin-left:26px;display:grid;gap:7px;">
            <div id="rh_independent_display_row" class="flex-container" style="gap:14px;flex-wrap:wrap;align-items:center;">
              <label><input name="rh_independent_display" type="radio" value="external"> ① 纯外置</label>
              <label><input name="rh_independent_display" type="radio" value="external_then_inline"> ② 外置后内嵌</label>
            </div>
            <input id="rh_independent_base" class="text_pole" type="text" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="API 地址，例如 https://example.com/v1 或 http://123.45.67.89:8000/v1">
            <input id="rh_independent_key" class="text_pole" type="password" autocomplete="off" placeholder="API Key">
            <div class="flex-container" style="gap:7px;flex-wrap:wrap;">
              <button id="rh_independent_models" class="menu_button" type="button">拉取模型</button>
              <button id="rh_independent_test" class="menu_button" type="button">测试连接</button>
            </div>
            <select id="rh_independent_model" class="text_pole"><option value="">请先拉取模型</option></select>
            <div class="flex-container" style="gap:8px;flex-wrap:wrap;align-items:center;">
              <label>温度 <input id="rh_independent_temperature" class="text_pole" type="number" min="0" max="2" step="0.1" style="width:82px;"></label>
              <label>最大输出 <input id="rh_independent_max_tokens" class="text_pole" type="number" min="512" max="32000" step="256" style="width:110px;"></label>
            </div>
            <div style="opacity:.66;font-size:11px;line-height:1.45;">API Key 仅保存在当前 SillyTavern 浏览器设置中。模型列表、连接检测与生成会通过 SillyTavern 自带的“自定义 Chat Completions”后端通道请求，不需要另装服务端插件，也不受浏览器 CORS 限制。</div>
          </div>
        </div>
      </details>


      <div id="rh_token_meter" class="rabbit-mirror-token-meter" aria-live="polite">
        <div class="rabbit-mirror-token-meter-head">
          <b>本轮 RabbitMirror 注入</b>
          <span data-rh-token-meter-main>尚无生成记录</span>
        </div>
        <div data-rh-token-meter-exact class="rabbit-mirror-token-meter-exact">发送下一轮消息后自动更新。</div>
        <div data-rh-token-meter-detail class="rabbit-mirror-token-meter-detail">只统计 RabbitMirror 自己写入的 Prompt。</div>
        <div class="rabbit-mirror-token-meter-note">字符数为精确值；Token 因模型分词器不同只能估算，因此同时给出保守范围。统计面板本身不会注入模型。</div>
      </div>

      <details class="rabbit-mirror-section">
        <summary><span>生成设置</span><span class="rabbit-mirror-section-note">抽取・视觉・冷却</span></summary>
        <div class="rabbit-mirror-section-content">
          <label for="rh_sampling_mode" class="flex-container alignitemscenter" style="gap:8px;flex-wrap:wrap;margin:8px 0;">
            <span>抽取模式</span>
            <select id="rh_sampling_mode" class="text_pole" style="max-width:260px;">
              <option value="classic">主题元素 + 展现形式（经典模式）</option>
              <option value="format_only">仅展现形式</option>
            </select>
          </label>

          <label for="rh_raw_policy" class="flex-container alignitemscenter" style="gap:8px;flex-wrap:wrap;margin:8px 0;">
            <span>母本检索深度</span>
            <select id="rh_raw_policy" class="text_pole" style="max-width:300px;">
              <option value="compact">精简：Prompt 较短，Token 较少</option>
              <option value="balanced">均衡：Prompt 长度适中（默认）</option>
              <option value="full">完整：Prompt 较长，参考内容更多</option>
            </select>
          </label>
          <div class="rabbit-mirror-subnote" style="margin:-4px 0 8px 0;opacity:.72;font-size:12px;line-height:1.45;">控制随机生成时使用的 Prompt 长短。越完整，参考内容越多，Token 占用也越高。</div>

          <label class="checkbox_label"><input id="rh_creative_expansion" type="checkbox"> 随机发挥模式（测试版）</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 6px 26px;opacity:.72;font-size:12px;line-height:1.45;">开启后会探索更为随机的内容，生成结果可能更跳脱、更有惊喜。</div>

          <label class="checkbox_label"><input id="rh_force_visual_scenery" type="checkbox"> 动态视觉场景</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 6px 26px;opacity:.72;font-size:12px;line-height:1.45;">开启后，展现形式将固定为动态视觉场景图，每轮兔子镜都会按此形式生成。</div>

          <label class="checkbox_label"><input id="rh_user_directive" type="checkbox"> 用户指令优先</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 6px 26px;opacity:.72;font-size:12px;line-height:1.45;">开启后，可以自由点菜自己喜欢的任意内容。</div>

          <label class="checkbox_label"><input id="rh_avoid_repeat" type="checkbox"> 10轮冷却：避免重复主题/展现形式/整体观感</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 2px 26px;opacity:.72;font-size:12px;line-height:1.45;">仅记录已经实际生成成功的兔子镜；用于避免连续复用相近的结构骨架与整体视觉家族。</div>
        </div>
      </details>

      <details class="rabbit-mirror-section rabbit-mirror-memory-test">
        <summary><span>共同回忆资料来源</span><span class="rabbit-mirror-section-note">TEST</span></summary>
        <div class="rabbit-mirror-section-content">
          <label class="checkbox_label"><input id="rh_memory_scan_enabled" type="checkbox"> 启用额外资料来源（测试）</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 8px 26px;opacity:.76;font-size:12px;line-height:1.45;">开启后，兔子镜可能生成回忆杀；仅在实际出现回忆杀时增加额外 Token。</div>
          <button id="rh_memory_scan_now" class="menu_button" type="button">扫描可用资料来源</button>
          <div style="margin-top:6px;opacity:.68;font-size:11px;line-height:1.45;">扫描公开、正规的记忆插件接口 API。</div>
          <div id="rh_memory_scan_results" style="margin-top:8px;"></div>
        </div>
      </details>

      <details class="rabbit-mirror-section rabbit-mirror-emergency rabbit-mirror-emergency-prominent">
        <summary><span>反馈、急救与诊断</span><span class="rabbit-mirror-section-note">按需使用</span></summary>
        <div class="rabbit-mirror-section-content">
          <label class="checkbox_label" style="font-weight:700;"><input id="rh_feedback_cat" type="checkbox"> 🐈 启用挨打猫</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 8px 26px;opacity:.78;font-size:12px;line-height:1.5;">用于纠正兔子镜的美化效果；仅在实际提交美化反馈时增加额外 Token。</div>
          <label class="checkbox_label" style="font-weight:700;"><input id="rh_maintenance_rabbit" type="checkbox"> 🐇 启用维修兔</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 6px 26px;opacity:.78;font-size:12px;line-height:1.5;">兔子镜出问题时，可使用维修兔进行检查和修复；维修兔本身不会增加模型 Token。</div>
          <label class="checkbox_label" style="font-weight:700;"><input id="rh_maintenance_auto_safe" type="checkbox"> 🧪 维修兔自动巡逻（测试）</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 8px 26px;opacity:.78;font-size:12px;line-height:1.5;">仅对开启后新生成或重新生成的兔子镜，自动执行一次高置信、局部、可重复验证的安全修复。排版重排、结构改造和内容判断仍需手动确认；全程本地运行，不增加 Token。</div>
        </div>
      </details>

      <details class="rabbit-mirror-section rabbit-mirror-tools">
        <summary><span>工具与维护</span><span class="rabbit-mirror-section-note">正则・清理・重置</span></summary>
        <div class="rabbit-mirror-section-content">
          <div class="rabbit-mirror-regex-helper">
            <div style="font-weight:600;margin-bottom:6px;">不发送小剧场正则</div>
            <div style="opacity:.82;font-size:12px;margin-bottom:8px;">设置：替换留空／勾选 AI输出／勾选 仅格式提示词</div>
            <button id="rh_copy_regex" class="menu_button" type="button">复制推荐正则</button>
          </div>

          <div class="rabbit-mirror-actions">
            <button id="rh_clear_last" class="menu_button">清除历史与冷却记录</button>
            <button id="rh_clear_injection" class="menu_button">清空当前注入</button>
            <button id="rh_reset" class="menu_button">恢复默认设置</button>
          </div>
        </div>
      </details>

    </div>
  </div>
</div>`;

    settingsMount.append(html);
    attachTokenMeterListener();
    renderTokenMeter();

    checked('#rh_enabled', settings.autoRabbitMirrorInjection !== false && settings.enabled !== false);
    $(`input[name="rh_generation_source"][value="${settings.generationSource || 'follow'}"]`).prop('checked', true);
    $(`input[name="rh_follow_display"][value="${settings.followDisplayMode || 'inline'}"]`).prop('checked', true);
    $(`input[name="rh_independent_display"][value="${settings.independentDisplayMode || 'external'}"]`).prop('checked', true);
    $('#rh_independent_base').val(settings.independentApiBaseUrl || '');
    $('#rh_independent_key').val(settings.independentApiKey || '');
    $('#rh_independent_temperature').val(settings.independentApiTemperature ?? 0.8);
    $('#rh_independent_max_tokens').val(settings.independentApiMaxTokens ?? 12000);
    $('#rh_independent_model').html(settings.independentApiModel ? `<option value="${escapeHtml(settings.independentApiModel)}">${escapeHtml(settings.independentApiModel)}</option>` : '<option value="">请先拉取模型</option>').val(settings.independentApiModel || '');
    const syncGenerationModeFields = () => { const independent = getSettings().generationSource === 'independent'; $('#rh_independent_api_fields').toggle(independent); $('#rh_follow_display_row').toggle(!independent); };
    syncGenerationModeFields();
    checked('#rh_feedback_cat', settings.feedbackCatEnabled);
    checked('#rh_maintenance_rabbit', settings.maintenanceRabbitEnabled);
    checked('#rh_maintenance_auto_safe', settings.maintenanceRabbitAutoSafeEnabled);
    $('#rh_sampling_mode').val(settings.samplingMode || 'classic');
    $('#rh_raw_policy').val(settings.rawPolicy || 'balanced');
    checked('#rh_user_directive', settings.userDirectivePriority);
    checked('#rh_creative_expansion', settings.creativeExpansionMode);
    checked('#rh_force_visual_scenery', settings.forceVisualScenery);
    checked('#rh_avoid_repeat', settings.avoidRepeat);
    checked('#rh_memory_scan_enabled', settings.memoryScanEnabled);

    $('input[name="rh_generation_source"]').on('change', e => {
        const generationSource = e.target.value === 'independent' ? 'independent' : 'follow';
        updateSettings({ generationSource });
        clearRabbitMirrorPrompt(generationSource === 'independent' ? 'independent-api' : 'mode-change');
        syncGenerationModeFields();
        refreshRabbitMirrorGenerationMode();
        toastr?.info?.(generationSource === 'independent' ? '已切换为独立 API。' : '已切换为跟随当前 API。');
    });
    $('input[name="rh_follow_display"]').on('change', e => { updateSettings({ followDisplayMode: e.target.value === 'external' ? 'external' : 'inline' }); refreshRabbitMirrorGenerationMode(); });
    $('input[name="rh_independent_display"]').on('change', e => { updateSettings({ independentDisplayMode: e.target.value === 'external_then_inline' ? 'external_then_inline' : 'external' }); refreshRabbitMirrorGenerationMode(); });
    const saveIndependentFields = () => updateSettings({ independentApiBaseUrl: $('#rh_independent_base').val(), independentApiKey: $('#rh_independent_key').val(), independentApiModel: $('#rh_independent_model').val(), independentApiTemperature: Number($('#rh_independent_temperature').val()) || 0.8, independentApiMaxTokens: Number($('#rh_independent_max_tokens').val()) || 12000 });
    // Do not serialize the whole extension settings object on every mobile input event.
    // Safari may emit repeated input/autofill events as the drawer opens, which made the UI stutter.
    $('#rh_independent_base, #rh_independent_key').on('change blur', saveIndependentFields);
    $('#rh_independent_model, #rh_independent_temperature, #rh_independent_max_tokens').on('change', saveIndependentFields);
    $('#rh_independent_models').on('click', async () => { saveIndependentFields(); try { const models=await fetchIndependentModels(); const current=getSettings().independentApiModel; $('#rh_independent_model').html(models.map(id=>`<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join('') || '<option value="">没有返回模型</option>'); if(current&&models.includes(current)) $('#rh_independent_model').val(current); else if(models[0]) { $('#rh_independent_model').val(models[0]); updateSettings({independentApiModel:models[0]}); } toastr?.success?.(`已拉取 ${models.length} 个模型`); } catch(error) { toastr?.error?.(String(error?.message||error)); } });
    $('#rh_independent_test').on('click', async () => { saveIndependentFields(); try { const result=await testIndependentConnection(); toastr?.success?.(`连接成功；可用模型 ${result.models.length} 个`); } catch(error) { toastr?.error?.(String(error?.message||error)); } });

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
            ...(enabled ? {} : { maintenanceRabbitAutoSafeEnabled: false }),
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
        });
        configureMaintenanceAutoSafeMode(enabled);
        refreshMaintenanceRabbits();
        toastr?.[enabled ? 'info' : 'success']?.(enabled
            ? '自动巡逻测试已开启：只处理之后新生成／重新生成兔子镜中的高置信安全问题；布局与结构问题仍需手动确认。'
            : '自动巡逻已关闭：维修兔恢复为纯手动模式。');
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
    $('#rh_creative_expansion').on('change', e => updateSettings({ creativeExpansionMode: e.target.checked }));
    $('#rh_force_visual_scenery').on('change', e => updateSettings({ forceVisualScenery: e.target.checked }));
    $('#rh_avoid_repeat').on('change', e => updateSettings({ avoidRepeat: e.target.checked }));

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
        toastr?.success?.('已清除兔子镜上轮组合记录');
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

    $('#rh_reset').on('click', () => {
        resetSettings();
        location.reload();
    });
}

export function destroyRabbitMirrorUI() {
    if (uiMountRetryTimer) {
        clearTimeout(uiMountRetryTimer);
        uiMountRetryTimer = 0;
    }
    uiMountRetryCount = 0;
    try { globalThis.__rabbitMirrorTokenMeterUiCleanup?.(); } catch {}
    globalThis.__rabbitMirrorTokenMeterUiCleanup = null;
    $('#rabbit_mirror_theater_settings').remove();
}
