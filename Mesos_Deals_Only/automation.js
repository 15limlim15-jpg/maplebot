// Conservative DOM adapter: unknown controls fail closed instead of guessing stat meanings.
(()=>{
const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
const visible=e=>!!e && !e.hidden && getComputedStyle(e).display!=='none' && getComputedStyle(e).visibility!=='hidden';
function wait(fn,timeout=15000){return new Promise((resolve,reject)=>{let observer,timer;const check=()=>{try{const value=fn();if(value){observer?.disconnect();clearTimeout(timer);resolve(value);}}catch(e){observer?.disconnect();clearTimeout(timer);reject(e);}};observer=new MutationObserver(check);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});timer=setTimeout(()=>{observer.disconnect();reject(Error('האתר לא הציג את הבקרה הצפויה בזמן. לא הופעל מעקב.'));},timeout);check();});}
function button(text,root=document){return [...root.querySelectorAll('button,[role=button],.mkchip')].find(e=>visible(e)&&text.test(norm(e.textContent)));}
function write(el,value){const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
function label(el){return norm(el.labels?.[0]?.textContent||el.getAttribute('aria-label')||el.placeholder||el.name||el.id);}
function controls(root){return [...root.querySelectorAll('input,select')].filter(e=>visible(e)&&!e.disabled&&!['hidden','submit','button','search'].includes(e.type));}
function describe(el,index){const type=el.tagName==='SELECT'?'select':el.type;return {key:el.id||el.name||'control-'+index,label:label(el),type,min:el.getAttribute('min'),max:el.getAttribute('max'),step:el.getAttribute('step'),options:type==='select'?[...el.options].map(o=>({value:o.value,label:norm(o.textContent)})):undefined, supported:['number','text','range','checkbox','select'].includes(type)};}
let opened=null;
async function panel(){const trigger=await wait(()=>button(/^\+?\s*Filter$/i));trigger.click();const root=await wait(()=>[...document.querySelectorAll('[role=dialog],dialog,[role=menu],.popover,.filter-panel,.filter-menu,[id*=filter],[class*=filter]')].filter(visible).find(e=>e!==trigger&&!e.contains(trigger)&&(controls(e).length||e.querySelector('button,[role=menuitem]'))));opened={root,trigger};return root;}
async function close(){if(opened){const {root,trigger}=opened;const closeButton=button(/^(close|cancel|done|×|✕)$/i,root);if(closeButton)closeButton.click();else if(visible(root))trigger.click();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait(()=>!root.isConnected||!visible(root),3000);opened=null;}const q=document.querySelector('#q');if(q){q.blur();q.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));}document.body.click();}
async function discover(name){try{
const q=await wait(()=>document.querySelector('#q'));write(q,name);
const exact=await wait(()=>[...document.querySelectorAll('[role=option],#qResults a,#qResults button,#qResults div,#searchResults a,#searchResults button,[class*=suggest] a,[class*=suggest] button,[class*=result] a,[class*=result] button')].find(e=>visible(e)&&norm(e.textContent).toLowerCase()===name.toLowerCase()));exact.click();
await wait(()=>norm(document.querySelector('#mkTitle')?.textContent).toLowerCase()===name.toLowerCase());
const root=await panel();let fields=controls(root).map(describe);
// Menus listing stat names are not themselves value controls. Inspect each real editor.
if(!fields.length){const names=[...root.querySelectorAll('button,[role=menuitem]')].map(e=>norm(e.textContent)).filter(s=>s&&!/^(close|cancel|apply|clear|reset|done|×)$/i.test(s));await close();fields=[];for(const name of names){const menu=await panel();const entry=[...menu.querySelectorAll('button,[role=menuitem]')].find(e=>norm(e.textContent)===name);if(!entry)throw Error('תפריט הפילטרים השתנה');entry.click();const editor=await wait(()=>[...document.querySelectorAll('[role=dialog],dialog,.popover,[id*=filter],[class*=filter]')].filter(visible).find(e=>controls(e).length));opened.root=editor;const group=controls(editor).map((el,i)=>({...describe(el,i),group:name}));fields.push(...group);await close();}}
if(!fields.length||fields.some(f=>!f.label))throw Error('לא נמצאו בקרות פילטרים מזוהות. נדרשת התאמת מבנה האתר.');
await close();return {itemName:name,url:location.href,fields};
}finally{await close();}}
async function apply(job){try{
if(norm(document.querySelector('#mkTitle')?.textContent).toLowerCase()!==job.itemName.toLowerCase())throw Error('הטאב אינו מציג את החפץ שנבחר');
for(const group of [...new Set(job.fields.map(f=>f.group||''))]){const selected=job.fields.filter(f=>(f.group||'')===group&&job.values[f.group+'|'+f.key]!==undefined&&job.values[f.group+'|'+f.key]!=='');if(!selected.length)continue;
let root=await panel();if(group){const entry=[...root.querySelectorAll('button,[role=menuitem]')].find(e=>norm(e.textContent)===group);if(!entry)throw Error('הפילטר אינו זמין: '+group);entry.click();root=await wait(()=>[...document.querySelectorAll('[role=dialog],dialog,.popover,[id*=filter],[class*=filter]')].filter(visible).find(e=>controls(e).length));opened.root=root;}
for(const field of selected){const el=controls(root).find((e,i)=>(e.id||e.name||'control-'+i)===field.key&&label(e)===field.label);if(!el||!field.supported)throw Error('בקרה לא נתמכת: '+field.label);const value=job.values[field.group+'|'+field.key];if(field.type==='select'&&!field.options.some(o=>o.value===value))throw Error('אפשרות לא תקינה');if(['number','range'].includes(field.type)){const n=Number(value);if(!Number.isFinite(n)||(field.min!==null&&n<Number(field.min))||(field.max!==null&&n>Number(field.max)))throw Error('ערך מחוץ לטווח: '+field.label);}if(field.type==='checkbox'){el.checked=!!value;el.dispatchEvent(new Event('change',{bubbles:true}));}else write(el,value);}
const applyButton=button(/^(apply|save|add|אישור|החל)$/i,root);if(!applyButton)throw Error('לא זוהה כפתור החלת פילטרים; המעקב לא הופעל');applyButton.click();await wait(()=>!root.isConnected||!visible(root));opened=null;
// Require visible filter chips as independent evidence that the site committed the filter.
await wait(()=>{const chips=norm(document.querySelector('#mkChips')?.textContent).toLowerCase();return selected.every(f=>chips.includes((group||f.label).toLowerCase())&&chips.includes(String(job.values[f.group+'|'+f.key]).toLowerCase()));},5000);
}return {ok:true,url:location.href};
}finally{await close();}}
chrome.runtime.onMessage.addListener((m,s,reply)=>{if(!['AUTO_DISCOVER','AUTO_APPLY'].includes(m.type))return; (m.type==='AUTO_DISCOVER'?discover(m.itemName):apply(m.job)).then(reply).catch(e=>reply({error:e.message}));return true;});
})();
