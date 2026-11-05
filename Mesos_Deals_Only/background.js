importScripts('telegram.js', 'format-message.js');
const KEY='domWatches';
// Offscreen document can play sounds without stealing focus from the user's active tab.
let creatingAudioDocument;
async function playDealSound(hot){
 try {
  if(!(await chrome.offscreen.hasDocument())){
   creatingAudioDocument ||= chrome.offscreen.createDocument({url:'audio.html',reasons:['AUDIO_PLAYBACK'],justification:'Play deal notification sound while Chrome is in the background'}).finally(()=>{creatingAudioDocument=null});
   await creatingAudioDocument;
  }
  await chrome.runtime.sendMessage({type:'PLAY_DEAL_SOUND',hot});
 } catch(e){console.warn('Sound playback unavailable:',e);}
}

const get=async()=> (await chrome.storage.local.get(KEY))[KEY]||{};
const set=async w=>chrome.storage.local.set({[KEY]:w});
const valid=u=>/^https:\/\/(www\.)?mesos\.watch\//.test(u||'');
const locks=new Set();
function parseMesos(value){
  const x=String(value??'').trim().replace(/,/g,'').replace(/\s*mesos?$/i,'');
  const m=x.match(/^(\d+(?:\.\d+)?)\s*([kmb])?$/i);
  if(!m)return null;
  const v=Number(m[1])*({k:1e3,m:1e6,b:1e9}[m[2]?.toLowerCase()]||1);
  return Number.isFinite(v)&&v>=0?v:null;
}
function listingPrice(row){
  // Table columns are Roll | Slots | Price | vs typical | Seller | Seen.
  // The original content script excludes the vs-typical and Seen columns.
  const cells=String(row.text||'').split(/\s*\|\s*/).map(x=>x.trim()).filter(Boolean);
  // Find the seller/location column, then read the closest numeric price to its left.
  const sellerIdx=cells.findIndex(x=>/\bCh(?:annel)?\s*\d+\b|\bRoom\s*\d+\b/i.test(x));
  if(sellerIdx<0)return null;
  for(let i=sellerIdx-1;i>=0;i--){
    const n=parseMesos(cells[i]);
    if(n!==null && (i>=2 || /[kmb]|,|\./i.test(cells[i])))return n;
  }
  return null;
}
// Compact Telegram amounts while preserving precision for unusual prices.
function compactMesos(value){
  const n=Number(value);
  if(!Number.isFinite(n))return String(value);
  const abs=Math.abs(n);
  const units=[[1e9,'B'],[1e6,'M'],[1e3,'K']];
  for(const [unit,suffix] of units){
    if(abs>=unit){
      const scaled=n/unit;
      // Prefer compact exact values. Avoid silently rounding a price/profit.
      for(let decimals=0;decimals<=9;decimals++){
        const rounded=Number(scaled.toFixed(decimals));
        if(Math.abs(rounded*unit-n)<1e-7)
          return rounded.toLocaleString('en-US',{maximumFractionDigits:decimals})+suffix;
      }
    }
  }
  return n.toLocaleString('en-US',{maximumFractionDigits:9});
}
function dealMessage(row,url,price,target){
  const lines=formatListing(row,url).split('\n');
  const getLine=prefix=>lines.find(x=>x.startsWith(prefix))?.slice(prefix.length).trim()||'';
  const esc=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const profit=target*0.95-price;
  const roi=price>0?profit/price*100:null;
  const hot=roi!==null&&roi>=30;
  const pct=roi===null?'N/A':(roi>=0?'+':'')+Number(roi.toFixed(1)).toLocaleString('en-US',{maximumFractionDigits:1})+'%';
  const item=row.itemName||getLine('📦 Item: ')||'Item';
  const stats=lines.filter(x=>/^(🎯|⚔️|📊) /.test(x)).map(x=>x.replace(/^[^ ]+ /,'').trim());
  const slots=getLine('🔧 Slots Remaining: ');
  const itemParts=[item,...stats.slice(0,2),...(slots? [slots+' Slots']:[])];
  const seller=getLine('👤 Seller: '),channel=getLine('🌍 Channel: '),room=getLine('🚪 Room: ');
  const location=['Ch '+channel,'Room '+room,seller].filter(x=>x!=='Ch '&&x!=='Room '&&x).join(' | ');
  const listed=getLine('🕒 Listed: ');
  const msg=[
    '<b>'+(hot?'🔴 HOT DEAL':'💎 GOOD DEAL')+' | '+esc(pct)+' PROFIT</b>',
    '📦 <b>'+esc(itemParts.join(' | '))+'</b>',
    '💰 <b>Buy: '+esc(compactMesos(price))+' → Sell: '+esc(compactMesos(target))+'</b>',
    '💵 <b>Profit: '+esc((profit>=0?'+':'')+compactMesos(profit))+' Mesos'+'</b>',
    ...(location?['📍 '+esc(location)]:[]),
    ...(listed?['🕒 Listed: '+esc(listed)]:[]),
    '🔗 <a href="'+esc(url)+'">View Item</a>'
  ];
  return {text:msg.join('\n'),hot,roi,profit};
}
async function processSnapshot(id,data){
  id=String(id);
  if(locks.has(id))return;
  locks.add(id);
  try{
    const all=await get(),w=all[id];if(!w||!data?.ready||!Array.isArray(data.rows))return;
    if(data.url!==w.url){w.error='כתובת הלשונית השתנתה — הפעל מעקב מחדש';all[id]=w;await set(all);return;}
    if(data.watchLabel)w.watchLabel=data.watchLabel;
    const known=new Set(w.seen||[]);
    const fresh=data.rows.filter(r=>r.key&&!known.has(r.key));
    let sent=0;
    // Telegram shows the most recently sent message at the bottom.
    // Send bottom-to-top so the newest/top website listing ends up first in the visible chat stack.
    for(const row of [...fresh].reverse()){
      // Add to baseline even when Telegram fails, to avoid repeated notifications.
      known.add(row.key);
      const price=listingPrice(row);
      if(price===null){w.skippedUnknown=(w.skippedUnknown||0)+1;continue;}
      if(price>=w.targetPrice)continue;
      // Only positive net profit after the 5% selling fee.
      if(w.targetPrice*0.95-price<=0)continue;
      const deal=dealMessage(row, data.url, price, w.targetPrice);
      // Classify using the item's own tooltip before sending either message.
      // Do not exclude ordinary equipment merely because its remaining slots are 0.
      let card=null;
      try{card=await chrome.tabs.sendMessage(Number(id),{type:'RENDER_DEAL_CARD',key:row.key});}
      catch(e){console.warn('Card unavailable',e);}
      // Image first, text second; gracefully send text if the image is unavailable.
      if(card?.image)await telegramPhoto(card.image);
      const result=await telegramMessage(deal.text, {parse_mode:'HTML'});
      if(result.ok){
        sent++;
        if(deal.hot){await playDealSound(true);await telegramAudio('hot');}
      }else w.error='Telegram: '+result.error;
    }
    for(const r of data.rows)known.add(r.key);
    w.seen=[...known].slice(-20000);
    w.alerts=(w.alerts||0)+sent;
    w.lastScan=Date.now();w.status=`${data.rows.length} מודעות בטבלה • ${sent} התראות חדשות`;
    if(!w.error?.startsWith('Telegram:'))w.error='';
    all[id]=w;await set(all);
  }finally{locks.delete(id);}
}
chrome.tabs.onRemoved.addListener(id=>{watchQueue=watchQueue.then(async()=>{const all=await get();delete all[id];await set(all);}).catch(console.error);});
let watchQueue=Promise.resolve();
function watchAction(m,s={}){const task=watchQueue.then(async()=>{
 if(m.type==='GET_ALL'){
  const tabs=await chrome.tabs.query({url:['https://mesos.watch/*','https://www.mesos.watch/*']});
  const w=await get();
  await Promise.all(tabs.filter(t=>w[t.id]).map(async t=>{try{const d=await chrome.tabs.sendMessage(t.id,{type:'SNAPSHOT'});if(d?.watchLabel)w[t.id].watchLabel=d.watchLabel;}catch(e){}}));
  await set(w);return {tabs:tabs.map(t=>({id:t.id,title:t.title,watchLabel:w[t.id]?.watchLabel,watched:!!w[t.id],status:w[t.id]}))};
 }
 if(m.type==='START_TAB'){
  const tab=await chrome.tabs.get(m.tabId);if(!valid(tab.url))throw Error('זו אינה לשונית Mesos.watch');
  const data=await chrome.tabs.sendMessage(m.tabId,{type:'SNAPSHOT'});
  if(!data?.ready)throw Error('הטבלה לא נטענה. פתח עמוד עם מודעות.');
  const w=await get();const targetPrice=parseMesos(m.targetPrice);if(targetPrice===null||targetPrice<=0)throw Error('יש להזין מחיר יעד חיובי (למשל 30m או 30000000)');
  w[m.tabId]={targetPrice,title:data.title,watchLabel:data.watchLabel,url:data.url,seen:data.rows.map(r=>r.key),alerts:0,status:`נשמרו ${data.rows.length} מודעות קיימות`,error:'',lastScan:Date.now()};await set(w);
  return {ok:true};
 }
 if(m.type==='UPDATE_TARGET'){const price=parseMesos(m.targetPrice);if(price===null||price<=0)throw Error('מחיר יעד לא תקין');const w=await get();if(!w[m.tabId])throw Error('הלשונית לא במעקב');w[m.tabId].targetPrice=price;await set(w);return {ok:true};}
 if(m.type==='STOP_TAB'){const w=await get();delete w[m.tabId];await set(w);return {ok:true};}
 if(m.type==='TABLE_CHANGED'){
  if(s.tab?.id!=null&&valid(s.tab.url))await processSnapshot(s.tab.id,m.data);
  return {ok:true};
 }
 if(m.type==='TELEGRAM_TEST')return telegramMessage('✅ Mesos Tab Alerts מחובר!');
 return {error:'Unknown action'};
});watchQueue=task.catch(()=>{});return task;}
chrome.runtime.onMessage.addListener((m,s,reply)=>{if(m.type?.startsWith('AUTO_'))return;watchAction(m,s).then(reply).catch(e=>reply({error:String(e.message||e)}));return true;});
importScripts('search-background.js');
