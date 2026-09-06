// Production mount/first-open regression: original local fixtures, no preactivation.
// Original synthetic scenes; loopback resources only. No model or live host calls.
// Run all four routes: no flags, --external, --follow, --follow --external.
// Optional first positional argument selects a different extracted source root.
// --diagnostic expects the old missing-first-use-binding behavior and invokes manual repair.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const root=resolve(process.argv.slice(2).find(arg=>!arg.startsWith('--'))||resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const expectReady=!process.argv.includes('--diagnostic');
const follow=process.argv.includes('--follow');
const external=process.argv.includes('--external');
const {chromium}=createRequire(import.meta.url)('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const manifest=JSON.parse(readFileSync(resolve(root,'manifest.json'))),cohort=manifest.js.split('?rmv=')[1],base='/scripts/extensions/third-party/rabbit';
const expose={
 'src/independentApi.js':'\nexport const __firstUse={mountExternalFaceDetails,ensureExternalTools,placeExternalHost};',
 'src/outputSanitizer.js':'\nexport const __firstUse={runMaintenanceUserRepair,runMaintenanceLegacyRescueLibrary};',
};
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Type','text/javascript; charset=utf-8');
 if(path==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><div id="chat"><div class="mes" mesid="0"><div class="mes_text"></div></div></div></body></html>');return;}
 if(path==='/script.js'){res.end('export const event_types={},eventSource={on(){},off(){},emit(){}},extension_prompt_types={IN_CHAT:0},extension_prompt_roles={SYSTEM:0};export const chat=[],characters=[],chat_metadata={};export function saveSettingsDebounced(){};export function getCurrentChatId(){return "fixture"};export function setExtensionPrompt(){};export function getRequestHeaders(){return {}};');return;}
 if(path==='/scripts/extensions.js'){res.end('export const extension_settings=globalThis.__hostSettings;');return;}
 if(!path.startsWith(base+'/')){res.writeHead(404);res.end();return;}
 const name=decodeURIComponent(path.slice(base.length+1)),file=resolve(root,name);if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
 try{let text=readFileSync(file,'utf8');if(name==='src/outputSanitizer.js')text=text.replace('function installIntelligentInteractionRescue(root) {','function installIntelligentInteractionRescue(root) { globalThis.__installCalls=(globalThis.__installCalls||0)+1;');res.end(text+(expose[name]||''));}catch{res.writeHead(404);res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const origin=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});await page.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());await page.goto(origin);
 const result=await page.evaluate(async({base,cohort,version,expectReady,follow,external})=>{
  globalThis.__hostSettings={};globalThis.__rabbitMirrorRuntimeVersion=version;globalThis.__installCalls=0;
  const settings=await import(base+'/src/settings.js?rmv='+cohort),ind=await import(base+'/src/independentApi.js?rmv='+cohort),san=await import(base+'/src/outputSanitizer.js?rmv='+cohort);
  settings.getSettings().generationSource=follow?'follow':'independent';
  settings.getSettings().independentDisplayMode=external?'external':'external_then_inline';
  const source=follow?'follow':'independent',shell=!follow||external;
  const scene=(i)=>`<toto data-rabbit-mirror="true" data-rm-face="${i+1}"><details><summary>【兔子镜：原创纸船${i+1}】</summary><style>.scene{padding:18px;color:#14382c;background:#e0edda}.answer{display:none}#gate:checked~.answer{display:block}.clicker{padding:12px;cursor:pointer}</style><section class="scene"><p>${'一只纸船载着庭院的回信，从树影间缓缓驶来。'.repeat(8)}</p>${i===0?'<input type="checkbox" id="gate"><label for="gate">打开本地封签</label><div class="answer">原生封签中的短笺。</div>':i===1?'<nav><input type="checkbox" id="gate"><label for="gate">打开跨层封签</label></nav><div class="answer">跨层封签中的短笺。</div>':'<button class="clicker" onclick="document.getElementById(\'letter\').style.display=\'block\'">展开纸船来信</button><div id="letter" class="answer">纸船带来的原创信笺。<button onclick="document.getElementById(\'letter\').style.display=\'none\'">收回信笺</button></div>'}</section></details></toto>`;
  const raw=Array.from({length:5},(_,i)=>scene(i)).join('\n');
  const message={is_user:false,mes:raw,swipe_id:0,swipes:[raw]},ctx={chatId:'first-use-fixture',chat:[message]};globalThis.SillyTavern={getContext:()=>ctx};
  const body=document.querySelector('.mes_text'),host=document.createElement('div');host.className='rabbit-mirror-external-shell';host.setAttribute('data-rabbit-mirror-external-shell','true');host.setAttribute('data-rabbit-mirror-external-source','true');Object.assign(host.dataset,{rmSource:source,rmState:'ready',rmPlacement:external?'external':'inline',rmKey:'fixture',rmSourceHash:'original-synthetic-source-hash',rmOwnerMesid:'0',rmOwnerSwipe:'0'});host.__rabbitMirrorIndependentSource=raw;body.append(host);
  if(!shell){host.removeAttribute('data-rabbit-mirror-external-shell');host.removeAttribute('data-rabbit-mirror-external-source');host.removeAttribute('class');for(const key of Object.keys(host.dataset))delete host.dataset[key];}
  const mount=()=>{
   if(shell)return ind.__firstUse.mountExternalFaceDetails(host,'fixture',source,raw);
   const template=document.createElement('template');template.innerHTML=raw;
   if(!san.sanitizeRabbitMirrorUntrustedTemplate(template))return false;
   const wasOpen=[...host.children].map(root=>!!root.querySelector('details')?.open);
   host.replaceChildren(...template.content.children);
   for(const [i,root] of [...host.children].entries())root.querySelector('details').open=wasOpen[i]||false;
   return true;
  };
  const tools=()=>shell?ind.__firstUse.ensureExternalTools(host):san.refreshRabbitMirrorToolsInScope(host);
  if(!mount())throw Error('synthetic mount rejected');
  if(shell&&!ind.__firstUse.placeExternalHost(body.closest('.mes'),host,'fixture',source))throw Error('production placement rejected');
  const placement={source,external,shell,inBody:body.contains(host),inChat:document.querySelector('#chat').contains(host),siblingOfMessage:host.parentElement===body.closest('.mes').parentElement,recorded:host.dataset.rmPlacement||'native-inline'};
  tools();
  const collapsedInstallCalls=globalThis.__installCalls;
  for(const details of host.children)details.querySelector('summary').click();
  // Beat requestAnimationFrame: the first internal click must not require a retry.
  if(expectReady)host.children[4].querySelector('section > button').click();
  const fastFirstTap=expectReady?getComputedStyle(host.children[4].querySelector('section > div')).display:null;
  await new Promise(r=>setTimeout(r,850));
  const read=()=>[...host.children].map((details,i)=>({face:i+1,checked:details.querySelector('input')?.checked??null,answer:getComputedStyle(details.querySelector('section > div')).display,handlersRemoved:!details.querySelector('[onclick]'),deferred:details.hasAttribute('data-rabbit-mirror-deferred-interaction-rescue'),scoped:details.dataset.rabbitMirrorInteractionScoped,repairButton:!!details.querySelector('[data-rabbit-mirror-maintenance-rabbit]')}));
  const before=read(),autoInstallCalls=globalThis.__installCalls;
  for(const [i,details] of [...host.children].entries())if(!expectReady||i!==4)(details.querySelector('label')||details.querySelector('section > button')).click();
  await new Promise(r=>setTimeout(r,180));
  const afterFirstClick=read();
  if(expectReady){
   for(let repeat=0;repeat<3;repeat++){
    for(const details of host.children)details.querySelector('summary').click();
    await new Promise(r=>requestAnimationFrame(r));
    for(const details of host.children)details.querySelector('summary').click();
    tools();
    await new Promise(r=>setTimeout(r,45));
   }
   const repeatedInstallCalls=globalThis.__installCalls-autoInstallCalls;
   const afterReopen=read();
   for(let i=2;i<5;i++)host.children[i].querySelector('section > div button').click();
   const afterReturn=read();
   // Reparse/mount creates new live DOM without listeners; it must initialize once again.
   if(!mount())throw Error('second synthetic mount rejected');
   tools();
   await new Promise(r=>setTimeout(r,850));
   for(const details of host.children)(details.querySelector('label')||details.querySelector('section > button')).click();
   await new Promise(r=>setTimeout(r,180));
   return {version,follow,placement,collapsedInstallCalls,autoInstallCalls,fastFirstTap,repeatedInstallCalls,remountInstallCalls:globalThis.__installCalls-autoInstallCalls,before,afterFirstClick,afterReopen,afterReturn,afterRemount:read()};
  }
  // Restore native checkbox to initial state, then enter the real manual repair callback.
  for(const details of host.children){const input=details.querySelector('input');if(input)input.checked=false;}
  const repaired=[];
  for(let i=1;i<5;i++){
   const details=host.children[i],button=details.querySelector('[data-rabbit-mirror-maintenance-rabbit]');
   if(!button)throw Error('maintenance entry missing');
   repaired.push(san.__firstUse.runMaintenanceUserRepair(details,button,'interaction'));
  }
  await new Promise(r=>setTimeout(r,550));
  const afterRepairBeforeClick=read(),manualInstallCalls=globalThis.__installCalls-autoInstallCalls;
  for(let i=1;i<5;i++){const details=host.children[i];(details.querySelector('label')||details.querySelector('section > button')).click();}
  await new Promise(r=>setTimeout(r,250));
  return {version,placement,collapsedInstallCalls,autoInstallCalls,manualInstallCalls,before,afterFirstClick,afterRepairBeforeClick,afterRepairClick:read(),repaired};
 },{base,cohort,version:manifest.version,expectReady,follow,external});
 console.log(JSON.stringify(result,null,2));
 assert.equal(result.before.length,5);
 assert.equal(result.placement.inChat,true,'all production placements stay within the chat boundary');
 if(external&&!follow){assert.equal(result.placement.inBody,false);assert.equal(result.placement.siblingOfMessage,true,'independent external shell must be a real message sibling');}
 if(follow)assert.equal(result.placement.inBody,true,'follow external keeps the original content lane');
 if(result.placement.shell)assert.equal(result.placement.recorded,external?'external':'inline');
 assert.notEqual(result.afterFirstClick[0].answer,'none','native CSS positive control should work without repair');
 if(expectReady){
  assert.equal(result.collapsedInstallCalls,0,'collapsed first mount must remain lazy');
  assert.notEqual(result.fastFirstTap,'none','a fast first internal click must work before the scheduled paint callback');
  assert.equal(result.autoInstallCalls,5,'initialize each requested live face exactly once');
  assert.ok(result.afterFirstClick.every(x=>x.answer!=='none'),'every first interaction must work without manual repair');
  assert.equal(result.repeatedInstallCalls,0,'reopen/tool refresh must not rescan the interaction library');
  assert.ok(result.afterReopen.every(x=>x.answer!=='none'),'reopen must preserve chosen states');
  assert.ok(result.afterReturn.slice(2).every(x=>x.answer==='none'),'authored close controls must still work');
  assert.equal(result.remountInstallCalls,5,'new serialized live roots must each rebind once');
  assert.ok(result.afterRemount.every(x=>x.answer!=='none'),'serialized remount must be usable without manual repair');
  console.log('PASS: lazy five-face first use, fast first tap, repeated reopen, natural return and serialized remount without manual activation.');
 }else{
  assert.equal(result.autoInstallCalls,0,'diagnostic expected first-open activation gap');
  assert.ok(result.afterFirstClick.slice(1).every(x=>x.answer==='none'),'diagnostic expected recoverable controls to remain inert');
  assert.ok(result.manualInstallCalls>0,'manual callback must actually install the runtime');
  assert.ok(result.afterRepairClick.slice(1).every(x=>x.answer!=='none'),'same controls must work after actual manual callback');
  console.log('CONFIRMED: native control works; 4 recoverable controls are inert before actual manual interaction repair and work after it. Offline desktop Edge evidence only.');
 }
}finally{await browser?.close();await new Promise(ok=>server.close(ok));}

