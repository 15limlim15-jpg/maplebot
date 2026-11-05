const el=document.getElementById('tabs'),error=document.getElementById('error');
const msg=x=>chrome.runtime.sendMessage(x);
async function refresh(){try{
 const r=await msg({type:'GET_ALL'});if(r.error)throw Error(r.error);
 el.replaceChildren();if(!r.tabs.length){el.textContent='אין לשוניות פתוחות של Mesos.watch';return;}
 for(const t of r.tabs){
  const box=document.createElement('div');box.className='tab';
  const title=document.createElement('div');title.className='title';title.textContent=t.watchLabel||'Mesos.watch — ללא שם חפץ';box.append(title);
  const info=document.createElement('small'),s=t.status;
  info.textContent=t.watched?(s?.error?`⚠️ ${s.error}`:`${s?.status||'ממתין'} • עסקאות שנשלחו: ${s?.alerts||0}`):'לא במעקב';box.append(info);
  const label=document.createElement('label');label.textContent='💰 מחיר יעד (Mesos):';label.style.display='block';label.style.fontSize='12px';box.append(label);
  const input=document.createElement('input');input.type='text';input.placeholder='Enter target price (e.g. 22000, 300k, 1m)';input.value=t.watched?(s.targetPrice??''):'';input.dir='ltr';input.style.cssText='width:95%;padding:9px;margin:7px 0;background:#111827;color:white;border:1px solid #526079;border-radius:6px';box.append(input);
  const b=document.createElement('button');b.textContent=t.watched?'עצור מעקב':'הפעל Deals Only';if(t.watched)b.className='stop';
  b.onclick=async()=>{error.textContent='';b.disabled=true;const v=await msg({type:t.watched?'STOP_TAB':'START_TAB',tabId:t.id,targetPrice:input.value});if(v.error)error.textContent=v.error;await refresh();};box.append(b);
  if(t.watched){const save=document.createElement('button');save.textContent='עדכן מחיר יעד';save.style.marginInlineStart='8px';save.onclick=async()=>{error.textContent='';const v=await msg({type:'UPDATE_TARGET',tabId:t.id,targetPrice:input.value});if(v.error)error.textContent=v.error;await refresh();};box.append(save);}
  el.append(box);
 }
}catch(e){error.textContent=e.message;}}
refresh(); // No automatic popup refresh: prevents overwriting an in-progress price entry.
