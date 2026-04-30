'use strict';

// DOM-driven game assistant. Reads game state from the page DOM,
// dispatches keyboard/mouse events for auto-play.
// No script injection needed — all game data is in the DOM.

let currentGameType = null;
let currentState = null;
let pollTimer = null;

// Detect game from URL
function detectGame() {
  const path = window.location.pathname;
  if (path.startsWith('/puzzle2048')) return 'puzzle2048';
  if (path.startsWith('/memory')) return 'memory';
  if (path.startsWith('/puzzle15')) return 'puzzle15';
  if (path.startsWith('/sudoku')) return 'sudoku';
  return null;
}

// ---- State reading (DOM-based) ----

function readGameState() {
  const sess = readSessionDOM();
  return {
    hasActiveSession: !!sess,
    gameType: currentGameType,
    session: sess,
  };
}

function readSessionDOM() {
  const playPanel = document.getElementById('play-panel');
  if (!playPanel || playPanel.hidden) return null;

  switch (currentGameType) {
    case 'puzzle2048': return read2048State();
    case 'memory': return readMemoryState();
    case 'puzzle15': return readPuzzle15State();
    case 'sudoku': return readSudokuState();
    default: return null;
  }
}

function read2048State() {
  const tiles = document.querySelectorAll('.p2048-tile');
  const sizeEl = document.getElementById('board-wrap');
  const size = sizeEl ? parseInt(getComputedStyle(sizeEl).getPropertyValue('--size')) || 4 : 4;

  // Build board from tile positions
  const board = Array.from({ length: size }, () => Array(size).fill(0));
  tiles.forEach((t) => {
    const r = parseInt(t.dataset.r);
    const c = parseInt(t.dataset.c);
    const v = parseInt(t.dataset.v);
    if (!isNaN(r) && !isNaN(c) && !isNaN(v)) board[r][c] = v;
  });

  return {
    board,
    size,
    score: parseInt(document.getElementById('hud-score')?.textContent) || 0,
    max_tile: parseInt(document.getElementById('hud-max')?.textContent) || 0,
    move_count: parseInt(document.getElementById('hud-moves')?.textContent) || 0,
    difficulty: document.getElementById('hud-diff')?.textContent?.trim() || '?',
    target_tile: parseInt(document.getElementById('hud-target')?.textContent) || 2048,
    won: document.getElementById('page-status')?.classList.contains('is-win') || false,
    game_over: document.getElementById('page-status')?.classList.contains('is-loss') || false,
  };
}

function readMemoryState() {
  const cards = document.querySelectorAll('.mem-card');
  const rowsVar = getComputedStyle(document.getElementById('board')).getPropertyValue('--rows');
  const colsVar = getComputedStyle(document.getElementById('board')).getPropertyValue('--cols');
  const rows = parseInt(rowsVar) || 4;
  const cols = parseInt(colsVar) || 4;

  const matched = [];
  const revealed = [];
  cards.forEach((card) => {
    const idx = parseInt(card.dataset.index);
    if (isNaN(idx)) return;
    if (card.classList.contains('is-matched')) matched.push(idx);
    else if (card.classList.contains('is-face-up')) revealed.push({ index: idx, symbol: card.dataset.symbol });
  });

  return {
    rows, cols,
    pairs: parseInt(document.getElementById('hud-total')?.textContent) || 0,
    peek_limit: parseInt(document.getElementById('hud-peek-limit')?.textContent) || 0,
    match_count: parseInt(document.getElementById('hud-matched')?.textContent) || 0,
    peek_count: parseInt(document.getElementById('hud-peek')?.textContent) || 0,
    matched_indices: matched,
    currently_revealed: revealed,
    difficulty: document.getElementById('hud-diff')?.textContent?.trim() || '?',
    won: document.getElementById('page-status')?.classList.contains('is-win') || false,
  };
}

function readPuzzle15State() {
  const tiles = document.querySelectorAll('.p15-tile');
  const sizeEl = document.getElementById('board-wrap');
  const size = sizeEl ? parseInt(getComputedStyle(sizeEl).getPropertyValue('--size')) || 4 : 4;

  const board = Array(size * size).fill(0);
  tiles.forEach((t) => {
    const v = parseInt(t.dataset.value);
    const left = parseFloat(t.style.left) || 0;
    const top = parseFloat(t.style.top) || 0;
    const cellSize = parseFloat(getComputedStyle(sizeEl).getPropertyValue('--cell-size')) || 80;
    const gap = parseFloat(getComputedStyle(sizeEl).getPropertyValue('--cell-gap')) || 6;
    const pad = parseFloat(getComputedStyle(sizeEl).getPropertyValue('--board-pad')) || 14;
    const c = Math.round((left - pad) / (cellSize + gap));
    const r = Math.round((top - pad) / (cellSize + gap));
    if (r >= 0 && r < size && c >= 0 && c < size) board[r * size + c] = v;
  });

  return {
    board,
    size,
    move_count: parseInt(document.getElementById('hud-moves')?.textContent) || 0,
    difficulty: document.getElementById('hud-diff')?.textContent?.trim() || '?',
    won: document.getElementById('page-status')?.classList.contains('is-win') || false,
  };
}

