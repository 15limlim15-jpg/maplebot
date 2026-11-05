// Run in the page's MAIN world before the site's scripts.
// Some live-data clients suspend updates when document.hidden is true.
// This is best-effort; Chrome may still throttle background timers.
(() => {
  try {
    Object.defineProperty(Document.prototype, 'hidden', {configurable:true,get(){return false;}});
    Object.defineProperty(Document.prototype, 'visibilityState', {configurable:true,get(){return 'visible';}});
    document.hasFocus = () => true;
    const original = document.addEventListener.bind(document);
    document.addEventListener = function(type, listener, options) {
      if(type === 'visibilitychange') return;
      return original(type,listener,options);
    };
  } catch (_) {}
})();
