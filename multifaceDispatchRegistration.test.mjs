import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register(new URL('./hostLoader.mjs', import.meta.url));

// Real prompt -> picker -> storage. Only browser storage/entropy are fixtures;
// no model, transport, private transcript, external book, or test-only plan.
const cohort=JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url))).js.split('?rmv=')[1];
const moduleAt=name=>import(new URL(`../src/${name}?rmv=${cohort}`,import.meta.url));
const values=new Map();
globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
globalThis.sessionStorage=globalThis.localStorage;
const context={chatId:'synthetic-dispatch-registration',chat:[{is_user:false,mes:'An original completed paper garden.'}]};
globalThis.SillyTavern={getContext:()=>context};
let entropy=43210;
Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues(array){
    for(let i=0;i<array.length;i++){entropy=(Math.imul(entropy,1664525)+1013904223)>>>0;array[i]=entropy;}
    return array;
}}});
const [prompt,storage,settings,picker]=await Promise.all([moduleAt('promptBuilder.js'),moduleAt('storage.js'),moduleAt('settings.js'),moduleAt('picker.js')]);
const REGISTRY='rabbit_mirror_theater:pending_batch_registry:v2';
const ATTEMPTS='rabbit_mirror_theater:generation_attempts:v1';
const PITY='rabbit_mirror_theater:format_eligible_misses:v1';
const config=extra=>({...structuredClone(settings.defaultSettings),enabled:true,autoRabbitMirrorInjection:true,rabbitMirrorFaceCount:5,...extra});
const build=(scope,extra={})=>prompt.buildRabbitMirrorPromptDetails(config(extra),'independent',null,scope,{
    chat:context.chat,batchIdentity:{mesid:0,swipeId:0,sourceHash:'exact-completed-source'},
}).batchPlan;

test('idle normal and explicit new retry scopes register once and release without accumulating active batches',()=>{
    values.clear();
    for(const mode of ['integrated','all']) for(const samplingMode of ['classic','format_only']) for(const forceVisualScenery of [false,true]){
        for(let index=0;index<12;index++){
            const plan=build(`normal-${mode}-${samplingMode}-${forceVisualScenery}-${index}`,{mode,samplingMode,forceVisualScenery});
            assert.equal(plan.requestedFaceCount,5);
            assert.equal(storage.markPendingBatchAttempt(plan),true);
            const once=values.get(ATTEMPTS);
            assert.equal(storage.markPendingBatchAttempt(plan),true,'one in-flight plan is idempotent');
            assert.equal(values.get(ATTEMPTS),once,'same registration never ages attempts twice');
            assert.equal(JSON.parse(values.get(REGISTRY)).length,1);
            assert.equal(storage.releasePendingComboBatch(plan),true);
            assert.equal(storage.releasePendingComboBatch(plan),true,'finally after a prior cancellation stays idempotent');
            assert.deepEqual(JSON.parse(values.get(REGISTRY)),[]);
        }
    }
});

test('local quota availability is not dispatch authority: live foreign reservations and corrupt state fail closed',()=>{
    values.clear();
    const plans=Array.from({length:9},(_,index)=>build(`foreign-${index}`));
    for(const plan of plans.slice(0,8)) assert.equal(storage.markPendingBatchAttempt(plan),true);
    values.set(REGISTRY,JSON.stringify(JSON.parse(values.get(REGISTRY)).map(record=>({...record,registrySession:'synthetic-other-tab'}))));
    const full=values.get(REGISTRY);
    assert.equal(storage.findPendingComboBatchPlan(plans[0].identity).batchId,plans[0].batchId,'exact frozen plan can be read after a page change without claiming its dispatch lease');
    assert.equal(storage.markPendingBatchAttempt(plans[8]),false,'a ninth request cannot erase plausible in-flight work');
    assert.equal(values.get(REGISTRY),full);
    assert.equal(storage.releasePendingComboBatch({...plans[0],identity:{...plans[0].identity,sourceHash:'other-owner'}}),true);
    assert.equal(values.get(REGISTRY),full,'a wrong owner does not release another request');
    for(const plan of plans) assert.equal(storage.releasePendingComboBatch(plan),true);
    const plan=build('corrupt-pity');
    values.set(PITY,'{');
    const before=[...values];
    assert.equal(storage.markPendingBatchAttempt(plan),false);
    assert.deepEqual([...values],before,'malformed fairness state is not silently destroyed');
});

