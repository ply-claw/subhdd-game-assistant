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
      Runner.run(msg.depth || 3);
      sendResponse({ ok: true });
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

function showHint() {
  if (!currentState || !currentState.hasActiveSession) return;

  switch (currentGameType) {
    case 'puzzle2048': {
      const board = currentState.session.board;
      if (!board) return;
      const depthEl = document.getElementById('ga-depth');
      const depth = depthEl ? Number(depthEl.value) || 3 : 3;
      const { direction, score } = Solver2048.getBestMove(board, depth);
      const arrows = { up: '↑', down: '↓', left: '←', right: '→' };
      Panel.showHint(`${arrows[direction] || direction}  (eval: ${score ? score.toFixed(0) : '?'})`);
      break;
    }
    case 'memory': {
      const sess = currentState.session;
      const tracker = SolverMemory.createTracker();
      tracker.totalCards = (sess.rows || 4) * (sess.cols || 4);
      // Collect known cards from DOM
      const cards = document.querySelectorAll('.mem-card.is-face-up');
      for (const card of cards) {
        const idx = Number(card.dataset.index);
        const sym = card.dataset.symbol;
        if (sym) SolverMemory.update(tracker, idx, sym, false);
      }
      const matched = document.querySelectorAll('.mem-card.is-matched');
      for (const card of matched) {
        const idx = Number(card.dataset.index);
        tracker.matchedIndices.add(idx);
      }
      const suggestion = SolverMemory.suggestNext(tracker);
      if (suggestion) {
        Panel.showHint(`推荐翻第 ${suggestion.index + 1} 张 (${suggestion.reason})`);
      } else {
        Panel.showHint('翻任意未知卡片');
      }
      break;
    }
    case 'puzzle15': {
      const sess = currentState.session;
      if (!sess || !sess.board) return;
      const solution = SolverPuzzle15.solve(sess.board, sess.size);
      if (solution) {
        const stepsEl = document.getElementById('ga-steps');
        if (stepsEl) {
          const maxShow = 30;
          stepsEl.innerHTML = solution.slice(0, maxShow).map((s, i) =>
            `<div class="ga-step">${i + 1}. 移动 ${s.tile}</div>`
          ).join('') + (solution.length > maxShow
            ? `<div class="ga-step">... 共 ${solution.length} 步</div>` : '');
        }
      } else {
        Panel.showHint('求解中...可能需要较长时间');
      }
      break;
    }
    case 'sudoku': {
      const sess = currentState.session;
      if (!sess || !sess.givens) return;
      const solution = SolverSudoku.solve(sess.givens);
      if (solution) {
        renderSudokuGrid(solution, sess.givens);
      } else {
        Panel.showHint('无法求解,请检查题目');
      }
      break;
    }
  }
}

function renderSudokuGrid(solution, givens) {
  const grid = document.getElementById('ga-sudoku-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 0; i < 81; i++) {
    const cell = document.createElement('div');
    cell.className = 'ga-sudoku-cell';
    if (givens[i] !== 0) cell.classList.add('is-given');
    else cell.classList.add('is-solved');
    cell.textContent = solution[i];
    grid.appendChild(cell);
  }
}

let autoPlayRunning = false;
let autoPlayStoppedFlag = false;

async function startAutoPlay() {
  if (autoPlayRunning) return;
  if (!currentState || !currentState.hasActiveSession) return;
  autoPlayRunning = true;
  autoPlayStoppedFlag = false;
  Panel.setStatus('自动完成中...', 'busy');

  try {
    switch (currentGameType) {
      case 'puzzle2048': {
        const depthEl = document.getElementById('ga-depth');
        const depth = depthEl ? Number(depthEl.value) || 3 : 3;
        while (!autoPlayStoppedFlag) {
          currentState = await sendCommand('getState');
          if (!currentState || !currentState.hasActiveSession) break;
          const sess = currentState.session;
          if (sess.won || sess.game_over) break;
          const board = sess.board;
          if (!board) break;
          const { direction } = Solver2048.getBestMove(board, depth);
          if (!direction) break;
          Panel.showHint(direction);
          await sendCommand('move', { direction });
          await delay(300, 800);
        }
        break;
      }
      case 'puzzle15': {
        const sess = currentState.session;
        const solution = SolverPuzzle15.solve(sess.board, sess.size);
        if (!solution) { Panel.showHint('无法求解'); break; }
        const stepsEl = document.getElementById('ga-steps');
        for (let i = 0; i < solution.length; i++) {
          if (autoPlayStoppedFlag) break;
          if (stepsEl) stepsEl.innerHTML = solution.slice(i).map((s, j) =>
            `<div class="ga-step" style="${j === 0 ? 'color:#fbbf24' : ''}">${i + j + 1}. 移动 ${s.tile}</div>`
          ).slice(0, 15).join('');
          await sendCommand('move', { tile: solution[i].tile });
          await delay(200, 500);
        }
        break;
      }
      case 'sudoku': {
        const sess = currentState.session;
        const solution = SolverSudoku.solve(sess.givens);
        if (!solution) { Panel.showHint('无法求解'); break; }
        const givens = sess.givens;
        for (let i = 0; i < 81; i++) {
          if (autoPlayStoppedFlag) break;
          if (givens[i] !== 0) continue;
          const r = Math.floor(i / 9);
          const c = i % 9;
          await sendCommand('fillCell', { row: r, col: c, value: solution[i] });
          await delay(150, 400);
        }
        break;
      }
      case 'memory': {
        // For memory, we need to track and pair. Use the solver's logic.
        const sess = currentState.session;
        const total = (sess.rows || 4) * (sess.cols || 4);
        const tracker = SolverMemory.createTracker();
        tracker.totalCards = total;

        for (let round = 0; round < total && !autoPlayStoppedFlag; round++) {
          const suggestion = SolverMemory.suggestNext(tracker);
          const idx = suggestion ? suggestion.index : round;
          await sendCommand('flip', { index: idx });
          await delay(400, 900);

          // Read result from DOM after flip
          const cardEl = document.querySelector(`.mem-card[data-index="${idx}"]`);
          if (cardEl && cardEl.dataset.symbol) {
            const isMatch = cardEl.classList.contains('is-matched');
            SolverMemory.update(tracker, idx, cardEl.dataset.symbol, isMatch);
          }

          // Check if all matched
          const matched = document.querySelectorAll('.mem-card.is-matched').length;
          if (matched >= total) break;
        }
        break;
      }
    }
    Panel.setStatus('完成', 'win');
  } catch (e) {
    Panel.setStatus('出错: ' + e.message, 'loss');
  } finally {
    autoPlayRunning = false;
    autoPlayStoppedFlag = false;
  }
}

function stopAutoPlay() {
  autoPlayStoppedFlag = true;
  autoPlayRunning = false;
  if (typeof Runner !== 'undefined') Runner.stop();
  Panel.setStatus('已停止', 'waiting');
}

function delay(minMs, maxMs) {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((r) => setTimeout(r, ms));
}

function init() {
  injectBridge();
  createPanel();
  // Resume daily run if one was in progress
  setTimeout(() => {
    if (typeof Runner !== 'undefined') Runner.resume();
  }, 1500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
