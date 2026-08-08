const STORAGE_KEY = 'rabbit_mirror_theater:last_combo:v11';
const PENDING_KEY = 'rabbit_mirror_theater:pending_combo:v11';
const MAX_STORED = 20;
const ATTEMPT_STORAGE_KEY = 'rabbit_mirror_theater:generation_attempts:v1';
const DIRECTIVE_PICK_STORAGE_KEY = 'rabbit_mirror_theater:directive_pick_cache:v1';
const PALETTE_OBSERVATION_STORAGE_KEY = 'rabbit_mirror_theater:palette_observations:v1';
const MAX_PALETTE_OBSERVATIONS_PER_SCOPE = 12;
const PALETTE_OBSERVATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS_PER_CHAT = 20;
const MAX_DIRECTIVE_PICKS_PER_CHAT = 24;
const ATTEMPT_TTL_MS = 12 * 60 * 60 * 1000;
const DIRECTIVE_PICK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashText(text) {
    let hash = 2166136261;
    for (const char of String(text || '')) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function firstNonEmpty(values) {
    for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
    return '';
}

function getContextSafe() {
    try {
        return globalThis.SillyTavern?.getContext?.() || {};
    } catch {
        return {};
    }
}

function resolveChat(chatOverride = null) {
    const context = getContextSafe();
    if (Array.isArray(context?.chat) && context.chat.length) return context.chat;
    if (Array.isArray(chatOverride) && chatOverride.some(item => typeof item?.is_user === 'boolean')) return chatOverride;
    if (Array.isArray(globalThis.chat)) return globalThis.chat;
    return [];
}

export function getCurrentChatKey(chatOverride = null) {
    const context = getContextSafe();
    const chat = resolveChat(chatOverride);
    const metadata = context?.chatMetadata || globalThis.chat_metadata || {};
    const chatId = firstNonEmpty([
        context?.chatId,
        context?.chat_id,
        metadata?.chat_id,
        metadata?.file_name,
        metadata?.name,
    ]);
    const groupId = firstNonEmpty([context?.groupId, context?.group_id, globalThis.selected_group]);
    const characterId = firstNonEmpty([
        context?.characterId,
        context?.character_id,
        context?.character?.avatar,
        context?.characterName,
        globalThis.this_chid,
    ]);
    const firstMessage = chat[0] || {};
    const seed = firstNonEmpty([
        firstMessage?.send_date,
        firstMessage?.name,
        String(firstMessage?.mes || '').slice(0, 160),
        globalThis.location?.pathname,
    ]);
    return chatId
        ? `chat:${chatId}`
        : groupId
            ? `group:${groupId}:${hashText(seed)}`
            : characterId
                ? `character:${characterId}:${hashText(seed)}`
                : `fallback:${hashText(seed || 'unknown-chat')}`;
}

function readScopedStore(storageKey) {
    try {
        const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeScopedStore(storageKey, value) {
    try {
        localStorage.setItem(storageKey, JSON.stringify(value && typeof value === 'object' ? value : {}));
        return true;
    } catch (error) {
        console.warn('[RabbitMirror] Failed to store scoped generation state:', error);
        return false;
    }
}

function compactIdList(values, limit = 16) {
    return [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))].slice(0, limit);
}

export function getRecentGenerationAttemptIds(chatKey, limit = 10) {
    const key = String(chatKey || '').trim();
    if (!key) return { themeIds: [], formatIds: [], themeGroups: [], formatGroups: [] };
    const store = readScopedStore(ATTEMPT_STORAGE_KEY);
    const now = Date.now();
    const items = Array.isArray(store[key])
        ? store[key].filter(item => item && now - Number(item.ts || 0) <= ATTEMPT_TTL_MS)
        : [];
    if (items.length !== (Array.isArray(store[key]) ? store[key].length : 0)) {
        if (items.length) store[key] = items;
        else delete store[key];
        writeScopedStore(ATTEMPT_STORAGE_KEY, store);
    }
    const recent = items.slice(-Math.max(1, Number(limit) || 10));
    const themeIds = new Set();
    const formatIds = new Set();
    const themeGroups = new Set();
    const formatGroups = new Set();
    for (const item of recent) {
        for (const id of item.themeIds || []) themeIds.add(id);
        for (const id of item.formatIds || []) formatIds.add(id);
        for (const id of item.themeGroups || []) themeGroups.add(id);
        for (const id of item.formatGroups || []) formatGroups.add(id);
    }
    return {
        themeIds: [...themeIds],
        formatIds: [...formatIds],
        themeGroups: [...themeGroups],
        formatGroups: [...formatGroups],
    };
}

export function recordGenerationAttempt(combo, { chatKey = '', attemptId = '', directiveScoped = false } = {}) {
    const key = String(chatKey || '').trim();
    const id = String(attemptId || '').trim();
    if (!key || !id || !combo) return false;
    const store = readScopedStore(ATTEMPT_STORAGE_KEY);
    const now = Date.now();
    const items = Array.isArray(store[key])
        ? store[key].filter(item => item && now - Number(item.ts || 0) <= ATTEMPT_TTL_MS)
        : [];
    if (items.some(item => item.attemptId === id)) return false;
    items.push({
        attemptId: id,
        themeIds: compactIdList(combo.themeIds),
        formatIds: compactIdList(combo.formatIds),
        themeGroups: compactIdList(combo.themeGroups),
        formatGroups: compactIdList(combo.formatGroups),
        directiveScoped: !!directiveScoped,
        ts: now,
    });
    store[key] = items.slice(-MAX_ATTEMPTS_PER_CHAT);
    return writeScopedStore(ATTEMPT_STORAGE_KEY, store);
}

export function getDirectiveScopedPick(chatKey, directiveScopeKey) {
    const chat = String(chatKey || '').trim();
    const scope = String(directiveScopeKey || '').trim();
    if (!chat || !scope) return null;
    const store = readScopedStore(DIRECTIVE_PICK_STORAGE_KEY);
    const now = Date.now();
    const items = Array.isArray(store[chat])
        ? store[chat].filter(item => item && now - Number(item.ts || 0) <= DIRECTIVE_PICK_TTL_MS)
        : [];
    const found = items.find(item => item.scopeKey === scope) || null;
    if (items.length !== (Array.isArray(store[chat]) ? store[chat].length : 0)) {
        if (items.length) store[chat] = items;
        else delete store[chat];
        writeScopedStore(DIRECTIVE_PICK_STORAGE_KEY, store);
    }
    return found ? { ...found } : null;
}

export function setDirectiveScopedPick(chatKey, directiveScopeKey, combo) {
    const chat = String(chatKey || '').trim();
    const scope = String(directiveScopeKey || '').trim();
    if (!chat || !scope || !combo) return false;
    const store = readScopedStore(DIRECTIVE_PICK_STORAGE_KEY);
    const now = Date.now();
    const items = Array.isArray(store[chat])
        ? store[chat].filter(item => item && now - Number(item.ts || 0) <= DIRECTIVE_PICK_TTL_MS && item.scopeKey !== scope)
        : [];
    items.push({
        scopeKey: scope,
        themeIds: compactIdList(combo.themeIds),
        formatIds: compactIdList(combo.formatIds),
        uiReviewFocus: Array.isArray(combo.uiReviewFocus) ? combo.uiReviewFocus.slice(0, 8) : [],
        ts: now,
    });
    store[chat] = items.slice(-MAX_DIRECTIVE_PICKS_PER_CHAT);
    return writeScopedStore(DIRECTIVE_PICK_STORAGE_KEY, store);
}


function readHistory() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        if (Array.isArray(raw)) return raw;
        if (raw && typeof raw === 'object') return [raw];
        return [];
    } catch {
        return [];
    }
}

