// Original fixtures only: no live host, paid API or copyrighted library content.
// Include the production top-layer hotfix: omitting it hid the nested-modal defect.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../', import.meta.url));
const cohort = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8')).js.split('?rmv=')[1];
const base = '/scripts/extensions/third-party/rabbit';
const { chromium } = createRequire(import.meta.url)('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    if (path === '/') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
        :root{--SmartThemeBlurTintColor:#fafafa;--SmartThemeBodyColor:#202124}
        body{margin:0;font:16px/1.5 sans-serif;min-height:2400px;transform:translateZ(0)}
        button{width:28px!important;font-size:36px!important;writing-mode:vertical-rl!important}
        </style><button id="launch">打开</button><div id="rh_advanced_modal" aria-hidden="true" style="display:none"><div id="rh_advanced_modal_card"><button id="rh_advanced_close">关闭</button><button id="nested_launch">导入</button></div></div>`);
        return;
    }
    res.setHeader('Content-Type', 'text/javascript');
    if (path === '/script.js') { res.end('export function saveSettingsDebounced(){};export function getRequestHeaders(){return {}};'); return; }
    if (path === '/scripts/extensions.js') { res.end('export const extension_settings=globalThis.__settings;'); return; }
    if (path.startsWith(base + '/')) {
        const file = resolve(root, decodeURIComponent(path.slice(base.length + 1)));
        const rel = relative(root, file);
        if (rel && !rel.startsWith('..') && !isAbsolute(rel)) { try { res.end(readFileSync(file)); return; } catch {} }
    }
    res.writeHead(404); res.end();
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
const results = [];
try {
    browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(2000);
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(async ({ base, cohort }) => {
        globalThis.__settings = {};
        globalThis.SillyTavern = { getContext: () => ({ chatId: 'original-modal-fixture', chat: [], getWorldInfoNames: () => [] }) };
        globalThis.__wizard = await import(`${base}/src/externalWorldBook/importWizard.js?rmv=${cohort}`);
        globalThis.__hotfix = await import(`${base}/src/mobileModalHotfix.js?rmv=${cohort}`);
        __hotfix.initRabbitMirrorMobileModalHotfix();
        document.getElementById('nested_launch').onclick = () => __wizard.openExternalWorldBookImportWizard();
        document.getElementById('rh_advanced_close').onclick = () => { const modal = document.getElementById('rh_advanced_modal'); modal.setAttribute('aria-hidden', 'true'); modal.style.display = 'none'; };
        window.scrollTo(0, 1400);
    }, { base, cohort });
    const inspect = () => page.evaluate(() => {
        const modal = document.getElementById('rh_external_worldbook_import_modal');
        const close = modal.querySelector('[aria-label="关闭外部世界书母本"]');
        const r = close.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { top: r.top, bottom: r.bottom, right: r.right, left: r.left, height: r.height,
            hit: hit === close || close.contains(hit), modal: modal.matches(':modal'),
            visible: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth };
    });
    await page.evaluate(() => __wizard.openExternalWorldBookImportWizard());
    results.push({ scenario: 'transformed-scrolled-host', ...(await inspect()) });
    await page.evaluate(() => document.getElementById('rh_external_worldbook_import_modal').remove());
    await page.evaluate(() => { const parent = document.getElementById('rh_advanced_modal'); parent.setAttribute('aria-hidden', 'false'); parent.style.display = 'flex'; });
    await page.locator('#rh_advanced_modal[open]').waitFor();
    await page.locator('#nested_launch').click();
    results.push({ scenario: 'nested-production-top-layer', ...(await inspect()) });
    console.log(JSON.stringify({ phase: 'geometry', results }));
    for (const result of results) assert.ok(result.visible && result.hit && result.modal, JSON.stringify(result));
    if (process.env.RM_UI_SCREENSHOT) await page.screenshot({ path: process.env.RM_UI_SCREENSHOT });
    await page.getByRole('button', { name: '关闭外部世界书母本', exact: true }).click();
    assert.equal(await page.locator('#rh_external_worldbook_import_modal').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'nested_launch');
    await page.locator('#nested_launch').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#rh_external_worldbook_import_modal').count(), 0);
    assert.equal(await page.locator('#rh_advanced_modal[open]').count(), 1);
    await page.locator('#nested_launch').click();
    await page.evaluate(() => {
        const input = document.querySelector('#rh_external_worldbook_import_modal input[type="file"]');
        const file = new File([JSON.stringify({ entries: { 0: { uid: 0, comment: '展现1 原创延迟读取', content: '原创雨天窗口。' } } })], 'original-delayed.json', { type: 'application/json' });
        const text = file.text.bind(file);
        file.text = async () => { await new Promise(resolve => { globalThis.__releaseFile = resolve; }); return text(); };
        Object.defineProperty(input, 'files', { configurable: true, value: [file] });
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.keyboard.press('Escape');
    await page.locator('#nested_launch').click();
    await page.evaluate(async () => { __releaseFile(); await new Promise(resolve => setTimeout(resolve, 0)); });
    await page.getByText('尚未读取世界书。', { exact: true }).waitFor();
    assert.equal(await page.getByText('原创延迟读取', { exact: true }).count(), 0, 'closed owner cannot populate a new wizard');
    await page.keyboard.press('Escape');
    for (const viewport of [{ width: 320, height: 568 }, { width: 812, height: 375 }]) {
        await page.setViewportSize(viewport);
        await page.locator('#nested_launch').click();
        const result = await inspect();
        assert.ok(result.visible && result.hit && result.height >= 44, JSON.stringify(result));
        await page.getByPlaceholder('搜索条目名称、关键词、正文或 uid').scrollIntoViewIfNeeded();
        assert.ok((await inspect()).visible, 'close remains visible when body is scrolled');
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => !!document.activeElement.closest('#rh_external_worldbook_import_modal')), true);
        await page.keyboard.press('Escape');
    }
    await page.evaluate(async ({ base }) => {
        document.getElementById('rh_advanced_close').click();
        document.body.style.transform = 'none';
        window.scrollTo(0, 0);
        const style = document.createElement('style');
        style.textContent = await (await fetch(`${base}/style.css`)).text();
        document.head.append(style);
        const chat = document.createElement('div'); chat.id = 'chat';
        chat.innerHTML = `<toto data-rabbit-mirror="true" data-rm-face="1" style="display:block;margin:0"><details><summary style="background:rgb(21,57,83)">原创雨信</summary><details id="scene-control"><summary style="min-height:9px;padding:0">物品口袋</summary><p>原创内容</p></details></details></toto><toto data-rabbit-mirror="true" data-rm-face="2" style="display:block;margin:0"><details><summary>原创晴窗</summary><p>原创内容</p></details></toto><div class="rabbit-mirror-external-shell rabbit-mirror-multiface-host" data-rm-placement="inline"><details data-rabbit-mirror-external-details="true"><summary>原创夜船</summary></details><details data-rabbit-mirror-external-details="true"><summary>原创月台</summary></details></div>`;
        document.body.prepend(chat);
    }, { base });
    const touch = await page.evaluate(() => {
        const [a, b] = [...document.querySelectorAll('#chat toto > details > summary')].map(node => node.getBoundingClientRect());
        const inline = [...document.querySelectorAll('.rabbit-mirror-multiface-host > details > summary')].map(node => node.getBoundingClientRect());
        return { height: a.height, gap: b.top - a.bottom, inlineHeight: inline[0].height, inlineGap: inline[1].top - inline[0].bottom,
            color: getComputedStyle(document.querySelector('#chat toto summary')).backgroundColor,
            nestedPadding: getComputedStyle(document.querySelector('#scene-control > summary')).paddingTop };
    });
    assert.ok(touch.height >= 48 && touch.gap >= 24 && touch.inlineHeight >= 48 && touch.inlineGap >= 24, JSON.stringify(touch));
    assert.equal(touch.color, 'rgb(21, 57, 83)', 'author palette is untouched');
    assert.equal(touch.nestedPadding, '0px', 'nested scene controls are not restyled');
    assert.deepEqual(errors, []);
    const ui = readFileSync(resolve(root, 'src/ui.js'), 'utf8');
    assert.match(ui, /data-page="replacement"[^>]*>🚫 禁词与文字替换<\/button>/);
    assert.match(ui, /id="rh_advanced_page_replacement"[^>]*data-title="🚫 禁词与文字替换"/);
    console.log(JSON.stringify({ status: 'passed', checks: 18, boundary: 'production wizard and modal hotfix; synthetic transformed scrolled host; nested top layer; 320/390 and landscape; focus/close/Escape and close during file read; scoped inline touch geometry; consistent replacement label' }));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
