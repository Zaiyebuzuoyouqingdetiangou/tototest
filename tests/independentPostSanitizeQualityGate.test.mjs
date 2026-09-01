import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

import { evaluateIndependentPostSanitizeQuality } from '../src/independentQualityGate.js';

const tarotBase = 'https://gfx.tarot.com/images/site/decks/rider/full_size/';

for (const [label, html] of [
    ['missing image', '<details><summary>【兔子镜：命运牌阵】</summary><p>愚者正位</p></details>'],
    ['non-official image', '<details><summary>【兔子镜：命运牌阵】</summary><img src="https://example.com/0.jpg" alt="愚者牌"></details>'],
    ['out-of-range image', `<details><summary>【兔子镜：命运牌阵】</summary><img src="${tarotBase}78.jpg" alt="愚者牌"></details>`],
    ['query-bearing image', `<details><summary>【兔子镜：命运牌阵】</summary><img src="${tarotBase}0.jpg?cache=1" alt="愚者牌"></details>`],
    ['non-Chinese alt', `<details><summary>【兔子镜：命运牌阵】</summary><img src="${tarotBase}0.jpg" alt="The Fool"></details>`],
]) {
    const result = evaluateIndependentPostSanitizeQuality(html, { tarotRules: true });
    assert.equal(result.ok, false, label);
    assert.equal(result.code, 'tarot-image-missing', label);
    assert.ok(result.flags.includes('tarot_entity_image_required'), label);
}

for (const id of [0, 77]) {
    const validTarot = evaluateIndependentPostSanitizeQuality(
        `<details><summary>【兔子镜：命运牌阵】</summary><img src="${tarotBase}${id}.jpg" alt="塔罗牌：愚者"><p>牌面解读。</p></details>`,
        { tarotRules: true },
    );
    assert.equal(validTarot.ok, true, `official tarot entity image ${id}.jpg with Chinese alt must pass`);
}

assert.equal(
    evaluateIndependentPostSanitizeQuality('<details><summary>普通成品</summary><p>没有图片。</p></details>', { tarotRules: false }).ok,
    true,
    'the tarot image gate must remain inactive for non-tarot selections',
);

function genericTabbedMirror() {
    return `
        <details open>
            <summary>【兔子镜：三段旧事】</summary>
            <style>
                .mirror { display:flex; flex-direction:column; background:#f5f1ee; color:#302b2a; padding:16px; }
                .tabs { display:flex; gap:6px; }
                .panel { display:none; }
                #tab-a:checked ~ .panels .panel-a,
                #tab-b:checked ~ .panels .panel-b,
                #tab-c:checked ~ .panels .panel-c { display:block; }
            </style>
            <div class="mirror">
                <input id="tab-a" name="mirror-tab" type="radio" checked>
                <input id="tab-b" name="mirror-tab" type="radio">
                <input id="tab-c" name="mirror-tab" type="radio">
                <div class="tabs">
                    <label for="tab-a">最初</label><label for="tab-b">后来</label><label for="tab-c">如今</label>
                </div>
                <div class="panels">
                    <article class="panel panel-a"><p>${'第一段纵向文字。'.repeat(12)}</p></article>
                    <article class="panel panel-b"><p>${'第二段纵向文字。'.repeat(12)}</p></article>
                    <article class="panel panel-c"><p>${'第三段纵向文字。'.repeat(12)}</p></article>
                </div>
            </div>
        </details>`;
}

const genericTabs = evaluateIndependentPostSanitizeQuality(genericTabbedMirror(), {
    interactionFamily: { id: 'tabbed_radio_family' },
    riskFlags: ['flat_vertical_flow', 'weak_spatial_complexity'],
    selectedFormats: [{ id: '8.7', title: '人生出场顺序论' }],
});
assert.equal(genericTabs.ok, false);
assert.equal(genericTabs.code, 'generic-tabbed-flat-layout');
assert.ok(genericTabs.flags.includes('tabbed_radio_family'));
assert.ok(genericTabs.flags.includes('flat_vertical_flow'));