function signatureOf(combo) {
    return JSON.stringify({
        themeIds: combo?.themeIds || [],
        formatIds: combo?.formatIds || [],
        samplingMode: combo?.samplingMode || 'classic',
        forcedVisualScenery: !!combo?.forcedVisualScenery,
    });
}

export function getComboHistory(limit = 10) {
    const history = readHistory();
    return history.slice(-Math.max(0, Number(limit) || 10));
}

export function getLastCombo() {
    const history = readHistory();
    return history[history.length - 1] || {};
}

export function getRecentIds(limit = 10) {
    const history = getComboHistory(limit);
    const themeIds = new Set();
    const formatIds = new Set();
    const themeGroups = new Set();
    const formatGroups = new Set();
    const uiReviewFocus = [];

    for (const combo of history) {
        for (const id of combo?.themeIds || []) themeIds.add(id);
        for (const id of combo?.formatIds || []) formatIds.add(id);
        for (const id of combo?.themeGroups || []) themeGroups.add(id);
        for (const id of combo?.formatGroups || []) formatGroups.add(id);
        if (Array.isArray(combo?.uiReviewFocus) && combo.uiReviewFocus.length) {
            uiReviewFocus.push(combo.uiReviewFocus.join('；'));
        }
    }

    return {
        themeIds: [...themeIds],
        formatIds: [...formatIds],
        themeGroups: [...themeGroups],
        formatGroups: [...formatGroups],
        uiReviewFocus: uiReviewFocus.slice(-limit),
    };
}


