// Offline production event-chain benchmark. No provider or host data is loaded.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root=resolve(process.argv[2]||resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const {chromium}=createRequire(import.meta.url)('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const manifest=JSON.parse(readFileSync(resolve(root,'manifest.json'))),cohort=manifest.js.split('?rmv=')[1],base='/scripts/extensions/third-party/rabbit';
const calls=['maintenanceRepairRootBudget','getRenderedRabbitMirrorInteractionRoots','captureRabbitMirrorInteractionResetSnapshot','installIntelligentInteractionRescue','installMaintenanceRabbitsInScope','findMaintenanceTextClippingCandidates','applyCheckedVisualFallback','prepareLabeledCheckedVerification','getSelectedMessageSource','scheduleObservedChatInstall'];
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Type','text/javascript; charset=utf-8');
 if(path==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><style>body{margin:0;font:16px sans-serif}#chat{width:390px}toto{display:block;margin:20px 0}summary{padding:15px}section{padding:12px}label{display:block;padding:10px}article{padding:5px}.closed{display:none}</style></head><body><div id="chat"><div class="mes" mesid="0"><div class="mes_text"></div></div></div></body></html>');return;}
 if(path==='/script.js'){res.end('export const event_types={},eventSource={on(){},off(){},emit(){}},extension_prompt_types={IN_CHAT:0},extension_prompt_roles={SYSTEM:0};export const chat=[],characters=[],chat_metadata={};export function saveSettingsDebounced(){};export function getCurrentChatId(){return "fixture"};export function setExtensionPrompt(){};');return;}
 if(path==='/scripts/extensions.js'){res.end('export const extension_settings=globalThis.__hostSettings;');return;}
 if(!path.startsWith(base+'/')){res.writeHead(404);res.end();return;}
 const name=decodeURIComponent(path.slice(base.length+1)),file=resolve(root,name);if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
 try{let text=readFileSync(file,'utf8');if(name==='src/outputSanitizer.js'){
  for(const name of calls)text=text.replace(new RegExp('function '+name+'\\(([^\\n]*)\\) \\{'),match=>match+`globalThis.__calls && (globalThis.__calls.${name}=(globalThis.__calls.${name}||0)+1);`);
  text+='\nexport const __tapTest={installToolEntryDelegation,installChatMutationObserver,installMaintenanceRabbitsInScope,captureRabbitMirrorInteractionResetSnapshot,restoreRabbitMirrorInteractionResetSnapshot,rabbitMirrorInteractionResetSourceSignature};';
 }res.end(text);}catch{res.writeHead(404);res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});await page.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());await page.goto(origin);
 const results=await page.evaluate(async({base,cohort,version})=>{
  globalThis.__hostSettings={};globalThis.__rabbitMirrorRuntimeVersion=version;globalThis.__calls={};
  const settings=await import(base+'/src/settings.js?rmv='+cohort),sanitizer=await import(base+'/src/outputSanitizer.js?rmv='+cohort);
  const html=Array.from({length:5},(_,f)=>`<toto data-rabbit-mirror="true" data-rm-face="${f+1}"><details><summary>【兔子镜：原创花园${f+1}】</summary><style>${Array.from({length:8},(_,j)=>`#gate${f}-${j}:checked~.answer${j}{display:block}.answer${j}{display:none}`).join('')} .petal{animation:drift 8s ease-in-out infinite}@keyframes drift{50%{transform:translateY(2px)}}</style><section>${Array.from({length:8},(_,j)=>`<article><input type="checkbox" id="gate${f}-${j}"><label for="gate${f}-${j}">翻开第${j+1}封信</label><div class="answer${j}"><p>${'原创花园里留下一封信笺。'.repeat(10)}</p></div>${Array.from({length:20},(_,n)=>`<span class="note">第${n}格：${'庭院的风带来远方的消息。'.repeat(3)}</span>`).join('')}</article>`).join('')}<i class="petal">叶</i></section></details></toto>`).join('\n');
  const message={is_user:false,mes:html,swipe_id:0,swipes:[html]},ctx={chatId:'fixture',chat:[message]};globalThis.SillyTavern={getContext:()=>ctx};settings.getSettings().generationSource='follow';
  const body=document.querySelector('.mes_text');body.innerHTML=html;
  const roots=[...body.querySelectorAll('toto')];
  const t=performance.now();for(const root of roots)sanitizer.activateRabbitMirrorInteractionRescue(root);sanitizer.__tapTest.installMaintenanceRabbitsInScope(body);sanitizer.__tapTest.installToolEntryDelegation(document.querySelector('#chat'));sanitizer.__tapTest.installChatMutationObserver();
  const installMs=performance.now()-t;
  await new Promise(r=>setTimeout(r,250));
  let computed=0,queries=0,rects=0;const gcs=globalThis.getComputedStyle,qsa=Element.prototype.querySelectorAll,rect=Element.prototype.getBoundingClientRect;
  globalThis.getComputedStyle=function(...args){computed++;return gcs(...args)};Element.prototype.querySelectorAll=function(...args){queries++;return qsa.apply(this,args)};Element.prototype.getBoundingClientRect=function(...args){rects++;return rect.apply(this,args)};
  const events=[];
  for(const kind of ['expand','label','menu','collapse']){
   for(let repeat=0;repeat<2;repeat++)for(let face=0;face<5;face++){
    const root=roots[face],details=root.querySelector(':scope>details');
    if(kind==='label'&&!details.open)details.open=true;
    const target=kind==='label'?root.querySelector('label'):kind==='menu'?root.querySelector('[data-rabbit-mirror-maintenance-rabbit]'):details.querySelector(':scope>summary');
    if(!target)throw Error('fixture target missing '+kind);
    globalThis.__calls={};computed=queries=rects=0;
    const before=performance.now();target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));target.click();const dispatchMs=performance.now()-before;
    await new Promise(r=>setTimeout(r,280));
    events.push({kind,face,repeat,dispatchMs,computed,queries,rects,calls:{...globalThis.__calls},checked:!!root.querySelector('input').checked,menu:!!document.querySelector('[data-rabbit-mirror-maintenance-menu]')});
    document.querySelector('[data-rm-maintenance-action="close"]')?.click();
   }
  }
  const nodes=body.querySelectorAll('*').length;
  const signature=()=>sanitizer.__tapTest.rabbitMirrorInteractionResetSourceSignature(roots[0]);
  const initial=signature();globalThis.__calls={};signature();
  const warmSignatureReads=globalThis.__calls.getSelectedMessageSource||0;
  message.mes=message.mes.replace('原创花园1','原创花园甲');message.swipes[0]=message.mes;
  const sameLengthEditRejected=signature()!==initial;
  message.extra={display_text:message.mes.replace('原创花园甲','另一封信函')};
  const displaySignature=signature(),displayRevisionRejected=displaySignature!==initial;
  message.swipes.push(message.mes);message.swipe_id=1;
  const swipeRevisionRejected=signature()!==displaySignature;
  delete message.extra;
  message.mes=html.replace('原创花园1','主文回退源');
  message.swipes[0]=html;message.swipe_id='0';
  const untypedSwipeSignature=signature();message.swipe_id=0;
  const swipeTypeRevisionRejected=signature()!==untypedSwipeSignature;
  const clipText='原创长信：庭院里已经放晴，信纸留下雨水的印记。'.repeat(12);
  body.innerHTML=Array.from({length:4},(_,i)=>`<toto data-rabbit-mirror="true"><details><summary>【兔子镜：裁切验证${i}】</summary>${i===1?'<label>可控封面':''}<div class="test-clip" style="height:${i===3?'auto':'24px'};overflow:${i===3?'visible':'hidden'}"><p style="${i===2?'display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden':''}">${clipText}</p></div>${i===1?'</label>':''}</details></toto>`).join('');
  const clipRoots=[...body.querySelectorAll('toto')];
  for(const root of clipRoots)root.querySelector('summary').click();
  await new Promise(r=>setTimeout(r,200));
  const clipResults=clipRoots.map(root=>({height:root.querySelector('.test-clip').getBoundingClientRect().height,repaired:!!root.querySelector('[data-rm-text-clipping-item]')}));
  return {installMs,nodes,sourceChars:html.length,events,warmSignatureReads,sameLengthEditRejected,displayRevisionRejected,swipeRevisionRejected,swipeTypeRevisionRejected,clipResults};
 },{base,cohort,version:manifest.version});
 console.log(JSON.stringify(results,null,2));
 if(results.events.filter(e=>e.kind==='expand').some(e=>e.computed>50))throw Error('normal scene expand performed diagnostic-scale layout reads');
 if(results.events.filter(e=>e.kind==='label').reduce((n,e)=>n+(e.calls.getSelectedMessageSource||0),0)>1)throw Error('unchanged source was repeatedly decoded on the tap path');
 if(results.events.some(e=>e.kind==='label'&&e.checked!==(e.repeat===0)))throw Error('native checked interaction did not remain reversible');
 if(results.events.some(e=>e.kind==='menu'&&!e.menu))throw Error('maintenance menu did not open');
 if(results.warmSignatureReads||!results.sameLengthEditRejected||!results.displayRevisionRejected||!results.swipeRevisionRejected||!results.swipeTypeRevisionRejected)throw Error('source-signature cache lost exact revision isolation');
 if(!results.clipResults[0].repaired||results.clipResults[0].height<=24||results.clipResults.slice(1).some(r=>r.repaired))throw Error('automatic text repair lost clipping safety or preservation');
}finally{await browser?.close();await new Promise(ok=>server.close(ok));}