const inferredGenericTabs = evaluateIndependentPostSanitizeQuality(genericTabbedMirror());
assert.equal(inferredGenericTabs.ok, false, 'obvious three-tab vertical text must be caught without scanner metadata');
assert.equal(inferredGenericTabs.code, 'generic-tabbed-flat-layout');

for (const selectedFormats of [
    [{ id: 'channel-surf', title: '电视频道切换器' }],
    [{ id: 'gearbox', title: '机械档位控制台' }],
    [{ id: 'folio', title: '分页卷宗' }],
]) {
    const nativeTabs = evaluateIndependentPostSanitizeQuality(genericTabbedMirror(), {
        interactionFamily: 'tabbed_radio_family',
        riskFlags: ['flat_vertical_flow', 'weak_spatial_complexity'],
        selectedFormats,
    });
    assert.equal(nativeTabs.ok, true, `native tabbed media should remain allowed: ${selectedFormats[0].title}`);
}

const multiNodeSingleReveal = `
    <details open>
        <summary>【兔子镜：四封未寄信】</summary>
        <style>
            .letters { display:grid; gap:12px; background:#f7f0dd; color:#362b21; }
            .hidden-letter { display:none; }
            #only-reveal:checked ~ .hidden-letter { display:block; }
        </style>
        <div class="letters">
            <input id="only-reveal" type="checkbox"><label for="only-reveal">拆开封条</label>
            <article data-rm-node="1">第一封信</article>
            <article data-rm-node="2">第二封信</article>
            <article data-rm-node="3">第三封信</article>
            <article class="hidden-letter" data-rm-node="4">第四封信</article>
        </div>
    </details>`;
const singleReveal = evaluateIndependentPostSanitizeQuality(multiNodeSingleReveal, { nodeCount: 4 });
assert.equal(singleReveal.ok, false);
assert.equal(singleReveal.code, 'multi-node-single-reveal');
assert.ok(singleReveal.flags.includes('single_reveal'));
assert.ok(singleReveal.flags.includes('multi_node_media'));

const oneNodeReveal = evaluateIndependentPostSanitizeQuality(`
    <details open><summary>【兔子镜：封蜡信】</summary>
    <style>.letter{background:#fff7df;color:#32271f}.answer{display:none}#open:checked~.answer{display:block}</style>
    <div class="letter"><input id="open" type="checkbox"><label for="open">拆信</label><p class="answer">唯一的回信。</p></div>
    </details>`);
assert.equal(oneNodeReveal.ok, true, 'a genuinely single-node reveal is not a multi-node degradation');

const lowContrast = evaluateIndependentPostSanitizeQuality(`
    <details open><summary>【兔子镜：雾中手札】</summary>
    <style>.page { background-color:#eeeeee; color:#e5e5e5; padding:16px; }</style>
    <article class="page"><p>这段正文几乎看不见。</p></article></details>`);
assert.equal(lowContrast.ok, false);
assert.equal(lowContrast.code, 'clearly-low-contrast');
assert.ok(lowContrast.flags.some(flag => flag.startsWith('low_contrast:')));

const readable = evaluateIndependentPostSanitizeQuality(`
    <details open><summary>【兔子镜：夜航记录】</summary>
    <style>.page { background:#101820; color:#f4ecd8; padding:16px; }</style>
    <article class="page"><p>正文具有清晰的明暗对比。</p></article></details>`);
assert.deepEqual(readable, { ok: true, code: 'ok', message: '', flags: [] });

const complexTheme = evaluateIndependentPostSanitizeQuality(`
    <details open><summary>【兔子镜：琉璃潮汐】</summary>
    <style>
        .stage { --ink:#777; --base:#7b7b7b; color:var(--ink); background:linear-gradient(135deg,var(--base),#171a22); }
        .stage { mix-blend-mode:normal; filter:saturate(.9); }
    </style>
    <section class="stage"><svg viewBox="0 0 40 20"><path d="M0 10 Q20 0 40 10"/></svg><p>复杂变量与渐变主题交给浏览器渲染，不做武断静态拒收。</p></section>
    </details>`);
assert.equal(complexTheme.ok, true, 'complex variables/gradients are intentionally outside the conservative contrast gate');

