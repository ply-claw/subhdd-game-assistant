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
  // Phased search: find state where specific tiles are at correct positions.
  // goalIndices: Set of indices that must have correct values.
  // locked: Set of indices that must NOT change from 'original'.
  // weighted A* (w=2) for speed over optimality.
  async function phasedSearch(board, size, goalSet, locked, original, deadline, prog, label) {
    // Heuristic: sum of Manhattan distances for tiles in goalSet
    function h(b) {
      let d = 0;
      for (const idx of goalSet) {
        const v = idx + 1; // correct value at this index
        const pos = b.indexOf(v);
        if (pos < 0) d += 999;
        else d += Math.abs(Math.floor(pos/size) - Math.floor(idx/size)) + Math.abs((pos%size) - (idx%size));
      }
      // Penalize disturbed locked cells
      for (const idx of locked) {
        if (b[idx] !== original[idx]) d += 1000;
      }
      return d;
    }

    function goalCheck(b) {
      for (const idx of goalSet) if (b[idx] !== idx + 1) return false;
      for (const idx of locked) if (b[idx] !== original[idx]) return false;
      return true;
    }

    if (goalCheck(board)) return [];
    const startKey = boardToKey(board);
    const heap = new Heap();
    heap.push({ board, g: 0, f: h(board) * 2, path: [] }); // w=2 weighted A*
    const bestG = new Map([[startKey, 0]]);
    let iter = 0;
    const MAX = 2000000;

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
      if (goalCheck(cur.board)) return cur.path;

      const ns = getNeighbors(cur.board, size, locked);
      for (const nb of ns) {
        const newG = cur.g + 1;
        const key = boardToKey(nb.board);
        if (bestG.has(key) && bestG.get(key) <= newG) continue;
        bestG.set(key, newG);
        heap.push({ board: nb.board, g: newG, f: newG + h(nb.board) * 2, path: [...cur.path, { tile: nb.tile }] });
      }
    }
    return null;
  }

  async function solve(board, size, prog) {
    if (size <= 4) return await solveIDA(board, size, prog);

    // 5×5: 3-phase search
    const DL = Date.now() + 300000;
    let cur = board.slice();
    const allMoves = [];
    if (prog) { prog.maxBound = 3; prog.bound = 0; }

    // Phase 1: Solve first row (tiles 1..5 at positions 0..4)
    const rowGoal = new Set([0, 1, 2, 3, 4]);
    const noLock = new Set();
    if (prog) prog.bound = 1;
    let moves = await phasedSearch(cur, size, rowGoal, noLock, cur, DL, prog, 'row');
    if (!moves) return null;
    for (const m of moves) { const z=cur.indexOf(0),ti=cur.indexOf(m.tile); [cur[z],cur[ti]]=[cur[ti],cur[z]]; }
    allMoves.push(...moves);

    // Phase 2: Lock row 0, solve first column (tiles at positions 5,10,15,20)
    const colGoal = new Set([5, 10, 15, 20]);
    const rowLock = new Set([0, 1, 2, 3, 4]);
    const original2 = cur.slice();
    if (prog) prog.bound = 2;
    moves = await phasedSearch(cur, size, colGoal, rowLock, original2, DL, prog, 'col');
    if (!moves) return null;
    for (const m of moves) { const z=cur.indexOf(0),ti=cur.indexOf(m.tile); [cur[z],cur[ti]]=[cur[ti],cur[z]]; }
    allMoves.push(...moves);

    // Phase 3: Lock row 0 + col 0, extract 4×4 and IDA*
    const subSize = size - 1;
    const subBoard = [];
    for (let r = 1; r < size; r++)
      for (let c = 1; c < size; c++)
        subBoard.push(cur[r*size + c]);

    const valMap = {0: 0};
    for (let r = 1; r < size; r++)
      for (let c = 1; c < size; c++)
        valMap[r*size+c+1] = (r-1)*subSize + (c-1) + 1;

    const mapped = subBoard.map(v => valMap[v] !== undefined ? valMap[v] : 0);
    if (prog) prog.bound = 3;
    const subMoves = await solveIDA(mapped, subSize);
    if (!subMoves) return null;

    const vToOv = {};
    for (const [ov, sv] of Object.entries(valMap)) vToOv[sv] = parseInt(ov);
    for (const sm of subMoves) {
      const ot = vToOv[sm.tile];
      if (ot === undefined) return null;
      allMoves.push({ tile: ot });
    }

    return allMoves;
  }

  return { solve };
})();
