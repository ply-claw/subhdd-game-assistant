'use strict';

const depthSlider = document.getElementById('depth-slider');
const depthVal = document.getElementById('depth-val');
const dailyBtn = document.getElementById('btn-daily-run');
const statusEl = document.getElementById('popup-status');
const countsEl = document.getElementById('popup-counts');
const footerEl = document.getElementById('popup-footer');

// Load saved depth
chrome.storage.local.get('depth2048', ({ depth2048 }) => {
  const d = depth2048 || 3;
  depthSlider.value = d;
  depthVal.textContent = d;
});

depthSlider.addEventListener('input', () => {
  depthVal.textContent = depthSlider.value;
  chrome.storage.local.set({ depth2048: Number(depthSlider.value) });
});

// Check if we're on sub.hdd.sb
async function checkTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.startsWith('https://sub.hdd.sb/')) {
    statusEl.textContent = '⚠ 请打开 sub.hdd.sb 网站';
    return null;
  }
  statusEl.textContent = '✅ sub.hdd.sb 已检测';
  return tab;
}

// Send message to content script
async function sendToTab(tab, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, msg, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}

// Request daily status from content script
async function refreshStatus() {
  const tab = await checkTab();
  if (!tab) return;

  const resp = await sendToTab(tab, { type: 'getDailyStatus' });
  if (resp && resp.error) {
    statusEl.textContent = '⚠ 请刷新游戏页面后重试';
    return;
  }
  if (resp) {
    renderCounts(resp);
    dailyBtn.disabled = false;
    if (resp.balance) footerEl.textContent = '余额: $' + resp.balance;
  }
}

function renderCounts(status) {
  const games = [
    { key: 'checkin', emoji: '📅', name: '签到' },
    { key: 'puzzle2048', emoji: '🧩', name: '2048' },
    { key: 'memory', emoji: '🃏', name: '记忆翻牌' },
    { key: 'puzzle15', emoji: '🧮', name: '华容道' },
    { key: 'sudoku', emoji: '🔢', name: '数独' },
  ];

  const rem = status.remaining || {};
  countsEl.innerHTML = games.map((g) => {
    const r = rem[g.key];
    const icon = r === 0 ? '✅' : (typeof r === 'number' && r > 0) ? '⏳' : '❓';
    return `<div class="count-row">${icon} ${g.emoji} ${g.name}: ${r} 剩余</div>`;
  }).join('');
}

// Daily run button
dailyBtn.addEventListener('click', async () => {
  dailyBtn.disabled = true;
  dailyBtn.textContent = '⏳ 执行中...';
  const tab = await checkTab();
  if (!tab) {
    dailyBtn.disabled = false;
    dailyBtn.textContent = '🚀 一键全通';
    return;
  }

  const depth = Number(depthSlider.value) || 3;
  await sendToTab(tab, { type: 'startDailyRun', depth });

  dailyBtn.disabled = false;
  dailyBtn.textContent = '🚀 一键全通';
});

// Init
checkTab().then((tab) => {
  if (tab) refreshStatus();
});
