'use strict';

// Sliding puzzle solver: IDA* for all sizes.
// Uses iterative deepening A* with periodic yielding.

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

  function getNeighbors(board, size) {
    const z = board.indexOf(0), r = Math.floor(z/size), c = z%size;
    const n = []; const dirs=[[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dr,dc] of dirs) {
      const nr=r+dr, nc=c+dc; if (nr<0||nr>=size||nc<0||nc>=size) continue;
      const ni=nr*size+nc;
      const nb=board.slice();
      [nb[z],nb[ni]]=[nb[ni],nb[z]]; n.push({board:nb,tile:board[ni]});
    }
    return n;
  }

  async function idaSearch(board, size, g, bound, path, visited, iter, deadline, prog) {
    iter.val++;
    if (iter.val % 1000 === 0) {
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
    let nextBound = Infinity;
    const neighbors = getNeighbors(board, size);
    neighbors.sort((a,b) => heuristic(a.board,size) - heuristic(b.board,size));
    for (const nb of neighbors) {
      const r = await idaSearch(nb.board, size, g+1, bound,
        [...path,{tile:nb.tile}], visited, iter, deadline, prog);
      if (r.path) return r;
      if (r.nextBound < nextBound) nextBound = r.nextBound;
    }
    return { nextBound, path: null };
  }

  // Simple binary heap for priority queue
  class Heap {
    constructor() { this.d = []; }
    push(item) {
      this.d.push(item); let i = this.d.length-1;
      while (i>0) { const p=(i-1)>>1; if (this.d[p].h <= this.d[i].h) break; [this.d[p],this.d[i]]=[this.d[i],this.d[p]]; i=p; }
    }
    pop() {
      if (this.d.length<=1) return this.d.pop()||null; const t=this.d[0]; this.d[0]=this.d.pop();
      let i=0; while(1){ let s=i,l=i*2+1,r=i*2+2; if(l<this.d.length&&this.d[l].h<this.d[s].h)s=l; if(r<this.d.length&&this.d[r].h<this.d[s].h)s=r; if(s===i)break; [this.d[i],this.d[s]]=[this.d[s],this.d[i]]; i=s; } return t;
    }
    get size() { return this.d.length; }
  }

  // Greedy best-first: always expand node with lowest heuristic.
  // Finds ANY solution quickly (not optimal). Good for 5×5.
  async function greedySolve(board, size, prog, deadline) {
    const startKey = boardToKey(board);
    const goal = Array.from({length:size*size}, (_,i) => i<size*size-1?i+1:0);
    const goalKey = boardToKey(goal);
    if (startKey === goalKey) return [];

    const heap = new Heap();
    const startH = heuristic(board, size);
    heap.push({ board, h: startH, path: [] });
    const visited = new Set([startKey]);
    let iter = 0;
    const MAX_NODES = 2000000;

    if (prog) { prog.maxBound = MAX_NODES; prog.iter = 0; prog.bound = startH; }

    while (heap.size > 0 && iter < MAX_NODES) {
      iter++;
      if (iter % 5000 === 0) {
        if (Date.now() > deadline) return null;
        if (prog) { prog.iter = iter; prog.bound = 0; }
        await new Promise(r => setTimeout(r, 0));
      }

      const cur = heap.pop();
      if (!cur) return null;
      if (boardToKey(cur.board) === goalKey) return cur.path;

      const neighbors = getNeighbors(cur.board, size);
      for (const nb of neighbors) {
        const key = boardToKey(nb.board);
        if (visited.has(key)) continue;
        visited.add(key);
        const h = heuristic(nb.board, size);
        heap.push({ board: nb.board, h, path: [...cur.path, { tile: nb.tile }] });
      }
    }
    return null;
  }

  async function solve(board, size, prog) {
    let done = true;
    for (let i = 0; i < size*size; i++) {
      if (board[i] !== (i < size*size-1 ? i+1 : 0)) { done = false; break; }
    }
    if (done) return [];

    // 5×5: use greedy search (IDA* too slow for 25-puzzle)
    if (size >= 5) {
      const DEADLINE = Date.now() + 300000;
      if (prog) { prog.maxBound = 2000000; prog.bound = 0; prog.iter = 0; }
      return await greedySolve(board, size, prog, DEADLINE);
    }

    // 3×3 and 4×4: IDA* (fast)
    let bound = heuristic(board, size);
    const MAX_BOUND = size <= 3 ? 40 : 80;
    const DEADLINE = Date.now() + 15000;
    const iter = {val:0};
    if (prog) { prog.maxBound = MAX_BOUND; prog.bound = bound; prog.iter = 0; }
    try {
      while (bound <= MAX_BOUND) {
        if (Date.now() > DEADLINE) return null;
        if (prog) { prog.bound = bound; }
        const visited = new Map();
        const r = await idaSearch(board, size, 0, bound, [], visited, iter, DEADLINE, prog);
        if (r.path) return r.path;
        if (r.nextBound === Infinity) return null;
        bound = Math.max(bound + 1, r.nextBound);
        await new Promise(r2 => setTimeout(r2, 0));
      }
    } catch(e) { if(e.message==='timeout') return null; throw e; }
    return null;
  }

  return { solve };
})();
