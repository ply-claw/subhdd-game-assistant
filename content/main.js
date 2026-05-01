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
  if (path.startsWith('/tile')) return 'tile';
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
  // Tile game uses different DOM structure
  if (currentGameType === 'tile') {
    const desk = document.getElementById('tile-desk');
    if (!desk || desk.hidden) return null;
    return readTileState();
  }

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

// Wait for 2048 board to update after a move (server round-trip)
async function wait2048Update(prevMoveCount) {
  for (let w = 0; w < 50; w++) {
    await delay(100, 150);
    const movesEl = document.getElementById('hud-moves');
    const curMoves = parseInt(movesEl?.textContent) || 0;
    // Board updated if move count changed, or game ended
    if (curMoves !== prevMoveCount) return true;
    const status = document.getElementById('page-status');
    if (status && (status.classList.contains('is-win') || status.classList.contains('is-loss'))) return true;
  }
  return false; // timeout
}

function readTileState() {
  const playPanel = document.getElementById('tile-desk');
  if (!playPanel || playPanel.hidden) return null;
  return {
    difficulty: document.getElementById('cur-difficulty')?.textContent?.trim() || '?',
    moveCount: parseInt(document.getElementById('move-count')?.textContent) || 0,
    remaining: parseInt(document.getElementById('remaining-count')?.textContent) || 0,
    slotCount: parseInt(document.getElementById('slot-count')?.textContent) || 0,
    slotLimit: parseInt(document.getElementById('slot-limit')?.textContent) || 7,
    uncovered: SolverTile.getUncoveredTiles().length,
  };
}

// Tile action: click a specific tile
function actClickTile(tileId) {
  const el = document.querySelector(`#tile-stage [data-id="${tileId}"]`);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  // Dispatch directly on the tile so ev.target.closest('[data-id]') finds it
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: cx, clientY: cy, button: 0 }));
}

function actFlip(index) {
  const card = document.querySelector(`.mem-card[data-index="${index}"]`);
  if (card) card.click();
}

// Flip and wait for the card to reveal its face (up to 5s timeout)
async function actFlipWait(index) {
  const card = document.querySelector(`.mem-card[data-index="${index}"]`);
  if (!card) return null;
  if (card.classList.contains('is-matched')) return 'matched';
  if (card.classList.contains('is-face-up')) return card.dataset.symbol || 'up';

  card.click();

  // Wait for card to become face-up or matched
  for (let i = 0; i < 50; i++) {
    await delay(100, 150);
    if (card.classList.contains('is-matched')) return 'matched';
    if (card.classList.contains('is-face-up')) return card.dataset.symbol || 'up';
  }
  return null; // timeout
}

