import {
    getActivePaletteCooldown,
    getRecentPaletteCooldown,
    getRepeatedPaletteFamily,
} from './storage.js?rmv=1.4.30.17';

const SAFE_PALETTE_LABEL_RE = /^(?:(?:低|中|高)明度)?(?:暖|冷|中性)?(?:红|橙|黄|绿|青|蓝|紫|粉|中性色)?(?:(?:低|中|高)饱和)?$/;

function safePaletteLabel(value) {
    const text = String(value || '').trim();
    return text && text.length <= 24 && SAFE_PALETTE_LABEL_RE.test(text) ? text : '';
}

function boundedInteger(value, min, max) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
}

function normalizedRepeatedPalette() {
    const repeated = getRepeatedPaletteFamily(3, 2);
    const label = safePaletteLabel(repeated?.label);
    if (!repeated || !label) return null;
    return {
        label,
        count: boundedInteger(repeated.count, 2, 3),
        window: boundedInteger(repeated.window, 2, 3),
    };
}

function normalizedDarkCooldown() {
    const dark = getActivePaletteCooldown(5);
    if (!dark?.active) return null;
    return { remaining: boundedInteger(dark.remaining, 1, 5) };
}

function recentPaletteLine(item) {
    const roundsAgo = boundedInteger(item?.roundsAgo, 0, 2);
    const label = safePaletteLabel(item?.label);
    if (!label) return '';
    const when = roundsAgo === 0 ? '上一面' : `前 ${roundsAgo + 1} 面`;
    const weight = roundsAgo === 0 ? '最高' : roundsAgo === 1 ? '中' : '低';
    return `  - ${when}：${label}（短期冷却权重：${weight}）`;
}

export function buildPaletteCooldownExecutionLock() {
    const repeated = normalizedRepeatedPalette();
    const dark = normalizedDarkCooldown();
    return [
        repeated
            ? `重复配色族「${repeated.label}」近 ${repeated.window} 面出现 ${repeated.count} 次，本轮主色相／冷暖／饱和度至少改变一项，不得只调亮暗或替换局部强调色`
            : '',
        dark
            ? `低明度主承载仍在冷却，剩余 ${dark.remaining} 面；本轮禁止再次使用大面积深色背景承载正文`
            : '',
    ].filter(Boolean).join('；');
}

export function buildPaletteCooldownRule() {
    const recent = getRecentPaletteCooldown(3).map(recentPaletteLine).filter(Boolean);
    const repeated = normalizedRepeatedPalette();
    const dark = normalizedDarkCooldown();
    if (!recent.length && !dark) return '';

    const recentLines = recent.join('\n');
    const repeatedLine = repeated
        ? `  - 强冷却：${repeated.label}在近 ${repeated.window} 面出现 ${repeated.count} 次。本轮必须脱离该配色族；主色相、冷暖或饱和度至少改变一项，不得只调整明度、边框或局部强调色。`
        : '  - 当前没有色族在近三面达到两次；仍按时间权重避让最近真实配色，不机械轮换固定颜色。';
    const darkLine = dark
        ? `  - 低明度主承载冷却：剩余 ${dark.remaining} 面。本轮禁止大面积深色背景承载主要正文；深色仍可用于小面积描边、图形或强调。`
        : '';

    return String.raw`
真实配色冷却【来自近期最终渲染结果，不是模型自述】:
${recentLines}
${repeatedLine}
${darkLine}
  - 配色冷却只约束正在重复的主配色，不得牺牲正文与背景对比度，也不得把某个具体颜色永久禁用。
  - 若本轮用户明确指定配色，以最终视觉偏好执行锁为准；冷却仅负责在未指定部分脱离重复。`;
}
