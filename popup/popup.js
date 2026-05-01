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
    { key: 'checkin', emoji: '📅', name: '签到' },
    { key: 'memory', emoji: '🃏', name: '记忆翻牌' },
    { key: 'sudoku', emoji: '🔢', name: '数独' },
    { key: 'puzzle15', emoji: '🧮', name: '华容道' },
    { key: 'tile', emoji: '🐑', name: '羊了个羊' },
    { key: 'puzzle2048', emoji: '🧩', name: '2048' },
  ];
  const rem = status.remaining || {};
  countsEl.innerHTML = games.map((g) => {
    const r = rem[g.key];
    const icon = r === 0 ? '✅' : (typeof r === 'number' && r > 0) ? '⏳' : '❓';
    return `<div class="count-row">${icon} ${g.emoji} ${g.name}: ${r} 剩余</div>`;
  }).join('');
}

// Daily run
dailyBtn.addEventListener('click', async () => {
  dailyBtn.disabled = true;
  dailyBtn.textContent = '⏳ 执行中...';
  stopBtn.style.display = 'block';
  const tab = await checkTab();
  if (!tab) { resetButtons(); return; }

  const depth = Number(depthSlider.value) || 3;
  if (runModeEl.value === 'tabs') {
    await sendToBg({ type: 'startDailyRun', depth });
  } else {
    await sendToTab(tab, { type: 'startDailyRun', depth });
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
