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
      Panel.showHint('正在解算...');
      const el = document.getElementById('ga-steps');
      if (el) el.textContent = '正在解算...';
      const timerInterval = startTimer();
      await new Promise(r => setTimeout(r, 50));
      const startMs = Date.now();
      const sol = SolverPuzzle15.solve(sess.board, sess.size);
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
      stopTimer(timerInterval);
      if (sol && el) {
        el.innerHTML = sol.slice(0, 30).map((s, i) =>
          `<div class="ga-step">${i + 1}. 移动 ${s.tile}</div>`).join('') +
          (sol.length > 30 ? `<div class="ga-step">... 共 ${sol.length} 步</div>` : '');
        Panel.showHint(`解算完成，耗时 ${elapsed}s · 共 ${sol.length} 步`);
      } else if (el) {
        el.textContent = sol === null ? '无法求解' : '已还原';
        Panel.showHint(sol === null ? `无法求解 (耗时 ${elapsed}s)` : '已还原');
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
        let lastDir = '';
        let stuckCount = 0;
        while (!autoPlayStoppedFlag) {
          await delay(300, 800);
          const s = readGameState();
          if (!s.hasActiveSession || s.session.won || s.session.game_over) break;
          const best = Solver2048.getBestMove(s.session.board, depth);
          if (!best || !best.direction) break;
          // Detect stuck: same direction repeated without effect
          if (best.direction === lastDir) {
            stuckCount++;
            if (stuckCount > 3) {
              console.log('[GA] stuck, trying all directions');
              const dirs = ['up','down','left','right'];
              for (const d of dirs) {
                if (d !== lastDir) {
                  actMove(d); await delay(200, 400);
                  break;
                }
              }
              stuckCount = 0;
            }
          } else { stuckCount = 0; }
          lastDir = best.direction;
          Panel.showHint({up:'↑',down:'↓',left:'←',right:'→'}[best.direction]||best.direction);
          actMove(best.direction);
        }
        break;
      }
      case 'puzzle15': {
        let s = readGameState();
        if (!s.hasActiveSession) break;
        const el = document.getElementById('ga-steps');
        if (el) el.textContent = '';
        Panel.showHint('正在解算...'); Panel.setStatus('解算中...', 'busy');
        const ti = startTimer();
        await new Promise(r => setTimeout(r, 50));
        const solveStart = Date.now();
        let sol = SolverPuzzle15.solve(s.session.board, s.session.size);
        const elapsed = ((Date.now() - solveStart) / 1000).toFixed(1);
        stopTimer(ti);
        if (!sol) { Panel.showHint(`无法求解 (耗时 ${elapsed}s)`); Panel.setStatus('进行中', 'ready'); break; }
        Panel.showHint(`解算完成 ${elapsed}s · 共 ${sol.length} 步`);
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

let timerId = null;
function startTimer() {
  const start = Date.now();
  const hint = document.getElementById('ga-hint');
  timerId = setInterval(() => {
    const secs = ((Date.now() - start) / 1000).toFixed(1);
    if (hint) hint.textContent = `正在解算... ${secs}s`;
  }, 200);
  return timerId;
}
function stopTimer(id) {
  clearInterval(id);
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
