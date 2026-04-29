'use strict';

// Daily runner: orchestrates checkin + 4 games sequentially.
// Uses sessionStorage to maintain state across page navigations.

const Runner = (() => {
  const STORAGE_KEY = 'ga-runner-state';

  function getState() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    } catch (e) { return null; }
  }

  function setState(s) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }

  function clearState() {
    sessionStorage.removeItem(STORAGE_KEY);
  }

  function delay() {
    const ms = 200 + Math.random() * 600;
    return new Promise((r) => setTimeout(r, ms));
  }

  function addLog(entries, text, level) {
    entries.push({ text, level, time: Date.now() });
    // Update panel if available
    if (typeof Panel !== 'undefined') {
      const completedSteps = entries.filter((e) => e.level === 'win').length;
      const totalSteps = 1 + 12; // checkin + ~3+4+3+4 difficulties
      Panel.renderDailyRunner({
        percent: Math.round((completedSteps / totalSteps) * 100),
        log: entries.slice(-30),
      });
    }
  }

  async function run(depth) {
    const existing = getState();
    if (existing && existing.running) {
      return { error: 'already running — refresh page to reset' };
    }

    const runState = {
      running: true,
      phase: 'init',
      logs: [],
      results: [],
      depth: depth || 3,
      startedAt: Date.now(),
      stopRequested: false,
    };
    setState(runState);

    try {
      addLog(runState.logs, '🚀 开始每日全通...', null);

      // Phase 1: Checkin
      runState.phase = 'checkin';
      setState(runState);
      addLog(runState.logs, '📅 前往签到页面...', null);
      window.location.href = '/checkin';

      // The rest continues after page reload — see resume()
    } catch (e) {
      addLog(runState.logs, '错误: ' + e.message, 'error');
      runState.running = false;
      setState(runState);
    }

    return { ok: true };
  }

  function stop() {
    const s = getState();
    if (s) { s.stopRequested = true; s.running = false; setState(s); }
  }

  // Called on every page load by main.js init() — checks if a run is in progress
  async function resume() {
    const s = getState();
    if (!s || !s.running || s.stopRequested) return;

    await delay();
    await delay(); // Extra delay for page to fully load

    // Wait for inject bridge
    await waitForBridge();

    if (s.phase === 'checkin') {
      await doCheckinPhase(s);
    } else if (s.phase.startsWith('game:')) {
      await doGamePhase(s);
    }
  }

  async function doCheckinPhase(s) {
    try {
      addLog(s.logs, '📅 执行签到...', null);
      setState(s);
      await delay();

      // Try to find and click checkin button
      const btns = document.querySelectorAll('button');
      let clicked = false;
      for (const btn of btns) {
        const text = btn.textContent || '';
        if (text.includes('签到') || text.includes('领取')) {
          btn.click();
          clicked = true;
          addLog(s.logs, '✅ 签到完成', 'win');
          break;
        }
      }
      if (!clicked) {
        addLog(s.logs, '签到按钮未找到 (可能已签到)', null);
      }

      await delay();

      // Move to first game
      s.phase = 'game:puzzle2048';
      s.gameIndex = 0;
      s.diffIndex = 0;
      s.currentGame = { name: '🧩 2048', url: '/puzzle2048', type: 'puzzle2048', diffs: ['mini', 'classic', 'jumbo'] };
      setState(s);
      addLog(s.logs, '🧩 进入 2048...', null);
      window.location.href = s.currentGame.url;
    } catch (e) {
      addLog(s.logs, '签到阶段错误: ' + e.message, 'error');
      advanceToNextGame(s);
    }
  }

  async function doGamePhase(s) {
    if (!s.currentGame) {
      // Move to next game
      advanceToNextGame(s);
      if (s.currentGame) {
        setState(s);
        addLog(s.logs, s.currentGame.name + ' 进入...', null);
        window.location.href = s.currentGame.url;
      } else {
        // All done!
        addLog(s.logs, '🎉 全部完成！', 'win');
        s.running = false;
        setState(s);
        showCompletionNotification(s);
      }
      return;
    }

    const game = s.currentGame;
    const diff = game.diffs[s.diffIndex];
    if (!diff) {
      // All difficulties for this game done
      advanceToNextGame(s);
      setState(s);
      if (s.currentGame) {
        addLog(s.logs, s.currentGame.name + ' 进入...', null);
        window.location.href = s.currentGame.url;
      }
      return;
    }

    try {
      addLog(s.logs, `  ${game.name} ${diff} 开始...`, null);
      setState(s);

      // Wait for game to load and bridge to be ready
      await delay();
      await delay();

      // Start game
      await callStartGame(game.type, diff);
      await delay();
      await delay();

      // Auto-play
      const result = await autoPlay(game.type, s.depth, s);
      addLog(s.logs, `  ${diff}: ${result}`, result === 'won' ? 'win' : null);

      s.diffIndex++;
      setState(s);

      if (result === 'won') {
        // Navigate to next difficulty (same game page, new start)
        // Go to difficulty panel first by refreshing
        window.location.href = game.url;
      } else {
        // Skip remaining difficulties for this game
        advanceToNextGame(s);
        setState(s);
        window.location.href = s.currentGame ? s.currentGame.url : game.url;
      }
    } catch (e) {
      addLog(s.logs, `  ${diff}: 错误 ${e.message}`, 'error');
      advanceToNextGame(s);
      setState(s);
    }
  }

  function advanceToNextGame(s) {
    const GAMES = [
      { name: '🧩 2048', url: '/puzzle2048', type: 'puzzle2048', diffs: ['mini', 'classic', 'jumbo'] },
      { name: '🃏 记忆翻牌', url: '/memory', type: 'memory', diffs: ['easy', 'normal', 'hard', 'hell'] },
      { name: '🧮 华容道', url: '/puzzle15', type: 'puzzle15', diffs: ['easy', 'classic', 'hard'] },
      { name: '🔢 数独', url: '/sudoku', type: 'sudoku', diffs: ['easy', 'normal', 'hard', 'expert'] },
    ];

    if (s.currentGame) {
      const idx = GAMES.findIndex((g) => g.type === s.currentGame.type);
      if (idx >= 0 && idx < GAMES.length - 1) {
        s.currentGame = GAMES[idx + 1];
        s.diffIndex = 0;
        return;
      }
    } else if (s.phase === 'game:puzzle2048') {
      s.currentGame = GAMES[0];
      s.diffIndex = 0;
      return;
    }

    s.currentGame = null;
  }

  async function autoPlay(gameType, depth, s) {
    for (let attempt = 0; attempt < 500; attempt++) {
      if (s.stopRequested) return 'stopped';

      const state = await getPageState();
      if (!state || !state.hasActiveSession) return 'no-session';

      const sess = state.session;
      if (sess.won) return 'won';
      if (sess.game_over) return 'lost';

      if (gameType === 'puzzle2048') {
        const board = sess.board;
        if (!board) return 'no-board';
        const best = Solver2048.getBestMove(board, depth);
        if (!best.direction) return 'stuck';
        await callPageAction('move', { direction: best.direction });
      } else if (gameType === 'puzzle15') {
        const board = sess.board;
        const size = sess.size;
        if (!board) return 'no-board';
        const solution = SolverPuzzle15.solve(board, size);
        if (!solution || solution.length === 0) return 'no-solution';
        for (const step of solution) {
          if (s.stopRequested) return 'stopped';
          await callPageAction('move', { tile: step.tile });
          await delay();
        }
        return 'won';
      } else if (gameType === 'sudoku') {
        const givens = sess.givens;
        if (!givens) return 'no-givens';
        const solution = SolverSudoku.solve(givens);
        if (!solution) return 'no-solution';
        for (let i = 0; i < 81; i++) {
          if (s.stopRequested) return 'stopped';
          if (givens[i] !== 0) continue;
          const r = Math.floor(i / 9);
          const c = i % 9;
          await callPageAction('fillCell', { row: r, col: c, value: solution[i] });
          await delay();
        }
        return 'won';
      } else if (gameType === 'memory') {
        // Memory is trickier — need to track flips. Simplified approach: flip all cards in order.
        const total = sess.rows * sess.cols;
        for (let i = 0; i < total && !sess.won; i++) {
          if (s.stopRequested) return 'stopped';
          await callPageAction('flip', { index: i });
          await delay();
        }
        const finalState = await getPageState();
        if (finalState && finalState.session && finalState.session.won) return 'won';
        return 'completed';
      }

      await delay();
    }
    return 'timeout';
  }

  function waitForBridge() {
    return new Promise((resolve) => {
      const handler = (ev) => {
        if (ev.data.source === 'ga-inject' && ev.data.type === 'ready') {
          window.removeEventListener('message', handler);
          setTimeout(resolve, 500);
        }
      };
      window.addEventListener('message', handler);
      setTimeout(resolve, 5000);
    });
  }

  function getPageState() {
    return new Promise((resolve) => {
      const cmdId = 'runner-' + Date.now();
      const handler = (ev) => {
        if (ev.data.source === 'ga-inject' && ev.data.commandId === cmdId) {
          window.removeEventListener('message', handler);
          resolve(ev.data.data);
        }
      };
      window.addEventListener('message', handler);
      window.dispatchEvent(new CustomEvent('ga-command', {
        detail: { commandId: cmdId, type: 'getState' },
      }));
      setTimeout(() => resolve(null), 5000);
    });
  }

  function callPageAction(type, payload) {
    return new Promise((resolve) => {
      const cmdId = 'runner-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
      const handler = (ev) => {
        if (ev.data.source === 'ga-inject' && ev.data.commandId === cmdId) {
          window.removeEventListener('message', handler);
          resolve(ev.data.data);
        }
      };
      window.addEventListener('message', handler);
      window.dispatchEvent(new CustomEvent('ga-command', {
        detail: { commandId: cmdId, type, payload },
      }));
      setTimeout(() => resolve(null), 10000);
    });
  }

  function callStartGame(gameType, difficulty) {
    return new Promise((resolve) => {
      const cmdId = 'runner-' + Date.now();
      const handler = (ev) => {
        if (ev.data.source === 'ga-inject' && ev.data.commandId === cmdId) {
          window.removeEventListener('message', handler);
          resolve(ev.data.data);
        }
      };
      window.addEventListener('message', handler);
      window.dispatchEvent(new CustomEvent('ga-command', {
        detail: { commandId: cmdId, type: 'startGame', payload: { difficulty } },
      }));
      setTimeout(() => resolve(null), 10000);
    });
  }

  function showCompletionNotification(s) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'dailyDone',
        results: s.results,
        logs: s.logs.slice(-10),
        duration: Date.now() - s.startedAt,
      });
    }
    clearState();
  }

  return { run, stop, resume, isRunning: () => !!getState()?.running };
})();
