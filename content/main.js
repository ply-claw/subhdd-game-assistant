'use strict';
console.log('[GA] content script loaded');
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
function init() {
  console.log('[GA] init');
}
