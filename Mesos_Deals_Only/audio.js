const sound = new Audio();
sound.preload='auto';
chrome.runtime.onMessage.addListener((msg)=>{
 if(msg.type!=='PLAY_DEAL_SOUND')return;
 sound.pause();sound.currentTime=0;
 sound.src=msg.hot?'sounds/hot.wav':'sounds/bell.wav';
 sound.play().catch(e=>console.warn('Could not play notification',e));
});
