// Jobs live in storage; popup closure never owns or cancels an operation.
const JOBS='autoSearchJobs';
let jobsQueue=Promise.resolve();
const jobsGet=async()=> (await chrome.storage.local.get(JOBS))[JOBS]||{};
function jobUpdate(id,patch){const run=jobsQueue.then(async()=>{const jobs=await jobsGet();jobs[id]={...jobs[id],...patch};await chrome.storage.local.set({[JOBS]:jobs});return jobs[id];});jobsQueue=run.catch(()=>{});return run;}
async function tabReady(id){const tab=await chrome.tabs.get(id);if(tab.status==='complete')return;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{chrome.tabs.onUpdated.removeListener(listener);reject(Error('טעינת הטאב נכשלה'));},25000);function listener(tabId,info){if(tabId===id&&info.status==='complete'){clearTimeout(timer);chrome.tabs.onUpdated.removeListener(listener);resolve();}}chrome.tabs.onUpdated.addListener(listener);chrome.tabs.get(id).then(t=>{if(t.status==='complete')listener(id,{status:'complete'});});});}
async function runJob(id,action){try{let job=(await jobsGet())[id];if(action==='discover'){await tabReady(job.tabId);const result=await chrome.tabs.sendMessage(job.tabId,{type:'AUTO_DISCOVER',itemName:job.itemName});if(!result||result.error)throw Error(result?.error||'אין תשובה מהטאב');await jobUpdate(id,{...result,state:'ready',error:''});}else{const stop=await watchAction({type:'STOP_TAB',tabId:job.tabId});if(stop?.error)throw Error(stop.error);const result=await chrome.tabs.sendMessage(job.tabId,{type:'AUTO_APPLY',job});if(!result||result.error)throw Error(result?.error||'החלת הפילטרים נכשלה');const started=await watchAction({type:'START_TAB',tabId:job.tabId,targetPrice:job.targetPrice});if(!started?.ok)throw Error(started?.error||'הפעלת המעקב נכשלה');await jobUpdate(id,{state:'monitoring',error:''});}}catch(e){await jobUpdate(id,{state:'error',error:e.message});}}
const activeJobs=new Set();
function launch(id,action){activeJobs.add(id);runJob(id,action).finally(()=>activeJobs.delete(id));}
// A terminated worker cannot safely resume an unverified operation.
const recover=jobsGet().then(async jobs=>{for(const [id,j] of Object.entries(jobs))if(['discovering','applying'].includes(j.state))await jobUpdate(id,{state:'error',error:'הפעולה הופסקה. נסה שוב; המעקב לא אושר.'});});
chrome.runtime.onMessage.addListener((m,s,reply)=>{if(!m.type?.startsWith('AUTO_'))return; (async()=>{await recover;
if(m.type==='AUTO_JOBS')return {jobs:Object.values(await jobsGet())};
if(m.type==='AUTO_NEW'){const name=String(m.itemName||'').trim();if(!name)throw Error('יש להזין שם חפץ');const tab=await chrome.tabs.create({url:'https://mesos.watch/',active:false});const id=crypto.randomUUID();await jobUpdate(id,{id,tabId:tab.id,itemName:name,state:'discovering',values:{},targetPrice:'',fields:[],error:''});launch(id,'discover');return {ok:true,id};}
const job=(await jobsGet())[m.id];if(!job)throw Error('החיפוש לא נמצא');if(activeJobs.has(m.id))throw Error('הפעולה עדיין מתבצעת');
if(m.type==='AUTO_SAVE'){await jobUpdate(m.id,{values:m.values,targetPrice:m.targetPrice});return {ok:true};}
if(m.type==='AUTO_START'){if(!job.fields.length)throw Error('יש לזהות פילטרים תחילה');if(!(parseMesos(m.targetPrice)>0))throw Error('מחיר יעד לא תקין');await jobUpdate(m.id,{state:'applying',values:m.values,targetPrice:m.targetPrice,error:''});launch(m.id,'apply');return {ok:true};}
if(m.type==='AUTO_RETRY'){await jobUpdate(m.id,{state:'discovering',error:''});launch(m.id,'discover');return {ok:true};}
if(m.type==='AUTO_STOP'){const result=await watchAction({type:'STOP_TAB',tabId:job.tabId});if(result?.error)throw Error(result.error);await jobUpdate(m.id,{state:'paused'});return {ok:true};}
if(m.type==='AUTO_FOCUS'){await chrome.tabs.update(job.tabId,{active:true});return {ok:true};}
throw Error('Unknown search action');})().then(reply).catch(e=>reply({error:e.message}));return true;});
chrome.tabs.onRemoved.addListener(id=>{jobsGet().then(async jobs=>{for(const job of Object.values(jobs))if(job.tabId===id)await jobUpdate(job.id,{state:'closed',error:'הטאב נסגר. פתח חיפוש חדש.'});});});