const decorativeLowContrast = evaluateIndependentPostSanitizeQuality(`
    <details open><summary>【兔子镜：雪夜航标】</summary>
    <div class="ornament" style="background:#eee;color:#e9e9e9"></div>
    <article style="background:#fff;color:#222"><p>装饰节点的近似色不能误伤清晰正文。</p></article>
    </details>`);
assert.equal(decorativeLowContrast.ok, true, 'a low-contrast decorative div is not enough for conservative rejection');

const inlineLowContrast = evaluateIndependentPostSanitizeQuality(`
    <details open><summary>【兔子镜：失焦手记】</summary>
    <article style="background:#ededed;color:#e6e6e6"><p>明确承载正文的简单实色内联主题仍应拒收。</p></article>
    </details>`);
assert.equal(inlineLowContrast.code, 'clearly-low-contrast');

const metadata = {
    interactionFamily: { id: 'tabbed_radio_family' },
    riskFlags: ['flat_vertical_flow'],
    selectedFormats: [{ title: '普通人物小传' }],
};
const metadataBefore = JSON.stringify(metadata);
evaluateIndependentPostSanitizeQuality(genericTabbedMirror(), metadata);
assert.equal(JSON.stringify(metadata), metadataBefore, 'the pure gate must not mutate caller metadata');

const gateSource = fs.readFileSync(new URL('../src/independentQualityGate.js', import.meta.url), 'utf8');
assert.doesNotMatch(gateSource, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/, 'quality gate must not perform network I/O');
assert.doesNotMatch(gateSource, /Math\.random|favoriteMultiplier|blacklist|samplingWeight/i, 'quality gate must not influence random selection or weights');
assert.doesNotMatch(gateSource, /outputSanitizer|sanitizeRabbitMirror/i, 'quality gate must not call or modify the sanitizer');

