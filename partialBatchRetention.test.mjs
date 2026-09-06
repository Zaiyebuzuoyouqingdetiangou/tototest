import assert from 'node:assert/strict';
import { register } from 'node:module';
register(new URL('./hostLoader.mjs', import.meta.url));
const values=new Map();
globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
globalThis.sessionStorage=globalThis.localStorage;
const context={chatId:'original-partial-fixture',chat:[{is_user:true,mes:'User-owned synthetic input'}]};
globalThis.SillyTavern={getContext:()=>context};
const storage=await import('../src/storage.js');
const guard=await import('../src/generationGuard.js');
const protocol=await import('../src/multifaceProtocol.js');
const ledger=await import('../src/followPartialResults.js');
const sourceHash=(await import('../src/multifaceProof.js')).rabbitMirrorMultifaceSourceHash;
const face=index=>`<toto data-rabbit-mirror="true" data-rm-face="${index+1}"><details><summary>【兔子镜：原创第${index+1}面】</summary><p>独立的合成内容${index}</p></details></toto>`;
const makePlan=id=>storage.createPendingComboBatchPlan(Array.from({length:5},(_,index)=>({themeIds:[`T.${index}`],formatIds:[`F.${index}`],samplingMode:'classic'})),
 {kind:'generation-operation',chatKey:storage.getCurrentChatKey(context.chat),generationScopeKey:id,operationId:id,generationType:'normal',settingsKey:'{}',preview:false},
 {eligibleFormatIds:[],selectedFormatIds:[],validFormatIds:Array.from({length:5},(_,index)=>`F.${index}`)});
