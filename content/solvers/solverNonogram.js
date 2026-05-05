'use strict';

// Nonogram solver — line-by-line constraint deduction.

const SolverNonogram = (() => {
  function readBoard() {
    const boardEl = document.getElementById('ng-board');
    const rows = boardEl ? parseInt(getComputedStyle(boardEl).getPropertyValue('--rows')) || 5 : 5;
    const cols = boardEl ? parseInt(getComputedStyle(boardEl).getPropertyValue('--cols')) || 5 : 5;
    const rowClues = [];
    for (let r = 0; r < rows; r++) {
      const clueEls = document.querySelectorAll(`.ng-row-clue[data-row="${r}"] span, .ng-clue-r[data-row="${r}"] span`);
      rowClues[r] = [...clueEls].map(e => parseInt(e.textContent)).filter(n => !isNaN(n));
    }
    const colClues = [];
    for (let c = 0; c < cols; c++) {
      const clueEls = document.querySelectorAll(`.ng-col-clue[data-col="${c}"] span, .ng-clue-c[data-col="${c}"] span`);
      colClues[c] = [...clueEls].map(e => parseInt(e.textContent)).filter(n => !isNaN(n));
    }
    const board = Array.from({length:rows}, () => Array(cols).fill(0));
    document.querySelectorAll('.ng-cell[data-r][data-c]').forEach(cell => {
      const r = parseInt(cell.dataset.r), c = parseInt(cell.dataset.c);
      if (isNaN(r) || isNaN(c)) return;
      if (cell.classList.contains('is-filled')) board[r][c] = 1;
      else if (cell.classList.contains('is-cross')) board[r][c] = -1;
    });
    return { rows, cols, rowClues, colClues, board };
  }

  function linePossibilities(length, clues, current) {
    if (clues.length === 0) {
      if (current.every(v => v !== 1)) return [Array(length).fill(0)];
      return [];
    }
    const result = [];
    const clue = clues[0];
    const rest = clues.slice(1);
    const minRest = rest.reduce((s, c) => s + c + 1, 0);
    const maxStart = length - clue - minRest;

    for (let start = 0; start <= maxStart; start++) {
      let ok = true;
      for (let i = start; i < start + clue; i++) {
        if (current[i] === 0) continue;
        if (current[i] !== 1) { ok = false; break; }
      }
      if (start > 0 && current[start-1] === 1) ok = false;
      if (start + clue < length && current[start+clue] === 1) ok = false;
      if (!ok) continue;

      const line = Array(length).fill(0);
      for (let i = 0; i < start; i++) line[i] = current[i] === 1 ? 1 : 0;
      for (let i = start; i < start + clue; i++) line[i] = 1;
      if (start + clue < length) line[start+clue] = 0;

      const remainLen = length - start - clue - (start + clue < length ? 1 : 0);
      const subResults = linePossibilities(remainLen > 0 ? remainLen : 0, rest,
        current.slice(start + clue + (start + clue < length ? 1 : 0)));
      for (const sub of subResults) {
        const full = [...line.slice(0, start + clue + (start + clue < length ? 1 : 0)), ...sub];
        while (full.length < length) full.push(0);
        result.push(full.slice(0, length));
      }
    }
    return result;
  }

  function deduce(board, rowClues, colClues, rows, cols) {
    let changed = false;
    for (let r = 0; r < rows; r++) {
      const possibilities = linePossibilities(cols, rowClues[r], board[r]);
      if (possibilities.length === 0) return null;
      const must = Array(cols).fill(0).map((_, i) => possibilities.every(p => p[i] === 1) ? 1 : 0);
      const mustNot = Array(cols).fill(0).map((_, i) => possibilities.every(p => p[i] === 0) ? 1 : 0);
      for (let c = 0; c < cols; c++) {
        if (must[c] && board[r][c] === 0) { board[r][c] = 1; changed = true; }
        if (mustNot[c] && board[r][c] === 0) { board[r][c] = -1; changed = true; }
      }
    }
    for (let c = 0; c < cols; c++) {
      const col = board.map(row => row[c]);
      const possibilities = linePossibilities(rows, colClues[c], col);
      if (possibilities.length === 0) return null;
      const must = Array(rows).fill(0).map((_, i) => possibilities.every(p => p[i] === 1) ? 1 : 0);
      const mustNot = Array(rows).fill(0).map((_, i) => possibilities.every(p => p[i] === 0) ? 1 : 0);
      for (let r = 0; r < rows; r++) {
        if (must[r] && board[r][c] === 0) { board[r][c] = 1; changed = true; }
        if (mustNot[r] && board[r][c] === 0) { board[r][c] = -1; changed = true; }
      }
    }
    return changed;
  }

  function solve(board, rowClues, colClues, rows, cols) {
    let iter = 0;
    while (iter < 100) {
      const changed = deduce(board, rowClues, colClues, rows, cols);
      if (changed === null) return null;
      if (!changed) break;
      iter++;
    }
    const fills = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (board[r][c] === 1) fills.push({r, c});
    return fills;
  }

  return { readBoard, solve };
})();
