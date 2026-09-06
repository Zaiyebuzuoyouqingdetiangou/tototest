// Isolated browser acceptance against original synthetic worldbooks only.
// No user account, real host DB, prompt or API credential is read.
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
const host = `export function saveSettingsDebounced(){}; export function getRequestHeaders(){return {'Content-Type':'application/json'}};
export const event_types={}; export const eventSource={on(){},off(){},emit(){}}; export function setExtensionPrompt(){};
export const extension_prompt_types={IN_CHAT:0}; export const extension_prompt_roles={SYSTEM:0,USER:1,ASSISTANT:2};`;
const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    if (path === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    :root{--SmartThemeBlurTintColor:#fafafa;--SmartThemeBodyColor:#202124} body{margin:0;font:16px/1.5 sans-serif}
    button{width:28px!important;font-size:36px!important;writing-mode:vertical-rl!important}
    .menu_button{max-width:30px!important;word-break:break-all!important;transform:translateX(80px)!important}
    </style>`); return; }
    res.setHeader('Content-Type', 'text/javascript');
    if (path === '/script.js') { res.end(host); return; }
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
let checks = 0;
try {
    browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(async ({ base, cohort }) => {
        globalThis.__settings = {};
        globalThis.SillyTavern = { getContext: () => ({ chatId: 'original-fixture', chat: [], getWorldInfoNames: () => [] }) };
        globalThis.__wizard = await import(`${base}/src/externalWorldBook/importWizard.js?rmv=${cohort}`);
        globalThis.__store = await import(`${base}/src/externalWorldBook/store.js?rmv=${cohort}`);
        __wizard.openExternalWorldBookImportWizard();
    }, { base, cohort });
    const fileButton = page.getByRole('button', { name: /^从本地(?:世界书)?文件导入$/ });
    const geometry = await fileButton.evaluate(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, writing: getComputedStyle(node).writingMode, className: node.className }));
    assert.ok(geometry.width > 120 && geometry.height < 90, JSON.stringify(geometry));
    assert.equal(geometry.writing, 'horizontal-tb');
    assert.doesNotMatch(geometry.className, /menu_button/); checks++;
    const entries = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [i, { uid: i, comment: i < 40 ? `${i % 2 ? '主题' : '展现'}${i + 1} 原创条目` : `原创未标记 ${i}`, key: [], content: i < 40 ? '原创的情境与布局说明。' : i < 42 ? '这是一篇日记。' : '中性内容。' }]));
    const chooser = page.waitForEvent('filechooser');
    await fileButton.click();
    await (await chooser).setFiles({ name: 'original-synthetic-45.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ entries })) });
    await page.getByRole('button', { name: '进入分类确认', exact: true }).click();
    await page.getByText('待保存 45 条｜主题 20｜展现形式 20｜辅助 0｜忽略 0｜待确认 5', { exact: true }).waitFor(); checks++;
    await page.getByRole('button', { name: '全部一键分类（按线索建议）', exact: true }).click();
    await page.getByText('待保存 45 条｜主题 20｜展现形式 22｜辅助 0｜忽略 0｜待确认 3', { exact: true }).waitFor(); checks++;
    await page.locator('#rh_external_bulk_category').selectOption('theme');
    await page.getByRole('button', { name: '应用待确认项批量分类', exact: true }).click();
    await page.getByRole('button', { name: '确认分类并保存到本地', exact: true }).click();
    await page.getByText('抽签索引：可用', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(async () => (await __store.listExternalLibraries()).map(lib => [lib.entryCount, lib.formatCount, lib.themeCount, lib.enabled])), [[45,22,23,false]]); checks++;
    await page.getByRole('button', { name: '启用', exact: true }).click();
    assert.equal(await page.evaluate(async () => (await __store.listExternalLibraries())[0].enabled), true); checks++;
    for (const viewport of [{ width: 812, height: 375 }, { width: 320, height: 568 }]) {
        await page.setViewportSize(viewport);
        await page.evaluate(() => { document.body.style.fontSize = '24px'; });
        await fileButton.scrollIntoViewIfNeeded();
        const layout = await fileButton.evaluate(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, writing: getComputedStyle(node).writingMode }));
        assert.ok(layout.width > 100 && layout.height < 100, JSON.stringify(layout));
        assert.equal(layout.writing, 'horizontal-tb'); checks++;
    }
    // Simulate an older saved library without light metadata; opening management
    // may read metadata only, then one explicit rebuild makes it usable again.
    await page.evaluate(async () => {
        const db = await __store.openExternalLibraryDatabase();
        await new Promise((done, reject) => { const tx = db.transaction('poolMetadata', 'readwrite'); tx.objectStore('poolMetadata').clear(); tx.oncomplete = done; tx.onerror = reject; });
        db.close();
        await __store.hydrateExternalPoolMetadata({ force: true });
        __wizard.openExternalWorldBookImportWizard();
    });
    await page.getByRole('button', { name: '管理已保存内容', exact: true }).click();
    await page.getByText('抽签索引：需重建（已保存内容仍在）', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => __store.getExternalPoolHydrationStatus().enabledMetadataRebuildRequired.length), 1); checks++;
    await page.getByRole('button', { name: '重建抽签索引', exact: true }).click();
    await page.getByText('抽签索引：可用', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => __store.getExternalPoolHydrationStatus().enabledMetadataRebuildRequired.length), 0); checks++;
    assert.deepEqual(errors, []);
    if (process.env.RM_UI_SCREENSHOT) await page.screenshot({ path: process.env.RM_UI_SCREENSHOT, fullPage: true });
    console.log(JSON.stringify({ status: 'passed', checks, fixture: '45 original entries, adverse host button CSS, real browser File/IDB, explicit missing-index rebuild' }));
} finally {
    await browser?.close();
    await new Promise(done => server.close(done));
}
