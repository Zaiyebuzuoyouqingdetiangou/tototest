import { THEMATIC_CATEGORIES } from '../data/structured/thematicIndex.js?rmv=1.4.30.17';
import { PRESENTATION_FORMATS } from '../data/structured/presentationIndex.js?rmv=1.4.30.17';
import {
    getCurrentChatKey,
    getDirectiveScopedPick,
    getFormatEligibleMisses,
    getLastCombo,
    getRecentGenerationAttemptIds,
    getRecentIds,
    recordGenerationAttempt,
    recordFormatEligibleMissRound,
    setDirectiveScopedPick,
    setLastCombo,
    setPendingComboBatch,
    clearPendingComboBatch,
    clearPendingCombo,
} from './storage.js?rmv=1.4.9-subapitag2-advancedui1-stability1-repairemoji1-cleanui1-widthfix1-apifix2-modelselectfix1-streamfix1-variety1';
import { filterRandomFormatPool, filterRandomThemePool, getFavoritesState } from './blacklist.js?rmv=1.4.9-subapitag2-advancedui1-stability1-repairemoji1-cleanui1-widthfix1-apifix2-modelselectfix1-streamfix1-variety1';

function randomUnit() {
    try {
        const cryptoApi = globalThis.crypto;
        if (cryptoApi?.getRandomValues) {
            const value = new Uint32Array(1);
            cryptoApi.getRandomValues(value);
            return value[0] / 0x100000000;
        }
    } catch {
        // Older or restricted WebViews may not expose crypto; Math.random remains a safe compatibility fallback.
    }
    return Math.random();
}

function randomInt(min, max) {
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    return Math.floor(randomUnit() * (high - low + 1)) + low;
}

function shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(randomUnit() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function weightedThemeCount(settings) {
    const min = Number(settings.themesMin) || 1;
    const max = Number(settings.themesMax) || 3;
    const r = randomUnit();
    const count = r < 0.75 ? 1 : r < 0.97 ? 2 : 3;
    return clamp(count, min, max);
}

function weightedFormatCount(settings) {
    const min = Number(settings.formatsMin) || 1;
    const max = Number(settings.formatsMax) || 2;
    const count = randomUnit() < 0.85 ? 1 : 2;
    return clamp(count, min, max);
}


const UI_REVIEW_FOCUS = [
    '展现形式载体感',
    '媒介语法准确度',
    '非通用卡片化',
    '高级质感',
    '空间层级与视觉深度',
    '主视觉锚点明确',
    '文字密度服从载体',
    '文本长短错落',
    '阅读路径有节奏',
    '装饰方式与氛围契合',
    '配色服务本轮氛围',
    '避免状态栏化',
    '避免报告卡化',
    '避免普通信息面板化',
    '近期10轮观感去重'
];

function pickUiReviewFocus(count = 4) {
    const n = Math.max(3, Math.min(Number(count) || 4, UI_REVIEW_FOCUS.length));
    const mustHave = ['展现形式载体感', '媒介语法准确度', '近期10轮观感去重'];
    const rest = UI_REVIEW_FOCUS.filter(x => !mustHave.includes(x));
    return [...mustHave, ...shuffle(rest).slice(0, Math.max(0, n - mustHave.length))];
}

let cachedPick = null;

function normalizeGenerationScopeKey(value) {
    return String(value || '').trim();
}

function hashText(text) {
    let hash = 2166136261;
    for (const char of String(text || '')) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function compactUnique(values) {
    return [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))];
}

function mergeRecentHitMaps(base = {}, attempts = {}) {
    const result = {};
    for (const source of [base, attempts]) {
        for (const [key, raw] of Object.entries(source || {})) {
            const count = Math.max(0, Math.floor(Number(raw) || 0));
            if (key && count) result[key] = Math.max(Number(result[key] || 0), count);
        }
    }
    return result;
}

function mergeRecent(base, attempts) {
    return {
        themeIds: compactUnique([...(base?.themeIds || []), ...(attempts?.themeIds || [])]),
        formatIds: compactUnique([...(base?.formatIds || []), ...(attempts?.formatIds || [])]),
        themeGroups: compactUnique([...(base?.themeGroups || []), ...(attempts?.themeGroups || [])]),
        formatGroups: compactUnique([...(base?.formatGroups || []), ...(attempts?.formatGroups || [])]),
        themeIdHits: mergeRecentHitMaps(base?.themeIdHits, attempts?.themeIdHits),
        formatIdHits: mergeRecentHitMaps(base?.formatIdHits, attempts?.formatIdHits),
        themeGroupHits: mergeRecentHitMaps(base?.themeGroupHits, attempts?.themeGroupHits),
        formatGroupHits: mergeRecentHitMaps(base?.formatGroupHits, attempts?.formatGroupHits),
        uiReviewFocus: Array.isArray(base?.uiReviewFocus) ? [...base.uiReviewFocus] : [],
    };
}

function allowByMode(_item, mode) {
    if (mode === 'off') return false;
    return true;
}