const plan=makePlan('partial');
assert.equal(storage.markPendingBatchAttempt(plan),true);
assert.equal(guard.registerRabbitMirrorFollowBatch(context.chat,'partial',plan),true);
const raw=[0,1,2,3].map(face).join('')+'<toto data-rabbit-mirror="true" data-rm-face="5"><details>';
context.chat.push({is_user:false,mes:raw,swipe_id:0});
assert.equal(guard.getRabbitMirrorFollowBatchSources(context.chat).length,0,'a streaming incomplete prefix is not complete');
const set=guard.getRabbitMirrorFollowBatchSources(context.chat,{terminalMessageIndexes:[1]})[0];
assert.equal(set.faces.length,5);
assert.equal(set.faces[4].failure.faceIndex,4);
assert.equal(set.faces[4].failure.code,'unclosed-face');
const scans=[0,1,2,3].map(faceIndex=>({faceIndex,signature:`valid-${faceIndex}`})).concat(null);
assert.equal(storage.commitPendingComboBatch(scans,{batchId:plan.batchId,identity:plan.identity}),false,'partial commit needs explicit terminal disposition');
assert.equal(storage.commitPendingComboBatch(Array(5).fill(null),{batchId:plan.batchId,identity:plan.identity,partial:true}),false,'all failed is never successful');
const sparse=Array(5);sparse[0]={faceIndex:0};
assert.equal(storage.commitPendingComboBatch(sparse,{batchId:plan.batchId,identity:plan.identity,partial:true}),false,'holes do not count as approved failures');
const failed=[{faceIndex:4,status:'failed',code:'unclosed-face'}];
const html=[0,1,2,3].map(face).concat(protocol.createMultifaceFailureSlot(4,'unclosed-face')).join('\n');
assert.equal(ledger.saveFollowPartialResult(context.chat,1,set.owner,html,failed),true);
assert.equal(guard.commitRabbitMirrorFollowBatch(plan.batchId,context.chat,scans,{...set.owner,partial:true}),true);
const history=JSON.parse(values.get('rabbit_mirror_theater:last_combo:v11'));
assert.deepEqual(history.filter(item=>item.batchId===plan.batchId).map(item=>item.faceIndex),[0,1,2,3],'failed index is absent from success/cooling history');
assert.equal(context.chat[1].mes,raw,'host正文 is not rewritten');
assert.equal(ledger.readFollowPartialResult(context.chat,1).html,html);
const changedOwner={...set.owner,sourceHash:'not-this-source'};
assert.equal(ledger.saveFollowPartialResult(context.chat,1,changedOwner,html,failed),false,'stale source cannot write');
context.chat[1].swipe_id=1;
assert.equal(ledger.readFollowPartialResult(context.chat,1),null,'swipe cannot inherit another outcome');
context.chat[1].swipe_id=0;
context.chat[1].mes=raw+'new正文';
assert.equal(ledger.readFollowPartialResult(context.chat,1),null,'edited source cannot inherit another outcome');
context.chat[1].mes=raw;
const key='rabbit_mirror_follow_partial_results_v1';
const goodRaw=values.get(key);
const forged=JSON.parse(goodRaw);forged[0].html=forged[0].html.replace('其他成功面已保留','<script>bad()</script>其他成功面已保留');
values.set(key,JSON.stringify(forged));
assert.equal(ledger.readFollowPartialResult(context.chat,1),null,'local failure slot marker is not authorization for arbitrary content');
values.set(key,goodRaw);
assert.equal(ledger.readFollowPartialResult(context.chat,1).sourceHash,sourceHash(raw));
assert.equal(ledger.saveFollowPartialResult(context.chat,1,set.owner,[0,1,2,3,4].map(face).join('\n'),[]),false,'initial save cannot silently install a complete override');
assert.equal(ledger.replaceFollowPartialResultFace(context.chat,1,set.owner,{expectedHtml:html,faceIndex:0,html:face(0)}),null,'ordinary successful follow faces are not a retry target');
assert.equal(ledger.replaceFollowPartialResultFace(context.chat,1,set.owner,{expectedHtml:'stale html',faceIndex:4,html:face(4)}),null,'late request cannot replace newer local result');
assert.equal(ledger.replaceFollowPartialResultFace(context.chat,1,set.owner,{expectedHtml:html,faceIndex:4,html:face(0)}),null,'wrong ordinal cannot be merged');
const replacement=face(4);
const completed=ledger.replaceFollowPartialResultFace(context.chat,1,set.owner,{expectedHtml:html,faceIndex:4,html:replacement});
assert.equal(completed.completedAfterRetry,true);
assert.deepEqual(completed.failedFaces,[]);
assert.deepEqual(protocol.parseMultifaceOutput(completed.html).faces.slice(0,4).map(item=>item.html),protocol.parseMultifaceOutput(html).faces.slice(0,4).map(item=>item.html),'retry leaves sibling source bytes untouched');
assert.equal(ledger.replaceFollowPartialResultFace(context.chat,1,set.owner,{expectedHtml:html,faceIndex:4,html:replacement}),null,'duplicate late completion cannot overwrite again');
const reloadedLedger=await import('../src/followPartialResults.js?new-ledger-fixture');
assert.equal(reloadedLedger.readFollowPartialResult(context.chat,1).completedAfterRetry,true,'zero-failure retry result survives a new module cache');
assert.equal(context.chat[1].mes,raw,'explicit face retry does not rewrite host正文');
const budget=protocol.parseMultifaceOutput(face(0)+'x'.repeat(800000),{expectedCount:5});
assert.equal(protocol.recoverableMultifaceFrames(budget).length,0,'whole-response limits never become partial success');
assert.throws(()=>protocol.createMultifaceFailureSlot(5,'bad'),RangeError);
assert.doesNotMatch(protocol.createMultifaceFailureSlot(0,'<script>bad()</script>'),/<script>/);
// The strict parser stops on the first malformed suffix; recovery must not
// bypass aggregate limits hidden later in that discarded suffix.
for(const [label,tail] of [
    ['tags','<br>'.repeat(4300)],
    ['attributes',Array.from({length:80},()=>'<div '+Array.from({length:160},(_,index)=>`a${index}="x"`).join(' ')+'></div>').join('')],
    ['depth','<div>'.repeat(74)],
    ['css-rules','<style>'+'.x{color:red}'.repeat(1450)+'</style>'],
    ['css-chars','<style>/*'+'x'.repeat(161000)+'*/</style>'],
    ['tag-chars','<div a="'+'x'.repeat(33000)+'">'],
]){
    const over=face(0)+'<toto data-rabbit-mirror="true" data-rm-face="2"><details></article>'+tail;
    assert.ok(protocol.parseMultifaceOutput(over,{expectedCount:5}).faces.length>0,'fixture proves a prefix exists before the first error');
    assert.equal(protocol.multifaceRecoveryWithinRawBudgets(over),false,`${label} overflow cannot be retained as a partial success`);
    context.chat=[{is_user:true,mes:`synthetic ${label}`}];
    const overflowPlan=makePlan(label);
    assert.equal(storage.markPendingBatchAttempt(overflowPlan),true);
    assert.equal(guard.registerRabbitMirrorFollowBatch(context.chat,label,overflowPlan),true);
    context.chat.push({is_user:false,mes:over,swipe_id:0});
    assert.equal(guard.getRabbitMirrorFollowBatchSources(context.chat,{terminalMessageIndexes:[1]}).length,0,`follow does not expose ${label} overbudget recovery`);
    guard.clearRabbitMirrorGenerationSnapshots();
}
// Every accepted local result is durable. Reaching a bound must refuse the
// new write atomically, never evict earlier partial or manually retried faces.
values.delete(key);
context.chatId='retention-capacity-fixture';
context.chat=Array.from({length:122},(_,index)=>({is_user:false,mes:`Original owned message ${index}`,swipe_id:0}));
const capacityOwner=index=>({chatKey:storage.getCurrentChatKey(context.chat),messageIndex:index,swipeId:0,
    sourceHash:sourceHash(context.chat[index].mes),message:context.chat[index]});
