'use strict';

// Background service worker: coordinates daily auto-run across tabs.
// Handles: popup-initiated runs, chrome.alarms scheduled runs.

const GAMES = [
  { name: '🃏 记忆翻牌', url: '/memory', type: 'memory', diffs: ['hell','hard','normal','easy'] },
  { name: '🔢 数独', url: '/sudoku', type: 'sudoku', diffs: ['expert','hard','normal','easy'] },
  { name: '🧮 华容道', url: '/puzzle15', type: 'puzzle15', diffs: ['hard','classic','easy'] },
  { name: '🐑 羊了个羊', url: '/tile', type: 'tile', diffs: ['hell','hard','normal','easy'] },
  { name: '🧩 2048', url: '/puzzle2048', type: 'puzzle2048', diffs: ['jumbo','classic'] },
];

const BASE = 'https://sub.hdd.sb';

// ---- Run state in chrome.storage.session ----
async function getRunState() {
  const r = await chrome.storage.session.get('ga-run');
  return r['ga-run'] || null;
}
async function setRunState(s) {
  await chrome.storage.session.set({'ga-run': s});
}
async function clearRunState() {
  await chrome.storage.session.remove('ga-run');
}

// ---- Notification ----
function notify(title, message) {
  chrome.notifications.create({
    type: 'basic', iconUrl: 'icons/icon128.png', title, message,
  });
}

// ---- Start a daily run ----
async function startDailyRun(depth) {
  const existing = await getRunState();
  if (existing && existing.running) {
    console.log('[bg] run already in progress');
    return;
  }

  const state = {
    running: true, phase: 'checkin', gameIdx: 0, diffIdx: 0,
    depth: depth || 3, startedAt: Date.now(), results: [],
  };
  await setRunState(state);

  // Open checkin page
  const tab = await chrome.tabs.create({ url: BASE + '/checkin', active: false });
  state.checkinTabId = tab.id;
  await setRunState(state);
}

// ---- Handle game completion from content script ----
async function onGameDone(tabId, result) {
  const state = await getRunState();
  if (!state || !state.running) return;

  // Record result
  state.results.push(result);

  // Close the tab
  try { await chrome.tabs.remove(tabId); } catch (e) { /* tab may already be closed */ }

  // Determine next action
  if (state.phase === 'checkin') {
    // Move to first game
    state.phase = 'game';
    state.gameIdx = 0;
    state.diffIdx = 0;
  } else if (state.phase === 'game') {
    const g = GAMES[state.gameIdx];
    if (g && state.diffIdx + 1 < g.diffs.length) {
      state.diffIdx++; // next difficulty, same game
    } else {
      state.gameIdx++;
      state.diffIdx = 0; // next game
    }
  }

  // Check if all done
  if (state.gameIdx >= GAMES.length) {
    await finishRun(state);
    return;
  }

  // Open next game tab
  await setRunState(state);
  const g = GAMES[state.gameIdx];
  const url = BASE + g.url;
  const tab = await chrome.tabs.create({ url, active: false });
}

async function finishRun(state) {
  state.running = false;
  const elapsed = ((Date.now() - state.startedAt) / 1000).toFixed(0);
  const won = state.results.filter(r => r.status === 'won').length;
  const totalReward = state.results.reduce((s, r) => s + (r.reward || 0), 0);
  notify('每日全通完成',
    `通过 ${won}/${state.results.length} 项 · 耗时 ${elapsed}s · 收益 $${totalReward.toFixed(2)}`);
  await clearRunState();
}

// ---- Check for active run on tab load (content script asks) ----
async function getRunInfo(tabId) {
  const state = await getRunState();
  console.log('[bg] getRunInfo tab', tabId, 'state:', state ? 'running' : 'none');
  if (!state || !state.running) return null;
  // Return what this specific tab should do
  if (state.phase === 'checkin' && state.checkinTabId === tabId) {
    return { phase: 'checkin', depth: state.depth };
  }
  if (state.phase === 'game') {
    const g = GAMES[state.gameIdx];
    if (!g) return null;
    const diff = g.diffs[state.diffIdx];
    if (!diff) return null;
    return {
      phase: 'game',
      gameType: g.type,
      difficulty: diff,
      depth: state.depth,
      gameIdx: state.gameIdx,
      diffIdx: state.diffIdx,
    };
  }
  return null;
}

// ---- Message handler ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'startDailyRun') {
    startDailyRun(msg.depth || 3);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'stopDailyRun') {
    clearRunState();
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'gameDone') {
    onGameDone(sender.tab.id, msg.result);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'getRunInfo') {
    getRunInfo(sender.tab.id).then(sendResponse);
    return true;
  }
  if (msg.type === 'getRunStatus') {
    getRunState().then(s => sendResponse({ running: !!(s && s.running) }));
    return true;
  }
});

// ---- Alarm for scheduled auto-run ----
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'daily-auto-run') {
    const config = await chrome.storage.local.get(['autoRunEnabled', 'autoRunDepth']);
    if (!config.autoRunEnabled) return;
    const existing = await getRunState();
    if (existing && existing.running) return; // already running
    startDailyRun(config.autoRunDepth || 3);
  }
});

// Set up alarm on install/startup
async function setupAlarm() {
  const config = await chrome.storage.local.get(['autoRunEnabled', 'autoRunTime']);
  await chrome.alarms.clear('daily-auto-run');
  if (config.autoRunEnabled) {
    const time = config.autoRunTime || '01:00';
    const [h, m] = time.split(':').map(Number);
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 1, m || 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    chrome.alarms.create('daily-auto-run', {
      when: target.getTime(),
      periodInMinutes: 24 * 60,
    });
  }
}

chrome.runtime.onInstalled.addListener(setupAlarm);
chrome.runtime.onStartup.addListener(setupAlarm);

// Re-setup when storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.autoRunEnabled || changes.autoRunTime)) {
    setupAlarm();
  }
});
