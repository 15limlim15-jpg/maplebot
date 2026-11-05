(()=>{
  const rowSelector='.tr[data-i]';
  let lastSignature='';
  let timer;
  function getItemName(){
    // On item-specific market pages the item name is the page heading,
    // not the first table cell (which contains the item's roll/stats).
    const headings=[...document.querySelectorAll('main h1, h1, main h2, h2')];
    for(const el of headings){
      const name=(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
      if(name && name.length<110 && !/^(market|listings|recent sales|mesos\.watch|filters?)$/i.test(name)
         && !/\b(?:listings|seen|listed)\b/i.test(name))return name;
    }
    const title=(document.title||'').split(/\s+[|—–-]\s+/)[0].trim();
    if(title && !/mesos\.watch|maplestory|free market/i.test(title))return title;
    return '';
  }
  function getWatchLabel(){
    // Mesos.watch is a single-page app: document.title stays generic.
    // #mkTitle is the currently selected item; filter chips describe its roll.
    const item=(document.querySelector('#mkTitle')?.textContent||'').replace(/\s+/g,' ').trim();
    const generic=/^(market|all listings|live feed|search results|listings|mesos\.watch)$/i;
    const name=item && !generic.test(item) ? item : getItemName();
    const chips=[...document.querySelectorAll('#mkChips .mkchip:not(.add):not(.sort)')]
      .map(x=>(x.innerText||x.textContent||'').replace(/\s+/g,' ').trim())
      .filter(x=>x && !/^(sort|filter|clear|reset|last seen)/i.test(x));
    const query=(document.querySelector('#askQ')?.value||'').trim();
    const suffix=chips.length?chips.slice(0,3).join(' · '):(!name && query?query:'');
    return [name||'Mesos.watch',suffix].filter(Boolean).join(' | ').slice(0,135);
  }
  function read(){
    const itemName=getItemName();
    const nodes=[...document.querySelectorAll(rowSelector)];
    const rows=nodes.map(n=>{
      const parts=[...n.querySelectorAll(':scope > span')].map(s=>{
        if(/c-seen|c-deal/.test(s.className||''))return '';
        return (s.innerText||s.textContent||'').replace(/\s+/g,' ').trim();
      }).filter(Boolean);
      const text=parts.join(' | ');
      // Read the "listed ... ago" line from the Seen column separately.
      // Keep the existing row key unchanged to preserve V7 deduplication.
      const seenCell=n.querySelector('.c-seen');
      const seenText=(seenCell?.innerText||seenCell?.textContent||'').replace(/\s+/g,' ').trim();
      const listedMatch=seenText.match(/\blisted\s+(.+?\bago)\b/i);
      const listed=listedMatch ? listedMatch[1].trim() : '';
      return {key:text,text,listed,itemName};
    }).filter(x=>x.key);
    const ready=nodes.length>0 || !!document.querySelector('.c-price,[class*=table],[class*=results]');
    return {ready,rows,title:document.title,watchLabel:getWatchLabel(),url:location.href};
  }
  function notify(){
    const data=read();
    if(!data.ready)return;
    const signature=JSON.stringify([data.url,data.rows.map(r=>r.key)]);
    if(signature===lastSignature)return;
    lastSignature=signature;
    chrome.runtime.sendMessage({type:'TABLE_CHANGED',data}).catch(()=>{});
  }
  const observer=new MutationObserver(mutations=>{
    // Ignore changes that only update relative timestamps or deal badges.
    if(!mutations.some(m=>{
      const target=m.target.nodeType===1?m.target:m.target.parentElement;
      return target && !target.closest('.c-seen,.c-deal');
    }))return;
    clearTimeout(timer);timer=setTimeout(notify,450);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  // Build a MapleStory-style card using the actual tooltip data when available.
  // The site creates #tip from its own mouse handlers; synthetic events may not
  // activate every implementation, so fall back to row data rather than blocking alerts.
  async function renderDealCard(key){
    const node=[...document.querySelectorAll(rowSelector)].find(n=>{
      const parts=[...n.querySelectorAll(':scope > span')].map(s=>/c-seen|c-deal/.test(s.className||'')?'':(s.innerText||s.textContent||'').replace(/\s+/g,' ').trim()).filter(Boolean);
      return parts.join(' | ')===key;
    });
    if(!node)return null;
    const tip=document.querySelector('#tip');
    const before=tip?.outerHTML||'';
    const rect=node.getBoundingClientRect();
    const eventOpts={bubbles:true,clientX:rect.left+Math.min(20,rect.width/2),clientY:rect.top+Math.min(12,rect.height/2)};
    try{
      node.dispatchEvent(new MouseEvent('mouseover',eventOpts));
      node.dispatchEvent(new MouseEvent('mouseenter',{...eventOpts,bubbles:false}));
      node.dispatchEvent(new MouseEvent('mousemove',eventOpts));
    }catch(e){}
    await new Promise(r=>setTimeout(r,180));
    const active=document.querySelector('#tip.on');
    // Never borrow an unrelated already-open tooltip.
    const useTip=active && active.outerHTML!==before;
    const title=(useTip?active.querySelector('.tn')?.textContent:null)||getItemName()||'MapleStory Item';
    const category=(useTip?active.querySelector('.tc')?.textContent:null)||'';
    const details=useTip?[...active.querySelectorAll('.st2 > div')].map(x=>x.textContent.trim()).filter(Boolean):[];
    const req=useTip?active.querySelector('.req')?.innerText||'':'';
    const img=useTip?active.querySelector('img.ico'):node.querySelector('img.ico');
    const pieces=[...node.querySelectorAll(':scope > span')].map(x=>(x.innerText||x.textContent||'').replace(/\s+/g,' ').trim());
    if(!details.length){
      const roll=pieces[0]||'';
      for(const part of roll.split(/\s*(?:\||·|,)\s*/))if(part.trim())details.push(part.trim());
      if(pieces[1])details.push('Slots: '+pieces[1]);
    }
    const priceText=(req.match(/Price\s*:\s*([^\n]+)/i)||[])[1]||pieces.find(x=>/^(?:[\d,.]+)\s*[kmb]?$/i.test(x))||'';
    // Compact stat block with slots directly following the other stats.
    const slots=details.filter(x=>/Number of upgrades available|^Slots\s*:/i.test(x));
    const stats=details.filter(x=>!/Number of upgrades available|^Slots\s*:/i.test(x));
    const ordered=[...stats,...slots.map(x=>'Slots: '+(x.match(/(\d+)\s*$/)?.[1]||x))];
    const width=430,height=Math.max(254,210+ordered.length*27);
    const canvas=document.createElement('canvas');canvas.width=width*2;canvas.height=height*2;
    const c=canvas.getContext('2d');c.scale(2,2);
    c.fillStyle='#111827';c.fillRect(0,0,width,height);
    c.strokeStyle='#7c8494';c.lineWidth=2;c.strokeRect(5,5,width-10,height-10);
    c.strokeStyle='#343d50';c.strokeRect(11,11,width-22,height-22);
    c.textAlign='center';c.fillStyle='#f6d35e';c.font='bold 23px Arial';c.fillText(title.slice(0,33),width/2,42);
    c.fillStyle='#aab3c5';c.font='15px Arial';c.fillText((category||'Equip').slice(0,45),width/2,67);
    c.strokeStyle='#3e4658';c.beginPath();c.moveTo(25,83);c.lineTo(width-25,83);c.stroke();
    c.fillStyle='#202b40';c.fillRect(26,97,65,65);
    if(img){
      try{
        const src=img.currentSrc||img.src;
        const picture=new Image();picture.crossOrigin='anonymous';picture.src=src;
        await new Promise(resolve=>{if(picture.complete)return resolve();picture.onload=resolve;picture.onerror=resolve;setTimeout(resolve,1200)});
        if(picture.naturalWidth)c.drawImage(picture,37,108,43,43);
      }catch(e){}
    }
    c.textAlign='left';c.fillStyle='#e7ebf2';c.font='16px Arial';
    c.fillText(('Price: '+priceText).slice(0,39),110,119);
    c.fillText((req.match(/Count\s*:\s*([^\n]+)/i)||[])[0]||'Count: 1',110,146);
    c.strokeStyle='#3e4658';c.beginPath();c.moveTo(25,176);c.lineTo(width-25,176);c.stroke();
    c.font='16px Arial';c.fillStyle='#f1f4f9';let y=204;
    for(const detail of ordered){c.fillText(detail.slice(0,47),29,y);y+=27;}
    // Keep the watermark below the entire stats block; never overlap slots.
    c.fillStyle='#8e9aaf';c.font='12px Arial';c.fillText('mesos.watch',29,height-16);
    return {image:canvas.toDataURL('image/png'),category};
  }
  chrome.runtime.onMessage.addListener((m,s,reply)=>{
    if(m.type==='SNAPSHOT'){reply(read());return;}
    if(m.type==='RENDER_DEAL_CARD'){renderDealCard(m.key).then(reply).catch(()=>reply(null));return true;}
  });
  // One-time check when a page finishes loading. No reload or periodic page refresh.
  setTimeout(notify,1600);
  // Safety net: detect table changes even if a DOM observer event is missed.
  // Background Chrome timers can be throttled, so this is not a 0.5s guarantee.
  setInterval(notify,2500);
  window.addEventListener("pageshow",notify);
})();
