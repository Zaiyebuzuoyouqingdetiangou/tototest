// Complete production ui.js initialization and events with a minimal host DOM
// jQuery adapter. Settings, replacements and nested file-import wizard are real.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
const cohort = manifest.js.split('?rmv=')[1];
const base = '/scripts/extensions/third-party/rabbit';
const { chromium } = createRequire(import.meta.url)('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const originalUi = readFileSync(resolve(root, 'src/ui.js'), 'utf8');
const externalNames = [...originalUi.matchAll(/^import \{([^}]+)\} from '([^']+)';$/gm)].filter(match => !/settings\.js|bannedWords\.js/.test(match[2])).flatMap(match => match[1].split(',').map(name => name.trim()));
const ui = originalUi.replace(/^import \{([^}]+)\} from '([^']+)';$/gm, (line, names, path) => /settings\.js|bannedWords\.js/.test(path) ? line : '')
    + '\nexport const __fixtureUiLoaded=true;';
const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    if (path === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--SmartThemeBlurTintColor:#fafafa;--SmartThemeBodyColor:#202124}body{margin:0;font:16px/1.5 sans-serif}.menu_button,.text_pole{font:inherit;padding:8px}</style><div id="extensions_settings2"></div>'); return; }
    res.setHeader('Content-Type', 'text/javascript');
    if (path === '/script.js') { res.end('export function saveSettingsDebounced(){globalThis.__saved=structuredClone(globalThis.__settings)}; export function getRequestHeaders(){return {}};'); return; }
    if (path === '/scripts/extensions.js') { res.end('export const extension_settings=globalThis.__settings;'); return; }
    if (path === base + '/src/ui.js') { res.end(externalNames.map(name => `const ${name}=globalThis.__uiHost['${name}'];`).join('\n') + ui); return; }
    if (path.startsWith(base + '/')) {
        const file = resolve(root, decodeURIComponent(path.slice(base.length + 1)));
        const rel = relative(root, file);
        if (rel && !rel.startsWith('..') && !isAbsolute(rel)) { try { res.end(readFileSync(file)); return; } catch {} }
    }
    res.writeHead(404); res.end();
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
try {
    browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(async ({ base, cohort, version, externalNames }) => {
        class Query extends Array {
            each(fn) { this.forEach((node, i) => fn.call(node, i, node)); return this; }
            find(selector) { return $(this.flatMap(node => [...node.querySelectorAll(selector)])); }
            parent() { return $([...new Set(Array.from(this, node => node.parentElement).filter(Boolean))]); }
            closest(selector) { return $(Array.from(this, node => node.closest(selector)).filter(Boolean)); }
            filter(fn) { return $(Array.prototype.filter.call(this, (node, i) => typeof fn === 'function' ? fn(i, node) : node.matches(fn))); }
            first() { return $(this[0]); }
            attr(key, value) { if (typeof key === 'object') return this.each((i, node) => Object.entries(key).forEach(([k, v]) => node.setAttribute(k, v))); if (value === undefined) return this[0]?.getAttribute(key); return this.each((i, node) => node.setAttribute(key, value)); }
            data(key, value) { return this.attr('data-' + key, value); }
            prop(key, value) { if (value === undefined) return this[0]?.[key]; return this.each((i, node) => { node[key] = value; }); }
            val(value) { return arguments.length ? this.prop('value', value ?? '') : this[0]?.value; }
            text(value) { return arguments.length ? this.prop('textContent', value ?? '') : this[0]?.textContent; }
            html(value) { return arguments.length ? this.prop('innerHTML', value ?? '') : this[0]?.innerHTML; }
            empty() { return this.each((i, node) => node.replaceChildren()); }
            remove() { return this.each((i, node) => node.remove()); }
            css(key, value) { if (typeof key === 'string' && value === undefined) return this[0] ? getComputedStyle(this[0])[key] : ''; return this.each((i, node) => Object.assign(node.style, typeof key === 'object' ? key : { [key]: value })); }
            hide() { return this.css('display', 'none'); }
            show() { return this.css('display', ''); }
            toggle(value) { return value ? this.show() : this.hide(); }
            is(selector) { return !!this[0] && (selector === ':visible' ? this[0].getClientRects().length > 0 : this[0].matches(selector)); }
            append(...values) { return this.each((i, node) => values.forEach(value => $(value).forEach(child => node.append(child)))); }
            appendTo(target) { $(target).append(this); return this; }
            addClass(name) { return this.each((i, node) => node.classList.add(...name.split(' '))); }
            removeClass(name) { return this.each((i, node) => node.classList.remove(...name.split(' '))); }
            on(events, selector, handler) { const fn = typeof selector === 'function' ? selector : handler; return this.each((i, node) => events.split(/\s+/).forEach(event => node.addEventListener(event.split('.')[0], e => { const target = typeof selector === 'string' ? e.target.closest(selector) : node; if (target) fn.call(target, e); }))); }
            off() { return this; }
            trigger(name) { return this.each((i, node) => name === 'focus' ? node.focus() : node.dispatchEvent(new Event(name, { bubbles: true }))); }
            get(index) { return index === undefined ? [...this] : this[index]; }
        }
        globalThis.$ = value => {
            if (value instanceof Query) return value;
            let nodes;
            if (typeof value === 'string' && value.trim().startsWith('<')) { const tpl = document.createElement('template'); tpl.innerHTML = value; nodes = [...tpl.content.childNodes]; }
            else if (typeof value === 'string') nodes = [...document.querySelectorAll(value)];
            else nodes = value instanceof Node ? [value] : Array.isArray(value) ? value : [];
            return Query.from(nodes);
        };
        globalThis.__settings = {};
        globalThis.__rabbitMirrorRuntimeVersion = version;
        globalThis.toastr = { warning() {}, success() {}, error() {} };
        globalThis.SillyTavern = { getContext: () => ({ chatId: 'advanced-original-fixture', chat: [], getWorldInfoNames: () => [] }) };
        const arrays = ['getIndependentConnectionProfiles','getIndependentSavedModels','getObservedWorldInfoBooks','blacklistEntries','favoriteEntries'];
        globalThis.__uiHost = Object.fromEntries(externalNames.map(name => [name, name.endsWith('_EVENT') ? 'fixture-' + name : arrays.includes(name) ? () => [] : name === 'blacklistPoolStats' ? () => ({ themeTotal: 165, formatTotal: 208 }) : () => null]));
        globalThis.__realSettings = await import(`${base}/src/settings.js?rmv=${cohort}`);
        globalThis.__productionUi = await import(`${base}/src/ui.js?rmv=${cohort}`);
        __productionUi.initRabbitMirrorUI();
    }, { base, cohort, version: manifest.version, externalNames });
    await page.locator('#rh_advanced_open').click();
    await page.locator('.rh-advanced-choice[data-page="external"]').click();
    assert.equal(await page.locator('#rh_advanced_page_external #rh_external_worldbook_open').count(), 1);
    assert.equal(await page.locator('#rh_advanced_page_external').isVisible(), true);
    await page.locator('#rh_external_worldbook_open').click();
    await page.locator('#rh_external_worldbook_import_modal').waitFor();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '从本地文件导入', exact: true }).click();
    await (await chooser).setFiles({ name: 'original.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ entries: { 0: { uid: 0, comment: '展现1', content: '原创内容。' } } })) });
    await page.getByRole('button', { name: '关闭外部世界书母本', exact: true }).click();
    assert.equal(await page.locator('#rh_advanced_page_external').isVisible(), true);
    await page.locator('#rh_advanced_back_top').click();
    await page.locator('.rh-advanced-choice[data-page="replacement"]').click();
    assert.equal(await page.locator('#rh_advanced_page_replacement #rh_banned_words').count(), 1);
    await page.locator('#rh_banned_words').fill('旧称呼 => 新称呼\n删除词');
    await page.locator('#rh_banned_words_save').click();
    const stored = await page.evaluate(() => __realSettings.getSettings().rabbitMirrorBannedWords);
    assert.deepEqual(stored, [{ find: '旧称呼', replace: '新称呼' }, '删除词']);
    assert.deepEqual(await page.evaluate(() => JSON.parse(JSON.stringify(__saved.rabbit_mirror_theater.rabbitMirrorBannedWords))), stored);
    assert.equal(await page.locator('#rh_banned_words').inputValue(), '旧称呼 => 新称呼\n删除词');
    for (const id of ['rh_replacement_find', 'rh_replacement_value']) {
        assert.equal(await page.locator('#' + id).evaluate(node => node.getBoundingClientRect().right <= node.parentElement.getBoundingClientRect().right + 1), true, 'replacement input stays inside its label');
    }
    if (process.env.RM_UI_SCREENSHOT) await page.screenshot({ path: process.env.RM_UI_SCREENSHOT, fullPage: true });
    await page.locator('#rh_advanced_back_top').click();
    assert.equal(await page.locator('#rh_advanced_menu').isVisible(), true);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: 'passed', checks: 7, boundary: 'Full production UI init/events; minimal jQuery/host collaborators; real settings/replacements/File/wizard' }));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
