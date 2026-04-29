'use strict';

// A* solver for 15-puzzle (sliding number puzzle).
// Board is 1D array, 0 = empty space.
// Goal: 1, 2, 3, ..., N²-1, 0 (row-major)
// Sizes: 3×3, 4×4, 5×5

const SolverPuzzle15 = (() => {
  function boardToKey(board) {
    return board.join(',');
  }

  function getGoal(size) {
    const goal = [];
    for (let i = 1; i < size * size; i++) goal.push(i);
    goal.push(0);
    return goal;
  }

  // Manhattan distance heuristic
  function manhattan(board, size) {
    let dist = 0;
    for (let i = 0; i < board.length; i++) {
      const v = board[i];
      if (v === 0) continue;
      const targetIdx = v - 1;
      const tr = Math.floor(targetIdx / size);
      const tc = targetIdx % size;
      const r = Math.floor(i / size);
      const c = i % size;
      dist += Math.abs(tr - r) + Math.abs(tc - c);
    }
    return dist;
  }

  // Linear conflict: adds 2 for each pair in same row/col that cross each other
  function linearConflict(board, size) {
    let conflict = 0;
    // Row conflicts
    for (let r = 0; r < size; r++) {
      for (let c1 = 0; c1 < size; c1++) {
        const idx1 = r * size + c1;
        const v1 = board[idx1];
        if (v1 === 0) continue;
        const t1r = Math.floor((v1 - 1) / size);
        if (t1r !== r) continue;
        const t1c = (v1 - 1) % size;
        for (let c2 = c1 + 1; c2 < size; c2++) {
          const idx2 = r * size + c2;
          const v2 = board[idx2];
          if (v2 === 0) continue;
          const t2r = Math.floor((v2 - 1) / size);
          if (t2r !== r) continue;
          const t2c = (v2 - 1) % size;
          if (t1c > t2c) conflict += 2;
        }
      }
    }
    // Col conflicts
    for (let c = 0; c < size; c++) {
      for (let r1 = 0; r1 < size; r1++) {
        const idx1 = r1 * size + c;
        const v1 = board[idx1];
        if (v1 === 0) continue;
        const t1c = (v1 - 1) % size;
        if (t1c !== c) continue;
        const t1r = Math.floor((v1 - 1) / size);
        for (let r2 = r1 + 1; r2 < size; r2++) {
          const idx2 = r2 * size + c;
          const v2 = board[idx2];
          if (v2 === 0) continue;
          const t2c = (v2 - 1) % size;
          if (t2c !== c) continue;
          const t2r = Math.floor((v2 - 1) / size);
          if (t1r > t2r) conflict += 2;
        }
      }
    }
    return conflict;
  }

  function heuristic(board, size) {
    return manhattan(board, size) + linearConflict(board, size);
  }

  function getNeighbors(board, size) {
    const zeroIdx = board.indexOf(0);
    const r = Math.floor(zeroIdx / size);
    const c = zeroIdx % size;
    const neighbors = [];
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const newIdx = nr * size + nc;
      const newBoard = [...board];
      [newBoard[zeroIdx], newBoard[newIdx]] = [newBoard[newIdx], newBoard[zeroIdx]];
      neighbors.push({ board: newBoard, tile: board[newIdx] });
    }
    return neighbors;
  }

  // A* search returning array of moves [{tile}, ...]
  function solve(board, size) {
    const start = board.slice();
    const goal = getGoal(size);
    const startKey = boardToKey(start);
    const goalKey = boardToKey(goal);

    if (startKey === goalKey) return [];

    // Priority queue: map of key → {board, g, f, path}
    const openSet = new Map();
    const startH = heuristic(start, size);
    openSet.set(startKey, { g: 0, f: startH, path: [] });

    const bestG = new Map();
    bestG.set(startKey, 0);

    let iterations = 0;
    const MAX_ITER = 500000;

    while (openSet.size > 0 && iterations < MAX_ITER) {
      iterations++;

      // Find entry with lowest f
      let minKey = null;
      let minF = Infinity;
      for (const [key, val] of openSet) {
        if (val.f < minF) { minF = val.f; minKey = key; }
      }

      const current = openSet.get(minKey);
      openSet.delete(minKey);

      if (minKey === goalKey) return current.path;

      // Reconstruct board from key for neighbors
      const curBoard = minKey.split(',').map(Number);
      const neighbors = getNeighbors(curBoard, size);

      for (const nb of neighbors) {
        const nbKey = boardToKey(nb.board);
        const newG = current.g + 1;
        const prevBest = bestG.get(nbKey);
        if (prevBest !== undefined && prevBest <= newG) continue;

        bestG.set(nbKey, newG);
        const h = heuristic(nb.board, size);
        openSet.set(nbKey, {
          g: newG,
          f: newG + h,
          path: [...current.path, { tile: nb.tile }],
        });
      }
    }

    return null; // No solution within iteration limit
  }

  return { solve };
})();