function fairnessFactor(eligibleMisses) {
    const misses = Math.max(0, Math.floor(Number(eligibleMisses) || 0));
    if (misses >= 320) return 2.00;
    if (misses >= 220) return 1.70;
    if (misses >= 140) return 1.45;
    if (misses >= 80) return 1.25;
    if (misses >= 40) return 1.10;
    return 1.00;
}

function favoriteMultiplierFor(id, favoriteIds, multiplierMap = {}) {
    if (!(favoriteIds instanceof Set ? favoriteIds : new Set(favoriteIds || [])).has(id)) return 1;
    const raw = multiplierMap?.[id];
    const empty = raw == null || (typeof raw === 'string' && !raw.trim());
    const parsed = empty ? NaN : Number(raw);
    if (!Number.isFinite(parsed)) return 3;
    return Math.max(1, Math.min(50, parsed));
}

function favoriteThemeFamilyFactor(items, favorites, multiplierMap = {}) {
    let maxMultiplier = 1;
    for (const item of items || []) {
        if (!favorites.has(item.id)) continue;
        maxMultiplier = Math.max(maxMultiplier, favoriteMultiplierFor(item.id, favorites, multiplierMap));
    }
    if (maxMultiplier <= 1) return 1;
    // 兼容旧默认：单项 ×3 时家族仍是既有 ×2.5。高倍率只温和抬升家族层，
    // 并在 ×6 封顶，避免一个高倍率收藏把整个大家族一起成倍放大。
    return Math.min(6, 1 + (maxMultiplier - 1) * 0.75);
}

function recentDiversityFactor(hitCount, firstPenalty = 0.35, floor = 0.12) {
    const hits = Math.max(0, Math.floor(Number(hitCount) || 0));
    if (!hits) return 1;
    const first = Math.max(0.01, Math.min(1, Number(firstPenalty) || 0.35));
    const minimum = Math.max(0.01, Math.min(first, Number(floor) || 0.12));
    return Math.max(minimum, first * Math.pow(0.72, hits - 1));
}

function formatFamilyKey(itemOrId) {
    const id = typeof itemOrId === 'string' ? itemOrId : itemOrId?.id;
    const parts = String(id || '').split('.').filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
    return String(id || 'unknown');
}

function recentFamilyHits(idHits = {}, familyKey = value => String(value || '')) {
    const result = {};
    for (const [id, raw] of Object.entries(idHits || {})) {
        const family = familyKey(id);
        const count = Math.max(0, Math.floor(Number(raw) || 0));
        if (family && count) result[family] = Number(result[family] || 0) + count;
    }
    return result;
}

function weightedSample(pool, count, recentIds = [], recentGroups = [], avoidRepeat = true, hardExcludedIds = [], favoriteIds = [], eligibleMisses = {}, favoriteMultipliers = {}, recentGroupHitMap = {}, recentFamilyHitMap = {}) {
    const recent = new Set(recentIds || []);
    const groups = new Set(recentGroups || []);
    const hardExcluded = new Set(hardExcludedIds || []);
    const favorites = new Set(favoriteIds || []);
    let candidates = [...pool];

    // 每次新的非点菜生成都先硬排除刚刚抽过的子项；候选不足时才安全回退。
    if (hardExcluded.size) {
        const filtered = candidates.filter(x => !hardExcluded.has(x.id));
        if (filtered.length >= count) candidates = filtered;
    }

    // 正式冷却历史仍按原设置执行。
    if (avoidRepeat) {
        const filtered = candidates.filter(x => !recent.has(x.id));
        if (filtered.length >= count) candidates = filtered;
    }

    const selected = [];
    const used = new Set();
    while (selected.length < count && used.size < candidates.length) {
        const weighted = candidates
            .filter(item => !used.has(item.id))
            .map(item => {
                let weight = 1;
                // 第一次同组命中保留原 0.35 软冷却；同一组在最近窗口反复
                // 出现时继续累积有下限的债务。不同条目的基础权重仍不变。
                const groupHits = Number(recentGroupHitMap?.[item.group] || (groups.has(item.group) ? 1 : 0));
                if (avoidRepeat && groupHits) weight *= recentDiversityFactor(groupHits, 0.35);
                // 格式索引同时含父项与子项。精确 ID 虽不同，前两段家族相同
                // 时观感仍高度近似，因此增加软家族避让而不做硬排除。
                const familyHits = Number(recentFamilyHitMap?.[formatFamilyKey(item)] || 0);
                if (avoidRepeat && familyHits) weight *= recentDiversityFactor(familyHits, 0.28);
                // 收藏室只提高本地随机权重，不越过黑名单、硬排除或近期冷却。
                if (favorites.has(item.id)) weight *= favoriteMultiplierFor(item.id, favorites, favoriteMultipliers);
                // 公平性只作用于已经通过本轮资格过滤的候选；有上限，不形成固定轮播或硬保底。
                weight *= fairnessFactor(eligibleMisses?.[item.id]);
                return { item, weight };
            });
        const total = weighted.reduce((sum, x) => sum + x.weight, 0);
        let roll = randomUnit() * total;
        let chosen = weighted[weighted.length - 1]?.item;
        for (const entry of weighted) {
            roll -= entry.weight;
            if (roll <= 0) {
                chosen = entry.item;
                break;
            }
        }
        if (!chosen) break;
        selected.push(chosen);
        used.add(chosen.id);
    }
    const finalSelected = selected.length
        ? selected
        : shuffle(candidates).slice(0, Math.max(1, Math.min(count, candidates.length)));
    return {
        selected: finalSelected,
        eligibleIds: candidates.map(item => String(item?.id || '')).filter(Boolean),
    };
}

