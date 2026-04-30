'use strict';

// IDA* solver for 15-puzzle (sliding number puzzle).
// Board is 1D array, 0 = empty space. Goal: 1,2,...,N²-1,0 (row-major).
// Uses iterative deepening A* (no priority queue overhead).

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

  function manhattan(board, size) {
    let dist = 0;
    for (let i = 0; i < board.length; i++) {
      const v = board[i];
      if (v === 0) continue;
      const tr = Math.floor((v - 1) / size);
      const tc = (v - 1) % size;
      dist += Math.abs(Math.floor(i / size) - tr) + Math.abs((i % size) - tc);
    }
    return dist;
  }

  function linearConflict(board, size) {
    let conflict = 0;
    for (let r = 0; r < size; r++) {
      for (let c1 = 0; c1 < size; c1++) {
        const v1 = board[r * size + c1];
        if (v1 === 0) continue;
        if (Math.floor((v1 - 1) / size) !== r) continue;
        const t1c = (v1 - 1) % size;
        for (let c2 = c1 + 1; c2 < size; c2++) {
          const v2 = board[r * size + c2];
          if (v2 === 0) continue;
          if (Math.floor((v2 - 1) / size) !== r) continue;
          if (t1c > (v2 - 1) % size) conflict += 2;
        }
      }
    }
    for (let c = 0; c < size; c++) {
      for (let r1 = 0; r1 < size; r1++) {
        const v1 = board[r1 * size + c];
        if (v1 === 0) continue;
        if ((v1 - 1) % size !== c) continue;
        const t1r = Math.floor((v1 - 1) / size);
        for (let r2 = r1 + 1; r2 < size; r2++) {
          const v2 = board[r2 * size + c];
          if (v2 === 0) continue;
          if ((v2 - 1) % size !== c) continue;
          if (t1r > Math.floor((v2 - 1) / size)) conflict += 2;
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
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const ni = nr * size + nc;
      const nb = board.slice();
      [nb[zeroIdx], nb[ni]] = [nb[ni], nb[zeroIdx]];
      neighbors.push({ board: nb, tile: board[ni] });
    }
    return neighbors;
  }

  // IDA* depth-limited DFS with periodic yielding
  async function idaSearch(board, size, g, bound, path, visited, bestNextBound, iterCounter, deadline) {
    // Yield to event loop frequently, and check deadline
    iterCounter.val++;
    if (iterCounter.val % 1000 === 0) {
      if (Date.now() > deadline) throw new Error('timeout');
      await new Promise(r => setTimeout(r, 0));
    }

    const f = g + heuristic(board, size);
    if (f > bound) { bestNextBound.val = Math.min(bestNextBound.val, f); return null; }
    if (board.every((v, i) => v === (i < size * size - 1 ? i + 1 : 0))) return path;

    const key = boardToKey(board);
    if (visited.has(key) && visited.get(key) <= g) return null;
    visited.set(key, g);

    const neighbors = getNeighbors(board, size);
    neighbors.sort((a, b) => heuristic(a.board, size) - heuristic(b.board, size));

    for (const nb of neighbors) {
      const result = await idaSearch(nb.board, size, g + 1, bound,
        [...path, { tile: nb.tile }], visited, bestNextBound, iterCounter, deadline);
      if (result) return result;
    }
    return null;
  }

  async function solve(board, size) {
    const goal = getGoal(size);
    if (board.every((v, i) => v === goal[i])) return [];

    let bound = heuristic(board, size);
    const MAX_BOUND = size <= 3 ? 30 : size === 4 ? 80 : 300;
    const DEADLINE = Date.now() + 30000; // 30s timeout
    const iterCounter = { val: 0 };

    try {
      while (bound <= MAX_BOUND) {
        if (Date.now() > DEADLINE) return null;
        const visited = new Map();
        const bestNextBound = { val: Infinity };
        const result = await idaSearch(board, size, 0, bound, [], visited, bestNextBound, iterCounter, DEADLINE);
        if (result) return result;
        if (bestNextBound.val === Infinity) return null;
        bound = Math.max(bound + 1, bestNextBound.val);
        await new Promise(r => setTimeout(r, 0));
      }
    } catch (e) {
      if (e.message === 'timeout') return null;
      throw e;
    }
    return null;
  }

  return { solve };
})();
