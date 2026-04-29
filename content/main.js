'use strict';

let commandSeq = 0;
let currentGameType = null;
let currentState = null;

function sendCommand(type, payload) {
  const commandId = ++commandSeq;
  return new Promise((resolve) => {
    const handler = (ev) => {
      if (ev.data.source !== 'ga-inject') return;
      if (ev.data.commandId !== commandId) return;
      window.removeEventListener('message', handler);
      resolve(ev.data.data);
    };
    window.addEventListener('message', handler);
    window.dispatchEvent(new CustomEvent('ga-command', {
      detail: { commandId, type, payload },
    }));
    // Timeout fallback
    setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve({ error: 'timeout' });
    }, 10000);
  });
}

function injectBridge() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content/inject.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

function createPanel() {
  if (document.getElementById('ga-panel-root')) return;
  const root = document.createElement('div');
  root.id = 'ga-panel-root';
  root.innerHTML = `
    <div class="ga-panel">
      <div class="ga-panel-header">
        <span class="ga-panel-title">🎮 Game Assistant</span>
        <button class="ga-panel-close" title="收起">✕</button>
      </div>
      <div class="ga-panel-body" id="ga-panel-body">
        <p style="color:#94a3b8;padding:12px;font-size:12px">等待游戏加载...</p>
      </div>
      <div class="ga-panel-footer" id="ga-panel-footer"></div>
    </div>
    <button class="ga-panel-toggle" id="ga-panel-toggle" title="展开面板" style="display:none">▶</button>
  `;
  document.body.appendChild(root);

  const panel = root.querySelector('.ga-panel');
  const toggle = root.querySelector('#ga-panel-toggle');
  const close = root.querySelector('.ga-panel-close');

  function collapse() {
    panel.classList.add('ga-collapsed');
    toggle.style.display = 'block';
  }
  function expand() {
    panel.classList.remove('ga-collapsed');
    toggle.style.display = 'none';
  }

  close.addEventListener('click', collapse);
  toggle.addEventListener('click', expand);

  // Apply page layout shift
  const mainEl = document.querySelector('main');
  if (mainEl) mainEl.style.marginRight = '280px';
}

// Listen for messages from inject script
window.addEventListener('message', (ev) => {
  if (ev.data.source !== 'ga-inject') return;
  if (ev.data.type === 'ready') {
    console.log('[GA] bridge ready for', ev.data.data.gameType);
    currentGameType = ev.data.data.gameType;
    updatePanelForGame();
    setTimeout(refreshState, 500);
  }
  if (ev.data.type === 'stateChanged') {
    refreshState();
  }
});

function updatePanelForGame() {
  if (currentGameType) {
    Panel.renderLoading(currentGameType);
  }
}

async function refreshState() {
  if (!currentGameType) return;
  currentState = await sendCommand('getState');
  if (currentState && currentState.hasActiveSession) {
    switch (currentGameType) {
      case 'puzzle2048': Panel.render2048(currentState); break;
      case 'memory': Panel.renderMemory(currentState); break;
      case 'puzzle15': Panel.renderPuzzle15(currentState); break;
      case 'sudoku': Panel.renderSudoku(currentState); break;
    }
    bindButtons();
  } else {
    Panel.renderLoading(currentGameType);
  }
}

// Listen for popup messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'getDailyStatus') {
    getDailyStatus().then(sendResponse);
    return true;
  }
  if (msg.type === 'startDailyRun') {
    if (typeof Runner !== 'undefined') {
      Runner.run(msg.depth || 3).then(sendResponse);
    } else {
      sendResponse({ error: 'Runner not loaded' });
    }
    return true;
  }
});

async function getDailyStatus() {
  return {
    remaining: { checkin: '?', puzzle2048: '?', memory: '?', puzzle15: '?', sudoku: '?' },
    balance: '—',
  };
}

function bindButtons() {
  const hintBtn = document.getElementById('ga-btn-show-hint');
  const autoBtn = document.getElementById('ga-btn-auto');
  const stopBtn = document.getElementById('ga-btn-stop');

  if (hintBtn) hintBtn.onclick = showHint;
  if (autoBtn) autoBtn.onclick = startAutoPlay;
  if (stopBtn) stopBtn.onclick = stopAutoPlay;
}

function showHint() { console.log('[GA] show hint'); }
async function startAutoPlay() { console.log('[GA] auto play'); }
function stopAutoPlay() { console.log('[GA] stop'); }

let autoPlayStopped = false;
function delay(minMs, maxMs) {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((r) => setTimeout(r, ms));
}

function init() {
  injectBridge();
  createPanel();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