function themeFamilyKey(itemOrId) {
    const id = typeof itemOrId === 'string' ? itemOrId : itemOrId?.id;
    const parts = String(id || '').split('.').filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
    return String(id || 'unknown');
}

function pickWeightedEntry(entries, getWeight) {
    if (!entries.length) return null;
    const weighted = entries.map(entry => ({
        entry,
        weight: Math.max(0.0001, Number(getWeight(entry)) || 0.0001),
    }));
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    let roll = randomUnit() * total;
    for (const item of weighted) {
        roll -= item.weight;
        if (roll <= 0) return item.entry;
    }
    return weighted[weighted.length - 1]?.entry || null;
}

function themeFamilyBaseWeight(itemCount) {
    // 家族完全等权会让单条家族获得远高于普通单项的命中率。
    // 采用温和的规模校正：接近“条目等权”，但仍压低超大家族因子项数量造成的总量优势。
    return Math.pow(Math.max(1, Number(itemCount) || 1), 0.9);
}

/**
 * 主题采用“父主题家族优先 + 温和规模校正”抽取：
 * 家族仍是去重/冷却单位，但基础权重随家族有效条目数按 0.9 次方增长。
 * 这样单条家族不会天然拿到完整家族票，同时也不会让大树家族完全按子项数量线性霸榜。
 */
function weightedThemeSample(pool, count, recentIds = [], recentGroups = [], avoidRepeat = true, hardExcludedIds = [], favoriteIds = [], favoriteMultipliers = {}, recentGroupHitMap = {}, recentFamilyHitMap = {}) {
    const recent = new Set(recentIds || []);
    const recentGroupSet = new Set(recentGroups || []);
    const recentFamilySet = new Set((recentIds || []).map(themeFamilyKey));
    const hardExcluded = new Set(hardExcludedIds || []);
    const favorites = new Set(favoriteIds || []);
    let workingPool = [...pool];
    if (hardExcluded.size) {
        const filtered = workingPool.filter(item => !hardExcluded.has(item.id));
        if (filtered.length >= Math.max(1, Number(count) || 1)) workingPool = filtered;
    }
    const families = new Map();

    for (const item of workingPool) {
        const key = themeFamilyKey(item);
        if (!families.has(key)) families.set(key, { key, group: item.group, items: [] });
        families.get(key).items.push(item);
    }

    const familyList = [...families.values()];
    const selected = [];
    const usedFamilies = new Set();
    const targetCount = Math.max(0, Math.min(Number(count) || 0, familyList.length));

    while (selected.length < targetCount) {
        const availableFamilies = familyList.filter(family => !usedFamilies.has(family.key));
        if (!availableFamilies.length) break;

        const family = pickWeightedEntry(availableFamilies, entry => {
            let weight = themeFamilyBaseWeight(entry.items.length);
            const groupHits = Number(recentGroupHitMap?.[entry.group] || (recentGroupSet.has(entry.group) ? 1 : 0));
            const familyHits = Number(recentFamilyHitMap?.[entry.key] || (recentFamilySet.has(entry.key) ? 1 : 0));
            if (avoidRepeat && groupHits) weight *= recentDiversityFactor(groupHits, 0.35);
            if (avoidRepeat && familyHits) weight *= recentDiversityFactor(familyHits, 0.25);
            weight *= favoriteThemeFamilyFactor(entry.items, favorites, favoriteMultipliers);
            return weight;
        });
        if (!family) break;
        usedFamilies.add(family.key);

        let itemCandidates = [...family.items];
        if (avoidRepeat) {
            const freshItems = itemCandidates.filter(item => !recent.has(item.id));
            if (freshItems.length) itemCandidates = freshItems;
        }

        const chosen = pickWeightedEntry(itemCandidates, item => {
            let weight = !avoidRepeat || !recent.has(item.id) ? 1 : 0.12;
            if (favorites.has(item.id)) weight *= favoriteMultiplierFor(item.id, favorites, favoriteMultipliers);
            return weight;
        });
        if (chosen) selected.push(chosen);
    }

    if (selected.length) return selected;
    return shuffle(workingPool).slice(0, Math.max(1, Math.min(count, workingPool.length)));
}

