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

  async function solve(board, size, prog) {
    let done = true;
    for (let i = 0; i < size*size; i++) {
      if (board[i] !== (i < size*size-1 ? i+1 : 0)) { done = false; break; }
    }
    if (done) return [];

    let bound = heuristic(board, size);
    const MAX_BOUND = size <= 3 ? 40 : size === 4 ? 80 : 200;
    const DEADLINE = size <= 4 ? Date.now() + 15000 : Date.now() + 300000;
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