test('released frozen plans cannot become a second dispatch attempt through picker cache reuse',()=>{
    values.clear();
    const plan=build('same-frozen-operation');
    assert.equal(storage.markPendingBatchAttempt(plan),true);
    assert.equal(storage.releasePendingComboBatch(plan),true);
    const reused=build('same-frozen-operation');
    assert.equal(reused.batchId,plan.batchId,'the same operation does not silently redraw');
    const before=[...values];
    assert.equal(storage.markPendingBatchAttempt(reused),false,'terminal attempt requires a new explicit retry scope/lease');
    assert.deepEqual([...values],before);
    const retry=build('explicit-new-operation');
    assert.notEqual(retry.batchId,plan.batchId);
    assert.equal(storage.markPendingBatchAttempt(retry),true);
    assert.equal(storage.releasePendingComboBatch(retry),true);
});

test('plan creation reports fixed input, identity, duplicate-ID, fairness and size rejections without private data',()=>{
    values.clear();
    const plan=build('creation-diagnostics');
    const combos=plan.faces.map(face=>face.combo);
    const cases=[
        [[],plan.identity,{},'BATCH_PLAN_INPUT_INVALID'],
        [combos,{...plan.identity,sourceHash:''},{},'BATCH_PLAN_IDENTITY_INVALID'],
        [[{themeIds:['PRIVATE_TITLE','PRIVATE_TITLE'],formatIds:[]},combos[1]],plan.identity,{},'BATCH_PLAN_DUPLICATE_ID'],
        [[{themeIds:[],formatIds:[]},combos[1]],plan.identity,{},'BATCH_PLAN_COMBO_INVALID'],
        [combos,plan.identity,{eligibleFormatIds:'PRIVATE_BODY'},'BATCH_PLAN_INVALID'],
        [[{...combos[0],privateBody:'PRIVATE_BODY'.repeat(30000)},combos[1]],plan.identity,{},'BATCH_PLAN_TOO_LARGE'],
    ];
    for(const [input,identity,fairness,expected] of cases){
        const reasons=[];
        const before=[...values];
        assert.equal(storage.createPendingComboBatchPlan(input,identity,fairness,{onRejected:code=>reasons.push(code)}),null);
        assert.deepEqual(reasons,[expected]);
        assert.doesNotMatch(JSON.stringify(reasons),/PRIVATE/);
        assert.deepEqual([...values],before);
    }
    assert.equal(storage.createPendingComboBatchPlan([],null,{}, {onRejected(){throw new Error('diagnostic callback');}}),null);
});

test('dispatch rejection codes distinguish local capacity, owner conflict, fairness and terminal replay',()=>{
    values.clear();
    const plan=build('dispatch-diagnostics');
    const rejected=(input,expected)=>{
        const reasons=[];
        const before=[...values];
        assert.equal(storage.markPendingBatchAttempt(input,{onRejected:code=>reasons.push(code)}),false);
        assert.deepEqual(reasons,[expected]);
        assert.deepEqual([...values],before,'diagnosis must not modify failed state');
    };
    rejected(null,'BATCH_PLAN_INVALID');
    rejected({...plan,identity:{...plan.identity,sourceHash:''}},'BATCH_PLAN_IDENTITY_INVALID');
    rejected({...plan,identity:{kind:'generation-operation',chatKey:'safe',generationScopeKey:'safe',operationId:'safe',generationType:'normal',settingsKey:'safe',preview:true}},'BATCH_PREVIEW_NOT_DISPATCHABLE');
    values.set(REGISTRY,'{');
    rejected(plan,'BATCH_REGISTRY_UNREADABLE');
    values.clear();
    assert.equal(storage.markPendingBatchAttempt(plan),true);
    rejected({...plan,identity:{...plan.identity,sourceHash:'other-owner'}},'BATCH_ID_CONFLICT');
    for(let index=0;index<7;index++) assert.equal(storage.markPendingBatchAttempt(build(`diagnostic-full-${index}`)),true);
    rejected(build('diagnostic-full-overflow'),'BATCH_REGISTRY_CAPACITY');
    values.clear();
    values.set(PITY,'{');
    rejected(plan,'BATCH_FAIRNESS_STATE_INVALID');
    values.clear();
    rejected({...plan,fairness:{eligibleFormatIds:['PRIVATE_UNLISTED_ID'],selectedFormatIds:[],validFormatIds:[]}},'BATCH_FAIRNESS_PLAN_MISMATCH');
    assert.equal(storage.markPendingBatchAttempt(plan),true);
    assert.equal(storage.releasePendingComboBatch(plan),true);
    rejected(plan,'BATCH_ATTEMPT_ALREADY_RECORDED');
    assert.equal(storage.markPendingBatchAttempt(null,{onRejected(){throw new Error('PRIVATE_CALLBACK');}}),false);
});

