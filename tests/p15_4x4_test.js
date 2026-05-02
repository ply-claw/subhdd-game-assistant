'use strict';

// Test IDA* on the specific 4x4 board from the Phase 4 log

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

async function idaSearch(board, size, g, bound, path, visited, iter, deadline) {
  iter.val++;
  if (iter.val % 50000 === 0) {
    if (Date.now() > deadline) throw new Error('timeout');
    const elapsed = ((Date.now() - iter.startTime) / 1000).toFixed(1);
    process.stdout.write(`\r  depth=${g} bound=${bound} iter=${(iter.val/1000).toFixed(0)}k nodes=${visited.size} elapsed=${elapsed}s`);
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
  const ns = getNeighbors(board, size);
  ns.sort((a,b) => heuristic(a.board,size) - heuristic(b.board,size));
  for (const n of ns) {
    const r = await idaSearch(n.board, size, g+1, bound,
      [...path,{tile:n.tile}], visited, iter, deadline);
    if (r.path) return r;
    if (r.nextBound < nb) nb = r.nextBound;
  }
  return { nextBound: nb, path: null };
}

async function solve(board) {
  const size = 4;
  let done = true;
  for (let i = 0; i < size*size; i++) {
    if (board[i] !== (i < size*size-1 ? i+1 : 0)) { done = false; break; }
  }
  if (done) return [];

  let bound = heuristic(board, size);
  const DEADLINE = Date.now() + 600000; // 10 min
  const iter = {val:0, startTime: Date.now()};
  console.log(`Start: board=${board}  heuristic=${bound}  size=${size}\n`);

  try {
    while (bound <= 80) {
      const t0 = Date.now();
      console.log(`\n--- bound=${bound} ---`);
      const visited = new Map();
      const r = await idaSearch(board, size, 0, bound, [], visited, iter, DEADLINE);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      if (r.path) {
        console.log(`\n\nSOLVED! ${r.path.length} moves in ${((Date.now()-iter.startTime)/1000).toFixed(1)}s`);
        return r.path;
      }
      console.log(`  bound=${bound} no solution, nextBound=${r.nextBound} visited=${visited.size} time=${elapsed}s`);
      if (r.nextBound === Infinity) { console.log('UNSOLVABLE'); return null; }
      bound = Math.max(bound+1, r.nextBound);
      await new Promise(r2 => setTimeout(r2, 0));
    }
  } catch(e) {
    if (e.message === 'timeout') console.log(`\nTIMEOUT after ${((Date.now()-iter.startTime)/1000).toFixed(1)}s`);
    else console.error(e);
    return null;
  }
  return null;
}

const board = [13,4,10,15,3,2,9,5,1,11,6,12,0,14,7,8];
solve(board);
