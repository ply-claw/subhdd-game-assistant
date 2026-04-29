'use strict';

// Bridge script — runs in page main world.
// Listens for commands from isolated content script, executes page API calls.

(function () {
  const PAGE = window.location.pathname;
  let gameType = null;
  if (PAGE.startsWith('/puzzle2048')) gameType = 'puzzle2048';
  else if (PAGE.startsWith('/memory')) gameType = 'memory';
  else if (PAGE.startsWith('/puzzle15')) gameType = 'puzzle15';
  else if (PAGE.startsWith('/sudoku')) gameType = 'sudoku';

  window.addEventListener('ga-command', (ev) => {
    const { commandId, type, payload } = ev.detail;

    function respond(data) {
      window.postMessage({
        source: 'ga-inject',
        commandId,
        type: type + 'Result',
        data,
      }, '*');
    }

    try {
      switch (type) {
        case 'getState': {
          const s = window.state;
          if (!s || !s.activeSession) {
            respond({ hasActiveSession: false, gameType });
            break;
          }
          const sess = s.activeSession;
          respond({
            hasActiveSession: true,
            gameType,
            difficulty: sess.difficulty,
            session: {
              session_id: sess.session_id,
              size: sess.size,
              board: sess.board,
              score: sess.score,
              max_tile: sess.max_tile,
              move_count: sess.move_count,
              won: sess.won,
              game_over: sess.game_over,
              rows: sess.rows,
              cols: sess.cols,
              pairs: sess.pairs,
              peek_limit: sess.peek_limit,
              matched_indices: sess.matched_indices,
              givens: sess.givens,
              user_board: sess.user_board,
              conflicts: sess.conflicts,
              starting_board: sess.starting_board,
            },
          });
          break;
        }

        case 'startGame': {
          const fn = window.startGame || (window.state && window.state.config ? window.startGame : null);
          // Call the page's startGame(difficulty)
          if (gameType === 'puzzle2048' && typeof window.startGame === 'function') window.startGame(payload.difficulty);
          else if (gameType === 'memory' && typeof window.startGame === 'function') window.startGame(payload.difficulty);
          else if (gameType === 'puzzle15' && typeof window.startGame === 'function') window.startGame(payload.difficulty);
          else if (gameType === 'sudoku' && typeof window.startGame === 'function') window.startGame(payload.difficulty);
          respond({ ok: true });
          break;
        }

        case 'move': {
          if (typeof window.sendMove === 'function') window.sendMove(payload.direction || payload);
          respond({ ok: true });
          break;
        }

        case 'flip': {
          if (typeof window.flipCard === 'function') window.flipCard(payload.index);
          respond({ ok: true });
          break;
        }

        case 'fillCell': {
          if (typeof window.fillCell === 'function') window.fillCell(payload.row, payload.col, payload.value);
          respond({ ok: true });
          break;
        }

        case 'abandon': {
          if (typeof window.abandonGame === 'function') window.abandonGame();
          respond({ ok: true });
          break;
        }

        case 'getAuth': {
          try {
            respond({ token: localStorage.getItem('auth_token') });
          } catch (e) {
            respond({ token: null });
          }
          break;
        }

        default:
          respond({ error: 'unknown command: ' + type });
      }
    } catch (e) {
      respond({ error: e.message });
    }
  });

  // Signal ready to content script
  window.postMessage({ source: 'ga-inject', type: 'ready', data: { gameType } }, '*');
})();
