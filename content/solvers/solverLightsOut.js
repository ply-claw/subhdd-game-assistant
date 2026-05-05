'use strict';

// Lights Out solver — GF(2) linear algebra.
// Board is N×N. Clicking a cell toggles it and its 4 neighbors.
// Goal: all cells off (0).

const SolverLightsOut = (() => {
  function solve(board, size) {
    const N = size * size;
    const a = Array.from({length: N}, () => new Int32Array(N + 1));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const i = r * size + c;
        a[i][i] = 1;
        if (r > 0) a[i][(r-1)*size + c] = 1;
        if (r < size-1) a[i][(r+1)*size + c] = 1;
        if (c > 0) a[i][r*size + (c-1)] = 1;
        if (c < size-1) a[i][r*size + (c+1)] = 1;
        a[i][N] = board[r][c] ? 1 : 0;
      }
    }
    for (let col = 0; col < N; col++) {
      let pivot = -1;
      for (let row = col; row < N; row++) {
        if (a[row][col]) { pivot = row; break; }
      }
      if (pivot < 0) continue;
      if (pivot !== col) { const t = a[col]; a[col] = a[pivot]; a[pivot] = t; }
      for (let row = 0; row < N; row++) {
        if (row !== col && a[row][col]) {
          for (let k = col; k <= N; k++) a[row][k] ^= a[col][k];
        }
      }
    }
    const clicks = [];
    for (let i = 0; i < N; i++) {
      if (a[i][N]) {
        clicks.push({r: Math.floor(i / size), c: i % size});
      }
    }
    return clicks;
  }

  return { solve };
})();
