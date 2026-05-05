'use strict';

// Minesweeper solver — constraint propagation + probability.

const SolverMinesweeper = (() => {
  function readBoard() {
    const cells = document.querySelectorAll('.ms-cell');
    const board = [];
    cells.forEach(c => {
      const r = parseInt(c.dataset.r), c2 = parseInt(c.dataset.c);
      if (isNaN(r) || isNaN(c2)) return;
      if (!board[r]) board[r] = [];
      if (c.classList.contains('is-flagged')) board[r][c2] = {r, c:c2, flagged:true, revealed:false, value:-1};
      else if (c.classList.contains('is-revealed') || c.textContent) {
        let val = -1;
        for (let i = 1; i <= 8; i++) if (c.classList.contains('is-n' + i)) val = i;
        if (val < 0 && c.textContent) val = parseInt(c.textContent) || 0;
        board[r][c2] = {r, c:c2, flagged:false, revealed:true, value:val};
      } else {
        board[r][c2] = {r, c:c2, flagged:false, revealed:false, value:-1};
      }
      board[r][c2].el = c;
    });
    return board;
  }

  function getNeighbors(r, c, rows, cols) {
    const n = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++)
        if (dr !== 0 || dc !== 0) {
          const nr = r+dr, nc = c+dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) n.push({r:nr, c:nc});
        }
    return n;
  }

  function suggest(board, rows, cols) {
    const revealed = [];
    const unrevealed = [];
    for (let r = 0; r < rows; r++) {
      if (!board[r]) continue;
      for (let c = 0; c < cols; c++) {
        const cell = board[r] && board[r][c];
        if (!cell) continue;
        if (cell.revealed && cell.value > 0) revealed.push(cell);
        else if (!cell.revealed && !cell.flagged) unrevealed.push(cell);
      }
    }

    for (const cell of revealed) {
      const neighbors = getNeighbors(cell.r, cell.c, rows, cols);
      const hidden = neighbors.filter(n => {
        const nc = board[n.r] && board[n.r][n.c];
        return nc && !nc.revealed && !nc.flagged;
      });
      const flagged = neighbors.filter(n => {
        const nc = board[n.r] && board[n.r][n.c];
        return nc && nc.flagged;
      }).length;

      if (flagged === cell.value && hidden.length > 0) {
        return { type: 'reveal', r: hidden[0].r, c: hidden[0].c };
      }
      if (hidden.length === cell.value && hidden.some(n => {
        const nc = board[n.r] && board[n.r][n.c];
        return nc && !nc.flagged;
      })) {
        const target = hidden.find(n => {
          const nc = board[n.r] && board[n.r][n.c];
          return nc && !nc.flagged;
        });
        return { type: 'flag', r: target.r, c: target.c };
      }
    }

    if (unrevealed.length > 0) {
      return { type: 'reveal', r: unrevealed[0].r, c: unrevealed[0].c };
    }
    return null;
  }

  return { readBoard, suggest };
})();
