// Standalone, offline Edge reproduction; run with node and an optional source root.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root=resolve(process.argv[2]||resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const {chromium}=createRequire(import.meta.url)('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const manifest=JSON.parse(readFileSync(resolve(root,'manifest.json'))); const cohort=manifest.js.split('?rmv=')[1];
const base='/scripts/extensions/third-party/rabbit';
const expose={
 'src/independentApi.js':'\nexport const __runtimeTest={recoveredFollowFaces,externalizeFollowMirror,restoreFollowInline,restoreFollowMirrorFromMessageSource,followRecoveryOwner,contextBundle,extractReadyDetails,independentSelectedFormatDescriptors,replaceExternalMultifaceFace,resayIndependentMirror};',
 'src/outputSanitizer.js':'\nexport const __runtimeTest={captureRabbitMirrorInteractionResetSnapshot,invalidateRabbitMirrorInteractionResetSnapshot};',
};
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Type','text/javascript; charset=utf-8');
 if(path==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><div id="chat"><div class="mes" mesid="0"><div class="mes_text"></div></div></div></body></html>');return;}
 if(path==='/script.js'){res.end('export const event_types={},eventSource={on(){},off(){},emit(){}},extension_prompt_types={IN_CHAT:0},extension_prompt_roles={SYSTEM:0};export const chat=[],characters=[],chat_metadata={};export function saveSettingsDebounced(){};export function getCurrentChatId(){return "fixture"};export function setExtensionPrompt(){};export function getRequestHeaders(){return {}};');return;}
 if(path==='/scripts/extensions.js'){res.end('export const extension_settings=globalThis.__hostSettings;');return;}
 if(!path.startsWith(base+'/')){res.writeHead(404);res.end();return;}
 const name=decodeURIComponent(path.slice(base.length+1)),file=resolve(root,name);if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
 try{let text=readFileSync(file,'utf8');if(name==='src/outputSanitizer.js')text=text.replace('function maintenanceRepairRootBudget(root) {','function maintenanceRepairRootBudget(root) { globalThis.__budgetWalks=(globalThis.__budgetWalks||0)+1;');res.end(text+(expose[name]||''));}catch{res.writeHead(404);res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage();await page.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());await page.goto(origin);
 const results=await page.evaluate(async({base,cohort,version})=>{
  globalThis.__hostSettings={};globalThis.__rabbitMirrorRuntimeVersion=version;
  const settings=await import(base+'/src/settings.js?rmv='+cohort), independent=await import(base+'/src/independentApi.js?rmv='+cohort), sanitizer=await import(base+'/src/outputSanitizer.js?rmv='+cohort);
  settings.getSettings().generationSource='follow';settings.getSettings().followDisplayMode='external';
  const raw=Array.from({length:5},(_,i)=>`<toto data-rabbit-mirror="true" data-rm-face="${i+1}"><details><summary>【兔子镜：花园${i}】</summary><style>.card{padding:20px;background:#d2ead8;color:#243142}.door{display:none}#gate:checked~.door{display:block}</style><section class="card"><p>${'这一封花园信笺记录着曾经的发现和旅程。'.repeat(12)}</p><input type="checkbox" id="gate"><label for="gate">打开封签</label><div class="door">读完请合上封签。</div></section></details></toto>`).join('\n');
  const message={is_user:false,mes:raw,swipe_id:0,swipes:[raw]},ctx={chatId:'fixture',chat:[message]};globalThis.SillyTavern={getContext:()=>ctx};
  const body=document.querySelector('.mes_text'),roots=independent.__runtimeTest.recoveredFollowFaces(raw,{ctx,messageIndex:0,message});
  if(roots.length!==5)throw Error('fixture recovery failed');body.append(...roots);
  globalThis.__budgetWalks=0;const first=sanitizer.__runtimeTest.captureRabbitMirrorInteractionResetSnapshot(roots[0]);const afterFirst=globalThis.__budgetWalks;
  for(let i=0;i<40;i++)sanitizer.__runtimeTest.captureRabbitMirrorInteractionResetSnapshot(roots[0]);
  const repeatedBudgetWalks=globalThis.__budgetWalks-afterFirst;
  const beforeColor=getComputedStyle(roots[0].querySelector('section')).backgroundColor;
  // Host message rendering routinely replaces safe DOM with serialized copies.
  body.replaceChildren(...roots.map(root=>root.cloneNode(true)));
  independent.__runtimeTest.externalizeFollowMirror(0,message);
  const host=document.querySelector('[data-rm-source="follow"]');
  const externalFaces=host?.querySelectorAll(':scope > details').length||0;
  const restored=host?independent.__runtimeTest.restoreFollowInline(host):false;
  const inlineFaces=body.querySelectorAll('toto').length;
  const input=body.querySelector('input');if(input)input.checked=true;
  independent.__runtimeTest.externalizeFollowMirror(0,message);
  const again=document.querySelector('[data-rm-source="follow"]');
  const checkedAfterMove=!!again?.querySelector('input')?.checked;
  const colorPreserved=getComputedStyle(again.querySelector('section')).backgroundColor===beforeColor;
  const beforeRejected=body.innerHTML;
  // An unrelated message object must not be allowed to trigger relocation.
  independent.__runtimeTest.externalizeFollowMirror(0,{...message});
  const foreignOwnerUntouched=body.innerHTML===beforeRejected;
  independent.__runtimeTest.restoreFollowInline(again);
  message.mes+=' 新的正文修订';
  const sourceRevisionRecaptured=sanitizer.__runtimeTest.captureRabbitMirrorInteractionResetSnapshot(body.querySelector('toto'));
  const large=body.querySelectorAll('toto')[1],section=large.querySelector('section');
  section.append(...Array.from({length:1300},()=>document.createElement('span')));
  const oversizedRejected=sanitizer.__runtimeTest.captureRabbitMirrorInteractionResetSnapshot(large)===false;
  const afterOversized=globalThis.__budgetWalks;
  for(let i=0;i<40;i++)sanitizer.__runtimeTest.captureRabbitMirrorInteractionResetSnapshot(large);
  const repeatedOversizedWalks=globalThis.__budgetWalks-afterOversized;
  message.mes+=' 再次修订';message.swipes[0]=message.mes;sanitizer.__runtimeTest.captureRabbitMirrorInteractionResetSnapshot(large);
  const revisedOversizedWalks=globalThis.__budgetWalks-afterOversized-repeatedOversizedWalks;
  sanitizer.__runtimeTest.invalidateRabbitMirrorInteractionResetSnapshot(large);
  const beforeRetry=globalThis.__budgetWalks;sanitizer.__runtimeTest.captureRabbitMirrorInteractionResetSnapshot(large);
  const invalidatedOversizedWalks=globalThis.__budgetWalks-beforeRetry;
  const replacement=large.cloneNode(true);large.replaceWith(replacement);
  const beforeReplacement=globalThis.__budgetWalks;sanitizer.__runtimeTest.captureRabbitMirrorInteractionResetSnapshot(replacement);
  const replacedOversizedWalks=globalThis.__budgetWalks-beforeReplacement;
  const retry=await import(base+'/src/followFaceRetry.js?rmv='+cohort),ledger=await import(base+'/src/followPartialResults.js?rmv='+cohort),protocol=await import(base+'/src/multifaceProtocol.js?rmv='+cohort),storage=await import(base+'/src/storage.js?rmv='+cohort),recipes=await import(base+'/src/blacklist.js?rmv='+cohort),proofs=await import(base+'/src/multifaceProof.js?rmv='+cohort);
  const retryEvidence=[];
  for(const mode of ['success','bridge-success','external-success','stale','connection-change','busy','disabled','auto-disabled','missing-recipe','bad-boundary','unsupported-api','bad-output','duplicate-click','provider-error']){
   localStorage.clear();body.replaceChildren();
   settings.getSettings().enabled=true;settings.getSettings().autoRabbitMirrorInjection=true;
   const original='原创正文：花园中留下的一封信。'+raw;
   message.mes=original;message.swipes=[original];message.swipe_id=0;
   ctx.mainApi='openai';ctx.chatCompletionSettings={chat_completion_source:'custom',custom_model:'synthetic',custom_url:'https://synthetic.invalid/v1'};
   const owner={chatKey:storage.getCurrentChatKey(ctx.chat),messageIndex:0,swipeId:0,sourceHash:proofs.rabbitMirrorMultifaceSourceHash(original),message};
   const frames=protocol.parseMultifaceOutput(raw).faces;
   const savedHtml=frames.map((face,i)=>i===1?protocol.createMultifaceFailureSlot(1,'incomplete-face'):face.html).join('\n');
   if(!ledger.saveFollowPartialResult(ctx.chat,0,owner,savedHtml,[{faceIndex:1,code:'incomplete-face'}]))throw Error('retry fixture ledger save failed');
   if(mode!=='missing-recipe')recipes.recordRabbitMirrorRecipe({chat:ctx.chat,chatKey:owner.chatKey,messageIndex:0,swipeId:0,message,metadata:{formatIds:['8.7'],faceCount:5,faces:frames.map(()=>({themeIds:[],formatIds:['8.7'],samplingMode:'classic'}))},source:'follow'});
   const mounted=independent.__runtimeTest.recoveredFollowFaces(savedHtml,{ctx,messageIndex:0,message});if(mounted.length!==5)throw Error('retry fixture recovery failed');
   const prose=document.createElement('p');prose.textContent='原创正文：花园中留下的一封信。';body.append(prose,...mounted);
   let target=mounted[1],neighbor=mounted[0];
   if(mode==='external-success'){independent.__runtimeTest.externalizeFollowMirror(0,message);const host=document.querySelector('[data-rm-source="follow"]');target=host.children[1];neighbor=host.children[0];}
   const neighborBytes=neighbor.outerHTML;neighbor.querySelector('input').checked=true;
   let calls=0,release,captured;
   ctx.generateRaw=async options=>{calls++;captured=options;if(mode==='duplicate-click')await new Promise(resolve=>{release=resolve;});if(mode==='stale'){message.mes+='changed';}if(mode==='connection-change')ctx.chatCompletionSettings.custom_model='changed';if(mode==='provider-error')throw Error('secret-provider-fixture');if(mode==='bad-output')return '<toto data-rm-face="1"><details>';return frames[1].html.replace('data-rm-face="2"','data-rm-face="1"').replace('花园1','重试完成的新信笺');};
   if(mode==='unsupported-api')ctx.mainApi='textgenerationwebui';
   if(mode==='disabled')settings.getSettings().enabled=false;
   if(mode==='auto-disabled')settings.getSettings().autoRabbitMirrorInjection=false;
   const deps={getContext:()=>ctx,hostBusy:()=>mode==='busy',maxRequestChars:120000,resolveOwner:()=>independent.__runtimeTest.followRecoveryOwner(body.closest('.mes')),
    context:(ctx,index)=>mode==='bad-boundary'?{targetVisibleChars:10,text:'Missing canonical context boundary'}:independent.__runtimeTest.contextBundle(ctx,index),extractReadyDetails:independent.__runtimeTest.extractReadyDetails,formatDescriptors:independent.__runtimeTest.independentSelectedFormatDescriptors,replaceExternalFace:independent.__runtimeTest.replaceExternalMultifaceFace};
   const task=mode==='bridge-success'?(async()=>{
    if(!independent.__runtimeTest.resayIndependentMirror(target,{mesid:0}))throw Error('follow bridge unhandled');
    for(let tick=0;tick<100;tick++){await new Promise(resolve=>setTimeout(resolve,5));if(ledger.readFollowPartialResult(ctx.chat,0)?.failedFaces.length===0)return {ok:true};}
    return {ok:false,error:'bridge did not commit'};
   })():retry.retryFollowFace(target,{},deps);
   if(mode==='duplicate-click'){for(let tick=0;tick<20&&!release;tick++)await new Promise(resolve=>setTimeout(resolve,0));const duplicate=await retry.retryFollowFace(target,{},deps);if(duplicate.ok)throw Error('duplicate retry accepted');release?.();}
   const result=await task;
   const shouldSucceed=mode==='success'||mode==='bridge-success'||mode==='external-success'||mode==='duplicate-click';
   if(result.ok!==shouldSucceed)throw Error('retry '+mode+': '+JSON.stringify(result));
   if(calls!==(['busy','disabled','auto-disabled','missing-recipe','bad-boundary','unsupported-api'].includes(mode)?0:1))throw Error('unexpected retry call count '+mode+':'+calls);
   if(!neighbor.isConnected||neighbor.outerHTML!==neighborBytes||!neighbor.querySelector('input').checked)throw Error('retry modified neighbor');
   if(mode!=='stale'&&message.mes!==original)throw Error('retry modified正文');
   if(captured&&(!captured.prompt.some(item=>item.content.includes('【当前聊天逐轮正文】'))||!captured.prompt.some(item=>item.content.includes('<兔子镜近输出短锁 data-source="independent-api-near-output">'))))throw Error('missing guarded context boundary');
   if(mode==='provider-error'&&result.error.includes('secret-provider-fixture'))throw Error('provider error leaked');
   if(shouldSucceed){const stored=ledger.readFollowPartialResult(ctx.chat,0);if(stored.failedFaces.length)throw Error('failed slot not cleared');document.querySelector('[data-rm-source="follow"]')?.remove();body.replaceChildren(prose);independent.__runtimeTest.restoreFollowMirrorFromMessageSource(body.closest('.mes'),message);if(body.querySelectorAll('toto').length!==5||!body.textContent.includes('重试完成的新信笺'))throw Error('completed retry reload failed');}
   retryEvidence.push({mode,calls,ok:result.ok});
  }
  return {first,repeatedBudgetWalks,externalFaces,restored,inlineFaces,checkedAfterMove,colorPreserved,foreignOwnerUntouched,sourceRevisionRecaptured,oversizedRejected,repeatedOversizedWalks,revisedOversizedWalks,invalidatedOversizedWalks,replacedOversizedWalks,retryEvidence};
 },{base,cohort,version:manifest.version});
 console.log(JSON.stringify(results,null,2));
 if(!results.first||results.repeatedBudgetWalks!==0||results.externalFaces!==5||!results.restored||results.inlineFaces!==5||!results.checkedAfterMove||!results.colorPreserved||!results.foreignOwnerUntouched||!results.sourceRevisionRecaptured)process.exitCode=1;
 if(!results.oversizedRejected||results.repeatedOversizedWalks!==0||results.revisedOversizedWalks!==1||results.invalidatedOversizedWalks!==1||results.replacedOversizedWalks!==1)process.exitCode=1;
}finally{await browser?.close();await new Promise(ok=>server.close(ok));}
