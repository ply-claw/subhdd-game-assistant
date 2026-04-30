'use strict';

// Sliding puzzle solver: reduce-and-conquer for 5×5, IDA* for ≤4×4.
// Strategy: solve top row + left column → reduces to (N-1)×(N-1) sub-puzzle.
// Each tile is placed with BFS, locking solved cells.

const SolverPuzzle15 = (() => {

  function boardToKey(b) { return b.join(','); }
  function getGoal(size) {
    const g = []; for (let i=1;i<size*size;i++) g.push(i); g.push(0); return g;
  }

  function manhattan(board, size) {
    let d = 0;
    for (let i = 0; i < board.length; i++) {
      const v = board[i]; if (v === 0) continue;
      const tr = Math.floor((v - 1) / size), tc = (v - 1) % size;
      d += Math.abs(Math.floor(i / size) - tr) + Math.abs((i % size) - tc);
    }
    return d;
  }

  function linearConflict(board, size) {
    let c = 0;
    for (let r = 0; r < size; r++)
      for (let c1 = 0; c1 < size; c1++) {
        const v1 = board[r*size+c1]; if (v1===0) continue;
        if (Math.floor((v1-1)/size)!==r) continue;
        for (let c2=c1+1;c2<size;c2++) {
          const v2=board[r*size+c2]; if(v2===0) continue;
          if(Math.floor((v2-1)/size)!==r) continue;
          if((v1-1)%size>(v2-1)%size) c+=2;
        }
      }
    for (let c = 0; c < size; c++)
      for (let r1 = 0; r1 < size; r1++) {
        const v1 = board[r1*size+c]; if (v1===0) continue;
        if ((v1-1)%size!==c) continue;
        for (let r2=r1+1;r2<size;r2++) {
          const v2=board[r2*size+c]; if(v2===0) continue;
          if((v2-1)%size!==c) continue;
          if(Math.floor((v1-1)/size)>Math.floor((v2-1)/size)) c+=2;
        }
      }
    return c;
  }

  function heuristic(board, size) { return manhattan(board, size) + linearConflict(board, size); }

  function getNeighbors(board, size) {
    const z = board.indexOf(0), r = Math.floor(z/size), c = z%size;
    const n = []; const dirs=[[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dr,dc] of dirs) {
      const nr=r+dr, nc=c+dc; if (nr<0||nr>=size||nc<0||nc>=size) continue;
      const ni=nr*size+nc, nb=board.slice();
      [nb[z],nb[ni]]=[nb[ni],nb[z]]; n.push({board:nb,tile:board[ni]});
    }
    return n;
  }

  // ---- BFS: move tile 'value' to position (tr, tc), keeping 'locked' cells fixed ----
  async function bfsPlaceTile(board, size, value, tr, tc, locked, deadline) {
    const startKey = boardToKey(board);
    const queue = [{ board, path: [] }];
    const visited = new Set([startKey]);
    let head = 0; // index-based queue (avoid O(n) shift)
    const MAX = 500000;

    for (let iter = 0; head < queue.length && iter < MAX; iter++, head++) {
      // Yield periodically
      if (iter % 2000 === 0) {
        if (Date.now() > deadline) return null;
        await new Promise(r => setTimeout(r, 0));
      }

      const cur = queue[head];
      const curBoard = cur.board;

      if (curBoard[tr*size+tc] === value) {
        let ok = true;
        for (const li of locked) {
          if (curBoard[li] !== board[li]) { ok = false; break; }
        }
        if (ok) return cur.path;
      }

      const neighbors = getNeighbors(curBoard, size);
      for (const nb of neighbors) {
        const tileIdx = curBoard.indexOf(nb.tile);
        if (locked.has(tileIdx)) continue;
        const key = boardToKey(nb.board);
        if (visited.has(key)) continue;
        visited.add(key);
        queue.push({ board: nb.board, path: [...cur.path, { tile: nb.tile }] });
      }
    }
    return null;
  }

  // ---- IDA* for ≤4×4 (async with yielding) ----
  async function idaSearch(board, size, g, bound, path, visited, bestNextBound, iterCounter, deadline) {
    iterCounter.val++;
    if (iterCounter.val % 2000 === 0) {
      if (Date.now() > deadline) throw new Error('timeout');
      await new Promise(r => setTimeout(r, 0));
    }
    const f = g + heuristic(board, size);
    if (f > bound) { bestNextBound.val = Math.min(bestNextBound.val, f); return null; }
    const goal = getGoal(size);
    if (board.every((v, i) => v === goal[i])) return path;
    const key = boardToKey(board);
    if (visited.has(key) && visited.get(key) <= g) return null;
    visited.set(key, g);
    const neighbors = getNeighbors(board, size);
    neighbors.sort((a, b) => heuristic(a.board, size) - heuristic(b.board, size));
    for (const nb of neighbors) {
      const r = await idaSearch(nb.board, size, g+1, bound,
        [...path, {tile:nb.tile}], visited, bestNextBound, iterCounter, deadline);
      if (r) return r;
    }
    return null;
  }

  async function solveIDA(board, size) {
    const goal = getGoal(size);
    if (board.every((v,i)=>v===goal[i])) return [];
    let bound = heuristic(board, size);
    const MAX = size<=3?30:80;
    const DEADLINE = Date.now() + 15000;
    const iter = {val:0};
    try {
      while (bound <= MAX) {
        if (Date.now()>DEADLINE) return null;
        const visited = new Map();
        const nxt = {val:Infinity};
        const r = await idaSearch(board, size, 0, bound, [], visited, nxt, iter, DEADLINE);
        if (r) return r;
        if (nxt.val===Infinity) return null;
        bound = Math.max(bound+1, nxt.val);
        await new Promise(r=>setTimeout(r,0));
      }
    } catch(e) { if(e.message==='timeout') return null; throw e; }
    return null;
  }

  // ---- Main solve: reduce-and-conquer ----
  async function solve(board, size) {
    const goal = getGoal(size);
    if (board.every((v,i)=>v===goal[i])) return [];

    let curBoard = board.slice();
    const allMoves = [];

    // For 5×5: solve top row + left column → 4×4 sub-puzzle → IDA*
    if (size >= 5) {
      const locked = new Set();
      const DEADLINE = Date.now() + 60000; // 60s total for 5x5

      // Solve top row: tiles 1 to size
      for (let c = 0; c < size; c++) {
        if (Date.now() > DEADLINE) return null;
        const value = c + 1;
        const tr = 0, tc = c;
        if (curBoard[tr*size+tc] === value) {
          locked.add(tr*size+tc);
          continue;
        }
        const path = await bfsPlaceTile(curBoard, size, value, tr, tc, locked, DEADLINE);
        if (!path) return null;
        for (const step of path) {
          const z = curBoard.indexOf(0);
          const tileIdx = curBoard.indexOf(step.tile);
          [curBoard[z], curBoard[tileIdx]] = [curBoard[tileIdx], curBoard[z]];
          allMoves.push(step);
        }
        locked.add(tr*size+tc);
      }

      // Solve left column: tiles size+1, 2*size+1, ...
      for (let r = 1; r < size; r++) {
        if (Date.now() > DEADLINE) return null;
        const value = r * size + 1;
        const tr = r, tc = 0;
        if (curBoard[tr*size+tc] === value) {
          locked.add(tr*size+tc);
          continue;
        }
        const path = await bfsPlaceTile(curBoard, size, value, tr, tc, locked, DEADLINE);
        if (!path) return null;
        for (const step of path) {
          const z = curBoard.indexOf(0);
          const tileIdx = curBoard.indexOf(step.tile);
          [curBoard[z], curBoard[tileIdx]] = [curBoard[tileIdx], curBoard[z]];
          allMoves.push(step);
        }
        locked.add(tr*size+tc);
      }

      // Now extract the (size-1)×(size-1) sub-puzzle
      const subSize = size - 1;
      const subBoard = [];
      for (let r = 1; r < size; r++)
        for (let c = 1; c < size; c++)
          subBoard.push(curBoard[r*size+c]);

      // Remap to 1..(subSize^2-1), 0
      // The sub-puzzle's "correct" values are offset
      const offset = size + 1; // first tile of sub-puzzle = size+1+1? Actually tile at (1,1) = 1*size+2
      // Actually for 5x5: top row (1-5) and left col (6,11,16,21) are solved.
      // Remaining tiles: 7,8,9,10, 12,13,14,15, 17,18,19,20, 22,23,24,25 → plus 0.
      // In a 4x4 format, the goal is 7→1, 8→2, ..., 25→16, 0→0.
      // The sub-board values are the original values. For IDA*, the goal is:
      const subGoal = getGoal(subSize);
      // Map: original value → sub-puzzle value
      const valMap = {};
      const subGoalVals = []; // sub-puzzle goal values at each sub-position
      for (let r = 1; r < size; r++) {
        for (let c = 1; c < size; c++) {
          const origVal = r * size + c + 1; // correct value at (r,c)
          const subIdx = (r-1) * subSize + (c-1);
          if (origVal <= size*size) valMap[origVal] = subGoal[subIdx];
        }
      }
      valMap[0] = 0;

      // Remap subBoard values
      const mappedSubBoard = subBoard.map(v => valMap[v] !== undefined ? valMap[v] : 0);

      // Solve sub-puzzle
      const subMoves = await solveIDA(mappedSubBoard, subSize);
      if (!subMoves) return null;

      // Map sub-moves back to original board coordinates
      for (const sm of subMoves) {
        // sm.tile is the sub-puzzle tile value. Find original value.
        const subTile = sm.tile;
        let origTile = null;
        for (const [ov, sv] of Object.entries(valMap)) {
          if (sv === subTile) { origTile = parseInt(ov); break; }
        }
        if (origTile === null) return null;
        allMoves.push({ tile: origTile });
      }

      return allMoves;
    }

    // For 3×3 and 4×4: use IDA* directly
    return await solveIDA(curBoard, size);
  }

  return { solve };
})();
