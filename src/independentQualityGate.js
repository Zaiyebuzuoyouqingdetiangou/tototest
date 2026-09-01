const NATIVE_TABBED_MEDIA_PATTERN = /(?:频道|换台|调频|电台|档位|变速|齿轮|分页|翻页|页签|分页器|channel|station|tuner|gear|pagination|pager|page[ -]?turn)/i;
const CONTENT_SELECTOR_PATTERN = /(?:^|[\s>+~,])(?:toto|details|summary|main|article|section|p|li|label|button|input|textarea|select|body|html)\b|(?:^|[.#\[])(?:root|mirror|stage|panel|card|content|text|copy|body|page|screen|sheet|document|entry|node|item|description|desc|title|subtitle|caption|label|button|btn|tab)(?:\b|[-_])/i;
const CLEAR_LOW_CONTRAST_LIMIT = 1.5;
const TAROT_IMAGE_ORIGIN = 'https://gfx.tarot.com';
const TAROT_IMAGE_PATH = /^\/images\/site\/decks\/rider\/full_size\/(?:[0-9]|[1-6][0-9]|7[0-7])\.jpg$/;

function uniqueStrings(values = []) {
    return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function qualityResult(ok, code = 'ok', message = '', flags = []) {
    return {
        ok: !!ok,
        code: String(code || (ok ? 'ok' : 'quality-rejected')),
        message: String(message || ''),
        flags: uniqueStrings(flags),
    };
}

function metadataRiskFlags(metadata = {}) {
    const values = [
        ...(Array.isArray(metadata?.riskFlags) ? metadata.riskFlags : []),
        ...(Array.isArray(metadata?.cooldown?.riskFlags) ? metadata.cooldown.riskFlags : []),
        ...(Array.isArray(metadata?.visual?.riskFlags) ? metadata.visual.riskFlags : []),
    ];
    return uniqueStrings(values);
}

function interactionFamilyId(metadata = {}) {
    const value = metadata?.interactionFamily
        ?? metadata?.cooldown?.interactionFamily
        ?? metadata?.visual?.interactionFamily
        ?? '';
    if (typeof value === 'string') return value.trim().toLowerCase();
    return String(value?.id || value?.family || value?.key || '').trim().toLowerCase();
}

function attributeValue(tag = '', name = '') {
    const escaped = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = String(tag || '').match(new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    return String(match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
}

function decodedAttributeText(value = '') {
    return String(value || '')
        .replace(/&#x([0-9a-f]{1,6});?/gi, (_, hex) => {
            try { return String.fromCodePoint(Number.parseInt(hex, 16)); } catch { return ''; }
        })
        .replace(/&#([0-9]{1,7});?/g, (_, decimal) => {
            try { return String.fromCodePoint(Number.parseInt(decimal, 10)); } catch { return ''; }
        })
        .replace(/&(nbsp|ensp|emsp|thinsp);/gi, ' ')
        .replace(/&(amp|lt|gt|quot|apos);/gi, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[entity.toLowerCase()]);
}

function isOfficialTarotImageUrl(value = '') {
    try {
        const parsed = new URL(String(value || '').trim());
        return parsed.origin === TAROT_IMAGE_ORIGIN
            && !parsed.username
            && !parsed.password
            && !parsed.search
            && !parsed.hash
            && TAROT_IMAGE_PATH.test(parsed.pathname);
    } catch {
        return false;
    }
}

export function hasRequiredTarotEntityImage(html = '') {
    for (const match of String(html || '').matchAll(/<img\b[^>]*>/gi)) {
        const tag = match[0];
        const alt = decodedAttributeText(attributeValue(tag, 'alt')).trim();
        if (isOfficialTarotImageUrl(attributeValue(tag, 'src'))
            && /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(alt)) return true;
    }
    return false;
}

function inputProfile(html = '') {
    const inputs = [...String(html || '').matchAll(/<input\b[^>]*>/gi)].map(match => match[0]);
    const radios = inputs.filter(tag => attributeValue(tag, 'type').toLowerCase() === 'radio');
    const checkboxes = inputs.filter(tag => attributeValue(tag, 'type').toLowerCase() === 'checkbox');
    const radioGroups = new Map();
    for (const tag of radios) {
        const name = attributeValue(tag, 'name') || `__ungrouped_${radioGroups.size}`;
        radioGroups.set(name, (radioGroups.get(name) || 0) + 1);
    }
    const largestRadioGroup = Math.max(0, ...radioGroups.values());
    const ids = new Set(radios.map(tag => attributeValue(tag, 'id')).filter(Boolean));
    const linkedLabels = [...String(html || '').matchAll(/<label\b[^>]*>/gi)]
        .map(match => attributeValue(match[0], 'for'))
        .filter(target => ids.has(target)).length;
    return {
        radios: radios.length,
        checkboxes: checkboxes.length,
        largestRadioGroup,
        linkedLabels,
    };
}

function inferredTabbedFamily(html = '', profile = inputProfile(html)) {
    const source = String(html || '');
    const checkedRules = (source.match(/:checked\b/gi) || []).length;
    if (profile.largestRadioGroup >= 3 && profile.linkedLabels >= 3 && checkedRules >= 3) return true;
    const explicitTabs = (source.match(/<[a-z][\w:-]*\b[^>]*\brole\s*=\s*["']tab["'][^>]*>/gi) || []).length;
    const targetedButtons = (source.match(/<button\b[^>]*(?:aria-controls|data-(?:tab|target|panel)|popovertarget)\s*=/gi) || []).length;
    return explicitTabs >= 3 || targetedButtons >= 3;
}

function plainText(html = '') {
    return String(html || '')
        .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
        .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&(?:nbsp|ensp|emsp|thinsp);/gi, ' ')
        .replace(/&(?:lt|gt|amp|quot|apos);/gi, 'x')
        .replace(/\s+/g, ' ')
        .trim();
}

function inferredLayoutRisks(html = '') {
    const source = String(html || '');
    const textLength = plainText(source).length;
    const contentBlocks = (source.match(/<(?:article|section|li|p)\b/gi) || []).length;
    const explicitPanels = (source.match(/\bclass\s*=\s*["'][^"']*(?:panel|pane|tab-content|tab_panel)[^"']*["']/gi) || []).length;
    const strongSpatialSignals = (source.match(/(?:grid-template|grid-area|position\s*:\s*absolute|<svg\b|<canvas\b|clip-path|mask(?:-image)?\s*:|perspective\s*:|aspect-ratio\s*:|writing-mode\s*:|column-count\s*:|transform\s*:)/gi) || []).length;
    const flatVertical = /flex-direction\s*:\s*column\b/i.test(source)
        && Math.max(contentBlocks, explicitPanels) >= 3;
    const weakSpatial = textLength >= 180
        && Math.max(contentBlocks, explicitPanels) >= 3
        && strongSpatialSignals < 2;
    return { flatVertical, weakSpatial };
}

function appendMetadataText(parts, value) {
    if (value == null) return;
    if (Array.isArray(value)) {
        for (const item of value) appendMetadataText(parts, item);
        return;
    }
    if (typeof value === 'object') {
        for (const key of ['id', 'title', 'name', 'label', 'summary', 'raw', 'kind', 'type', 'nativeInteraction']) {
            appendMetadataText(parts, value[key]);
        }
        if (Array.isArray(value.tags)) appendMetadataText(parts, value.tags);
        return;
    }
    parts.push(String(value));
}

function allowsNativeTabbedMedia(metadata = {}) {
    if (metadata?.allowTabbedFamily === true || metadata?.nativeTabbedLayout === true) return true;
    const parts = [];
    for (const value of [
        metadata?.mediaKind,
        metadata?.mediaTitle,
        metadata?.formatTitle,
        metadata?.formatSummary,
        metadata?.media,
        metadata?.selectedFormat,
        metadata?.selectedFormats,
        metadata?.formats,
        metadata?.combo?.formats,
        metadata?.cooldown?.selectedFormats,
    ]) appendMetadataText(parts, value);
    return NATIVE_TABBED_MEDIA_PATTERN.test(parts.join(' '));
}

function inferredNodeCount(html = '', metadata = {}) {
    const explicit = Number(metadata?.nodeCount ?? metadata?.contentNodeCount ?? metadata?.mediaNodeCount);
    if (Number.isFinite(explicit) && explicit >= 0) return Math.trunc(explicit);
    if (metadata?.multiNode === true) return 3;
    const source = String(html || '');
    const dataNodes = (source.match(/\bdata-(?:rm-)?node(?:-id)?\s*=/gi) || []).length;
    const articles = (source.match(/<article\b/gi) || []).length;
    const listItems = (source.match(/<li\b/gi) || []).length;
    const classNodes = (source.match(/\bclass\s*=\s*["'][^"']*(?:^|\s|[-_])(?:node|step|chapter|person|entry|event|timeline-item)(?:\s|[-_]|$)[^"']*["']/gi) || []).length;
    return Math.max(dataNodes, articles, listItems, classNodes);
}

function isSingleReveal(html = '', profile = inputProfile(html), family = '') {
    const source = String(html || '');
    if (family === 'checkbox_reveal_family') return true;
    if (profile.checkboxes !== 1 || profile.radios !== 0 || !/:checked\b/i.test(source)) return false;
    const nestedDetails = Math.max(0, (source.match(/<details\b/gi) || []).length - 1);
    const hasOtherStateRoute = nestedDetails > 0
        || /:target\b/i.test(source)
        || /\b(?:popovertarget|commandfor)\s*=/i.test(source);
    return !hasOtherStateRoute;
}

function parseHexColor(value) {
    const raw = String(value || '').slice(1);
    if (![3, 4, 6, 8].includes(raw.length) || !/^[0-9a-f]+$/i.test(raw)) return null;
    const expand = part => part.length === 1 ? `${part}${part}` : part;
    const step = raw.length <= 4 ? 1 : 2;
    const r = Number.parseInt(expand(raw.slice(0, step)), 16);
    const g = Number.parseInt(expand(raw.slice(step, step * 2)), 16);
    const b = Number.parseInt(expand(raw.slice(step * 2, step * 3)), 16);
    const alphaPart = raw.length === 4 || raw.length === 8 ? raw.slice(step * 3, step * 4) : '';
    const alpha = alphaPart ? Number.parseInt(expand(alphaPart), 16) / 255 : 1;
    return alpha >= 0.98 ? [r, g, b] : null;
}

function numericChannel(value = '') {
    const text = String(value || '').trim();
    if (/%$/.test(text)) return Math.max(0, Math.min(255, Number.parseFloat(text) * 2.55));
    return Math.max(0, Math.min(255, Number.parseFloat(text)));
}

function parseRgbColor(value) {
    const match = String(value || '').match(/^rgba?\(\s*([^)]*)\s*\)$/i);
    if (!match) return null;
    const parts = match[1].split(',').map(part => part.trim());
    if (parts.length !== 3 && parts.length !== 4) return null;
    if (parts.length === 4 && Number.parseFloat(parts[3]) < 0.98) return null;
    const rgb = parts.slice(0, 3).map(numericChannel);
    return rgb.every(Number.isFinite) ? rgb : null;
}

function hueToRgb(p, q, t) {
    let hue = t;
    if (hue < 0) hue += 1;
    if (hue > 1) hue -= 1;
    if (hue < 1 / 6) return p + (q - p) * 6 * hue;
    if (hue < 1 / 2) return q;
    if (hue < 2 / 3) return p + (q - p) * (2 / 3 - hue) * 6;
    return p;
}

function parseHslColor(value) {
    const match = String(value || '').match(/^hsla?\(\s*([^)]*)\s*\)$/i);
    if (!match) return null;
    const parts = match[1].split(',').map(part => part.trim());
    if ((parts.length !== 3 && parts.length !== 4) || !/%$/.test(parts[1]) || !/%$/.test(parts[2])) return null;
    if (parts.length === 4 && Number.parseFloat(parts[3]) < 0.98) return null;
    const h = ((Number.parseFloat(parts[0]) % 360) + 360) % 360 / 360;
    const s = Math.max(0, Math.min(1, Number.parseFloat(parts[1]) / 100));
    const l = Math.max(0, Math.min(1, Number.parseFloat(parts[2]) / 100));
    if (![h, s, l].every(Number.isFinite)) return null;
    if (s === 0) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)].map(channel => channel * 255);
}

function parseSolidColor(value = '') {
    const normalized = String(value || '').trim().replace(/\s*!important\s*$/i, '').trim().toLowerCase();
    if (!normalized || /(?:var\(|gradient\(|url\(|currentcolor|inherit|initial|unset|revert)/i.test(normalized)) return null;
    const named = {
        black: [0, 0, 0],
        white: [255, 255, 255],
        gray: [128, 128, 128],
        grey: [128, 128, 128],
        red: [255, 0, 0],
        navy: [0, 0, 128],
        beige: [245, 245, 220],
    };
    if (named[normalized]) return named[normalized];
    if (normalized.startsWith('#')) return parseHexColor(normalized);
    return parseRgbColor(normalized) || parseHslColor(normalized);
}

function declarationsFromBody(body = '') {
    const declarations = new Map();
    for (const match of String(body || '').matchAll(/(?:^|;)\s*(color|background-color|background)\s*:\s*([^;}]+)/gi)) {
        declarations.set(String(match[1] || '').toLowerCase(), String(match[2] || '').trim());
    }
    return declarations;
}

function contrastRatio(first, second) {
    const luminance = rgb => {
        const channels = rgb.map(value => {
            const channel = Math.max(0, Math.min(255, Number(value) || 0)) / 255;
            return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const a = luminance(first);
    const b = luminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function contrastFromDeclarations(body = '') {
    const source = String(body || '');
    if (/(?:gradient\(|var\(|url\(|mix-blend-mode\s*:|background-blend-mode\s*:|filter\s*:|opacity\s*:|text-shadow\s*:|text-stroke\s*:|-webkit-text-stroke\s*:)/i.test(source)) return null;
    const declarations = declarationsFromBody(source);
    const foreground = parseSolidColor(declarations.get('color'));
    const background = parseSolidColor(declarations.get('background-color') ?? declarations.get('background'));
    if (!foreground || !background) return null;
    const ratio = contrastRatio(foreground, background);
    return ratio < CLEAR_LOW_CONTRAST_LIMIT ? ratio : null;
}

function clearlyLowContrastRatio(html = '') {
    const source = String(html || '').replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const styleMatch of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
        const stylesheet = String(styleMatch[1] || '');
        for (const rule of stylesheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            const selector = String(rule[1] || '').trim();
            if (/::(?:before|after)\b/i.test(selector)) continue;
            if (!CONTENT_SELECTOR_PATTERN.test(selector)) continue;
            const ratio = contrastFromDeclarations(rule[2]);
            if (ratio != null) return ratio;
        }
    }
    for (const tagMatch of source.matchAll(/<([a-z][\w:-]*)\b[^>]*\bstyle\s*=\s*(["'])([\s\S]*?)\2[^>]*>/gi)) {
        const tagName = String(tagMatch[1] || '').toLowerCase();
        if (/^(?:svg|path|circle|rect|line|polyline|polygon|stop|defs)$/.test(tagName)) continue;
        const semanticContentTag = /^(?:toto|details|summary|main|article|section|p|li|label|button)$/.test(tagName);
        const classOrId = `${attributeValue(tagMatch[0], 'class')} ${attributeValue(tagMatch[0], 'id')}`;
        const namedContentContainer = /(?:^|\s|[-_])(?:root|mirror|stage|panel|card|content|text|copy|body|page|screen|sheet|document|entry|node|item|description|desc|title|subtitle|caption|label|button|btn|tab)(?:\s|[-_]|$)/i.test(classOrId);
        if (!semanticContentTag && !namedContentContainer) continue;
        const ratio = contrastFromDeclarations(tagMatch[3]);
        if (ratio != null) return ratio;
    }
    return null;
}

/**
 * Conservatively evaluates a sanitized independent RabbitMirror fragment.
 *
 * The optional metadata accepts the existing scanner's `interactionFamily` and
 * `riskFlags`, plus selected format/media descriptors. It is read-only and is
 * used only to distinguish a native channel/gear/pagination control from a
 * generic tab template; it never changes sampling or cooldown state.
 */
export function evaluateIndependentPostSanitizeQuality(html = '', metadata = {}) {
    const source = String(html || '');
    const flags = metadataRiskFlags(metadata);
    if (metadata?.tarotRules === true && !hasRequiredTarotEntityImage(source)) {
        flags.push('tarot_entity_image_required');
        return qualityResult(
            false,
            'tarot-image-missing',
            '抽中的塔罗／西方神秘学成品没有保留官方实体牌图及中文 alt；本次结果不会保存。',
            flags,
        );
    }
    const family = interactionFamilyId(metadata);
    const profile = inputProfile(source);
    const tabbedFamily = family === 'tabbed_radio_family' || inferredTabbedFamily(source, profile);
    if (tabbedFamily) flags.push('tabbed_radio_family');

    const inferredLayout = inferredLayoutRisks(source);
    const flatVertical = flags.includes('flat_vertical_flow') || inferredLayout.flatVertical;
    const weakSpatial = flags.includes('weak_spatial_complexity') || inferredLayout.weakSpatial;
    if (flatVertical) flags.push('flat_vertical_flow');
    if (weakSpatial) flags.push('weak_spatial_complexity');

    if (tabbedFamily && (flatVertical || weakSpatial) && !allowsNativeTabbedMedia(metadata)) {
        return qualityResult(
            false,
            'generic-tabbed-flat-layout',
            '净化后的兔子镜退化为通用三按钮／标签切页与单向文字流；本次结果不会保存。',
            flags,
        );
    }

    const nodes = inferredNodeCount(source, metadata);
    if (nodes >= 3 && isSingleReveal(source, profile, family)) {
        flags.push('multi_node_media', 'single_reveal');
        return qualityResult(
            false,
            'multi-node-single-reveal',
            '净化后的多节点兔子镜只有一次显隐入口，无法继续探索不同节点；本次结果不会保存。',
            flags,
        );
    }

    const lowContrastRatio = clearlyLowContrastRatio(source);
    if (lowContrastRatio != null) {
        flags.push(`low_contrast:${lowContrastRatio.toFixed(2)}`);
        return qualityResult(
            false,
            'clearly-low-contrast',
            '净化后的兔子镜存在明确不可读的前景／背景低对比；本次结果不会保存。',
            flags,
        );
    }

    return qualityResult(true, 'ok', '', flags);
}
