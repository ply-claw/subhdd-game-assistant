'use strict';

// Daily runner: orchestrates checkin + 4 games using DOM actions.
// Uses sessionStorage to persist state across page navigations.

const Runner = (() => {
  const STORAGE_KEY = 'ga-runner-state';

  function getState() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function setState(s) { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
  function clearState() { sessionStorage.removeItem(STORAGE_KEY); }
  function delay() {
    return new Promise((r) => setTimeout(r, 200 + Math.random() * 600));
  }

  function addLog(entries, text, level) {
    entries.push({ text, level, time: Date.now() });
    if (typeof Panel !== 'undefined') {
      Panel.renderDailyRunner({
        percent: Math.round((entries.filter((e) => e.level === 'win').length / 13) * 100),
        log: entries.slice(-30),
      });
    }
  }

  async function run(depth) {
    const existing = getState();
    if (existing && existing.running) return { error: 'already running' };

    const s = {
      running: true, phase: 'init', logs: [], results: [],
      depth: depth || 3, startedAt: Date.now(), stopRequested: false,
    };
    setState(s);
    addLog(s.logs, '🚀 开始每日全通...', null);
    s.phase = 'checkin';
    setState(s);
    addLog(s.logs, '📅 前往签到...', null);
    window.location.href = '/checkin';
    return { ok: true };
  }

  function stop() {
    const s = getState();
    if (s) { s.stopRequested = true; s.running = false; setState(s); }
  }

  async function resume() {
    const s = getState();
    if (!s || !s.running || s.stopRequested) return;
    await delay();
    await delay();

    if (s.phase === 'checkin') await doCheckinPhase(s);
    else if (s.phase.startsWith('game:')) await doGamePhase(s);
  }

  async function doCheckinPhase(s) {
    try {
      addLog(s.logs, '📅 签到中...', null);
      await delay();
      const btns = document.querySelectorAll('button');
      let clicked = false;
      for (const btn of btns) {
        if ((btn.textContent || '').includes('签到') || (btn.textContent || '').includes('领取')) {
          btn.click(); clicked = true;
          addLog(s.logs, '✅ 签到完成', 'win');
          break;
        }
      }
      if (!clicked) addLog(s.logs, '签到按钮未找到 (可能已签到)', null);
      await delay();
      s.phase = 'game:puzzle2048';
      s.diffIndex = 0;
      s.currentGame = { name: '💡 点灯', url: '/lightsout', type: 'lightsout', diffs: ['easy','normal','hard'] };
      setState(s);
      addLog(s.logs, '🧩 进入 2048...', null);
      window.location.href = s.currentGame.url;
    } catch (e) {
      addLog(s.logs, '签到错误: ' + e.message, 'error');
      advanceToNext(s);
    }
  }

  async function doGamePhase(s) {
    if (!s.currentGame) { advanceToNext(s); }

    if (!s.currentGame) {
      addLog(s.logs, '🎉 全部完成！', 'win');
      s.running = false; setState(s);
      clearState();
      return;
    }

    const game = s.currentGame;
    const diff = game.diffs[s.diffIndex];
    if (!diff) {
      advanceToNext(s);
      setState(s);
      const next = s.currentGame;
      if (next) { addLog(s.logs, next.name + ' 进入...', null); window.location.href = next.url; }
      else window.location.href = game.url;
      return;
    }

    try {
      addLog(s.logs, `  ${game.name} ${diff} 开始...`, null);
      setState(s);

      // Wait for difficulty buttons to render
      let btns = [];
      for (let i = 0; i < 30; i++) {
        const grid = document.getElementById('difficulty-grid');
        btns = grid ? grid.querySelectorAll('button') : [];
        if (btns.length > 0) break;
        await delay();
      }
      const idx = btns.length - 1 - s.diffIndex;
      if (idx >= 0 && idx < btns.length) {
        if (btns[idx].disabled) {
          addLog(s.logs, `  ${diff}: 已完成，跳过`, null);
          s.diffIndex++;
          setState(s);
          window.location.href = game.url;
          return;
        }
        btns[idx].click();
      }
      else { addLog(s.logs, `  找不到难度 ${diff}`, 'error'); advanceToNext(s); setState(s); return; }

      // Wait for play panel to appear
      for (let i = 0; i < 20; i++) {
        const pp = document.getElementById('play-panel') || document.getElementById('tile-desk');
        if (pp && !pp.hidden) break;
        await delay();
      }

      await delay();
      const result = await autoPlay(game.type, s);
      addLog(s.logs, `  ${diff}: ${result}`, result === 'won' ? 'win' : null);
      s.diffIndex++;
      setState(s);
      window.location.href = game.url;
    } catch (e) {
      addLog(s.logs, `  ${diff}: 错误 ${e.message}`, 'error');
      advanceToNext(s); setState(s);
    }
  }

  async function autoPlay(gameType, s) {
    for (let attempt = 0; attempt < 500; attempt++) {
      if (s.stopRequested) return 'stopped';

      const pp = document.getElementById('play-panel') || document.getElementById('tile-desk');
      if (!pp || pp.hidden) return 'no-session';

      const statusEl = document.getElementById('page-status');
      if (statusEl) {
        if (statusEl.classList.contains('is-win')) return 'won';
        if (statusEl.classList.contains('is-loss')) return 'lost';
      }

      switch (gameType) {
        case 'puzzle2048': {
          const tiles = document.querySelectorAll('.p2048-tile');
          const wrap = document.getElementById('board-wrap');
          const size = wrap ? parseInt(getComputedStyle(wrap).getPropertyValue('--size')) || 4 : 4;
          const board = Array.from({length: size}, () => Array(size).fill(0));
          tiles.forEach((t) => {
            const r = parseInt(t.dataset.r), c = parseInt(t.dataset.c), v = parseInt(t.dataset.v);
            if (!isNaN(r) && !isNaN(c)) board[r][c] = v || 0;
          });
          const best = Solver2048.getBestMove(board, s.depth);
          if (!best || !best.direction) return 'stuck';
          const prevMoves = parseInt(document.getElementById('hud-moves')?.textContent) || 0;
          const km = {up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'};
          document.dispatchEvent(new KeyboardEvent('keydown', {key: km[best.direction], bubbles: true}));
          // Wait for server to process
          for (let w = 0; w < 30; w++) {
            await delay();
            const curMoves = parseInt(document.getElementById('hud-moves')?.textContent) || 0;
            if (curMoves !== prevMoves) break;
            if (document.getElementById('page-status')?.classList.contains('is-win')) break;
            if (document.getElementById('page-status')?.classList.contains('is-loss')) break;
          }
          break;
        }
        case 'puzzle15': {
          const tiles = document.querySelectorAll('.p15-tile');
          const wrap = document.getElementById('board-wrap');
          const size = wrap ? parseInt(getComputedStyle(wrap).getPropertyValue('--size')) || 4 : 4;
          const board = Array(size * size).fill(0);
          tiles.forEach((t) => {
            const v = parseInt(t.dataset.value);
            const cellSize = parseFloat(getComputedStyle(wrap).getPropertyValue('--cell-size')) || 80;
            const gap = parseFloat(getComputedStyle(wrap).getPropertyValue('--cell-gap')) || 6;
            const pad = parseFloat(getComputedStyle(wrap).getPropertyValue('--board-pad')) || 14;
            const left = parseFloat(t.style.left) || 0;
            const top = parseFloat(t.style.top) || 0;
            const c = Math.round((left - pad) / (cellSize + gap));
            const r = Math.round((top - pad) / (cellSize + gap));
            if (r >= 0 && r < size && c >= 0 && c < size) board[r * size + c] = v || 0;
          });
          const sol = await SolverPuzzle15.solve(board, size);
          if (!sol || sol.length === 0) return 'no-solution';
          for (const step of sol) {
            if (s.stopRequested) return 'stopped';
            const tileEl = document.querySelector(`.p15-tile[data-value="${step.tile}"]`);
            const posBefore = tileEl ? {left: tileEl.style.left, top: tileEl.style.top} : null;
            if (tileEl) tileEl.click();
            // Wait for move to process
            for (let w = 0; w < 20; w++) {
              await delay();
              const tAfter = document.querySelector(`.p15-tile[data-value="${step.tile}"]`);
              if (posBefore && tAfter && (tAfter.style.left !== posBefore.left || tAfter.style.top !== posBefore.top)) break;
              if (document.getElementById('page-status')?.classList.contains('is-win')) break;
            }
          }
          return 'won';
        }
        case 'sudoku': {
          const cells = document.querySelectorAll('.sudoku-cell');
          const givens = Array(81).fill(0);
          cells.forEach((cell) => {
            const r = parseInt(cell.dataset.row), c = parseInt(cell.dataset.col);
            if (!isNaN(r) && !isNaN(c) && cell.classList.contains('is-given')) {
              givens[r * 9 + c] = parseInt(cell.textContent) || 0;
            }
          });
          const sol = SolverSudoku.solve(givens);
          if (!sol) return 'no-solution';
          for (let i = 0; i < 81; i++) {
            if (s.stopRequested) return 'stopped';
            if (givens[i] !== 0) continue;
            const r = Math.floor(i / 9), c = i % 9;
            const cell = document.querySelector(`.sudoku-cell[data-row="${r}"][data-col="${c}"]`);
            if (cell) cell.click();
            const btn = document.querySelector(`.np-btn[data-val="${sol[i]}"]`);
            if (btn) btn.click();
            // Wait for server to process the fill
            for (let w = 0; w < 20; w++) {
              await delay();
              if (cell && cell.textContent.trim() === String(sol[i])) break;
            }
          }
          return 'won';
        }
        case 'memory': {
          const total = document.querySelectorAll('.mem-card').length;
          const known = new Map();
          for (let round = 0; round < total && !s.stopRequested; round++) {
            if (document.querySelectorAll('.mem-card.is-matched').length >= total) return 'won';

            // Get unknown cards
            const unknowns = [];
            document.querySelectorAll('.mem-card:not(.is-matched):not(.is-face-up)').forEach(c => {
              unknowns.push(parseInt(c.dataset.index));
            });
            if (unknowns.length === 0) break;

            // Flip first unknown
            const firstIdx = unknowns[0];
            const card1 = document.querySelector(`.mem-card[data-index="${firstIdx}"]`);
            if (card1) card1.click();
            // Wait for reveal
            for (let w = 0; w < 30; w++) {
              await delay();
              if (card1.classList.contains('is-face-up') || card1.classList.contains('is-matched')) break;
            }
            const sym1 = card1?.dataset?.symbol;

            // Look for matching known card or flip next unknown
            let secondIdx = -1;
            for (const [idx, sym] of known) {
              if (sym === sym1 && idx !== firstIdx) { secondIdx = idx; break; }
            }
            if (secondIdx < 0) {
              secondIdx = unknowns.find(u => u !== firstIdx);
              if (secondIdx === undefined) break;
            }

            const card2 = document.querySelector(`.mem-card[data-index="${secondIdx}"]`);
            if (card2) card2.click();
            for (let w = 0; w < 30; w++) {
              await delay();
              if (card2.classList.contains('is-face-up') || card2.classList.contains('is-matched')) break;
            }

            // Track symbols
            if (sym1) known.set(firstIdx, sym1);
            const sym2 = card2?.dataset?.symbol;
            if (sym2) known.set(secondIdx, sym2);

            // Wait for mismatch resolution
            for (let w = 0; w < 15; w++) {
              await delay();
              if (!document.querySelector('.mem-card.is-face-up:not(.is-matched)')) break;
            }
          }
          return document.querySelectorAll('.mem-card.is-matched').length >= total ? 'won' : 'completed';
        }
        case 'tile': {
          const sol = SolverTile.solve();
          if (!sol) return 'no-solution';
          for (const step of sol) {
            if (s.stopRequested) return 'stopped';
            if (document.getElementById('page-status')?.classList.contains('is-win')) return 'won';
            const prev = document.getElementById('remaining-count')?.textContent;
            const el = document.querySelector(`#tile-stage [data-id="${step.id}"]`);
            if (el) el.click();
            for (let w = 0; w < 30; w++) {
              await delay();
              if (document.getElementById('page-status')?.classList.contains('is-win')) return 'won';
              if (document.getElementById('remaining-count')?.textContent !== prev) break;
            }
          }
          return document.getElementById('page-status')?.classList.contains('is-win') ? 'won' : 'completed';
        }
        default: return 'unknown';
      }
      await delay();
    }
    return 'timeout';
  }

  function advanceToNext(s) {
    const GAMES = [
      { name: '🃏 记忆翻牌', url: '/memory', type: 'memory', diffs: ['hell','hard','normal','easy'] },
      { name: '🔢 数独', url: '/sudoku', type: 'sudoku', diffs: ['expert','hard','normal','easy'] },
      { name: '🧮 华容道', url: '/puzzle15', type: 'puzzle15', diffs: ['hard','classic','easy'] },
      { name: '🐑 羊了个羊', url: '/tile', type: 'tile', diffs: ['hell','hard','normal','easy'] },
      { name: '💡 点灯', url: '/lightsout', type: 'lightsout', diffs: ['easy','normal','hard'] },
      { name: '🌀 迷宫', url: '/maze', type: 'maze', diffs: ['easy','normal','hard'] },
      { name: '💣 扫雷', url: '/minesweeper', type: 'minesweeper', diffs: ['beginner','intermediate','expert'] },
      { name: '🔗 连线', url: '/flowfree', type: 'flowfree', diffs: ['easy','normal','hard'] },
      { name: '📦 推箱子', url: '/sokoban', type: 'sokoban', diffs: ['easy','normal','hard'] },
      { name: '🧶 数织', url: '/nonogram', type: 'nonogram', diffs: ['easy','normal','hard'] },
      { name: '🧩 2048', url: '/puzzle2048', type: 'puzzle2048', diffs: ['jumbo','classic'] },
    ];
    if (!s.currentGame) { s.currentGame = GAMES[0]; s.diffIndex = 0; return; }
    const idx = GAMES.findIndex((g) => g.type === s.currentGame.type);
    if (idx >= 0 && idx < GAMES.length - 1) {
      s.currentGame = GAMES[idx + 1];
      s.diffIndex = 0;
    } else {
      s.currentGame = null;
    }
  }

  return { run, stop, resume, isRunning: () => !!getState()?.running };
})();