export function getRecentRiskFlags(limit = 3) {
    const history = getComboHistory(limit);
    const flags = [];
    for (const item of history) {
        if (Array.isArray(item?.riskFlags)) flags.push(...item.riskFlags);
    }
    return [...new Set(flags)];
}

export function getRecentRiskFlagCounts(limit = 3) {
    const history = getComboHistory(limit);
    const counts = {};
    for (const item of history) {
        for (const flag of item?.riskFlags || []) {
            counts[flag] = (counts[flag] || 0) + 1;
        }
    }
    return counts;
}


export function getRecentPaletteFingerprints(limit = 3) {
    return getComboHistory(limit)
        .map(item => item?.paletteFingerprint)
        .filter(item => item && typeof item === 'object' && Number(item.confidence || 0) >= 0.35)
        .slice(-Math.max(0, Number(limit) || 3));
}


function paletteObservationScopeKey(chatKey, source = 'follow') {
    const chat = String(chatKey || '').trim();
    const normalizedSource = String(source || 'follow').trim() || 'follow';
    return chat ? `${chat}|${normalizedSource}` : '';
}

function readPaletteObservationStore() {
    return readScopedStore(PALETTE_OBSERVATION_STORAGE_KEY);
}

function prunePaletteObservationItems(items, now = Date.now()) {
    return (Array.isArray(items) ? items : [])
        .filter(item => item && now - Number(item.ts || 0) <= PALETTE_OBSERVATION_TTL_MS)
        .slice(-MAX_PALETTE_OBSERVATIONS_PER_SCOPE);
}

export function getRecentPaletteObservations({ chatKey = '', source = 'follow', limit = 4 } = {}) {
    const scope = paletteObservationScopeKey(chatKey || getCurrentChatKey(), source);
    if (!scope) return [];
    const store = readPaletteObservationStore();
    const now = Date.now();
    const original = Array.isArray(store[scope]) ? store[scope] : [];
    const items = prunePaletteObservationItems(original, now);
    if (items.length !== original.length) {
        if (items.length) store[scope] = items;
        else delete store[scope];
        writeScopedStore(PALETTE_OBSERVATION_STORAGE_KEY, store);
    }
    return items.slice(-Math.max(1, Number(limit) || 4)).map(item => ({ ...item }));
}

export function recordPaletteObservation(fingerprint, { chatKey = '', source = 'follow', messageKey = '' } = {}) {
    if (!fingerprint || typeof fingerprint !== 'object' || Number(fingerprint.confidence || 0) < 0.35) return false;
    const scope = paletteObservationScopeKey(chatKey || getCurrentChatKey(), source);
    if (!scope) return false;
    const store = readPaletteObservationStore();
    const now = Date.now();
    const items = prunePaletteObservationItems(store[scope], now);
    const normalizedMessageKey = String(messageKey || '').trim();
    const record = {
        messageKey: normalizedMessageKey.slice(0, 180),
        fingerprint: { ...fingerprint },
        ts: now,
    };
    const last = items[items.length - 1];
    if (normalizedMessageKey && last?.messageKey === normalizedMessageKey) {
        items[items.length - 1] = record;
    } else {
        items.push(record);
    }
    store[scope] = items.slice(-MAX_PALETTE_OBSERVATIONS_PER_SCOPE);
    return writeScopedStore(PALETTE_OBSERVATION_STORAGE_KEY, store);
}

