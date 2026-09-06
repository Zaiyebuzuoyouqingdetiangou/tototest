// Real IndexedDB + production importer/pool/picker/plan/render and exact batch
// owner guard, using only 45 original synthetic entries. No provider request.
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
const api = readFileSync(resolve(root, 'src/independentApi.js'), 'utf8');
const guardStart = api.indexOf('function independentPromptBatchSignature(');
const guardEnd = api.indexOf('\nfunction captureIndependentPromptOwner(', guardStart);
assert.ok(guardStart > 0 && guardEnd > guardStart);
const guard = api.slice(guardStart, guardEnd);
const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    if (path === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8">'); return; }
    res.setHeader('Content-Type', 'text/javascript');
    if (path === '/script.js') { res.end('export function saveSettingsDebounced(){}; export function getRequestHeaders(){return {}}; export const event_types={}; export const eventSource={on(){},off(){}}; export function setExtensionPrompt(){}; export const extension_prompt_types={IN_CHAT:0}; export const extension_prompt_roles={SYSTEM:0,USER:1,ASSISTANT:2};'); return; }
    if (path === '/scripts/extensions.js') { res.end('export const extension_settings={};'); return; }
    if (path === '/guard.js') { res.end(`function independentPromptOwnerPreflightError(){const e=new Error('owner rejected');e.code='RABBIT_MIRROR_DISPATCH_LEASE_REJECTED';return e;}\n${guard}\nexport {independentPromptBatchSignature};`); return; }
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
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const load = async () => page.evaluate(async ({ base, cohort }) => {
        globalThis.host = { chatId: 'original-external', chat: [{ is_user: false, mes: 'The original gardener closes a notebook.', swipe_id: 0 }] };
        globalThis.SillyTavern = { getContext: () => host };
        const moduleAt = name => import(`${base}/src/${name}?rmv=${cohort}`);
        [globalThis.store, globalThis.fileReader, globalThis.classifier, globalThis.selection, globalThis.pool, globalThis.prompt, globalThis.settings, globalThis.storage, globalThis.guard] = await Promise.all([
            moduleAt('externalWorldBook/store.js'), moduleAt('externalWorldBook/fileReader.js'),
            moduleAt('externalWorldBook/classifier.js'), moduleAt('externalWorldBook/selectionState.js'),
            moduleAt('externalWorldBook/externalPool.js'), moduleAt('promptBuilder.js'), moduleAt('settings.js'), moduleAt('storage.js'), import('/guard.js'),
        ]);
    }, { base, cohort });
    await load();
    const seeded = await page.evaluate(async () => {
        const raw = { entries: Object.fromEntries(Array.from({ length: 45 }, (_, index) => [index, {
            uid: index, comment: `${index % 2 ? '主题' : '展现'}${index + 1} 原创纸上花园`,
            key: [index % 2 ? '主题元素' : '展现形式'],
            content: index % 2 ? '园丁以不同选择重新认识纸上花园的四季。' : '折页图鉴以花瓣页签连接标本、观察记录和季节索引。',
        }])) };
        const book = await fileReader.readLocalWorldBookFile(new File([JSON.stringify(raw)], '原创纸上花园展现与主题母本库.json', { type: 'application/json', lastModified: 1750000000000 }));
        const selected = selection.createWholeBookSelection(book);
        const draft = classifier.createExternalWorldBookClassificationDraft(book, selected.selectedIds);
        const snapshot = store.prepareExternalLibrarySnapshot(book, draft, { enabled: true });
        await store.saveExternalLibrarySnapshot(snapshot);
        return { entries: snapshot.entries.length, ids: snapshot.entries.map(row => row.externalId.length) };
    });
    assert.equal(seeded.entries, 45);
    assert.ok(seeded.ids.every(length => length > 128));
    // A real navigation discards module-local pools while preserving IDB.
    await page.reload();
    await load();
    const result = await page.evaluate(async () => {
        const check = (condition, message) => { if (!condition) throw new Error(message); };
        let entryGetAll = 0;
        let indexGets = 0;
        const originalAll = IDBObjectStore.prototype.getAll;
        const originalGet = IDBIndex.prototype.get;
        IDBObjectStore.prototype.getAll = function (...args) { if (this.name === 'entries') entryGetAll += 1; return originalAll.apply(this, args); };
        IDBIndex.prototype.get = function (...args) { if (this.name === 'byExternalId') indexGets += 1; return originalGet.apply(this, args); };
        check(pool.getExternalPoolSnapshot().themeCount === 0, 'reload must start with cold pool');
        await store.hydrateExternalPoolMetadata();
        check(store.getExternalPoolHydrationStatus().hydrated, 'metadata ready');
        check(store.getExternalPoolHydrationStatus().enabledMetadataRebuildRequired.length === 0, 'saved metadata needs no rebuild');
        check(pool.getExternalPoolSnapshot().themeCount + pool.getExternalPoolSnapshot().formatCount === 45, 'all eligible original entries restored');
        let successfulPlans = 0;
        for (const mode of ['independent', 'normal']) for (const dynamic of [false, true]) for (const count of [1, 2, 3, 4, 5]) {
            host.chatId = `original-${mode}-${dynamic}-${count}`;
            const scope = `scope-${mode}-${dynamic}-${count}`;
            const st = { ...structuredClone(settings.defaultSettings), enabled: true, autoRabbitMirrorInjection: true, mode: 'all',
                rabbitMirrorFaceCount: count, generationSource: mode, forceVisualScenery: dynamic,
                themesMin: 1, themesMax: 1, formatsMin: 1, formatsMax: 1, avoidRepeat: false, blacklistEnabled: false,
                externalWorldBookRandomEnabled: true, externalWorldBookMixMode: 'external-only' };
            const sourceHash = 'original-source';
            const plan = prompt.planRabbitMirrorPromptDetails(st, mode, null, scope, { chat: host.chat,
                batchIdentity: { mesid: 0, swipeId: 0, sourceHash } });
            const owner = { chatKey: storage.getCurrentChatKey(), generationScopeKey: scope, index: 0, swipe: 0, sourceHash };
            const before = indexGets;
            const rows = await store.getSelectedExternalEntries(plan.selectedExternalIds);
            check(indexGets - before === new Set(plan.selectedExternalIds).size, 'exact one index read per selected external ID');
            check(rows.size === plan.selectedExternalIds.length, 'all and only selected rows');
            const rendered = prompt.renderRabbitMirrorPromptPlan(plan, rows);
            check((rendered.metadata.faces?.length || 1) === count, 'all requested faces rendered');
            if (count > 1) {
                check(guard.independentPromptBatchSignature(plan.batchPlan, owner) === guard.independentPromptBatchSignature(rendered.batchPlan, owner), 'exact owner batch survives real raw await and rendering');
                check(storage.markPendingBatchAttempt(rendered.batchPlan), 'single attempt accepts exact persisted long IDs');
                check(storage.releasePendingComboBatch(rendered.batchPlan), 'owned batch release');
                let rejected = false;
                try { guard.independentPromptBatchSignature(rendered.batchPlan, { ...owner, sourceHash: 'changed' }); } catch { rejected = true; }
                check(rejected, 'changed source remains failclosed');
            }
            rows.clear(); successfulPlans += 1;
        }
        const library = (await store.listExternalLibraries())[0];
        const entry = pool.getExternalPoolSnapshot().themesByLibrary[0].ids[0];
        await store.setExternalLibraryEnabled(library.libraryId, false);
        let stopped = false;
        try { await store.getSelectedExternalEntries([entry]); } catch (error) { stopped = error.code === 'WORLD_BOOK_ENTRY_STATE_CONFLICT'; }
        check(stopped, 'disabled library still rejects the exact previously selected ID');
        check(entryGetAll === 0, 'no generation/hydration raw getAll');
        return { successfulPlans, entryGetAll, indexGets, disabledRejected: stopped };
    });
    assert.equal(result.successfulPlans, 20);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: 'passed', ...result, realIndexedDB: true, originalEntries: 45, providerRequests: 0, guard: 'production exact batch signature', notVerified: ['real SillyTavern lifecycle', 'iPhone Safari', 'model aesthetic quality'] }));
} finally {
    await browser?.close();
    await new Promise(done => server.close(done));
}