function getCurrentTurnUserMessage(chatOverride = null) {
    try {
        const context = globalThis.SillyTavern?.getContext?.() || {};
        const overrideUsable = Array.isArray(chatOverride) && chatOverride.some(item => typeof item?.is_user === 'boolean');
        const chat = Array.isArray(context?.chat) && context.chat.length
            ? context.chat
            : overrideUsable
                ? chatOverride
                : Array.isArray(globalThis.chat)
                    ? globalThis.chat
                    : [];

        // 取本次助手回复所对应的最近一条用户消息。
        // 因此同一条回复反复重说/Swipe 时仍能识别同一份点菜；用户发送新消息后自然切换到新消息。
        for (let index = chat.length - 1; index >= 0; index -= 1) {
            const message = chat[index];
            if (!message || typeof message.mes !== 'string' || message.is_system || !message.is_user) continue;
            const text = message.mes.trim();
            if (!text) return null;
            const stablePart = String(message.mesid ?? message.send_date ?? index);
            return {
                text: message.mes,
                index,
                key: `${stablePart}:${hashText(message.mes)}`,
            };
        }
        return null;
    } catch (_error) {
        return null;
    }
}

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[\s`*_【】\[\]（）()「」『』:：,，.。;；/\\|+\-—_]/g, '');
}

function splitDirectiveText(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .split(/[+＋、,，;；\n]/)
        .map(x => x.trim())
        .filter(Boolean);
}

function uniqueDirectiveTexts(items, limit = 8, maxChars = 700) {
    const seen = new Set();
    const result = [];
    for (const value of items || []) {
        const text = String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxChars);
        if (!text) continue;
        const key = normalizeText(text);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        result.push(text);
        if (result.length >= limit) break;
    }
    return result;
}

function itemHaystack(item) {
    return normalizeText([
        item.id,
        item.title,
        item.summary,
        item.raw,
        ...(item.tags || []),
    ].join(' '));
}

function matchOne(pool, query) {
    const q = normalizeText(query);
    if (!q) return null;

    let best = null;
    let bestScore = 0;
    for (const item of pool) {
        const id = normalizeText(item.id);
        const title = normalizeText(item.title);
        const summary = normalizeText(item.summary);
        const raw = normalizeText(item.raw);
        const haystack = itemHaystack(item);

        let score = 0;
        if (id === q) score = 100;
        else if (title === q) score = 95;
        else if (id.includes(q) || q.includes(id)) score = Math.max(score, 80);
        else if (title.includes(q) || q.includes(title)) score = Math.max(score, 75);
        else if (summary.includes(q)) score = Math.max(score, 55);
        else if (raw.includes(q)) score = Math.max(score, 50);
        else if (haystack.includes(q)) score = Math.max(score, 40);

        if (score > bestScore) {
            best = item;
            bestScore = score;
        }
    }
    return bestScore >= 40 ? best : null;
}

function uniqueById(items) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
        if (!item || seen.has(item.id)) continue;
        seen.add(item.id);
        result.push(item);
    }
    return result;
}

function extractAfterPatterns(message, patterns) {
    const results = [];
    for (const pattern of patterns) {
        const regex = new RegExp(pattern, 'ig');
        let match;
        while ((match = regex.exec(message)) !== null) {
            const value = (match[1] || '').trim();
            if (value) results.push(value);
        }
    }
    return results;
}

function cleanDirectiveBlock(value, maxChars = 3000) {
    return String(value || '')
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+$/gm, '')
        .trim()
        .slice(0, maxChars);
}

function findExplicitDirectiveStart(message) {
    const patterns = [
        // 兔子镜：…… / 本轮兔子镜主题：…… / 小剧场要求：……
        /(^|[\n。！？!?；;])([ \t]*(?:[-*•]\s*)?(?:(?:本轮|这次|下次|下一个)\s*)?(?:兔子镜|小剧场)\s*(?:(?:主题|元素|题材|展现形式|展示形式|表现形式|格式|形式|要求|指令)\s*)?[:：])/igm,
        // 这次兔子镜做成…… / 把小剧场改成……
        /(^|[\n。！？!?；;])([ \t]*(?:[-*•]\s*)?(?:请\s*)?(?:把|将)?\s*(?:(?:本轮|这次|下次|下一个)\s*)?(?:兔子镜|小剧场)\s*(?:做成|改成|换成|用|生成|来|要|想看|想要|指定))/igm,
        // 做一个……的兔子镜 / 生成一个……小剧场
        /(^|[\n。！？!?；;])([ \t]*(?:[-*•]\s*)?(?:请\s*)?(?:做|生成|来|给我来|想看|想要|换成|改成|做成)(?:一个|个)?\s*[^。\n！？!?；;]{1,700}?(?:的)?(?:兔子镜|小剧场)(?=$|[。！？!?；;\n]))/igm,
    ];

    let earliest = null;
    for (const pattern of patterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(message);
        if (!match) continue;
        const index = match.index + String(match[1] || '').length;
        if (earliest === null || index < earliest) earliest = index;
    }
    return earliest;
}

function extractRabbitMirrorDirective(message) {
    const source = String(message || '');
    if (!source || !/(兔子镜|小剧场)/.test(source)) return '';

    const start = findExplicitDirectiveStart(source);
    if (start === null) return '';

    let block = source.slice(start);
    // 用户可在同一条消息中用“正文：/继续剧情：”明确结束点菜区块。
    const stopMatch = /\n\s*(?:正文|剧情|继续剧情|继续角色扮演|角色扮演|RP)\s*[:：]/i.exec(block);
    if (stopMatch) block = block.slice(0, stopMatch.index);
    return cleanDirectiveBlock(block);
}

function extractDisableDirective(message) {
    const source = String(message || '');
    const patterns = [
        /(^|[\n。！？!?；;])\s*(?:(?:本轮|这次)\s*)?(?:不要|不用|关闭|关掉|禁用|停止)\s*(?:兔子镜|小剧场)/im,
        /(^|[\n。！？!?；;])\s*(?:(?:本轮|这次)\s*)?(?:兔子镜|小剧场)\s*(?:关闭|关掉|不要|不用|禁用|停止|off)/im,
    ];
    for (const pattern of patterns) {
        const match = pattern.exec(source);
        if (!match) continue;
        const start = match.index + String(match[1] || '').length;
        return cleanDirectiveBlock(source.slice(start), 700);
    }
    return '';
}

function parseUserDirective(currentTurn) {
    const message = String(currentTurn?.text || '');
    if (!message) return null;

    const disableDirective = extractDisableDirective(message);
    if (disableDirective) {
        return {
            disabled: true,
            reason: '用户本轮明确要求关闭兔子镜',
            rawDirective: disableDirective,
            messageKey: currentTurn?.key || '',
        };
    }

    const rawDirective = extractRabbitMirrorDirective(message);
    if (!rawDirective) return null;

    const themeTexts = extractAfterPatterns(rawDirective, [
        '(?:兔子镜|小剧场)(?:主题|元素|题材|theme)\\s*[:：]\\s*([^\\n。；;]+)',
        '(?:兔子镜|小剧场)(?:主题|元素|题材|theme)\\s+(?:用|要|换成|改成|做成)?\\s*([^\\n。；;]+)',
    ]);
    const formatTexts = extractAfterPatterns(rawDirective, [
        '(?:兔子镜|小剧场)(?:展现形式|展示形式|表现形式|格式|形式|format|ui|UI)\\s*[:：]\\s*([^\\n。；;]+)',
        '(?:兔子镜|小剧场)(?:展现形式|展示形式|表现形式|格式|形式|format|ui|UI)\\s+(?:用|要|换成|改成|做成)?\\s*([^\\n。；;]+)',
    ]);
    const generalTexts = extractAfterPatterns(rawDirective, [
        '(?:兔子镜|小剧场)\\s*[:：]\\s*([^\\n。；;]+)',
        '(?:兔子镜|小剧场)\\s*(?:想看|想要|来|要|指定|换成|改成|做成|用|生成)\\s*([^\\n。；;]+)',
        '(?:下一个|下次|这次|本轮)?\\s*(?:兔子镜|小剧场)\\s*(?:想看|想要|来|要|指定|换成|改成|做成|用|生成)\\s*([^\\n。；;]+)',
        '(?:想看|想要|来(?:一个|个)?|做(?:一个|个)?|生成(?:一个|个)?|换成|改成|做成)\\s*([^\\n。；;]{1,700}?)(?:的)?(?:兔子镜|小剧场)(?=$|[。；;！!？?\\n])',
    ]).filter(x => !/^(主题|元素|题材|展现形式|展示形式|表现形式|格式|形式)\s*[:：]/.test(x));

    const themeQueries = uniqueDirectiveTexts(splitDirectiveText(themeTexts.join('、')));
    const formatQueries = uniqueDirectiveTexts(splitDirectiveText(formatTexts.join('、')));
    const generalQueries = uniqueDirectiveTexts(splitDirectiveText(generalTexts.join('、')));

    const themes = [];
    const formats = [];
    const customThemes = [];
    const customFormats = [];
    const customRequests = [];
    let hasThemeRequest = themeQueries.length > 0;
    let hasFormatRequest = formatQueries.length > 0;

    for (const query of themeQueries) {
        const matched = matchOne(THEMATIC_CATEGORIES, query);
        if (matched) themes.push(matched);
        else customThemes.push(query);
    }
    for (const query of formatQueries) {
        const matched = matchOne(PRESENTATION_FORMATS, query);
        if (matched) formats.push(matched);
        else customFormats.push(query);
    }
    for (const query of generalQueries) {
        const format = matchOne(PRESENTATION_FORMATS, query);
        const theme = matchOne(THEMATIC_CATEGORIES, query);
        if (format) {
            formats.push(format);
            hasFormatRequest = true;
        }
        if (theme) {
            themes.push(theme);
            hasThemeRequest = true;
        }
        if (!format && !theme) {
            customRequests.push(query);
            // 未分类自由点菜可能同时规定“演什么”和“怎么演”；为避免随机项冲掉原意，两侧均视为已指定。
            hasThemeRequest = true;
            hasFormatRequest = true;
        }
    }

    const uniqueThemes = uniqueById(themes);
    const uniqueFormats = uniqueById(formats);
    const uniqueCustomThemes = uniqueDirectiveTexts(customThemes);
    const uniqueCustomFormats = uniqueDirectiveTexts(customFormats);
    const uniqueCustomRequests = uniqueDirectiveTexts(customRequests);

    return {
        disabled: false,
        themes: uniqueThemes,
        formats: uniqueFormats,
        customThemes: uniqueCustomThemes,
        customFormats: uniqueCustomFormats,
        customRequests: uniqueCustomRequests,
        hasThemeRequest,
        hasFormatRequest,
        source: '当前待回复用户消息中的明确兔子镜点菜',
        rawDirective,
        messageKey: currentTurn?.key || '',
    };
}

function getVisualSceneryFormat() {
    return PRESENTATION_FORMATS.find(item => item.id === '10.2.2' || normalizeText(item.title) === normalizeText('Visual Scenery')) || null;
}

function applyDirectiveOrRandom({ settings, directive, themePool, formatPool, themeCount, formatCount, recent, hardRecent, favoriteThemeIds, favoriteFormatIds, favoriteThemeMultipliers, favoriteFormatMultipliers, formatEligibleMisses }) {
    if (directive?.disabled) return { disabled: true, directive };
    const themeFamilyHitMap = recentFamilyHits(recent.themeIdHits, themeFamilyKey);
    const formatFamilyHitMap = recentFamilyHits(recent.formatIdHits, formatFamilyKey);

    const pickedThemes = directive?.hasThemeRequest
        ? []
        : weightedThemeSample(
            themePool,
            themeCount,
            recent.themeIds,
            recent.themeGroups,
            settings.avoidRepeat,
            hardRecent.themeIds,
            favoriteThemeIds,
            favoriteThemeMultipliers,
            recent.themeGroupHits,
            themeFamilyHitMap,
        );
    const formatSample = directive?.hasFormatRequest
        ? { selected: [], eligibleIds: [] }
        : weightedSample(
            formatPool,
            formatCount,
            recent.formatIds,
            recent.formatGroups,
            settings.avoidRepeat,
            hardRecent.formatIds,
            favoriteFormatIds,
            formatEligibleMisses,
            favoriteFormatMultipliers,
            recent.formatGroupHits,
            formatFamilyHitMap,
        );
    const pickedFormats = formatSample.selected;
    const visualSceneryFormat = getVisualSceneryFormat();
    const forcedFormats = settings.forceVisualScenery && visualSceneryFormat ? [visualSceneryFormat] : [];
    const directiveFormats = directive?.formats || [];
    const directiveWantsVisualScenery = directiveFormats.some(item => item?.id === '10.2.2');

    const formatOnly = settings.samplingMode === 'format_only';
    const themes = formatOnly
        ? []
        : uniqueById([...(directive?.themes || []), ...pickedThemes]).slice(0, Math.max(themeCount, directive?.themes?.length || 0));

    let formats;
    if (forcedFormats.length) {
        formats = forcedFormats;
    } else if (directiveWantsVisualScenery) {
        formats = uniqueById(directiveFormats);
    } else {
        formats = uniqueById([...directiveFormats, ...pickedFormats]).slice(0, Math.max(formatCount, directiveFormats.length));
    }

    const formatFairnessEligibleIds = settings.forceVisualScenery ? [] : formatSample.eligibleIds;
    const formatFairnessSelectedIds = settings.forceVisualScenery ? [] : pickedFormats.map(item => item.id);
    return { themes, formats, directive, forcedFormats, formatFairnessEligibleIds, formatFairnessSelectedIds };
}

function comboFromSelection(result, settings, recent, uiReviewFocus = null) {
    return {
        themes: result.themes,
        formats: result.formats,
        themeIds: result.themes.map(x => x.id),
        formatIds: result.formats.map(x => x.id),
        themeGroups: result.themes.map(x => x.group).filter(Boolean),
        themeFamilies: result.themes.map(themeFamilyKey).filter(Boolean),
        formatGroups: result.formats.map(x => x.group).filter(Boolean),
        mode: settings.mode,
        samplingMode: settings.samplingMode || 'classic',
        forcedVisualScenery: !!settings.forceVisualScenery,
        cooldownRounds: settings.cooldownRounds || 10,
        uiReviewFocus: Array.isArray(uiReviewFocus) && uiReviewFocus.length ? [...uiReviewFocus] : pickUiReviewFocus(5),
        recentUiReviewFocus: recent.uiReviewFocus || [],
    };
}

function rehydrateDirectiveCombo(cached, settings, recent) {
    if (!cached) return null;
    const themes = (cached.themeIds || [])
        .map(id => THEMATIC_CATEGORIES.find(item => item.id === id))
        .filter(Boolean);
    const formats = (cached.formatIds || [])
        .map(id => PRESENTATION_FORMATS.find(item => item.id === id))
        .filter(Boolean);
    if (themes.length !== (cached.themeIds || []).length || formats.length !== (cached.formatIds || []).length) return null;
    return comboFromSelection({ themes, formats }, settings, recent, cached.uiReviewFocus);
}

function directiveRandomPreferenceScopeKey(settings) {
    // Partial point-order directives may leave one side random. Their 7-day directive cache must
    // change when blacklist or 收藏室 changes, otherwise the cached random half can ignore the
    // user's newest local candidate preference. Sort IDs so array order itself does not invalidate.
    const blockedThemes = compactUnique(settings?.blacklistedThemeIds || []).sort().join(',');
    const blockedFormats = compactUnique(settings?.blacklistedFormatIds || []).sort().join(',');
    const favoriteThemeIds = compactUnique(settings?.favoriteThemeIds || []).sort();
    const favoriteFormatIds = compactUnique(settings?.favoriteFormatIds || []).sort();
    const themeMultiplierMap = settings?.favoriteThemeMultipliers && typeof settings.favoriteThemeMultipliers === 'object' ? settings.favoriteThemeMultipliers : {};
    const formatMultiplierMap = settings?.favoriteFormatMultipliers && typeof settings.favoriteFormatMultipliers === 'object' ? settings.favoriteFormatMultipliers : {};
    const favoriteThemes = favoriteThemeIds.map(id => `${id}:${Number(themeMultiplierMap[id]) || 3}`).join(',');
    const favoriteFormats = favoriteFormatIds.map(id => `${id}:${Number(formatMultiplierMap[id]) || 3}`).join(',');
    const blacklistState = settings?.blacklistEnabled === false ? 'off' : 'on';
    return `random-pref:b=${blacklistState}:bt=${hashText(blockedThemes)}:bf=${hashText(blockedFormats)}:ft=${hashText(favoriteThemes)}:ff=${hashText(favoriteFormats)}`;
}

function directiveScopeKey(directive, settings) {
    if (!directive?.rawDirective || !directive?.messageKey) return '';
    const config = [
        settings.samplingMode || 'classic',
        settings.forceVisualScenery ? 'visual' : 'normal',
        settings.themesMin,
        settings.themesMax,
        settings.formatsMin,
        settings.formatsMax,
        directiveRandomPreferenceScopeKey(settings),
    ].join('|');
    return hashText(`${directive.messageKey}|${directive.rawDirective}|${config}`);
}

// 单请求多面：按面依次抽取，每一面都要避开历史冷却 + 本批前面已选的组合。
//
// 复用既有 hardExcluded 机制而不是新写一套过滤：批内互斥与历史冷却因此走同一条
// 代码路径，不会出现两套优先级互相打架。
//
// 幂等：同一个 generationScopeKey 重复调用必须返回同一批次计划。
// pickCombination 自己的 cachedPick 只有一个槽，抽完第 3 面就被 face2 占据，
// 第二次调用时第 1 面会重新抽 —— 所以批次必须有自己的计划缓存。
let cachedBatchPlan = null;

// 批次规划建立后，batch pending 成为多面计划的权威状态：
// 每个 face 不再各自调用 setLastCombo()，否则单面 PENDING_KEY 会被逐面覆盖，
// 最终只剩最后一面，前面两面的组合永久丢失。
export function pickCombinationBatch(settings, generationScopeKey = '', generationContext = null, faceCount = 1) {
    const total = (faceCount === 2 || faceCount === 3) ? faceCount : 1;
    const scopeKey = normalizeGenerationScopeKey(generationScopeKey);

    // 单面：完全走既有路径，setLastCombo / PENDING_KEY 语义与 1.4.5-test 逐字一致。
    if (total === 1) {
        clearPendingComboBatch();
        return [pickCombination(settings, generationScopeKey, generationContext)];
    }

    if (scopeKey && cachedBatchPlan?.scopeKey === scopeKey && cachedBatchPlan?.total === total) {
        return cachedBatchPlan.faces;
    }

    const first = pickCombination(settings, generationScopeKey, generationContext);
    if (first?.disabled || !first?.combo) {
        clearPendingComboBatch();
        return [first];
    }

    const faces = [first];
    const usedThemes = [...(first.combo.themeIds || [])];
    const usedFormats = [...(first.combo.formatIds || [])];

    for (let index = 1; index < total; index += 1) {
        // 每面独立 scopeKey，否则 pickCombination 的点菜缓存会让三面命中同一结果。
        const faceScope = scopeKey ? `${scopeKey}:face${index}` : '';
        const next = pickCombination(settings, faceScope, {
            ...(generationContext || {}),
            batchExcludedThemeIds: [...usedThemes],
            batchExcludedFormatIds: [...usedFormats],
        });
        if (!next?.combo) break;
        faces.push(next);
        usedThemes.push(...(next.combo.themeIds || []));
        usedFormats.push(...(next.combo.formatIds || []));
    }

    // 批次 pending 取代逐面 setLastCombo 留下的单面残留：
    // 先清掉被逐面覆盖过的 PENDING_KEY，再把完整计划写进批次槽。
    clearPendingCombo();
    const batchId = setPendingComboBatch(faces.map(item => item.combo));
    if (!batchId) {
        // 批次存储失败：多面计划无法提交，返回它只会得到三面都进不了历史的结果。
        // 安全降级为原单面路径，且不缓存这个失败的计划。
        console.warn('[RabbitMirror] Pending combo batch storage failed; falling back to single face.');
        cachedBatchPlan = null;
        clearPendingComboBatch();
        return [pickCombination(settings, generationScopeKey, generationContext)];
    }
    if (scopeKey) cachedBatchPlan = { scopeKey, total, faces };
    return faces;
}

export function pickCombination(settings, generationScopeKey = '', generationContext = null) {
    const scopeKey = normalizeGenerationScopeKey(generationScopeKey);
    if (scopeKey && cachedPick?.scopeKey === scopeKey) return cachedPick.payload;

    const chatOverride = generationContext?.chat || null;
    const chatKey = getCurrentChatKey(chatOverride);
    const currentTurn = settings.userDirectivePriority ? getCurrentTurnUserMessage(chatOverride) : null;
    const directive = currentTurn ? parseUserDirective(currentTurn) : null;
    const last = getLastCombo();
    const formalRecent = getRecentIds(settings.cooldownRounds || 10);
    const attemptRecent = getRecentGenerationAttemptIds(chatKey, settings.cooldownRounds || 10);
    const recent = mergeRecent(formalRecent, attemptRecent);
    // 单请求多面：本批前面已选中的组合并入硬排除，与历史冷却走同一条过滤路径。
    // generationContext 不带这两个字段时（既有单面调用）结果与原来逐字相同。
    const batchExcludedThemeIds = Array.isArray(generationContext?.batchExcludedThemeIds)
        ? generationContext.batchExcludedThemeIds.map(value => String(value || '')).filter(Boolean)
        : [];
    const batchExcludedFormatIds = Array.isArray(generationContext?.batchExcludedFormatIds)
        ? generationContext.batchExcludedFormatIds.map(value => String(value || '')).filter(Boolean)
        : [];
    const hardRecent = {
        themeIds: [...(attemptRecent.themeIds || []), ...batchExcludedThemeIds],
        formatIds: [...(attemptRecent.formatIds || []), ...batchExcludedFormatIds],
    };
    const favorites = getFavoritesState(settings);
    const validFormatIds = PRESENTATION_FORMATS.map(item => String(item?.id || '')).filter(Boolean);
    const formatEligibleMisses = getFormatEligibleMisses(validFormatIds);
    const themeCount = weightedThemeCount(settings);
    const formatCount = weightedFormatCount(settings);

    let themePool = filterRandomThemePool(THEMATIC_CATEGORIES.filter(item => allowByMode(item, settings.mode)), settings);
    let formatPool = filterRandomFormatPool(PRESENTATION_FORMATS.filter(item => allowByMode(item, settings.mode)), settings);
    // Blacklist filtering is a real pool exclusion, not a Prompt instruction.
    // 1.3.69: 这两行原本写成 `!pool.length && blacklistEnabled === false` 才恢复整池。
    // 但 blacklistEnabled === false 时 filterRandomXxxPool 已经原样返回整池，池为空
    // 只可能是 allowByMode 自己筛空的（mode === 'off'），恢复出来还是空——两行在任何
    // 可达状态下都是 no-op。留着最大的风险是后来者以为它是安全网而把条件反过来，
    // 那样就会把用户明确拉黑的项目重新塞回随机池。
    // 用户故意拉黑整池时必须保持空池，由设置页警告，这里不做任何兜底。

    if (directive?.disabled) {
        const payload = { disabled: true, directive, combo: null, last };
        if (scopeKey) cachedPick = { scopeKey, payload };
        return payload;
    }

    const directiveCacheKey = directiveScopeKey(directive, settings);
    let combo = null;
    if (directive && directiveCacheKey) {
        combo = rehydrateDirectiveCombo(getDirectiveScopedPick(chatKey, directiveCacheKey), settings, recent);
    }

    if (!combo) {
        const result = applyDirectiveOrRandom({
            settings,
            directive,
            themePool,
            formatPool,
            themeCount,
            formatCount,
            recent,
            hardRecent,
            favoriteThemeIds: favorites.themeIds,
            favoriteFormatIds: favorites.formatIds,
            favoriteThemeMultipliers: favorites.themeMultipliers,
            favoriteFormatMultipliers: favorites.formatMultipliers,
            formatEligibleMisses,
        });
        combo = comboFromSelection(result, settings, recent);
        if (result.formatFairnessEligibleIds?.length) {
            recordFormatEligibleMissRound({
                eligibleIds: result.formatFairnessEligibleIds,
                selectedIds: result.formatFairnessSelectedIds,
                validFormatIds,
            });
        }
        if (directive && directiveCacheKey) setDirectiveScopedPick(chatKey, directiveCacheKey, combo);
    }

    setLastCombo(combo);
    recordGenerationAttempt(combo, {
        chatKey,
        attemptId: scopeKey || `fallback:${Date.now().toString(36)}:${randomUnit().toString(36).slice(2, 8)}`,
        directiveScoped: !!directive,
    });

    const payload = { combo, last, directive: directive || null };
    if (scopeKey) cachedPick = { scopeKey, payload };
    return payload;
}