test('dispatch storage failures emit a safe fixed cause and never convert diagnostic callbacks into authority',()=>{
    values.clear();
    const plan=build('storage-failure-diagnostics');
    const original=globalThis.localStorage;
    const cases=[
        [{getItem(){throw new Error('PRIVATE_STORAGE');}},'BATCH_REGISTRY_UNREADABLE'],
        [{getItem(key){if(key===PITY)throw new Error('PRIVATE_STORAGE');return original.getItem(key);}},'BATCH_STORAGE_UNAVAILABLE'],
        [{setItem(){const error=new Error('PRIVATE_QUOTA');error.name='QuotaExceededError';throw error;}},'BATCH_STORAGE_QUOTA_EXCEEDED'],
        [{setItem(){throw new Error('PRIVATE_WRITE');}},'BATCH_STORAGE_WRITE_FAILED'],
        [{setItem(){}},'BATCH_STORAGE_READBACK_MISMATCH'],
    ];
    try{
        for(const [overrides,expected] of cases){
            values.clear();
            const reasons=[];
            globalThis.localStorage={...original,...overrides};
            assert.equal(storage.markPendingBatchAttempt(plan,{onRejected:code=>reasons.push(code)}),false);
            assert.deepEqual(reasons,[expected]);
            assert.deepEqual([...values],[],'failed registration rolls back owned writes only');
        }
    }finally{globalThis.localStorage=original;}
    const reasons=[];
    assert.equal(storage.markPendingBatchAttempt(plan,{onRejected:code=>reasons.push(code)}),true);
    assert.deepEqual(reasons,[],'success does not report rejection');
    assert.equal(storage.releasePendingComboBatch(plan),true);
});

test('registry byte ceiling and concurrent foreign writes remain protected with explicit rejection reasons',()=>{
    values.clear();
    const base=build('registry-byte-base');
    const large=base.faces.map(face=>({...face.combo,syntheticPayload:'x'.repeat(38000)}));
    const largePlans=Array.from({length:6},(_,index)=>storage.createPendingComboBatchPlan(large,{...base.identity,generationScopeKey:`registry-byte-${index}`}));
    assert.ok(largePlans.every(Boolean));
    for(const plan of largePlans.slice(0,5)) assert.equal(storage.markPendingBatchAttempt(plan),true);
    const reasons=[];
    const before=[...values];
    assert.equal(storage.markPendingBatchAttempt(largePlans[5],{onRejected:code=>reasons.push(code)}),false);
    assert.deepEqual(reasons,['BATCH_REGISTRY_TOO_LARGE']);
    assert.deepEqual([...values],before);
    values.clear();
    const plan=build('registry-concurrent');
    const original=globalThis.localStorage;
    let registryReads=0;
    globalThis.localStorage={...original,getItem(key){
        if(key===REGISTRY && ++registryReads===2) values.set(REGISTRY,'[]');
        return original.getItem(key);
    }};
    const concurrent=[];
    try{
        assert.equal(storage.markPendingBatchAttempt(plan,{onRejected:code=>concurrent.push(code)}),false);
        assert.deepEqual(concurrent,['BATCH_STORAGE_CHANGED']);
        assert.deepEqual([...values],[[REGISTRY,'[]']],'do not roll back a foreign value we did not write');
    }finally{globalThis.localStorage=original;}
});

test('production picker distinguishes invalid identity, oversized signature and exhausted candidate pool',async()=>{
    values.clear();
    const run=(st,scope,ctx,expected)=>assert.throws(()=>picker.pickCombinationBatch(st,scope,ctx,5),error=>{
        assert.equal(error.code,'MULTIFACE_PLAN_UNAVAILABLE');
        assert.equal(error.reasonCode,expected);
        assert.ok(error.message.includes(expected),'builtin plan failures must expose the fixed reason in the displayed message too');
        assert.doesNotMatch(error.message,/PRIVATE/);
        return true;
    });
    const ctx={chat:context.chat,batchPlanningOnly:true,batchIdentity:{mesid:0,swipeId:0,sourceHash:'complete-original-source'}};
    run(config(),'PRIVATE_SCOPE',{...ctx,batchIdentity:null},'BATCH_PLAN_IDENTITY_INVALID');
    run(config({blacklistedFormatIds:['PRIVATE'.repeat(2000)]}),'diagnostic-settings',ctx,'BATCH_SETTINGS_TOO_LARGE');
    const {PRESENTATION_FORMATS}=await import(new URL(`../data/structured/presentationIndex.js?rmv=${cohort}`,import.meta.url));
    run(config({samplingMode:'format_only',blacklistEnabled:true,blacklistedFormatIds:PRESENTATION_FORMATS.map(item=>item.id)}),'diagnostic-pool',ctx,'BATCH_CANDIDATE_POOL_EXHAUSTED');
    assert.deepEqual([...values],[],'planning failure sends no request and registers no attempt');
});
