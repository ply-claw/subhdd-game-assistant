'use strict';

// Sliding puzzle solver: IDA* with recursive reduction on timeout.

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

  class Heap {
    constructor() { this.d = []; }
    push(v) { this.d.push(v); let i=this.d.length-1; while(i>0){const p=(i-1)>>1; if(this.d[p].f<=this.d[i].f)break;[this.d[p],this.d[i]]=[this.d[i],this.d[p]];i=p;} }
    pop() { if(this.d.length<=1)return this.d.pop()||null; const t=this.d[0]; this.d[0]=this.d.pop(); let i=0; while(1){let s=i,l=i*2+1,r=i*2+2; if(l<this.d.length&&this.d[l].f<this.d[s].f)s=l; if(r<this.d.length&&this.d[r].f<this.d[s].f)s=r; if(s===i)break;[this.d[i],this.d[s]]=[this.d[s],this.d[i]];i=s;} return t; }
    get size() { return this.d.length; }
  }

  // ---- IDA* ----
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

  // ---- Phased search (weighted A*) ----
  async function phasedSearch(board, size, goalSet, locked, original, deadline, prog) {
    function h(b) {
      let d = 0;
      for (const idx of goalSet) {
        const v = idx + 1;
        const pos = b.indexOf(v);
        if (pos < 0) d += 999;
        else d += Math.abs(Math.floor(pos/size)-Math.floor(idx/size)) + Math.abs((pos%size)-(idx%size));
      }
      for (const idx of locked) { if (b[idx] !== original[idx]) d += 1000; }
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
    heap.push({ board, g:0, f: h(board)*2, path: [] });
    const bestG = new Map([[startKey,0]]);
    let iter = 0;
    const MAX = 4000000;
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
        heap.push({ board: nb.board, g: newG, f: newG + h(nb.board)*2, path: [...cur.path, {tile:nb.tile}] });
      }
    }
    return null;
  }

  // ---- Unified solver with recursive fallback ----
  async function solveWithFallback(board, size, prog, deadlineMs) {
    let done = true;
    for (let i = 0; i < size*size; i++) {
      if (board[i] !== (i < size*size-1 ? i+1 : 0)) { done = false; break; }
    }
    if (done) return [];

    // Try IDA* first
    const result = await solveIDA(board, size, prog);
    if (result) return result;

    // If size ≤ 3, give up (shouldn't timeout for 3x3)
    if (size <= 3) return null;

    // IDA* timed out — recursive reduction: row → col → sub-puzzle
    // console.log('[p15] size', size, 'IDA* timed out, reducing');
    const DL = Date.now() + (deadlineMs || 600000);
    const allMoves = [];
    let cur = board.slice();
    const subSize = size - 1;

    // Phase a: row 0, first 2 tiles
    let ms = await phasedSearch(cur, size, new Set([0,1]), new Set(), cur, DL, null);
    if (!ms) return null;
    for (const m of ms) { const z=cur.indexOf(0),ti=cur.indexOf(m.tile); [cur[z],cur[ti]]=[cur[ti],cur[z]]; }
    allMoves.push(...ms);
    // console.log('[p15] FB row(1-2) done. Board:', cur.join(','));

    // Phase b: row 0, remaining tiles
    const rowTail = new Set();
    for (let c = 2; c < size; c++) rowTail.add(c);
    const lockB = new Set([0,1]);
    const origB = cur.slice();
    ms = await phasedSearch(cur, size, rowTail, lockB, origB, DL, null);
    if (!ms) return null;
    for (const m of ms) { const z=cur.indexOf(0),ti=cur.indexOf(m.tile); [cur[z],cur[ti]]=[cur[ti],cur[z]]; }
    allMoves.push(...ms);
    // console.log('[p15] FB row(rest) done. Board:', cur.join(','));

    // Phase c: col 0 (skip row 0)
    const colGoal = new Set();
    for (let r = 1; r < size; r++) colGoal.add(r * size);
    const lockC = new Set();
    for (let c = 0; c < size; c++) lockC.add(c);
    const origC = cur.slice();
    ms = await phasedSearch(cur, size, colGoal, lockC, origC, DL, null);
    if (!ms) return null;
    for (const m of ms) { const z=cur.indexOf(0),ti=cur.indexOf(m.tile); [cur[z],cur[ti]]=[cur[ti],cur[z]]; }
    allMoves.push(...ms);
    // console.log('[p15] FB col done. Board:', cur.join(','));

    // Phase d: extract (size-1)×(size-1) sub-puzzle and recurse
    const subBoard = [];
    for (let r = 1; r < size; r++)
      for (let c = 1; c < size; c++)
        subBoard.push(cur[r*size + c]);

    const valMap = {0: 0};
    for (let r = 1; r < size; r++)
      for (let c = 1; c < size; c++)
        valMap[r*size+c+1] = (r-1)*subSize + (c-1) + 1;

    const mapped = subBoard.map(v => valMap[v] !== undefined ? valMap[v] : 0);
    const subMoves = await solveWithFallback(mapped, subSize, null, 15000);
    if (!subMoves) return null;

    // Map sub-moves back to original values
    const rev = {};
    for (const [ov, sv] of Object.entries(valMap)) rev[sv] = parseInt(ov);
    for (const sm of subMoves) {
      const ot = rev[sm.tile];
      if (ot === undefined) return null;
      allMoves.push({ tile: ot });
    }
    return allMoves;
  }

  // ---- Main solve ----
  async function solve(board, size, prog) {
    if (size <= 4) return await solveWithFallback(board, size, prog, 15000);

    // 5×5: row+col reduction then solveWithFallback on 4×4
    const DL = Date.now() + 600000;
    let cur = board.slice();
    const allMoves = [];
    if (prog) { prog.maxBound = 4; prog.bound = 0; }

    // Phase 1: row 1-2
    const goal1 = new Set([0, 1]);
    if (prog) prog.bound = 1;
    let moves = await phasedSearch(cur, size, goal1, new Set(), cur, DL, prog);
    if (!moves) return null;
    for (const m of moves) { const z=cur.indexOf(0),ti=cur.indexOf(m.tile); [cur[z],cur[ti]]=[cur[ti],cur[z]]; }
    allMoves.push(...moves);
    // console.log('[p15] Phase 1 done. Board:', cur.join(','));

    // Phase 2: row 3-5 (lock 0,1)
    const goal2 = new Set([2, 3, 4]);
    const lock2 = new Set([0, 1]);
    const orig2 = cur.slice();
    if (prog) prog.bound = 2;
    moves = await phasedSearch(cur, size, goal2, lock2, orig2, DL, prog);
    if (!moves) return null;
    for (const m of moves) { const z=cur.indexOf(0),ti=cur.indexOf(m.tile); [cur[z],cur[ti]]=[cur[ti],cur[z]]; }
    allMoves.push(...moves);
    // console.log('[p15] Phase 2 done. Board:', cur.join(','));

    // Phase 3: col (lock row 0)
    const goal3 = new Set([5, 10, 15, 20]);
    const lock3 = new Set([0, 1, 2, 3, 4]);
    const orig3 = cur.slice();
    if (prog) prog.bound = 3;
    moves = await phasedSearch(cur, size, goal3, lock3, orig3, DL, prog);
    if (!moves) return null;
    for (const m of moves) { const z=cur.indexOf(0),ti=cur.indexOf(m.tile); [cur[z],cur[ti]]=[cur[ti],cur[z]]; }
    allMoves.push(...moves);
    // console.log('[p15] Phase 3 done. Board:', cur.join(','));

    // Phase 4: extract 4×4 and solveWithFallback
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
    if (prog) prog.bound = 4;
    const subMoves = await solveWithFallback(mapped, subSize, prog, 15000);
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
