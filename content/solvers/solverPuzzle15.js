'use strict';

// Sliding puzzle solver: reduce-and-conquer for 5×5, IDA* for ≤4×4.
// 5×5: A* places each tile of top row + left column → lock them.
// 4×4 (size=4) → IDA* on the remaining unlocked cells.

const SolverPuzzle15 = (() => {

  function boardToKey(b) { return b.join(','); }

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
    for (let cc = 0; cc < size; cc++)
      for (let r1 = 0; r1 < size; r1++) {
        const v1 = board[r1*size+cc]; if (v1===0) continue;
        if ((v1-1)%size!==cc) continue;
        for (let r2=r1+1;r2<size;r2++) {
          const v2=board[r2*size+cc]; if(v2===0) continue;
          if((v2-1)%size!==cc) continue;
          if(Math.floor((v1-1)/size)>Math.floor((v2-1)/size)) c+=2;
        }
      }
    return c;
  }

  function heuristic(board, size) { return manhattan(board, size) + linearConflict(board, size); }

  function getNeighbors(board, size, locked) {
    const z = board.indexOf(0), r = Math.floor(z/size), c = z%size;
    const n = []; const dirs=[[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dr,dc] of dirs) {
      const nr=r+dr, nc=c+dc; if (nr<0||nr>=size||nc<0||nc>=size) continue;
      const ni=nr*size+nc;
      if (locked && locked.has(ni)) continue; // can't swap with locked tile
      const nb=board.slice();
      [nb[z],nb[ni]]=[nb[ni],nb[z]]; n.push({board:nb,tile:board[ni]});
    }
    return n;
  }

  // ---- A* for placing a single tile ----
  class MinHeap {
    constructor() { this.d = []; }
    push(v) { this.d.push(v); let i=this.d.length-1; while(i>0){const p=(i-1)>>1; if(this.d[p].f<=this.d[i].f)break;[this.d[p],this.d[i]]=[this.d[i],this.d[p]];i=p;} }
    pop() { if(this.d.length<=1)return this.d.pop()||null; const t=this.d[0]; this.d[0]=this.d.pop(); let i=0; while(1){let s=i,l=i*2+1,r=i*2+2; if(l<this.d.length&&this.d[l].f<this.d[s].f)s=l; if(r<this.d.length&&this.d[r].f<this.d[s].f)s=r; if(s===i)break;[this.d[i],this.d[s]]=[this.d[s],this.d[i]];i=s;} return t; }
    get size() { return this.d.length; }
  }

  function tileDistance(board, value, tr, tc) {
    const idx = board.indexOf(value);
    if (idx < 0) return 999;
    return Math.abs(Math.floor(idx / Math.round(Math.sqrt(board.length))) - tr) +
           Math.abs((idx % Math.round(Math.sqrt(board.length))) - tc);
  }

  async function placeTile(board, size, value, tr, tc, locked, deadline) {
    const goalIdx = tr*size+tc;
    if (board[goalIdx] === value) return [];

    const startKey = boardToKey(board);
    // Focused heuristic: just the target tile's distance to goal
    const startH = tileDistance(board, value, tr, tc);
    const heap = new MinHeap();
    heap.push({ board, g: 0, f: startH, path: [] });
    const bestG = new Map([[startKey, 0]]);
    const MAX = 200000;

    for (let iter = 0; heap.size > 0 && iter < MAX; iter++) {
      if (iter % 2000 === 0) {
        if (Date.now() > deadline) return null;
        await new Promise(r => setTimeout(r, 0));
      }
      const cur = heap.pop();
      if (!cur) return null;
      if (cur.board[goalIdx] === value) return cur.path;

      const neighbors = getNeighbors(cur.board, size, locked);
      for (const nb of neighbors) {
        const newG = cur.g + 1;
        const key = boardToKey(nb.board);
        if (bestG.has(key) && bestG.get(key) <= newG) continue;
        bestG.set(key, newG);
        const h = tileDistance(nb.board, value, tr, tc);
        heap.push({ board: nb.board, g: newG, f: newG + h, path: [...cur.path, { tile: nb.tile }] });
      }
    }
    return null;
  }

  // ---- IDA* for ≤4×4 (async) ----
  async function idaSearch(board, size, g, bound, path, visited, bestNextBound, iterCounter, deadline, locked) {
    iterCounter.val++;
    if (iterCounter.val % 2000 === 0) {
      if (Date.now() > deadline) throw new Error('timeout');
      await new Promise(r => setTimeout(r, 0));
    }
    const f = g + (locked ? heuristic(board, size) : heuristic(board, size));
    if (f > bound) { bestNextBound.val = Math.min(bestNextBound.val, f); return null; }
    // Check goal: tiles at correct positions
    let done = true;
    for (let i = 0; i < size*size; i++) {
      const expected = i < size*size-1 ? i+1 : 0;
      if (board[i] !== expected) { done = false; break; }
    }
    if (done) return path;

    const key = boardToKey(board);
    if (visited.has(key) && visited.get(key) <= g) return null;
    visited.set(key, g);

    const neighbors = getNeighbors(board, size, locked);
    neighbors.sort((a, b) => heuristic(a.board, size) - heuristic(b.board, size));
    for (const nb of neighbors) {
      const r = await idaSearch(nb.board, size, g+1, bound,
        [...path, {tile:nb.tile}], visited, bestNextBound, iterCounter, deadline, locked);
      if (r) return r;
    }
    return null;
  }

  async function solveIDA(board, size, locked) {
    // Check if already solved
    let done = true;
    for (let i = 0; i < size*size; i++) {
      const expected = i < size*size-1 ? i+1 : 0;
      if (board[i] !== expected) { done = false; break; }
    }
    if (done) return [];

    let bound = heuristic(board, size);
    const MAX = 80;
    const DEADLINE = Date.now() + 15000;
    const iter = {val:0};
    try {
      while (bound <= MAX) {
        if (Date.now() > DEADLINE) return null;
        const visited = new Map();
        const nxt = {val:Infinity};
        const r = await idaSearch(board, size, 0, bound, [], visited, nxt, iter, DEADLINE, locked || null);
        if (r) return r;
        if (nxt.val===Infinity) return null;
        bound = Math.max(bound+1, nxt.val);
        await new Promise(r=>setTimeout(r,0));
      }
    } catch(e) { if(e.message==='timeout') return null; throw e; }
    return null;
  }

  // ---- Main solve ----
  async function solve(board, size) {
    // 3×3 and 4×4: IDA* directly
    if (size <= 4) {
      return await solveIDA(board, size);
    }

    // 5×5: reduce-and-conquer
    let curBoard = board.slice();
    const allMoves = [];
    const locked = new Set();
    const DEADLINE = Date.now() + 120000;

    // Place ALL top row tiles 1..5
    for (let c = 0; c < size; c++) {
      if (Date.now() > DEADLINE) return null;
      const value = c + 1;
      const path = await placeTile(curBoard, size, value, 0, c, locked, DEADLINE);
      if (!path) return null;
      for (const step of path) {
        const z = curBoard.indexOf(0), ti = curBoard.indexOf(step.tile);
        [curBoard[z], curBoard[ti]] = [curBoard[ti], curBoard[z]];
        allMoves.push(step);
      }
      locked.add(c);
    }

    // Place ALL left column tiles (size+1), (2*size+1), ...
    for (let r = 1; r < size; r++) {
      if (Date.now() > DEADLINE) return null;
      const value = r * size + 1;
      const path = await placeTile(curBoard, size, value, r, 0, locked, DEADLINE);
      if (!path) return null;
      for (const step of path) {
        const z = curBoard.indexOf(0), ti = curBoard.indexOf(step.tile);
        [curBoard[z], curBoard[ti]] = [curBoard[ti], curBoard[z]];
        allMoves.push(step);
      }
      locked.add(r * size);
    }

    // Remaining 4×4 sub-puzzle: solve with IDA*
    const subSize = size - 1;
    const subBoard = [];
    for (let r = 1; r < size; r++)
      for (let c = 1; c < size; c++)
        subBoard.push(curBoard[r*size + c]);

    // Remap sub-board values: original value → 1..subSize²
    const valMap = {0: 0};
    for (let r = 1; r < size; r++)
      for (let c = 1; c < size; c++) {
        const ov = r * size + c + 1;
        const si = (r-1) * subSize + (c-1);
        valMap[ov] = si + 1;
      }

    const mapped = subBoard.map(v => (valMap[v] !== undefined ? valMap[v] : 0));
    const subMoves = await solveIDA(mapped, subSize);
    if (!subMoves) return null;

    // Map back
    const vToOv = {};
    for (const [ov, sv] of Object.entries(valMap)) vToOv[sv] = parseInt(ov);
    for (const sm of subMoves) {
      const origTile = vToOv[sm.tile];
      if (origTile === undefined) return null;
      allMoves.push({ tile: origTile });
    }

    return allMoves;
  }

  return { solve };
})();
