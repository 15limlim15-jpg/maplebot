// Presentation only. The V7 detection and background monitoring are unchanged.
function formatListing(row, url) {
  const cells = String(row.text || '').split(/\s*\|\s*/).map(x=>x.trim()).filter(Boolean);
  const lines = ['🆕 New listing — Mesos.watch'];
  const used = new Set();
  const add = (label, value, index) => { if(value) { lines.push(label + value); if(index!==undefined) used.add(index); } };
  // Keep original text when the website does not expose a field clearly.
  let locationIndex = cells.findIndex(x => /\bCh(?:annel)?\s*\d+\b|\bRoom\s*\d+\b/i.test(x));
  let priceIndex = cells.findIndex(x => /(?:^|\s)(?:\d[\d,.]*\s*(?:k|m|b)|\d[\d,.]{3,})\s*(?:mesos?)?$/i.test(x) && !/\bCh\b|\bRoom\b/i.test(x));
  if(priceIndex < 0 && cells.length >= 3 && /^\d+(?:[.,]\d+)?(?:k|m|b)?$/i.test(cells[cells.length-2])) priceIndex = cells.length-2;
  const statIndexes = cells.map((x,i)=> /(?:\+|-)?\d+(?:\.\d+)?%?\s*(?:crit|int|str|dex|luk|attack|atk|def|hp|mp|speed|jump|slot|avoid|accuracy)|(?:crit|int|str|dex|luk|attack|atk|def|hp|mp|speed|jump|slot|avoid|accuracy)\b/i.test(x) ? i : -1).filter(i=>i>=0);
  let nameIndex = cells.findIndex((x,i)=>i!==priceIndex && i!==locationIndex && !statIndexes.includes(i) && !/^\d+$/.test(x));
  if(nameIndex<0 && cells.length) nameIndex=0;
  if(row.itemName) add('📦 Item: ',row.itemName);
  else if(nameIndex>=0) add('📦 Item: ',cells[nameIndex],nameIndex);
  if(priceIndex>=0) {
    const price=cells[priceIndex];
    add('💰 Price: ',/mesos?/i.test(price)?price:price+' Mesos',priceIndex);
  }
  for(const i of statIndexes) {
    if(used.has(i))continue;
    const x=cells[i];
    const icon=/crit/i.test(x)?'🎯':/slot/i.test(x)?'🔧':/attack|atk/i.test(x)?'⚔️':'📊';
    add(icon+' ',x,i);
  }
  if(locationIndex>=0) {
    const loc=cells[locationIndex]; used.add(locationIndex);
    const seller=loc.split(/\bCh(?:annel)?\s*\d+\b/i)[0].replace(/[·,\s-]+$/,'').trim();
    if(seller)add('👤 Seller: ',seller);
    const ch=loc.match(/\bCh(?:annel)?\s*(\d+)/i);if(ch)add('🌍 Channel: ',ch[1]);
    const room=loc.match(/\bRoom\s*(\d+)/i);if(room)add('🚪 Room: ',room[1]);
  }
  // Slots often appear as a standalone number in the second column.
  // Do not show unrelated standalone zeros.
  const slotIndex=cells.findIndex((x,i)=>!used.has(i) && i===1 && /^\d{1,2}$/.test(x));
  if(slotIndex>=0){
    const slots=Number(cells[slotIndex]);
    if(slots>=0 && slots<=15)add('🔧 Slots Remaining: ',String(slots),slotIndex);
  }
  if(row.listed) add('🕒 Listed: ',row.listed);
  // Never guess listing time; only show a timestamp if the site provided it.
  for(let i=0;i<cells.length;i++) {
    if(used.has(i))continue;
    const value=cells[i];
    if(/^0$/.test(value))continue;
    if(!row.listed && /\blisted\s+(.+?ago)\b/i.test(value)) add('🕒 Listed: ',value.match(/\blisted\s+(.+?ago)\b/i)[1]);
    else if(!/^\d+$/.test(value) && !/\blisted\s+.+?ago\b/i.test(value)) add('🔹 ',value);
  }
  lines.push('🔗 '+url);
  return lines.join('\n');
}