function readSudokuState() {
  const cells = document.querySelectorAll('.sudoku-cell');
  const givens = Array(81).fill(0);
  const user_board = Array(81).fill(0);

  cells.forEach((cell) => {
    const r = parseInt(cell.dataset.row);
    const c = parseInt(cell.dataset.col);
    if (isNaN(r) || isNaN(c)) return;
    const idx = r * 9 + c;
    if (cell.classList.contains('is-given')) {
      givens[idx] = parseInt(cell.textContent) || 0;
    }
    user_board[idx] = parseInt(cell.textContent) || 0;
  });

  const conflicts = [];
  cells.forEach((cell) => {
    const r = parseInt(cell.dataset.row);
    const c = parseInt(cell.dataset.col);
    if (cell.classList.contains('is-conflict')) conflicts.push([r, c]);
  });

  return {
    givens,
    user_board,
    conflicts,
    difficulty: document.getElementById('hud-diff')?.textContent?.trim() || '?',
    holes: parseInt(document.getElementById('hud-holes')?.textContent) || 0,
    won: document.getElementById('page-status')?.classList.contains('is-win') || false,
  };
}

// ---- Actions (DOM events) ----

function actMove(direction) {
  const keyMap = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  const key = keyMap[direction] || direction;
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

function actFlip(index) {
  const card = document.querySelector(`.mem-card[data-index="${index}"]`);
  if (card) card.click();
}

function actMoveTile(tileValue) {
  const tile = document.querySelector(`.p15-tile[data-value="${tileValue}"]`);
  if (tile) tile.click();
}

function actFillCell(row, col, value) {
  // Click the cell
  const cell = document.querySelector(`.sudoku-cell[data-row="${row}"][data-col="${col}"]`);
  if (cell) cell.click();
  // Click number pad
  const btn = document.querySelector(`.np-btn[data-val="${value}"]`);
  if (btn) {
    btn.click();
  } else if (value === 0) {
    const clearBtn = document.querySelector('.np-btn.np-clear');
    if (clearBtn) clearBtn.click();
  }
}

function actStartGame(difficulty) {
  // Click the difficulty card
  const diffCard = document.querySelector(`[data-diff="${difficulty}"]`);
  if (diffCard) diffCard.click();
}

// ---- Panel integration ----

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
        <p style="color:#94a3b8;padding:12px;font-size:12px">检测游戏中...</p>
      </div>
      <div class="ga-panel-footer" id="ga-panel-footer"></div>
    </div>
    <button class="ga-panel-toggle" id="ga-panel-toggle" title="展开面板" style="display:none">▶</button>
  `;
  document.body.appendChild(root);

  const panel = root.querySelector('.ga-panel');
  const toggle = root.querySelector('#ga-panel-toggle');
  const close = root.querySelector('.ga-panel-close');

  close.addEventListener('click', () => {
    panel.classList.add('ga-collapsed');
    toggle.style.display = 'block';
  });
  toggle.addEventListener('click', () => {
    panel.classList.remove('ga-collapsed');
    toggle.style.display = 'none';
  });

  const mainEl = document.querySelector('main');
  if (mainEl) mainEl.style.marginRight = '280px';
}

function updatePanel() {
  if (!currentGameType) return;

  if (currentState && currentState.hasActiveSession) {
    stopPolling();
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

function refreshState() {
  currentState = readGameState();
  updatePanel();
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (!currentGameType) return;
    const s = readGameState();
    const wasActive = currentState && currentState.hasActiveSession;
    if (!wasActive && s.hasActiveSession) {
      // Game just started or resumed
      currentState = s;
      updatePanel();
    } else if (s.hasActiveSession && currentState && currentState.hasActiveSession) {
      // Check if board changed
      currentState = s;
    }
  }, 1000);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ---- Hint / Auto play ----

let autoPlayRunning = false;
let autoPlayStoppedFlag = false;

function bindButtons() {
  const hintBtn = document.getElementById('ga-btn-show-hint');
  const autoBtn = document.getElementById('ga-btn-auto');
  const stopBtn = document.getElementById('ga-btn-stop');
  if (hintBtn) hintBtn.onclick = showHint;
  if (autoBtn) autoBtn.onclick = startAutoPlay;
  if (stopBtn) stopBtn.onclick = stopAutoPlay;
}

function showHint() {
  const s = readGameState();
  if (!s.hasActiveSession) return;
  const sess = s.session;

  switch (currentGameType) {
    case 'puzzle2048': {
      if (!sess.board) return;
      const depthEl = document.getElementById('ga-depth');
      const depth = depthEl ? Number(depthEl.value) || 3 : 3;
      const { direction, score } = Solver2048.getBestMove(sess.board, depth);
      const arrows = { up: '↑', down: '↓', left: '←', right: '→' };
      Panel.showHint(`${arrows[direction] || direction}  (eval: ${score ? score.toFixed(0) : '?'})`);
      break;
    }
    case 'memory': {
      const tracker = SolverMemory.createTracker();
      tracker.totalCards = (sess.rows || 4) * (sess.cols || 4);
      const upCards = document.querySelectorAll('.mem-card.is-face-up');
      upCards.forEach((c) => {
        const idx = parseInt(c.dataset.index);
        const sym = c.dataset.symbol;
        if (!isNaN(idx) && sym) SolverMemory.update(tracker, idx, sym, false);
      });
      document.querySelectorAll('.mem-card.is-matched').forEach((c) => {
        const idx = parseInt(c.dataset.index);
        if (!isNaN(idx)) tracker.matchedIndices.add(idx);
      });
      const sug = SolverMemory.suggestNext(tracker);
      Panel.showHint(sug ? `翻第 ${sug.index + 1} 张 (${sug.reason})` : '翻任意未知卡片');
      break;
    }
    case 'puzzle15': {
      if (!sess.board || !sess.size) return;
      const sol = SolverPuzzle15.solve(sess.board, sess.size);
      const el = document.getElementById('ga-steps');
      if (sol && el) {
        el.innerHTML = sol.slice(0, 30).map((s, i) =>
          `<div class="ga-step">${i + 1}. 移动 ${s.tile}</div>`).join('') +
          (sol.length > 30 ? `<div class="ga-step">... 共 ${sol.length} 步</div>` : '');
      } else if (el) {
        el.textContent = sol === null ? '无法求解' : '已还原';
      }
      break;
    }
    case 'sudoku': {
      if (!sess.givens) return;
      const sol = SolverSudoku.solve(sess.givens);
      if (sol) renderSudokuGrid(sol, sess.givens);
      else Panel.showHint('无法求解');
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

async function startAutoPlay() {
  if (autoPlayRunning) return;
  autoPlayRunning = true;
  autoPlayStoppedFlag = false;
  Panel.setStatus('自动完成中...', 'busy');

  try {
    switch (currentGameType) {
      case 'puzzle2048': {
        const depthEl = document.getElementById('ga-depth');
        const depth = depthEl ? Number(depthEl.value) || 3 : 3;
        while (!autoPlayStoppedFlag) {
          await delay(300, 800);
          const s = readGameState();
          if (!s.hasActiveSession || s.session.won || s.session.game_over) break;
          const { direction } = Solver2048.getBestMove(s.session.board, depth);
          if (!direction) break;
          Panel.showHint({up:'↑',down:'↓',left:'←',right:'→'}[direction]||direction);
          actMove(direction);
        }
        break;
      }
      case 'puzzle15': {
        const s = readGameState();
        if (!s.hasActiveSession) break;
        const sol = SolverPuzzle15.solve(s.session.board, s.session.size);
        if (!sol) { Panel.showHint('无法求解'); break; }
        for (const step of sol) {
          if (autoPlayStoppedFlag) break;
          actMoveTile(step.tile);
          await delay(200, 500);
        }
        break;
      }
      case 'sudoku': {
        const s = readGameState();
        if (!s.hasActiveSession) break;
        const sol = SolverSudoku.solve(s.session.givens);
        if (!sol) { Panel.showHint('无法求解'); break; }
        for (let i = 0; i < 81; i++) {
          if (autoPlayStoppedFlag) break;
          if (s.session.givens[i] !== 0) continue;
          const r = Math.floor(i / 9), c = i % 9;
          actFillCell(r, c, sol[i]);
          await delay(150, 400);
        }
        break;
      }
      case 'memory': {
        const tracker = SolverMemory.createTracker();
        let s = readGameState();
        if (!s.hasActiveSession) break;
        tracker.totalCards = (s.session.rows || 4) * (s.session.cols || 4);
        let lastIdx = -1;
        for (let round = 0; round < tracker.totalCards * 2 && !autoPlayStoppedFlag; round++) {
          const sug = SolverMemory.suggestNext(tracker);
          const idx = sug ? sug.index : (round % tracker.totalCards);
          if (idx === lastIdx) continue;
          lastIdx = idx;
          actFlip(idx);
          await delay(400, 900);
          // Read card state from DOM
          const cardEl = document.querySelector(`.mem-card[data-index="${idx}"]`);
          if (cardEl && cardEl.dataset.symbol) {
            SolverMemory.update(tracker, idx, cardEl.dataset.symbol, cardEl.classList.contains('is-matched'));
          }
          // Check if all matched
          const matchedCount = document.querySelectorAll('.mem-card.is-matched').length;
          if (matchedCount >= tracker.totalCards) break;
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

// ---- Popup communication ----

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'getDailyStatus') {
    sendResponse({
      remaining: { checkin: '?', puzzle2048: '?', memory: '?', puzzle15: '?', sudoku: '?' },
      balance: '—',
    });
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

// ---- Init ----

function init() {
  currentGameType = detectGame();
  if (!currentGameType) return;
  console.log('[GA] detected game:', currentGameType);

  createPanel();
  updatePanel();
  startPolling();

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
