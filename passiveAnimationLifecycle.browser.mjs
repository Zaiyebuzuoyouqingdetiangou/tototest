// Offline CSS-cascade regression using the real stacked-state detector and runtime.
// All scene content is original synthetic data. No host, provider or private data is used.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const { chromium } = createRequire(import.meta.url)('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json')));
const cohort = manifest.js.split('?rmv=')[1];
const base = '/scripts/extensions/third-party/rabbit';
const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    if (path === '/') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(`<!doctype html><html><head><link rel="stylesheet" href="${base}/style.css"></head><body><div id="chat"></div></body></html>`);
        return;
    }
    if (path === '/script.js') {
        response.end('export const event_types={},eventSource={on(){},off(){},emit(){}},extension_prompt_types={IN_CHAT:0},extension_prompt_roles={SYSTEM:0};export const chat=[],characters=[],chat_metadata={};export function saveSettingsDebounced(){};export function getCurrentChatId(){return "animation-fixture"};export function setExtensionPrompt(){};');
        return;
    }
    if (path === '/scripts/extensions.js') {
        response.end('export const extension_settings={};');
        return;
    }
    if (!path.startsWith(base + '/')) {
        response.writeHead(404); response.end(); return;
    }
    const name = decodeURIComponent(path.slice(base.length + 1));
    const file = resolve(root, name);
    if (!file.startsWith(root + sep)) {
        response.writeHead(403); response.end(); return;
    }
    try {
        let source = readFileSync(file, 'utf8');
        if (name.endsWith('.css')) response.setHeader('Content-Type', 'text/css; charset=utf-8');
        if (name === 'src/outputSanitizer.js') {
            source += '\nexport const __animationTest={installExclusiveStackedStateRescue,cleanupExclusiveStackedStateRescue,refreshExclusiveStackedStateRescue};';
        }
        response.end(source);
    } catch {
        response.writeHead(404); response.end();
    }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
    browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    await page.goto(origin);
    const results = await page.evaluate(async ({ base, cohort, version }) => {
        globalThis.__rabbitMirrorRuntimeVersion = version;
        const { __animationTest: runtime } = await import(base + '/src/outputSanitizer.js?rmv=' + cohort);
        const fixtures = [];
        for (const mode of ['inline', 'external']) {
            const variants = [
                ['css-running', ''],
                ['inline-running', 'animation-play-state:running'],
                ['inline-paused', 'animation-play-state:paused'],
                ['important-paused', 'animation-play-state:paused!important'],
                ['css-paused', ''],
            ];
            const id = mode;
            const element = document.createElement(mode === 'inline' ? 'toto' : 'div');
            if (mode === 'inline') element.setAttribute('data-rabbit-mirror', 'true');
            element.innerHTML = `<details open ${mode === 'external' ? 'data-rabbit-mirror-external-details="true"' : ''}>
                <summary>原创合成弹幕场景</summary>
                <style>
                  @keyframes ${id}-drift { 50% { transform:translateX(2px); } }
                  #${id}-scene { position:relative; height:220px; }
                  #${id}-scene .state-ticker-panel { position:absolute; white-space:nowrap; pointer-events:none; opacity:1; animation:${id}-drift 60s linear infinite; }
                  #${id}-scene .css-paused { animation-play-state:paused; }
                  #${id}-a:checked ~ .ticker-a { opacity:1; visibility:visible; }
                  #${id}-b:checked ~ .ticker-b { opacity:1; visibility:visible; }
                  #${id}-decoration { animation:${id}-drift 60s linear infinite; }
                </style>
                <section id="${id}-scene">
                  <input type="radio" name="${id}-group" id="${id}-a" checked><label for="${id}-a">春日短笺</label>
                  <input type="radio" name="${id}-group" id="${id}-b"><label for="${id}-b">夏日短笺</label>
                  ${variants.map(([name, style], i) => `<span class="state-ticker-panel ticker-a ${name}" data-variant="${name}" style="top:${40 + i * 24}px;${style}">原创纸船带来春日的第${i + 1}封短笺</span>`).join('')}
                  <span class="state-ticker-panel ticker-b" data-variant="other-group" style="top:180px">原创夏日短笺从河的另一端缓缓漂来</span>
                  <i id="${id}-decoration">独立叶片</i>
                </section>
            </details>`;
            document.querySelector('#chat').append(element);
            const installed = runtime.installExclusiveStackedStateRescue(element);
            const details = element.querySelector('details');
            fixtures.push({ mode, element, details, installed });
        }
        const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const read = fixture => ({
            mode: fixture.mode,
            open: fixture.details.open,
            panels: [...fixture.element.querySelectorAll('[data-variant]')].map(panel => ({
                variant: panel.dataset.variant,
                state: getComputedStyle(panel).animationPlayState,
                inline: panel.style.getPropertyValue('animation-play-state'),
                priority: panel.style.getPropertyPriority('animation-play-state'),
                hidden: panel.getAttribute('aria-hidden'),
            })),
            decoration: getComputedStyle(fixture.element.querySelector('i')).animationPlayState,
        });
        const stages = [];
        const snapshot = name => stages.push({ name, fixtures: fixtures.map(read) });
        snapshot('installed');
        for (const fixture of fixtures) fixture.details.querySelector('summary').click();
        await nextFrame();
        snapshot('collapsed');
        // Existing delayed refresh callbacks must not override the collapsed CSS either.
        await new Promise(resolve => setTimeout(resolve, 710));
        snapshot('collapsed-after-refresh');
        for (const fixture of fixtures) fixture.details.querySelector('summary').click();
        await nextFrame();
        snapshot('reopened');
        for (const fixture of fixtures) fixture.element.querySelector(`label[for="${fixture.mode}-b"]`).click();
        await nextFrame();
        snapshot('other-group');
        for (const fixture of fixtures) fixture.element.querySelector(`label[for="${fixture.mode}-a"]`).click();
        await nextFrame();
        snapshot('reactivated');
        for (const fixture of fixtures) fixture.details.querySelector('summary').click();
        await new Promise(resolve => setTimeout(resolve, 710));
        snapshot('reactivated-collapsed');
        for (const fixture of fixtures) {
            fixture.details.querySelector('summary').click();
            runtime.cleanupExclusiveStackedStateRescue(fixture.element);
        }
        await nextFrame();
        snapshot('cleanup');
        return { installed: fixtures.map(({ mode, installed }) => ({ mode, installed })), stages };
    }, { base, cohort, version: manifest.version });
    console.log(JSON.stringify({ installed: results.installed, stages: results.stages.map(stage => ({
        name: stage.name,
        fixtures: stage.fixtures.map(fixture => ({ mode: fixture.mode, states: fixture.panels.map(panel => `${panel.variant}=${panel.state}`), decoration: fixture.decoration })),
    })) }));
    for (const fixture of results.installed) assert.equal(fixture.installed, 1, `${fixture.mode}: production detector must install the passive animated collection`);
    for (const fixture of results.stages.find(stage => stage.name === 'collapsed').fixtures) {
        assert.ok(fixture.panels.every(panel => panel.state === 'paused'), `${fixture.mode}: active-group inline styles must not defeat collapsed-scene CSS pause`);
    }
    for (const stage of results.stages) for (const fixture of stage.fixtures) {
        const collapsed = stage.name.includes('collapsed');
        const other = stage.name === 'other-group';
        const cleanup = stage.name === 'cleanup';
        for (const panel of fixture.panels) {
            const inactive = !cleanup && (panel.variant === 'other-group' ? !other : other);
            const originallyPaused = panel.variant.includes('paused');
            const expected = collapsed || inactive || originallyPaused ? 'paused' : 'running';
            assert.equal(panel.state, expected, `${fixture.mode}/${stage.name}/${panel.variant}: real CSS animation state`);
            if (!collapsed && !inactive) {
                const originalInline = panel.variant === 'inline-running' ? 'running' : ['inline-paused', 'important-paused'].includes(panel.variant) ? 'paused' : '';
                assert.equal(panel.inline, originalInline, `${fixture.mode}/${stage.name}/${panel.variant}: restore authored inline value`);
                assert.equal(panel.priority, panel.variant === 'important-paused' ? 'important' : '', `${fixture.mode}/${stage.name}/${panel.variant}: restore authored priority`);
            }
            if (!cleanup) assert.equal(panel.hidden, inactive ? 'true' : 'false', `${fixture.mode}/${stage.name}/${panel.variant}: group ownership unchanged`);
        }
        assert.equal(fixture.decoration, collapsed ? 'paused' : 'running', `${fixture.mode}/${stage.name}: unrelated decoration must not be globally disabled`);
    }
    console.log('PASS: 2 placements x 8 lifecycle stages; stylesheet pause, authored states and inactive groups preserved. This is an isolated desktop Edge CSS regression, not a physical-phone power or heat measurement.');
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