for(let index=0;index<120;index++){
    assert.equal(ledger.saveFollowPartialResult(context.chat,index,capacityOwner(index),html,failed),true);
    if(index===8) assert.equal(ledger.readFollowPartialResult(context.chat,0).html,html,'ninth small result preserves the first result');
}
const fullRaw=values.get(key);
assert.equal(JSON.parse(fullRaw).length,120);
assert.equal(ledger.saveFollowPartialResult(context.chat,120,capacityOwner(120),html,failed),false,'new owner is visibly refused at count capacity');
assert.equal(values.get(key),fullRaw,'capacity refusal leaves all persisted bytes unchanged');
for(let index=0;index<120;index++) assert.equal(ledger.readFollowPartialResult(context.chat,index).html,html);
const replacementAtCapacity=html.replace('独立的合成内容0','已检查的替换内容0');
assert.equal(ledger.saveFollowPartialResult(context.chat,0,capacityOwner(0),replacementAtCapacity,failed),true,'same owner can replace within full count capacity');
assert.equal(JSON.parse(values.get(key)).length,120);
assert.equal(ledger.readFollowPartialResult(context.chat,0).html,replacementAtCapacity);
const oversizedRecordArray=JSON.stringify([...JSON.parse(values.get(key)),JSON.parse(values.get(key))[0]]);
values.set(key,oversizedRecordArray);
assert.equal(ledger.readFollowPartialResult(context.chat,0),null,'over-limit input is rejected, not silently sliced');
assert.equal(ledger.saveFollowPartialResult(context.chat,0,capacityOwner(0),html,failed),false,'unreadable capacity state cannot be overwritten');
assert.equal(values.get(key),oversizedRecordArray);
values.delete(key);
const largeHtml=html.replace('独立的合成内容0','独立的合成内容0'+'原创长文本'.repeat(5000));
let accepted=0;
for(;accepted<120;accepted++){
    const before=values.get(key);
    if(!ledger.saveFollowPartialResult(context.chat,accepted,capacityOwner(accepted),largeHtml,failed)){
        assert.equal(values.get(key),before,'aggregate character capacity refuses without changing any saved bytes');
        break;
    }
}
assert.ok(accepted>8&&accepted<120,'fixture reaches character limit before record-count limit');
assert.equal(JSON.parse(values.get(key)).length,accepted);
assert.equal(ledger.readFollowPartialResult(context.chat,0).html,largeHtml,'size capacity retains oldest result');
assert.equal(ledger.saveFollowPartialResult(context.chat,0,capacityOwner(0),html,failed),true,'smaller same-owner replacement succeeds near character capacity');
// Persistence receipts bind actual locally filtered bytes and exact face owner.
// A changed-rule retry cannot claim its untouched siblings used the new rules.
values.delete(key);
context.chatId='replacement-receipt-fixture';
context.chat=[{is_user:false,mes:'Original unmodified receipt fixture',swipe_id:0}];
const {filterRabbitMirrorVisibleTextValue}=await import('../src/bannedWords.js');
const {matchesRabbitMirrorTextReplacementReceipt:matchesReceipt}=await import('../src/replacementReceipt.js');
const firstRules=[{find:'甲',replace:'甲甲'}];
const nextRules=[{find:'乙',replace:'乙乙'}];
const firstText=filterRabbitMirrorVisibleTextValue('甲',firstRules).text;
const firstFrame=face(0).replace('独立的合成内容0',firstText);
const secondFailure=[{faceIndex:1,status:'failed',code:'unclosed-face'}];
const receiptHtml=firstFrame+'\n'+protocol.createMultifaceFailureSlot(1,'unclosed-face');
const receiptOwner=capacityOwner(0);
assert.equal(ledger.saveFollowPartialResult(context.chat,0,receiptOwner,receiptHtml,secondFailure),true);
assert.deepEqual(ledger.readFollowPartialResult(context.chat,0).textReplacementReceipts,[],'missing applied-rules attestation does not mint provenance');
assert.equal(ledger.saveFollowPartialResult(context.chat,0,receiptOwner,receiptHtml,secondFailure,firstRules),true);
const initialReceipt=ledger.readFollowPartialResult(context.chat,0);
const firstKey=ledger.followPartialResultFaceOwnerKey(receiptOwner,0);
assert.equal(matchesReceipt(initialReceipt.textReplacementReceipts[0],firstFrame,firstRules,firstKey),true);
assert.equal(initialReceipt.textReplacementReceipts[1],null,'fixed failed card gets no text-filter receipt');
assert.equal(matchesReceipt(initialReceipt.textReplacementReceipts[0],firstFrame+' ',firstRules,firstKey),false,'changed exact bytes cannot inherit provenance');
assert.equal(matchesReceipt(initialReceipt.textReplacementReceipts[0],firstFrame,firstRules,ledger.followPartialResultFaceOwnerKey(receiptOwner,1)),false,'neighbor owner cannot inherit provenance');
const secondText=filterRabbitMirrorVisibleTextValue('乙',nextRules).text;
const secondFrame=face(1).replace('独立的合成内容1',secondText);
const retriedReceipt=ledger.replaceFollowPartialResultFace(context.chat,0,receiptOwner,{expectedHtml:receiptHtml,faceIndex:1,html:secondFrame,appliedRules:nextRules});
assert.deepEqual(retriedReceipt.textReplacementReceipts[0],initialReceipt.textReplacementReceipts[0],'changed-rule retry preserves sibling receipt exactly');
assert.equal(matchesReceipt(retriedReceipt.textReplacementReceipts[0],firstFrame,nextRules,firstKey),false,'new rules do not falsely bless untouched siblings');
assert.equal(matchesReceipt(retriedReceipt.textReplacementReceipts[1],secondFrame,nextRules,ledger.followPartialResultFaceOwnerKey(receiptOwner,1)),true,'target receipt binds its actual applied rules');
const freshReceiptLedger=await import('../src/followPartialResults.js?fresh-receipt-fixture');
assert.deepEqual(freshReceiptLedger.readFollowPartialResult(context.chat,0).textReplacementReceipts,retriedReceipt.textReplacementReceipts,'per-face provenance survives a fresh module cache');
retriedReceipt.textReplacementReceipts[0].htmlHash='caller changed returned copy';
assert.deepEqual(ledger.readFollowPartialResult(context.chat,0).textReplacementReceipts[0],initialReceipt.textReplacementReceipts[0],'caller cannot mutate cached receipt through returned object');
console.log('partialBatchRetention: terminal gating, exact ownership, accepted-face retention, retry durability, no-eviction capacity and budget checks passed');
