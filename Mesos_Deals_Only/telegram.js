const DEFAULT_TG_TOKEN='';
const DEFAULT_TG_CHAT='';
async function sendTelegram(text, options={}){
 const cfg=await chrome.storage.local.get(['telegramToken','telegramChatId']);
 const token=(cfg.telegramToken||DEFAULT_TG_TOKEN).trim(), chat=(cfg.telegramChatId||DEFAULT_TG_CHAT).trim();
 if(!token||!chat)return {ok:false,error:'יש להגדיר Token ו-Chat ID'};
 const response=await fetch('https://api.telegram.org/bot'+encodeURIComponent(token)+'/sendMessage',{
 method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text:String(text).slice(0,3900),disable_web_page_preview:true,...options})});
 const result=await response.json().catch(()=>({}));
 if(!response.ok||!result.ok)throw Error('Telegram: '+(result.description||response.status));
 return {ok:true};
}
async function telegramMessage(msg, options){try{return await sendTelegram(msg, options);}catch(e){console.error('Telegram delivery failed:',e.message);return {ok:false,error:e.message};}}

async function telegramAudio(kind){
 try{
  const cfg=await chrome.storage.local.get(['telegramToken','telegramChatId']);
  const token=(cfg.telegramToken||DEFAULT_TG_TOKEN).trim();
  const chat=(cfg.telegramChatId||DEFAULT_TG_CHAT).trim();
  const file=kind==='hot'?'sounds/hot.wav':'sounds/bell.wav';
  const response=await fetch(chrome.runtime.getURL(file));
  const blob=await response.blob();
  const form=new FormData();form.append('chat_id',chat);
  form.append('audio',blob,kind==='hot'?'hot-deal.wav':'deal-bell.wav');
  form.append('title',kind==='hot'?'HOT DEAL 30%+':'New Deal');
  const sent=await fetch('https://api.telegram.org/bot'+encodeURIComponent(token)+'/sendAudio',{method:'POST',body:form});
  if(!sent.ok)console.warn('Telegram audio upload failed:',sent.status);
 }catch(e){console.warn('Telegram audio unavailable:',e);}
}

async function telegramPhoto(dataUrl, caption){
 try{
  const cfg=await chrome.storage.local.get(['telegramToken','telegramChatId']);
  const token=(cfg.telegramToken||DEFAULT_TG_TOKEN).trim(),chat=(cfg.telegramChatId||DEFAULT_TG_CHAT).trim();
  const blob=await (await fetch(dataUrl)).blob();
  const form=new FormData();form.append('chat_id',chat);form.append('photo',blob,'deal.png');
  if(caption)form.append('caption',String(caption).slice(0,1000));
  const response=await fetch('https://api.telegram.org/bot'+encodeURIComponent(token)+'/sendPhoto',{method:'POST',body:form});
  const json=await response.json().catch(()=>({}));
  if(!response.ok||!json.ok)throw Error(json.description||String(response.status));
  return {ok:true};
 }catch(e){console.warn('Deal image failed:',e);return {ok:false,error:String(e)};}
}
