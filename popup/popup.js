'use strict';

const depthSlider = document.getElementById('depth-slider');
const depthVal = document.getElementById('depth-val');
const dailyBtn = document.getElementById('btn-daily-run');
const stopBtn = document.getElementById('btn-stop-run');
const statusEl = document.getElementById('popup-status');
const countsEl = document.getElementById('popup-counts');
const footerEl = document.getElementById('popup-footer');
const runModeEl = document.getElementById('run-mode');
const autoToggle = document.getElementById('auto-run-toggle');
const autoTime = document.getElementById('auto-run-time');

// Load saved settings
chrome.storage.local.get(['depth2048', 'runMode', 'autoRunEnabled', 'autoRunTime'], (cfg) => {
  depthSlider.value = cfg.depth2048 || 3;
  depthVal.textContent = cfg.depth2048 || 3;
  runModeEl.value = cfg.runMode || 'tabs';
  autoToggle.checked = !!cfg.autoRunEnabled;
  if (cfg.autoRunTime) autoTime.value = cfg.autoRunTime;
});

// Save on change
depthSlider.addEventListener('input', () => {
  depthVal.textContent = depthSlider.value;
  chrome.storage.local.set({ depth2048: Number(depthSlider.value) });
});
runModeEl.addEventListener('change', () => {
  chrome.storage.local.set({ runMode: runModeEl.value });
});
autoToggle.addEventListener('change', () => {
  chrome.storage.local.set({ autoRunEnabled: autoToggle.checked });
});
autoTime.addEventListener('change', () => {
  chrome.storage.local.set({ autoRunTime: autoTime.value });
});

// Load & save enabled games
const gameChecks = document.querySelectorAll('.ga-game-check');
chrome.storage.local.get('ga_enabled_games', (data) => {
  const saved = data.ga_enabled_games || {};
  gameChecks.forEach(cb => {
    const game = cb.dataset.game;
    if (saved[game] !== undefined) cb.checked = saved[game];
  });
});
gameChecks.forEach(cb => {
  cb.addEventListener('change', () => {
    const enabled = {};
    document.querySelectorAll('.ga-game-check').forEach(c => {
      enabled[c.dataset.game] = c.checked;
    });
    chrome.storage.local.set({ ga_enabled_games: enabled });
  });
});

// Check tab
async function checkTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.startsWith('https://sub.hdd.sb/')) {
    statusEl.textContent = '⚠ 请打开 sub.hdd.sb 网站';
    return null;
  }
  statusEl.textContent = '✅ sub.hdd.sb';
  return tab;
}

// Messaging
async function sendToTab(tab, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, msg, (resp) => {
      if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
      else resolve(resp || {});
    });
  });
}
async function sendToBg(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
      else resolve(resp || {});
    });
  });
}

// Refresh
async function refreshStatus() {
  const tab = await checkTab();
  if (!tab) return;
  dailyBtn.disabled = false;
  const resp = await sendToTab(tab, { type: 'getDailyStatus' });
  if (resp && !resp.error) {
    renderCounts(resp);
    if (resp.balance) footerEl.textContent = '余额: $' + resp.balance;
  }
}

function renderCounts(status) {
  const games = [
    { key: 'memory', name: '记忆翻牌' },
    { key: 'sudoku', name: '数独' },
    { key: 'puzzle15', name: '华容道' },
    { key: 'tile', name: '羊了个羊' },
    { key: 'puzzle2048', name: '2048' },
  ];
  // Checkin status
  const cin = status.checkin;
  const cinText = cin === 'done' ? '已签到' : cin === 'pending' ? '未签到' : '?';

  let html = `<div class="count-row">签到: ${cinText}</div>`;
  const rem = status.remaining || {};
  html += games.map((g) => {
    const r = rem[g.key];
    const t = r === 0 ? '已完成' : (typeof r === 'number' && r > 0) ? r + ' 剩余' : '?';
    return `<div class="count-row">${g.name}: ${t}</div>`;
  }).join('');
  document.getElementById('counts-summary').innerHTML = html;
}

// Daily run
dailyBtn.addEventListener('click', async () => {
  dailyBtn.disabled = true;
  dailyBtn.textContent = '⏳ 执行中...';
  stopBtn.style.display = 'block';
  const tab = await checkTab();
  if (!tab) { resetButtons(); return; }

  const depth = Number(depthSlider.value) || 3;
  const enabled = {};
  document.querySelectorAll('.ga-game-check').forEach(c => {
    enabled[c.dataset.game] = c.checked;
  });
  if (runModeEl.value === 'tabs') {
    await sendToBg({ type: 'startDailyRun', depth, enabledGames: enabled });
  } else {
    await sendToTab(tab, { type: 'startDailyRun', depth, enabledGames: enabled });
  }
  resetButtons();
});

stopBtn.addEventListener('click', async () => {
  stopBtn.disabled = true;
  stopBtn.textContent = '⏳ 停止中...';
  await sendToBg({ type: 'stopDailyRun' });
  resetButtons();
});

function resetButtons() {
  dailyBtn.disabled = false;
  dailyBtn.textContent = '🚀 一键全通';
  stopBtn.style.display = 'none';
  stopBtn.disabled = false;
  stopBtn.textContent = '⏹ 停止';
}

// Check run status on open
async function checkRunStatus() {
  const resp = await sendToBg({ type: 'getRunStatus' });
  if (resp && resp.running) {
    dailyBtn.disabled = true;
    dailyBtn.textContent = '⏳ 执行中...';
    stopBtn.style.display = 'block';
  }
}

checkTab().then((tab) => {
  if (tab) refreshStatus();
  checkRunStatus();
});
