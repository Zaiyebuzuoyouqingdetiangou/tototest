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
const host = `export const event_types={}; export const eventSource={on(){},off(){},removeListener(){},removeEventListener(){},emit(){}};
export const extension_prompt_types={IN_CHAT:0}; export const extension_prompt_roles={SYSTEM:0,USER:1,ASSISTANT:2};
export function saveSettingsDebounced(){}; export function setExtensionPrompt(){}; export const chat=[]; export const chat_metadata={}; export const characters=[]; export const this_chid=0;
export function getCurrentChatId(){return 'synthetic-chat'}; export function getRequestHeaders(){return {}}; export async function saveChat(){};`;
const seams = {
    'src/independentApi.js': '\nexport const __replacementSeam={prepareIndependentReadyHtml,extractReadyFaceDetails,sealIndependentTextReplacementRecord,prepareStoredIndependentRecordHtml,saveRecordForSlot,writeStore,readStore,compactChatPersistedRecord,appendHistoryEntry,historyEntriesForSlot,historyPreviewDetails,recoveredFollowFaces,ensureExternalUi};',
    'src/outputSanitizer.js': '\nexport const __replacementSeam={captureRabbitMirrorInteractionResetSnapshot,restoreRabbitMirrorInteractionResetSnapshot};',
};
const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    if (path === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><main id="fixture"></main>'); return; }
    res.setHeader('Content-Type', 'text/javascript');
    if (path === '/script.js') { res.end(host); return; }
    if (path === '/scripts/extensions.js') { res.end('export const extension_settings=globalThis.__settings;'); return; }
    if (path.startsWith(base + '/')) {
        const name = decodeURIComponent(path.slice(base.length + 1));
        const file = resolve(root, name); const rel = relative(root, file);
        if (rel && !rel.startsWith('..') && !isAbsolute(rel)) { try { res.end(readFileSync(file, 'utf8') + (seams[name] || '')); return; } catch {} }
    }
    res.writeHead(404); res.end();
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
try {
    browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const result = await page.evaluate(async ({ base, cohort, version }) => {
        globalThis.__settings = {}; globalThis.__rabbitMirrorRuntimeVersion = version;
        const settings = await import(`${base}/src/settings.js?rmv=${cohort}`);
        const independent = (await import(`${base}/src/independentApi.js?rmv=${cohort}`)).__replacementSeam;
        const sanitizer = (await import(`${base}/src/outputSanitizer.js?rmv=${cohort}`)).__replacementSeam;
        settings.getSettings().rabbitMirrorBannedWords = [{ find: '星港', replace: '星港新' }];
        const prepared = independent.prepareIndependentReadyHtml('<details open><summary>【兔子镜：甲星港】</summary><p>原创星港记录。</p><input type="checkbox" id="door"><label for="door">展开</label></details>');
        const faces = independent.extractReadyFaceDetails(prepared,true);
        document.getElementById('fixture').innerHTML = '<div id="chat"><div class="mes" mesid="0"><div class="mes_text"><toto data-rabbit-mirror="true"></toto></div></div></div>';
        const root = document.querySelector('toto'); root.append(faces[0]);
        const before = root.querySelector('summary').textContent;
        const captured = sanitizer.captureRabbitMirrorInteractionResetSnapshot(root);
        const restored = sanitizer.restoreRabbitMirrorInteractionResetSnapshot(root, null);
        const slot='synthetic-chat:0:0:original-source';
        const record=independent.sealIndependentTextReplacementRecord({html:prepared,sourceHash:'original-source',ts:Date.now()},slot);
        const compact=independent.compactChatPersistedRecord(record);
        independent.appendHistoryEntry(slot,compact);
        const store={}; independent.saveRecordForSlot(store,slot,compact); independent.writeStore(store);
        settings.getSettings().rabbitMirrorBannedWords=[{find:'a',replace:'aa'}];
        const firstRaw=independent.prepareIndependentReadyHtml('<details><summary>【兔子镜：a】</summary><p>a</p></details>');
        const freshSameBytes=independent.prepareIndependentReadyHtml(firstRaw);
        if(!freshSameBytes.includes('兔子镜：aaaa')) throw new Error('Fresh raw bytes were confused with an earlier processed output');
        settings.getSettings().rabbitMirrorBannedWords=[{find:'星港',replace:'星港新'}];
        const protocol=await import(`${base}/src/multifaceProtocol.js?rmv=${cohort}`);
        const proof=await import(`${base}/src/multifaceProof.js?rmv=${cohort}`);
        const storage=await import(`${base}/src/storage.js?rmv=${cohort}`);
        const ledger=await import(`${base}/src/followPartialResults.js?rmv=${cohort}`);
        const raw=Array.from({length:2},(_,i)=>`<toto data-rabbit-mirror="true" data-rm-face="${i+1}"><details><summary>【兔子镜：星港${i}】</summary><style>.scene{padding:20px;background:#d2ead8;color:#243142}.door{display:none}#gate:checked~.door{display:block}</style><section class="scene"><p>${'这一封星港信笺记录着曾经的发现和旅程。'.repeat(12)}</p><input type="checkbox" id="gate"><label for="gate">打开封签</label><div class="door">读完请合上封签。</div></section></details></toto>`).join('\n');
        const message={is_user:false,mes:raw,swipe_id:0,swipes:[raw]},ctx={chatId:'synthetic-follow',chat:[message]};
        globalThis.SillyTavern={getContext:()=>ctx};
        const roots=independent.recoveredFollowFaces(raw,{ctx,messageIndex:0,message});
        if(roots.length!==2) throw new Error('Synthetic follow scene failed quality');
        const partial=roots[0].outerHTML+'\n'+protocol.createMultifaceFailureSlot(1,'incomplete-face');
        const owner={chatKey:storage.getCurrentChatKey(ctx.chat),messageIndex:0,swipeId:0,sourceHash:proof.rabbitMirrorMultifaceSourceHash(raw),message};
        if(!ledger.saveFollowPartialResult(ctx.chat,0,owner,partial,[{faceIndex:1,code:'incomplete-face'}],settings.getSettings().rabbitMirrorBannedWords)) throw new Error('Synthetic follow save failed');
        localStorage.setItem('__replacementFollowFixture',JSON.stringify(message));
        return { captured, restored, before, after: root.querySelector('summary').textContent };
    }, { base, cohort, version: manifest.version });
    assert.equal(result.captured, true); assert.equal(result.restored, true);
    assert.ok(result.before.includes('甲星港新'));
    assert.ok(!result.after.includes('星港新新'), JSON.stringify(result));
    await page.reload();
    const cold=await page.evaluate(async ({base,cohort,version})=>{
        globalThis.__settings={}; globalThis.__rabbitMirrorRuntimeVersion=version;
        const settings=await import(`${base}/src/settings.js?rmv=${cohort}`);
        const seam=(await import(`${base}/src/independentApi.js?rmv=${cohort}`)).__replacementSeam;
        const slot='synthetic-chat:0:0:original-source';
        const rules=[{find:'星港',replace:'星港新'}]; settings.getSettings().rabbitMirrorBannedWords=rules;
        const record=seam.readStore()[slot];
        const restore=()=>seam.prepareStoredIndependentRecordHtml(record,slot);
        const first=restore();
        const history=seam.prepareStoredIndependentRecordHtml(seam.historyEntriesForSlot(slot)[0],slot);
        const preview=seam.historyPreviewDetails(seam.historyEntriesForSlot(slot)[0],-1,slot)?.textContent;
        document.querySelector('#fixture').innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_text"></div></div></div>';
        const mounted=seam.ensureExternalUi(document.querySelector('.mes'),slot,record.html,'ready','independent','original-source',record);
        const mountedTitle=mounted?.querySelector('summary')?.textContent;
        const message=JSON.parse(localStorage.getItem('__replacementFollowFixture'));
        const ctx={chatId:'synthetic-follow',chat:[message]};globalThis.SillyTavern={getContext:()=>ctx};
        const ledger=await import(`${base}/src/followPartialResults.js?rmv=${cohort}`);
        const partial=ledger.readFollowPartialResult(ctx.chat,0);
        const roots=seam.recoveredFollowFaces(partial.html,{ctx,messageIndex:0,message});
        const followTitle=roots[0]?.querySelector('summary')?.textContent;
        settings.getSettings().rabbitMirrorBannedWords=[{find:'星港',replace:'星港改'}];
        const changed=restore();
        const changedAgain=restore();
        // A model-controlled attribute cannot authenticate a fresh response.
        const hostile=seam.prepareIndependentReadyHtml('<details data-text-replacement-receipt="done"><summary>【兔子镜：乙星港】</summary><script>window.__bad=1</script><p onclick="alert(1)">星港</p></details>');
        return {first,history,preview,mountedTitle,followTitle,changed,changedAgain,hostile,bad:globalThis.__bad};
    },{base,cohort,version:manifest.version});
    assert.ok(cold.first.includes('甲星港新')&&!cold.first.includes('星港新新'),JSON.stringify(cold));
    assert.ok(cold.history.includes('甲星港新')&&!cold.history.includes('星港新新'));
    assert.ok(cold.preview.includes('甲星港新')&&!cold.preview.includes('星港新新'));
    assert.ok(cold.mountedTitle.includes('甲星港新')&&!cold.mountedTitle.includes('星港新新'));
    assert.equal(cold.followTitle,'【兔子镜：星港新0】');
    assert.ok(cold.changed.includes('甲星港改新')&&!cold.changed.includes('星港改改'));
    assert.equal(cold.changed,cold.changedAgain);
    assert.ok(cold.hostile.includes('乙星港改'));
    assert.ok(!cold.hostile.includes('<script')&&!cold.hostile.includes('onclick='));
    assert.equal(cold.bad,undefined);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: 'passed', checks: 9, result, coldReload:true, changedRules:'applied once to saved visible text, not raw restoration', boundary: 'Actual prepare/extract/reset/localStorage/compact/history/mount and follow partial recovery through page reload; isolated host fixture' }));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