// Wait for mismatch to resolve (both cards flip back)
async function waitMismatchResolve() {
  for (let i = 0; i < 20; i++) {
    await delay(100, 150);
    const upCards = document.querySelectorAll('.mem-card.is-face-up:not(.is-matched)');
    if (upCards.length === 0) return;
  }
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
      case 'tile': Panel.renderTile(currentState); break;
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

async function showHint() {
  const s = readGameState();
  if (!s.hasActiveSession) return;
  const sess = s.session;

  switch (currentGameType) {
    case 'puzzle2048': {
      if (!sess.board) return;
      const depthEl = document.getElementById('ga-depth');
      const depth = depthEl ? Number(depthEl.value) || 3 : 3;
      const best = Solver2048.getBestMove(sess.board, depth);
      if (!best || !best.direction) { Panel.showHint('无可用方向'); break; }
      const arrows = { up: '↑', down: '↓', left: '←', right: '→' };
      Panel.showHint(`${arrows[best.direction] || best.direction}  (eval: ${best.score ? best.score.toFixed(0) : '?'})`);
      break;
    }
    case 'memory': {
      const cards = document.querySelectorAll('.mem-card');
      const info = [];
      cards.forEach((c) => {
        const idx = parseInt(c.dataset.index);
        if (isNaN(idx)) return;
        if (c.classList.contains('is-matched')) info.push({ idx, sym: c.dataset.symbol, status: 'matched' });
        else if (c.classList.contains('is-face-up')) info.push({ idx, sym: c.dataset.symbol || '?', status: 'revealed' });
        else info.push({ idx, sym: '?', status: 'unknown' });
      });
      // Show in a compact grid
      const total = info.length;
      const cols = sess.cols || 4;
      let tableHTML = '<div class="ga-memory-grid" style="display:grid;grid-template-columns:repeat(' + cols + ',1fr);gap:2px;font-size:10px;margin-bottom:8px">';
      info.forEach((item) => {
        const bg = item.status === 'matched' ? '#14532d' : item.status === 'revealed' ? '#312e81' : '#1e293b';
        tableHTML += `<div style="background:${bg};padding:4px 2px;text-align:center;border-radius:2px" title="idx:${item.idx}">${item.sym}</div>`;
      });
      tableHTML += '</div>';
      const body = document.getElementById('ga-panel-body');
      const existing = document.getElementById('ga-memory-hint');
      if (existing) existing.outerHTML = tableHTML + '<div id="ga-memory-hint" class="ga-hint"></div>';
      else {
        const hintEl = document.getElementById('ga-hint');
        if (hintEl) hintEl.insertAdjacentHTML('beforebegin', tableHTML);
        hintEl.id = 'ga-memory-hint';
      }
      Panel.showHint('点击"自动完成"开始');
      break;
    }
    case 'puzzle15': {
      if (!sess.board || !sess.size) return;
      const el = document.getElementById('ga-steps');
      if (el) el.innerHTML = '<div class="ga-solving-indicator"><span class="ga-spinner"></span> 正在解算<span class="ga-dots">...</span><div class="ga-progress"><div class="ga-progress-fill" id="ga-ida-progress" style="width:0%"></div></div><div id="ga-ida-info" style="font-size:10px;color:#94a3b8;margin-top:4px"></div></div>';
      Panel.showHint('正在解算...');
      const prog = { maxBound: 200, bound: 0, iter: 0 };
      // Update UI periodically
      const uiTimer = setInterval(() => {
        const pct = prog.maxBound > 0 ? Math.round(prog.bound / prog.maxBound * 100) : 0;
        const bar = document.getElementById('ga-ida-progress');
        const info = document.getElementById('ga-ida-info');
        if (bar) bar.style.width = Math.min(pct, 99) + '%';
        if (info) {
          const labels = {1:'行①-②', 2:'行③-⑤', 3:'首列', 4:'4×4'};
          const phase = labels[prog.bound] || `阶段${prog.bound}`;
          if (prog.maxBound > 100) info.textContent = `${phase} · ${(prog.iter/1000).toFixed(0)}k 节点`;
          else info.textContent = `深度 ${prog.bound}/${prog.maxBound} · ${(prog.iter/1000).toFixed(0)}k 节点`;
        }
      }, 500);
      await new Promise(r => setTimeout(r, 50));
      const t0 = Date.now();
      const sol = await SolverPuzzle15.solve(sess.board, sess.size, prog);
      clearInterval(uiTimer);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      if (sol && el) {
        el.innerHTML = sol.slice(0, 30).map((s, i) =>
          `<div class="ga-step">${i + 1}. 移动 ${s.tile}</div>`).join('') +
          (sol.length > 30 ? `<div class="ga-step">... 共 ${sol.length} 步</div>` : '');
        Panel.showHint(`解算完成，耗时 ${secs}s · 共 ${sol.length} 步`);
      } else if (el) {
        if (sol === null) {
          // Keep progress visible, just update status
          Panel.showHint(`超时未解 (耗时 ${secs}s，扫描深度 ${prog.bound}/${prog.maxBound}，${(prog.iter/1000).toFixed(0)}k 节点)`);
        } else {
          el.textContent = '已还原';
          Panel.showHint('已还原');
        }
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
    case 'tile': {
      const sug = SolverTile.suggestNext();
      if (sug) Panel.showHint(`点 #${sug.tile.id}: ${sug.tile.pattern} (${sug.reason})`);
      else Panel.showHint('无可用方块');
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
        const startTime = Date.now();
        const timer = setInterval(() => {
          const hEl = document.getElementById('ga-hint');
          if (hEl) hEl.textContent = `⏱ ${((Date.now()-startTime)/1000).toFixed(1)}s`;
        }, 200);
        while (!autoPlayStoppedFlag) {
          const s = readGameState();
          if (!s.hasActiveSession || s.session.won || s.session.game_over) break;
          const prevMoves = s.session.move_count;
          const best = Solver2048.getBestMove(s.session.board, depth);
          if (!best || !best.direction) break;
          actMove(best.direction);
          await wait2048Update(prevMoves);
        }
        clearInterval(timer);
        const secs = ((Date.now() - startTime) / 1000).toFixed(1);
        const fs = readGameState();
        Panel.showHint(fs.session?.won ? `通关! ⏱ ${secs}s` : `⏱ ${secs}s`);
        break;
      }
      case 'puzzle15': {
        let s = readGameState();
        if (!s.hasActiveSession) break;
        const el = document.getElementById('ga-steps');
        if (el) el.textContent = '';
        Panel.showHint('正在解算...'); Panel.setStatus('解算中...', 'busy');
        const prog = { maxBound: 200, bound: 0, iter: 0 };
        const uiTimer = setInterval(() => {
          const pct = prog.maxBound > 0 ? Math.round(prog.bound / prog.maxBound * 100) : 0;
          const bar = document.getElementById('ga-ida-progress');
          const info = document.getElementById('ga-ida-info');
          if (bar) bar.style.width = Math.min(pct, 99) + '%';
          if (info) {
          const labels = {1:'行①-②', 2:'行③-⑤', 3:'首列', 4:'4×4'};
          const phase = labels[prog.bound] || `阶段${prog.bound}`;
          if (prog.maxBound > 100) info.textContent = `${phase} · ${(prog.iter/1000).toFixed(0)}k 节点`;
          else info.textContent = `深度 ${prog.bound}/${prog.maxBound} · ${(prog.iter/1000).toFixed(0)}k 节点`;
        }
        }, 500);
        await new Promise(r => setTimeout(r, 50));
        const t0 = Date.now();
        let sol = await SolverPuzzle15.solve(s.session.board, s.session.size, prog);
        clearInterval(uiTimer);
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        if (!sol) { Panel.showHint(`超时未解 (耗时 ${secs}s，深度 ${prog.bound}/${prog.maxBound}，${(prog.iter/1000).toFixed(0)}k 节点)`); Panel.setStatus('进行中', 'ready'); break; }
        Panel.showHint(`解算完成 ${secs}s · 共 ${sol.length} 步`);
        for (let i = 0; i < sol.length; i++) {
          if (autoPlayStoppedFlag) break;
          const step = sol[i];
          // Record tile positions before click
          const tileBefore = document.querySelector(`.p15-tile[data-value="${step.tile}"]`);
          const posBefore = tileBefore ? { left: tileBefore.style.left, top: tileBefore.style.top } : null;
          actMoveTile(step.tile);
          // Wait for the server to process and DOM to update
          for (let w = 0; w < 30; w++) {
            await delay(100, 150);
            if (s.session.won) break;
            // Check if tile position changed (server processed the move)
            const tileAfter = document.querySelector(`.p15-tile[data-value="${step.tile}"]`);
            if (tileAfter && posBefore) {
              if (tileAfter.style.left !== posBefore.left || tileAfter.style.top !== posBefore.top) break;
            }
            // Also check if the game status changed
            if (document.getElementById('page-status')?.classList.contains('is-win')) break;
          }
          // Update state
          s = readGameState();
          if (!s.hasActiveSession) break;
          // Update step display
          const stepsEl = document.getElementById('ga-steps');
          if (stepsEl && i < sol.length - 1) {
            stepsEl.innerHTML = sol.slice(i + 1).map((st, j) =>
              `<div class="ga-step" style="${j===0?'color:#fbbf24':''}">${i+j+2}. 移动 ${st.tile}</div>`
            ).slice(0, 15).join('');
          }
        }
        break;
      }
      case 'sudoku': {
        const s = readGameState();
        if (!s.hasActiveSession) break;
        const sol = SolverSudoku.solve(s.session.givens);
        if (!sol) { Panel.showHint('无法求解'); break; }
        renderSudokuGrid(sol, s.session.givens);
        for (let i = 0; i < 81; i++) {
          if (autoPlayStoppedFlag) break;
          if (s.session.givens[i] !== 0) continue;
          const r = Math.floor(i / 9), c = i % 9;
          actFillCell(r, c, sol[i]);
          // Wait for server to process: cell textContent should show the new value
          const cell = document.querySelector(`.sudoku-cell[data-row="${r}"][data-col="${c}"]`);
          for (let w = 0; w < 30; w++) {
            await delay(100, 150);
            if (cell && cell.textContent.trim() === String(sol[i])) break;
          }
        }
        break;
      }
      case 'memory': {
        let s = readGameState();
        if (!s.hasActiveSession) break;
        const totalCards = (s.session.rows || 4) * (s.session.cols || 4);
        const known = new Map(); // index → symbol ('matched' = done)

        // Collect already matched/visible cards
        document.querySelectorAll('.mem-card.is-matched').forEach(c => {
          const idx = parseInt(c.dataset.index);
          if (!isNaN(idx)) known.set(idx, 'matched');
        });
        document.querySelectorAll('.mem-card.is-face-up:not(.is-matched)').forEach(c => {
          const idx = parseInt(c.dataset.index);
          if (!isNaN(idx) && c.dataset.symbol) known.set(idx, c.dataset.symbol);
        });

        while (!autoPlayStoppedFlag) {
          if (document.querySelectorAll('.mem-card.is-matched').length >= totalCards) break;

          // Step 1: Check if we know a pair (two indices with same symbol)
          const symToIdx = new Map();
          let pairA = -1, pairB = -1;
          for (const [idx, sym] of known) {
            if (sym === 'matched') continue;
            if (symToIdx.has(sym)) { pairA = symToIdx.get(sym); pairB = idx; break; }
            symToIdx.set(sym, idx);
          }

          if (pairA >= 0 && pairB >= 0) {
            // Known pair — flip both
            Panel.showHint(`匹配已知对: #${pairA+1} 和 #${pairB+1}`);
            await actFlipWait(pairA);
            const r2 = await actFlipWait(pairB);
            if (r2 === 'matched') { known.set(pairA, 'matched'); known.set(pairB, 'matched'); }
            await waitMismatchResolve();
            updateMemoryPanel(known, totalCards);
            continue;
          }

          // Step 2: Find cards we haven't seen at all
          const unseen = [];
          for (let i = 0; i < totalCards; i++) {
            if (!known.has(i)) unseen.push(i);
          }

          // Step 3: Find seen-but-unmatched cards
          const seenUnmatched = [];
          for (const [idx, sym] of known) {
            if (sym !== 'matched') seenUnmatched.push(idx);
          }

          if (unseen.length === 0 && seenUnmatched.length === 0) break;

          // Flip first card: prefer an unseen one, or a seen unmatched one
          const firstIdx = unseen.length > 0 ? unseen[0] : seenUnmatched[0];
          const r1 = await actFlipWait(firstIdx);
          if (!r1 || r1 === 'matched') { if (r1 === 'matched') known.set(firstIdx, 'matched'); continue; }
          known.set(firstIdx, r1);
          Panel.showHint(`翻#${firstIdx+1}: ${r1}`);

          // Step 4: Check if we now know this symbol's pair
          let matchIdx = -1;
          for (const [idx, sym] of known) {
            if (sym === 'matched' || idx === firstIdx) continue;
            if (sym === r1) { matchIdx = idx; break; }
          }

          if (matchIdx >= 0) {
            // Found the pair — flip it
            const r2 = await actFlipWait(matchIdx);
            if (r2 === 'matched') { known.set(firstIdx, 'matched'); known.set(matchIdx, 'matched'); }
            await waitMismatchResolve();
          } else {
            // Don't know the pair — flip another unseen or seen card
            const remainingUnseen = unseen.filter(u => u !== firstIdx);
            const secondIdx = remainingUnseen.length > 0 ? remainingUnseen[0]
              : (seenUnmatched.find(s => s !== firstIdx) ?? unseen[0]);
            if (secondIdx === undefined) break;
            const r2 = await actFlipWait(secondIdx);
            if (r2 && r2 !== 'matched') known.set(secondIdx, r2);
            if (r2 === 'matched') { known.set(secondIdx, 'matched'); }
            await waitMismatchResolve();
          }

          updateMemoryPanel(known, totalCards);
        }
        break;
      }
      case 'tile': {
        Panel.showHint('正在解算...'); Panel.setStatus('解算中...', 'busy');
        await new Promise(r => setTimeout(r, 50));
        const t0 = Date.now();
        const sol = SolverTile.solve();
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        if (!sol) { Panel.showHint(`无解 (${secs}s)`); Panel.setStatus('无解', 'loss'); break; }
        Panel.showHint(`${secs}s · ${sol.length} 步`);
        for (let i = 0; i < sol.length; i++) {
          if (autoPlayStoppedFlag) break;
          const st = document.getElementById('page-status');
          if (st?.classList.contains('is-win') || st?.classList.contains('is-loss')) break;
          const prev = document.getElementById('remaining-count')?.textContent;
          const prevSlot = document.getElementById('slot-count')?.textContent;
          Panel.showHint(`[${i+1}/${sol.length}] #${sol[i].id} ${sol[i].pattern}`);
          actClickTile(sol[i].id);
          // Wait for server AND animation to complete
          for (let w = 0; w < 40; w++) {
            await delay(150, 200);
            const st = document.getElementById('page-status');
            if (st?.classList.contains('is-win') || st?.classList.contains('is-loss')) break;
            const cr = document.getElementById('remaining-count')?.textContent;
            const cs = document.getElementById('slot-count')?.textContent;
            if (cr !== prev || cs !== prevSlot) { await delay(300, 400); break; } // extra wait for animation
          }
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

function updateMemoryPanel(known, totalCards) {
  const s = readGameState();
  const cols = s.session?.cols || 4;
  const rows = s.session?.rows || 4;
  let html = '<div class="ga-memory-grid" style="display:grid;grid-template-columns:repeat(' + cols + ',1fr);gap:2px;font-size:10px;margin-bottom:8px">';
  for (let i = 0; i < totalCards; i++) {
    const val = known.get(i);
    let bg = '#1e293b', sym = '?';
    if (val === 'matched') { bg = '#14532d'; sym = '✓'; }
    else if (val && val !== 'up') { bg = '#312e81'; sym = val; }
    html += `<div style="background:${bg};padding:4px 2px;text-align:center;border-radius:2px">${sym}</div>`;
  }
  html += '</div>';
  const existing = document.getElementById('ga-memory-grid-ui');
  if (existing) existing.outerHTML = html;
  else {
    const hint = document.getElementById('ga-hint');
    if (hint) hint.insertAdjacentHTML('beforebegin', html);
  }
  // Set ID so we can find it next time
  const grid = document.querySelector('.ga-memory-grid');
  if (grid) grid.id = 'ga-memory-grid-ui';
  const matched = [...known.values()].filter(v => v === 'matched').length;
  Panel.showHint(`已配对 ${matched}/${totalCards/2}`);
}

function delay(minMs, maxMs) {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((r) => setTimeout(r, ms));
}

// ---- Popup communication ----

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'getDailyStatus') {
    getDailyStatus().then(sendResponse);
    return true;
  }
  if (msg.type === 'startDailyRun') {
    const mode = 'inline'; // tab-based mode uses old runner
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
  const remaining = { checkin: '?', memory: '?', sudoku: '?', puzzle15: '?', tile: '?', puzzle2048: '?' };
  // Try to read from DOM (works on game pages with difficulty panel)
  document.querySelectorAll('.diff-remaining').forEach(el => {
    const text = el.textContent || '';
    const m = text.match(/(\d+)\s*\/\s*(\d+)/);
    if (m) {
      const left = parseInt(m[1]);
      // Try to determine game from parent card
      const card = el.closest('[data-diff]');
      if (card) {
        const diff = card.dataset.diff;
        if (diff === 'mini' || diff === 'classic' || diff === 'jumbo') {
          remaining.puzzle2048 = (remaining.puzzle2048 === '?' ? 0 : remaining.puzzle2048) + left;
        } else if (['easy','normal','hard','hell'].includes(diff)) {
          // Could be memory, sudoku, or tile — read from URL
          const path = location.pathname;
          if (path.includes('memory')) remaining.memory = (remaining.memory === '?' ? 0 : remaining.memory) + left;
          else if (path.includes('sudoku')) remaining.sudoku = (remaining.sudoku === '?' ? 0 : remaining.sudoku) + left;
          else if (path.includes('tile')) remaining.tile = (remaining.tile === '?' ? 0 : remaining.tile) + left;
          else if (path.includes('puzzle15')) remaining.puzzle15 = (remaining.puzzle15 === '?' ? 0 : remaining.puzzle15) + left;
        }
      }
    }
  });
  const balEl = document.querySelector('[class*="balance"], [id*="balance"]');
  return { remaining, balance: balEl?.textContent?.replace(/[^0-9.]/g,'') || '—' };
}

// ---- Init ----

async function checkBgRunner() {
  try {
    console.log('[GA] checkBgRunner: sending getRunInfo...');
    const resp = await chrome.runtime.sendMessage({ type: 'getRunInfo' });
    console.log('[GA] checkBgRunner: response', JSON.stringify(resp));
    if (!resp || !resp.phase) return false;

    if (resp.phase === 'checkin') {
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 500));
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
          if ((btn.textContent || '').includes('签到') || (btn.textContent || '').includes('领取')) {
            btn.click();
            await new Promise(r => setTimeout(r, 2000));
            chrome.runtime.sendMessage({ type: 'gameDone', result: { status: 'won', game: 'checkin' } });
            return true;
          }
        }
      }
      chrome.runtime.sendMessage({ type: 'gameDone', result: { status: 'won', game: 'checkin' } });
      return true;
    }

    if (resp.phase === 'game') {
      currentGameType = detectGame();
      if (!currentGameType) return false;
      console.log('[GA] bg-runner:', resp.gameType, resp.difficulty);

      // Wait for difficulty panel to be visible
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 300));
        const dp = document.getElementById('difficulty-panel');
        if (dp && !dp.hidden) break;
      }

      // Click the difficulty
      const card = document.querySelector(`[data-diff="${resp.difficulty}"]`);
      if (!card) { console.warn('[GA] diff card not found:', resp.difficulty); return false; }
      card.click();

      // Wait for game to actually start — play panel visible
      const ppId = currentGameType === 'tile' ? 'tile-desk' : 'play-panel';
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 300));
        const pp = document.getElementById(ppId);
        if (pp && !pp.hidden) break;
      }

      // Wait for game state to be active (API response received)
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 300));
        const s = readGameState();
        if (s && s.hasActiveSession) break;
      }

      createPanel();
      updatePanel();
      startPolling();
      autoPlayStoppedFlag = false;
      autoPlayRunning = false;
      await startAutoPlay();

      const s = readGameState();
      const won = !!(s?.session?.won || document.getElementById('page-status')?.classList.contains('is-win'));
      chrome.runtime.sendMessage({
        type: 'gameDone',
        result: {
          status: won ? 'won' : 'completed',
          game: currentGameType,
          difficulty: resp.difficulty,
        },
      });
      return true;
    }
  } catch (e) { console.error('[GA] checkBgRunner error:', e.message); }
  return false;
}

function init() {
  currentGameType = detectGame();
  if (!currentGameType) {
    checkBgRunner();
    return;
  }
  console.log('[GA] detected game:', currentGameType);

  createPanel();
  updatePanel();
  startPolling();

  checkBgRunner().then(ran => {
    if (!ran) {
      setTimeout(() => {
        if (typeof Runner !== 'undefined') Runner.resume();
      }, 1500);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