const apiSource = fs.readFileSync(new URL('../src/independentApi.js', import.meta.url), 'utf8');
const guardSource = fs.readFileSync(new URL('../src/generationGuard.js', import.meta.url), 'utf8');
const visualScannerSource = fs.readFileSync(new URL('../src/visualScanner.js', import.meta.url), 'utf8');
assert.match(guardSource, /tarotRules:\s*metadata\.tarotRules === true/, 'follow batch metadata must retain the per-face tarot requirement');
assert.match(visualScannerSource, /hasRequiredTarotEntityImage\(newRoot\.outerHTML \|\| ''\)/, 'follow faces must reuse the post-sanitize tarot entity-image proof');
const callStart = apiSource.indexOf('async function callIndependentApi(');
const callEnd = apiSource.indexOf('\nfunction externalOwnerMesid(', callStart);
const callSource = apiSource.slice(callStart, callEnd);
const prepareIndex = callSource.indexOf('const preparedHtml=prepareIndependentReadyHtml(inner)');
const evaluateIndex = callSource.indexOf('evaluateIndependentPostSanitizeQuality(preparedHtml');
const multifacePrepareIndex = callSource.indexOf('prepareIndependentMultifaceResult(raw,');
const firstRememberIndex = callSource.indexOf('rememberApiProfile(st,profile)');
const lastRememberIndex = callSource.lastIndexOf('rememberApiProfile(st,profile)');
assert.ok(prepareIndex >= 0 && evaluateIndex > prepareIndex, 'the quality gate must evaluate the actual post-sanitize fragment');
assert.ok(multifacePrepareIndex >= 0 && firstRememberIndex > multifacePrepareIndex, 'a multiface profile may be remembered only after every face passes protocol, sanitize and quality acceptance');
assert.ok(lastRememberIndex > evaluateIndex, 'a single-face profile may be remembered only after post-sanitize quality acceptance');
assert.match(callSource, /return \{html:preparedHtml,/, 'the exact fragment that passed the gate must be persisted and rendered');
assert.equal((callSource.match(/requestIndependentCompletion\(/g) || []).length, 1, 'quality rejection must not introduce a second paid request');
assert.match(apiSource, /INDEPENDENT_QUALITY_RETRY_GUARD_LIMIT=64/, 'failure hints must remain bounded without a timer');
assert.doesNotMatch(apiSource.slice(apiSource.indexOf('const INDEPENDENT_QUALITY_RETRY_GUARD_TTL_MS'), callStart), /setInterval|setTimeout|fetch\(/, 'the retry-quality guard must not add polling, timers, or network I/O');

const pendingRegressionFailures = [];

try {
    const prepareStart = apiSource.indexOf('function prepareIndependentReadyHtml(');
    const prepareEnd = apiSource.indexOf('\nfunction repairLabelTargets(', prepareStart);
    assert.ok(prepareStart >= 0 && prepareEnd > prepareStart, 'prepareIndependentReadyHtml must remain directly testable');
    let sanitizeCalls = 0;
    const prepareSandbox = {
        RUNTIME_VERSION: 'quality-gate-test',
        preparedReadyHtmlCache: new Map(),
        assertIndependentMarkupComplexity: () => true,
        hashText: value => `hash:${String(value || '')}`,
        hasMultifaceMarkup: () => false,
        repairMalformedLabelMarkup: value => String(value || ''),
        cleanRabbitMirrorOutput: value => String(value || '').trim(),
        compactTotoBlock: value => String(value || '').replace('RAW-MIRROR', 'SANITIZED-MIRROR'),
        sanitizeIndependentReadyFragment: value => {
            sanitizeCalls += 1;
            return String(value || '');
        },
        cachePreparedReadyHtml: (key, value) => {
            prepareSandbox.preparedReadyHtmlCache.set(String(key || ''), String(value || ''));
            return String(value || '');
        },
        globalThis: {},
    };
    vm.createContext(prepareSandbox);
    vm.runInContext(`${apiSource.slice(prepareStart, prepareEnd)}\nglobalThis.prepare=prepareIndependentReadyHtml;`, prepareSandbox);
    const firstPrepared = prepareSandbox.globalThis.prepare('<details>RAW-MIRROR</details>');
    assert.equal(firstPrepared, '<details>SANITIZED-MIRROR</details>');
    const mountedPrepared = prepareSandbox.globalThis.prepare(firstPrepared);
    assert.equal(mountedPrepared, firstPrepared);
    assert.equal(sanitizeCalls, 1, 'the first prepared result must seed its own cache key so mounting cannot sanitize it again');
} catch (error) {
    pendingRegressionFailures.push(`prepared-self-cache: ${error?.message || error}`);
}

try {
    const guardStart = apiSource.indexOf('const INDEPENDENT_QUALITY_RETRY_GUARD_TTL_MS');
    const guardEnd = apiSource.indexOf('\nfunction manualRetryVisualGuard(', guardStart);
    assert.ok(guardStart >= 0 && guardEnd > guardStart, 'quality retry guard must remain directly testable');
    const guardSandbox = {
        // Match the production base-slot contract: chat/index/swipe are stable while
        // the final source fingerprint changes after a genuine same-swipe edit.
        baseSlotOf: slot => String(slot || '').replace(/:[^:]+$/, ''),
        globalThis: {},
    };
    vm.createContext(guardSandbox);
    vm.runInContext(`${apiSource.slice(guardStart, guardEnd)}
globalThis.remember=rememberIndependentQualityFailure;
globalThis.read=independentQualityFailureRetryGuard;`, guardSandbox);
    const firstSourceSlot = 'chat-alpha:17:0:source-hash-a';
    const newSourceSlot = 'chat-alpha:17:0:source-hash-b';
    guardSandbox.globalThis.remember(firstSourceSlot, {
        ok: false,
        code: 'generic-tabbed-flat-layout',
        flags: ['tabbed_radio_family', 'flat_vertical_flow'],
    });
    assert.match(guardSandbox.globalThis.read(firstSourceSlot), /上一版/, 'the exact failed source must retain its manual retry hint');
    assert.equal(
        guardSandbox.globalThis.read(newSourceSlot),
        '',
        'a genuinely new sourceHash in the same chat/index/swipe must not inherit the previous正文 quality hint',
    );
} catch (error) {
    pendingRegressionFailures.push(`source-isolated-retry-guard: ${error?.message || error}`);
}

assert.deepEqual(
    pendingRegressionFailures,
    [],
    `pending post-sanitize regressions:\n${pendingRegressionFailures.join('\n')}`,
);

console.log('independent post-sanitize quality gate tests passed');
