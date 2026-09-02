import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const sanitizerSource = readFileSync(new URL('../src/outputSanitizer.js', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const promptSource = readFileSync(new URL('../src/promptBuilder.js', import.meta.url), 'utf8');

function extractFunction(source, name) {
    const marker = `function ${name}(`;
    const start = source.indexOf(marker);
    assert.notEqual(start, -1, `missing ${name}`);
    const bodyStart = source.indexOf('{', start + marker.length);
    let depth = 0;
    let quote = '';
    let escaped = false;
    for (let index = bodyStart; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
        if (char === '{') depth += 1;
        else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`unterminated ${name}`);
}

function element({ rect, style, parentElement = null, directText = 12, textRects = [] } = {}) {
    return {
        tagName: 'P', parentElement, childNodes: [], children: [], attributes: [], isConnected: true,
        clientWidth: rect.width, clientHeight: rect.height, scrollWidth: rect.width, scrollHeight: rect.height,
        textContent: '当前镜面正文', computedStyle: style, textRects, directText,
        getBoundingClientRect: () => rect,
        querySelector: () => null,
        querySelectorAll: () => [],
        closest: () => null,
    };
}

const program = [
    extractFunction(sanitizerSource, 'maintenanceCssPixelValue'),
    extractFunction(sanitizerSource, 'maintenanceSafeTextClippingAncestorEvidence'),
    extractFunction(sanitizerSource, 'maintenanceHasReachableTextRevealPath'),
    extractFunction(sanitizerSource, 'maintenanceTextClippingEvidence'),
    'globalThis.probe=maintenanceTextClippingEvidence;',
].join('\n');
const sandbox = {
    maintenanceIsVisibleContentElement: () => true,
    maintenanceHasMeaningfulText: () => true,
    maintenanceMobileLayoutIsPassportManaged: () => false,
    maintenanceSafeComputedStyle: node => node.computedStyle,
    maintenanceDirectTextLength: node => node.directText,
    maintenanceVisibleTextRects: node => node.textRects,
    maintenanceHasIntentionalMarquee: () => false,
};
vm.runInNewContext(program, sandbox);

const cramped = element({
    rect: { left: 0, right: 120, top: 0, bottom: 20, width: 120, height: 20 },
    style: { display: 'block', visibility: 'visible', opacity: '1', overflow: 'visible', overflowX: 'visible', overflowY: 'visible', whiteSpace: 'normal', textOverflow: 'clip', webkitLineClamp: 'none', fontSize: '20px', lineHeight: '10px', writingMode: 'horizontal-tb', position: 'static' },
    textRects: [{ left: 0, right: 110, top: -1, bottom: 24, width: 110, height: 25 }],
});
const crampedEvidence = sandbox.probe(cramped, { contains: () => true });
assert.equal(crampedEvidence?.lineHeightCramped, true, 'glyphs taller than a very small line box are high-confidence clipping evidence');
assert.equal(crampedEvidence?.vertical, true);
assert.equal(crampedEvidence?.highConfidence, false, 'art-directed compact line height alone must remain a manual maintenance diagnosis');

const intentionalClamp = element({
    rect: { left: 0, right: 120, top: 0, bottom: 40, width: 120, height: 40 },
    style: { display: '-webkit-box', visibility: 'visible', opacity: '1', overflow: 'hidden', overflowX: 'hidden', overflowY: 'hidden', whiteSpace: 'normal', textOverflow: 'ellipsis', webkitLineClamp: '2', fontSize: '16px', lineHeight: '20px', writingMode: 'horizontal-tb', position: 'static' },
    textRects: [{ left: 2, right: 114, top: 2, bottom: 58, width: 112, height: 56 }],
});
intentionalClamp.scrollHeight = 60;
const clampEvidence = sandbox.probe(intentionalClamp, { contains: () => true });
assert.equal(clampEvidence?.lineClamped, true);
assert.equal(clampEvidence?.highConfidence, false, 'intentional line-clamp previews must not be auto-expanded');

const clippingParent = element({
    rect: { left: 0, right: 120, top: 0, bottom: 24, width: 120, height: 24 },
    style: { overflow: 'hidden', overflowX: 'hidden', overflowY: 'hidden', position: 'relative' },
    directText: 0,
});
const clippedLeaf = element({
    parentElement: clippingParent,
    rect: { left: 0, right: 120, top: 0, bottom: 42, width: 120, height: 42 },
    style: { display: 'block', visibility: 'visible', opacity: '1', overflow: 'visible', overflowX: 'visible', overflowY: 'visible', whiteSpace: 'normal', textOverflow: 'clip', webkitLineClamp: 'none', fontSize: '16px', lineHeight: '24px', writingMode: 'horizontal-tb', position: 'static' },
    textRects: [{ left: 4, right: 110, top: 2, bottom: 40, width: 106, height: 38 }],
});
const ancestorEvidence = sandbox.probe(clippedLeaf, { contains: () => true });
assert.equal(ancestorEvidence?.clippingAncestor?.element, clippingParent, 'a safe nearest clipping ancestor must be identified');
assert.equal(ancestorEvidence?.vertical, true);
assert.equal(ancestorEvidence?.highConfidence, true);

clippingParent.previousElementSibling = { matches: () => true };
const expandableEvidence = sandbox.probe(clippedLeaf, { contains: () => true, querySelectorAll: () => [] });
assert.equal(expandableEvidence?.highConfidence, false, 'a reachable adjacent reveal control must keep the clip in manual diagnosis');
clippingParent.previousElementSibling = null;

for (const semanticControl of ['role-button', 'tabindex']) {
    clippingParent.matches = selector => semanticControl === 'role-button'
        ? selector.includes('[role="button"]')
        : selector.includes('[tabindex]');
    assert.equal(sandbox.probe(clippedLeaf, { contains: () => true }), null,
        `${semanticControl} clipping containers are interaction state, not automatic layout repair targets`);
}
clippingParent.matches = () => false;
clippingParent.id = 'revealed-card';
const targetAnchor = { getAttribute: name => name === 'href' ? '#revealed-card' : '' };
const targetEvidence = sandbox.probe(clippedLeaf, { contains: () => true, querySelectorAll: () => [targetAnchor] });
assert.equal(targetEvidence?.highConfidence, false, ':target-linked clipping containers must stay under user interaction control');
clippingParent.id = '';

const ordinaryScroller = element({
    rect: { left: 0, right: 120, top: 0, bottom: 60, width: 120, height: 60 },
    style: { display: 'block', visibility: 'visible', opacity: '1', overflow: 'auto', overflowX: 'auto', overflowY: 'auto', whiteSpace: 'normal', textOverflow: 'clip', webkitLineClamp: 'none', fontSize: '16px', lineHeight: '24px', writingMode: 'horizontal-tb', position: 'static' },
    textRects: [{ left: 4, right: 110, top: 4, bottom: 28, width: 106, height: 24 }],
});
ordinaryScroller.scrollHeight = 160;
assert.equal(sandbox.probe(ordinaryScroller, { contains: () => true }), null,
    'an intentional overflow:auto interaction with in-bounds text must stay untouched');

const interactiveClip = element({
    rect: { left: 0, right: 120, top: 0, bottom: 24, width: 120, height: 24 },
    style: { overflow: 'hidden', overflowX: 'hidden', overflowY: 'hidden', position: 'relative' },
    directText: 0,
});
interactiveClip.querySelector = () => ({ tagName: 'BUTTON' });
const interactiveLeaf = element({
    parentElement: interactiveClip,
    rect: { left: 0, right: 120, top: 0, bottom: 42, width: 120, height: 42 },
    style: { display: 'block', visibility: 'visible', opacity: '1', overflow: 'visible', overflowX: 'visible', overflowY: 'visible', whiteSpace: 'normal', textOverflow: 'clip', webkitLineClamp: 'none', fontSize: '16px', lineHeight: '24px', writingMode: 'horizontal-tb', position: 'static' },
    textRects: [{ left: 4, right: 110, top: 2, bottom: 40, width: 106, height: 38 }],
});
assert.equal(sandbox.probe(interactiveLeaf, { contains: () => true }), null,
    'a clipping ancestor that owns an interactive/structured subtree is too risky for automatic repair');

const boundedStart = sanitizerSource.indexOf('function maintenanceCurrentHighConfidenceTextRepairEligible(');
const boundedEnd = sanitizerSource.indexOf('function cancelCurrentHighConfidenceTextRepairs(', boundedStart);
assert.ok(boundedStart >= 0 && boundedEnd > boundedStart);
const boundedSource = sanitizerSource.slice(boundedStart, boundedEnd);
assert.match(boundedSource, /maintenanceRootIsLatestAssistant/);
assert.match(boundedSource, /outputHostGenerationLooksActive/);
assert.match(boundedSource, /budget\.nodes <= 800 && budget\.attributes <= 2600/);
assert.match(boundedSource, /highConfidenceOnly: true, maxCandidates: 12/);
assert.doesNotMatch(boundedSource, /setInterval|MutationObserver|fetch\s*\(/,
    'the current settled check must remain one-shot and local');

assert.match(styleSource, /details:not\(\[open\]\)[\s\S]*animation-play-state\s*:\s*paused\s*!important/s,
    'closed RabbitMirror faces must pause descendant CSS animations without a runtime observer');
assert.match(styleSource, /details:not\(\[open\]\)[\s\S]*::before[\s\S]*::after[\s\S]*animation-play-state\s*:\s*paused\s*!important/s,
    'closed RabbitMirror faces must pause pseudo-element animations too');
assert.match(styleSource, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*animation-iteration-count\s*:\s*1\s*!important/s,
    'OS reduced-motion preference must receive a static low-work fallback');
assert.match(promptSource, /每个非终止第二状态必须有融入媒介本体的自然返回入口/,
    'interaction states must provide a media-native return path instead of a generic injected button');
assert.match(promptSource, /最多[^\n]*1[^\n]*主[^\n]*1[^\n]*辅[^\n]*连续动画/,
    'Visual Scenery continuous animation count must be bounded per face');
assert.match(promptSource, /禁止[^\n]*粒子群[^\n]*blur[^\n]*filter/,
    'Visual Scenery must reject expensive particle/filter fallbacks');

console.log('text clipping and thermal safety contracts passed');
