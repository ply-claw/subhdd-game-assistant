'use strict';

// Sliding puzzle solver.
// ≤4×4: IDA* (optimal).
// 5×5: A* place each tile of first row + first column, then IDA* on 4×4 remainder.

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
      if (locked && locked.has(ni)) continue;
      const nb=board.slice();
      [nb[z],nb[ni]]=[nb[ni],nb[z]]; n.push({board:nb,tile:board[ni]});
    }
    return n;
  }

  // ---- Heap ----
  class Heap {
    constructor() { this.d = []; }
    push(v) { this.d.push(v); let i=this.d.length-1; while(i>0){const p=(i-1)>>1; if(this.d[p].f<=this.d[i].f)break;[this.d[p],this.d[i]]=[this.d[i],this.d[p]];i=p;} }
    pop() { if(this.d.length<=1)return this.d.pop()||null; const t=this.d[0]; this.d[0]=this.d.pop(); let i=0; while(1){let s=i,l=i*2+1,r=i*2+2; if(l<this.d.length&&this.d[l].f<this.d[s].f)s=l; if(r<this.d.length&&this.d[r].f<this.d[s].f)s=r; if(s===i)break;[this.d[i],this.d[s]]=[this.d[s],this.d[i]];i=s;} return t; }
    get size() { return this.d.length; }
  }

  // ---- A* for single tile placement ----
  // Goal: tile 'value' at (tr, tc), all locked cells unchanged from 'original'.
  async function aStarPlaceTile(board, size, value, tr, tc, locked, original, deadline) {
    const goalIdx = tr*size+tc;
    if (board[goalIdx] === value) return [];

    const startKey = boardToKey(board);
    // Heuristic: just the target tile's manhattan distance
    function h(b) {
      const idx = b.indexOf(value);
      if (idx < 0) return 999;
      return Math.abs(Math.floor(idx/size)-tr) + Math.abs((idx%size)-tc);
    }

    const heap = new Heap();
    heap.push({ board, g: 0, f: h(board), path: [] });
    const bestG = new Map([[startKey, 0]]);
    const MAX = 200000;
    let iter = 0;

    while (heap.size > 0 && iter < MAX) {
      iter++;
      if (iter % 3000 === 0) {
        if (Date.now() > deadline) return null;
        await new Promise(r => setTimeout(r, 0));
      }

      const cur = heap.pop();
      if (!cur) return null;

      // Check goal: tile at target AND locked cells intact
      if (cur.board[goalIdx] === value) {
        let ok = true;
        for (const idx of locked) {
          if (cur.board[idx] !== original[idx]) { ok = false; break; }
        }
        if (ok) return cur.path;
      }

      const neighbors = getNeighbors(cur.board, size, locked);
      for (const nb of neighbors) {
        const newG = cur.g + 1;
        const key = boardToKey(nb.board);
        if (bestG.has(key) && bestG.get(key) <= newG) continue;
        bestG.set(key, newG);
        heap.push({ board: nb.board, g: newG, f: newG + h(nb.board), path: [...cur.path, { tile: nb.tile }] });
      }
    }
    return null;
  }

  // ---- IDA* for ≤4×4 ----
  async function idaSearch(board, size, g, bound, path, visited, iter, deadline, prog) {
    iter.val++;
    if (iter.val % 2000 === 0) {
      if (Date.now() > deadline) throw new Error('timeout');
      if (prog) { prog.iter = iter.val; prog.bound = bound; }
      await new Promise(r => setTimeout(r, 0));
    }
    const f = g + heuristic(board, size);
    if (f > bound) return { nextBound: f, path: null };
    let done = true;
    for (let i = 0; i < size*size; i++) {
      if (board[i] !== (i < size*size-1 ? i+1 : 0)) { done = false; break; }
    }
    if (done) return { path };
    const key = boardToKey(board);
    if (visited.has(key) && visited.get(key) <= g) return { nextBound: Infinity, path: null };
    visited.set(key, g);
    let nb = Infinity;
    const ns = getNeighbors(board, size, null);
    ns.sort((a,b) => heuristic(a.board,size) - heuristic(b.board,size));
    for (const n of ns) {
      const r = await idaSearch(n.board, size, g+1, bound,
        [...path,{tile:n.tile}], visited, iter, deadline, prog);
      if (r.path) return r;
      if (r.nextBound < nb) nb = r.nextBound;
    }
    return { nextBound: nb, path: null };
  }

  async function solveIDA(board, size, prog) {
    let done = true;
    for (let i = 0; i < size*size; i++) {
      if (board[i] !== (i < size*size-1 ? i+1 : 0)) { done = false; break; }
    }
    if (done) return [];
    let bound = heuristic(board, size);
    const MAX = 80;
    const DL = Date.now() + 15000;
    const iter = {val:0};
    if (prog) { prog.maxBound = MAX; prog.bound = bound; prog.iter = 0; }
    try {
      while (bound <= MAX) {
        if (Date.now() > DL) return null;
        if (prog) prog.bound = bound;
        const v = new Map();
        const r = await idaSearch(board, size, 0, bound, [], v, iter, DL, prog);
        if (r.path) return r.path;
        if (r.nextBound === Infinity) return null;
        bound = Math.max(bound+1, r.nextBound);
        await new Promise(r2 => setTimeout(r2,0));
      }
    } catch(e) { if(e.message==='timeout') return null; throw e; }
    return null;
  }

  // ---- Main solve ----
  // Greedy best-first for 5×5 (finds any solution, not optimal)
  async function greedySolve(board, size, prog, deadline) {
    const goal = Array.from({length:size*size}, (_,i) => i<size*size-1?i+1:0);
    const goalKey = boardToKey(goal);
    if (boardToKey(board) === goalKey) return [];

    const heap = new Heap();
    heap.push({ board, h: heuristic(board, size), path: [] });
    const visited = new Set([boardToKey(board)]);
    let iter = 0;
    const MAX = 5000000; // 5M nodes max

    if (prog) { prog.maxBound = MAX; prog.iter = 0; }

    while (heap.size > 0 && iter < MAX) {
      iter++;
      if (iter % 5000 === 0) {
        if (Date.now() > deadline) return null;
        if (prog) prog.iter = iter;
        await new Promise(r => setTimeout(r, 0));
      }

      const cur = heap.pop();
      if (!cur) return null;
      if (boardToKey(cur.board) === goalKey) return cur.path;

      const neighbors = getNeighbors(cur.board, size, null);
      for (const nb of neighbors) {
        const key = boardToKey(nb.board);
        if (visited.has(key)) continue;
        visited.add(key);
        heap.push({ board: nb.board, h: heuristic(nb.board, size), path: [...cur.path, { tile: nb.tile }] });
      }
    }
    return null;
  }

  async function solve(board, size, prog) {
    if (size <= 4) return await solveIDA(board, size, prog);

    // 5×5: greedy best-first (IDA* too slow for 25-puzzle)
    const DL = Date.now() + 300000;
    if (prog) { prog.maxBound = 5000000; prog.bound = 0; prog.iter = 0; }
    return await greedySolve(board, size, prog, DL);
  }

  return { solve };
})();