function isDarkPaletteTrigger(fingerprint) {
    if (!fingerprint || typeof fingerprint !== 'object') return false;
    const confidence = Number(fingerprint.confidence || 0);
    const darkAreaRatio = Number(fingerprint.darkAreaRatio || 0);
    const averageLuminance = Number(fingerprint.averageLuminance || 255);
    return confidence >= 0.5
        && fingerprint.brightness === 'dark'
        && (darkAreaRatio >= 0.55 || averageLuminance <= 105);
}

// 一次低明度主承载输出触发后续五轮冷却；冷却期内若再次命中则重新从五轮开始。
export function getActivePaletteCooldown(rounds = 5) {
    const cooldownRounds = Math.max(1, Number(rounds) || 5);
    const history = readHistory();
    for (let index = history.length - 1; index >= 0; index -= 1) {
        const fingerprint = history[index]?.paletteFingerprint;
        if (!isDarkPaletteTrigger(fingerprint)) continue;
        const completedSinceTrigger = history.length - 1 - index;
        if (completedSinceTrigger >= cooldownRounds) return { active: false, remaining: 0 };
        return {
            active: true,
            remaining: cooldownRounds - completedSinceTrigger,
            completedSinceTrigger,
            fingerprint,
        };
    }
    return { active: false, remaining: 0 };
}

function normalizeInteractionFamily(value) {
    if (!value || typeof value !== 'object') return undefined;
    const id = String(value.id || '').trim();
    if (!id || id === 'none') return undefined;
    return {
        id: id.slice(0, 80),
        label: String(value.label || id).slice(0, 120),
        confidence: Math.max(0, Math.min(1, Number(value.confidence) || 0)),
        controlCount: Math.max(0, Math.min(99, Number(value.controlCount) || 0)),
        panelCount: Math.max(0, Math.min(99, Number(value.panelCount) || 0)),
    };
}

export function getRecentInteractionFamilies(limit = 5) {
    return getComboHistory(limit)
        .map(item => normalizeInteractionFamily(item?.interactionFamily))
        .filter(Boolean)
        .slice(-Math.max(0, Number(limit) || 5));
}

export function getRecentInteractionFamilyCounts(limit = 5) {
    const counts = {};
    for (const family of getRecentInteractionFamilies(limit)) {
        counts[family.id] = (counts[family.id] || 0) + 1;
    }
    return counts;
}

export function setPendingCombo(combo) {
    try {
        if (!combo) return;
        const pending = { ...combo, signature: signatureOf(combo), pendingTs: Date.now() };
        localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch (error) {
        console.warn('[RabbitMirror] Failed to store pending combo:', error);
    }
}

export function commitPendingCombo(visualSignature = '', visualSkeleton = '', riskFlags = [], paletteFingerprint = null, interactionFamily = null) {
    try {
        const raw = localStorage.getItem(PENDING_KEY);
        if (!raw) return;
        const pending = JSON.parse(raw);
        if (!pending || typeof pending !== 'object') return;

        const history = readHistory();
        const now = Date.now();
        const sig = pending.signature || signatureOf(pending);
        const last = history[history.length - 1];
        if (last?.signature === sig && now - Number(last?.ts || 0) < 120000) {
            if (visualSignature) last.visualSignature = String(visualSignature).slice(0, 280);
            if (visualSkeleton) last.visualSkeleton = String(visualSkeleton).slice(0, 360);
            if (Array.isArray(riskFlags) && riskFlags.length) last.riskFlags = [...new Set(riskFlags)].slice(0, 8);
            if (paletteFingerprint && typeof paletteFingerprint === 'object') last.paletteFingerprint = paletteFingerprint;
            const normalizedFamily = normalizeInteractionFamily(interactionFamily);
            if (normalizedFamily) last.interactionFamily = normalizedFamily;
            last.visualSignatureTs = now;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_STORED)));
            localStorage.removeItem(PENDING_KEY);
            return;
        }

        history.push({
            ...pending,
            signature: sig,
            ts: now,
            visualSignature: visualSignature ? String(visualSignature).slice(0, 280) : pending.visualSignature,
            visualSkeleton: visualSkeleton ? String(visualSkeleton).slice(0, 360) : pending.visualSkeleton,
            riskFlags: Array.isArray(riskFlags) ? [...new Set(riskFlags)].slice(0, 8) : [],
            paletteFingerprint: paletteFingerprint && typeof paletteFingerprint === 'object' ? paletteFingerprint : undefined,
            interactionFamily: normalizeInteractionFamily(interactionFamily),
            visualSignatureTs: visualSignature || visualSkeleton || (Array.isArray(riskFlags) && riskFlags.length) || paletteFingerprint || normalizeInteractionFamily(interactionFamily) ? now : undefined,
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_STORED)));
        localStorage.removeItem(PENDING_KEY);
    } catch (error) {
        console.warn('[RabbitMirror] Failed to commit pending combo:', error);
    }
}

// 兼容旧调用：0.31.21 起不再在 prompt 构建时直接写入“最近历史”，只暂存为 pending。
export function setLastCombo(combo) {
    setPendingCombo(combo);
}

export function clearLastCombo() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(PENDING_KEY);
        localStorage.removeItem(ATTEMPT_STORAGE_KEY);
        localStorage.removeItem(DIRECTIVE_PICK_STORAGE_KEY);
        localStorage.removeItem(PALETTE_OBSERVATION_STORAGE_KEY);
        try {
            sessionStorage.removeItem('rabbit_mirror_theater:generation_snapshots:v1');
            sessionStorage.removeItem('rabbit_mirror_theater:active_generation_attempt:v1');
        } catch {
            // Session storage is optional in some host contexts.
        }
        // 清理旧版 key，防止旧记录混淆。
        localStorage.removeItem('rabbit_mirror_theater:last_combo:v3');
        localStorage.removeItem('rabbit_mirror_theater:last_combo:v4');
        localStorage.removeItem('rabbit_mirror_theater:last_combo:v5');
        localStorage.removeItem('rabbit_mirror_theater:last_combo:v6');
        localStorage.removeItem('rabbit_mirror_theater:last_combo:v7');
        localStorage.removeItem('rabbit_mirror_theater:last_combo:v8');
        localStorage.removeItem('rabbit_mirror_theater:pending_combo:v8');
        localStorage.removeItem('rabbit_mirror_theater:last_combo:v9');
        localStorage.removeItem('rabbit_mirror_theater:pending_combo:v9');
        localStorage.removeItem('rabbit_mirror_theater:last_combo:v10');
        localStorage.removeItem('rabbit_mirror_theater:pending_combo:v10');
    } catch {}
}

export function updateLatestVisualSignature(visualSignature, visualSkeleton = '', riskFlags = [], paletteFingerprint = null, interactionFamily = null) {
    if (!visualSignature && !visualSkeleton && !(Array.isArray(riskFlags) && riskFlags.length) && !paletteFingerprint && !normalizeInteractionFamily(interactionFamily)) return;
    try {
        commitPendingCombo(visualSignature, visualSkeleton, riskFlags, paletteFingerprint, interactionFamily);
        const history = readHistory();
        if (!history.length) return;
        const last = history[history.length - 1];
        if (visualSignature) last.visualSignature = String(visualSignature).slice(0, 280);
        if (visualSkeleton) last.visualSkeleton = String(visualSkeleton).slice(0, 360);
        if (Array.isArray(riskFlags) && riskFlags.length) last.riskFlags = [...new Set(riskFlags)].slice(0, 8);
        if (paletteFingerprint && typeof paletteFingerprint === 'object') last.paletteFingerprint = paletteFingerprint;
        const normalizedFamily = normalizeInteractionFamily(interactionFamily);
        if (normalizedFamily) last.interactionFamily = normalizedFamily;
        last.visualSignatureTs = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_STORED)));
    } catch (error) {
        console.warn('[RabbitMirror] Failed to store visual signature:', error);
    }
}
